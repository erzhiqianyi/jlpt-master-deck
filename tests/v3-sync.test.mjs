// 端末（iOS）の同期：スナップショットの読み出しと、オフラインの学習イベントのまとめての反映。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.JLPT_V3_DB_PATH = join(mkdtempSync(join(tmpdir(), 'v3-sync-')), 'v3.sqlite');
const { migrateLegacyToV3 } = await import('../server/v3/migrate/index.mjs');
const { seedReferenceData } = await import('../server/v3/reference-data.mjs');
const { ensureUser } = await import('../server/v3/database.mjs');
const { createWordbook } = await import('../server/v3/repo/wordbooks.mjs');
const { createKnowledge } = await import('../server/v3/repo/knowledge.mjs');
const { createQuestionGroup } = await import('../server/v3/repo/questions.mjs');
const { createPracticeSet, getAttempt } = await import('../server/v3/repo/practice.mjs');
const { syncOverview, syncKnowledge, syncPractice, applyEvents } = await import('../server/v3/repo/sync.mjs');

function freshDb() {
  const legacy = new DatabaseSync(':memory:');
  legacy.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL)');
  const db = new DatabaseSync(':memory:');
  migrateLegacyToV3({ legacy, target: db });
  db.exec('PRAGMA foreign_keys = ON');
  seedReferenceData(db);
  ensureUser(db, { id: 1, username: 'learner' });
  ensureUser(db, { id: 2, username: 'other' });
  createWordbook(db, 1, { title: '词汇' });
  for (const [expression, reading] of [['遅刻', 'ちこく'], ['概観', 'がいかん'], ['捉える', 'とらえる']]) {
    createKnowledge(db, 1, { kind: 'word', wordbook: 'WB1', expression, reading, pos: expression === '捉える' ? 'verb_2' : 'noun', meaning: expression });
  }
  createQuestionGroup(db, 1, { typeId: 'vocabulary-kanji-reading', status: 'ready', questions: [{ prompt: '会議に遅刻した。', marks: [{ kind: 'target', start: 3, end: 5 }],
    options: ['ちこく', 'ちごく', 'じこく', 'ちきょく'].map((text, i) => ({ text, correct: i === 0, analysis: i ? '不对' : '对' })), explanation: [{ kind: 'basis', body: '读作ちこく' }], knowledge: [{ code: 'W1' }] }] });
  createPracticeSet(db, 1, { kind: 'daily', title: '今日', sections: [{ title: '読み', questions: ['QV1'] }] });
  return db;
}

test('the snapshot holds settings, wordbooks, schedules, knowledge pages and practice with answers', () => {
  const db = freshDb();
  const overview = syncOverview(db, 1);
  assert.equal(overview.knowledge.total, 3);
  assert.equal(overview.wordbooks[0].code, 'WB1');
  assert.ok(overview.cardTemplates.length > 0);
  assert.equal(overview.practiceSets[0].code, 'DP1');
  const first = syncKnowledge(db, 1, { limit: 2 });
  assert.deepEqual(first.items.map((k) => k.code), ['W1', 'W2']);
  assert.deepEqual(first.codes, ['W1', 'W2', 'W3'], '最初のページで全部の番号（消えたものを除くため）');
  assert.equal(first.nextOffset, 2);
  assert.equal(syncKnowledge(db, 1, { offset: 2, limit: 2 }).nextOffset, null);
  assert.equal(syncKnowledge(db, 1, { since: '2999-01-01' }).total, 0);
  assert.equal(syncKnowledge(db, 2).total, 0);
  const practice = syncPractice(db, 1, 'DP1');
  assert.equal(practice.groups[0].questions[0].options.find((o) => o.correct).text, 'ちこく');
  assert.throws(() => syncPractice(db, 2, 'DP1'));
});

test('offline events apply once in order; a resent batch only reports duplicates', () => {
  const db = freshDb();
  const option = syncPractice(db, 1, 'DP1').groups[0].questions[0].options.find((o) => o.correct).id;
  const events = [
    { eventId: 'r-1', type: 'MemoryRated', knowledge: 'W2', rating: 'easy', occurredAt: '2026-10-05T01:00:00Z' },
    { eventId: 'a-1', type: 'AttemptStarted', practice: 'DP1', kind: 'daily', occurredAt: '2026-10-05T02:00:00Z' },
    { eventId: 'q-1', type: 'AnswerSubmitted', attempt: 'a-1', question: 'QV1', selectedOptionId: option, occurredAt: '2026-10-05T02:01:00Z', elapsedMs: 4000 },
    { eventId: 'c-1', type: 'AttemptCompleted', attempt: 'a-1', occurredAt: '2026-10-05T02:02:00Z' },
  ];
  const first = applyEvents(db, 1, events).results;
  assert.deepEqual(first.map((r) => r.status), ['applied', 'applied', 'applied', 'applied']);
  assert.equal(first[2].correct, true);
  const attempt = getAttempt(db, 1, first[1].attempt);
  assert.equal(attempt.startedAt, '2026-10-05T02:00:00.000Z');
  assert.equal(attempt.completedAt, '2026-10-05T02:02:00.000Z');
  assert.deepEqual(applyEvents(db, 1, events).results.map((r) => r.status), ['duplicate', 'duplicate', 'duplicate', 'duplicate']);
  assert.equal(db.prepare('SELECT count(*) AS n FROM practice_attempts').get().n, 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM learning_events WHERE user_id = 1").get().n, 2);
  const schedule = syncOverview(db, 1).schedules;
  assert.deepEqual(schedule.map((s) => s.code).sort(), ['W1', 'W2']);
  assert.equal(schedule.find((s) => s.code === 'W2').intervalDays, 7);
});

test('bad events are rejected one by one and do not stop the rest', () => {
  const db = freshDb();
  const results = applyEvents(db, 1, [
    { eventId: 'r-1', type: 'MemoryRated', knowledge: 'W1', rating: 'hard' },
    { eventId: 'r-1', type: 'MemoryRated', knowledge: 'W1', rating: 'easy' },
    { eventId: 'r-2', type: 'MemoryRated', knowledge: 'W99', rating: 'hard' },
    { eventId: 'r-3', type: 'MemoryRated', knowledge: 'W1', rating: 'hard', occurredAt: 'not a time' },
    { eventId: 'q-1', type: 'AnswerSubmitted', attempt: 'missing', question: 'QV1', selectedOptionId: 1 },
    { eventId: 'x-1', type: 'Unknown' },
    { eventId: 'r-4', type: 'MemoryRated', knowledge: 'W3', rating: 'remembered' },
  ]).results;
  assert.deepEqual(results.map((r) => r.status), ['applied', 'rejected', 'rejected', 'rejected', 'rejected', 'rejected', 'applied']);
  assert.match(results[1].error, /另一次/);
  assert.equal(applyEvents(db, 2, [{ eventId: 'r-9', type: 'MemoryRated', knowledge: 'W1', rating: 'hard' }]).results[0].status, 'rejected', '他人の知識点は見えない');
  assert.throws(() => applyEvents(db, 1, Array.from({ length: 501 }, (_, i) => ({ eventId: `e${i}` }))), /最多/);
});
