// 収集箱：学習中に書き留めた内容（単語・文法・文・聴解・読解）。AI が整理して知識項目や問題にしたら processed にする。
import { InputError, NotFoundError, nextCode, nowIso, oneOf, text } from './common.mjs';

const CATEGORIES = ['word', 'grammar', 'sentence', 'listening', 'reading', 'unsure'];
const STATUSES = ['inbox', 'processed', 'archived'];

function shape(r) {
  return { code: r.code, body: r.body, category: r.category, context: r.context, wordbook: r.wordbook_code ?? null, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at };
}
const SELECT = 'SELECT c.*, w.code AS wordbook_code FROM inbox_captures c LEFT JOIN wordbooks w ON w.rid = c.target_wordbook_rid';

function filters(userId, { status, category } = {}) {
  const where = ['c.user_id = :user'];
  const params = { user: userId };
  if (status) { where.push('c.status = :status'); params.status = oneOf(status, STATUSES, 'status'); }
  if (category) { where.push('c.category = :category'); params.category = oneOf(category, CATEGORIES, 'category'); }
  return { where, params };
}

function pageLimit(limit) {
  if (limit === undefined || limit === null || limit === '') return 100;
  const n = Number(limit);
  if (!Number.isInteger(n) || n < 1 || n > 500) throw new InputError(`limit 只能是 1～500 的整数，收到「${limit}」`);
  return n;
}

/** 条件に合う件数だけを数える（本文は読まない）。 */
export function countCaptures(db, userId, query = {}) {
  const { where, params } = filters(userId, query);
  return { total: db.prepare(`SELECT count(*) AS n FROM inbox_captures c WHERE ${where.join(' AND ')}`).get(params).n };
}

/**
 * 新しい順に 1 ページ。cursor は前のページの nextCursor（最後に返した条目の编号）で、
 * その条目より古いものから続ける。途中で processed にしても続きが飛ばない（OFFSET と違う）。
 */
export function listCaptures(db, userId, { status, category, limit, offset, cursor } = {}) {
  const { where, params } = filters(userId, { status, category });
  const total = db.prepare(`SELECT count(*) AS n FROM inbox_captures c WHERE ${where.join(' AND ')}`).get(params).n;
  if (cursor) {
    const anchor = db.prepare('SELECT rid FROM inbox_captures WHERE user_id = ? AND code = ?').get(userId, String(cursor).toUpperCase());
    if (!anchor) throw new InputError(`cursor 无效：${cursor}（请不带 cursor 重新开始）`);
    where.push('c.rid < :anchor');
    params.anchor = anchor.rid;
  }
  const size = pageLimit(limit);
  // 1 件多く読んで続きがあるかを判定する（その 1 件は返さない）。
  const rows = db.prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY c.rid DESC LIMIT :limit OFFSET :offset`)
    .all({ ...params, limit: size + 1, offset: cursor ? 0 : Math.max(0, Number(offset) || 0) });
  const items = rows.slice(0, size).map(shape);
  return { total, items, nextCursor: rows.length > size ? items.at(-1).code : null };
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
