import assert from 'node:assert/strict';
import test from 'node:test';
import { findLookupItems } from './word-lookup.mjs';

// Mirrors the exact-match cases in src/domain/wordLookup.test.mjs to keep the two
// implementations behaviorally identical.
const items = [{ id: '1', original: '投げる', reading: 'なげる', conjugations: [{ kind: 'te', form: '投げて' }] }, { id: '2', original: '輪投げ' }];

test('lookup finds dictionary, reading and stored inflections without substring false positives', () => {
  for (const query of ['投げる', 'なげる', ' 投げて ']) assert.equal(findLookupItems(items, query)[0]?.id, '1');
  assert.equal(findLookupItems(items, '投げ').length, 0);
  assert.equal(findLookupItems(items, '').length, 0);
});
