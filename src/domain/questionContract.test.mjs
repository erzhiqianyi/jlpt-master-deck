import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questionStrategy, resolveLegacyAnswer } from './questionContract.mjs';
test('taxonomy retains aliases and separates official types from supplementary', () => {
  assert.equal(questionStrategy('meaning').id, 'vocabulary-paraphrase');
  assert.equal(questionStrategy('文の組み立て').id, 'grammar-composition');
  assert.equal(questionStrategy('grammar').id, 'grammar-form');
  assert.equal(questionStrategy('unclassified').supplementary, true);
  assert.deepEqual(questionStrategy('word_formation').applicableLevels, ['N2']);
  assert.equal(questionStrategy('listening-expression').module, 'listening');
  assert.equal(questionStrategy('unknown'), null);
});
test('legacy answer contract preserves order and requires explicit numeric base', () => {
  const choices = ['a','b','c','d'];
  assert.equal(resolveLegacyAnswer({choices,answerIndex:0}).answer.optionId, 'option-0');
  assert.equal(resolveLegacyAnswer({choices,answer:0},{numericAnswerBase:0}).answerIndex, 0);
  assert.equal(resolveLegacyAnswer({choices,answer:1},{numericAnswerBase:1}).answerIndex, 0);
  assert.throws(() => resolveLegacyAnswer({choices,answer:1}), /explicit source base/);
  assert.throws(() => resolveLegacyAnswer({choices,answerIndex:0,answer:'b'}), /Conflicting/);
  assert.throws(() => resolveLegacyAnswer({choices:['a','a'],answer:'a'}), /exactly one/);
  assert.throws(() => resolveLegacyAnswer({choices,answerIndex:4}), /Invalid/);
  const result = resolveLegacyAnswer({choices,answer:'d'});
  assert.deepEqual(result.options.map(option => option.text), choices);
  assert.equal(result.answerIndex,3);
});
