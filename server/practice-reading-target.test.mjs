import test from 'node:test';
import assert from 'node:assert/strict';
import { repairReadingTarget } from './practice-reading-target.mjs';
test('reading target uses authored kanji, preserving answers and question identity', () => {
  const question = { id: 'q1', kind: 'kanji_to_kana', prompt: '糖尿病や高血圧のデータ', promptTarget: 'とうにょうびょう', memoryPoint: '糖尿病', choices: ['とうにょうびょう', 'とうびょう'], answer: 'とうにょうびょう' };
  const result = repairReadingTarget(question);
  assert.deepEqual(result, { ...question, promptTarget: '糖尿病' });
  assert.deepEqual(repairReadingTarget(result), result);
  assert.equal(repairReadingTarget({ ...question, promptTarget: '高血圧' }).promptTarget, '高血圧');
  assert.equal(repairReadingTarget({ ...question, memoryPoint: '不在词' }).promptTarget, question.promptTarget);
  assert.equal(repairReadingTarget({ ...question, kind: 'grammar' }).promptTarget, question.promptTarget);
});
