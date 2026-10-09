// v3 阶段 3：练习、作答、复习卡片、统计。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.JLPT_V3_DB_PATH = join(mkdtempSync(join(tmpdir(), 'v3-practice-')), 'v3.sqlite');
const { migrateLegacyToV3 } = await import('../server/v3/migrate/index.mjs');
const { seedReferenceData } = await import('../server/v3/reference-data.mjs');
const { ensureUser } = await import('../server/v3/database.mjs');
const { createWordbook } = await import('../server/v3/repo/wordbooks.mjs');
const { createKnowledge, getKnowledge } = await import('../server/v3/repo/knowledge.mjs');
const { createQuestionGroup } = await import('../server/v3/repo/questions.mjs');
const { submitReview } = await import('../server/v3/repo/reviews.mjs');
const practice = await import('../server/v3/repo/practice.mjs');
const { dueCards, rateCard, listRatings } = await import('../server/v3/repo/cards.mjs');
const { studyOverview } = await import('../server/v3/repo/stats.mjs');
const { scheduleAfterAnswer, scheduleAfterRating } = await import('../src/domain/reviewSchedule.mjs');
const { updateSettings } = await import('../server/v3/repo/settings.mjs');

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
  createKnowledge(db, 1, { kind: 'word', wordbook: 'WB1', expression: '遅刻', reading: 'ちこく', pos: 'noun', meaning: '迟到', examples: [{ sentence: '会議に遅刻した。', translation: '开会迟到了。' }] });
  createKnowledge(db, 1, { kind: 'word', wordbook: 'WB1', expression: '規制', reading: 'きせい', pos: 'noun', meaning: '限制' });
  const kanji = (prompt, word, reading, wrong) => ({
    typeId: 'vocabulary-kanji-reading', questions: [{ prompt, marks: [{ kind: 'target', start: prompt.indexOf(word), end: prompt.indexOf(word) + word.length }],
      options: [reading, ...wrong].map((text, i) => ({ text, correct: i === 0, analysis: i ? '不对' : '正确' })), explanation: [{ kind: 'basis', body: `读作${reading}` }],
      knowledge: [{ code: word === '遅刻' ? 'W1' : 'W2' }] }],
  });
  for (const input of [kanji('会議に遅刻した。', '遅刻', 'ちこく', ['ちごく', 'じこく', 'ちきょく']), kanji('交通を規制する。', '規制', 'きせい', ['きぜい', 'ぎせい', 'きさい'])]) {
    const group = createQuestionGroup(db, 1, input);
    submitReview(db, 1, group.code, { verdict: 'pass', summary: 'ok' });
  }
  return db;
}

test('review schedule grows on correct answers and ratings and resets on mistakes', () => {
  const now = new Date('2026-10-10T00:00:00Z');
  const first = scheduleAfterAnswer(null, true, now);
  assert.equal(first.intervalDays, 1);
  assert.equal(first.status, 'review');
  const later = new Date('2026-10-12T00:00:00Z');
  const second = scheduleAfterAnswer(first, true, later);
  assert.equal(second.intervalDays, 3);
  assert.deepEqual(scheduleAfterAnswer(second, true, later).dueAt, second.dueAt, '期限前の正解は予定を進めない');
  assert.equal(scheduleAfterAnswer(second, false, later).intervalDays, 1);
  assert.equal(scheduleAfterAnswer(second, false, later).status, 'learning');
  assert.equal(scheduleAfterRating(null, 'remembered', now).intervalDays, 3);
  assert.equal(scheduleAfterRating(null, 'easy', now).intervalDays, 7);
  assert.ok(scheduleAfterRating({ intervalDays: 10, ease: 2.5, reviewCount: 5 }, 'remembered', now).intervalDays > 10, '2 回目以降は伸びる');
  assert.equal(scheduleAfterRating({ intervalDays: 30, ease: 2.5, reviewCount: 6 }, 'easy', now).status, 'mastered');
  assert.equal(Date.parse(scheduleAfterRating(null, 'forgot', now).dueAt) - now.getTime(), 10 * 60000);
});

test('a practice hides answers until answered, records answers once per event and moves the review schedule', () => {
  const db = freshDb();
  const attempt = practice.startAttempt(db, 1, { filters: { module: 'vocabulary', count: 5 }, title: '词汇练习' });
  assert.equal(attempt.items.length, 2);
  assert.equal(attempt.active, true);
  const item = attempt.items[0];
  assert.equal(item.result, null, '作答前没有答案');
  assert.ok(item.question.options.every((o) => !('correct' in o)));
  const group = attempt.groups[item.question.group];
  assert.ok(group.materials.every((m) => !('transcript' in m)));

  const wrong = item.question.options.find((o) => !['ちこく', 'きせい'].includes(o.text));
  const answered = practice.submitAnswer(db, 1, attempt.code, { question: item.question.code, selectedOptionId: wrong.id, eventId: 'evt-1', elapsedMs: 3200 });
  assert.equal(answered.item.answer.correct, false);
  assert.ok(answered.item.result.correctOptionId);
  assert.equal(answered.item.result.explanation[0].kind, 'basis');
  // 同じ eventId は一度だけ
  assert.equal(practice.submitAnswer(db, 1, attempt.code, { question: item.question.code, selectedOptionId: wrong.id, eventId: 'evt-1' }).duplicate, true);
  assert.throws(() => practice.submitAnswer(db, 1, attempt.code, { question: item.question.code, selectedOptionId: answered.item.result.correctOptionId, eventId: 'evt-1' }), /另一次/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM learning_events WHERE event_type = 'AnswerSubmitted'").get().n, 1);
  const point = answered.item.question.knowledge[0].code;
  assert.equal(getKnowledge(db, 1, point).review.status, 'learning', '答错 → 学习中');

  const second = attempt.items[1];
  const right = practice.submitAnswer(db, 1, attempt.code, { question: second.question.code, selectedOptionId: second.question.options.find((o) => ['ちこく', 'きせい'].includes(o.text)).id, eventId: 'evt-2' });
  assert.equal(right.item.answer.correct, true);
  assert.deepEqual(right.summary, { total: 2, answered: 2, scored: 2, correct: 1 });
  const done = practice.completeAttempt(db, 1, attempt.code);
  assert.equal(done.active, false);
  assert.throws(() => practice.submitAnswer(db, 1, attempt.code, { position: 0, selectedOptionId: wrong.id }), /已结束/);

  assert.equal(practice.listAttempts(db, 1).items[0].summary.correct, 1);
  assert.equal(practice.listMistakes(db, 1).total, 1);
  assert.equal(practice.listAttempts(db, 2).total, 0, '其他用户看不到');
  const overview = studyOverview(db, 1);
  assert.equal(overview.totals.scored, 2);
  assert.equal(overview.totals.accuracy, 50);
  assert.equal(overview.byType[0].typeId, 'vocabulary-kanji-reading');
  assert.equal(overview.todayActivity.answered, 2);
  assert.equal(overview.streak, 1);
});

test('practice sets with sections are created by an agent and started as attempts', () => {
  const db = freshDb();
  const set = practice.createPracticeSet(db, 1, { kind: 'daily', title: '今日の練習', minutes: 10, sections: [{ title: '漢字読み', questions: ['QV1', 'QV2'] }] });
  assert.equal(set.code, 'DP1');
  assert.equal(set.sections[0].entries.length, 2);
  assert.equal(practice.listPracticeSets(db, 1, { kind: 'daily' }).items[0].questionCount, 2);
  const attempt = practice.startAttempt(db, 1, { practice: 'DP1' });
  assert.equal(attempt.kind, 'daily');
  assert.equal(attempt.practice, 'DP1');
  assert.equal(practice.activeAttempt(db, 1).code, attempt.code);
  const next = practice.startAttempt(db, 1, { questions: ['QV2'] });
  assert.equal(practice.activeAttempt(db, 1).code, next.code, '进行中的练习只有一个');
  assert.throws(() => practice.startAttempt(db, 1, { filters: { module: 'listening' } }), /没有可以练习/);
});

test('memory cards follow the chosen template and ratings are counted once', () => {
  const db = freshDb();
  const first = dueCards(db, 1, { limit: 10 });
  assert.equal(first.new, 2);
  assert.equal(first.cards[0].template, 'word_standard');
  assert.deepEqual(first.cards[0].front.map((f) => f.field), ['expression']);
  assert.ok(first.cards[0].back.some((f) => f.field === 'example' && f.items[0].translation === '开会迟到了。'));
  updateSettings(db, 1, { cardTemplates: { word: 'word_simple' } });
  assert.deepEqual(dueCards(db, 1).cards[0].back.map((f) => f.field), ['reading', 'meaning']);

  const rated = rateCard(db, 1, { code: 'W1', rating: 'remembered', eventId: 'card-1', source: 'web' });
  assert.equal(rated.schedule.intervalDays, 3);
  assert.equal(rateCard(db, 1, { code: 'W1', rating: 'remembered', eventId: 'card-1' }).duplicate, true);
  assert.throws(() => rateCard(db, 1, { code: 'W1', rating: 'easy', eventId: 'card-1' }), /另一次/);
  assert.equal(dueCards(db, 1).new, 1, '评过的卡片不再是新卡');
  assert.equal(listRatings(db, 1)[0].rating, 'remembered');
  assert.equal(studyOverview(db, 1).totals.ratings, 1);
});
