// 第 6 段階の手順を Miniflare の本物の Durable Object SQLite で通す：
// 旧形式の DO を書き出し → ローカルで v3 に移行 → 新しい DO に取り込み・对账 → DATABASE_NAME で切り替え。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { buildCloudApi } from '../scripts/build-cloud-api.mjs';
import { run } from '../scripts/v3/cloud-migrate.mjs';
import { dumpDatabase } from '../server/v3/dump.mjs';
import { migrateLegacyToV3 } from '../server/v3/migrate/index.mjs';

const origin = 'https://jlpt.erzhiqian.cc';
const token = 'm'.repeat(40);

/** 旧形式（v1）のクラウド DB の最小例：アカウント、Firebase の紐付け、セッション、単語、作答。 */
function legacyDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL);
    CREATE TABLE firebase_identities (project_id TEXT NOT NULL, uid TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id), PRIMARY KEY (project_id, uid));
    CREATE TABLE cloud_schema_version (version INTEGER PRIMARY KEY);
    CREATE TABLE user_settings (user_id INTEGER, settings_json TEXT, updated_at TEXT);
    CREATE TABLE owned_review_items (user_id INTEGER, id TEXT, item_json TEXT, source TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE answers (user_id INTEGER, question_id TEXT, item_id TEXT, selected TEXT, correct INTEGER, answered_at TEXT, submission_state TEXT, answer_event_id TEXT, question_ref_json TEXT, question_kind TEXT);
    CREATE TABLE progress (user_id INTEGER, item_id TEXT, progress_json TEXT, updated_at TEXT);
    INSERT INTO cloud_schema_version VALUES (1);
    INSERT INTO users VALUES (7, 'learner', 'hash', 'salt', '2026-09-01T00:00:00Z');
    INSERT INTO sessions VALUES ('legacy-session-token', 7, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z');
    INSERT INTO firebase_identities VALUES ('jlpt-master-deck', 'firebase-uid', 7);
  `);
  db.prepare('INSERT INTO user_settings VALUES (7, ?, ?)').run(JSON.stringify({ locale: 'ja' }), '2026-09-02T00:00:00Z');
  const item = { id: 'w-gaikan', deck: 'n1_vocab', type: 'vocabulary', original: '概観', reading: 'がいかん', part_of_speech: '名詞・サ変動詞', meaning_zh: '概观',
    examples: [{ ja: '歴史を概観する。', zh: '概览历史。' }] };
  db.prepare('INSERT INTO owned_review_items VALUES (7, ?, ?, ?, ?, ?)').run('w-gaikan', JSON.stringify(item), 'mcp', '2026-09-03T00:00:00Z', '2026-09-03T00:00:00Z');
  db.prepare('INSERT INTO progress VALUES (7, ?, ?, ?)').run('w-gaikan', JSON.stringify({ status: 'review', reviewCount: 3, nextReviewAt: '2026-09-09T00:00:00Z' }), '2026-09-05T00:00:00Z');
  return db;
}

test('a legacy Durable Object is exported, migrated offline, imported into a new one and switched over', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jlpt-migrate-test-'));
  const scriptPath = '.local/cloud-api-build/migration-test.mjs';
  await buildCloudApi('cloudflare/fixtures/runtime.mjs', scriptPath);
  const config = JSON.parse(readFileSync('cloudflare/wrangler.api.json'));
  const options = (vars) => {
    const o = convertV4MiniflareOptions({ modules: true, scriptPath, compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
      durableObjects: { JLPT_DATABASE: { className: 'JlptDatabase', useSQLite: true } }, r2Buckets: ['MEDIA'], bindings: { ...config.vars, MAINTENANCE_TOKEN: token, ...vars },
      durableObjectsPersist: join(dir, 'db'), r2Persist: join(dir, 'r2') });
    o.resourcePersistencePath = join(dir, 'state');
    return o;
  };
  let mf = new Miniflare(options({}));
  const fetchImpl = (url, init) => mf.dispatchFetch(url, init);
  const env = { JLPT_MAINTENANCE_TOKEN: token };
  const logs = [];
  const cli = (...args) => run(args, { env, fetchImpl, log: (line) => logs.push(line) });
  try {
    // 旧形式の DO を用意して再起動する（構築子が旧データを見つけて移行待ちになる）。
    const loaded = await mf.dispatchFetch(origin + '/__load-raw', { method: 'POST', body: JSON.stringify(dumpDatabase(legacyDatabase())) });
    assert.equal(loaded.status, 200, await loaded.clone().text());
    await mf.dispose(); mf = new Miniflare(options({}));
    assert.equal((await mf.dispatchFetch(origin + '/api/me', { headers: { authorization: 'Bearer legacy-session-token' } })).status, 503);

    // 保守 API は正しいトークンがないと存在しないのと同じ。
    assert.equal((await mf.dispatchFetch(origin + '/__maintenance/primary-v1/status')).status, 404);
    assert.equal((await mf.dispatchFetch(origin + '/__maintenance/primary-v1/status', { headers: { authorization: `Bearer ${'x'.repeat(40)}` } })).status, 404);
    await assert.rejects(cli('status', '--url', origin, '--database', 'staging'), /primary-v1/);

    // 1. 書き出し（旧 DO は読むだけ）
    await cli('export', '--url', origin, '--database', 'primary-v1', '--out', join(dir, 'legacy-dump.json'));
    // 2. ローカルの SQLite にして v3 へ移行
    await cli('to-sqlite', '--dump', join(dir, 'legacy-dump.json'), '--out', join(dir, 'legacy.sqlite'));
    const legacy = new DatabaseSync(join(dir, 'legacy.sqlite'), { readOnly: true });
    const target = new DatabaseSync(join(dir, 'v3.sqlite'));
    const report = migrateLegacyToV3({ legacy, target });
    legacy.close(); target.close();
    assert.equal(report.foreignKeyViolations, 0);
    // 3. 取り込み用にまとめ、4. 新しい DO に取り込んで对账
    await cli('package', '--db', join(dir, 'v3.sqlite'), '--out', join(dir, 'v3-dump.json'));
    await assert.rejects(cli('import', '--url', origin, '--database', 'primary-v1', '--dump', join(dir, 'v3-dump.json')), /409.*legacy/, '旧 DO には取り込まない');
    await cli('import', '--url', origin, '--database', 'primary-v3', '--dump', join(dir, 'v3-dump.json'));
    assert.equal(JSON.parse(logs.at(-1)).reconciled, true);
    await assert.rejects(cli('import', '--url', origin, '--database', 'primary-v3', '--dump', join(dir, 'v3-dump.json')), /409.*accounts/, '二度目は上書きしない');

    // 5. 切り替え：同じセッションでログインしたまま、v3 のデータが見える。
    await mf.dispose(); mf = new Miniflare(options({ DATABASE_NAME: 'primary-v3' }));
    const auth = { headers: { authorization: 'Bearer legacy-session-token' } };
    const me = await mf.dispatchFetch(origin + '/api/me', auth);
    assert.equal(me.status, 200, await me.clone().text());
    assert.equal((await me.json()).user.username, 'learner');
    const knowledge = await (await mf.dispatchFetch(origin + '/api/v3/knowledge', auth)).json();
    assert.deepEqual(knowledge.items.map((k) => k.expression), ['概観']);
    assert.equal((await (await mf.dispatchFetch(origin + '/api/v3/settings', auth)).json()).settings.uiLanguage, 'ja');

    // 旧 DO は手を付けずに残っている（戻すときは DATABASE_NAME を戻す）。
    const old = await (await mf.dispatchFetch(origin + '/__maintenance/primary-v1/status', { headers: { authorization: `Bearer ${token}` } })).json();
    assert.equal(old.legacy, true);
    assert.equal(old.tables.find((t) => t.name === 'owned_review_items').count, 1);
  } finally { await mf.dispose(); rmSync(dir, { recursive: true, force: true }); }
});
