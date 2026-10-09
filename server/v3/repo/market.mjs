// 市場：単語帳（知識項目）や練習（題組）を分け合う。分享包は v2 形式（v3 の入力と同じ形）で、版ごとに保存する。
// 取り込むと自分の単語帳・知識項目・題組ができる。他人の問題は審査待ち（needs_review）として入り、審査を通ると練習に使える。
// テーブルは旧版から引き継いだ market_shares / market_share_versions / market_imports（移行時に分享包を v2 に変換済み）。
import { createHash, randomUUID } from 'node:crypto';
import { ConflictError, InputError, NotFoundError, nowIso, oneOf, text } from './common.mjs';
import { getKnowledge, createKnowledge } from './knowledge.mjs';
import { getQuestionGroup, createQuestionGroup } from './questions.mjs';
import { getPracticeSet, createPracticeSet, listPracticeSets } from './practice.mjs';
import { listWordbooks, createWordbook } from './wordbooks.mjs';
import { mediaFor, copyMedia } from './media.mjs';

const MAX_PACKAGE_BYTES = 2 * 1024 * 1024;
const KINDS = ['wordbook', 'practice'];
const plain = (value) => (value && typeof value === 'object' && 'text' in value ? value.text : value ?? undefined);
const fingerprint = (pkg) => createHash('sha256').update(JSON.stringify(pkg)).digest('hex');

// ---------- 分享包を作る ----------
/** 知識項目の詳細 → 取り込み用の入力（単語帳と番号は除く）。 */
function knowledgeInput(k) {
  return {
    kind: k.kind, expression: k.expression, reading: k.reading ?? undefined, pos: k.pos ?? undefined, transitivity: k.transitivity ?? undefined, isSuruNoun: k.isSuruNoun || undefined,
    baseForm: k.baseForm ?? undefined, jlptLevel: k.jlptLevel ?? undefined, register: k.register ?? undefined, paraphrase: k.paraphrase ?? undefined,
    meaning: plain(k.meaning), meaningJa: k.meaningJa ?? undefined, explanation: plain(k.explanation),
    examples: k.examples.map((e) => ({ sentence: e.sentence, reading: e.reading ?? undefined, translation: plain(e.translation), analysis: plain(e.analysis) })),
    memoryPoints: k.memoryPoints.map(plain).filter(Boolean),
    patterns: k.patterns.map((p) => ({ pattern: p.pattern, example: p.example ?? undefined, connection: plain(p.connection), meaning: plain(p.meaning), exampleTranslation: plain(p.exampleTranslation) })),
    notes: k.notes.map((n) => ({ kind: n.kind, title: plain(n.title), body: plain(n.body) })).filter((n) => n.body),
    comparisons: k.comparisons.map((c) => ({ target: c.target, kind: c.kind, difference: plain(c.difference) })),
    alternateForms: k.alternateForms, relatedWords: k.relatedWords, tags: k.tags, sources: k.sources.map((s) => ({ title: s.title, url: s.url ?? undefined })),
  };
}

/** 題組の詳細 → 取り込み用の入力。ファイルは media の番号、知識項目は分享包の中の位置で参照する。 */
function groupInput(g, knowledgeIndex, mediaRef) {
  return {
    typeId: g.typeId, level: g.level ?? undefined, official: g.official, shuffleOptions: g.shuffleOptions, instruction: g.instruction ?? undefined, context: g.context ?? undefined,
    instructionTranslation: plain(g.instructionTranslation), contextTranslation: plain(g.contextTranslation), sourceReference: g.sourceReference ?? undefined,
    materials: g.materials.map((m) => ({ role: m.role, kind: m.kind, body: m.body ?? undefined, transcript: m.transcript ?? undefined, media: m.mediaId ? mediaRef(m.mediaId) : undefined,
      clipStartMs: m.clipStartMs ?? undefined, clipEndMs: m.clipEndMs ?? undefined, title: plain(m.title), bodyTranslation: plain(m.bodyTranslation), summary: plain(m.summary),
      structure: plain(m.structure), transcriptTranslation: plain(m.transcriptTranslation), sentences: (m.sentences ?? []).map((s) => ({ sentence: s.sentence, isKey: s.isKey, translation: plain(s.translation) })) })),
    questions: g.questions.map((q) => ({
      prompt: q.prompt ?? undefined, promptMedia: q.promptMediaId && !g.materials.some((m) => m.mediaId === q.promptMediaId) ? mediaRef(q.promptMediaId) : undefined,
      expectedText: q.expectedText ?? undefined, translation: plain(q.translation), marks: q.marks,
      options: q.options.map((o) => ({ text: o.text ?? undefined, media: o.mediaId ? mediaRef(o.mediaId) : undefined, correct: o.correct, distractorType: o.distractorType ?? undefined,
        analysis: plain(o.analysis), translation: plain(o.translation) })),
      explanation: q.explanation.map((s) => ({ kind: s.kind, title: plain(s.title), body: plain(s.body) })).filter((s) => s.body),
      evidence: q.evidence, tags: q.tags,
      knowledge: q.knowledge.map((k) => ({ index: knowledgeIndex(k.code), relation: k.relation })).filter((k) => k.index != null),
    })),
  };
}

/** 自分の単語帳・練習から分享包を作る（保存はしない）。source：WB1 / DP3 など。 */
export function buildPackage(db, userId, { kind, source, title, description } = {}) {
  oneOf(kind, KINDS, 'kind');
  const media = [];
  const mediaRef = (id) => { let n = media.findIndex((m) => m.id === id); if (n < 0) { const f = mediaFor(db, userId, id); media.push({ id, kind: f.kind, mime: f.mime, size: f.size }); n = media.length - 1; } return n; };
  const knowledge = [];
  const codes = [];
  const addKnowledge = (code) => { const at = codes.indexOf(code); if (at >= 0) return at; codes.push(code); knowledge.push(knowledgeInput(getKnowledge(db, userId, code, { language: 'zh-Hans' }))); return codes.length - 1; };
  let groups = [];
  let defaultTitle;
  if (kind === 'wordbook') {
    const book = listWordbooks(db, userId).find((b) => b.code === String(source ?? '').toUpperCase());
    if (!book) throw new NotFoundError(`找不到单词本：${source}`);
    defaultTitle = book.title;
    for (const r of db.prepare('SELECT code FROM knowledge_points WHERE user_id = ? AND wordbook_rid = (SELECT rid FROM wordbooks WHERE user_id = ? AND code = ?) ORDER BY rid').all(userId, userId, book.code)) addKnowledge(r.code);
    if (!knowledge.length) throw new InputError('单词本是空的');
  } else {
    const set = getPracticeSet(db, userId, source);
    defaultTitle = set.title?.text ?? set.code;
    const groupCodes = [...new Set([...set.entries, ...set.sections.flatMap((s) => s.entries)].map((e) => e.group))];
    groups = groupCodes.map((code) => {
      const g = getQuestionGroup(db, userId, code, { language: 'zh-Hans' });
      return groupInput(g, (pointCode) => addKnowledge(pointCode), mediaRef);
    });
  }
  const pkg = { format: 'jlpt-share', version: 2, kind, title: text(title ?? defaultTitle, 'title', { optional: false, max: 120 }), description: text(description, 'description', { max: 600 }) ?? '',
    language: 'zh-Hans', knowledge, groups, media: media.map(({ kind: k, mime, size }) => ({ kind: k, mime, size })) };
  if (Buffer.byteLength(JSON.stringify(pkg)) > MAX_PACKAGE_BYTES) throw new InputError('分享内容超过 2 MB，请拆成几份');
  return { pkg, mediaIds: media.map((m) => m.id) };
}

// ---------- 公開・一覧 ----------
function shareRow(db, id) {
  const row = db.prepare('SELECT * FROM market_shares WHERE id = ?').get(String(id));
  if (!row) throw new NotFoundError(`找不到分享：${id}`);
  return row;
}
const summary = (row, pkg) => ({ id: row.id, kind: row.kind, title: pkg.title, description: pkg.description, knowledgeCount: pkg.knowledge?.length ?? 0,
  groupCount: pkg.groups?.length ?? 0, questionCount: (pkg.groups ?? []).reduce((n, g) => n + g.questions.length, 0), mine: false, withdrawn: row.withdrawn === 1, createdAt: row.created_at });

export function sharingSources(db, userId) {
  return {
    wordbooks: listWordbooks(db, userId).filter((b) => b.stats.total).map((b) => ({ kind: 'wordbook', source: b.code, title: b.title, count: b.stats.total })),
    practices: listPracticeSets(db, userId, { limit: 100 }).items.map((s) => ({ kind: 'practice', source: s.code, title: s.title?.text ?? s.code, count: s.questionCount })),
  };
}

/** 公開する（ファイルは公開者のものを参照し、取り込むときに複製する）。 */
export function publishShare(db, userId, input = {}) {
  const { pkg, mediaIds } = buildPackage(db, userId, input);
  const id = randomUUID();
  const stored = { ...pkg, mediaIds };
  const now = nowIso();
  db.prepare('INSERT INTO market_shares (id, user_id, source_id, kind, package_json, created_at, withdrawn) VALUES (?, ?, ?, ?, ?, ?, 0)').run(id, userId, String(input.source).toUpperCase(), pkg.kind, JSON.stringify(stored), now);
  db.prepare('INSERT INTO market_share_versions (share_id, revision, package_json, fingerprint, created_at) VALUES (?, 1, ?, ?, ?)').run(id, JSON.stringify(stored), fingerprint(pkg), now);
  return shareDetail(db, userId, id);
}

/** 公開中の分享を同じ出どころから作り直して新しい版にする。 */
export function refreshShare(db, userId, id, { title, description } = {}) {
  const row = shareRow(db, id);
  if (row.user_id !== userId) throw new NotFoundError(`找不到分享：${id}`);
  const current = JSON.parse(row.package_json);
  const { pkg, mediaIds } = buildPackage(db, userId, { kind: row.kind, source: row.source_id, title: title ?? current.title, description: description ?? current.description });
  const revision = db.prepare('SELECT coalesce(max(revision), 0) + 1 AS r FROM market_share_versions WHERE share_id = ?').get(id).r;
  const stored = { ...pkg, mediaIds };
  db.prepare('UPDATE market_shares SET package_json = ? WHERE id = ?').run(JSON.stringify(stored), id);
  db.prepare('INSERT INTO market_share_versions (share_id, revision, package_json, fingerprint, created_at) VALUES (?, ?, ?, ?, ?)').run(id, revision, JSON.stringify(stored), fingerprint(pkg), nowIso());
  return shareDetail(db, userId, id);
}

export function withdrawShare(db, userId, id) {
  const row = shareRow(db, id);
  if (row.user_id !== userId) throw new NotFoundError(`找不到分享：${id}`);
  db.prepare('UPDATE market_shares SET withdrawn = 1 WHERE id = ?').run(id);
  return { withdrawn: id };
}

export function listShares(db, userId, { mine = false } = {}) {
  const rows = mine ? db.prepare('SELECT * FROM market_shares WHERE user_id = ? ORDER BY created_at DESC').all(userId)
    : db.prepare('SELECT * FROM market_shares WHERE withdrawn = 0 ORDER BY created_at DESC').all();
  return rows.map((row) => ({ ...summary(row, JSON.parse(row.package_json)), mine: row.user_id === userId }));
}

/** 分享の中身（取り込む前に見るためのもの）。 */
export function shareDetail(db, userId, id, { revision } = {}) {
  const row = shareRow(db, id);
  if (row.withdrawn && row.user_id !== userId) throw new NotFoundError(`分享已撤回：${id}`);
  const version = revision ? db.prepare('SELECT package_json FROM market_share_versions WHERE share_id = ? AND revision = ?').get(id, Number(revision)) : null;
  if (revision && !version) throw new NotFoundError(`没有这个版本：${revision}`);
  const { mediaIds: _ids, ...pkg } = JSON.parse(version?.package_json ?? row.package_json);
  const revisions = db.prepare('SELECT revision, created_at FROM market_share_versions WHERE share_id = ? ORDER BY revision').all(id).map((v) => ({ revision: v.revision, createdAt: v.created_at }));
  return { ...summary(row, pkg), mine: row.user_id === userId, revisions, package: pkg };
}

// ---------- 取り込み ----------
/**
 * 分享を取り込む。同じ版を二度取り込んだときは前回の結果を返す。
 * 結果：{ wordbook, knowledge: [W…], groups: [QS…], practice, skipped: [{ index, errors }] }
 */
export function importShare(db, userId, id) {
  const row = shareRow(db, id);
  if (row.withdrawn) throw new ConflictError('分享已撤回，不能导入');
  const stored = JSON.parse(row.package_json);
  if (stored.format !== 'jlpt-share' || stored.version !== 2) throw new InputError('不支持的分享包格式');
  const { mediaIds = [], ...pkg } = stored;
  const digest = `${id}:${fingerprint(pkg)}`;
  const previous = db.prepare('SELECT result_json FROM market_imports WHERE user_id = ? AND digest = ?').get(userId, digest);
  if (previous) return { ...JSON.parse(previous.result_json), alreadyImported: true };
  // ファイルを自分のものとして複製
  const copied = mediaIds.map((mediaId) => copyMedia(db, row.user_id, mediaId, userId));
  const titles = new Set(listWordbooks(db, userId).map((b) => b.title));
  let title = pkg.title;
  for (let n = 2; titles.has(title); n += 1) title = `${pkg.title}（${n}）`;
  const result = { wordbook: null, knowledge: [], groups: [], practice: null, skipped: [] };
  if (pkg.knowledge.length) {
    const book = createWordbook(db, userId, { title });
    result.wordbook = book.code;
    for (const k of pkg.knowledge) {
      const created = createKnowledge(db, userId, { ...k, wordbook: book.code, language: pkg.language });
      db.prepare("UPDATE knowledge_points SET market_share_id = ? WHERE user_id = ? AND code = ?").run(id, userId, created.code);
      result.knowledge.push(created.code);
    }
  }
  const questionCodes = [];
  pkg.groups.forEach((g, index) => {
    const input = {
      ...g, status: 'needs_review', language: pkg.language,
      materials: g.materials.map(({ media, ...m }) => ({ ...m, ...(media != null ? { mediaId: copied[media] } : {}) })),
      questions: g.questions.map(({ promptMedia, knowledge, ...q }) => ({ ...q, ...(promptMedia != null ? { promptMediaId: copied[promptMedia] } : {}),
        options: q.options.map(({ media, ...o }) => ({ ...o, ...(media != null ? { mediaId: copied[media] } : {}) })),
        knowledge: (knowledge ?? []).map((k) => ({ code: result.knowledge[k.index], relation: k.relation })).filter((k) => k.code) })),
    };
    try {
      const created = createQuestionGroup(db, userId, input, { allowInvalid: true });
      if (created.status === 'needs_revision') result.needsRevision = [...(result.needsRevision ?? []), created.code];
      result.groups.push(created.code);
      questionCodes.push(...created.questions.map((q) => q.code));
    } catch (error) {
      if (!error.statusCode) throw error;
      result.skipped.push({ index, typeId: g.typeId, errors: error.details?.errors ?? [{ message: error.message }] });
    }
  });
  if (pkg.kind === 'practice' && questionCodes.length) {
    result.practice = createPracticeSet(db, userId, { kind: 'topic', title: pkg.title, description: pkg.description || undefined, questions: questionCodes, language: pkg.language }).code;
  }
  db.prepare('INSERT INTO market_imports (user_id, digest, result_json) VALUES (?, ?, ?)').run(userId, digest, JSON.stringify(result));
  return { ...result, alreadyImported: false };
}
