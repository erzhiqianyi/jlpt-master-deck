import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const directory = await mkdtemp(join(tmpdir(), 'jlpt-question-batches-'));
after(() => rm(directory, { recursive: true, force: true }));
const bundle = await rolldown({ input: 'src/domain/questions.ts', platform: 'node' });
await bundle.write({ file: join(directory, 'questions.mjs'), format: 'esm' });
await bundle.close();
const { buildQuestions, buildQuestionIndex } = await import(pathToFileURL(join(directory, 'questions.mjs')).href);
const items = (await Promise.all(['08', '09'].map(async (month) =>
  JSON.parse(await readFile(new URL(`../public/data/review-data/2026/${month}.json`, import.meta.url), 'utf8')).items))).flat();

test('index preserves the complete question count, order, IDs and kinds', () => {
  const expected = buildQuestions(items, 'zh-CN').map(({ id, itemId, kind }) => ({ id, itemId, kind }));
  assert.deepEqual(buildQuestionIndex(items), expected);
  assert.deepEqual(buildQuestionIndex([]), []);
});

test('loading selected items preserves choices and explanations in every locale', () => {
  for (const locale of ['zh-CN', 'en', 'ja']) {
    const full = buildQuestions(items, locale);
    const index = buildQuestionIndex(items);
    // A shuffled selection spans the pool; distractors must still use that full pool.
    const selected = [...index].reverse().filter((_, position) => position % 7 === 0).slice(0, 20);
    const ids = new Set(selected.map((entry) => entry.id));
    const batch = buildQuestions(items, locale, Infinity, new Set(selected.map((entry) => entry.itemId)));
    assert.deepEqual(batch.filter((entry) => ids.has(entry.id)), full.filter((entry) => ids.has(entry.id)));
    assert.deepEqual(buildQuestions(items, locale, Infinity, new Set()), []);
  }
});

test('wordbook-sized and proper-name pools keep accurate indexes', () => {
  for (const subset of [items.slice(0, 8), items.filter((item) => item.deck === 'name_reading'), items.filter((item) => item.deck === 'grammar_expression')]) {
    assert.deepEqual(buildQuestionIndex(subset), buildQuestions(subset, 'zh-CN').map(({ id, itemId, kind }) => ({ id, itemId, kind })));
  }
});
