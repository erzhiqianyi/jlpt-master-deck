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

test('audio practice counters persist without replacing vocabulary progress or answer history', () => {
  const user = createUser('audio-counter-test', 'test-password');
  savePracticeState(user.id, {
    progress: { 'word-1': { correct: 2, wrong: 1, status: 'learning' } },
    attemptHistory: [{ id: 'existing-attempt', questionIds: [], answers: [] }],
  });
  const progress = { 'listening-audio:asset-1': { correct: 0, wrong: 0, status: 'learning', reviewCount: 1, lastPracticeSessionId: 'session-1' } };
  savePracticeState(user.id, { progress });
  savePracticeState(user.id, { progress });
  const state = getStudyState(user.id);
  assert.equal(state.progress['listening-audio:asset-1'].reviewCount, 1);
  assert.equal(state.progress['listening-audio:asset-1'].lastPracticeSessionId, 'session-1');
  assert.equal(state.progress['word-1'].correct, 2);
  assert.equal(state.attemptHistory[0].id, 'existing-attempt');
});

test('completion statistics persist beyond history and retries without backfilling old attempts', () => {
  const user = createUser('completion-stats-test', 'test-password');
  const db = getDb();
  db.prepare(`INSERT INTO daily_practices (id, user_id, practice_date, title, minutes, practice_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('stats-practice', user.id, '2026-10-02', '文法', 5, JSON.stringify({ questions: [{ id: 'stats-q1' }] }), 'now', 'now');
  const old = { id: 'old-completion', practiceId: 'stats-practice', completedAt: 'before', questionIds: ['stats-q1'], answers: [] };
  db.prepare('UPDATE practice_state SET attempt_history_json = ? WHERE user_id = ?').run(JSON.stringify([old]), user.id);
  savePracticeState(user.id, { attemptHistory: [old] });
  assert.deepEqual(getStudyState(user.id).practiceCompletionCounts, {});
  const completed = { ...old, id: 'new-completion', completedAt: 'now' };
  savePracticeState(user.id, { attemptHistory: [completed, old] });
  savePracticeState(user.id, { attemptHistory: [completed, old] });
  assert.equal(getStudyState(user.id).practiceCompletionCounts['stats-practice'], 1);
  savePracticeState(user.id, { attemptHistory: [] });
  savePracticeState(user.id, { attemptHistory: [completed] });
  assert.equal(getStudyState(user.id).practiceCompletionCounts['stats-practice'], 1);
  savePracticeState(user.id, { attemptHistory: [{ ...completed, id: 'next-completion' }] });
  assert.equal(getStudyState(user.id).practiceCompletionCounts['stats-practice'], 2);
  savePracticeState(user.id, { attemptHistory: [{ ...completed, id: 'unfinished', completedAt: undefined }] });
  assert.equal(getStudyState(user.id).practiceCompletionCounts['stats-practice'], 2);
});
