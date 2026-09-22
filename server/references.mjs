import { createHash } from 'node:crypto';
// Public references are allocated by SQLite, never by the browser or an MCP caller.
// Keep this registry in full database backups: JSON content alone cannot restore its sequence.
const sources = [
  ['question_reference_snapshots', 'question_snapshot', 'QU'],
  ['owned_review_items', 'item', 'IT'], ['user_review_items', 'item', 'IT'],
  ['daily_practices', 'practice_session', 'PR'], ['reading_questions', 'reading', 'RD'],
  ['listening_questions', 'listening', 'LS'], ['listening_audio_assets', 'audio', 'AU'],
  ['listening_recordings', 'recording', 'RC'], ['review_pack_drafts', 'draft', 'DR'],
  ['learning_captures', 'capture', 'CP'], ['wordbooks', 'wordbook', 'WB'],
];
export function ensureReferenceSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS question_reference_snapshots (
    user_id INTEGER NOT NULL, id TEXT NOT NULL, original_id TEXT NOT NULL, item_id TEXT NOT NULL,
    question_json TEXT NOT NULL, PRIMARY KEY(user_id, id)
  );
  CREATE TABLE IF NOT EXISTS record_references (
    number INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    entity TEXT NOT NULL,
    internal_id TEXT NOT NULL,
    prefix TEXT NOT NULL,
    UNIQUE(user_id, entity, internal_id)
  );`);
  const questionSelect = (owner, json, parent) => `SELECT ${owner} AS user_id, 'question' AS entity,
    json_extract(q.value, '$.id') AS internal_id, 'QU' AS prefix, ${parent} AS parent_id
    FROM json_each(${json}, '$.questions') q WHERE json_type(q.value, '$.id') = 'text'`;
  // Workers SQLite limits compound SELECT terms. Use per-table backfills and EXISTS
  // rather than a growing UNION view; the registry also retains deleted IDs as tombstones.
  for (const [table, entity, prefix] of sources) {
    db.exec(`INSERT INTO record_references(user_id, entity, internal_id, prefix)
      SELECT s.user_id, '${entity}', s.id, '${prefix}' FROM ${table} s
      WHERE NOT EXISTS (SELECT 1 FROM record_references r WHERE r.user_id=s.user_id AND r.entity='${entity}' AND r.internal_id=s.id)
      ORDER BY s.user_id, s.id;`);
  }
  db.exec(`INSERT INTO record_references(user_id, entity, internal_id, prefix)
    SELECT DISTINCT d.user_id, 'question', json_extract(q.value, '$.id'), 'QU'
    FROM daily_practices d, json_each(d.practice_json, '$.questions') q
    WHERE json_type(q.value, '$.id') = 'text' AND NOT EXISTS
      (SELECT 1 FROM record_references r WHERE r.user_id=d.user_id AND r.entity='question' AND r.internal_id=json_extract(q.value, '$.id'))
    ORDER BY d.user_id, d.id, q.key;`);
  const questionParent = `SELECT d.id FROM daily_practices d, json_each(d.practice_json, '$.questions') q
    WHERE d.user_id=r.user_id AND json_extract(q.value, '$.id')=r.internal_id LIMIT 1`;
  const active = sources.map(([table, entity]) => `(r.entity='${entity}' AND EXISTS
    (SELECT 1 FROM ${table} s WHERE s.user_id=r.user_id AND s.id=r.internal_id))`);
  active.push(`(r.entity='question' AND EXISTS (${questionParent}))`);
  db.exec(`DROP VIEW IF EXISTS reference_sources;
    CREATE VIEW reference_sources AS SELECT r.user_id, r.entity, r.internal_id, r.prefix,
    CASE WHEN r.entity='question' THEN (${questionParent}) ELSE NULL END AS parent_id
    FROM record_references r WHERE ${active.join(' OR ')};`);
  for (const [table, entity, prefix] of sources) {
    for (const event of ['INSERT', 'UPDATE']) {
      db.exec(`CREATE TRIGGER IF NOT EXISTS refs_${table}_${event} AFTER ${event} ON ${table} BEGIN
        INSERT INTO record_references(user_id, entity, internal_id, prefix)
        SELECT NEW.user_id, '${entity}', NEW.id, '${prefix}'
        WHERE NOT EXISTS (SELECT 1 FROM record_references WHERE user_id=NEW.user_id AND entity='${entity}' AND internal_id=NEW.id);
        ${table === 'daily_practices' ? `INSERT INTO record_references(user_id, entity, internal_id, prefix)
          SELECT s.user_id, s.entity, s.internal_id, s.prefix FROM (${questionSelect('NEW.user_id', 'NEW.practice_json', 'NEW.id')}) s
          WHERE NOT EXISTS (SELECT 1 FROM record_references r WHERE r.user_id=s.user_id AND r.entity=s.entity AND r.internal_id=s.internal_id)
          GROUP BY s.internal_id;` : ''}
        END;`);
    }
  }
}

const referenceSql = "r.prefix || '-' || printf('%06d', r.number)";
// ID lists travel as one JSON parameter: Workers SQLite allows at most 100 bound variables,
// so never expand caller-sized arrays into `IN (?, ?, ...)`.
export function referencesForOwner(db, userId, ids) {
  return db.prepare(`SELECT DISTINCT r.entity, r.internal_id AS id, ${referenceSql} AS reference, s.parent_id
    FROM record_references r JOIN reference_sources s USING(user_id, entity, internal_id)
    WHERE r.user_id=?${ids ? ' AND r.internal_id IN (SELECT value FROM json_each(?))' : ''}`).all(userId, ...(ids ? [JSON.stringify(ids)] : []));
}

export function resolveReference(db, userId, reference) {
  const normalized = String(reference).trim().toUpperCase();
  const match = /^([A-Z]{2})-(\d{6,})$/.exec(normalized);
  if (!match) return null;
  const row = db.prepare(`SELECT r.entity, r.internal_id AS id, ${referenceSql} AS reference, s.parent_id
    FROM record_references r JOIN reference_sources s USING(user_id, entity, internal_id)
    WHERE r.user_id=? AND r.prefix=? AND r.number=?`).get(userId, match[1], Number(match[2]));
  if (!row || row.reference !== normalized) return null;
  return { ...row, lookup: lookupFor(row) };
}
function lookupFor(row) {
  if (['item', 'question', 'practice_session'].includes(row.entity)) return { tool: 'jlpt_get', arguments: { entity: row.entity, id: row.id } };
  if (row.entity === 'question_snapshot') return { tool: 'get_reference_question', arguments: { reference: row.reference } };
  if (row.entity === 'reading') return { tool: 'get_reading_question', arguments: { id: row.id } };
  if (row.entity === 'draft') return { tool: 'get_review_pack_draft', arguments: { draft_id: row.id } };
  return { tool: 'get_reference_metadata', arguments: { reference: row.reference } };
}

// Additive response metadata; never change IDs, stored content, or answer visibility.
export function decorateReferences(db, userId, value) {
  if (!userId || value == null || typeof value !== 'object') return value;
  const ids = new Set();
  function collect(node) {
    if (!node || typeof node !== 'object') return;
    if (typeof node.id === 'string') ids.add(node.id);
    if (typeof node.audioAssetId === 'string') ids.add(node.audioAssetId);
    for (const child of Object.values(node)) collect(child);
  }
  collect(value);
  if (!ids.size) return value;
  const refs = referencesForOwner(db, userId, [...ids]);
  const seen = new Set(refs.map(ref => ref.reference));
  const parentIds = [...new Set(refs.map(ref => ref.parent_id).filter(Boolean))];
  if (parentIds.length) refs.push(...referencesForOwner(db, userId, parentIds).filter(ref => !seen.has(ref.reference)));

  const byId = new Map();
  for (const ref of refs) {
    const entries = byId.get(ref.id) ?? [];
    entries.push(ref);
    byId.set(ref.id, entries);
  }
  function visit(node) {
    if (Array.isArray(node)) return node.map(visit);
    if (!node || typeof node !== 'object') return node;
    const result = Object.fromEntries(Object.entries(node).map(([key, val]) => [key, key === 'arguments' ? val : visit(val)]));
    const audio = byId.get(node.audioAssetId)?.find(ref => ref.entity === 'audio');
    if (audio) result.audioReference = audio.reference;
    const matches = byId.get(node.id);
    if (matches?.length === 1) {
      result.reference = matches[0].reference;
      if (matches[0].parent_id) result.practiceReference = byId.get(matches[0].parent_id)?.find(r => r.entity === 'practice_session')?.reference;
    }
    return result;
  }
  return visit(value);
}

// Browser-generated drills have no daily_practices row. Store an immutable, content-addressed
// snapshot so a reference always identifies the question the learner actually saw.
export function registerQuestionReference(db, userId, question) {
  if (!question || typeof question.id !== 'string' || typeof question.itemId !== 'string'
    || typeof question.prompt !== 'string' || !Array.isArray(question.choices)
    || question.choices.length < 2 || question.choices.length > 8
    || !question.choices.every(choice => typeof choice === 'string')
    || typeof question.answer !== 'string' || !question.choices.includes(question.answer)
    || JSON.stringify(question).length > 50000) throw new Error('Invalid question');
  const owned = db.prepare("SELECT 1 FROM reference_sources WHERE user_id=? AND entity='item' AND internal_id=?").get(userId, question.itemId);
  if (!owned) throw new Error('Item not found');
  const snapshot = Object.fromEntries(['id', 'itemId', 'kind', 'title', 'instruction', 'prompt', 'promptTarget', 'choices', 'answer', 'correctReason', 'memoryPoint', 'choiceAnalysis'].map(key => [key, question[key]]));
  const serialized = JSON.stringify(snapshot);
  const id = createHash('sha256').update(serialized).digest('hex');
  db.prepare('INSERT OR IGNORE INTO question_reference_snapshots(user_id,id,original_id,item_id,question_json) VALUES(?,?,?,?,?)').run(userId, id, question.id, question.itemId, serialized);
  const row = db.prepare("SELECT prefix || '-' || printf('%06d', number) AS reference FROM record_references WHERE user_id=? AND entity='question_snapshot' AND internal_id=?").get(userId, id);
  return { id, reference: row.reference };
}

export function getReferenceQuestion(db, userId, reference) {
  const record = resolveReference(db, userId, reference);
  if (!record || record.entity !== 'question_snapshot') return null;
  const row = db.prepare('SELECT * FROM question_reference_snapshots WHERE user_id=? AND id=?').get(userId, record.id);
  const question = JSON.parse(row.question_json);
  const answered = db.prepare('SELECT 1 FROM answers WHERE user_id=? AND question_id=?').get(userId, row.original_id);
  const { answer, correctReason, memoryPoint, choiceAnalysis, ...prompt } = question;
  return { ...record, question: answered ? question : prompt, answered: Boolean(answered), source: 'browser_generated_snapshot' };
}


export function getReferenceMetadata(db, userId, reference) {
  const record = resolveReference(db, userId, reference);
  if (!record) return null;
  // Explicit projections keep filesystem locations and audio bytes out of chat results.
  const projections = {
    listening: ['listening_questions', 'id,title,question_type_id,question,audio_asset_id'],
    audio: ['listening_audio_assets', 'id,file_name,mime,size,created_at'],
    recording: ['listening_recordings', 'id,listening_question_id,status,created_at,updated_at'],
    capture: ['learning_captures', 'id,body,category,status,created_at'],
    wordbook: ['wordbooks', 'id,title,deck,created_at'],
  };
  const projection = projections[record.entity];
  if (!projection) return record;
  const [table, fields] = projection;
  return { ...record, metadata: db.prepare(`SELECT ${fields} FROM ${table} WHERE user_id=? AND id=?`).get(userId, record.id) };
}
