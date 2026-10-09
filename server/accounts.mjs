// アカウント：ユーザー・ログインセッション・Firebase の紐付け。データベースは v3 の一つだけ。
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { currentPlatform } from './platform.mjs';
import { getV3Db, ensureUser, v3DatabasePath, ACCOUNT_SCHEMA } from './v3/database.mjs';
import { ensureTtsSchema } from './tts/schema.mjs';
import { ensureCacheSchema } from './tts/cache.mjs';

const ready = new WeakSet();

/** 唯一のデータベース。Cloudflare では Durable Object の SQLite、ローカルでは v3 のファイル。 */
export function getDb() {
  const db = currentPlatform()?.v3Db ?? getV3Db();
  if (!ready.has(db)) { db.exec(ACCOUNT_SCHEMA); ensureTtsSchema(db); ensureCacheSchema(db); ready.add(db); }
  return db;
}

export function databasePath() {
  return v3DatabasePath();
}

function normalizeUsername(username) {
  const value = String(username ?? '').trim();
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(value)) throw new Error('Username must be 3-32 letters, numbers, underscores, or hyphens');
  return value;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 4 || password.length > 128) throw new Error('Password must be 4-128 characters');
}

const hashPassword = (password, salt) => scryptSync(password, salt, 64).toString('hex');

function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function openSession(db, userId) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)').run(token, userId, now, now);
  return token;
}

/** ユーザーを作り、設定の行も用意する。 */
export function createUser(username, password) {
  const name = normalizeUsername(username);
  validatePassword(password);
  const db = getDb();
  const salt = randomBytes(16).toString('hex');
  const result = db.prepare('INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)')
    .run(name, hashPassword(password, salt), salt, new Date().toISOString());
  const user = { id: Number(result.lastInsertRowid), username: name };
  ensureUser(db, user);
  return user;
}

export function loginUser(username, password) {
  const name = normalizeUsername(username);
  const db = getDb();
  const row = db.prepare('SELECT id, username, password_hash, salt FROM users WHERE username = ?').get(name);
  if (!row || !verifyPassword(password, row.salt, row.password_hash)) return null;
  ensureUser(db, row);
  return { token: openSession(db, row.id), user: { id: row.id, username: row.username } };
}

/** 同意を与えたユーザーがまだ存在するか。 */
export function userById(id) {
  const row = getDb().prepare('SELECT id, username FROM users WHERE id = ?').get(Number(id));
  return row ? { id: row.id, username: row.username } : null;
}

export function userForToken(token) {
  if (!token) return null;
  const db = getDb();
  const row = db.prepare('SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?').get(token);
  if (!row) return null;
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token = ?').run(new Date().toISOString(), token);
  return { id: row.id, username: row.username };
}

export function deleteSession(token) {
  if (token) getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}
