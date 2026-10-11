// 線上移行の通し練習（本番には触らない）：旧い形の DO を書き出し → 手元で v3 に移行・照合 → 新しい DO に書き込み → 通常運転。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { buildCloudApi } from '../scripts/build-cloud-api.mjs';
import { exportDump, buildV3, importV3, checkV3 } from '../scripts/v3/cloud-migration.mjs';

const origin = 'https://jlpt.erzhiqian.cc';
const token = 'm'.repeat(40);

test('export → migrate → import → serve, leaving the old Durable Object untouched', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jlpt-migration-test-'));
  const scriptPath = '.local/cloud-api-build/migration-test.mjs';
  await buildCloudApi('cloudflare/fixtures/runtime.mjs', scriptPath);
  const config = JSON.parse(readFileSync('cloudflare/wrangler.api.json'));
  const worker = (vars) => {
    const options = convertV4MiniflareOptions({ modules: true, scriptPath, compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
      durableObjects: { JLPT_DATABASE: { className: 'JlptDatabase', useSQLite: true } }, r2Buckets: ['MEDIA'], bindings: { ...config.vars, ...vars },
      durableObjectsPersist: join(dir, 'db'), r2Persist: join(dir, 'r2') });
    options.resourcePersistencePath = join(dir, 'state');
    const mf = new Miniflare(options);
    return { mf, fetch: (url, init) => mf.dispatchFetch(url, init) };
  };
  let current;
  try {
    // 1. 旧い DO（primary-v1）を export モードで書き出す
    current = worker({ MIGRATION_MODE: 'export', MIGRATION_TOKEN: token, DATABASE_NAME: 'primary-v1' });
    assert.equal((await current.fetch(`${origin}/__legacy-seed`)).status, 200);
    assert.equal((await current.fetch(`${origin}/__migration/manifest`, { headers: { authorization: `Bearer ${'x'.repeat(40)}` } })).status, 403);
    assert.equal((await current.fetch(`${origin}/api/me`, { headers: { authorization: `Bearer ${token}` } })).status, 405, '通常の API は止まっている');
    const dump = join(dir, 'dump');
    const exported = await exportDump({ origin, token, out: dump, fetch: current.fetch });
    assert.equal(exported.tables.owned_review_items, 2);
    assert.equal(exported.tables.sessions, 1);
    await current.mf.dispose();

    // 2. 手元で v3 に移行して照合
    const v3 = join(dir, 'v3.sqlite');
    const built = buildV3({ dump, out: v3 });
    assert.ok(built.verification.ok, built.verification.output);

    // 3. 新しい DO（primary-v3）に書き込む
    current = worker({ MIGRATION_MODE: 'import', MIGRATION_TOKEN: token, DATABASE_NAME: 'primary-v3' });
    await importV3({ origin, token, db: v3, fetch: current.fetch });
    const checked = await checkV3({ origin, token, db: v3, fetch: current.fetch });
    assert.deepEqual(checked, { ok: true, mismatches: [], foreignKeyViolations: 0 });
    const again = await current.fetch(`${origin}/__migration/schema`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ statements: ['CREATE TABLE x (a)'] }) });
    assert.equal(again.status, 409, '空でない DO には二度と書き込まない');
    await current.mf.dispose();

    // 4. 通常運転：旧いログインがそのまま使え、データは v3
    current = worker({ DATABASE_NAME: 'primary-v3' });
    const get = (path) => current.fetch(`${origin}${path}`, { headers: { authorization: 'Bearer legacy-session-token' } }).then(async (r) => ({ status: r.status, body: await r.json() }));
    assert.equal((await get('/api/me')).body.user.username, 'legacy-learner');
    assert.equal((await get('/api/v3/settings')).body.settings.uiLanguage, 'ja');
    assert.equal((await get('/api/v3/knowledge')).body.total, 2);
    assert.equal((await get('/api/v3/knowledge/lookup?q=ちこく')).body.items[0].expression, '遅刻');
    assert.equal((await get('/api/v3/inbox?status=inbox')).body.items[0].body, '裁量');
    assert.equal((await get('/api/v3/sync')).body.knowledge.total, 2);
    await current.mf.dispose();

    // 5. 旧い DO は手付かず（移行待ちとして止まる＝切り戻し先が残っている）
    current = worker({ DATABASE_NAME: 'primary-v1' });
    assert.equal((await current.fetch(`${origin}/api/health`)).status, 503);
    await current.mf.dispose();
    current = worker({ MIGRATION_MODE: 'export', MIGRATION_TOKEN: token, DATABASE_NAME: 'primary-v1' });
    const status = await (await current.fetch(`${origin}/__migration/status`, { headers: { authorization: `Bearer ${token}` } })).json();
    assert.equal(status.tables.owned_review_items, 2);
    assert.equal(status.tables.knowledge_points, undefined);
  } finally {
    await current?.mf.dispose();
    rmSync(dir, { recursive: true, force: true });
  }
});
