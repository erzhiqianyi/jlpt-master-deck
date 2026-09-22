// Read-only projection of the JLPT SQLite store for the controlled MCP query layer
// (server/mcp-query.mjs). Nothing here changes how the app writes data: the views expose the JSON
// blobs (review_items.item_json, daily_practices.practice_json) as columns, and the revision
// counter lets paginated reads detect writes between two tool calls.
//
// Views are recreated on every startup so a definition change never needs a migration.

const views = {
  mcp_reading_questions: `SELECT * FROM reading_questions`,
  // Account-owned item library. jlpt_level is kept verbatim: the data holds N1, N2-N1, unknown, ...
  // wordbook_id mirrors storage.itemWordbookId(): explicit wordbook_id, else legacy wordbook_ids[0],
  // else the built-in wordbook of the deck. tags_json is the raw JSON array ('[]' when absent).
  mcp_items: `
    SELECT
      r.id,
      (SELECT rr.prefix || '-' || printf('%06d', rr.number) FROM record_references rr WHERE rr.user_id=r.user_id AND rr.entity='item' AND rr.internal_id=r.id) AS reference,
      r.user_id,
      json_extract(r.item_json, '$.deck') AS deck,
      json_extract(r.item_json, '$.type') AS type,
      json_extract(r.item_json, '$.jlpt_level') AS jlpt_level,
      json_extract(r.item_json, '$.original') AS original,
      json_extract(r.item_json, '$.reading') AS reading,
      json_extract(r.item_json, '$.grammar_point') AS grammar_point,
      json_extract(r.item_json, '$.part_of_speech') AS part_of_speech,
      json_extract(r.item_json, '$.meaning_zh') AS meaning_zh,
      json_extract(r.item_json, '$.meaning_ja') AS meaning_ja,
      json_extract(r.item_json, '$.date') AS captured_on,
      COALESCE(
        NULLIF(TRIM(json_extract(r.item_json, '$.wordbook_id')), ''),
        NULLIF(TRIM(json_extract(r.item_json, '$.wordbook_ids[0]')), ''),
        json_extract(r.item_json, '$.deck')
      ) AS wordbook_id,
      COALESCE(json_extract(r.item_json, '$.tags'), '[]') AS tags_json,
      r.source,
      r.created_at,
      r.updated_at,
      r.item_json
    FROM (
      SELECT id, user_id, item_json, source, created_at, updated_at FROM owned_review_items
      UNION ALL
      SELECT id, user_id, item_json, 'import', NULL, NULL FROM user_review_items
    ) r`,
  // Every generated practice question (daily + topic practice), owned through its practice.
  mcp_questions: `
    SELECT
      json_extract(q.value, '$.id') AS id,
      (SELECT rr.prefix || '-' || printf('%06d', rr.number) FROM record_references rr WHERE rr.user_id=d.user_id AND rr.entity='question' AND rr.internal_id=json_extract(q.value, '$.id')) AS reference,
      d.user_id,
      d.id AS practice_id,
      d.practice_date,
      json_extract(q.value, '$.itemId') AS item_id,
      json_extract(q.value, '$.kind') AS kind,
      json_extract(q.value, '$.title') AS title,
      json_extract(q.value, '$.instruction') AS instruction,
      json_extract(q.value, '$.prompt') AS prompt,
      json_extract(q.value, '$.promptTarget') AS prompt_target,
      json_extract(q.value, '$.context') AS context,
      json_extract(q.value, '$.choices') AS choices_json,
      json_extract(q.value, '$.answer') AS answer,
      json_extract(q.value, '$.correctReason') AS correct_reason,
      json_extract(q.value, '$.memoryPoint') AS memory_point,
      json_extract(q.value, '$.choiceAnalysis') AS choice_analysis_json,
      json_extract(q.value, '$.translation_zh') AS translation_zh,
      d.created_at
    FROM daily_practices d, json_each(d.practice_json, '$.questions') q`,
  // One row per (user, question): re-answering the same question overwrites the row, so this is
  // the learner's latest answer per question, not a full event log.
  mcp_attempts: `
    SELECT
      a.user_id,
      a.question_id AS id,
      a.question_id,
      a.item_id,
      a.selected,
      CASE WHEN a.correct THEN 'correct' ELSE 'incorrect' END AS outcome,
      a.answered_at,
      COALESCE(q.kind,
        CASE
          WHEN a.question_id LIKE '%-kanji-to-kana-%' THEN 'kanji_to_kana'
          WHEN a.question_id LIKE '%-kana-to-kanji-%' THEN 'kana_to_kanji'
          WHEN a.question_id LIKE '%-moji-goi-%' THEN 'moji_goi'
          WHEN a.question_id LIKE '%-meaning-%' THEN 'meaning'
          WHEN a.question_id LIKE '%-grammar-%' THEN 'grammar'
        END) AS kind,
      q.practice_id,
      i.deck,
      i.wordbook_id,
      i.jlpt_level,
      i.original AS item_original
    FROM answers a
    LEFT JOIN mcp_questions q ON q.user_id = a.user_id AND q.id = a.question_id
    LEFT JOIN mcp_items i ON i.id = a.item_id AND i.user_id = a.user_id`,
  mcp_practice_sessions: `
    SELECT
      d.id,
      (SELECT rr.prefix || '-' || printf('%06d', rr.number) FROM record_references rr WHERE rr.user_id=d.user_id AND rr.entity='practice_session' AND rr.internal_id=d.id) AS reference,
      d.user_id,
      d.practice_date,
      d.version,
      d.title,
      d.minutes,
      json_extract(d.practice_json, '$.strategy') AS strategy,
      json_array_length(d.practice_json, '$.questions') AS question_count,
      d.created_at,
      d.updated_at
    FROM daily_practices d`,
};

// Tables whose writes must invalidate open cursors. practice_state is included because
// savePracticeState rewrites answers through it.
const revisionedTables = ['answers', 'daily_practices', 'owned_review_items', 'user_review_items', 'reading_questions'];

export function ensureQuerySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_read_revision (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL);
    INSERT OR IGNORE INTO mcp_read_revision (id, revision) VALUES (1, 0);
    CREATE INDEX IF NOT EXISTS answers_user_answered_at ON answers (user_id, answered_at, question_id);
  `);
  for (const table of revisionedTables) {
    for (const event of ['INSERT', 'UPDATE', 'DELETE']) {
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS mcp_rev_${table}_${event.toLowerCase()} AFTER ${event} ON ${table}
        BEGIN UPDATE mcp_read_revision SET revision = revision + 1 WHERE id = 1; END;
      `);
    }
  }
  for (const [name, body] of Object.entries(views)) {
    db.exec(`DROP VIEW IF EXISTS ${name}; CREATE VIEW ${name} AS ${body};`);
  }
}

export function readRevision(db) {
  return Number(db.prepare('SELECT revision FROM mcp_read_revision WHERE id = 1').get()?.revision ?? 0);
}
