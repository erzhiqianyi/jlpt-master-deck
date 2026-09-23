import { normalizeReadingQuestion, readingPatchSchema } from './reading-schema.mjs';
import { currentPlatform, transaction } from './platform.mjs';
import { normalizePracticeExplanations, assertPracticeExplanations, isEmptyReason } from '../src/domain/practiceExplanations.mjs';
import { readingDistractors, describeReadingConfusion } from '../src/domain/readingDistractors.mjs';
import { progressAfterAnswer } from '../src/domain/srs.mjs';
import { restorePracticeName } from './practice-names.mjs';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from './files.mjs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { migrateReviewItemOwnership } from './review-item-ownership.mjs';
import { ensureReferenceSchema, decorateReferences } from './references.mjs';
import { ensureQuerySchema } from './mcp-query-schema.mjs';
import { withSqlVariableLimit } from './sql-limits.mjs';
import { canonicalizeItemFields, ensureItemSchema, normalizeItemImages, patternTexts, MAX_ITEM_IMAGES } from './item-schema.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localDir = resolve(rootDir, '.local');
const dbPath = process.env.JLPT_DB_PATH ? resolve(process.env.JLPT_DB_PATH) : join(localDir, 'jlpt.sqlite');
const dataRoot = process.env.JLPT_REVIEW_DATA_PATH
  ? resolve(process.env.JLPT_REVIEW_DATA_PATH)
  : join(rootDir, 'public', 'data', 'review-data');
const legacyDataPath = join(rootDir, 'public', 'data', 'review-data.json');

// Keep in sync with src/domain/memoryCards.ts.
const memoryCardFields = new Set([
  'original', 'reading', 'jlpt_level', 'part_of_speech', 'meaning', 'meaning_ja', 'core_memory', 'explanation',
  'patterns', 'points', 'comparisons', 'register', 'conjugations', 'examples', 'images', 'notes', 'tags', 'source',
]);
// Card fields named after the pre-unification item fields.
const legacyMemoryCardFields = {
  explanation_zh: 'explanation', analysis: 'explanation', usage_notes: 'explanation',
  grammar_forms: 'patterns', collocations: 'patterns', formation: 'patterns', source_grammar_point: 'patterns',
  grammar_features: 'points', everyday_alternatives: 'comparisons',
  usage_register: 'register', exam_register_zh: 'register', base_form: 'conjugations', source_chat_summary: 'source',
};
const memoryCardFieldsVersion = 2;
const defaultMemoryCardFrontFields = ['original'];
const defaultMemoryCardBackFields = ['original', 'reading', 'images', 'patterns', 'meaning', 'examples', 'core_memory'];
const memoryCardFrontCompatKey = '_memory_card_front_fields';
const memoryCardBackCompatKey = '_memory_card_back_fields';

const defaultSettings = {
  showReviewRuby: true,
  showExplanationRuby: true,
  locale: 'zh-CN',
  fontSize: 'standard',
  memoryCardFrontFields: defaultMemoryCardFrontFields,
  memoryCardBackFields: defaultMemoryCardBackFields,
  memoryCardFieldsVersion,
  feedbackMode: 'immediate',
  questionTypeTips: {},
  customQuestionTypeTips: [],
};

const listeningQuestionTypeIds = new Set([
  'listening-task',
  'listening-points',
  'listening-outline',
  'listening-quick',
  'listening-integrated',
  'listening-basic-training',
]);
const defaultListeningQuestionTypeId = 'listening-task';

let db;

export function databasePath() {
  return dbPath;
}

export function reviewDataPath() {
  return dataRoot;
}

export function getDb() {
  if (currentPlatform()?.db) return currentPlatform().db;
  if (!db) {
    mkdirSync(localDir, { recursive: true });
    db = withSqlVariableLimit(new DatabaseSync(dbPath));
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        settings_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS answers (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        question_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        selected TEXT NOT NULL,
        correct INTEGER NOT NULL,
        answered_at TEXT NOT NULL,
        PRIMARY KEY (user_id, question_id)
      );

      CREATE TABLE IF NOT EXISTS progress (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_id TEXT NOT NULL,
        progress_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, item_id)
      );

      CREATE TABLE IF NOT EXISTS practice_state (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        attempt_history_json TEXT NOT NULL,
        active_attempt_json TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS review_pack_drafts (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        content_json TEXT NOT NULL,
        annotations_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS daily_practices (
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

      CREATE TABLE IF NOT EXISTS listening_questions (
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
      );

      CREATE TABLE IF NOT EXISTS listening_audio_assets (
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

      CREATE TABLE IF NOT EXISTS listening_recordings (
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

      CREATE INDEX IF NOT EXISTS listening_recordings_user_status
      ON listening_recordings(user_id, status, created_at);

      CREATE TABLE IF NOT EXISTS reading_questions (
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

      CREATE TABLE IF NOT EXISTS study_plans (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        plan_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS learning_captures (
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

      CREATE TABLE IF NOT EXISTS wordbooks (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        deck TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, title)
      );

      CREATE TABLE IF NOT EXISTS wordbook_title_overrides (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        wordbook_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(user_id, wordbook_id),
        UNIQUE(user_id, title)
      );

      CREATE TABLE IF NOT EXISTS review_items (
        id TEXT PRIMARY KEY,
        item_json TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'database',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_review_items (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        item_json TEXT NOT NULL
      );
    `);
    ensureColumn('listening_questions', 'question_type_id', "TEXT NOT NULL DEFAULT 'listening-task'");
    ensureColumn('listening_questions', 'library_number', 'INTEGER');
    ensureColumn('listening_questions', 'audio_asset_id', 'TEXT');
    migrateListeningAudioAssets();
    ensureListeningLibraryNumbers();
    ensureColumn('learning_captures', 'target_deck', 'TEXT');
    ensureColumn('learning_captures', 'target_wordbook_id', 'TEXT');
    ensureColumn('reading_questions', 'tags_json', "TEXT NOT NULL DEFAULT '[]'");
    ensureColumn('reading_questions', 'explanation_nodes_json', "TEXT NOT NULL DEFAULT '[]'");
    ensureColumn('reading_questions', 'translation_lines_json', "TEXT NOT NULL DEFAULT '[]'");
    ensureColumn('reading_questions', 'passage_translation', "TEXT NOT NULL DEFAULT ''");
    ensureColumn('reading_questions', 'choice_explanations_json', "TEXT NOT NULL DEFAULT '[]'");
    ensureColumn('reading_questions', 'reading_analysis_json', "TEXT NOT NULL DEFAULT '{}'");
    ensureDailyPracticesMultiVersion();
    ensureReviewItemsSeeded();
    migrateCanonicalReviewItems();
    migrateMemoryCardSettings();
    transaction(db, () => migrateReviewItemOwnership(db));
    ensureItemSchema(db, { beforeMigrate: backupDatabase, inTransaction: (run) => transaction(db, run) });
    ensureQuerySchema(db);
    ensureReferenceSchema(db);
  }
  return db;
}

function backupDatabase() {
  const hasItems = ['review_items', 'owned_review_items', 'user_review_items']
    .some((table) => db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table) && db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get());
  if (!hasItems) return;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
  const target = join(dirname(dbPath), 'backups', `jlpt-before-unified-item-fields-${stamp}-${randomBytes(3).toString('hex')}.sqlite`);
  mkdirSync(dirname(target), { recursive: true });
  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
}

function migrateListeningAudioAssets() {
  const rows = db.prepare(`SELECT id, user_id, audio_file_name, audio_mime, audio_size, audio_path, created_at FROM listening_questions WHERE audio_asset_id IS NULL`).all();
  for (const row of rows) {
    const assetId = randomBytes(12).toString('base64url');
    const sha256 = `legacy:${row.audio_path}`;
    db.prepare(`INSERT OR IGNORE INTO listening_audio_assets (id, user_id, file_name, mime, size, sha256, audio_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(assetId, row.user_id, row.audio_file_name, row.audio_mime, row.audio_size, sha256, row.audio_path, row.created_at);
    const asset = db.prepare('SELECT id FROM listening_audio_assets WHERE user_id = ? AND sha256 = ?').get(row.user_id, sha256);
    db.prepare('UPDATE listening_questions SET audio_asset_id = ? WHERE id = ?').run(asset.id, row.id);
  }
}

function ensureColumn(table, column, definition) {
  const hasColumn = db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
  if (!hasColumn) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function ensureListeningLibraryNumbers() {
  const database = db;
  const missingRows = database.prepare(`
    SELECT id, user_id
    FROM listening_questions
    WHERE library_number IS NULL
    ORDER BY user_id, created_at, rowid
  `).all();
  const nextNumberByUser = new Map();
  const maxNumber = database.prepare(`
    SELECT COALESCE(MAX(library_number), 0) AS value
    FROM listening_questions
    WHERE user_id = ?
  `);
  const assignNumber = database.prepare('UPDATE listening_questions SET library_number = ? WHERE id = ?');
  transaction(database, () => {
    for (const row of missingRows) {
      const current = nextNumberByUser.get(row.user_id) ?? Number(maxNumber.get(row.user_id).value);
      const next = current + 1;
      assignNumber.run(next, row.id);
      nextNumberByUser.set(row.user_id, next);
    }
    database.exec('CREATE UNIQUE INDEX IF NOT EXISTS listening_questions_user_library_number ON listening_questions(user_id, library_number)');
  });
}

function ensureDailyPracticesMultiVersion() {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'daily_practices'").get();
  if (!table) return;
  const hasUniqueDate = /UNIQUE\s*\(\s*user_id\s*,\s*practice_date\s*\)/iu.test(String(table.sql ?? ''));
  if (!hasUniqueDate) {
    ensureColumn('daily_practices', 'version', 'INTEGER NOT NULL DEFAULT 1');
    return;
  }
  db.exec(`
    ALTER TABLE daily_practices RENAME TO daily_practices_legacy;
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
    INSERT INTO daily_practices (id, user_id, practice_date, version, title, minutes, practice_json, created_at, updated_at)
    SELECT id, user_id, practice_date, 1, title, minutes, practice_json, created_at, updated_at
    FROM daily_practices_legacy;
    DROP TABLE daily_practices_legacy;
  `);
}

export function loadReviewData(userId) {
  const rows = getDb()
    .prepare(userId == null ? 'SELECT item_json, updated_at FROM review_items' : 'SELECT item_json, updated_at FROM owned_review_items WHERE user_id = ?')
    .all(...(userId == null ? [] : [userId]));
  let items = rows
    .map((row) => normalizeStoredReviewItem(JSON.parse(row.item_json)))
    .sort((a, b) => (a.input_at ?? '').localeCompare(b.input_at ?? '') || a.id.localeCompare(b.id));
  if (userId != null) {
    const books = new Set(listWordbooks(userId).map((book) => book.id));
    items = items.filter((item) => !item.wordbook_id?.startsWith('wordbook-') || books.has(item.wordbook_id));
    getDb().exec('CREATE TABLE IF NOT EXISTS user_review_items (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), item_json TEXT NOT NULL)');
    items.push(...getDb().prepare('SELECT item_json FROM user_review_items WHERE user_id = ?').all(userId).map((row) => normalizeStoredReviewItem(JSON.parse(row.item_json))));
  }
  const generatedAt = rows
    .map((row) => row.updated_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? new Date().toISOString();
  const files = reviewDataFiles();
  return {
    generated_at: generatedAt,
    data_source: currentPlatform()?.dataSource ?? 'sqlite',
    export_backup_root: dataRoot,
    export_backup_files: files.map((file) => file.replace(`${rootDir}/`, '')),
    items,
  };
}

function ensureReviewItemsSeeded() {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM review_items').get();
  if (existing.count > 0) {
    return;
  }
  const files = reviewDataFiles();
  if (!files.length) {
    return;
  }
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO review_items (id, item_json, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      item_json = excluded.item_json,
      source = excluded.source,
      updated_at = excluded.updated_at
  `);
  for (const file of files) {
    const archive = JSON.parse(readFileSync(file, 'utf8'));
    const source = file.replace(`${rootDir}/`, '');
    for (const item of archive.items ?? []) {
      // Older exported seed items sometimes copied meaning_ja into paraphrase_ja.
      // Keep those items importable, but do not expose an invalid meaning question.
      const hasDuplicateMeaningParaphrase = Array.isArray(item.question_kinds)
        && item.question_kinds.includes('meaning')
        && String(item.meaning_ja ?? '').trim()
        && String(item.meaning_ja ?? '').trim() === String(item.paraphrase_ja ?? '').trim();
      const seedItem = hasDuplicateMeaningParaphrase
        ? { ...item, question_kinds: item.question_kinds.filter((kind) => kind !== 'meaning') }
        : item;
      const normalized = normalizeReviewItem(seedItem);
      insert.run(normalized.id, JSON.stringify(normalized), `json-backup:${source}`, now, now);
    }
  }
}

export function upsertReviewItem(item, { source = 'mcp', userId } = {}) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('Authenticated user required');
  const normalized = normalizeReviewItem(item);
  if (normalized.deck !== 'grammar_expression') assertVocabSeeds(normalized.practice_questions);
  const now = new Date().toISOString();
  const existing = getDb().prepare('SELECT created_at, user_id FROM owned_review_items WHERE id = ? AND user_id = ?').get(normalized.id, userId);
  const book = wordbookById(userId, itemWordbookId(normalized));
  if (!book) throw new Error('Wordbook not found');
  const imported = getDb().prepare('SELECT user_id FROM user_review_items WHERE id = ? AND user_id = ?').get(normalized.id, userId);
  if (imported) {
    getDb().prepare('UPDATE user_review_items SET item_json = ? WHERE id = ? AND user_id = ?').run(JSON.stringify(normalized), normalized.id, userId);
    return normalized;
  }
  getDb()
    .prepare(`
      INSERT INTO owned_review_items (id, item_json, source, created_at, updated_at, user_id)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, id) DO UPDATE SET
        item_json = excluded.item_json,
        source = excluded.source,
        updated_at = excluded.updated_at
    `)
    .run(normalized.id, JSON.stringify(normalized), String(source).slice(0, 120), existing?.created_at ?? now, now, userId);
  return reviewItemById(normalized.id, userId);
}

export function reviewItemById(id, userId) {
  const row = getDb().prepare('SELECT item_json FROM owned_review_items WHERE id = ? AND user_id = ?').get(id, userId);
  return row ? JSON.parse(row.item_json) : null;
}

const itemImageTypes = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_ITEM_IMAGE_BYTES = 5 * 1024 * 1024;

// Only raster formats whose bytes match the declared type; SVG could carry script.
function imageBytesMatch(mime, bytes) {
  const ascii = (start, end) => bytes.subarray(start, end).toString('latin1');
  if (mime === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/gif') return ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a';
  if (mime === 'image/webp') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  return false;
}

function ownedItemRow(userId, itemId) {
  const database = getDb();
  const owned = database.prepare('SELECT item_json FROM owned_review_items WHERE id = ? AND user_id = ?').get(itemId, userId);
  const imported = owned ? null : database.prepare('SELECT item_json FROM user_review_items WHERE id = ? AND user_id = ?').get(itemId, userId);
  const row = owned ?? imported;
  return row ? { item: normalizeStoredReviewItem(JSON.parse(row.item_json)), owned: Boolean(owned) } : null;
}

function saveOwnedItem(userId, { item, owned }) {
  const database = getDb();
  if (owned) {
    database.prepare('UPDATE owned_review_items SET item_json = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(JSON.stringify(item), new Date().toISOString(), item.id, userId);
  } else {
    database.prepare('UPDATE user_review_items SET item_json = ? WHERE id = ? AND user_id = ?').run(JSON.stringify(item), item.id, userId);
  }
  return item;
}

/** Attach an uploaded memory image (base64) or an https image URL to one of the learner's items. */
export function addReviewItemImage(userId, itemId, payload = {}) {
  const found = ownedItemRow(userId, String(itemId ?? '').trim());
  if (!found) return null;
  const images = found.item.images ?? [];
  if (images.length >= MAX_ITEM_IMAGES) throw new Error(`Each entry can hold at most ${MAX_ITEM_IMAGES} images`);
  const caption = String(payload.caption ?? '').trim().slice(0, 120);
  const url = String(payload.url ?? '').trim();
  if (url) {
    const [image] = normalizeItemImages([{ url, caption }]);
    if (!image) throw new Error('Image URL must start with https://');
    found.item.images = normalizeItemImages([...images, image]);
    return saveOwnedItem(userId, found);
  }
  const mime = String(payload.mime ?? '').toLowerCase();
  const base64 = String(payload.imageBase64 ?? '').replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  if (!itemImageTypes[mime]) throw new Error('Images must be PNG, JPEG, WebP or GIF');
  if (!base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('Invalid image data');
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > MAX_ITEM_IMAGE_BYTES) throw new Error('Image must be 5 MB or smaller');
  if (!imageBytesMatch(mime, bytes)) throw new Error('Image content does not match its file type');

  const database = getDb();
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  let asset = database.prepare('SELECT id FROM item_images WHERE user_id = ? AND sha256 = ?').get(userId, sha256);
  let writtenPath = '';
  if (!asset) {
    const id = randomBytes(12).toString('base64url');
    // Beside the database, so a JLPT_DB_PATH elsewhere keeps its images with it.
    const dir = join(dirname(dbPath), 'item-images', String(userId));
    writtenPath = join(dir, `${id}.${itemImageTypes[mime]}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(writtenPath, bytes, { flag: 'wx' });
    asset = { id };
  }
  try {
    return transaction(database, () => {
      if (writtenPath) {
        database.prepare('INSERT INTO item_images (id, user_id, mime, size, sha256, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(asset.id, userId, mime, bytes.length, sha256, writtenPath, new Date().toISOString());
      }
      found.item.images = normalizeItemImages([...images, { id: asset.id, caption }]);
      return saveOwnedItem(userId, found);
    });
  } catch (error) {
    if (writtenPath && existsSync(writtenPath)) unlinkSync(writtenPath);
    throw error;
  }
}

/** Detach one image (by asset id or URL); the file goes once no other entry uses it. */
export function removeReviewItemImage(userId, itemId, imageKey) {
  const found = ownedItemRow(userId, String(itemId ?? '').trim());
  if (!found) return null;
  const key = String(imageKey ?? '');
  found.item.images = (found.item.images ?? []).filter((image) => image.id !== key && image.url !== key);
  if (!found.item.images.length) delete found.item.images;
  const database = getDb();
  return transaction(database, () => {
    saveOwnedItem(userId, found);
    const asset = database.prepare('SELECT image_path FROM item_images WHERE id = ? AND user_id = ?').get(key, userId);
    const stillUsed = asset && [
      ...database.prepare('SELECT item_json FROM owned_review_items WHERE user_id = ?').all(userId),
      ...database.prepare('SELECT item_json FROM user_review_items WHERE user_id = ?').all(userId),
    ].some((row) => (JSON.parse(row.item_json).images ?? []).some((image) => image?.id === key));
    if (asset && !stillUsed) {
      database.prepare('DELETE FROM item_images WHERE id = ? AND user_id = ?').run(key, userId);
      if (existsSync(asset.image_path)) unlinkSync(asset.image_path);
    }
    return found.item;
  });
}

export function itemImageForUser(userId, imageId) {
  const row = getDb().prepare('SELECT image_path, mime, size FROM item_images WHERE id = ? AND user_id = ?').get(String(imageId ?? ''), userId);
  return row && existsSync(row.image_path) ? row : null;
}

/** Move an item into another wordbook of the same family and/or replace its tags. */
export function organizeReviewItem(userId, id, { wordbookId, tags } = {}) {
  const itemId = String(id ?? '').trim();
  const database = getDb();
  const stored = database.prepare('SELECT item_json FROM owned_review_items WHERE id = ? AND user_id = ?').get(itemId, userId);
  const own = stored ? null : database.prepare('SELECT item_json FROM user_review_items WHERE id = ? AND user_id = ?').get(itemId, userId);
  const row = stored ?? own;
  if (!row) return null;
  const item = normalizeStoredReviewItem(JSON.parse(row.item_json));
  if (wordbookId !== undefined) {
    const target = wordbookById(userId, String(wordbookId ?? '').trim());
    if (!target) throw new Error('Wordbook not found');
    if ((target.deck === 'grammar_expression') !== (item.deck === 'grammar_expression')) {
      throw new Error('An entry can only be moved to a wordbook of the same kind');
    }
    item.wordbook_id = target.id;
  }
  if (tags !== undefined) item.tags = normalizeTags(tags);
  const now = new Date().toISOString();
  if (stored) {
    database.prepare('UPDATE owned_review_items SET item_json = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(JSON.stringify(item), now, itemId, userId);
  } else {
    database.prepare('UPDATE user_review_items SET item_json = ? WHERE id = ? AND user_id = ?').run(JSON.stringify(item), itemId, userId);
  }
  return item;
}

export function exportReviewDataBackup(userId) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('Authenticated user required');
  const data = decorateReferences(getDb(), userId, loadReviewData(userId));
  const byMonth = new Map();
  for (const item of data.items) {
    const day = String(item.input_at ?? '').slice(0, 10);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : new Date().toISOString().slice(0, 10);
    const [year, month] = date.split('-');
    const key = `${year}/${month}`;
    const list = byMonth.get(key) ?? [];
    list.push(item);
    byMonth.set(key, list);
  }
  const files = [];
  for (const [key, items] of byMonth) {
    const [year, month] = key.split('/');
    const file = join(localDir, 'review-backups', String(userId), year, `${month}.json`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify({
      generated_at: new Date().toISOString(),
      archive_month: key,
      data_source: 'sqlite-export',
      reference_scope: 'source-database; full database backup required to restore numbering',
      items,
      daily_packs: [],
    }, null, 2)}\n`);
    files.push(file.replace(`${rootDir}/`, ''));
  }
  return { exported_at: new Date().toISOString(), files, item_count: data.items.length };
}

function normalizeReviewItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error('Review item must be an object');
  }
  const id = String(item.id ?? '').trim();
  const submittedOriginal = String(item.original ?? '').trim();
  const deck = String(item.deck ?? '').trim();
  const type = String(item.type ?? '').trim();
  if (!id || !submittedOriginal || !deck || !type) {
    throw new Error('Review item requires id, deck, type, and original');
  }
  if (!['n1_vocab', 'name_reading', 'grammar_expression'].includes(deck)) {
    throw new Error('Invalid review item deck');
  }
  const submittedNormalized = String(item.normalized ?? '').trim();
  const original = deck === 'grammar_expression'
    ? submittedOriginal
    : submittedNormalized || submittedOriginal;
  const canonicalItem = { ...canonicalizeItemFields(item), ...normalizeItemOrganization(item) };
  const examples = Array.isArray(item.examples)
    ? item.examples.filter((example) => String(example?.ja ?? '').trim())
    : [];
  if (deck === 'n1_vocab' && type !== 'proper_name' && examples.length < 2) {
    throw new Error('Vocabulary review items require at least two Japanese example sentences');
  }
  if (deck === 'n1_vocab' && type !== 'proper_name' && examples.some((example) => !String(example?.zh ?? '').trim())) {
    throw new Error('Every vocabulary example sentence requires a Chinese translation');
  }
  if (deck === 'n1_vocab' && type !== 'proper_name' && examples.every((example) => isMetaStudySentence(example?.ja))) {
    throw new Error('Vocabulary review items require a natural usage context, not only a sentence saying the expression was studied');
  }
  const meaningJa = String(item.meaning_ja ?? '').trim();
  const paraphraseJa = String(item.paraphrase_ja ?? '').trim();
  const questionKinds = Array.isArray(item.question_kinds) ? item.question_kinds : [];
  if (questionKinds.includes('meaning') && meaningJa && meaningJa === paraphraseJa) {
    throw new Error('Meaning questions require paraphrase_ja to be a distinct concise paraphrase, not a duplicate of meaning_ja');
  }
  const partOfSpeech = String(item.part_of_speech ?? '').trim();
  if (deck === 'n1_vocab' && type !== 'proper_name' && /^(?:語句|语句|詞語|词语|word|expression)$/iu.test(partOfSpeech)) {
    throw new Error('Vocabulary review items require a specific part_of_speech such as 名詞, 動詞, 形容詞, or a precise phrase category');
  }
  const needsConjugations = /(?:动词|動詞|verb|形容词|形容詞|adjective)/iu.test(`${type} ${partOfSpeech}`);
  const inflectionClass = String(item.inflection_class ?? '').trim();
  const baseForm = String(canonicalItem.base_form ?? '').trim();
  const validInflectionClasses = new Set(['godan', 'ichidan', 'suru', 'kuru', 'i_adjective', 'na_adjective']);
  const conjugations = Array.isArray(item.conjugations)
    ? item.conjugations.filter((entry) => String(entry?.kind ?? '').trim() && String(entry?.form ?? '').trim())
    : [];
  if (needsConjugations && !partOfSpeech) {
    throw new Error('Verb and adjective review items require part_of_speech');
  }
  if (needsConjugations && !validInflectionClasses.has(inflectionClass)) {
    throw new Error('Verb and adjective review items require a valid inflection_class');
  }
  if (needsConjugations && !baseForm && !String(item.base_form ?? item.dictionary_form ?? '').trim()) {
    throw new Error('Verb and adjective review items require base_form');
  }
  if (needsConjugations && conjugations.length < 3) {
    throw new Error('Verb and adjective review items require at least three conjugation forms');
  }
  return {
    ...canonicalItem,
    id,
    deck,
    type,
    original,
    examples,
    part_of_speech: partOfSpeech || undefined,
    inflection_class: inflectionClass || undefined,
    base_form: baseForm && baseForm !== original ? baseForm : undefined,
    conjugations: conjugations.length ? conjugations : undefined,
    meaning_zh: String(item.meaning_zh ?? item.meaning ?? '').trim(),
    meaning_ja: meaningJa || undefined,
    paraphrase_ja: paraphraseJa || undefined,
    core_memory: String(item.core_memory ?? '').trim(),
  };
}

function migrateCanonicalReviewItems() {
  const rows = db.prepare('SELECT id, item_json FROM review_items').all();
  if (!rows.length) return;
  const update = db.prepare('UPDATE review_items SET item_json = ?, updated_at = ? WHERE id = ?');
  const now = new Date().toISOString();
  transaction(db, () => {
    for (const row of rows) {
      const current = JSON.parse(row.item_json);
      const canonical = normalizeStoredReviewItem(current);
      const legacyNormalized = String(current.normalized ?? '').trim();
      if (canonical.deck !== 'grammar_expression' && legacyNormalized) {
        canonical.original = legacyNormalized;
      }
      const nextJson = JSON.stringify(canonical);
      if (nextJson !== row.item_json) {
        update.run(nextJson, now, row.id);
      }
    }
  });
}

function normalizeStoredReviewItem(item) {
  return {
    ...canonicalizeItemFields(item),
    ...normalizeItemOrganization(item),
  };
}

// An item lives in exactly one wordbook (legacy rows carried a wordbook_ids array; the
// first entry wins) and can carry any number of tags.
function normalizeItemOrganization(item) {
  const legacy = Array.isArray(item?.wordbook_ids) ? item.wordbook_ids : [];
  const wordbookId = String(item?.wordbook_id ?? legacy[0] ?? '').trim();
  const organized = { tags: normalizeTags(item?.tags) };
  if (wordbookId) organized.wordbook_id = wordbookId;
  return organized;
}

export function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((tag) => String(tag ?? '').trim().slice(0, 40)).filter(Boolean))];
}

/** The wordbook an item is filed in: its own wordbook_id, or the built-in one of its deck. */
export function itemWordbookId(item) {
  return item?.wordbook_id || item?.deck;
}

function migrateMemoryCardSettings() {
  const rows = db.prepare('SELECT user_id, settings_json FROM user_settings').all();
  const update = db.prepare('UPDATE user_settings SET settings_json = ?, updated_at = ? WHERE user_id = ?');
  const now = new Date().toISOString();
  for (const row of rows) {
    const current = JSON.parse(row.settings_json);
    const canonical = normalizeSettings(current);
    const nextJson = JSON.stringify(canonical);
    if (nextJson !== row.settings_json) {
      update.run(nextJson, now, row.user_id);
    }
  }
}

function reviewDataFiles() {
  if (existsSync(dataRoot) && statSync(dataRoot).isFile()) {
    return [dataRoot];
  }
  if (existsSync(dataRoot) && statSync(dataRoot).isDirectory()) {
    return walkJsonFiles(dataRoot);
  }
  if (existsSync(legacyDataPath)) {
    return [legacyDataPath];
  }
  return [];
}

function walkJsonFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return walkJsonFiles(path);
      }
      return entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
    })
    .sort();
}

export function createUser(username, password) {
  const name = normalizeUsername(username);
  validatePassword(password);
  const now = new Date().toISOString();
  const salt = randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const result = getDb()
    .prepare('INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)')
    .run(name, passwordHash, salt, now);
  const user = { id: Number(result.lastInsertRowid), username: name };
  ensureSettings(user.id);
  return user;
}

export function loginUser(username, password) {
  const name = normalizeUsername(username);
  const row = getDb()
    .prepare('SELECT id, username, password_hash, salt FROM users WHERE username = ?')
    .get(name);
  if (!row || !verifyPassword(password, row.salt, row.password_hash)) {
    return null;
  }
  const token = randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  getDb()
    .prepare('INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)')
    .run(token, row.id, now, now);
  ensureSettings(row.id);
  return { token, user: { id: row.id, username: row.username } };
}

/** Existence check for a grant's owner; the agent's user may have been deleted since consent. */
export function userById(id) {
  const row = getDb().prepare('SELECT id, username FROM users WHERE id = ?').get(Number(id));
  return row ? { id: row.id, username: row.username } : null;
}

export function userForToken(token) {
  if (!token) {
    return null;
  }
  const row = getDb()
    .prepare(`
      SELECT users.id, users.username
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token = ?
    `)
    .get(token);
  if (!row) {
    return null;
  }
  getDb().prepare('UPDATE sessions SET last_seen_at = ? WHERE token = ?').run(new Date().toISOString(), token);
  return { id: row.id, username: row.username };
}

export function deleteSession(token) {
  if (token) {
    getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
}

export function findListeningAudioQuestions(userId, hash) {
  const assets = getDb().prepare('SELECT id, sha256, audio_path FROM listening_audio_assets WHERE user_id = ?').all(userId);
  const ids = new Set(assets.filter((asset) => asset.sha256 === hash ||
    (asset.sha256.startsWith('legacy:') && existsSync(asset.audio_path) && createHash('sha256').update(readFileSync(asset.audio_path)).digest('hex') === hash)).map((asset) => asset.id));
  return listListeningQuestions(userId).filter((item) => ids.has(item.audioAssetId)).sort((a, b) => a.libraryNumber - b.libraryNumber);
}

export function createListeningQuestion(userId, payload) {
  const question = String(payload?.question ?? '').trim();
  const questionTypeId = normalizeListeningQuestionTypeId(payload?.questionTypeId);
  const rawChoices = Array.isArray(payload?.choices)
    ? payload.choices.map((choice) => String(choice ?? '').trim())
    : [];
  // 基础训练 questions can be fill-in-the-blank items with fewer than four
  // options (or none at all, i.e. a genuine free-response fill-in-the-blank),
  // so trailing blank option fields are dropped instead of forcing a full
  // set of four.
  const flexibleChoiceCountTypes = ['listening-basic-training'];
  const choices = flexibleChoiceCountTypes.includes(questionTypeId)
    ? (() => {
        const trimmed = [...rawChoices];
        while (trimmed.length > 0 && !trimmed[trimmed.length - 1]) trimmed.pop();
        return trimmed;
      })()
    : rawChoices;
  const answerIndex = Number(payload?.answerIndex);
  const audioMime = String(payload?.audioMime ?? '').toLowerCase();
  const audioFileName = String(payload?.audioFileName ?? 'listening-audio').trim().slice(0, 180);
  const audioBase64 = String(payload?.audioBase64 ?? '').replace(/\s/g, '');
  const emptyChoices = choices.every((choice) => !choice);
  const freeResponse = false;
  const isFreeResponseSubmission = flexibleChoiceCountTypes.includes(questionTypeId) && choices.length === 0;
  const choicesOptional = emptyChoices && ['listening-outline', 'listening-quick', 'listening-integrated', ...flexibleChoiceCountTypes].includes(questionTypeId);
  const validChoiceCount = flexibleChoiceCountTypes.includes(questionTypeId)
    ? choices.length === 0 || (choices.length >= 2 && choices.length <= 4)
    : [3, 4].includes(choices.length);
  if (!question || (!freeResponse && !choicesOptional && !validChoiceCount) || (!freeResponse && !choicesOptional && choices.some((choice) => !choice))) {
    throw new Error('Question requires two to four non-empty choices, or empty choices for free response');
  }
  if (!Number.isInteger(answerIndex) || ((freeResponse || isFreeResponseSubmission) ? answerIndex !== -1 : answerIndex < 0 || answerIndex >= choices.length)) {
    throw new Error('Choose a valid correct answer');
  }
  if (!audioMime.startsWith('audio/') || !audioBase64) {
    throw new Error('A valid audio file is required');
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(audioBase64)) {
    throw new Error('Invalid audio data');
  }
  const audio = Buffer.from(audioBase64, 'base64');
  if (!audio.length || audio.length > 25 * 1024 * 1024) {
    throw new Error('Audio file must be 25 MB or smaller');
  }

  const id = randomBytes(12).toString('base64url');
  const audioHash = createHash('sha256').update(audio).digest('hex');
  if (payload.existingQuestionId) {
    const existing = findListeningAudioQuestions(userId, audioHash).find((item) => item.id === payload.existingQuestionId);
    if (!existing) throw new Error('Question does not belong to this audio');
    getDb().prepare('UPDATE listening_questions SET title=?, question_type_id=?, question=?, choices_json=?, answer_index=?, explanation=? WHERE user_id=? AND id=?')
      .run(String(payload.title || existing.title).slice(0,120), questionTypeId, question, JSON.stringify(choices), answerIndex, String(payload.explanation ?? '').slice(0,2000), userId, existing.id);
    return listeningQuestionForUser(userId, existing.id);
  }
  const existingAsset = getDb().prepare('SELECT id, audio_path, file_name, mime, size FROM listening_audio_assets WHERE user_id = ? AND sha256 = ?').get(userId, audioHash);
  const assetId = existingAsset?.id ?? randomBytes(12).toString('base64url');
  const userAudioDir = join(localDir, 'listening-audio', String(userId));
  const extension = audioExtension(audioMime);
  const audioPath = join(userAudioDir, `${id}.${extension}`);
  const now = new Date().toISOString();
  const title = String(payload?.title ?? '').trim().slice(0, 120) || question.slice(0, 120);
  const explanation = String(payload?.explanation ?? '').trim().slice(0, 2000);
  if (!existingAsset) {
    mkdirSync(userAudioDir, { recursive: true });
    writeFileSync(audioPath, audio, { flag: 'wx' });
  }
  const storedAudioPath = existingAsset?.audio_path ?? audioPath;
  const storedAudioFileName = existingAsset?.file_name ?? audioFileName;
  const storedAudioMime = existingAsset?.mime ?? audioMime;
  const storedAudioSize = existingAsset?.size ?? audio.length;
  const database = getDb();
  try {
    transaction(database, () => {
      const libraryNumber = Number(database.prepare(`
        SELECT COALESCE(MAX(library_number), 0) + 1 AS value
        FROM listening_questions
        WHERE user_id = ?
      `).get(userId).value);
      database.prepare(`
        INSERT INTO listening_questions (
          id, user_id, library_number, title, question_type_id, question, choices_json, answer_index, explanation,
          audio_file_name, audio_mime, audio_size, audio_path, audio_asset_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, userId, libraryNumber, title, questionTypeId, question, JSON.stringify(choices), answerIndex, explanation,
        storedAudioFileName, storedAudioMime, storedAudioSize, storedAudioPath, assetId, now,
      );
      if (!existingAsset) {
        database.prepare(`INSERT INTO listening_audio_assets (id, user_id, file_name, mime, size, sha256, audio_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(assetId, userId, storedAudioFileName, storedAudioMime, storedAudioSize, audioHash, storedAudioPath, now);
      }
    });
  } catch (error) {
    if (!existingAsset && existsSync(audioPath)) unlinkSync(audioPath);
    throw error;
  }
  return listeningQuestionForUser(userId, id);
}

export function listListeningQuestions(userId) {
  return getDb().prepare(`
    SELECT id, library_number, title, question_type_id, question, choices_json, answer_index, explanation,
      audio_asset_id,
      audio_file_name, audio_mime, audio_size, created_at
    FROM listening_questions
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId).map(mapListeningQuestion);
}

export function listeningQuestionForUser(userId, id) {
  const row = getDb().prepare(`
    SELECT id, library_number, title, question_type_id, question, choices_json, answer_index, explanation,
      audio_asset_id,
      audio_file_name, audio_mime, audio_size, created_at
    FROM listening_questions
    WHERE user_id = ? AND id = ?
  `).get(userId, id);
  return row ? mapListeningQuestion(row) : null;
}

export function listeningAudioForUser(userId, id) {
  const row = getDb().prepare(`
    SELECT audio_path, audio_mime, audio_file_name, audio_size
    FROM listening_questions
    WHERE user_id = ? AND id = ?
  `).get(userId, id);
  return row && existsSync(row.audio_path) ? row : null;
}

export function deleteListeningQuestion(userId, id) {
  const audio = getDb().prepare('SELECT audio_path, audio_asset_id FROM listening_questions WHERE user_id = ? AND id = ?').get(userId, id);
  if (!audio) {
    return false;
  }
  const recordingAudio = getDb().prepare('SELECT audio_path FROM listening_recordings WHERE user_id = ? AND listening_question_id = ?').all(userId, id);
  getDb().prepare('DELETE FROM listening_questions WHERE user_id = ? AND id = ?').run(userId, id);
  const remaining = audio.audio_asset_id ? getDb().prepare('SELECT COUNT(*) AS count FROM listening_questions WHERE user_id = ? AND audio_asset_id = ?').get(userId, audio.audio_asset_id).count : 0;
  if (!remaining) {
    if (existsSync(audio.audio_path)) unlinkSync(audio.audio_path);
    if (audio.audio_asset_id) getDb().prepare('DELETE FROM listening_audio_assets WHERE user_id = ? AND id = ?').run(userId, audio.audio_asset_id);
  }
  for (const recording of recordingAudio) {
    if (existsSync(recording.audio_path)) unlinkSync(recording.audio_path);
  }
  return true;
}

export function createListeningRecording(userId, listeningQuestionId, payload) {
  const question = listeningQuestionForUser(userId, listeningQuestionId);
  if (!question) throw new Error('Listening question not found');
  const audioMime = String(payload?.audioMime ?? '').toLowerCase();
  const audioBase64 = String(payload?.audioBase64 ?? '').replace(/\s/g, '');
  if (!audioMime.startsWith('audio/') || !audioBase64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(audioBase64)) {
    throw new Error('A valid audio recording is required');
  }
  const audio = Buffer.from(audioBase64, 'base64');
  if (!audio.length || audio.length > 25 * 1024 * 1024) {
    throw new Error('Audio recording must be 25 MB or smaller');
  }
  const id = randomBytes(12).toString('base64url');
  const recordingDir = join(localDir, 'listening-recordings', String(userId));
  const audioPath = join(recordingDir, `${id}.${audioExtension(audioMime)}`);
  const now = new Date().toISOString();
  mkdirSync(recordingDir, { recursive: true });
  writeFileSync(audioPath, audio, { flag: 'wx' });
  try {
    getDb().prepare(`
      INSERT INTO listening_recordings (
        id, user_id, listening_question_id, audio_mime, audio_size, audio_path,
        status, analysis_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?)
    `).run(id, userId, listeningQuestionId, audioMime, audio.length, audioPath, now, now);
  } catch (error) {
    unlinkSync(audioPath);
    throw error;
  }
  return listeningRecordingForUser(userId, id);
}

export function listListeningRecordings(userId, listeningQuestionId) {
  return getDb().prepare(`
    SELECT id, listening_question_id, audio_mime, audio_size, status, analysis_json, created_at, updated_at
    FROM listening_recordings
    WHERE user_id = ? AND listening_question_id = ?
    ORDER BY created_at DESC
  `).all(userId, listeningQuestionId).map(mapListeningRecording);
}

export function listPendingListeningRecordings(userId) {
  return getDb().prepare(`
    SELECT id, listening_question_id, audio_mime, audio_size, status, analysis_json, created_at, updated_at
    FROM listening_recordings
    WHERE user_id = ? AND status IN ('pending', 'analyzing')
    ORDER BY created_at
  `).all(userId).map(mapListeningRecording);
}

export function listeningRecordingForUser(userId, id) {
  const row = getDb().prepare(`
    SELECT id, listening_question_id, audio_mime, audio_size, status, analysis_json, created_at, updated_at
    FROM listening_recordings
    WHERE user_id = ? AND id = ?
  `).get(userId, id);
  return row ? mapListeningRecording(row) : null;
}

export function listeningRecordingAudioForUser(userId, id) {
  const row = getDb().prepare(`
    SELECT audio_path, audio_mime, audio_size
    FROM listening_recordings
    WHERE user_id = ? AND id = ?
  `).get(userId, id);
  return row && existsSync(row.audio_path) ? row : null;
}

export function buildListeningRecordingAnalysisContext(userId, id) {
  const row = getDb().prepare(`
    SELECT recordings.id, recordings.status, recordings.audio_path AS recording_path,
      recordings.audio_mime AS recording_mime, recordings.audio_size AS recording_size,
      questions.id AS question_id, questions.library_number, questions.title,
      questions.question_type_id, questions.question, questions.audio_path AS reference_path,
      questions.audio_mime AS reference_mime, questions.audio_size AS reference_size
    FROM listening_recordings AS recordings
    JOIN listening_questions AS questions ON questions.id = recordings.listening_question_id
    WHERE recordings.user_id = ? AND recordings.id = ?
  `).get(userId, id);
  if (!row || !existsSync(row.recording_path) || !existsSync(row.reference_path)) return null;
  if (row.status === 'pending') {
    getDb().prepare("UPDATE listening_recordings SET status = 'analyzing', updated_at = ? WHERE user_id = ? AND id = ?").run(new Date().toISOString(), userId, id);
  }
  return {
    recording_id: row.id,
    status: row.status === 'pending' ? 'analyzing' : row.status,
    question: {
      id: row.question_id,
      library_number: Number(row.library_number),
      title: row.title,
      question_type_id: normalizeListeningQuestionTypeId(row.question_type_id),
      prompt: row.question,
    },
    learner_recording: { local_path: row.recording_path, mime: row.recording_mime, size: Number(row.recording_size) },
    reference_audio: { local_path: row.reference_path, mime: row.reference_mime, size: Number(row.reference_size) },
    analysis_requirements: [
      'Read both local audio files. Do not infer pronunciation quality from filenames or metadata alone.',
      'Compare the learner recording with the reference for intelligibility, missing or substituted content, pacing, pauses, rhythm, and intonation when the available local tools support those observations.',
      'Clearly separate directly observed audio evidence from transcript-based inference.',
      'Return concise, actionable feedback in the learner interface language.',
      'Write the result back with save_listening_recording_analysis.',
    ],
  };
}

export function saveListeningRecordingAnalysis(userId, id, payload) {
  const recording = listeningRecordingForUser(userId, id);
  if (!recording) return null;
  const status = payload?.status === 'failed' ? 'failed' : 'completed';
  const analysis = status === 'completed' ? normalizeListeningRecordingAnalysis(payload?.analysis) : null;
  const now = new Date().toISOString();
  getDb().prepare(`
    UPDATE listening_recordings
    SET status = ?, analysis_json = ?, updated_at = ?
    WHERE user_id = ? AND id = ?
  `).run(status, analysis ? JSON.stringify(analysis) : null, now, userId, id);
  return listeningRecordingForUser(userId, id);
}

function readingQuestionValues(value) {
  return [value.title, value.passage, value.question, JSON.stringify(value.choices), value.answerIndex,
    value.explanation, JSON.stringify(value.tags), JSON.stringify(value.explanationNodes), JSON.stringify(value.translationLines),
    value.passageTranslation, JSON.stringify(value.choiceExplanations), JSON.stringify(value.readingAnalysis)];
}

export function createReadingQuestion(userId, payload) {
  const value = normalizeReadingQuestion(payload);
  const id = randomBytes(12).toString('base64url');
  getDb().prepare(`
    INSERT INTO reading_questions (
      id, user_id, title, passage, question, choices_json, answer_index, explanation, tags_json,
      explanation_nodes_json, translation_lines_json, passage_translation, choice_explanations_json, reading_analysis_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, ...readingQuestionValues(value), new Date().toISOString());
  return readingQuestionForUser(userId, id);
}

export function updateReadingQuestion(userId, id, payload) {
  const current = readingQuestionForUser(userId, id);
  if (!current) return null;
  const patch = readingPatchSchema.parse(payload);
  const { id: _id, createdAt: _createdAt, ...fields } = current;
  const value = normalizeReadingQuestion({ ...fields, ...patch });
  getDb().prepare(`UPDATE reading_questions SET
    title = ?, passage = ?, question = ?, choices_json = ?, answer_index = ?, explanation = ?, tags_json = ?,
    explanation_nodes_json = ?, translation_lines_json = ?, passage_translation = ?, choice_explanations_json = ?, reading_analysis_json = ?
    WHERE user_id = ? AND id = ?
  `).run(...readingQuestionValues(value), userId, id);
  return readingQuestionForUser(userId, id);
}

export function listReadingQuestions(userId) {
  return getDb().prepare(`
    SELECT id, title, passage, question, choices_json, answer_index, explanation, tags_json, explanation_nodes_json, translation_lines_json, passage_translation, choice_explanations_json, reading_analysis_json, created_at
    FROM reading_questions
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId).map(mapReadingQuestion);
}

export function readingQuestionForUser(userId, id) {
  const row = getDb().prepare(`
    SELECT id, title, passage, question, choices_json, answer_index, explanation, tags_json, explanation_nodes_json, translation_lines_json, passage_translation, choice_explanations_json, reading_analysis_json, created_at
    FROM reading_questions
    WHERE user_id = ? AND id = ?
  `).get(userId, id);
  return row ? mapReadingQuestion(row) : null;
}

export function deleteReadingQuestion(userId, id) {
  const result = getDb().prepare('DELETE FROM reading_questions WHERE user_id = ? AND id = ?').run(userId, id);
  return result.changes > 0;
}

export function getStudyState(userId) {
  ensureSettings(userId);
  const settingsRow = getDb().prepare('SELECT settings_json FROM user_settings WHERE user_id = ?').get(userId);
  const answerRows = getDb().prepare('SELECT question_id, selected, correct, answered_at FROM answers WHERE user_id = ?').all(userId);
  const progressRows = getDb().prepare('SELECT item_id, progress_json FROM progress WHERE user_id = ?').all(userId);
  const practice = getPracticeState(userId);
  return {
    settings: normalizeSettings(JSON.parse(settingsRow.settings_json)),
    answers: Object.fromEntries(answerRows.map((row) => [row.question_id, { selected: row.selected, correct: Boolean(row.correct), answeredAt: row.answered_at }])),
    progress: Object.fromEntries(progressRows.map((row) => [row.item_id, JSON.parse(row.progress_json)])),
    attemptHistory: practice.attemptHistory,
    activeAttempt: practice.activeAttempt,
  };
}

export function saveSettings(userId, settings) {
  // Settings sent by the app are already in the current card-field vocabulary.
  const normalized = normalizeSettings({ ...settings, memoryCardFieldsVersion });
  getDb()
    .prepare('UPDATE user_settings SET settings_json = ?, updated_at = ? WHERE user_id = ?')
    .run(JSON.stringify(normalized), new Date().toISOString(), userId);
  return normalized;
}

export function getStudyPlan(userId) {
  const row = getDb().prepare('SELECT plan_json, updated_at FROM study_plans WHERE user_id = ?').get(userId);
  const stored = row ? parseJson(row.plan_json, {}) : {};
  const plan = normalizeStudyPlanDocument(stored);
  const reconciled = reconcileStudyPlan(plan);
  if (row && JSON.stringify(reconciled) !== JSON.stringify(plan)) {
    const now = new Date().toISOString();
    getDb().prepare('UPDATE study_plans SET plan_json = ?, updated_at = ? WHERE user_id = ?').run(JSON.stringify(reconciled), now, userId);
    row.updated_at = now;
  }
  return {
    ...reconciled,
    dailySummaries: buildDailySummaries(userId, reconciled.tasks),
    updatedAt: row?.updated_at,
  };
}

export function saveStudyPlanProfile(userId, profile) {
  const current = getStudyPlan(userId);
  const normalizedProfile = normalizeStudyPlanProfile(profile);
  const next = {
    profile: normalizedProfile,
    status: current.tasks.length ? 'needs_refresh' : 'profile_only',
    tasks: current.tasks,
    phases: current.phases,
    generatedAt: current.generatedAt,
  };
  return saveStudyPlanDocument(userId, next);
}

export function saveGeneratedStudyPlan(userId, payload) {
  const current = getStudyPlan(userId);
  const tasks = normalizeStudyPlanTasks(payload?.tasks, current.profile);
  if (!tasks.length) {
    throw new Error('Generated plan must include at least one daily task');
  }
  const phases = payload?.phases === undefined
    ? current.phases
    : normalizeStudyPlanPhases(payload.phases, current.profile);
  const now = new Date().toISOString();
  const completedById = new Map(current.tasks.filter((task) => task.status === 'completed').map((task) => [task.id, task]));
  const mergedTasks = tasks.map((task) => completedById.get(task.id) ?? task);
  return saveStudyPlanDocument(userId, {
    profile: current.profile,
    status: 'ready',
    tasks: mergedTasks,
    phases,
    generatedAt: now,
  });
}

export function updateStudyPlanTask(userId, taskId, status) {
  const current = getStudyPlan(userId);
  const nextStatus = ['pending', 'completed', 'skipped'].includes(status) ? status : null;
  if (!nextStatus) throw new Error('Invalid task status');
  let found = false;
  const now = new Date().toISOString();
  const tasks = current.tasks.map((task) => {
    if (task.id !== taskId) return task;
    found = true;
    return {
      ...task,
      status: nextStatus,
      ...(nextStatus === 'completed' ? { completedAt: now } : { completedAt: undefined }),
    };
  });
  if (!found) return null;
  return saveStudyPlanDocument(userId, { ...current, tasks });
}

export function getPlanGenerationContext(userId) {
  const plan = getStudyPlan(userId);
  const practice = getPracticeState(userId);
  return {
    plan,
    weakPoints: analyzeWeakPoints(userId),
    recentAttempts: practice.attemptHistory.slice(0, 20),
    instructions: [
      'Create concrete daily JLPT tasks between profile.startDate and profile.examDate.',
      'Split the study period into 2 to 5 phases and return them as the phases array. Each phase needs startDate, endDate, a short focus, and the concrete points it covers. Phases must stay inside the study period and should not overlap. Read profile.phaseStrategy as the learner\'s intent for this split.',
      'Use the textbook section names and currentPosition notes in profile.materials as the plan spine. Do not write generic tasks such as "study grammar"; cite the exact lesson, question type, or section name.',
      'Every study task should include an observable output: complete the lesson exercises, write confusing points into captures, mark reading evidence locations, or replay listening error segments.',
      'Use only the learner materials in profile.materials unless the learner goal explicitly requests other resources.',
      'Keep each day within profile.dailyMinutes and approximately profile.studyDaysPerWeek study days per week.',
      'Treat language school as a weekday fixed class by default. Do not automatically reduce weekend workload unless profile.fixedSchedule explicitly says there are weekend classes too.',
      'Use recentAttempts, weakPoints, and dailySummaries to adjust future workload.',
      'Write the result with save_generated_study_plan. Do not edit monthly review-data JSON.',
    ],
  };
}

function saveStudyPlanDocument(userId, plan) {
  const normalized = normalizeStudyPlanDocument(plan);
  const now = new Date().toISOString();
  getDb()
    .prepare(`
      INSERT INTO study_plans (user_id, plan_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        plan_json = excluded.plan_json,
        updated_at = excluded.updated_at
    `)
    .run(userId, JSON.stringify(normalized), now);
  return { ...normalized, dailySummaries: buildDailySummaries(userId, normalized.tasks), updatedAt: now };
}

export function saveAnswer(userId, { questionId, itemId, selected, correct, progressEntry, attemptHistory, activeAttempt }) {
  if (!questionId || !itemId || typeof selected !== 'string' || typeof correct !== 'boolean' || !progressEntry) {
    throw new Error('Invalid answer payload');
  }
  if (String(questionId).startsWith('memory-card:')) {
    saveProgressEntry(userId, itemId, progressEntry);
    return;
  }
  const now = new Date().toISOString();
  const database = getDb();
  transaction(database, () => {
    database
      .prepare(`
        INSERT INTO answers (user_id, question_id, item_id, selected, correct, answered_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, question_id) DO UPDATE SET
          selected = excluded.selected,
          correct = excluded.correct,
          answered_at = excluded.answered_at
      `)
      .run(userId, questionId, itemId, selected, correct ? 1 : 0, now);
    database
      .prepare(`
        INSERT INTO progress (user_id, item_id, progress_json, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, item_id) DO UPDATE SET
          progress_json = excluded.progress_json,
          updated_at = excluded.updated_at
      `)
      .run(userId, itemId, JSON.stringify(progressEntry), now);
  });
  if (Array.isArray(attemptHistory) || activeAttempt !== undefined) {
    savePracticeState(userId, { attemptHistory, activeAttempt });
  }
}

export function saveProgressEntry(userId, itemId, progressEntry) {
  if (!itemId || !progressEntry || typeof progressEntry !== 'object') {
    throw new Error('Invalid progress payload');
  }
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO progress (user_id, item_id, progress_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, item_id) DO UPDATE SET
      progress_json = excluded.progress_json,
      updated_at = excluded.updated_at
  `).run(userId, itemId, JSON.stringify(progressEntry), now);
  return getStudyState(userId);
}

export function savePracticeState(userId, { answers, progress, answerItemIds, attemptHistory, activeAttempt }) {
  const database = getDb();
  const now = new Date().toISOString();
  transaction(database, () => {
    if (answers && typeof answers === 'object') {
      database.prepare('DELETE FROM answers WHERE user_id = ?').run(userId);
      const insert = database.prepare(`
        INSERT INTO answers (user_id, question_id, item_id, selected, correct, answered_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const [questionId, answer] of Object.entries(answers)) {
        const itemId = answerItemIds?.[questionId] ?? String(questionId).replace(/-(grammar|moji-goi|meaning|kana-to-kanji|kanji-to-kana|name-reading).*$/, '');
        insert.run(userId, questionId, itemId, String(answer.selected ?? ''), answer.correct ? 1 : 0, answer.answeredAt ?? now);
      }
    }
    if (progress && typeof progress === 'object') {
      const saveProgress = database.prepare(`
        INSERT INTO progress (user_id, item_id, progress_json, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, item_id) DO UPDATE SET progress_json = excluded.progress_json, updated_at = excluded.updated_at
      `);
      for (const [itemId, entry] of Object.entries(progress)) {
        saveProgress.run(userId, itemId, JSON.stringify(entry), now);
      }
    }
    upsertPracticeState(userId, attemptHistory, activeAttempt, now);
  });
}

export function buildStudyRecord(userId) {
  const data = loadReviewData(userId);
  const state = getStudyState(userId);
  const answered = Object.keys(state.answers).length;
  const correct = Object.values(state.answers).filter((answer) => answer.correct).length;
  const mastered = Object.values(state.progress).filter((item) => item.status === 'mastered').length;
  return {
    exported_at: new Date().toISOString(),
    app: 'JLPT Review',
    data_generated_at: data.generated_at,
    data_source: 'backend',
    storage: 'sqlite',
    summary: {
      items: data.items.length,
      answered,
      correct,
      mastered,
    },
    items: data.items.map((item) => ({
      id: item.id,
      deck: item.deck,
      type: item.type,
      jlpt_level: item.jlpt_level,
      original: item.original,
      reading: item.reading,
      meaning: item.meaning_zh,
      input_at: item.input_at,
    })),
    answers: state.answers,
    progress: state.progress,
    attempt_history: state.attemptHistory,
    active_attempt: state.activeAttempt,
    learning_captures: listLearningCaptures(userId),
    wordbooks: listWordbooks(userId),
    settings: state.settings,
    ai_prompt: [
      '请分析这份 JLPT 学习记录。',
      '请找出我的薄弱模块、容易错的题型、需要提前复习的词条。',
      '请按照 Anki/遗忘曲线思想，为接下来 7 天生成复习计划。',
      '请基于错题和即将到期的 nextReviewAt，生成新的 JLPT 练习题和解析。',
    ].join('\n'),
  };
}

export function listWordbooks(userId) {
  const overrides = builtInWordbookOverrides(userId);
  const customRows = getDb()
    .prepare('SELECT id, title, deck, created_at, updated_at FROM wordbooks WHERE user_id = ? ORDER BY created_at ASC')
    .all(userId);
  return [
    ...builtInWordbooks().map((wordbook) => ({
      ...wordbook,
      title: overrides.get(wordbook.id)?.title ?? wordbook.title,
      createdAt: overrides.get(wordbook.id)?.createdAt,
      updatedAt: overrides.get(wordbook.id)?.updatedAt,
    })),
    ...customRows.map((row) => ({
      id: row.id,
      title: row.title,
      deck: normalizeWordbookDeck(row.deck),
      builtIn: false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  ];
}

export function createWordbook(userId, { title, deck = 'n1_vocab' } = {}) {
  const normalizedTitle = normalizeWordbookTitle(title);
  const normalizedDeck = normalizeWordbookDeck(deck);
  const existing = listWordbooks(userId).find((wordbook) => wordbook.title.toLocaleLowerCase() === normalizedTitle.toLocaleLowerCase());
  if (existing) return existing;
  const now = new Date().toISOString();
  const id = `wordbook-${randomBytes(9).toString('base64url')}`;
  getDb()
    .prepare('INSERT INTO wordbooks (id, user_id, title, deck, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, userId, normalizedTitle, normalizedDeck, now, now);
  return {
    id,
    title: normalizedTitle,
    deck: normalizedDeck,
    builtIn: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateWordbook(userId, id, { title } = {}) {
  const wordbookId = String(id ?? '').trim();
  const existing = wordbookById(userId, wordbookId);
  if (!existing) return null;
  const normalizedTitle = normalizeWordbookTitle(title);
  const duplicate = listWordbooks(userId).find((wordbook) => (
    wordbook.id !== wordbookId
    && wordbook.title.toLocaleLowerCase() === normalizedTitle.toLocaleLowerCase()
  ));
  if (duplicate) throw new Error('A wordbook with this title already exists');
  const now = new Date().toISOString();
  if (existing.builtIn) {
    getDb().prepare(`
      INSERT INTO wordbook_title_overrides (user_id, wordbook_id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, wordbook_id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at
    `).run(userId, wordbookId, normalizedTitle, now, now);
  } else {
    getDb()
      .prepare('UPDATE wordbooks SET title = ?, updated_at = ? WHERE user_id = ? AND id = ?')
      .run(normalizedTitle, now, userId, wordbookId);
  }
  updateReviewItemWordbookTitles(wordbookId, normalizedTitle, now);
  return wordbookById(userId, wordbookId);
}

function updateReviewItemWordbookTitles(wordbookId, title, updatedAt) {
  const database = getDb();
  const rows = database.prepare('SELECT id, item_json FROM review_items').all();
  const update = database.prepare('UPDATE review_items SET item_json = ?, updated_at = ? WHERE id = ?');
  transaction(database, () => {
    for (const row of rows) {
      const item = JSON.parse(row.item_json);
      if (item.targetWordbookId !== wordbookId || item.targetWordbookTitle === title) continue;
      update.run(JSON.stringify({ ...item, targetWordbookTitle: title }), updatedAt, row.id);
    }
  });
}

export function createLearningCapture(userId, { body, category = 'unsure', context = '', targetDeck, target_deck, targetWordbookId, target_wordbook_id } = {}) {
  const text = String(body ?? '').trim();
  if (!text) throw new Error('Capture body is required');
  const now = new Date().toISOString();
  const normalizedCategory = normalizeCaptureCategory(category);
  const targetWordbook = normalizeCaptureTargetWordbook(userId, {
    category: normalizedCategory,
    targetDeck: targetDeck ?? target_deck,
    targetWordbookId: targetWordbookId ?? target_wordbook_id,
  });
  const capture = {
    id: randomBytes(12).toString('base64url'),
    body: text.slice(0, 5000),
    category: normalizedCategory,
    context: String(context ?? '').trim().slice(0, 2000),
    targetDeck: targetWordbook?.deck,
    targetWordbookId: targetWordbook?.id,
    targetWordbookTitle: targetWordbook?.title,
    status: 'inbox',
    createdAt: now,
    updatedAt: now,
  };
  getDb().prepare(`
    INSERT INTO learning_captures (id, user_id, body, category, context, target_deck, target_wordbook_id, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(capture.id, userId, capture.body, capture.category, capture.context, capture.targetDeck ?? null, capture.targetWordbookId ?? null, capture.status, now, now);
  return capture;
}

export function listLearningCaptures(userId, status) {
  const normalizedStatus = ['inbox', 'processed', 'archived'].includes(status) ? status : null;
  const rows = normalizedStatus
    ? getDb().prepare('SELECT * FROM learning_captures WHERE user_id = ? AND status = ? ORDER BY created_at DESC').all(userId, normalizedStatus)
    : getDb().prepare('SELECT * FROM learning_captures WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  return rows.map(learningCaptureFromRow);
}

export function updateLearningCaptureStatus(userId, id, status) {
  const nextStatus = ['inbox', 'processed', 'archived'].includes(status) ? status : null;
  if (!nextStatus) throw new Error('Invalid capture status');
  const now = new Date().toISOString();
  const result = getDb().prepare('UPDATE learning_captures SET status = ?, updated_at = ? WHERE user_id = ? AND id = ?').run(nextStatus, now, userId, id);
  if (!result.changes) return null;
  return learningCaptureFromRow(getDb().prepare('SELECT * FROM learning_captures WHERE user_id = ? AND id = ?').get(userId, id));
}

function learningCaptureFromRow(row) {
  const targetWordbook = row.target_wordbook_id ? wordbookById(row.user_id, row.target_wordbook_id) : null;
  return {
    id: row.id,
    body: row.body,
    category: row.category,
    context: row.context,
    targetDeck: targetWordbook?.deck ?? row.target_deck ?? undefined,
    targetWordbookId: targetWordbook?.id ?? row.target_wordbook_id ?? undefined,
    targetWordbookTitle: targetWordbook?.title ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeCaptureCategory(value) {
  return ['word', 'grammar', 'sentence', 'listening', 'reading', 'unsure'].includes(value) ? value : 'unsure';
}

function normalizeCaptureTargetWordbook(userId, { category, targetDeck, targetWordbookId }) {
  if (category !== 'word' && category !== 'grammar') return null;
  const isGrammar = category === 'grammar';
  const requestedId = String(targetWordbookId ?? '').trim();
  if (requestedId) {
    const wordbook = wordbookById(userId, requestedId);
    // A capture can only land in a wordbook of its own family: grammar captures in
    // grammar wordbooks, word captures in vocabulary wordbooks.
    if (wordbook && (wordbook.deck === 'grammar_expression') === isGrammar) return wordbook;
  }
  if (isGrammar) return wordbookById(userId, 'grammar_expression');
  const deck = normalizeWordbookDeck(targetDeck);
  return wordbookById(userId, deck === 'name_reading' ? 'name_reading' : 'n1_vocab');
}

function wordbookById(userId, id) {
  const builtIn = builtInWordbooks().find((wordbook) => wordbook.id === id);
  if (builtIn) {
    const override = builtInWordbookOverrides(userId).get(builtIn.id);
    return {
      ...builtIn,
      title: override?.title ?? builtIn.title,
      createdAt: override?.createdAt,
      updatedAt: override?.updatedAt,
    };
  }
  const row = getDb()
    .prepare('SELECT id, title, deck, created_at, updated_at FROM wordbooks WHERE user_id = ? AND id = ?')
    .get(userId, id);
  return row ? {
    id: row.id,
    title: row.title,
    deck: normalizeWordbookDeck(row.deck),
    builtIn: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } : null;
}

function builtInWordbooks() {
  return [
    { id: 'n1_vocab', title: 'N1/N2 词汇', deck: 'n1_vocab', builtIn: true },
    { id: 'name_reading', title: '补充・人名读法', deck: 'name_reading', builtIn: true },
    { id: 'grammar_expression', title: '语法・句型', deck: 'grammar_expression', builtIn: true },
  ];
}

function builtInWordbookOverrides(userId) {
  const builtInIds = new Set(builtInWordbooks().map((wordbook) => wordbook.id));
  const rows = getDb()
    .prepare('SELECT wordbook_id, title, created_at, updated_at FROM wordbook_title_overrides WHERE user_id = ?')
    .all(userId);
  return new Map(rows
    .filter((row) => builtInIds.has(row.wordbook_id))
    .map((row) => [row.wordbook_id, { title: row.title, createdAt: row.created_at, updatedAt: row.updated_at }]));
}

function normalizeWordbookTitle(value) {
  const title = String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!title) throw new Error('Wordbook title is required');
  return title;
}

function normalizeWordbookDeck(value) {
  return ['n1_vocab', 'name_reading', 'grammar_expression'].includes(value) ? value : 'n1_vocab';
}

// Items that were never answered have no progress entry; like the web memory-review page,
// treat them as due so freshly captured words land in today's review set.
export function listDueReviews(userId, at = new Date().toISOString()) {
  const data = loadReviewData(userId);
  const state = getStudyState(userId);
  return data.items.filter((item) => {
    const progress = state.progress[item.id];
    return !progress?.nextReviewAt || progress.nextReviewAt <= at;
  });
}

export function analyzeWeakPoints(userId) {
  const data = loadReviewData(userId);
  const state = getStudyState(userId);
  const byItem = data.items.map((item) => {
    const progress = state.progress[item.id] ?? { correct: 0, wrong: 0, status: 'new' };
    return {
      id: item.id,
      original: item.original,
      deck: item.deck,
      jlpt_level: item.jlpt_level,
      correct: progress.correct ?? 0,
      wrong: progress.wrong ?? 0,
      status: progress.status ?? 'new',
      nextReviewAt: progress.nextReviewAt,
    };
  });
  return {
    weakest_items: byItem
      .filter((item) => item.wrong > 0 || item.status === 'learning')
      .sort((a, b) => b.wrong - a.wrong || a.correct - b.correct)
      .slice(0, 12),
    due_items: listDueReviews(userId).slice(0, 20).map((item) => ({ id: item.id, original: item.original, deck: item.deck })),
    totals: {
      items: data.items.length,
      answered: Object.keys(state.answers).length,
      mastered: byItem.filter((item) => item.status === 'mastered').length,
    },
  };
}

// Authored JLPT vocabulary questions replace the synthetic ones, so they must be complete:
// four choices containing the answer and a specific reason for every wrong choice.
function assertVocabSeeds(seeds) {
  for (const [index, seed] of (Array.isArray(seeds) ? seeds : []).entries()) {
    const kind = normalizeQuestionKind(seed?.kind);
    if (!kind || kind === 'grammar') continue;
    const label = `practice_questions[${index}] (${kind})`;
    const choices = Array.isArray(seed.choices) ? seed.choices.map(String) : [];
    if (new Set(choices).size < 4 || !choices.includes(String(seed.answer ?? ''))) {
      throw new Error(`${label} requires at least four distinct choices including the answer`);
    }
    if (isEmptyReason(seed.explanation_zh)) throw new Error(`${label} requires explanation_zh for the correct answer`);
    const missing = choices.filter((choice) => choice !== seed.answer && isEmptyReason(seed.distractor_notes?.[choice]));
    if (missing.length) throw new Error(`${label} requires distractor_notes explaining ${missing.map((choice) => `「${choice}」`).join('、')}`);
  }
}

function questionKindFromId(questionId = '') {
  if (questionId.includes('-kanji-to-kana-')) return 'kanji_to_kana';
  if (questionId.includes('-kana-to-kanji-')) return 'kana_to_kanji';
  if (questionId.includes('-moji-goi-')) return 'moji_goi';
  if (questionId.includes('-meaning-')) return 'meaning';
  if (questionId.includes('-word-formation-')) return 'word_formation';
  if (questionId.includes('-usage-')) return 'usage';
  if (questionId.includes('-grammar-')) return 'grammar';
  return 'unknown';
}

function answerHistoryFor(state) {
  const attemptAnswers = (state.attemptHistory ?? []).flatMap((attempt) =>
    (attempt.answers ?? []).map((answer) => ({
      ...answer,
      attemptId: attempt.id,
      view: attempt.view,
      deck: attempt.deck,
      kind: answer.kind ?? questionKindFromId(answer.questionId),
    })),
  );
  if (attemptAnswers.length) return attemptAnswers;
  return Object.entries(state.answers ?? {}).map(([questionId, answer]) => ({
    questionId,
    itemId: questionId.replace(/-(grammar|meaning|moji-goi|kanji-to-kana|kana-to-kanji)-jlpt-v1$/, ''),
    kind: questionKindFromId(questionId),
    selected: answer.selected,
    correct: Boolean(answer.correct),
    answeredAt: answer.answeredAt,
  }));
}

function answersByDate(answers, targetDate) {
  if (!targetDate) return [];
  return answers.filter((answer) => dateInTokyo(answer.answeredAt ?? '') === targetDate);
}

function yesterdaysDateKey(reference) {
  const today = dateInTokyo(reference ?? new Date());
  const anchor = new Date(`${today}T00:00:00+09:00`);
  anchor.setDate(anchor.getDate() - 1);
  return dateInTokyo(anchor);
}

function estimateDailyQuestionCount(analysisAnswers, minutes) {
  const answers = Array.isArray(analysisAnswers) ? analysisAnswers : [];
  const wrongAnswers = answers.filter((answer) => !answer.correct);
  const uniqueWrongItems = new Set(wrongAnswers.map((answer) => answer.itemId).filter(Boolean)).size;
  const repeatedMistakes = Math.max(0, wrongAnswers.length - uniqueWrongItems);
  const baseByTime = Math.max(8, Math.round((Number(minutes) || 30) / 2));
  const activityCoverage = Math.ceil(answers.length * 0.15);
  const reinforcementCoverage = uniqueWrongItems * 2 + repeatedMistakes;
  return clampInteger(Math.max(baseByTime, activityCoverage, reinforcementCoverage), 8, 60);
}

function compareIsoDesc(a, b) {
  return String(b ?? '').localeCompare(String(a ?? ''));
}

function summarizeKindPerformance(answers) {
  const byKind = new Map();
  for (const answer of answers) {
    const kind = answer.kind ?? 'unknown';
    const current = byKind.get(kind) ?? { kind, total: 0, correct: 0, wrong: 0, lastAnsweredAt: '' };
    current.total += 1;
    current.correct += answer.correct ? 1 : 0;
    current.wrong += answer.correct ? 0 : 1;
    current.lastAnsweredAt = [current.lastAnsweredAt, answer.answeredAt].filter(Boolean).sort().at(-1) ?? current.lastAnsweredAt;
    byKind.set(kind, current);
  }
  return [...byKind.values()]
    .map((entry) => ({ ...entry, accuracy: entry.total ? entry.correct / entry.total : 0 }))
    .sort((a, b) => b.wrong - a.wrong || a.accuracy - b.accuracy || compareIsoDesc(a.lastAnsweredAt, b.lastAnsweredAt));
}

function recentWrongAnswers(answers, limit = Infinity) {
  return answers
    .filter((answer) => !answer.correct)
    .sort((a, b) => compareIsoDesc(a.answeredAt, b.answeredAt))
    .slice(0, limit);
}

function targetedItems(data, state, dueItems, wrongAnswers) {
  const itemsById = new Map(data.items.map((item) => [item.id, item]));
  const progressEntries = Object.entries(state.progress ?? {})
    .map(([itemId, progress]) => ({ item: itemsById.get(itemId), progress }))
    .filter((entry) => entry.item);
  const weakItems = progressEntries
    .filter(({ progress }) => (progress.wrong ?? 0) > 0 || progress.status === 'learning')
    .sort((a, b) => (b.progress.wrong ?? 0) - (a.progress.wrong ?? 0) || (a.progress.correct ?? 0) - (b.progress.correct ?? 0))
    .map(({ item }) => item);
  const wrongItems = wrongAnswers.map((answer) => itemsById.get(answer.itemId)).filter(Boolean);
  const seen = new Set();
  return [...wrongItems, ...weakItems, ...dueItems].filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

// Sentences that merely say "we studied 「X」 in the textbook" are not a usage context and
// must never be shown as a question prompt.
function isMetaStudySentence(value) {
  return /教材(?:の第\d+週)?では[「『].+[」』]という表現を学んだ/u.test(String(value ?? ''));
}

function firstQuestionContext(item) {
  const candidates = [
    ...(item.examples ?? []).map((entry) => entry.ja),
    item.source?.sentence,
    ...patternTexts(item),
  ].filter((candidate) => candidate && !isMetaStudySentence(candidate));
  return candidates.find((candidate) => String(candidate).includes(item.original)) ?? candidates[0] ?? item.original;
}

function choiceList(answer, distractors = [], fallback = []) {
  return [answer, ...distractors, ...fallback]
    .filter((choice, index, choices) => choice && choices.indexOf(choice) === index && choice !== 'undefined')
    .slice(0, 4);
}

function generatedKanjiToKanaQuestion(item, index) {
  if (!item.reading || !containsKanjiText(item.original) || !isKanaReading(item.reading)) return null;
  const choices = choiceList(item.reading, item.question_distractors?.kanji_to_kana, readingDistractors(item.reading));
  if (choices.length < 4) return null;
  return {
    id: `target-kanji-${String(index + 1).padStart(2, '0')}`,
    item_id: item.id,
    generated_from: 'weak_question_type',
    target_reason: 'history_wrong_same_type',
    type: '漢字読み',
    instruction: '下線部の読み方として最もよいものを一つ選びなさい。',
    prompt: firstQuestionContext(item),
    promptTarget: item.original,
    choices,
    answer: item.reading,
    explanation_zh: `历史记录显示读音题需要加强。本题只考「${item.original}」的读音：${item.reading}。${item.explanation_zh ?? item.meaning_zh ?? ''}`.trim(),
  };
}

function containsKanjiText(value) {
  return /[\u3400-\u9fff々〆ヵヶ]/u.test(String(value ?? ''));
}

function isKanaReading(value) {
  return /^[\u3040-\u309f\u30a0-\u30ffー・]+$/u.test(String(value ?? ''));
}

function generatedMeaningQuestion(item, index) {
  const answer = item.paraphrase_ja ?? item.meaning_ja;
  if (!answer) return null;
  const japaneseDistractors = (item.question_distractors?.meaning ?? [])
    .filter((choice) => /[\u3040-\u30ff]/u.test(String(choice)));
  const choices = choiceList(answer, japaneseDistractors, [
    '重要さや優先順位が第一ではなく、後回しであること。',
    '前の内容を言い換えたり、要点をまとめたりすること。',
    'ある条件なら当然そうするという判断を表すこと。',
  ]);
  if (choices.length < 4) return null;
  return {
    id: `target-meaning-${String(index + 1).padStart(2, '0')}`,
    item_id: item.id,
    generated_from: 'weak_question_type',
    target_reason: 'history_wrong_same_type',
    type: '言い換え類義',
    instruction: '次の表現の意味として最も近いものを一つ選びなさい。',
    prompt: item.original,
    choices,
    answer,
    explanation_zh: item.explanation_zh ?? item.meaning_zh ?? '',
  };
}

function generatedGrammarQuestion(item, index) {
  const practice = (item.practice_questions ?? []).find((question) => question.kind === 'grammar' || question.kind === '文の組み立て');
  if (practice) {
    return {
      id: `target-grammar-${String(index + 1).padStart(2, '0')}`,
      item_id: item.id,
      source_question_id: practice.id,
      generated_from: 'weak_question_type',
      target_reason: 'history_wrong_same_type',
      type: practice.kind,
      instruction: practice.instruction,
      prompt: practice.prompt,
      choices: practice.choices,
      answer: practice.answer,
      explanation_zh: practice.explanation_zh ?? item.explanation_zh ?? '',
      form_analysis_zh: practice.form_analysis_zh,
      translation_zh: practice.translation_zh,
      tested_expression: practice.tested_expression,
      full_order: practice.full_order,
      target_blank_index: practice.target_blank_index,
    };
  }
  const context = firstQuestionContext(item);
  const choices = choiceList(item.original, item.question_distractors?.grammar, ['が早いか', 'ものなら', 'とたんに']);
  if (!context.includes(item.original) || choices.length < 4) return null;
  return {
    id: `target-grammar-${String(index + 1).padStart(2, '0')}`,
    item_id: item.id,
    generated_from: 'weak_question_type',
    target_reason: 'history_wrong_same_type',
    type: '文の文法1',
    instruction: '次の文の（　）に入れるのに最もよいものを一つ選びなさい。',
    prompt: context.replace(item.original, '（　）'),
    choices,
    answer: item.original,
    explanation_zh: item.explanation_zh ?? '',
  };
}

function generatedMojiGoiQuestion(item, index) {
  const context = firstQuestionContext(item);
  if (!context.includes(item.original)) return null;
  const choices = choiceList(item.original, item.question_distractors?.moji_goi, ['確認', '整理', '判断']);
  if (choices.length < 4) return null;
  return {
    id: `target-moji-${String(index + 1).padStart(2, '0')}`,
    item_id: item.id,
    generated_from: 'weak_question_type',
    target_reason: 'history_wrong_same_type',
    type: '文脈規定',
    instruction: '次の文の（　）に入れるのに最もよいものを一つ選びなさい。',
    prompt: context.replace(item.original, '（　）'),
    choices,
    answer: item.original,
    explanation_zh: item.explanation_zh ?? item.meaning_zh ?? '',
  };
}

function generatedQuestionForKind(item, kind, index) {
  const isGrammarItem = item.deck === 'grammar_expression'
    || item.type === 'expression'
    || item.type === 'grammar'
    || (item.practice_questions ?? []).some((question) => question.kind === 'grammar' || question.kind === '文の組み立て');
  if (kind === 'kanji_to_kana') return generatedKanjiToKanaQuestion(item, index);
  if (kind === 'meaning') return generatedMeaningQuestion(item, index);
  if (kind === 'grammar') return isGrammarItem ? generatedGrammarQuestion(item, index) : null;
  if (kind === 'moji_goi') return generatedMojiGoiQuestion(item, index);
  // 表記・語形成・用法 need authored choices (kanji spellings, affixes, four sentences); only item seeds provide them.
  if (['kana_to_kanji', 'word_formation', 'usage'].includes(kind)) return null;
  return generatedMeaningQuestion(item, index) ?? generatedGrammarQuestion(item, index) ?? generatedKanjiToKanaQuestion(item, index);
}

function buildTargetedReviewPack(userId, { title, minutes = 30 } = {}) {
  const data = loadReviewData(userId);
  const state = getStudyState(userId);
  const allAnswers = answerHistoryFor(state);
  const yesterdayDate = yesterdaysDateKey();
  const analysisAnswers = answersByDate(allAnswers, yesterdayDate);
  const focusedAnswers = analysisAnswers.length ? analysisAnswers : allAnswers;
  const dueItems = listDueReviews(userId);
  const questionTargetCount = estimateDailyQuestionCount(focusedAnswers, minutes);
  const kindPerformance = summarizeKindPerformance(focusedAnswers);
  const wrongAnswers = recentWrongAnswers(focusedAnswers, questionTargetCount);
  const candidates = targetedItems(data, state, dueItems, wrongAnswers);
  const priorityKinds = kindPerformance.filter((kind) => kind.wrong > 0).map((kind) => kind.kind);
  if (!priorityKinds.length) priorityKinds.push('meaning', 'grammar', 'kanji_to_kana');

  const generatedPractice = [];
  const seenQuestion = new Set();
  const warmupLimit = Math.min(10, questionTargetCount);
  const kindPools = new Map(priorityKinds.map((kind) => {
    const sameKindWrongItems = wrongAnswers
      .filter((answer) => answer.kind === kind)
      .map((answer) => candidates.find((item) => item.id === answer.itemId))
      .filter(Boolean);
    const seenItems = new Set();
    const itemPool = [...sameKindWrongItems, ...candidates].filter((item) => {
      if (!item?.id || seenItems.has(item.id)) return false;
      seenItems.add(item.id);
      return true;
    });
    return [kind, { items: itemPool, cursor: 0 }];
  }));
  const kindSchedule = priorityKinds.flatMap((kind) => {
    const wrongCount = kindPerformance.find((entry) => entry.kind === kind)?.wrong ?? 1;
    return Array.from({ length: Math.max(1, wrongCount) }, () => kind);
  });
  while (generatedPractice.length < questionTargetCount) {
    let addedThisRound = false;
    for (const kind of kindSchedule) {
      if (generatedPractice.length >= questionTargetCount) break;
      const pool = kindPools.get(kind);
      if (!pool) continue;
      while (pool.cursor < pool.items.length) {
        const item = pool.items[pool.cursor++];
      const question = seededQuestionForKind(item, kind) ?? generatedQuestionForKind(item, kind, generatedPractice.length);
      if (!question) continue;
      const key = `${question.type}|${question.prompt}|${question.answer}|${(question.choices ?? []).join('|')}`;
      if (seenQuestion.has(key)) continue;
      seenQuestion.add(key);
      generatedPractice.push({
        ...question,
        id: `target-${String(generatedPractice.length + 1).padStart(2, '0')}`,
        itemId: question.item_id,
        kind,
      });
        addedThisRound = true;
        break;
      }
    }
    if (!addedThisRound) break;
  }

  const focusItems = candidates.slice(0, questionTargetCount).map((item) => {
    const progress = state.progress[item.id] ?? {};
    return {
      id: item.id,
      original: item.original,
      deck: item.deck,
      jlpt_level: item.jlpt_level,
      status: progress.status ?? 'new',
      correct: progress.correct ?? 0,
      wrong: progress.wrong ?? 0,
      nextReviewAt: progress.nextReviewAt,
      reason: wrongAnswers.some((answer) => answer.itemId === item.id) ? 'recent_wrong' : dueItems.some((due) => due.id === item.id) ? 'due_review' : 'weak_progress',
    };
  });

  const warmup = candidates.slice(0, warmupLimit).map((item) => {
    const isGrammar = item.deck === 'grammar_expression' || item.type === 'expression' || item.type === 'grammar';
    return {
      item_id: item.id,
      target_reason: wrongAnswers.some((answer) => answer.itemId === item.id) ? 'recent_wrong' : dueItems.some((due) => due.id === item.id) ? 'due_review' : 'weak_progress',
      prompt: isGrammar
        ? `「${item.original}」的接续、意思、使用限制是什么？`
        : `「${item.original}」怎么读？中文意思和一个常见搭配是什么？`,
      answer: [item.reading && item.reading !== item.original ? item.reading : null, item.core_memory, item.meaning_zh, item.explanation_zh].filter(Boolean).join('\n'),
    };
  });

  const now = new Date().toISOString();
  return {
    kind: 'daily_review_pack',
    strategy: 'targeted_by_history',
    minutes,
    generated_at: now,
    practice_plan: [
      { minutes: Math.min(8, minutes), task: 'Warmup：只看 prompt，口头回答读音、接续、核心义。' },
      { minutes: Math.max(10, Math.round(minutes * 0.55)), task: 'Same-type practice：优先做历史错题对应题型的新题。' },
      { minutes: Math.max(5, minutes - Math.min(8, minutes) - Math.max(10, Math.round(minutes * 0.55))), task: 'Error log：错题写下题型、误选原因、正确判断步骤。' },
    ],
    diagnosis: {
      analysis_date: analysisAnswers.length ? yesterdayDate : null,
      used_history_fallback: !analysisAnswers.length,
      analyzed_answers: focusedAnswers.length,
      all_history_answers: allAnswers.length,
      target_question_count: questionTargetCount,
      recent_wrong_answers: wrongAnswers.slice(0, 8).map((answer) => ({
        questionId: answer.questionId,
        itemId: answer.itemId,
        kind: answer.kind,
        selected: answer.selected,
        answeredAt: answer.answeredAt,
      })),
      weak_question_types: kindPerformance.slice(0, 6),
      rule: '优先生成历史错题同题型的新题；没有错题时才按到期复习和 learning 状态补充。',
    },
    warmup,
    quiz: generatedPractice,
    focus_items: focusItems,
      due_items: dueItems.slice(0, questionTargetCount).map((item) => ({ id: item.id, original: item.original, deck: item.deck })),
    generated_practice: generatedPractice,
    sections: [
      {
        title: 'Targeted diagnosis',
        body: 'Review starts from wrong-answer question types, not random deck sampling.',
        items: kindPerformance.slice(0, 6),
      },
      {
        title: 'Same-type practice',
        body: 'These questions are generated from the weak question types found in answer history.',
        items: generatedPractice,
      },
      {
        title: 'Due review',
        body: 'Use these items for spaced repetition after the targeted set.',
        items: dueItems.slice(0, questionTargetCount).map((item) => ({ id: item.id, original: item.original, deck: item.deck })),
      },
    ],
    next_step: '先完成 same-type practice；错题只记录题型、误选原因和正确判断步骤。',
  };
}

export function createDailyReviewPackDraft(userId, { title, minutes = 30 } = {}) {
  const now = new Date().toISOString();
  const content = buildTargetedReviewPack(userId, { title, minutes });
  return createReviewPackDraft(userId, {
    title: title || `Daily review draft ${now.slice(0, 10)}`,
    content,
  });
}

export function createDailyPractice(userId, { title, minutes = 30, date } = {}) {
  const practiceDate = normalizePracticeDate(date);
  const content = buildTargetedReviewPack(userId, { title, minutes });
  const id = `daily-${practiceDate}-${randomBytes(6).toString('base64url')}`;
  const now = new Date().toISOString();
  const version = nextDailyPracticeVersion(userId, practiceDate);
  const practiceTitle = formatDailyPracticeTitle(practiceDate);
  const practice = {
    id,
    date: practiceDate,
    version,
    title: practiceTitle,
    minutes: Number.isFinite(Number(minutes)) ? Math.max(5, Math.min(240, Math.round(Number(minutes)))) : 30,
    strategy: content.strategy,
    generated_at: now,
    source_title: typeof title === 'string' && title.trim() ? title.trim().slice(0, 120) : undefined,
    diagnosis: content.diagnosis,
    practice_plan: content.practice_plan,
    questions: dailyPracticeQuestions(content.generated_practice ?? content.quiz ?? [], id, userId).map(normalizePracticeExplanations),
  };
  if (!practice.questions.length) {
    throw new Error('No daily practice questions could be generated from the current study history');
  }
  assertPracticeExplanations(practice.questions);
  getDb()
    .prepare(`
      INSERT INTO daily_practices (id, user_id, practice_date, version, title, minutes, practice_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(id, userId, practiceDate, version, practice.title, practice.minutes, JSON.stringify(practice), now, now);
  return getDailyPractice(userId, id);
}

// ---- Agent-driven practice sessions --------------------------------------------------------
// A topic practice is a daily_practices row generated on demand (by deck / kind / wordbook / due
// state) so an MCP client can run the whole session — questions, answers, SRS — without the browser.
// Answers land in the same `answers` / `progress` / attempt history the web app uses.

export const PRACTICE_KINDS = ['meaning', 'grammar', 'kanji_to_kana', 'kana_to_kanji', 'word_formation', 'moji_goi', 'usage'];

export function createTopicPractice(userId, { title, deck, kinds, wordbookId, jlptLevel, onlyDue = false, statuses, count = 10, date } = {}) {
  const practiceDate = normalizePracticeDate(date);
  const state = getStudyState(userId);
  const now = new Date();
  const requestedKinds = (Array.isArray(kinds) ? kinds : []).filter((kind) => PRACTICE_KINDS.includes(kind));
  const targetKinds = requestedKinds.length ? requestedKinds : PRACTICE_KINDS;
  const targetCount = Math.max(1, Math.min(50, Math.round(Number(count) || 10)));
  const statusFilter = new Set((Array.isArray(statuses) ? statuses : []).filter((status) => ['new', 'learning', 'review', 'mastered'].includes(status)));

  const pool = loadReviewData(userId).items.filter((item) => {
    if (deck && item.deck !== deck) return false;
    if (wordbookId && itemWordbookId(item) !== wordbookId) return false;
    if (jlptLevel && String(item.jlpt_level ?? '').toUpperCase() !== String(jlptLevel).toUpperCase()) return false;
    const progress = state.progress[item.id];
    if (statusFilter.size && !statusFilter.has(progress?.status ?? 'new')) return false;
    if (onlyDue && progress?.nextReviewAt && new Date(progress.nextReviewAt) > now) return false;
    return true;
  });
  // Due and weak items first, then untouched ones, then a shuffle so repeated sessions differ.
  const ranked = pool
    .map((item) => {
      const progress = state.progress[item.id];
      const due = progress?.nextReviewAt ? new Date(progress.nextReviewAt) <= now : false;
      const weight = (due ? 3 : 0) + ((progress?.wrong ?? 0) > 0 ? 2 : 0) + (progress ? 0 : 1);
      return { item, weight, random: Math.random() };
    })
    .sort((a, b) => b.weight - a.weight || a.random - b.random)
    .map((entry) => entry.item);

  const id = `topic-${practiceDate}-${randomBytes(6).toString('base64url')}`;
  const generated = [];
  const seenQuestion = new Set();
  const seenItem = new Set();
  let kindCursor = 0;
  for (const item of ranked) {
    if (generated.length >= targetCount) break;
    // Rotate through the requested kinds, falling back to whichever kind the item supports.
    let question = null;
    let kind = null;
    for (let offset = 0; offset < targetKinds.length && !question; offset += 1) {
      kind = targetKinds[(kindCursor + offset) % targetKinds.length];
      question = seededQuestionForKind(item, kind) ?? generatedQuestionForKind(item, kind, generated.length);
    }
    if (!question) continue;
    const key = `${question.type}|${question.prompt}|${question.answer}|${(question.choices ?? []).join('|')}`;
    if (seenQuestion.has(key) || seenItem.has(item.id)) continue;
    seenQuestion.add(key);
    seenItem.add(item.id);
    kindCursor += 1;
    generated.push({ ...question, id: `topic-${String(generated.length + 1).padStart(2, '0')}`, itemId: question.item_id, kind });
  }

  const filters = { deck: deck ?? null, kinds: targetKinds, wordbookId: wordbookId ?? null, jlptLevel: jlptLevel ?? null, onlyDue: Boolean(onlyDue), statuses: [...statusFilter], count: targetCount };
  const practiceTitle = typeof title === 'string' && title.trim() ? title.trim().slice(0, 120) : topicPracticeTitle(filters);
  const practice = {
    id,
    date: practiceDate,
    version: nextDailyPracticeVersion(userId, practiceDate),
    title: practiceTitle,
    minutes: Math.max(5, Math.min(240, Math.round(generated.length * 1.5))),
    strategy: 'agent_topic',
    generated_at: now.toISOString(),
    source_title: practiceTitle,
    filters,
    diagnosis: { summary: `专题训练：${practiceTitle}`, candidateItems: pool.length },
    practice_plan: { totalQuestions: generated.length },
    questions: dailyPracticeQuestions(generated, id, userId).map(normalizePracticeExplanations),
  };
  if (!practice.questions.length) {
    throw new Error('No practice questions match these filters; loosen deck / kinds / wordbook / onlyDue');
  }
  // No assertPracticeExplanations here: these questions are generated from the library, not
  // authored by an agent, so distractor explanations may be generic.
  getDb()
    .prepare(`
      INSERT INTO daily_practices (id, user_id, practice_date, version, title, minutes, practice_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(id, userId, practiceDate, practice.version, practice.title, practice.minutes, JSON.stringify(practice), now.toISOString(), now.toISOString());
  return getPracticeSession(userId, id);
}

// Agent-authored seeds on the item (practice_questions) carry real sentences; prefer them over
// the synthetic generators when the item has one for the requested kind.
function seededQuestionForKind(item, kind) {
  const seed = (item.practice_questions ?? []).find((entry) => normalizeQuestionKind(entry.kind) === kind && Array.isArray(entry.choices) && entry.choices.length >= 2 && entry.answer && !isMetaStudySentence(entry.prompt));
  if (!seed) return null;
  return {
    id: seed.id ?? `${item.id}-${kind}`,
    item_id: item.id,
    generated_from: 'item_seed',
    type: seed.kind,
    instruction: seed.instruction ?? '',
    prompt: seed.prompt ?? item.original,
    promptTarget: seed.target ?? seed.promptTarget,
    choices: seed.choices,
    answer: seed.answer,
    explanation_zh: seed.explanation_zh ?? item.explanation_zh ?? '',
    translation_zh: seed.translation_zh ?? '',
    distractor_notes: seed.distractor_notes,
  };
}

function topicPracticeTitle(filters) {
  const deckLabel = { n1_vocab: 'N1 词汇', name_reading: '人名读法', grammar_expression: '语法・表达' }[filters.deck] ?? '综合';
  const kindLabel = filters.kinds.length === PRACTICE_KINDS.length ? '' : ` · ${filters.kinds.map(questionTitleForKind).map((label) => label.replace('练习', '')).join('/')}`;
  return `专题：${deckLabel}${kindLabel}${filters.onlyDue ? ' · 到期复习' : ''}`;
}

/** Practice plus the caller's answer state; explanations are only exposed for answered questions. */
export function getPracticeSession(userId, practiceId) {
  const practice = getDailyPractice(userId, practiceId);
  if (!practice) return null;
  const state = getStudyState(userId);
  const questions = practice.questions.map((question) => sessionQuestionView(question, state.answers[question.id]));
  const answered = questions.filter((question) => question.answered);
  const correct = answered.filter((question) => question.correct).length;
  return {
    id: practice.id,
    title: practice.title,
    date: practice.date,
    strategy: practice.strategy,
    filters: practice.filters ?? null,
    questions,
    progress: { total: questions.length, answered: answered.length, correct, wrong: answered.length - correct },
    completed: questions.length > 0 && answered.length === questions.length,
  };
}

function sessionQuestionView(question, answer) {
  const base = {
    id: question.id,
    itemId: question.itemId,
    kind: question.kind,
    title: question.title,
    instruction: question.instruction,
    prompt: question.prompt,
    promptTarget: question.promptTarget,
    choices: question.choices,
    translationZh: question.translationZh,
    answered: Boolean(answer),
  };
  if (!answer) return base;
  return { ...base, selected: answer.selected, correct: Boolean(answer.correct), answer: question.answer, correctReason: question.correctReason, memoryPoint: question.memoryPoint, choiceAnalysis: question.choiceAnalysis };
}

export function submitPracticeAnswer(userId, { practiceId, questionId, selected }) {
  const practice = getDailyPractice(userId, practiceId);
  if (!practice) throw new Error('Practice not found');
  const question = practice.questions.find((entry) => entry.id === questionId);
  if (!question) throw new Error('Question not found in this practice');
  const choice = String(selected ?? '').trim();
  if (!question.choices.includes(choice)) throw new Error(`selected must be one of: ${question.choices.join(' | ')}`);
  const state = getStudyState(userId);
  const existing = state.answers[questionId];
  const now = new Date();
  if (!existing) {
    const correct = choice === question.answer;
    const attempt = attemptForPractice(state.attemptHistory, practice, now);
    // Without a UI, a question "starts" when the previous one was answered (or when the attempt began).
    const startedAt = attempt.answers.at(-1)?.answeredAt ?? attempt.startedAt;
    attempt.answers = [
      ...attempt.answers.filter((entry) => entry.questionId !== questionId),
      { questionId, itemId: question.itemId, kind: question.kind, selected: choice, correct, startedAt, answeredAt: now.toISOString(), elapsedMs: Math.max(0, now.getTime() - new Date(startedAt).getTime()) },
    ];
    if (attempt.answers.length >= practice.questions.length) {
      const correctCount = attempt.answers.filter((entry) => entry.correct).length;
      const elapsedMs = attempt.answers.reduce((sum, entry) => sum + Math.max(0, entry.elapsedMs || 0), 0);
      attempt.completedAt = now.toISOString();
      attempt.summary = { total: practice.questions.length, correct: correctCount, wrong: practice.questions.length - correctCount, accuracy: practice.questions.length ? correctCount / practice.questions.length : 0, elapsedMs };
    }
    const attemptHistory = [attempt, ...state.attemptHistory.filter((entry) => entry.id !== attempt.id)].slice(0, 50);
    saveAnswer(userId, {
      questionId,
      itemId: question.itemId,
      selected: choice,
      correct,
      progressEntry: progressAfterAnswer(state.progress[question.itemId], correct, now),
      attemptHistory,
    });
  }
  const session = getPracticeSession(userId, practiceId);
  return {
    question: session.questions.find((entry) => entry.id === questionId),
    alreadyAnswered: Boolean(existing),
    progress: session.progress,
    completed: session.completed,
    next: session.questions.find((entry) => !entry.answered) ?? null,
  };
}

// The web keeps one in-progress attempt per question set in attemptHistory (resumable); reuse it
// rather than touching activeAttempt, which belongs to whatever the browser is doing right now.
function attemptForPractice(history, practice, now) {
  const questionIds = practice.questions.map((question) => question.id);
  const open = history.find((attempt) => !attempt.completedAt && attempt.practiceId === practice.id);
  if (open) return { ...open, answers: [...(open.answers ?? [])] };
  return {
    id: `attempt-${now.getTime()}-${randomBytes(4).toString('hex').slice(0, 6)}`,
    title: practice.title,
    practiceId: practice.id,
    startedAt: now.toISOString(),
    analysisStatus: 'idle',
    view: 'daily-practice',
    deck: 'all',
    questionIds,
    answers: [],
  };
}

function formatDailyPracticeTitle(practiceDate) {
  return `${practiceDate} 练习`;
}

export function createDailyPracticeFromDraft(userId, draftId, { date, title } = {}) {
  const draft = getReviewPackDraft(userId, draftId);
  if (!draft) {
    throw new Error('Draft not found');
  }
  if (draft.status !== 'approved' && draft.status !== 'archived') {
    throw new Error('Only approved drafts can be published as daily practice');
  }

  const existing = getDb()
    .prepare(`
      SELECT id, practice_json
      FROM daily_practices
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `)
    .all(userId)
    .find((row) => JSON.parse(row.practice_json).sourceDraftId === draft.id);
  if (existing) {
    return getDailyPractice(userId, existing.id);
  }

  const content = draft.content && typeof draft.content === 'object' ? draft.content : {};
  const sourceSections = Array.isArray(content.sections) ? content.sections : [];
  const sourceQuestions = sourceSections.flatMap((section) =>
    (Array.isArray(section.questions) ? section.questions : []).map((question) => ({ section, question })),
  );
  if (!sourceQuestions.length) {
    throw new Error('Approved draft does not contain a complete question set');
  }

  const reviewItems = loadReviewData(userId).items;
  const practiceDate = normalizePracticeDate(date);
  const id = `daily-${practiceDate}-${randomBytes(6).toString('base64url')}`;
  const now = new Date().toISOString();
  const version = nextDailyPracticeVersion(userId, practiceDate);
  const practiceTitle = formatDailyPracticeTitle(practiceDate);
  const questions = sourceQuestions.map(({ section, question }, index) => {
    const choices = Array.isArray(question.choices) ? question.choices.map((choice) => String(choice)) : [];
    const answerIndex = Number.isInteger(question.answerIndex)
      ? question.answerIndex
      : choices.indexOf(String(question.answer ?? ''));
    if (choices.length < 2 || answerIndex < 0 || answerIndex >= choices.length) {
      throw new Error(`Draft question ${question.id ?? index + 1} has an invalid answer`);
    }
    const answer = choices[answerIndex];
    const item = reviewItems.find((candidate) =>
      (candidate.practice_questions ?? []).some((seed) => seed.id === question.id || (
        seed.source_draft_id === draft.id && seed.tested_expression === question.tested
      )),
    );
    const explanation = String(question.explanation_zh ?? question.explanation ?? '').trim();
    return normalizePracticeExplanations({
      id: `${id}-q${String(index + 1).padStart(2, '0')}`,
      sourceQuestionId: String(question.id ?? `draft-q${index + 1}`),
      sourceDraftId: draft.id,
      itemId: item?.id ?? String(question.id ?? `draft-q${index + 1}`),
      kind: draftQuestionKind(question.kind),
      title: String(section.title ?? `問題${section.id ?? ''}`).trim(),
      instruction: String(section.instruction ?? '').trim(),
      prompt: String(question.prompt ?? '').trim(),
      promptTarget: question.target ? String(question.target) : undefined,
      choices,
      answer,
      answerIndex,
      context: String(question.prompt ?? '').trim(),
      correctReason: explanation || `正确答案是「${answer}」。`,
      memoryPoint: String(question.tested ?? question.target ?? answer),
      choiceAnalysis: question.choiceAnalysis ?? question.choice_analysis ?? [],
    });
  });
  assertPracticeExplanations(questions);
  const practice = {
    id,
    date: practiceDate,
    version,
    title: String(title || practiceTitle).slice(0, 120),
    minutes: Number.isFinite(Number(content.time_limit_minutes))
      ? Math.max(5, Math.min(240, Math.round(Number(content.time_limit_minutes))))
      : 30,
    strategy: 'approved_draft_full_set',
    sourceDraftId: draft.id,
    description: String(content.description ?? '').trim().slice(0, 600),
    content_origin: 'ai_generated',
    verification_status: content.verification_status ?? 'needs_review',
    generated_at: now,
    disclaimer: '本套练习由 AI 根据学习内容生成，不是 JLPT 官方真题或历年真题。',
    sections: sourceSections.map((section) => ({
      id: String(section.id ?? ''),
      title: String(section.title ?? ''),
      instruction: String(section.instruction ?? ''),
      questionCount: Array.isArray(section.questions) ? section.questions.length : 0,
    })),
    questions,
  };
  getDb()
    .prepare(`
      INSERT INTO daily_practices (id, user_id, practice_date, version, title, minutes, practice_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(id, userId, practiceDate, version, practice.title, practice.minutes, JSON.stringify(practice), now, now);

  const annotations = [
    ...draft.annotations,
    {
      id: randomBytes(8).toString('base64url'),
      body: `已发布为 ${practiceDate} 今日整套练习：${practice.id}（${questions.length} 题）。`,
      created_at: now,
    },
  ];
  getDb()
    .prepare('UPDATE review_pack_drafts SET status = ?, annotations_json = ?, updated_at = ? WHERE user_id = ? AND id = ?')
    .run('archived', JSON.stringify(annotations), now, userId, draft.id);
  return getDailyPractice(userId, id);
}

function draftQuestionKind(value) {
  const text = String(value ?? '');
  if (text.includes('文脈')) return 'moji_goi';
  if (text.includes('語形成')) return 'word_formation';
  if (text.includes('用法')) return 'usage';
  if (text.includes('言い換え') || text.includes('類義') || text.includes('説明')) return 'meaning';
  if (text.includes('漢字読み')) return 'kanji_to_kana';
  if (text.includes('表記')) return 'kana_to_kanji';
  if (text.includes('文法') || text.includes('組み立て')) return 'grammar';
  return 'meaning';
}

export function listDailyPractices(userId) {
  return getDb()
    .prepare(`
      SELECT id, practice_date, version, title, minutes, practice_json, created_at, updated_at
      FROM daily_practices
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `)
    .all(userId)
    .map(rowToDailyPracticeSummary);
}

// Return only original questions referenced by this user's completed answers.
// Questions behind the mistake notebook: only the ones tied to a wrong answer (or to an item
// that was answered wrong somewhere), trimmed to the fields the notebook renders. The full
// per-choice analysis lives in the practice detail pages, not here.
export function getHistoryQuestions(userId) {
  const state = getDb().prepare('SELECT attempt_history_json FROM practice_state WHERE user_id = ?').get(userId);
  const answers = parseJson(state?.attempt_history_json, [])
    .filter((attempt) => attempt.completedAt)
    .flatMap((attempt) => attempt.answers ?? []);
  const wrongItemIds = new Set(answers.filter((answer) => !answer.correct && answer.itemId).map((answer) => answer.itemId));
  const ids = new Set(answers
    .filter((answer) => !answer.correct || wrongItemIds.has(answer.itemId))
    .map((answer) => answer.questionId));
  const questions = new Map();
  if (!ids.size) return [];
  const rows = getDb().prepare('SELECT practice_json FROM daily_practices WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
  for (const row of rows) {
    for (const question of JSON.parse(row.practice_json).questions ?? []) {
      if (ids.has(question.id) && !questions.has(question.id)) {
        const { id, itemId, kind, title, prompt, promptTarget, choices, answer, correctReason, memoryPoint } = question;
        questions.set(question.id, { id, itemId, kind, title, prompt, promptTarget, choices, answer, correctReason, memoryPoint });
      }
    }
  }
  return [...questions.values()];
}

export function getDailyPractice(userId, id) {
  const row = getDb()
    .prepare(`
      SELECT id, practice_date, version, title, minutes, practice_json, created_at, updated_at
      FROM daily_practices
      WHERE user_id = ? AND id = ?
    `)
    .get(userId, id);
  return row ? rowToDailyPractice(row) : null;
}

export function refreshDailyPracticeExplanations(userId, id) {
  const row = getDb()
    .prepare(`
      SELECT id, practice_date, version, title, minutes, practice_json, created_at, updated_at
      FROM daily_practices
      WHERE user_id = ? AND id = ?
    `)
    .get(userId, id);
  if (!row) return null;

  const practice = JSON.parse(row.practice_json);
  const reviewItems = loadReviewData(userId).items;
  practice.questions = (practice.questions ?? []).map((question) => {
    const choices = Array.isArray(question.choices) ? question.choices : [];
    if (!choices.includes(question.answer)) return question;
    const sourceItem = reviewItems.find((item) => item.id === question.itemId);
    return {
      ...question,
      choiceAnalysis: choices.map((choice) => {
        const existing = question.choiceAnalysis?.find((entry) => entry.choice === choice)?.explanation;
        const generic = !existing || /(?:不符合本题(?:目标|语境)|是本题正确答案|是正确答案)/u.test(existing);
        return {
          choice,
          correct: choice === question.answer,
          explanation: generic
            ? dailyPracticeChoiceExplanation({
              choice,
              correct: choice === question.answer,
              kind: question.kind,
              prompt: question.prompt,
              correctReason: question.correctReason,
              sourceItem,
              reviewItems,
            })
            : existing,
        };
      }),
    };
  });
  const now = new Date().toISOString();
  getDb()
    .prepare('UPDATE daily_practices SET practice_json = ?, updated_at = ? WHERE user_id = ? AND id = ?')
    .run(JSON.stringify(practice), now, userId, id);
  return getDailyPractice(userId, id);
}

function rowToDailyPracticeSummary(row) {
  const practice = JSON.parse(row.practice_json);
  return {
    id: row.id,
    date: row.practice_date,
    version: row.version ?? practice.version ?? 1,
    title: row.title,
    minutes: row.minutes,
    strategy: practice.strategy ?? 'targeted_by_history',
    questionCount: Array.isArray(practice.questions) ? practice.questions.length : 0,
    summary: dailyPracticeSummaryText(practice),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function dailyPracticeSummaryText(practice) {
  const questions = Array.isArray(practice?.questions) ? practice.questions : [];
  const sourceCounts = new Map();
  const kindCounts = new Map();
  for (const question of questions) {
    const source = String(question.sourceMaterial ?? question.generated_from ?? '').trim();
    if (source) sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
    const kind = normalizeQuestionKind(question.kind);
    if (kind) kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  }
  const parts = [];
  const inputCount = sourceCounts.get('yesterday_input') ?? 0;
  const reviewCardCount = (sourceCounts.get('review_card') ?? 0) + (sourceCounts.get('review_card_and_wrong_answer') ?? 0);
  if (inputCount) parts.push(`复盘昨天输入 ${inputCount} 题`);
  if (reviewCardCount) parts.push(`复习卡片补强 ${reviewCardCount} 题`);
  const topKinds = [...kindCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([kind]) => questionKindSummaryLabel(kind));
  if (topKinds.length) parts.push(`重点：${topKinds.join('、')}`);
  const fallback = practice?.diagnosis?.weak_question_types?.[0]?.kind;
  if (!parts.length && fallback) parts.push(`针对 ${questionKindSummaryLabel(fallback)} 做同题型练习`);
  return parts.join('；') || '根据最近学习记录生成的今日练习。';
}

function questionKindSummaryLabel(kind) {
  if (kind === 'kanji_to_kana') return '汉字读音';
  if (kind === 'kana_to_kanji') return '假名表记';
  if (kind === 'grammar') return '语法';
  if (kind === 'moji_goi') return '文字词汇';
  if (kind === 'meaning') return '词义辨析';
  if (kind === 'word_formation') return '语形成';
  if (kind === 'usage') return '用法';
  return String(kind || '综合');
}

function rowToDailyPractice(row) {
  const practice = JSON.parse(row.practice_json);
  return {
    ...rowToDailyPracticeSummary(row),
    ...practice,
    questions: (practice.questions ?? []).map(repairDailyPracticeQuestionAnswer).map(normalizePracticeExplanations),
    id: row.id,
    date: row.practice_date,
    version: row.version ?? 1,
    title: row.title,
    minutes: row.minutes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function nextDailyPracticeVersion(userId, practiceDate) {
  const row = getDb()
    .prepare('SELECT COALESCE(MAX(version), 0) + 1 AS version FROM daily_practices WHERE user_id = ? AND practice_date = ?')
    .get(userId, practiceDate);
  return Number(row?.version) || 1;
}

function normalizePracticeDate(value) {
  const candidate = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(candidate)) {
    return candidate;
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function dailyPracticeQuestions(generatedPractice, practiceId, userId) {
  const reviewItems = loadReviewData(userId).items;
  return generatedPractice
    .map((question, index) => normalizeDailyPracticeQuestion(question, practiceId, index, reviewItems))
    .filter(Boolean);
}

function normalizeDailyPracticeQuestion(question, practiceId, index, reviewItems) {
  if (!question || typeof question !== 'object') return null;
  const kind = normalizeQuestionKind(question.kind ?? question.type);
  const choices = Array.isArray(question.choices) ? question.choices.map((choice) => String(choice)).filter(Boolean) : [];
  const rawAnswer = String(question.answer ?? '').trim();
  const answer = resolveDailyPracticeAnswer(question, choices, rawAnswer);
  const itemId = String(question.itemId ?? question.item_id ?? '').trim();
  const prompt = String(question.prompt ?? '').trim();
  if (!kind || !choices.length || !answer || !itemId || !prompt) return null;
  const id = `${practiceId}-q${String(index + 1).padStart(2, '0')}`;
  const explanation = String(question.explanation_zh ?? question.explanation ?? '').trim();
  const sourceItem = reviewItems.find((item) => item.id === itemId);
  const correctReason = explanation || `正确答案是「${answer}」。`;
  return {
    id,
    sourceQuestionId: question.id,
    itemId,
    kind,
    title: questionTitleForKind(kind),
    instruction: String(question.instruction ?? '').trim(),
    prompt,
    promptTarget: question.promptTarget ? String(question.promptTarget) : undefined,
    choices,
    answer,
    context: prompt,
    translationZh: String(question.translation_zh ?? '').trim() || undefined,
    correctReason,
    memoryPoint: explanation || `复习目标：${question.promptTarget ?? answer}`,
    choiceAnalysis: choices.map((choice) => ({
      choice,
      correct: choice === answer,
      explanation: (choice !== answer && question.distractor_notes?.[choice]) || dailyPracticeChoiceExplanation({
        choice,
        correct: choice === answer,
        kind,
        prompt,
        correctReason,
        sourceItem,
        reviewItems,
      }),
    })),
  };
}

function resolveDailyPracticeAnswer(question, choices, rawAnswer) {
  const sourceKind = String(question.kind ?? question.type ?? '');
  const isSentenceAssembly = sourceKind.includes('文の組み立て') || String(question.prompt ?? '').includes('★');
  if (!isSentenceAssembly || choices.includes(rawAnswer) || !/^\d+$/u.test(rawAnswer)) {
    return rawAnswer;
  }
  return choices[Number(rawAnswer) - 1] ?? rawAnswer;
}

function repairDailyPracticeQuestionAnswer(question) {
  const choices = Array.isArray(question?.choices) ? question.choices.map((choice) => String(choice)) : [];
  const rawAnswer = String(question?.answer ?? '').trim();
  const answer = resolveDailyPracticeAnswer(question, choices, rawAnswer);
  if (!answer || answer === rawAnswer) return question;
  return {
    ...question,
    answer,
    choiceAnalysis: choices.map((choice) => {
      const existing = question.choiceAnalysis?.find((entry) => entry.choice === choice);
      const correct = choice === answer;
      return {
        ...existing,
        choice,
        correct,
        explanation: correct
          ? `「${choice}」符合本句的排序和 ★ 位置。${question.correctReason ?? ''}`
          : existing?.explanation ?? `「${choice}」不是 ★ 位置对应的选项。`,
      };
    }),
  };
}

function dailyPracticeChoiceExplanation({ choice, correct, kind, prompt, correctReason, sourceItem, reviewItems }) {
  if (correct) {
    return `「${choice}」符合本句的接续和语义。${correctReason}`;
  }
  if (kind === 'kanji_to_kana') {
    const confusion = describeReadingConfusion(choice, sourceItem?.reading ?? '', sourceItem?.original ?? '');
    if (confusion) return confusion;
  }
  if (kind !== 'grammar' || !sourceItem) {
    const candidate = reviewItems.find((item) => item.original === choice || item.paraphrase_ja === choice || item.reading === choice);
    const usage = firstExplanationSentence(candidate?.meaning_zh ?? candidate?.explanation_zh ?? '');
    return usage
      ? `「${choice}」表示“${usage}”，与本题要求的词义、读音或句子结构不一致。`
      : `「${choice}」与本题要求的词义、读音或句子结构不一致。`;
  }

  const normalizedChoice = normalizeDailyGrammarExpression(choice);
  const candidate = reviewItems.find((item) => {
    const expressions = [item.original, item.patterns?.[0]?.pattern]
      .filter(Boolean)
      .flatMap((value) => String(value).split(/[／/]/u));
    return expressions.some((value) => normalizeDailyGrammarExpression(value) === normalizedChoice);
  });
  const comparison = (sourceItem.comparisons ?? [])
    .find((entry) => normalizeDailyGrammarExpression(entry.target ?? '') === normalizedChoice);
  const form = candidate?.patterns?.[0]?.pattern;
  const usage = firstExplanationSentence(candidate?.meaning_zh ?? candidate?.core_memory ?? candidate?.explanation_zh ?? '');
  const normalUse = candidate
    ? `「${choice}」的使用范围：${form ? `接「${form}」，` : ''}${usage ? `表示“${usage}”` : '用于另一种接续和语义场景'}。`
    : `「${choice}」有自己的接续形式和语义范围。`;
  const contrast = comparison?.difference_zh ? `${comparison.difference_zh.replace(/[。！？!?]+$/u, '')}。` : '';
  const required = firstExplanationSentence(sourceItem.meaning_zh ?? sourceItem.core_memory ?? correctReason);
  return `${normalUse}${contrast}本句「${prompt}」需要表达“${required}”，所以「${choice}」在接续或语义上不能成立。`;
}

function normalizeDailyGrammarExpression(value) {
  const normalized = String(value)
    .replace(/[〜～~]/gu, '')
    .replace(/^[VN]\s*(?:て|た)?\s*\+\s*/u, '')
    .replace(/^た(?=が最後$)/u, '')
    .trim();
  if (normalized === 'とたん') return 'とたんに';
  if (normalized === 'てからというもの') return 'からというもの';
  return normalized;
}

function firstExplanationSentence(value) {
  return String(value).split(/[。\n]/u)[0].replace(/[；;。]+$/u, '').trim();
}

function normalizeQuestionKind(value) {
  const text = String(value ?? '');
  if (['grammar', 'moji_goi', 'meaning', 'kana_to_kanji', 'kanji_to_kana', 'word_formation', 'usage'].includes(text)) return text;
  if (text.includes('漢字読み')) return 'kanji_to_kana';
  if (text.includes('表記')) return 'kana_to_kanji';
  if (text.includes('語形成')) return 'word_formation';
  if (text.includes('用法')) return 'usage';
  if (text.includes('言い換え') || text.includes('類義')) return 'meaning';
  if (text.includes('文脈')) return 'moji_goi';
  if (text.includes('文の文法') || text.includes('文の組み立て') || text.includes('grammar')) return 'grammar';
  return null;
}

function questionTitleForKind(kind) {
  if (kind === 'grammar') return '文法练习';
  if (kind === 'moji_goi') return '文字・語彙练习';
  if (kind === 'kanji_to_kana') return '漢字読み练习';
  if (kind === 'kana_to_kanji') return '表記练习';
  if (kind === 'word_formation') return '語形成练习';
  if (kind === 'usage') return '用法练习';
  return '言い換え练习';
}

function describePracticeContent(title, content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return content;
  const sections = Array.isArray(content.sections) ? content.sections : [];
  const names = sections.map((section) => section.title || section.name).filter(Boolean);
  const count = sections.reduce((total, section) => total + (Array.isArray(section.questions) ? section.questions.length : 0), 0);
  return { ...content, description: String(content.description || [title, names.join('、'), count ? `共 ${count} 题。` : ''].filter(Boolean).join('；')).trim().slice(0, 600) };
}

export function createReviewPackDraft(userId, { title, content, status = 'draft' }) {
  content = describePracticeContent(title, content);
  if (!title || !content) {
    throw new Error('Draft title and content are required');
  }
  const id = randomBytes(12).toString('base64url');
  const now = new Date().toISOString();
  const draft = {
    id,
    title: String(title).slice(0, 120),
    status: normalizeDraftStatus(status),
    content,
    annotations: [],
    created_at: now,
    updated_at: now,
  };
  getDb()
    .prepare(`
      INSERT INTO review_pack_drafts (id, user_id, title, status, content_json, annotations_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(id, userId, draft.title, draft.status, JSON.stringify(draft.content), JSON.stringify(draft.annotations), now, now);
  return draft;
}

export function listReviewPackDrafts(userId) {
  return getDb()
    .prepare(`
      SELECT id, title, status, created_at, updated_at
      FROM review_pack_drafts
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `)
    .all(userId);
}

export function getReviewPackDraft(userId, id) {
  const row = getDb()
    .prepare(`
      SELECT id, title, status, content_json, annotations_json, created_at, updated_at
      FROM review_pack_drafts
      WHERE user_id = ? AND id = ?
    `)
    .get(userId, id);
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    content: JSON.parse(row.content_json),
    annotations: JSON.parse(row.annotations_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function updateReviewPackDraft(userId, id, { title, content }) {
  content = describePracticeContent(title, content);
  const draft = getReviewPackDraft(userId, id);
  if (!draft) {
    return null;
  }
  const nextTitle = String(title ?? '').trim();
  if (!nextTitle) {
    throw new Error('Draft title is required');
  }
  if (content === undefined) {
    throw new Error('Draft content is required');
  }
  const now = new Date().toISOString();
  const nextDraft = {
    ...draft,
    title: nextTitle.slice(0, 120),
    content,
    updated_at: now,
  };
  getDb()
    .prepare('UPDATE review_pack_drafts SET title = ?, content_json = ?, updated_at = ? WHERE user_id = ? AND id = ?')
    .run(nextDraft.title, JSON.stringify(nextDraft.content), now, userId, id);
  return nextDraft;
}

export function deleteReviewPackDraft(userId, id) {
  const result = getDb()
    .prepare('DELETE FROM review_pack_drafts WHERE user_id = ? AND id = ?')
    .run(userId, id);
  return result.changes > 0;
}

export function addDraftAnnotation(userId, id, { body }) {
  const draft = getReviewPackDraft(userId, id);
  if (!draft) {
    return null;
  }
  const text = String(body ?? '').trim();
  if (!text) {
    throw new Error('Annotation body is required');
  }
  const now = new Date().toISOString();
  const nextDraft = {
    ...draft,
    annotations: [
      ...draft.annotations,
      {
        id: randomBytes(8).toString('base64url'),
        body: text,
        created_at: now,
      },
    ],
    updated_at: now,
  };
  getDb()
    .prepare('UPDATE review_pack_drafts SET annotations_json = ?, updated_at = ? WHERE user_id = ? AND id = ?')
    .run(JSON.stringify(nextDraft.annotations), now, userId, id);
  return nextDraft;
}

export function confirmDraftForAgentProcessing(userId, id, { unknownWords = '' } = {}) {
  const draft = getReviewPackDraft(userId, id);
  if (!draft) {
    return null;
  }
  const now = new Date().toISOString();
  const words = normalizeUnknownWords(unknownWords);
  const annotations = words.length
    ? [
        ...draft.annotations,
        {
          id: randomBytes(8).toString('base64url'),
          body: `用户确认草稿可处理。不认识单词：${words.join('、')}`,
          created_at: now,
        },
      ]
    : draft.annotations;
  getDb()
    .prepare('UPDATE review_pack_drafts SET status = ?, annotations_json = ?, updated_at = ? WHERE user_id = ? AND id = ?')
    .run('approved', JSON.stringify(annotations), now, userId, id);
  return buildDraftProcessingContext(userId, id, { unknownWords: words, confirmedAt: now });
}

export function buildDraftProcessingContext(userId, id, { unknownWords = [], confirmedAt } = {}) {
  const draft = getReviewPackDraft(userId, id);
  if (!draft) {
    return null;
  }
  const words = Array.isArray(unknownWords) ? unknownWords : normalizeUnknownWords(unknownWords);
  const studyRecord = buildStudyRecord(userId);
  return {
    draft,
    confirmed_at: confirmedAt ?? null,
    user_marks: {
      unknown_words: words,
    },
    pending_captures: listLearningCaptures(userId, 'inbox'),
    wordbooks: listWordbooks(userId),
    study_record: studyRecord,
    routing_rules: [
      'Use draft.content.kind, source questions, and any original capture category to decide the target library.',
      'When a pending capture has targetWordbookId or targetWordbookTitle, preserve that as the requested notebook metadata on the review item.',
      'When a pending capture has targetDeck, honor it as the requested review_items deck unless the content clearly contradicts the category.',
      'Vocabulary, kanji-reading, meaning, kana-to-kanji, and grammar items belong in the SQLite review_items library through upsert_review_item. JSON review-data files are export/import backups, not the primary store.',
      'Reading questions belong in the reading question bank.',
      'Listening questions belong in the listening question bank; keep source audio local and do not invent audio bytes.',
      'Use user_marks.unknown_words to add vocabulary entries or extra practice seeds when they are not already covered.',
      'When an approved draft contains a complete ordered question set, publish it as one Today daily practice through publish_draft_as_daily_practice. Do not split review packs across the long-term study plan.',
      'Mark processed captures only after their content has been represented in the target library or in a follow-up draft.',
    ],
    agent_message: [
      '请使用 jlpt_review MCP 登录我的本地 JLPT 账号，并处理这个已确认草稿。',
      `草稿 ID：${draft.id}`,
      words.length ? `用户标记的不认识单词：${words.join('、')}` : '用户没有额外标记不认识单词。',
      '先调用 get_draft_processing_context 重新读取草稿、用户标记、待整理输入、学习记录和 routing_rules。',
      '根据原始输入的题型和草稿内容，把数据放到对应库：词汇、语法、汉字读音、文字题种子通过 upsert_review_item 写入 SQLite review_items；阅读题写入阅读题库；听力题写入听力题库或生成需要本地音频的待办说明。JSON 只作为导出/备份格式。',
      '如果草稿是一整套已确认试题，调用 publish_draft_as_daily_practice 原样保留题目与选项顺序，并把入口放在首页“今日工作台 → 今天的练习版本”；不要把这类复习拆进长期计划。',
      '完成后说明改了哪些库、哪些 capture 已处理、还有哪些内容需要人工确认。不要跳过核对边界，也不要把 AI 生成内容说成官方真题。',
    ].join('\n'),
  };
}

export function buildDraftRevisionContext(userId, id) {
  const draft = getReviewPackDraft(userId, id);
  if (!draft) {
    return null;
  }
  return {
    draft,
    study_record: buildStudyRecord(userId),
    optimization_prompt: [
      '请根据这个 JLPT 复习草稿和用户批注进行优化。',
      '保留用户明确认可的部分，修正批注指出的问题。',
      '输出新的 draft 内容，不要直接写入正式月度归档 JSON。',
    ].join('\n'),
  };
}

function normalizeUnknownWords(value) {
  return String(value ?? '')
    .split(/[\n,，、;；\s]+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .slice(0, 80);
}

function normalizeDraftStatus(status) {
  return ['draft', 'needs_revision', 'approved', 'archived'].includes(status) ? status : 'draft';
}

function ensureSettings(userId) {
  const row = getDb().prepare('SELECT user_id FROM user_settings WHERE user_id = ?').get(userId);
  if (!row) {
    getDb()
      .prepare('INSERT INTO user_settings (user_id, settings_json, updated_at) VALUES (?, ?, ?)')
      .run(userId, JSON.stringify(defaultSettings), new Date().toISOString());
  }
  const practiceRow = getDb().prepare('SELECT user_id FROM practice_state WHERE user_id = ?').get(userId);
  if (!practiceRow) {
    getDb()
      .prepare('INSERT INTO practice_state (user_id, attempt_history_json, active_attempt_json, updated_at) VALUES (?, ?, ?, ?)')
      .run(userId, '[]', null, new Date().toISOString());
  }
}

function normalizeUsername(username) {
  const value = String(username ?? '').trim();
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(value)) {
    throw new Error('Username must be 3-32 letters, numbers, underscores, or hyphens');
  }
  return value;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 4 || password.length > 128) {
    throw new Error('Password must be 4-128 characters');
  }
}

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, salt, expectedHash) {
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function normalizeSettings(value) {
  // Before version 2 the back of a card always showed one example; keep that and offer images.
  const legacyCards = value?.memoryCardFieldsVersion !== memoryCardFieldsVersion;
  const backFields = normalizeMemoryCardFields(value?.memoryCardBackFields ?? compatibilityMemoryCardFields(value?.questionTypeTips?.[memoryCardBackCompatKey]), defaultMemoryCardBackFields);
  const storedLegacyBack = legacyCards && (value?.memoryCardBackFields || value?.questionTypeTips?.[memoryCardBackCompatKey]);
  const untouchedLegacyDefault = backFields.join() === 'original,patterns,meaning,core_memory';
  const legacyBackFields = !storedLegacyBack ? backFields
    : untouchedLegacyDefault ? [...defaultMemoryCardBackFields]
      : [...new Set([...backFields, 'images', 'examples'])];
  const locale = value?.locale === 'ja' || value?.locale === 'en' || value?.locale === 'zh-CN' ? value.locale : defaultSettings.locale;
  const feedbackMode = value?.feedbackMode === 'batch' ? 'batch' : defaultSettings.feedbackMode;
  const fontSize = value?.fontSize === 'small' || value?.fontSize === 'large' ? value.fontSize : defaultSettings.fontSize;
  const rawQuestionTypeTips = normalizeQuestionTypeTips(value?.questionTypeTips);
  const questionTypeTips = Object.fromEntries(Object.entries(rawQuestionTypeTips).filter(([key]) => key !== memoryCardFrontCompatKey && key !== memoryCardBackCompatKey));
  return {
    showReviewRuby: typeof value?.showReviewRuby === 'boolean' ? value.showReviewRuby : defaultSettings.showReviewRuby,
    showExplanationRuby: typeof value?.showExplanationRuby === 'boolean' ? value.showExplanationRuby : defaultSettings.showExplanationRuby,
    locale,
    fontSize,
    memoryCardFrontFields: normalizeMemoryCardFields(value?.memoryCardFrontFields ?? compatibilityMemoryCardFields(rawQuestionTypeTips[memoryCardFrontCompatKey]), defaultMemoryCardFrontFields),
    memoryCardBackFields: legacyBackFields,
    memoryCardFieldsVersion,
    feedbackMode,
    questionTypeTips,
    customQuestionTypeTips: normalizeCustomQuestionTypeTips(value?.customQuestionTypeTips),
  };
}

function normalizeMemoryCardFields(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  const fields = [...new Set(value
    .map((field) => legacyMemoryCardFields[field] ?? field)
    .filter((field) => typeof field === 'string' && memoryCardFields.has(field)))];
  return fields.length ? fields : [...fallback];
}

function compatibilityMemoryCardFields(value) {
  return typeof value === 'string' ? value.split(',').filter(Boolean) : undefined;
}

function normalizeQuestionTypeTips(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, tip]) => /^[a-z0-9_-]{1,80}$/i.test(key) && typeof tip === 'string')
      .slice(0, 50)
      .map(([key, tip]) => [key, tip.trim().slice(0, 2000)]),
  );
}

function normalizeCustomQuestionTypeTips(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const now = new Date().toISOString();
  return value
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item, index) => {
      const section = ['vocabulary', 'grammar', 'reading', 'listening'].includes(item.section) ? item.section : 'vocabulary';
      const id = typeof item.id === 'string' && /^custom-tip-[a-z0-9_-]{1,80}$/i.test(item.id) ? item.id : `custom-tip-legacy-${index}`;
      return {
        id,
        section,
        title: String(item.title ?? '').trim().slice(0, 80),
        description: String(item.description ?? '').trim().slice(0, 200),
        tip: String(item.tip ?? '').trim().slice(0, 2000),
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
      };
    })
    .filter((item) => item.title && item.tip)
    .slice(0, 80);
}

function normalizeStudyPlanDocument(value) {
  const legacyProfile = value?.profile ?? value;
  const profile = normalizeStudyPlanProfile(legacyProfile);
  const tasks = normalizeStudyPlanTasks(value?.tasks ?? [], profile, false);
  const phases = normalizeStudyPlanPhases(value?.phases ?? [], profile, false);
  return {
    profile,
    status: tasks.length ? (value?.status === 'needs_refresh' ? 'needs_refresh' : 'ready') : 'profile_only',
    tasks,
    phases,
    ...(value?.generatedAt ? { generatedAt: normalizeTimestamp(value.generatedAt) } : {}),
  };
}

function normalizeStudyPlanProfile(value) {
  const fallback = defaultStudyPlanProfile();
  const startDate = normalizeDate(value?.startDate, fallback.startDate);
  const examDate = normalizeDate(value?.examDate, fallback.examDate);
  if (examDate < startDate) {
    throw new Error('Exam date must be on or after the plan start date');
  }
  const materials = Array.isArray(value?.materials)
    ? value.materials.slice(0, 12).map((material, index) => normalizeStudyMaterial(material, index))
    : fallback.materials;
  if (!materials.length) {
    throw new Error('At least one study material is required');
  }
  return {
    level: ['N1', 'N2', 'N3', 'N4', 'N5'].includes(value?.level) ? value.level : fallback.level,
    startDate,
    examDate,
    studyDaysPerWeek: clampInteger(value?.studyDaysPerWeek, 1, 7, fallback.studyDaysPerWeek),
    dailyMinutes: clampInteger(value?.dailyMinutes, 15, 480, fallback.dailyMinutes),
    materials,
    materialStartStatus: ['not_started', 'in_progress', 'reviewing'].includes(value?.materialStartStatus) ? value.materialStartStatus : fallback.materialStartStatus,
    fixedSchedule: String(value?.fixedSchedule ?? '').trim().slice(0, 1000),
    supplementalNeeds: String(value?.supplementalNeeds ?? '').trim().slice(0, 1000),
    phaseStrategy: String(value?.phaseStrategy ?? '').trim().slice(0, 1000),
    postMaterialStrategy: String(value?.postMaterialStrategy ?? '').trim().slice(0, 1000),
    goal: String(value?.goal ?? '').trim().slice(0, 1000),
  };
}

function normalizeStudyMaterial(value, index) {
  const title = String(value?.title ?? '').trim().slice(0, 120);
  if (!title) {
    throw new Error('Every study material needs a name');
  }
  return {
    id: /^[a-z0-9_-]{1,100}$/i.test(value?.id) ? value.id : `material-${index + 1}`,
    title,
    module: ['grammar', 'reading', 'listening', 'vocabulary', 'other'].includes(value?.module) ? value.module : 'other',
    currentPosition: String(value?.currentPosition ?? value?.notes ?? '').trim().slice(0, 1200),
  };
}

function normalizeStudyPlanPhases(value, profile, required = true) {
  if (!Array.isArray(value)) {
    if (required) throw new Error('Generated plan phases must be an array');
    return [];
  }
  const phases = value.slice(0, 12).map((phase, index) => {
    const startDate = clampDate(normalizeDate(phase?.startDate, profile.startDate), profile.startDate, profile.examDate);
    const endDate = clampDate(normalizeDate(phase?.endDate, profile.examDate), profile.startDate, profile.examDate);
    if (endDate < startDate) {
      throw new Error(`Phase ${index + 1} ends before it starts`);
    }
    const focus = String(phase?.focus ?? '').trim().slice(0, 120);
    if (!focus) throw new Error(`Phase ${index + 1} needs a focus`);
    const points = Array.isArray(phase?.points)
      ? phase.points.slice(0, 8).map((point) => String(point ?? '').trim().slice(0, 80)).filter(Boolean)
      : [];
    const goal = String(phase?.goal ?? '').trim().slice(0, 300);
    return {
      id: isIdentifier(phase?.id) ? phase.id : `phase-${index + 1}`,
      startDate,
      endDate,
      focus,
      points,
      ...(goal ? { goal } : {}),
    };
  });
  if (new Set(phases.map((phase) => phase.id)).size !== phases.length) {
    throw new Error('Generated plan phase IDs must be unique');
  }
  return phases.sort((left, right) => left.startDate.localeCompare(right.startDate) || left.id.localeCompare(right.id));
}

function normalizeStudyPlanTasks(value, profile, required = true) {
  if (!Array.isArray(value)) {
    if (required) throw new Error('Generated plan tasks must be an array');
    return [];
  }
  const tasks = value.slice(0, 730).map((task, index) => {
    const date = normalizeDate(task?.date, '');
    if (!date || date < profile.startDate || date > profile.examDate) {
      throw new Error(`Task ${index + 1} has a date outside the study period`);
    }
    const title = String(task?.title ?? '').trim().slice(0, 160);
    if (!title) throw new Error(`Task ${index + 1} needs a title`);
    const id = isIdentifier(task?.id) ? task.id : `task-${date}-${index + 1}`;
    const workloadKind = task?.workloadKind === 'full_mock' ? 'full_mock' : 'standard';
    return {
      id,
      date,
      title,
      module: ['grammar', 'reading', 'listening', 'vocabulary', 'other'].includes(task?.module) ? task.module : 'other',
      minutes: clampInteger(task?.minutes, 5, workloadKind === 'full_mock' ? 240 : profile.dailyMinutes, Math.min(30, profile.dailyMinutes)),
      detail: String(task?.detail ?? '').trim().slice(0, 1000),
      ...(String(task?.sourceLabel ?? '').trim() ? { sourceLabel: String(task.sourceLabel).trim().slice(0, 160) } : {}),
      ...(task?.materialId && /^[a-z0-9_-]{1,100}$/i.test(task.materialId) ? { materialId: task.materialId } : {}),
      ...(workloadKind === 'full_mock' ? { workloadKind } : {}),
      status: ['pending', 'completed', 'skipped', 'missed'].includes(task?.status) ? task.status : 'pending',
      ...(task?.completedAt ? { completedAt: normalizeTimestamp(task.completedAt) } : {}),
    };
  });
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length) {
    throw new Error('Generated plan task IDs must be unique');
  }
  const minutesByDate = new Map();
  for (const task of tasks) {
    minutesByDate.set(task.date, (minutesByDate.get(task.date) ?? 0) + task.minutes);
  }
  const overloadedDate = [...minutesByDate.entries()].find(([date, minutes]) => {
    if (minutes <= profile.dailyMinutes) return false;
    const dayTasks = tasks.filter((task) => task.date === date);
    return !dayTasks.some((task) => task.workloadKind === 'full_mock') || minutes > 240;
  });
  if (overloadedDate) {
    throw new Error(`Tasks on ${overloadedDate[0]} exceed the daily limit of ${profile.dailyMinutes} minutes`);
  }
  return tasks.sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
}

function defaultStudyPlanProfile() {
  return {
    level: 'N1',
    startDate: localDateString(new Date()),
    examDate: '2026-12-06',
    studyDaysPerWeek: 6,
    dailyMinutes: 90,
    materials: [
      {
        id: 'shin-kanzen-grammar',
        title: '新完全掌握 N1 语法',
        module: 'grammar',
        currentPosition: '从第 1 部 文の文法1 开始：ことがらを説明する、時間関係、範囲の始まり・限度、例示、関連・無関係、様子、付随行動、逆接、条件、目的・手段、原因・理由、可能・不可能・禁止、話題・評価、比較対照、結果・最終状態、強調、主張・断定、評価・感想、心情・強制的思い；之后整理文法形式、第 2 部 文の文法2、第 3 部 文章の文法。',
      },
      {
        id: 'shin-kanzen-reading',
        title: '新完全掌握 N1 阅读',
        module: 'reading',
        currentPosition: '从第 1 部 評論・解説・エッセイなど 开始：文章全体の意味、対比、言い換え、比喩、疑問提示文、指示語、だれが/何を、下線部の意味、理由、例；之后广告/通知/说明书/表・リスト，最后实战问题。',
      },
      {
        id: 'shin-kanzen-listening',
        title: '新完全掌握 N1 听力',
        module: 'listening',
        currentPosition: '从音声の特徴开始：似ている音、音の変化や縮約形；之后即時応答、課題理解、ポイント理解、概要理解、統合理解，并在各技能后做確認問題和模擬試験。',
      },
    ],
    materialStartStatus: 'not_started',
    fixedSchedule: '',
    supplementalNeeds: '',
    phaseStrategy: '',
    postMaterialStrategy: '',
    goal: '',
  };
}

function reconcileStudyPlan(plan) {
  const today = localDateString(new Date());
  const tasks = plan.tasks.map((task) => task.status === 'pending' && task.date < today ? { ...task, status: 'missed' } : task);
  const missed = tasks.some((task) => task.status === 'missed');
  return { ...plan, tasks, status: tasks.length ? (missed ? 'needs_refresh' : plan.status) : 'profile_only' };
}

function buildDailySummaries(userId, tasks) {
  const attempts = getPracticeState(userId).attemptHistory.filter((attempt) => attempt.completedAt);
  const dates = new Set([
    ...tasks.map((task) => task.date),
    ...attempts.map((attempt) => dateInTokyo(attempt.completedAt)),
  ]);
  return [...dates]
    .sort((left, right) => right.localeCompare(left))
    .slice(0, 180)
    .map((date) => {
      const dayTasks = tasks.filter((task) => task.date === date);
      const dayAttempts = attempts.filter((attempt) => dateInTokyo(attempt.completedAt) === date);
      const attempted = dayAttempts.reduce((sum, attempt) => sum + (attempt.summary?.total ?? attempt.answers?.length ?? 0), 0);
      const correct = dayAttempts.reduce((sum, attempt) => sum + (attempt.summary?.correct ?? attempt.answers?.filter((answer) => answer.correct).length ?? 0), 0);
      const completedTasks = dayTasks.filter((task) => task.status === 'completed');
      return {
        date,
        attempted,
        correct,
        accuracy: attempted ? correct / attempted : null,
        practiceMinutes: Math.round(dayAttempts.reduce((sum, attempt) => sum + (attempt.summary?.elapsedMs ?? 0), 0) / 60_000),
        plannedTasks: dayTasks.length,
        completedTasks: completedTasks.length,
        plannedMinutes: dayTasks.reduce((sum, task) => sum + task.minutes, 0),
        completedMinutes: completedTasks.reduce((sum, task) => sum + task.minutes, 0),
        note: summaryNote(dayTasks.length, completedTasks.length, attempted),
      };
    });
}

function summaryNote(planned, completed, attempted) {
  if (!planned && !attempted) return 'no_activity';
  if (planned > 0 && completed >= planned) return 'complete';
  if (completed > 0 || attempted > 0) return 'partial';
  return 'not_started';
}

function dateInTokyo(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

function normalizeDate(value, fallback) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime()) ? value : fallback;
}

function isIdentifier(value) {
  return typeof value === 'string' && /^[a-z0-9_-]{1,120}$/i.test(value);
}

function clampDate(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function getPracticeState(userId) {
  ensureSettings(userId);
  const row = getDb()
    .prepare('SELECT attempt_history_json, active_attempt_json FROM practice_state WHERE user_id = ?')
    .get(userId);
  const attemptHistory = parseJson(row?.attempt_history_json, []);
  const activeAttempt = row?.active_attempt_json ? parseJson(row.active_attempt_json, null) : null;
  const needsNames = [...attemptHistory, activeAttempt].some((attempt) => attempt?.view === 'daily-practice' && !attempt.title?.trim());
  const practices = needsNames ? getDb().prepare('SELECT id, title, practice_json FROM daily_practices WHERE user_id = ?').all(userId).map((entry) => {
    const practice = parseJson(entry.practice_json, {});
    return { id: entry.id, title: entry.title, questionIds: (practice.questions ?? []).map((question) => question.id) };
  }) : [];
  return {
    attemptHistory: attemptHistory.map((attempt) => restorePracticeName(attempt, practices)),
    activeAttempt: restorePracticeName(activeAttempt, practices),
  };
}

function upsertPracticeState(userId, attemptHistory, activeAttempt, now = new Date().toISOString()) {
  const current = getPracticeState(userId);
  const history = Array.isArray(attemptHistory) ? attemptHistory.slice(0, 50) : current.attemptHistory;
  const active = activeAttempt === undefined ? current.activeAttempt : activeAttempt;
  getDb()
    .prepare(`
      INSERT INTO practice_state (user_id, attempt_history_json, active_attempt_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        attempt_history_json = excluded.attempt_history_json,
        active_attempt_json = excluded.active_attempt_json,
        updated_at = excluded.updated_at
    `)
    .run(userId, JSON.stringify(history), active ? JSON.stringify(active) : null, now);
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function mapListeningQuestion(row) {
  return {
    id: row.id,
    audioAssetId: row.audio_asset_id ?? undefined,
    libraryNumber: Number(row.library_number),
    title: row.title,
    questionTypeId: normalizeListeningQuestionTypeId(row.question_type_id),
    question: row.question,
    choices: parseJson(row.choices_json, []),
    answerIndex: Number(row.answer_index),
    explanation: row.explanation,
    audioFileName: row.audio_file_name,
    audioMime: row.audio_mime,
    audioSize: Number(row.audio_size),
    createdAt: row.created_at,
  };
}

function mapListeningRecording(row) {
  return {
    id: row.id,
    listeningQuestionId: row.listening_question_id,
    audioMime: row.audio_mime,
    audioSize: Number(row.audio_size),
    status: ['pending', 'analyzing', 'completed', 'failed'].includes(row.status) ? row.status : 'pending',
    analysis: parseJson(row.analysis_json, undefined),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeListeningRecordingAnalysis(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Analysis result is required');
  }
  const summary = String(value.summary ?? '').trim().slice(0, 2000);
  const strengths = Array.isArray(value.strengths) ? value.strengths.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 8) : [];
  const improvements = Array.isArray(value.improvements) ? value.improvements.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 8) : [];
  const nextPractice = String(value.nextPractice ?? '').trim().slice(0, 2000);
  if (!summary || !nextPractice) {
    throw new Error('Analysis requires summary and nextPractice');
  }
  return {
    summary,
    transcript: String(value.transcript ?? '').trim().slice(0, 8000) || undefined,
    referenceTranscript: String(value.referenceTranscript ?? '').trim().slice(0, 8000) || undefined,
    strengths,
    improvements,
    nextPractice,
  };
}

function normalizeListeningQuestionTypeId(value) {
  const id = String(value ?? '').trim();
  return listeningQuestionTypeIds.has(id) ? id : defaultListeningQuestionTypeId;
}

function mapReadingQuestion(row) {
  return {
    id: row.id,
    title: row.title,
    passage: row.passage,
    question: row.question,
    choices: parseJson(row.choices_json, []),
    answerIndex: Number(row.answer_index),
    explanation: row.explanation,
    tags: parseJson(row.tags_json, []),
    explanationNodes: parseJson(row.explanation_nodes_json, []),
    translationLines: parseJson(row.translation_lines_json, []),
    passageTranslation: row.passage_translation ?? '',
    choiceExplanations: parseJson(row.choice_explanations_json, []),
    readingAnalysis: { summary: '', structure: '', keySentences: [], ...parseJson(row.reading_analysis_json, {}) },
    createdAt: row.created_at,
  };
}

function audioExtension(mime) {
  const extensions = {
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/aac': 'aac',
    'audio/flac': 'flac',
  };
  return extensions[mime] ?? 'audio';
}
