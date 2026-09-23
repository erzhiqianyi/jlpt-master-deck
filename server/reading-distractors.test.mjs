import assert from 'node:assert/strict';
import test from 'node:test';
import { describeReadingConfusion, readingDistractors } from '../src/domain/readingDistractors.mjs';
import { assertPracticeExplanations, isEmptyReason } from '../src/domain/practiceExplanations.mjs';

test('never produces final-kana swaps like かつしかい / きせう', () => {
  for (const reading of ['きせい', 'かつしか', 'こあいだ', 'みずもとこうえん', 'しばまた']) {
    for (const choice of readingDistractors(reading)) {
      assert.notEqual(choice, `${reading.slice(0, -1)}い`);
      assert.notEqual(choice, `${reading.slice(0, -1)}う`);
      assert.notEqual(choice, `${reading.slice(0, -1)}ん`);
      assert.doesNotMatch(choice, /ゔ/u);
    }
  }
});

test('uses real confusions: on-reading, sokuon, long vowel, voicing', () => {
  assert.ok(readingDistractors('きせい').includes('きしょう'));
  assert.ok(readingDistractors('かつしか').includes('かっしか'));
  assert.ok(readingDistractors('みずもとこうえん').includes('みずもとこえん'));
  assert.ok(readingDistractors('しばまた').includes('しばまだ'));
});

test('every generated distractor gets a concrete explanation that passes validation', () => {
  for (const [original, reading] of [['規制', 'きせい'], ['葛飾', 'かつしか'], ['水元公園', 'みずもとこうえん'], ['学校', 'がっこう']]) {
    const choices = [reading, ...readingDistractors(reading).slice(0, 3)];
    const choiceAnalysis = choices.map((choice) => ({
      choice,
      correct: choice === reading,
      explanation: choice === reading ? `「${original}」读作「${reading}」。` : describeReadingConfusion(choice, reading, original),
    }));
    for (const entry of choiceAnalysis) assert.ok(!isEmptyReason(entry.explanation), entry.choice);
    assertPracticeExplanations([{ correctReason: `「${original}」读作「${reading}」。`, choiceAnalysis }]);
  }
});

test('describes the specific difference', () => {
  assert.match(describeReadingConfusion('きしょう', 'きせい', '規制'), /把「せい」读成了「しょう」/u);
  assert.match(describeReadingConfusion('みずもとこえん', 'みずもとこうえん'), /漏掉了.*长音「う」/u);
  assert.match(describeReadingConfusion('がくこう', 'がっこう'), /促音/u);
  assert.match(describeReadingConfusion('しばまだ', 'しばまた'), /清音「た」读成了浊音「だ」/u);
  assert.equal(describeReadingConfusion('まったくちがうよみかた', 'きせい'), '');
});
