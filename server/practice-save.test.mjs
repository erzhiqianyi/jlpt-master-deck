import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'jlpt-practice-save-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const { createUser, savePracticeState, getStudyState, getDb } = await import('./storage.mjs');
test('saves a completed review and progress together, and retry does not double counts', () => {
  const user = createUser('review-test', 'test-password');
  const payload = {
    answers: { 'daily-q1': { selected: 'A', correct: true } },
    answerItemIds: { 'daily-q1': 'word-1' },
    progress: { 'word-1': { correct: 1, wrong: 0, status: 'learning' } },
    attemptHistory: [{ id: 'attempt-1', questionIds: ['daily-q1'], answers: [], analysisStatus: 'completed' }],
    activeAttempt: null,
  };
  savePracticeState(user.id, payload);
  savePracticeState(user.id, payload);
  const state = getStudyState(user.id);
  assert.equal(state.attemptHistory[0].analysisStatus, 'completed');
  assert.equal(state.progress['word-1'].correct, 1);
  assert.equal(getDb().prepare('SELECT item_id FROM answers WHERE user_id = ?').get(user.id).item_id, 'word-1');
  assert.throws(() => savePracticeState(user.id, { ...payload, progress: { 'word-1': undefined } }));
  assert.equal(getStudyState(user.id).progress['word-1'].correct, 1);
});
