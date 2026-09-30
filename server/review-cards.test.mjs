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
const { rateReviewCard } = await import('./review-cards.mjs');
const { getAiLearningHome } = await import('./ai-learning-home.mjs');
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

test('rating saves the review interval, removes a card from due, and keeps owner isolation', async () => {
  const now = new Date('2026-09-30T06:00:00.000Z');
  const before = getAiLearningHome(alice.id, now);
  assert.equal(before.due.total, 2);
  assert.equal(before.reviewed_today, 0);
  const saved = rateReviewCard(alice.id, 'a1', 'remembered', now);
  assert.equal(saved.progress.nextReviewAt, '2026-10-03T06:00:00.000Z');
  assert.equal(saved.progress.reviewCount, 1);
  assert.equal(saved.progress.correct, 1);
  assert.equal(getAiLearningHome(alice.id, now).due.total, 1);
  assert.equal(getAiLearningHome(alice.id, now).reviewed_today, 1);
  assert.throws(() => rateReviewCard(bob.id, 'a2', 'easy', now), /not found/);
  assert.throws(() => rateReviewCard(alice.id, 'a2', 'unrated', now), /Invalid card rating/);
  const forgot = rateReviewCard(alice.id, 'a2', 'forgot', now);
  assert.equal(forgot.progress.nextReviewAt, '2026-09-30T06:10:00.000Z');
  assert.equal(forgot.progress.wrong, 1);
});
