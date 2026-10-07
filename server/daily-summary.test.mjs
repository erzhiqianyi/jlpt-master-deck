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
const {recordLearningEvent}=await import('./learning-events.mjs');
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

test('calendar days use the account zone and saved summaries retain that zone after preference changes', async () => {
 const storage=await import('./storage.mjs');const {calendarDayWindow}=await import('./card-review-history.mjs');
 const user=createUser('zone-owner','password');storage.saveSettings(user.id,{dailyPracticeSources:{timeZone:'UTC'}});
 const day='2026-10-04';
 for(const [id,time] of [['previous','2026-10-03T23:59:59Z'],['inside','2026-10-04T23:59:59Z'],['next','2026-10-05T00:00:00Z']]) {
  db.prepare('INSERT INTO answers(user_id,question_id,item_id,selected,correct,answered_at) VALUES(?,?,?,?,?,?)').run(user.id,id,'i','A',1,time);
 }
 const context=generateDailySummaryContext(db,user.id,day);
 assert.equal(context.overallStats.totalQuestions,1);assert.equal(context.window.timeZone,'UTC');assert.equal(context.window.kind,'calendar_day');
 const input={...payload,date:day,total_questions:1,correct_count:1,incorrect_count:0,accuracy:1,stats:{byKind:[{kind:'grammar',total:1,correct:1,incorrect:0,accuracy:1}],uniqueItems:1},wrong_questions:[]};
 const saved=upsertDailySummary(db,user.id,input);assert.equal(saved.timeZone,'UTC');
 storage.saveSettings(user.id,{dailyPracticeSources:{timeZone:'Asia/Tokyo'}});
 assert.equal(getDailySummary(db,user.id,day).timeZone,'UTC');assert.equal(generateDailySummaryContext(db,user.id,day).window.timeZone,'UTC');
 assert.throws(()=>upsertDailySummary(db,user.id,{...input,time_zone:'Asia/Tokyo'}),/time zone conflicts/);
 assert.equal(Date.parse(calendarDayWindow('2026-03-08','America/New_York').end)-Date.parse(calendarDayWindow('2026-03-08','America/New_York').start),23*3600000);
 assert.equal(Date.parse(calendarDayWindow('2026-11-01','America/New_York').end)-Date.parse(calendarDayWindow('2026-11-01','America/New_York').start),25*3600000);
});

test('daily projection counts retakes once per event, keeps unmatched history, and excludes subjective/unanswered activity',()=>{
 const user=createUser('events-summary-owner','password');const day='2026-10-06';
 const insert=db.prepare('INSERT INTO answers(user_id,question_id,item_id,selected,correct,answered_at) VALUES(?,?,?,?,?,?)');
 insert.run(user.id,'Q1','I1','B',1,'2026-10-06T02:00:00Z');
 insert.run(user.id,'historical','I2','A',1,'2026-10-06T03:00:00Z');
 insert.run(user.id,'unanswered','I2','',0,'2026-10-06T04:00:00Z');
 const submit=(eventId,time,selected,correct)=>recordLearningEvent(db,user.id,{eventId,type:'AnswerSubmitted',occurredAt:time,payload:{questionId:'Q1',itemId:'I1',kind:'grammar-form',selected,correct}});
 submit('first','2026-10-06T01:00:00Z','A',false);submit('second','2026-10-06T02:00:00Z','B',true);submit('second','2026-10-06T02:00:00Z','B',true);
 recordLearningEvent(db,user.id,{eventId:'forgot',type:'MemoryRated',occurredAt:'2026-10-06T05:00:00Z',payload:{itemId:'I1',rating:'forgot'}});
 const context=generateDailySummaryContext(db,user.id,day);
 assert.deepEqual(context.overallStats,{totalQuestions:3,correctCount:2,incorrectCount:1,accuracy:2/3,uniqueItems:2});
 assert.equal(context.statsByKind.find(row=>row.kind==='grammar-form').total,2);
 assert.equal(context.wrongAnswers[0].questionId,'Q1');
});
