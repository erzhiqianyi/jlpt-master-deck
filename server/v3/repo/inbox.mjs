// 収集箱：学習中に書き留めた内容（単語・文法・文・聴解・読解）。AI が整理して知識項目や問題にしたら processed にする。
import { InputError, NotFoundError, nextCode, nowIso, oneOf, text } from './common.mjs';

const CATEGORIES = ['word', 'grammar', 'sentence', 'listening', 'reading', 'unsure'];
const STATUSES = ['inbox', 'processed', 'archived'];

function shape(r) {
  return { code: r.code, body: r.body, category: r.category, context: r.context, wordbook: r.wordbook_code ?? null, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at };
}
const SELECT = 'SELECT c.*, w.code AS wordbook_code FROM inbox_captures c LEFT JOIN wordbooks w ON w.rid = c.target_wordbook_rid';

export function listCaptures(db, userId, { status, category, limit = 100, offset = 0 } = {}) {
  const where = ['c.user_id = :user'];
  const params = { user: userId };
  if (status) { where.push('c.status = :status'); params.status = oneOf(status, STATUSES, 'status'); }
  if (category) { where.push('c.category = :category'); params.category = oneOf(category, CATEGORIES, 'category'); }
  const total = db.prepare(`SELECT count(*) AS n FROM inbox_captures c WHERE ${where.join(' AND ')}`).get(params).n;
  const rows = db.prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY c.rid DESC LIMIT :limit OFFSET :offset`)
    .all({ ...params, limit: Math.min(500, Math.max(1, Number(limit) || 100)), offset: Math.max(0, Number(offset) || 0) });
  return { total, items: rows.map(shape) };
}

export function getCapture(db, userId, code) {
  const row = db.prepare(`${SELECT} WHERE c.user_id = ? AND c.code = ?`).get(userId, String(code ?? '').toUpperCase());
  if (!row) throw new NotFoundError(`找不到收集箱条目：${code}`);
  return shape(row);
}

export function createCapture(db, userId, input = {}) {
  const body = text(input.body, 'body', { optional: false, max: 4000 });
  const category = oneOf(input.category ?? 'unsure', CATEGORIES, 'category');
  let wordbook = null;
  if (input.wordbook) {
    wordbook = db.prepare('SELECT rid FROM wordbooks WHERE user_id = ? AND code = ?').get(userId, String(input.wordbook).toUpperCase())?.rid;
    if (!wordbook) throw new InputError(`找不到单词本：${input.wordbook}`);
  }
  const { code } = nextCode(db, userId, 'IN');
  const now = nowIso();
  db.prepare('INSERT INTO inbox_captures (user_id, code, body, category, context, target_wordbook_rid, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(userId, code, body, category, text(input.context, 'context', { max: 8000 }), wordbook, 'inbox', now, now);
  return getCapture(db, userId, code);
}

export function setCaptureStatus(db, userId, code, status) {
  const current = getCapture(db, userId, code);
  db.prepare('UPDATE inbox_captures SET status = ?, updated_at = ? WHERE user_id = ? AND code = ?').run(oneOf(status, STATUSES, 'status'), nowIso(), userId, current.code);
  return getCapture(db, userId, current.code);
}

export function deleteCapture(db, userId, code) {
  const current = getCapture(db, userId, code);
  db.prepare('DELETE FROM inbox_captures WHERE user_id = ? AND code = ?').run(userId, current.code);
  return { deleted: current.code };
}
