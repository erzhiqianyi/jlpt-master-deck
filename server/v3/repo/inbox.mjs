// 収集箱：学習中に書き留めた内容（単語・文法・文・聴解・読解）。AI が整理して知識項目や問題にしたら processed にする。
import { InputError, NotFoundError, nextCode, nowIso, oneOf, text } from './common.mjs';

const CATEGORIES = ['word', 'grammar', 'sentence', 'listening', 'reading', 'unsure'];
const STATUSES = ['inbox', 'processed', 'archived'];

function shape(r) {
  return { code: r.code, body: r.body, category: r.category, context: r.context, wordbook: r.wordbook_code ?? null, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at };
}
const SELECT = 'SELECT c.*, w.code AS wordbook_code FROM inbox_captures c LEFT JOIN wordbooks w ON w.rid = c.target_wordbook_rid';

// 続きのページ：最後に返した行（rid）より前から読む。状態を変えても先の行は飛ばない。
// カーソルは絞り込みと位置だけを持つ。読む範囲は常にログイン中のユーザーなので署名はしない。
function readCursor(cursor) {
  let value;
  try { value = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8')); } catch { value = null; }
  if (!value || value.v !== 1 || !Number.isSafeInteger(value.before) || value.before < 1) throw new InputError('cursor 不正确，请从第一页重新开始');
  return value;
}
const writeCursor = (filters, before) => Buffer.from(JSON.stringify({ v: 1, ...filters, before })).toString('base64url');

function captureFilters(input) {
  const status = input.status == null || input.status === 'all' ? 'all' : oneOf(input.status, STATUSES, 'status');
  const category = input.category == null ? null : oneOf(input.category, CATEGORIES, 'category');
  return { status, category };
}
function captureWhere(userId, filters) {
  const where = ['c.user_id = :user'];
  const params = { user: userId };
  if (filters.status !== 'all') { where.push('c.status = :status'); params.status = filters.status; }
  if (filters.category) { where.push('c.category = :category'); params.category = filters.category; }
  return { where, params };
}

/** 件数だけ（status は inbox・processed・archived・all、省略は all）。 */
export function countCaptures(db, userId, input = {}) {
  const filters = captureFilters(input);
  const { where, params } = captureWhere(userId, filters);
  return { total: db.prepare(`SELECT count(*) AS n FROM inbox_captures c WHERE ${where.join(' AND ')}`).get(params).n, filters };
}

/**
 * 新しい順の一覧。total は絞り込み全体の件数（カーソルより前に限らない）。
 * 続きは page.nextCursor を cursor に渡す（省略した絞り込みはカーソルのものを使い、渡すなら同じでなければならない）。
 */
export function listCaptures(db, userId, { status, category, limit = 100, offset = 0, cursor } = {}) {
  let filters = captureFilters({ status, category });
  let before = null;
  if (cursor) {
    const saved = readCursor(cursor);
    if ((status != null && filters.status !== saved.status) || (category != null && filters.category !== saved.category)) throw new InputError('cursor 的筛选条件不能改变；要换条件请从第一页开始');
    filters = captureFilters({ status: saved.status, category: saved.category });
    before = saved.before;
    if (Number(offset)) throw new InputError('cursor 和 offset 不能同时使用');
  }
  const { where, params } = captureWhere(userId, filters);
  const total = db.prepare(`SELECT count(*) AS n FROM inbox_captures c WHERE ${where.join(' AND ')}`).get(params).n;
  if (before) { where.push('c.rid < :before'); params.before = before; }
  const size = Math.min(500, Math.max(1, Number(limit) || 100));
  const rows = db.prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY c.rid DESC LIMIT :limit OFFSET :offset`)
    .all({ ...params, limit: size + 1, offset: Math.max(0, Number(offset) || 0) });
  const page = rows.slice(0, size);
  const hasMore = rows.length > size;
  return { total, filters, items: page.map(shape), page: { limit: size, returned: page.length, hasMore, nextCursor: hasMore ? writeCursor(filters, page.at(-1).rid) : null } };
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
