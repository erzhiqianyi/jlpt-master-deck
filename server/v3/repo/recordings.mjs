// 跟読・発話の録音：学習者が聴解問題に合わせて録音し、AI が音声を聞いて比べ、総評・良い点・改善点を書き戻す。
import { pickTexts, preferredLanguage, SUPPORTED_LANGUAGES } from '../i18n.mjs';
import { ConflictError, InputError, NotFoundError, nextCode, nowIso, oneOf, text, list } from './common.mjs';
import { storeMedia, mediaFor } from './media.mjs';
import { writeText } from './materials.mjs';

const languageOf = (db, userId, requested) => (SUPPORTED_LANGUAGES.includes(requested) ? requested : preferredLanguage(db, userId));

function row(db, userId, code) {
  const r = db.prepare('SELECT * FROM speaking_recordings WHERE user_id = ? AND code = ?').get(userId, String(code ?? '').toUpperCase());
  if (!r) throw new NotFoundError(`找不到录音：${code}`);
  return r;
}

export function getRecording(db, userId, code, { language } = {}) {
  const r = row(db, userId, code);
  const lang = languageOf(db, userId, language);
  const notes = db.prepare('SELECT rid, kind FROM speaking_recording_notes WHERE recording_rid = ? ORDER BY kind, position').all(r.rid);
  const texts = pickTexts(db, [['speaking_recordings', r.rid], ...notes.map((n) => ['speaking_recording_notes', n.rid])], lang);
  const own = texts.get(`speaking_recordings:${r.rid}`) ?? {};
  const question = r.question_rid ? db.prepare('SELECT code FROM questions WHERE rid = ?').get(r.question_rid)?.code : null;
  const file = mediaFor(db, userId, r.audio_media_rid);
  return {
    code: r.code, id: r.rid, question, status: r.status, mediaId: r.audio_media_rid, mime: file.mime, size: file.size, transcript: r.transcript, referenceTranscript: r.reference_transcript,
    summary: own.summary ?? null, nextPractice: own.next_practice ?? null,
    strengths: notes.filter((n) => n.kind === 'strength').map((n) => texts.get(`speaking_recording_notes:${n.rid}`)?.note ?? null).filter(Boolean),
    improvements: notes.filter((n) => n.kind === 'improvement').map((n) => texts.get(`speaking_recording_notes:${n.rid}`)?.note ?? null).filter(Boolean),
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

/** 録音を保存する（question：聴解の問題番号、無くてもよい）。参考の原文は題組の音声のスクリプト。 */
export function createRecording(db, userId, input = {}) {
  const mediaId = storeMedia(db, userId, { base64: input.audioBase64, mime: input.mime, fileName: input.fileName ?? null });
  if (mediaFor(db, userId, mediaId).kind !== 'audio') throw new InputError('录音应为音频文件');
  let questionRid = null;
  let reference = null;
  if (input.question) {
    const q = db.prepare('SELECT q.rid, q.group_rid FROM questions q WHERE q.user_id = ? AND q.code = ?').get(userId, String(input.question).toUpperCase());
    if (!q) throw new NotFoundError(`找不到题目：${input.question}`);
    questionRid = q.rid;
    reference = db.prepare(`SELECT m.transcript FROM question_group_materials l JOIN materials m ON m.rid = l.material_rid WHERE l.group_rid = ? AND m.kind = 'audio' ORDER BY l.position LIMIT 1`).get(q.group_rid)?.transcript ?? null;
  }
  const { code } = nextCode(db, userId, 'RC');
  const now = nowIso();
  db.prepare(`INSERT INTO speaking_recordings (user_id, code, question_rid, audio_media_rid, status, transcript, reference_transcript, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?, ?)`)
    .run(userId, code, questionRid, mediaId, reference, now, now);
  return getRecording(db, userId, code);
}

export function listRecordings(db, userId, { question, status, limit = 50 } = {}) {
  const where = ['r.user_id = :user'];
  const params = { user: userId };
  if (question) { where.push('q.code = :question'); params.question = String(question).toUpperCase(); }
  if (status) { where.push('r.status = :status'); params.status = oneOf(status, ['pending', 'analyzing', 'completed', 'failed'], 'status'); }
  return db.prepare(`SELECT r.code FROM speaking_recordings r LEFT JOIN questions q ON q.rid = r.question_rid WHERE ${where.join(' AND ')} ORDER BY r.rid DESC LIMIT :limit`)
    .all({ ...params, limit: Math.min(200, Math.max(1, Number(limit) || 50)) }).map((r) => getRecording(db, userId, r.code));
}

/** AI が分析を始める：状態を analyzing にして、録音と参考の原文を返す（音声は get_media で聞く）。 */
export function claimRecording(db, userId, code) {
  const r = row(db, userId, code);
  if (r.status === 'completed') throw new ConflictError(`录音 ${r.code} 已分析完`);
  db.prepare("UPDATE speaking_recordings SET status = 'analyzing', updated_at = ? WHERE rid = ?").run(nowIso(), r.rid);
  return getRecording(db, userId, code);
}

/** 分析結果を書き戻す。input：{ status: completed | failed, transcript, summary, nextPractice, strengths[], improvements[], language }。 */
export function saveRecordingAnalysis(db, userId, code, input = {}) {
  const r = row(db, userId, code);
  const status = oneOf(input.status ?? 'completed', ['completed', 'failed'], 'status');
  const language = languageOf(db, userId, input.language);
  db.prepare('UPDATE speaking_recordings SET status = ?, transcript = coalesce(?, transcript), updated_at = ? WHERE rid = ?')
    .run(status, text(input.transcript, 'transcript', { max: 8000 }), nowIso(), r.rid);
  writeText(db, 'speaking_recordings', r.rid, 'summary', input.summary, language);
  writeText(db, 'speaking_recordings', r.rid, 'next_practice', input.nextPractice, language);
  for (const kind of ['strength', 'improvement']) {
    const key = kind === 'strength' ? 'strengths' : 'improvements';
    if (!(key in input)) continue;
    db.prepare('DELETE FROM speaking_recording_notes WHERE recording_rid = ? AND kind = ?').run(r.rid, kind);
    list(input[key], key, { max: 12 }).forEach((note, position) => {
      const rid = Number(db.prepare('INSERT INTO speaking_recording_notes (recording_rid, kind, position) VALUES (?, ?, ?)').run(r.rid, kind, position).lastInsertRowid);
      writeText(db, 'speaking_recording_notes', rid, 'note', note, language);
    });
  }
  return getRecording(db, userId, code, { language });
}

export function deleteRecording(db, userId, code) {
  const r = row(db, userId, code);
  db.prepare('UPDATE attempt_answers SET recording_rid = NULL WHERE recording_rid = ?').run(r.rid);
  db.prepare('DELETE FROM speaking_recordings WHERE rid = ?').run(r.rid);
  return { deleted: r.code };
}
