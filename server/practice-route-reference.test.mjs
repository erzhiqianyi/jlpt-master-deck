import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'jlpt-practice-route-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const { createUser, getDb, loginUser } = await import('./storage.mjs');
const { createApiHandler } = await import('./api-handler.mjs');
const alice = createUser('route-alice', 'password-one');
const bob = createUser('route-bob', 'password-two');
const handler = createApiHandler({});

function insertPractice(userId, id) {
  getDb().prepare("INSERT INTO daily_practices(id,user_id,practice_date,version,title,minutes,practice_json,created_at,updated_at) VALUES(?,?,'2026-09-27',1,'专项练习',30,?,'2026-09-27','2026-09-27')")
    .run(id, userId, JSON.stringify({ questions: [] }));
}

async function getPractice(path, token) {
  let status;
  let body;
  await handler({ method: 'GET', url: path, headers: { host: 'localhost', authorization: `Bearer ${token}` } }, {
    writeHead(code) { status = code; },
    end(value) { body = JSON.parse(value); },
  });
  return { status, body };
}

after(() => { getDb().close(); rmSync(dir, { recursive: true, force: true }); });

test('practice detail resolves owner-scoped PR links and keeps old ID links working', async () => {
  insertPractice(alice.id, 'daily-2026-09-27-example');
  const aliceToken = loginUser('route-alice', 'password-one').token;
  const bobToken = loginUser('route-bob', 'password-two').token;
  const list = await getPractice('/api/daily-practices', aliceToken);
  const reference = list.body.practices[0].reference;
  assert.match(reference, /^PR-\d{6,}$/);
  const byReference = await getPractice(`/api/daily-practices/${reference}`, aliceToken);
  assert.equal(byReference.status, 200);
  assert.equal(byReference.body.practice.id, 'daily-2026-09-27-example');
  assert.equal((await getPractice('/api/daily-practices/daily-2026-09-27-example', aliceToken)).status, 200);
  assert.equal((await getPractice(`/api/daily-practices/${reference}`, bobToken)).status, 404);
});
