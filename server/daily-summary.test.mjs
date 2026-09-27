import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'jlpt-summary-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);

const { createUser, getDb, getPlanGenerationContext } = await import('./storage.mjs');
const { tools } = await import('./mcp-tools.mjs');
const { generateDailySummaryContext, getDailySummary, listDailySummaries, upsertDailySummary } = await import('./daily-summary.mjs');
const owner = createUser('summary-owner', 'test-password');
const other = createUser('summary-other', 'test-password');
const db = getDb();
const date = '2026-09-27';
const payload = {
  date, total_questions: 2, correct_count: 1, incorrect_count: 1, accuracy: 0.5,
  stats: { byKind: [{ kind: 'grammar', total: 2, correct: 1, incorrect: 1, accuracy: 0.5 }], uniqueItems: 1 },
  strengths: [{ label: '基础意义', detail: '单独识别稳定' }], weaknesses: [{ label: '时间轴', detail: '边界判断有误' }],
  confusion_groups: [{ topic: '直后 vs 连续', items: ['～が早いか', '～なり'], evidenceQuestionIds: ['q-grammar-1'] }],
  recommendations: [{ type: 'review', title: '时间关系', detail: '先判断时间轴' }],
  wrong_questions: [{ questionId: 'q-grammar-1', selected: 'なり', correctAnswer: 'が早いか' }], summary_zh: '多数基础意义已掌握，但时间轴判断待加强。',
};
const call = async (name, args = {}, userId = owner.id) => JSON.parse((await tools.find((entry) => entry.name === name).handler(args, { ownerId: String(userId), scopes: ['study'] })).content[0].text);

test('SQLite summary migration, insert, upsert, owner isolation and JSON round trip', () => {
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='daily_summaries'").get());
  assert.equal(getDailySummary(db, owner.id, date), null);
  const first = upsertDailySummary(db, owner.id, payload);
  assert.deepEqual(first.stats, payload.stats);
  assert.deepEqual(first.confusionGroups, payload.confusion_groups);
  assert.deepEqual(first.wrongQuestions, payload.wrong_questions);
  assert.equal(getDailySummary(db, other.id, date), null);
  const second = upsertDailySummary(db, owner.id, { ...payload, summary_zh: '更新后的分析' });
  assert.equal(first.id, second.id);
  assert.equal(first.generatedAt, second.generatedAt);
  assert.equal(second.summaryZh, '更新后的分析');
  upsertDailySummary(db, owner.id, { ...payload, date: '2026-09-26' });
  assert.equal(listDailySummaries(db, owner.id).length, 2);
  assert.equal(listDailySummaries(db, owner.id, 1)[0].date, date);
});

test('validation rejects invalid dates, counts, accuracy and extra fields', () => {
  for (const bad of [{ date: '2026-02-30' }, { total_questions: 3 }, { accuracy: 2 }, { accuracy: 0.6 }, { arbitrary_column: 'x' }]) {
    assert.throws(() => upsertDailySummary(db, owner.id, { ...payload, ...bad }));
  }
});

test('context uses Tokyo day, owner answers, kind counts and compact question evidence', () => {
  db.prepare(`INSERT INTO daily_practices(id,user_id,practice_date,title,minutes,practice_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`)
    .run('practice-1', owner.id, date, 'test', 10, JSON.stringify({ questions: [{ id: 'q-grammar-1', itemId: 'item-1', kind: 'grammar', answer: 'が早いか' }, { id: 'q-grammar-2', itemId: 'item-1', kind: 'grammar', answer: 'なり' }] }), date, date);
  const insert = db.prepare('INSERT INTO answers(user_id,question_id,item_id,selected,correct,answered_at) VALUES(?,?,?,?,?,?)');
  insert.run(owner.id, 'q-grammar-1', 'item-1', 'なり', 0, '2026-09-26T15:30:00.000Z');
  insert.run(owner.id, 'q-grammar-2', 'item-1', 'なり', 1, '2026-09-27T12:00:00.000Z');
  insert.run(other.id, 'other-grammar-1', 'item-2', 'x', 0, '2026-09-27T12:00:00.000Z');
  const context = generateDailySummaryContext(db, owner.id, date);
  assert.deepEqual(context.overallStats, { totalQuestions: 2, correctCount: 1, incorrectCount: 1, accuracy: 0.5, uniqueItems: 1 });
  assert.equal(context.statsByKind[0].kind, 'grammar');
  assert.equal(context.wrongAnswers[0].correctAnswer, 'が早いか');
  assert.match(context.wrongAnswers[0].questionReference, /^QU-\d+/);
  assert.equal(generateDailySummaryContext(db, owner.id, '2026-09-28').overallStats.totalQuestions, 0);
  assert.throws(() => generateDailySummaryContext(db, owner.id, 'yesterday'));
});

test('MCP tools read, write and expose bounded summaries to plan generation', async () => {
  assert.equal((await call('get_daily_summary', { date: '2026-09-25' })).status, 'not_found');
  assert.equal((await call('get_daily_summary', { date }, other.id)).status, 'not_found');
  const context = await call('generate_daily_summary_context', { date });
  assert.equal(context.overallStats.totalQuestions, 2);
  const saved = await call('upsert_daily_summary', payload);
  assert.equal(saved.summaryZh, payload.summary_zh);
  assert.equal((await call('get_daily_summary', { date })).status, 'found');
  const plan = getPlanGenerationContext(owner.id);
  assert.equal(plan.dailySummaries[0].date, date);
  assert.ok(!('wrongQuestions' in plan.dailySummaries[0]));
  assert.ok(plan.dailySummaries.length <= 7);
  for (const bad of [{ date: '2026-13-01' }, { accuracy: -1 }, { total_questions: 3 }]) {
    await assert.rejects(() => call('upsert_daily_summary', { ...payload, ...bad }));
  }
});
