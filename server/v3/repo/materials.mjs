// 素材：文章・公告・画像・音声。複数の題組で共用でき、直接修正する（版は持たない）。
import { pickTexts, preferredLanguage, SUPPORTED_LANGUAGES } from '../i18n.mjs';
import { ConflictError, InputError, NotFoundError, nextCode, nowIso, oneOf, setText, text, list, number } from './common.mjs';
import { ownedMedia } from './media.mjs';

const KINDS = ['passage', 'notice', 'image', 'audio'];
const TRANSLATED = { title: 'title', bodyTranslation: 'body_translation', summary: 'summary', structure: 'structure', transcriptTranslation: 'transcript_translation' };

/** 翻訳の値：文字列なら language で、{ text, language } ならその言語で書く。 */
export function writeText(db, table, rid, field, value, language) {
  if (value === undefined) return;
  if (value && typeof value === 'object') {
    if (!value.text) return;
    setText(db, table, rid, field, SUPPORTED_LANGUAGES.includes(value.language) ? value.language : language, value.text);
    return;
  }
  setText(db, table, rid, field, language, value == null ? null : String(value));
}

export function materialRid(db, userId, code) {
  const row = db.prepare('SELECT rid FROM materials WHERE user_id = ? AND code = ?').get(userId, String(code ?? '').toUpperCase());
  if (!row) throw new NotFoundError(`找不到素材：${code}`);
  return row.rid;
}

/** 校驗用：素材番号 → { kind, body, transcript }（自分のものだけ、一つの JSON 引数で取る）。 */
export function materialTexts(db, userId, codes) {
  const wanted = [...new Set(codes.filter(Boolean).map((c) => String(c).toUpperCase()))];
  if (!wanted.length) return {};
  return Object.fromEntries(db.prepare('SELECT code, kind, body, transcript FROM materials WHERE user_id = ? AND code IN (SELECT value FROM json_each(?))')
    .all(userId, JSON.stringify(wanted)).map((r) => [r.code, { kind: r.kind, body: r.body, transcript: r.transcript }]));
}

function normalize(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object') throw new InputError('素材应为对象');
  const out = {};
  if (!partial || 'kind' in input) out.kind = oneOf(input.kind, KINDS, 'kind');
  for (const key of ['body', 'transcript']) if (key in input) out[key] = text(input[key], key, { max: 60000 });
  if ('mediaId' in input) out.mediaId = input.mediaId == null ? null : Number(input.mediaId);
  for (const key of ['clipStartMs', 'clipEndMs']) if (key in input) out[key] = number(input[key], key, { min: 0, integer: true });
  if ('sentences' in input) out.sentences = list(input.sentences, 'sentences', { max: 400 }).map((s, i) => ({
    sentence: text(s?.sentence, `sentences[${i}].sentence`, { optional: false, max: 2000 }), isKey: s?.isKey === true, translation: s?.translation,
  }));
  for (const key of Object.keys(TRANSLATED)) if (key in input) out[key] = input[key];
  return out;
}

function checkShape(m) {
  if (['passage', 'notice'].includes(m.kind) && !m.body) throw new InputError('文章、公告需要正文 body');
  if (['image', 'audio'].includes(m.kind) && !m.mediaId) throw new InputError('图片、音频素材需要文件 mediaId（先上传）');
  if (m.clipStartMs != null && m.clipEndMs != null && m.clipEndMs <= m.clipStartMs) throw new InputError('音频片段的终点应在起点之后');
}

function writeSentences(db, rid, sentences, language) {
  const existing = db.prepare('SELECT rid FROM material_sentences WHERE material_rid = ? ORDER BY position').all(rid).map((r) => r.rid);
  db.prepare('UPDATE material_sentences SET position = position + 100000 WHERE material_rid = ?').run(rid);
  sentences.forEach((s, position) => {
    let sentenceRid = existing[position];
    if (sentenceRid) db.prepare('UPDATE material_sentences SET position = ?, sentence = ?, is_key = ? WHERE rid = ?').run(position, s.sentence, s.isKey ? 1 : 0, sentenceRid);
    else sentenceRid = Number(db.prepare('INSERT INTO material_sentences (material_rid, position, sentence, is_key) VALUES (?, ?, ?, ?)').run(rid, position, s.sentence, s.isKey ? 1 : 0).lastInsertRowid);
    writeText(db, 'material_sentences', sentenceRid, 'translation', s.translation, language);
  });
  for (const extra of existing.slice(sentences.length)) db.prepare('DELETE FROM material_sentences WHERE rid = ?').run(extra);
}

/** 新しい素材を作り rid と code を返す（題組の中で定義されたものもここを通る）。 */
export function insertMaterial(db, userId, input, language) {
  const m = normalize(input);
  checkShape(m);
  if (m.mediaId) m.mediaId = ownedMedia(db, userId, m.mediaId, m.kind === 'audio' ? 'audio' : 'image');
  const { code } = nextCode(db, userId, 'MT');
  const now = nowIso();
  const rid = Number(db.prepare(`INSERT INTO materials (user_id, code, kind, body, media_rid, clip_start_ms, clip_end_ms, transcript, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(userId, code, m.kind, m.body ?? null, m.mediaId ?? null, m.clipStartMs ?? null, m.clipEndMs ?? null, m.transcript ?? null, now, now).lastInsertRowid);
  for (const [key, field] of Object.entries(TRANSLATED)) writeText(db, 'materials', rid, field, m[key], language);
  if (m.sentences) writeSentences(db, rid, m.sentences, language);
  return { rid, code };
}

export function createMaterial(db, userId, input) {
  const language = SUPPORTED_LANGUAGES.includes(input?.language) ? input.language : preferredLanguage(db, userId);
  const { code } = insertMaterial(db, userId, input, language);
  return getMaterial(db, userId, code, { language });
}

/** 部分更新。使っている題組はそのまま新しい内容を表示する。 */
export function updateMaterial(db, userId, code, input) {
  const rid = materialRid(db, userId, code);
  const language = SUPPORTED_LANGUAGES.includes(input?.language) ? input.language : preferredLanguage(db, userId);
  const current = db.prepare('SELECT * FROM materials WHERE rid = ?').get(rid);
  const m = normalize(input, { partial: true });
  if (m.kind && m.kind !== current.kind) throw new InputError('素材的类别（kind）不能修改；请新建素材');
  const next = { kind: current.kind, body: 'body' in m ? m.body : current.body, mediaId: 'mediaId' in m ? m.mediaId : current.media_rid,
    clipStartMs: 'clipStartMs' in m ? m.clipStartMs : current.clip_start_ms, clipEndMs: 'clipEndMs' in m ? m.clipEndMs : current.clip_end_ms,
    transcript: 'transcript' in m ? m.transcript : current.transcript };
  checkShape(next);
  if ('mediaId' in m && next.mediaId) next.mediaId = ownedMedia(db, userId, next.mediaId, next.kind === 'audio' ? 'audio' : 'image');
  db.prepare('UPDATE materials SET body = ?, media_rid = ?, clip_start_ms = ?, clip_end_ms = ?, transcript = ?, updated_at = ? WHERE rid = ?')
    .run(next.body, next.mediaId, next.clipStartMs, next.clipEndMs, next.transcript, nowIso(), rid);
  for (const [key, field] of Object.entries(TRANSLATED)) writeText(db, 'materials', rid, field, m[key], language);
  if (m.sentences) writeSentences(db, rid, m.sentences, language);
  return getMaterial(db, userId, code, { language });
}

export function deleteMaterial(db, userId, code) {
  const rid = materialRid(db, userId, code);
  const used = db.prepare('SELECT g.code FROM question_group_materials m JOIN question_groups g ON g.rid = m.group_rid WHERE m.material_rid = ?').all(rid).map((r) => r.code);
  if (used.length) throw new ConflictError(`素材正被题组使用：${used.join('、')}；请先修改或删除这些题组`);
  db.prepare('DELETE FROM materials WHERE rid = ?').run(rid);
  return { deleted: String(code).toUpperCase() };
}

/** 素材の表示用の形（題組の詳細でも使う）。rows は materials の行。 */
export function shapeMaterials(db, rows, language) {
  if (!rows.length) return [];
  const sentences = db.prepare('SELECT rid, material_rid, position, sentence, is_key FROM material_sentences WHERE material_rid IN (SELECT value FROM json_each(?)) ORDER BY material_rid, position')
    .all(JSON.stringify(rows.map((r) => r.rid)));
  const texts = pickTexts(db, [...rows.map((r) => ['materials', r.rid]), ...sentences.map((s) => ['material_sentences', s.rid])], language);
  return rows.map((r) => {
    const own = texts.get(`materials:${r.rid}`) ?? {};
    return {
      material: r.code, kind: r.kind, body: r.body, transcript: r.transcript, mediaId: r.media_rid, mediaUrl: r.media_rid ? `/api/v3/media/${r.media_rid}` : null,
      clipStartMs: r.clip_start_ms, clipEndMs: r.clip_end_ms,
      title: own.title ?? null, bodyTranslation: own.body_translation ?? null, summary: own.summary ?? null, structure: own.structure ?? null,
      transcriptTranslation: own.transcript_translation ?? null,
      sentences: sentences.filter((s) => s.material_rid === r.rid).map((s) => ({ sentence: s.sentence, isKey: s.is_key === 1, translation: texts.get(`material_sentences:${s.rid}`)?.translation ?? null })),
      createdAt: r.created_at, updatedAt: r.updated_at,
    };
  });
}

export function getMaterial(db, userId, code, { language } = {}) {
  const rid = materialRid(db, userId, code);
  const lang = SUPPORTED_LANGUAGES.includes(language) ? language : preferredLanguage(db, userId);
  const [material] = shapeMaterials(db, [db.prepare('SELECT * FROM materials WHERE rid = ?').get(rid)], lang);
  material.usedBy = db.prepare('SELECT g.code, g.type_id, m.role FROM question_group_materials m JOIN question_groups g ON g.rid = m.group_rid WHERE m.material_rid = ? ORDER BY g.rid')
    .all(rid).map((r) => ({ group: r.code, typeId: r.type_id, role: r.role }));
  return material;
}

export function listMaterials(db, userId, { kind, q, limit = 50, offset = 0, language } = {}) {
  const lang = SUPPORTED_LANGUAGES.includes(language) ? language : preferredLanguage(db, userId);
  const where = ['user_id = :user'];
  const params = { user: userId };
  if (kind) { where.push('kind = :kind'); params.kind = oneOf(kind, KINDS, 'kind'); }
  if (q) { where.push("(code = :code OR body LIKE :like ESCAPE '\\' OR transcript LIKE :like ESCAPE '\\')"); params.code = String(q).toUpperCase(); params.like = `%${String(q).replace(/[%_]/g, (c) => `\\${c}`)}%`; }
  const total = db.prepare(`SELECT count(*) AS n FROM materials WHERE ${where.join(' AND ')}`).get(params).n;
  const rows = db.prepare(`SELECT * FROM materials WHERE ${where.join(' AND ')} ORDER BY rid DESC LIMIT :limit OFFSET :offset`)
    .all({ ...params, limit: Math.min(200, Math.max(1, Number(limit) || 50)), offset: Math.max(0, Number(offset) || 0) });
  return { total, items: shapeMaterials(db, rows, lang).map(({ sentences, ...m }) => ({ ...m, body: m.body?.slice(0, 200) ?? null, transcript: m.transcript?.slice(0, 200) ?? null, sentenceCount: sentences.length })) };
}
