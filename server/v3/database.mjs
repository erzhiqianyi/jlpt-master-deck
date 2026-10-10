// v3 数据库：本地默认 .local/jlpt-v3.sqlite（JLPT_V3_DB_PATH 可改）。
// 不存在时从旧库（JLPT_DB_PATH）迁移生成：先写临时文件，成功后改名，旧库不动。
// 账户（users、sessions）也在这个库里，见 server/accounts.mjs。
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { currentPlatform } from '../platform.mjs';
import { migrateLegacyToV3 } from './migrate/index.mjs';
import { seedReferenceData } from './reference-data.mjs';
import { splitSqlStatements } from '../sql-limits.mjs';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const legacyPath = () => process.env.JLPT_DB_PATH ?? join(root, '.local', 'jlpt.sqlite');
const v3Path = () => process.env.JLPT_V3_DB_PATH ?? join(dirname(legacyPath()), 'jlpt-v3.sqlite');
let db = null;

export const v3DatabasePath = () => resolve(v3Path());

/** アカウントの表（ログイン・セッション・Firebase の紐付け）。v3 の表より先に作る（v3 の表が users を参照する）。 */
export const ACCOUNT_SCHEMA = `
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
  CREATE TABLE IF NOT EXISTS firebase_identities (
    project_id TEXT NOT NULL,
    uid TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    PRIMARY KEY (project_id, uid)
  );`;

/**
 * 空のデータベースに v3 の表と参照データを用意する（Cloudflare の Durable Object 用）。
 * 旧形式のデータが入っていて v3 の表がないときは何もしないで false（移行は別の手順で行う）。
 */
export function installV3Schema(handle, schemaSql) {
  const has = (name) => Boolean(handle.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
  if (!has('knowledge_points')) {
    if (has('cloud_schema_version') || has('owned_review_items')) return false;
    handle.exec(ACCOUNT_SCHEMA);
    // 一文ずつ送る（Workers の SQLite は 100 KB を超える exec を拒否する）。
    for (const statement of splitSqlStatements(schemaSql.replace(/^PRAGMA .*$/gm, ''))) handle.exec(statement);
  }
  handle.exec(ACCOUNT_SCHEMA);
  seedReferenceData(handle);
  return true;
}

/** アップロードされた画像・音声の置き場（v3 データベースの隣）。 */
export const v3MediaDir = () => currentPlatform()?.mediaRoot ?? join(dirname(v3Path()), 'v3-media');

function open(path) {
  const handle = new DatabaseSync(path);
  handle.exec('PRAGMA journal_mode = WAL');
  handle.exec('PRAGMA foreign_keys = ON');
  return handle;
}

/** 从旧库迁移生成 v3 库，迁移报告写在库文件旁边。 */
export function createFromLegacy(target = v3Path(), source = legacyPath()) {
  mkdirSync(dirname(target), { recursive: true });
  const temp = `${target}.migrating`;
  rmSync(temp, { force: true });
  const fresh = new DatabaseSync(temp);
  if (existsSync(source)) {
    const legacy = new DatabaseSync(source, { readOnly: true });
    const { mapping, ...report } = migrateLegacyToV3({ legacy, target: fresh });
    legacy.close();
    writeFileSync(`${target}.migration-report.json`, `${JSON.stringify(report, null, 2)}\n`);
    void mapping;
  } else {
    // 没有旧数据：建一个空库
    const empty = new DatabaseSync(':memory:');
    empty.exec('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL)');
    migrateLegacyToV3({ legacy: empty, target: fresh });
  }
  fresh.close();
  renameSync(temp, target);
}

export function getV3Db() {
  const platform = currentPlatform();
  if (platform?.v3Db) return platform.v3Db;
  if (!db) {
    if (!existsSync(v3Path())) createFromLegacy();
    db = open(v3Path());
    seedReferenceData(db);
  }
  return db;
}

/** 测试用：关闭并忘记当前连接。 */
export function resetV3Db() {
  db?.close();
  db = null;
}

/** 确保用户行和默认设置行存在。 */
export function ensureUser(handle, user) {
  const exists = handle.prepare('SELECT 1 FROM users WHERE id = ?').get(user.id);
  if (!exists) {
  const columns = handle.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  const values = { id: user.id, username: user.username ?? `user${user.id}`, password_hash: '', salt: '', created_at: new Date().toISOString() };
  const used = columns.filter((c) => c in values);
  handle.prepare(`INSERT INTO users (${used.join(', ')}) VALUES (${used.map(() => '?').join(', ')})`).run(...used.map((c) => values[c]));
  }
  const now = new Date().toISOString();
  handle.prepare('INSERT OR IGNORE INTO user_preferences (user_id, created_at, updated_at) VALUES (?, ?, ?)').run(user.id, now, now);
  handle.prepare('INSERT OR IGNORE INTO user_speech_settings (user_id, created_at, updated_at) VALUES (?, ?, ?)').run(user.id, now, now);
}
