import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canScoreExamQuestion, readExamAttempt, examSessionScore, examSessionKey } from './mockExam.mjs';
const questions = [{ id: 'q1', choices: ['A', 'B'], answerIndex: 1, explanation: 'B' }, { id: 'q2', choices: ['C', 'D'], answerIndex: 0, scoringReady: false }];
test('only ready questions count; attempts survive refresh and reset when content changes', () => {
  const attempt = { revision: JSON.stringify(questions), answers: { q1: 1, q2: 0, unknown: 2 }, submitted: true, startedAt: '2026-10-02T01:00:00Z' };
  const storage = { getItem: () => JSON.stringify(attempt) };
  const saved = readExamAttempt(storage, 'key', questions);
  assert.deepEqual(saved.answers, { q1: 1 });
  assert.equal(saved.startedAt, attempt.startedAt);
  assert.deepEqual(examSessionScore(questions, saved.answers), { total: 1, answered: 1, correct: 1, excluded: 1 });
  assert.equal(readExamAttempt(storage, 'key', [{ ...questions[0], answerIndex: 0 }]).submitted, false);
  assert.equal(readExamAttempt({ getItem: () => '{broken' }, 'key', questions).submitted, false);
  assert.equal(canScoreExamQuestion({ ...questions[0], answerIndex: 3 }), false);
  assert.notEqual(examSessionKey(1, 'exam', 'part'), examSessionKey(2, 'exam', 'part'));
});
