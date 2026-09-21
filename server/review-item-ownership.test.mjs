import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateReviewItemOwnership } from './review-item-ownership.mjs';
import { transaction, withPlatform } from './platform.mjs';

const dir = mkdtempSync(join(tmpdir(), 'jlpt-ownership-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const { getDb, createUser, createWordbook, loadReviewData, organizeReviewItem, upsertReviewItem } = await import('./storage.mjs');
const { tools } = await import('./mcp-tools.mjs');
const db = getDb();
const alice = createUser('alice', 'test-password');
const bob = createUser('bob', 'test-password');
const ctx = user => ({ ownerId: String(user.id) });
const call = async (name, args, user) => {
  const result = await tools.find(tool => tool.name === name).handler(args, ctx(user));
  return result.structuredContent ?? JSON.parse(result.content[0].text);
};
const item = { id: 'legacy', deck: 'grammar_expression', type: 'grammar', original: '〜にほかならない', meaning_zh: '正是' };

test('legacy migration copies every item to existing users once, preserving the original and later edits', async () => {
  const book = createWordbook(alice.id, { title: '私の文法', deck: 'grammar_expression' });
  db.prepare('INSERT INTO review_items VALUES (?, ?, ?, ?, ?)').run(item.id, JSON.stringify({ ...item, wordbook_id: book.id }), 'mcp', '2026-09-01', '2026-09-01');
  // Reproduce a pre-upgrade database with existing users and an unowned library.
  db.prepare('DELETE FROM review_item_migrations').run();
  transaction(db, () => migrateReviewItemOwnership(db));
  assert.equal(loadReviewData(alice.id).items[0].wordbook_id, book.id);
  assert.equal(loadReviewData(bob.id).items[0].wordbook_id, 'grammar_expression');
  organizeReviewItem(alice.id, item.id, { tags: ['alice-only'] });
  assert.deepEqual(loadReviewData(bob.id).items[0].tags, []);
  const charlie = createUser('charlie', 'test-password');
  transaction(db, () => migrateReviewItemOwnership(db));
  assert.deepEqual(loadReviewData(charlie.id).items, []);
  assert.deepEqual(loadReviewData(alice.id).items[0].tags, ['alice-only']);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM owned_review_items').get().n, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM review_items').get().n, 1);
  // Same legacy id is independently editable by both owners.
  await call('upsert_review_item', { item: { ...item, meaning_zh: 'Bob 的版本' } }, bob);
  assert.equal(loadReviewData(alice.id).items[0].meaning_zh, '正是');
  assert.equal(loadReviewData(bob.id).items[0].meaning_zh, 'Bob 的版本');
});

test('MCP save, read, query, aggregate, get, organize and export are account scoped', async () => {
  const privateItem = { ...item, id: 'alice-private', original: '〜を余儀なくされる' };
  await call('upsert_review_item', { item: privateItem }, alice);
  assert.ok((await call('get_review_data', {}, alice)).items.some(row => row.id === privateItem.id));
  assert.ok(!(await call('get_review_data', {}, bob)).items.some(row => row.id === privateItem.id));
  assert.equal(organizeReviewItem(bob.id, privateItem.id, { tags: ['stolen'] }), null);
  const query = await call('jlpt_query', { entity: 'item', filters: [{ field: 'id', op: 'eq', value: privateItem.id }] }, bob);
  assert.equal(query.data.records.length, 0);
  const aggregate = await call('jlpt_aggregate', { entity: 'item', filters: [{ field: 'id', op: 'eq', value: privateItem.id }] }, bob);
  assert.equal(aggregate.data.groups[0].item_count, 0);
  assert.equal((await call('jlpt_get', { entity: 'item', id: privateItem.id }, bob)).error.code, 'NOT_FOUND');
  assert.throws(() => upsertReviewItem(privateItem), /Authenticated user/);
  const writes = new Map();
  await withPlatform({ db, files: { readdirSync: () => [], existsSync: () => false, mkdirSync() {}, writeFileSync: (path, data) => writes.set(path, data) } }, async () => {
    await call('export_review_data_backup', {}, bob);
  });
  assert.ok(writes.size > 0);
  for (const [path, content] of writes) {
    assert.ok(path.includes(`/review-backups/${bob.id}/`));
    assert.ok(!content.includes(privateItem.id));
  }
  // An identical client-provided ID creates Bob's copy without touching Alice's.
  await call('upsert_review_item', { item: { ...privateItem, meaning_zh: 'Bob private' } }, bob);
  assert.equal(loadReviewData(alice.id).items.find(row => row.id === privateItem.id).meaning_zh, '正是');
});
