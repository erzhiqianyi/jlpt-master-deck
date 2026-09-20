import test from 'node:test';
import assert from 'node:assert/strict';
import { restorePracticeName } from './practice-names.mjs';

const practice = { id: 'daily-1', title: '9月14日弱点强化｜语法与阅读', questionIds: ['a', 'b'] };
const legacy = { view: 'daily-practice', questionIds: ['b', 'a'], answers: [] };

test('restores the original title for an exact unordered question set', () => {
  assert.deepEqual(restorePracticeName(legacy, [practice]), { ...legacy, title: practice.title, practiceId: practice.id });
});
test('does not guess from partial, empty, ambiguous or other-module records', () => {
  for (const attempt of [{ ...legacy, questionIds: ['a'] }, { ...legacy, questionIds: [] }, { ...legacy, view: 'mixed' }]) {
    assert.equal(restorePracticeName(attempt, [practice]), attempt);
  }
  assert.equal(restorePracticeName(legacy, [practice, { ...practice, id: 'daily-2' }]), legacy);
});
test('preserves saved names after the source is renamed or deleted', () => {
  const saved = { ...legacy, title: '原始练习名', practiceId: practice.id };
  assert.equal(restorePracticeName(saved, [practice]), saved);
  assert.equal(restorePracticeName(saved, []), saved);
});
test('uses a saved source ID even if its questions changed, without matching another source', () => {
  const saved = { ...legacy, practiceId: practice.id, questionIds: ['c'] };
  assert.equal(restorePracticeName(saved, [practice]).title, practice.title);
  assert.equal(restorePracticeName({ ...saved, practiceId: 'deleted' }, [practice]).title, undefined);
  assert.equal(restorePracticeName(null, [practice]), null);
});
