import { createHmac, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { currentPlatform } from '../platform.mjs';
import { getDb, databasePath } from '../storage.mjs';
import { ttsSecretKey } from './secret-key.mjs';

const DAY = 86400000;
const queues = new WeakMap();
const validKey = /^tts-cache\/v1\/[a-f0-9]{64}\/[a-f0-9]{32}$/;
export function cachePolicy(env = currentPlatform()?.ttsCacheEnv ?? process.env) {
  const number = (key, fallback) => { const n = Number(env[key]); return Number.isFinite(n) && n > 0 ? n : fallback; };
  return { idle: number('TTS_CACHE_IDLE_DAYS', 30) * DAY, age: number('TTS_CACHE_MAX_DAYS', 180) * DAY,
    bytes: number('TTS_CACHE_MAX_BYTES', 200 * 1024 * 1024), entries: number('TTS_CACHE_MAX_ENTRIES', 2000), enabled: env.TTS_CACHE_ENABLED !== 'false' };
}
export function ensureCacheSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS tts_audio_cache (
    cache_key TEXT PRIMARY KEY, user_id INTEGER NOT NULL, object_key TEXT NOT NULL,
    mime TEXT NOT NULL, size INTEGER NOT NULL, created INTEGER NOT NULL, accessed INTEGER NOT NULL,
    ready INTEGER NOT NULL DEFAULT 0
  ); CREATE INDEX IF NOT EXISTS tts_cache_user_access ON tts_audio_cache(user_id, accessed);`);
}
export function cacheObjects() {
  const bucket = currentPlatform()?.ttsCacheBucket;
  const root = resolve(process.env.JLPT_TTS_CACHE_PATH || join(dirname(databasePath()), 'tts-cache'));
  const check = key => { if (!validKey.test(key)) throw new Error('Invalid TTS cache object'); return key; };
  return {
    async get(key) { check(key); if (bucket) { const object = await bucket.get(key); return object ? Buffer.from(await object.arrayBuffer()) : null; }
      try { return await readFile(join(root, key)); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
    async put(key, audio) { check(key); if (bucket) return bucket.put(key, audio); const path = join(root, key); await mkdir(dirname(path), { recursive: true }); await writeFile(path, audio); },
    async remove(key) { check(key); if (bucket) return bucket.delete(key); const path = join(root, key); try { await unlink(path); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      try { await rmdir(dirname(path)); } catch (e) { if (!['ENOENT', 'ENOTEMPTY'].includes(e.code)) throw e; } },
  };
}
// Per-user serialization also keeps capacity enforcement atomic within the Node process.
// Cloud requests already run in the single database Durable Object's concurrency gate.
function serial(db, userId, run) {
  let users = queues.get(db); if (!users) queues.set(db, users = new Map());
  const previous = users.get(userId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(run); users.set(userId, next);
  return next.finally(() => { if (users.get(userId) === next) users.delete(userId); });
}
async function cleanupUnlocked({ db = getDb(), objects = cacheObjects(), policy = cachePolicy(), now = Date.now(), userId, budget } = {}) {
  ensureCacheSchema(db);
  const rows = userId === undefined ? db.prepare('SELECT * FROM tts_audio_cache ORDER BY accessed DESC, cache_key').all()
    : db.prepare('SELECT * FROM tts_audio_cache WHERE user_id = ? ORDER BY accessed DESC, cache_key').all(userId);
  const totals = new Map(); let removed = 0;
  for (const row of rows) {
    // Failed deletes back off for an hour so one bad batch cannot starve others.
    // ready=-1 uses accessed as retry-after; these rows are never cache hits.
    if (row.ready === -1 && row.accessed > now) continue;
    const total = totals.get(row.user_id) ?? { bytes: 0, entries: 0 }; totals.set(row.user_id, total);
    const expired = row.ready !== 1 || now - row.accessed >= policy.idle || now - row.created >= policy.age;
    const over = total.bytes + row.size > policy.bytes || total.entries + 1 > policy.entries;
    if (expired || over) {
      if (budget && (budget.remaining <= 0 || Date.now() >= budget.deadline)) break;
      if (budget) budget.remaining--;
      // Tombstones survive failed deletes; never trust arbitrary paths from metadata.
      db.prepare('UPDATE tts_audio_cache SET ready = 0 WHERE cache_key = ?').run(row.cache_key);
      try { await objects.remove(row.object_key); db.prepare('DELETE FROM tts_audio_cache WHERE cache_key = ?').run(row.cache_key); removed++; } catch { db.prepare('UPDATE tts_audio_cache SET ready = -1, accessed = ? WHERE cache_key = ?').run(now + 3600000, row.cache_key); }
    } else { total.bytes += row.size; total.entries++; }
  }
  return removed;
}
// Maintenance shares request locks in-process. External Node maintenance must run
// while the single server process is stopped (there is no cross-process lease).
export async function cleanupTtsCache(options = {}) {
  const db = options.db ?? getDb();
  ensureCacheSchema(db);
  const users = options.userId === undefined
    ? db.prepare('SELECT DISTINCT user_id FROM tts_audio_cache').all().map(row => row.user_id)
    : [options.userId];
  let removed = 0;
  for (const userId of users) {
    if (options.budget && (options.budget.remaining <= 0 || Date.now() >= options.budget.deadline)) break;
    removed += await serial(db, userId, () => cleanupUnlocked({ ...options, db, userId }));
  }
  return removed;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export async function cachedSpeech(userId, identity, synthesize, options = {}) {
  const db = options.db ?? getDb(), policy = options.policy ?? cachePolicy(), objects = options.objects ?? cacheObjects();
  if (!policy.enabled) { options.validate?.(); const result = await synthesize(); options.validate?.(); return result; }
  const secret = options.secret ?? ttsSecretKey();
  const key = createHmac('sha256', secret).update(JSON.stringify([userId, canonical(identity)])).digest('hex');
  return serial(db, userId, async () => {
    const now = options.now?.() ?? Date.now();
    options.validate?.();
    let available = true;
    const budget = { remaining: 20, deadline: Date.now() + 5000 };
    try {
      ensureCacheSchema(db);
      await cleanupUnlocked({ db, objects, policy, now, userId, budget });
      const row = db.prepare('SELECT * FROM tts_audio_cache WHERE cache_key = ? AND user_id = ? AND ready = 1 AND accessed > ? AND created > ?').get(key, userId, now - policy.idle, now - policy.age);
      if (row) {
        const audio = await objects.get(row.object_key);
        if (audio?.length === row.size) { options.validate?.(); db.prepare('UPDATE tts_audio_cache SET accessed = ? WHERE cache_key = ?').run(now, key); return { audio, mimeType: row.mime }; }
        db.prepare('UPDATE tts_audio_cache SET ready = 0 WHERE cache_key = ?').run(key);
        await cleanupUnlocked({ db, objects, policy, now, userId, budget });
      }
    } catch (error) { if (error.statusCode) throw error; available = false; }
    const result = await synthesize(); // Failures must propagate, never cache an error.
    options.validate?.();
    if (!available || !result.audio?.length || result.audio.length > policy.bytes) return result;
    const objectKey = `tts-cache/v1/${key}/${randomBytes(16).toString('hex')}`;
    try {
      // Reserve capacity BEFORE uploading. Failed-delete tombstones still occupy
      // physical space, so refuse new writes when that space cannot be reclaimed.
      await cleanupUnlocked({ db, objects, policy: { ...policy, bytes: policy.bytes - result.audio.length, entries: policy.entries - 1 }, now, userId, budget });
      const used = db.prepare('SELECT COALESCE(SUM(size), 0) AS bytes, COUNT(*) AS entries FROM tts_audio_cache WHERE user_id = ?').get(userId);
      if (used.bytes + result.audio.length > policy.bytes || used.entries + 1 > policy.entries) { options.validate?.(); return result; }
      // Record pending write first, so interrupted uploads can be collected later.
      const inserted = db.prepare(`INSERT OR IGNORE INTO tts_audio_cache(cache_key,user_id,object_key,mime,size,created,accessed,ready) VALUES(?,?,?,?,?,?,?,0)`)
        .run(key, userId, objectKey, result.mimeType, result.audio.length, now, now);
      if (!Number(inserted.changes)) { options.validate?.(); return result; }
      await objects.put(objectKey, result.audio);
      db.prepare('UPDATE tts_audio_cache SET ready = 1 WHERE cache_key = ?').run(key);
      await cleanupUnlocked({ db, objects, policy, now, userId, budget });
    } catch (error) { if (error.statusCode) throw error; /* Storage failures preserve usable audio. */ }
    options.validate?.();
    return result;
  });
}
