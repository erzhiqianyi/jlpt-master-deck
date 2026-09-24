import assert from 'node:assert/strict';
import test from 'node:test';
import { findLookupItems, segmentJapanese } from './wordLookup.ts';
const items = [{ id: '1', original: '投げる', reading: 'なげる', conjugations: [{ kind: 'te', form: '投げて' }] }, { id: '2', original: '輪投げ' }];
test('lookup finds dictionary, reading and stored inflections without substring false positives', () => {
  for (const query of ['投げる', 'なげる', ' 投げて ']) assert.equal(findLookupItems(items, query)[0]?.id, '1');
  assert.equal(findLookupItems(items, '投げ').length, 0);
  assert.equal(findLookupItems(items, '').length, 0);
});
test('segmentation preserves the sentence and keeps particles queryable', () => {
  const text = '輪投げのコーナーに人が並んでいる。\n輪を投げて遊ぶ。';
  const result = segmentJapanese(text, new Set(['輪投げ', '投げて']));
  assert.equal(result.map((part) => part.text).join(''), text);
  assert.ok(result.some((part) => part.word && part.text === '投げて'));
  assert.ok(result.some((part) => part.word && part.text === 'の'));
  assert.ok(result.some((part) => !part.word && part.text === '。'));
});
