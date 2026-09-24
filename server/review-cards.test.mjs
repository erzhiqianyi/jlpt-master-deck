import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
const dir = mkdtempSync(join(tmpdir(), 'jlpt-cards-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const s = await import('./storage.mjs');
const { tools } = await import('./mcp-tools.mjs');
const tool = tools.find((entry) => entry.name === 'get_review_cards');
const alice = s.createUser('cards-alice', 'test-password');
const bob = s.createUser('cards-bob', 'test-password');
const call = async (user, args = {}) => (await tool.handler(z.object(tool.inputSchema).parse(args), { ownerId: String(user.id) })).structuredContent;
after(() => { s.getDb().close(); rmSync(dir, { recursive: true, force: true }); });

const book = s.createWordbook(alice.id, { title: 'カード', deck: 'grammar_expression' });
for (const [user, id, original] of [[alice, 'a1', '〜にほかならない'], [alice, 'a2', '〜まみれ'], [alice, 'a3', '〜に限る'], [bob, 'b1', 'private']]) {
  s.upsertReviewItem({ id, deck: 'grammar_expression', type: 'grammar', original, meaning_zh: '含义', core_memory: '记忆点', wordbook_id: user === alice ? book.id : 'grammar_expression' }, { userId: user.id });
}
s.getDb().prepare("INSERT INTO progress VALUES (?,'a3',?,'2026-09-24')").run(alice.id, JSON.stringify({ nextReviewAt: '2999-01-01T00:00:00.000Z', status: 'review' }));

test('due filtering, pagination and ownership remain independent', async () => {
  const result = await call(alice, { limit: 1 });
  assert.equal(result.total, 2);
  assert.equal(result.cards.length, 1);
  assert.equal(result.next_offset, 1);
  const next = await call(alice, { limit: 1, offset: 1 });
  assert.notEqual(next.cards[0].id, result.cards[0].id);
  assert.equal(next.next_offset, null);
  assert.equal((await call(alice, { only_due: false })).total, 3);
  assert.equal((await call(bob)).total, 1);
  assert.equal((await call(bob, { wordbook_id: book.id })).total, 0);
  assert.equal((await call(alice, { deck: 'n1_vocab' })).total, 0);
  assert.equal((await call(alice, { offset: 50 })).cards.length, 0);
});

test('saved front/back fields are honored without returning private paths or changing mastery', async () => {
  s.saveSettings(alice.id, { memoryCardFrontFields: ['original'], memoryCardBackFields: ['meaning', 'core_memory'], locale: 'zh-CN' });
  const before = s.getStudyState(alice.id);
  const result = await call(alice);
  assert.deepEqual(result.cards[0].front.map((entry) => entry.field), ['original']);
  assert.deepEqual(result.cards[0].back.map((entry) => entry.field), ['meaning', 'core_memory']);
  assert.equal(result.cards[0].back[0].lines[0], '含义');
  assert.ok(!JSON.stringify(result).includes('export_backup'));
  assert.deepEqual(s.getStudyState(alice.id), before);
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.throws(() => z.object(tool.inputSchema).parse({ limit: 100 }));
});
