// オフライン端末向け同期：小さなページで最後まで読むと全記録がちょうど一度ずつ返り、
// 途中の追加でページがずれず、他人の記録は出ず、壊れた cursor は拒否される。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const dir = mkdtempSync(join(tmpdir(), 'v3-sync-'));
process.env.JLPT_DB_PATH = join(dir, 'legacy.sqlite');
process.env.JLPT_V3_DB_PATH = join(dir, 'v3.sqlite');
const { v3Tools } = await import('../server/v3/mcp-tools.mjs');
const { getV3Db, ensureUser, resetV3Db } = await import('../server/v3/database.mjs');
const { syncPage } = await import('../server/v3/repo/sync.mjs');
const byName = Object.fromEntries(v3Tools.map((t) => [t.name, t]));
const call = async (name, args = {}, ownerId = '1') => byName[name].handler(z.object(byName[name].inputSchema).parse(args), { ownerId });
test.after(() => { resetV3Db(); rmSync(dir, { recursive: true, force: true }); });

function traverse(db, userId, limit) {
  const records = [];
  let cursor;
  let pages = 0;
  do {
    const page = syncPage(db, userId, { cursor, limit });
    assert.ok(page.records.length <= limit);
    records.push(...page.records);
    cursor = page.nextCursor;
    pages += 1;
  } while (cursor);
  return { records, pages };
}

test('a sync traversal returns every record once, in collection order, for the owner only', async () => {
  await call('create_wordbook', { title: '词汇' });
  for (const word of ['捉える', '概観', '把握', '漠然', '顕著']) await call('create_knowledge_point', { kind: 'word', wordbook: 'WB1', expression: word, meaning: word });
  await call('create_learning_capture', { body: '面目躍如' });
  await call('create_wordbook', { title: '他人' }, '2');
  await call('create_knowledge_point', { kind: 'word', wordbook: 'WB1', expression: '他人の語', meaning: 'x' }, '2');
  const db = getV3Db();
  ensureUser(db, { id: 1 });

  const { records, pages } = traverse(db, 1, 2);
  assert.ok(pages > 3);
  assert.deepEqual([...new Set(records.map((r) => r.collection))], ['settings', 'wordbooks', 'plan', 'inbox', 'drafts', 'attempts', 'ratings', 'knowledge']);
  const knowledge = records.filter((r) => r.collection === 'knowledge');
  assert.deepEqual(knowledge.map((r) => r.code), ['W1', 'W2', 'W3', 'W4', 'W5']);
  assert.equal(knowledge[0].value.expression, '捉える');
  assert.ok(knowledge[0].value.review, 'details carry the review schedule for offline review');
  assert.deepEqual(records.find((r) => r.collection === 'inbox').value.map((c) => c.body), ['面目躍如']);
  assert.ok(!JSON.stringify(records).includes('他人の語'));
});

test('pages advance by rid, so records added mid-traversal do not shift earlier pages', async () => {
  const db = getV3Db();
  let page = syncPage(db, 1, { limit: 5 });
  while (!page.records.some((r) => r.collection === 'knowledge')) page = syncPage(db, 1, { cursor: page.nextCursor, limit: 5 });
  const seen = page.records.filter((r) => r.collection === 'knowledge').map((r) => r.code);
  await call('create_knowledge_point', { kind: 'word', wordbook: 'WB1', expression: '新規', meaning: 'new' });
  const rest = [];
  for (let cursor = page.nextCursor; cursor;) { const next = syncPage(db, 1, { cursor, limit: 5 }); rest.push(...next.records.filter((r) => r.collection === 'knowledge').map((r) => r.code)); cursor = next.nextCursor; }
  assert.deepEqual([...seen, ...rest], ['W1', 'W2', 'W3', 'W4', 'W5', 'W6']);
});

test('limits and cursors are validated', () => {
  const db = getV3Db();
  for (const limit of [0, 201, 1.5, 'x']) assert.throws(() => syncPage(db, 1, { limit }), /limit/);
  for (const cursor of ['garbage', Buffer.from(JSON.stringify({ v: 1, c: 99, after: 0, at: 'x' })).toString('base64url')]) assert.throws(() => syncPage(db, 1, { cursor }), /cursor/);
});
