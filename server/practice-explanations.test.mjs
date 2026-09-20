import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePracticeExplanations as normalize, assertPracticeExplanations as validate } from '../src/domain/practiceExplanations.mjs';

const question = {
  choices: ['からには', 'あげく', 'ものの', 'ばかりに'], answer: 'ものの',
  correctReason: '承认购买事实，但还没使用，用ものの。「からには」：后接决心或义务，本题仅陈述未使用。「ばかりに」：表示不良因果，忙碌不是购买造成的。「あげく」：表示曲折后的结果，本题没有曲折过程。',
};

test('recovers legacy explanations by choice text, preserving answer order and idempotence', () => {
  const result = normalize(question);
  validate([result]);
  assert.deepEqual(result.choices, question.choices);
  assert.equal(result.answer, question.answer);
  assert.match(result.choiceAnalysis[0].explanation, /决心/);
  assert.match(result.choiceAnalysis[1].explanation, /曲折/);
  assert.equal(result.correctReason, '承认购买事实，但还没使用，用ものの。');
  assert.deepEqual(normalize(result), result);
});

test('preserves explicit option explanations over combined legacy prose', () => {
  const result = normalize({ ...question, choice_analysis: [{ choice: 'からには', explanation_zh: '既然作出决定，就应付诸行动；本句没有承诺。' }] });
  assert.match(result.choiceAnalysis[0].explanation, /承诺/);
});

test('blocks missing and placeholder explanations without fabricating replacements', () => {
  for (const explanation of ['', '「あげく」不符合本题语境。']) {
    const result = normalize({ ...question, correctReason: '正确答案是「ものの」。', choiceAnalysis: [{choice: 'あげく', explanation}] });
    assert.throws(() => validate([result]), /缺少具体辨析/);
  }
});
