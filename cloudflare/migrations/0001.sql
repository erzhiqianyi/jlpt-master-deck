-- Generated from a new, empty local database. No personal data.
CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

CREATE TABLE sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

CREATE TABLE user_settings (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        settings_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

CREATE TABLE answers (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        question_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        selected TEXT NOT NULL,
        correct INTEGER NOT NULL,
        answered_at TEXT NOT NULL,
        PRIMARY KEY (user_id, question_id)
      );

CREATE TABLE progress (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_id TEXT NOT NULL,
        progress_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, item_id)
      );

CREATE TABLE practice_state (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        attempt_history_json TEXT NOT NULL,
        active_attempt_json TEXT,
        updated_at TEXT NOT NULL
      );

CREATE TABLE review_pack_drafts (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        content_json TEXT NOT NULL,
        annotations_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

CREATE TABLE daily_practices (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        practice_date TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        title TEXT NOT NULL,
        minutes INTEGER NOT NULL,
        practice_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

CREATE TABLE listening_questions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        question_type_id TEXT NOT NULL DEFAULT 'listening-task',
        question TEXT NOT NULL,
        choices_json TEXT NOT NULL,
        answer_index INTEGER NOT NULL,
        explanation TEXT NOT NULL,
        audio_file_name TEXT NOT NULL,
        audio_mime TEXT NOT NULL,
        audio_size INTEGER NOT NULL,
        audio_path TEXT NOT NULL,
        created_at TEXT NOT NULL
      , library_number INTEGER, audio_asset_id TEXT);

CREATE TABLE listening_audio_assets (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        mime TEXT NOT NULL,
        size INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        audio_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(user_id, sha256)
      );

CREATE TABLE listening_recordings (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        listening_question_id TEXT NOT NULL REFERENCES listening_questions(id) ON DELETE CASCADE,
        audio_mime TEXT NOT NULL,
        audio_size INTEGER NOT NULL,
        audio_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        analysis_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

CREATE TABLE reading_questions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        passage TEXT NOT NULL,
        question TEXT NOT NULL,
        choices_json TEXT NOT NULL,
        answer_index INTEGER NOT NULL,
        explanation TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        explanation_nodes_json TEXT NOT NULL DEFAULT '[]',
        translation_lines_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      );

CREATE TABLE study_plans (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        plan_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

CREATE TABLE learning_captures (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        category TEXT NOT NULL,
        context TEXT NOT NULL,
        target_deck TEXT,
        target_wordbook_id TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

CREATE TABLE wordbooks (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        deck TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, title)
      );

CREATE TABLE wordbook_title_overrides (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        wordbook_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(user_id, wordbook_id),
        UNIQUE(user_id, title)
      );

CREATE TABLE review_items (
        id TEXT PRIMARY KEY,
        item_json TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'database',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

CREATE TABLE user_review_items (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        item_json TEXT NOT NULL
      );

CREATE TABLE owned_review_items (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      item_json TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'database',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, id)
    );

CREATE TABLE review_item_migrations (name TEXT PRIMARY KEY);

CREATE TABLE mcp_read_revision (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL);

CREATE TABLE market_shares (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), source_id TEXT NOT NULL, kind TEXT NOT NULL, package_json TEXT NOT NULL, created_at TEXT NOT NULL, withdrawn INTEGER NOT NULL DEFAULT 0);

CREATE TABLE market_imports (user_id INTEGER NOT NULL REFERENCES users(id), digest TEXT NOT NULL, result_json TEXT NOT NULL, PRIMARY KEY(user_id,digest));

CREATE TABLE agent_access_tokens (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, token_prefix TEXT NOT NULL, name TEXT NOT NULL, owner_uid TEXT NOT NULL, scopes TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT, revoked INTEGER NOT NULL DEFAULT 0, last_used_at TEXT, client_id TEXT, audience TEXT);

CREATE TABLE agent_clients (client_id TEXT PRIMARY KEY, client_secret_hash TEXT, client_name TEXT NOT NULL, redirect_uris TEXT NOT NULL, token_endpoint_auth_method TEXT NOT NULL, scope TEXT, created_at TEXT NOT NULL, last_used_at TEXT);

CREATE TABLE agent_codes (code_hash TEXT PRIMARY KEY, client_id TEXT NOT NULL, owner_uid TEXT NOT NULL, redirect_uri TEXT NOT NULL, scopes TEXT NOT NULL, code_challenge TEXT NOT NULL, resource TEXT, expires_at TEXT NOT NULL, used_at TEXT, issued_token_id TEXT);

CREATE TABLE agent_refresh_tokens (token_hash TEXT PRIMARY KEY, client_id TEXT NOT NULL, owner_uid TEXT NOT NULL, access_token_id TEXT NOT NULL, scopes TEXT NOT NULL, expires_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, successor_id TEXT);

CREATE TABLE firebase_identities (project_id TEXT NOT NULL, uid TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id), PRIMARY KEY(project_id,uid));

CREATE INDEX listening_recordings_user_status
      ON listening_recordings(user_id, status, created_at);

CREATE UNIQUE INDEX listening_questions_user_library_number ON listening_questions(user_id, library_number);

CREATE INDEX answers_user_answered_at ON answers (user_id, answered_at, question_id);

CREATE VIEW mcp_items AS
    SELECT
      r.id,
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
    ) r;

CREATE VIEW mcp_questions AS
    SELECT
      json_extract(q.value, '$.id') AS id,
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
    FROM daily_practices d, json_each(d.practice_json, '$.questions') q;

CREATE VIEW mcp_attempts AS
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
    LEFT JOIN mcp_items i ON i.id = a.item_id AND i.user_id = a.user_id;

CREATE VIEW mcp_practice_sessions AS
    SELECT
      d.id,
      d.user_id,
      d.practice_date,
      d.version,
      d.title,
      d.minutes,
      json_extract(d.practice_json, '$.strategy') AS strategy,
      json_array_length(d.practice_json, '$.questions') AS question_count,
      d.created_at,
      d.updated_at
    FROM daily_practices d;

CREATE TRIGGER mcp_rev_answers_insert AFTER INSERT ON answers
        BEGIN UPDATE mcp_read_revision SET revision = revision + 1 WHERE id = 1; END;

CREATE TRIGGER mcp_rev_answers_update AFTER UPDATE ON answers
        BEGIN UPDATE mcp_read_revision SET revision = revision + 1 WHERE id = 1; END;

CREATE TRIGGER mcp_rev_answers_delete AFTER DELETE ON answers
        BEGIN UPDATE mcp_read_revision SET revision = revision + 1 WHERE id = 1; END;

CREATE TRIGGER mcp_rev_daily_practices_insert AFTER INSERT ON daily_practices
        BEGIN UPDATE mcp_read_revision SET revision = revision + 1 WHERE id = 1; END;

CREATE TRIGGER mcp_rev_daily_practices_update AFTER UPDATE ON daily_practices
        BEGIN UPDATE mcp_read_revision SET revision = revision + 1 WHERE id = 1; END;

CREATE TRIGGER mcp_rev_daily_practices_delete AFTER DELETE ON daily_practices
        BEGIN UPDATE mcp_read_revision SET revision = revision + 1 WHERE id = 1; END;

CREATE TRIGGER mcp_rev_owned_review_items_insert AFTER INSERT ON owned_review_items
        BEGIN UPDATE mcp_read_revision SET revision = revision + 1 WHERE id = 1; END;

CREATE TRIGGER mcp_rev_owned_review_items_update AFTER UPDATE ON owned_review_items
        BEGIN UPDATE mcp_read_revision SET revision = revision + 1 WHERE id = 1; END;

CREATE TRIGGER mcp_rev_owned_review_items_delete AFTER DELETE ON owned_review_items
        BEGIN UPDATE mcp_read_revision SET revision = revision + 1 WHERE id = 1; END;

CREATE TRIGGER mcp_rev_user_review_items_insert AFTER INSERT ON user_review_items
        BEGIN UPDATE mcp_read_revision SET revision = revision + 1 WHERE id = 1; END;

CREATE TRIGGER mcp_rev_user_review_items_update AFTER UPDATE ON user_review_items
        BEGIN UPDATE mcp_read_revision SET revision = revision + 1 WHERE id = 1; END;

CREATE TRIGGER mcp_rev_user_review_items_delete AFTER DELETE ON user_review_items
        BEGIN UPDATE mcp_read_revision SET revision = revision + 1 WHERE id = 1; END;
INSERT OR IGNORE INTO mcp_read_revision(id,revision) VALUES(1,0);
