// 单词本：只属于一个用户，可以同时放单词、语法、名字。统计实时计算（wordbook_stats 视图）。
import { InputError, NotFoundError, ConflictError, nextCode, nowIso, text } from './common.mjs';

const shape = (row) => ({
  code: row.code, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at,
  stats: { total: row.total ?? 0, words: row.word_count ?? 0, grammar: row.grammar_count ?? 0, names: row.name_count ?? 0, due: row.due_count ?? 0, new: row.new_count ?? 0, mastered: row.mastered_count ?? 0 },
});

export function listWordbooks(db, userId) {
  return db.prepare(`SELECT w.*, s.total, s.word_count, s.grammar_count, s.name_count, s.due_count, s.new_count, s.mastered_count
    FROM wordbooks w LEFT JOIN wordbook_stats s ON s.wordbook_rid = w.rid WHERE w.user_id = ? ORDER BY w.rid`).all(userId).map(shape);
}

export function wordbookRid(db, userId, code) {
  const row = db.prepare('SELECT rid FROM wordbooks WHERE user_id = ? AND code = ?').get(userId, String(code ?? '').toUpperCase());
  if (!row) throw new NotFoundError(`找不到单词本：${code}`);
  return row.rid;
}

export function getWordbook(db, userId, code) {
  const rid = wordbookRid(db, userId, code);
  return shape(db.prepare(`SELECT w.*, s.total, s.word_count, s.grammar_count, s.name_count, s.due_count, s.new_count, s.mastered_count
    FROM wordbooks w LEFT JOIN wordbook_stats s ON s.wordbook_rid = w.rid WHERE w.rid = ?`).get(rid));
}

function uniqueTitle(db, userId, title, exceptRid = null) {
  const clash = db.prepare('SELECT rid FROM wordbooks WHERE user_id = ? AND title = ?').get(userId, title);
  if (clash && clash.rid !== exceptRid) throw new ConflictError(`已有同名单词本：${title}`);
}

export function createWordbook(db, userId, input) {
  const title = text(input?.title, 'title', { optional: false, max: 80 });
  uniqueTitle(db, userId, title);
  const { code } = nextCode(db, userId, 'WB');
  const now = nowIso();
  db.prepare('INSERT INTO wordbooks (user_id, code, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(userId, code, title, now, now);
  return getWordbook(db, userId, code);
}

export function renameWordbook(db, userId, code, input) {
  const rid = wordbookRid(db, userId, code);
  const title = text(input?.title, 'title', { optional: false, max: 80 });
  uniqueTitle(db, userId, title, rid);
  db.prepare('UPDATE wordbooks SET title = ?, updated_at = ? WHERE rid = ?').run(title, nowIso(), rid);
  return getWordbook(db, userId, code);
}

/** 删除单词本：其中还有知识点时拒绝，需要先移走或删除。 */
export function deleteWordbook(db, userId, code) {
  const rid = wordbookRid(db, userId, code);
  const count = db.prepare('SELECT count(*) AS n FROM knowledge_points WHERE wordbook_rid = ?').get(rid).n;
  if (count) throw new ConflictError(`单词本里还有 ${count} 个知识点，请先移到别的单词本或删除`);
  db.prepare('DELETE FROM wordbooks WHERE rid = ?').run(rid);
  return { deleted: String(code).toUpperCase() };
}

export function ensureWordbookInput(value) {
  if (!value) throw new InputError('wordbook 必填（单词本编号，如 WB1）');
  return value;
}
