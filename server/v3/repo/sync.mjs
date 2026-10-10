// オフライン端末（iOS）向けの同期：学習者のデータを業務番号つきの記録として順に返す。
// 一回の同期は最初のページ（cursor なし）から nextCursor が null になるまで読み、
// 端末は読み終えた時点で手元の内容を丸ごと置き換える（消えた記録はこれで消える）。
// ページは rid の順に進むので、途中で記録が増えても前のページはずれない（ページ間は一時点の写しではない）。
import { InputError } from './common.mjs';
import { getSettings } from './settings.mjs';
import { listWordbooks } from './wordbooks.mjs';
import { getKnowledge } from './knowledge.mjs';
import { getQuestionGroup } from './questions.mjs';
import { getPracticeSet } from './practice.mjs';
import { getPlan } from './plans.mjs';
import { listCaptures } from './inbox.mjs';

export const SYNC_FORMAT = 'jlpt-v3-sync';
export const SYNC_VERSION = 1;

// 件数の多いものは rid 順に分けて返す。少ないものは一件の記録にまとめる。
const COLLECTIONS = [
  { name: 'settings', single: (db, userId) => getSettings(db, userId) },
  { name: 'wordbooks', single: (db, userId) => listWordbooks(db, userId) },
  { name: 'plan', single: (db, userId, language) => getPlan(db, userId, { language }) },
  { name: 'inbox', single: (db, userId) => listCaptures(db, userId, { status: 'inbox', limit: 500 }).items },
  { name: 'knowledge', table: 'knowledge_points', read: (db, userId, code, language) => getKnowledge(db, userId, code, { language }) },
  { name: 'questionGroups', table: 'question_groups', read: (db, userId, code, language) => getQuestionGroup(db, userId, code, { language }) },
  { name: 'practiceSets', table: 'practice_sets', read: (db, userId, code, language) => getPracticeSet(db, userId, code, { language }) },
];

const encodeCursor = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
function decodeCursor(text) {
  try {
    const value = JSON.parse(Buffer.from(String(text), 'base64url').toString('utf8'));
    if (value?.v === SYNC_VERSION && Number.isInteger(value.c) && value.c >= 0 && value.c < COLLECTIONS.length && Number.isInteger(value.after) && typeof value.at === 'string') return value;
  } catch { /* fall through */ }
  throw new InputError('cursor 无效，请从头同步（不带 cursor）');
}

/** 一ページ分。limit は分けて返す記録の件数の上限（1～200、既定 100）。 */
export function syncPage(db, userId, { cursor, limit, language } = {}) {
  const size = limit === undefined || limit === null || limit === '' ? 100 : Number(limit);
  if (!Number.isInteger(size) || size < 1 || size > 200) throw new InputError(`limit 只能是 1～200 的整数，收到「${limit}」`);
  const start = cursor ? decodeCursor(cursor) : { v: SYNC_VERSION, c: 0, after: 0, at: new Date().toISOString() };
  let position = start;
  const records = [];
  while (position && records.length < size) {
    const collection = COLLECTIONS[position.c];
    const next = position.c + 1 < COLLECTIONS.length ? { ...position, c: position.c + 1, after: 0 } : null;
    if (collection.single) {
      records.push({ collection: collection.name, code: null, value: collection.single(db, userId, language) });
      position = next;
      continue;
    }
    const rows = db.prepare(`SELECT rid, code FROM ${collection.table} WHERE user_id = ? AND rid > ? ORDER BY rid LIMIT ?`).all(userId, position.after, size - records.length + 1);
    const taken = rows.slice(0, size - records.length);
    for (const row of taken) records.push({ collection: collection.name, code: row.code, value: collection.read(db, userId, row.code, language) });
    position = rows.length > taken.length ? { ...position, after: taken.at(-1).rid } : next;
  }
  return { format: SYNC_FORMAT, version: SYNC_VERSION, startedAt: start.at, records, nextCursor: position ? encodeCursor(position) : null };
}
