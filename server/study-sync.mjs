import { createHash, randomUUID } from 'node:crypto';
import { getDb, getStudyState, getStudyPlan, listReadingQuestions, listListeningQuestions, listLearningCaptures, listDailyPractices, getDailyPractice, listReviewPackDrafts, listWordbooks } from './storage.mjs';
import { userReviewData, listShares } from './market.mjs';
import { transaction } from './platform.mjs';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
const digest = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
function schema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS study_sync_snapshots (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, cursor TEXT NOT NULL,
    manifest_json TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(user_id,cursor)
  ); CREATE TABLE IF NOT EXISTS study_sync_transfers (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL,
    cursor TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(user_id,id)
  ); CREATE TABLE IF NOT EXISTS study_sync_chunks (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, id TEXT NOT NULL, chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL, created_at INTEGER NOT NULL,
    PRIMARY KEY(user_id,kind,id,chunk_index)
  );`);
}

// Bound storage rows before pagination: a bootstrap can exceed the cloud's
// SQLite row limit even though each HTTP response is small.
function storeJson(db, userId, kind, id, value, now) {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) <= 512 * 1024) return serialized;
  const insert = db.prepare('INSERT INTO study_sync_chunks VALUES(?,?,?,?,?,?)');
  db.prepare('DELETE FROM study_sync_chunks WHERE user_id=? AND kind=? AND id=?').run(userId,kind,id);
  let count = 0;
  // At most 120k UTF-16 units per row (including multibyte Japanese text).
  // Keep surrogate pairs together when binding fragments to SQLite.
  for (let offset = 0; offset < serialized.length;) {
    let end = Math.min(offset + 120000,serialized.length);
    const last = serialized.charCodeAt(end - 1);
    if (end < serialized.length && last >= 0xD800 && last <= 0xDBFF) end--;
    insert.run(userId,kind,id,count++,serialized.slice(offset,end),now);
    offset = end;
  }
  return JSON.stringify({ syncChunks:count });
}
function readJson(db, userId, kind, id, serialized) {
  const value = JSON.parse(serialized);
  if (!value.syncChunks) return value; // Existing transfers/baselines remain readable.
  const rows = db.prepare('SELECT content FROM study_sync_chunks WHERE user_id=? AND kind=? AND id=? ORDER BY chunk_index').all(userId,kind,id);
  if (rows.length !== value.syncChunks) throw new Error('Incomplete sync snapshot');
  return JSON.parse(rows.map(row => row.content).join(''));
}
export function studySyncRecords(userId) {
  const review = userReviewData(userId);
  const state = getStudyState(userId);
  const practices = listDailyPractices(userId);
  const { items, ...reviewMeta } = review;
  const { progress, answers, cardReviews, attemptHistory, ...stateMeta } = state;
  const records = [];
  const add = (collection, id, value) => records.push({ collection, id:String(id), value });
  const array = (collection, values, key = 'id') => values.forEach(value => add(collection, value[key], value));
  array('items', items); add('reviewMeta','value',{...reviewMeta, generated_at:items.length ? reviewMeta.generated_at : ''});
  array('reading',listReadingQuestions(userId)); array('listening',listListeningQuestions(userId));
  array('captures',listLearningCaptures(userId)); array('drafts',listReviewPackDrafts(userId));
  array('shares',listShares(userId)); array('wordbooks',listWordbooks(userId));
  array('practiceSummaries',practices); array('packs',practices.map(p => getDailyPractice(userId,p.id)));
  const { tasks = [], dailySummaries = [], ...planMeta } = getStudyPlan(userId);
  add('plan','value', {...planMeta,tasks:[],dailySummaries:[]});
  array('planTasks',tasks); array('planDays',dailySummaries,'date');
  add('stateMeta','value',stateMeta);
  for (const [id,value] of Object.entries(progress)) add('progress',id,value);
  for (const [id,value] of Object.entries(answers)) add('answers',id,value);
  array('cardReviews',cardReviews ?? [],'eventId'); array('attemptHistory',attemptHistory ?? []);
  // Version keys are separate records: later edits never overwrite an offline
  // practice's frozen question/material revision. Pages remain owner-scoped.
  const db=getDb();
  for (const [collection,table,idColumn] of [
    ['questionVersions','bank_question_versions','question_id'],
    ['materialVersions','bank_material_versions','material_id'],
    ['materialGroupVersions','bank_material_group_versions','group_id'],
  ]) {
    for (const row of db.prepare(`SELECT ${idColumn} AS id,revision,payload_json FROM ${table} WHERE owner=? ORDER BY ${idColumn},revision`).all(userId)) {
      add(collection,JSON.stringify([row.id,row.revision]),{id:row.id,revision:row.revision,schemaVersion:1,payload:JSON.parse(row.payload_json)});
    }
  }
  for (const row of db.prepare('SELECT id,latest_revision,status FROM bank_questions WHERE owner=? ORDER BY id').all(userId)) {
    add('questionStates',row.id,{id:row.id,latestRevision:row.latest_revision,status:row.status});
  }
  return records;
}

// Content hashes include every returned field, so edits, deletions and permission
// changes are detected even when a writer forgets to bump updated_at.
export function studySync(userId, { cursor = null, page = null } = {}, { pageSize = 150, now = Date.now() } = {}) {
  const db = getDb(); schema(db);
  db.prepare('DELETE FROM study_sync_transfers WHERE created_at < ?').run(now - 3600000);
  db.prepare("DELETE FROM study_sync_chunks WHERE (kind='transfer' AND created_at < ?) OR (kind='manifest' AND created_at < ?)").run(now - 3600000,now - 90 * 86400000);
  let transfer, offset = 0;
  if (page) {
    const match = /^([a-f0-9-]+):(\d+)$/.exec(page);
    if (!match) throw new Error('Invalid sync page');
    transfer = db.prepare('SELECT * FROM study_sync_transfers WHERE user_id=? AND id=?').get(userId,match[1]);
    if (!transfer) return { restart:true };
    offset = Number(match[2]);
  } else {
    const records = studySyncRecords(userId);
    const manifest = Object.fromEntries(records.map(r => [JSON.stringify([r.collection,r.id]),digest(r.value)]));
    const nextCursor = digest(manifest);
    if (cursor === nextCursor) return { changes:[], cursor:nextCursor, nextPage:null, reset:false, total:0 };
    const saved = cursor && db.prepare('SELECT manifest_json FROM study_sync_snapshots WHERE user_id=? AND cursor=?').get(userId,cursor);
    const previous = saved ? readJson(db,userId,'manifest',cursor,saved.manifest_json) : {};
    const changes = records.filter(r => previous[JSON.stringify([r.collection,r.id])] !== manifest[JSON.stringify([r.collection,r.id])]);
    for (const key of Object.keys(previous)) if (!(key in manifest)) {
      const [collection,id] = JSON.parse(key); changes.push({ collection,id,deleted:true });
    }
    transaction(db, () => {
      const stored = storeJson(db,userId,'manifest',nextCursor,manifest,now);
      db.prepare('INSERT OR REPLACE INTO study_sync_snapshots VALUES(?,?,?,?)').run(userId,nextCursor,stored,now);
    });
    // Retain baselines for offline devices; an expired cursor gets one paged bootstrap.
    db.prepare('DELETE FROM study_sync_snapshots WHERE created_at < ?').run(now - 90 * 86400000);
    transfer = { id:randomUUID(),cursor:nextCursor };
    transaction(db, () => {
      transfer.payload_json = storeJson(db,userId,'transfer',transfer.id,{ changes,reset:!saved },now);
      db.prepare('INSERT INTO study_sync_transfers VALUES(?,?,?,?,?)').run(userId,transfer.id,transfer.cursor,transfer.payload_json,now);
    });
  }
  const payload = readJson(db,userId,'transfer',transfer.id,transfer.payload_json);
  const changes = [];
  let bytes = 0;
  for (const change of payload.changes.slice(offset,offset+pageSize)) {
    const size = Buffer.byteLength(JSON.stringify(change));
    if (changes.length && bytes + size > 512 * 1024) break;
    changes.push(change); bytes += size;
  }
  const nextOffset = offset + changes.length;
  return { changes,reset:payload.reset,total:payload.changes.length,
    nextPage:nextOffset < payload.changes.length ? `${transfer.id}:${nextOffset}` : null,
    cursor: nextOffset < payload.changes.length ? null : transfer.cursor };
}

export function studySyncStatus(userId) {
  const records = studySyncRecords(userId);
  const values = name => records.filter(r => r.collection === name).map(r => r.value);
  const items = values('items');
  const grammar = item => item.type === 'grammar' || item.deck === 'grammar_expression';
  return { counts: {
    vocabulary:items.filter(i => !grammar(i)).length, grammar:items.filter(grammar).length,
    reading:values('reading').length, listening:values('listening').length, packs:values('packs').length,
    questions:new Set(values('packs').flatMap(p => p.questions ?? []).map(q => q.canonicalQuestionId??q.id)).size,
    drafts:values('drafts').length, tasks:values('planTasks').length, days:values('planDays').length,
    progress:values('progress').length, answers:values('answers').length, captures:values('captures').length,
    discovery:values('shares').length, vocabularyImages:items.filter(i => !grammar(i) && i.images?.length).length,
    grammarImages:items.filter(i => grammar(i) && i.images?.length).length,
    audio:new Set(values('listening').map(i => i.audioId ?? i.audioUrl ?? i.id)).size,
  } };
}
