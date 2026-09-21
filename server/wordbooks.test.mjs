import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'jlpt-wordbooks-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const { createUser, createWordbook, listWordbooks, loadReviewData, organizeReviewItem, upsertReviewItem, createLearningCapture } = await import('./storage.mjs');

const user = createUser('organizer', 'test-pass');
const grammarItem = { id: 'g1', deck: 'grammar_expression', type: 'grammar', original: '〜にほかならない', meaning_zh: '正是', core_memory: '', wordbook_ids: ['grammar_expression', 'wordbook-old'], tags: ['断定', '断定', ' ', 'N1'] };

test('built-in wordbooks cover both families', () => {
  const books = listWordbooks(user.id);
  assert.deepEqual(books.map((book) => book.id), ['n1_vocab', 'name_reading', 'grammar_expression']);
});

test('legacy wordbook_ids collapse to a single wordbook_id and tags are deduplicated', () => {
  const stored = upsertReviewItem(grammarItem, { userId: user.id });
  assert.equal(stored.wordbook_id, 'grammar_expression');
  assert.equal(stored.wordbook_ids, undefined);
  assert.deepEqual(stored.tags, ['断定', 'N1']);
});

test('an item moves between wordbooks of its own family only, keeping all its tags', () => {
  const grammarBook = createWordbook(user.id, { title: '接续易错', deck: 'grammar_expression' });
  const moved = organizeReviewItem(user.id, 'g1', { wordbookId: grammarBook.id, tags: ['断定', '书面语'] });
  assert.equal(moved.wordbook_id, grammarBook.id);
  assert.deepEqual(moved.tags, ['断定', '书面语']);
  assert.throws(() => organizeReviewItem(user.id, 'g1', { wordbookId: 'n1_vocab' }), /same kind/);
  assert.throws(() => organizeReviewItem(user.id, 'g1', { wordbookId: 'missing' }), /not found/);
  assert.equal(organizeReviewItem(user.id, 'nope', { tags: [] }), null);
  const item = loadReviewData(user.id).items.find((entry) => entry.id === 'g1');
  assert.equal(item.wordbook_id, grammarBook.id);
});

test('grammar captures can target a custom grammar wordbook but never a vocabulary one', () => {
  const grammarBook = listWordbooks(user.id).find((book) => !book.builtIn);
  assert.equal(createLearningCapture(user.id, { body: 'x', category: 'grammar', targetWordbookId: grammarBook.id }).targetWordbookId, grammarBook.id);
  assert.equal(createLearningCapture(user.id, { body: 'y', category: 'grammar', targetWordbookId: 'n1_vocab' }).targetWordbookId, 'grammar_expression');
  assert.equal(createLearningCapture(user.id, { body: 'z', category: 'word', targetWordbookId: grammarBook.id }).targetWordbookId, 'n1_vocab');
});
