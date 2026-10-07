import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'jlpt-card-history-'));
process.env.JLPT_DB_PATH = join(dir, 'db.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const s = await import('./storage.mjs');
const h = await import('./card-review-history.mjs');
const { rateReviewCard } = await import('./review-cards.mjs');
const { generateDailySummaryContext, upsertDailySummary, getDailySummary } = await import('./daily-summary.mjs');
const { tools } = await import('./mcp-tools.mjs');
const alice = s.createUser('history-alice', 'password');
const bob = s.createUser('history-bob', 'password');
after(() => { s.getDb().close(); rmSync(dir, { recursive: true, force: true }); });
const seed = { id: 'seed-a', kind: 'meaning', prompt: '彼の発言はもっともだ。', choices: ['合理的だ', '不公平だ', '退屈だ', '珍しい'], answer: '合理的だ', explanation_zh: '「もっともだ」表示有道理、合理，在此评价发言的合理性。', distractor_notes: { '不公平だ': '不公平表示缺乏公正，不是评价发言有道理。', '退屈だ': '退屈表示无聊，与发言是否合理无关。', '珍しい': '珍しい表示罕见，不表示合理。' } };
for (const [user,id,questions] of [[alice,'a',[seed]],[alice,'empty',[]],[bob,'private',[seed]]]) s.upsertReviewItem({ id, deck:'n1_vocab', type:'vocabulary', original:id, reading:id, meaning_zh:'有道理', examples:[{ja:'彼の発言はもっともだ。',zh:'他的发言有道理。'},{ja:'その意見はもっともだ。',zh:'那个意见有道理。'}], practice_questions:questions },{ userId:user.id });
const progress = time => ({ correct:2,wrong:0,status:'review',lastReviewedAt:time,reviewCount:2 });
const save = (id,rating,time,eventId) => s.saveAnswer(alice.id,{questionId:`memory-card:${id}`,itemId:id,selected:rating,correct:rating!=='forgot',progressEntry:progress(time),reviewEventId:eventId,reviewedAt:time,source:'ios'});
const window = { start:'2026-10-04T00:00:00Z',end:'2026-10-05T00:00:00Z' };

test('event persistence, offline timestamp, retry idempotency, conflicts and owner isolation', () => {
  save('a','hard','2026-10-04T01:00:00Z','event-hard');
  save('a','hard','2026-10-04T01:00:00Z','event-hard');
  save('a','remembered','2026-10-04T02:00:00Z','event-remembered');
  save('empty','forgot','2026-10-04T03:00:00Z','event-empty');
  save('a','easy','2026-10-05T00:00:00Z','end-exclusive');
  assert.equal(h.listCardReviews(s.getDb(),alice.id,window).length,3);
  assert.equal(h.listCardReviews(s.getDb(),bob.id,window).length,0);
  assert.equal(Object.keys(s.getStudyState(alice.id).answers).length,0);
  assert.throws(()=>save('a','forgot','2026-10-04T01:00:00Z','event-hard'),/conflicts/);
  assert.throws(()=>save('private','hard','2026-10-04T01:00:00Z','foreign'),/not found/);
  assert.throws(()=>save('a','unknown','2026-10-04T01:00:00Z','bad'),/Invalid/);
  assert.equal(h.listCardReviews(s.getDb(),alice.id,window).length,3);
  // Delayed old review cannot rewind current scheduling.
  save('a','hard','2026-10-03T01:00:00Z','delayed');
  assert.equal(Date.parse(s.getStudyState(alice.id).progress.a.lastReviewedAt),Date.parse('2026-10-05T00:00:00Z'));
});

test('qualifying review deduplication, skip empty bank, settings and exact question reuse', () => {
  s.saveSettings(alice.id,{dailyPracticeSources:{answers:false,cardReviews:true,ratings:['hard','forgot'],window:'last_hours',hours:24,timeZone:'Asia/Tokyo',runAt:'08:30'}});
  const context=s.getDailyPracticeSourceContext(alice.id,window);
  assert.equal(context.reusableQuestions.length,1);
  assert.equal(context.reusableQuestions[0].id,'seed-a');
  assert.deepEqual(context.skippedCards,[{itemId:'empty',reason:'no_existing_questions'}]);
  assert.deepEqual(context.cardReviewStats,{totalReviews:3,uniqueCards:2,ratings:{forgot:1,hard:1,remembered:1,easy:0}});
  const pack=s.createDailyPractice(alice.id,{date:'2026-10-05',...window,generated_questions:[]});
  assert.equal(pack.questions.length,1);
  const question=pack.questions[0];
  assert.notEqual(question.id,seed.id);
  assert.equal(question.sourceQuestionId,seed.id);
  assert.equal(question.sourceKind,'card_review');
  assert.equal(question.prompt,seed.prompt);
  assert.deepEqual(question.choices,seed.choices);
  assert.equal(question.answer,seed.answer);
  assert.equal(question.correctReason,seed.explanation_zh);
  for (const option of question.choiceAnalysis.filter(a=>!a.correct)) assert.equal(option.explanation,seed.distractor_notes[option.choice]);
  const second=s.createDailyPractice(alice.id,{date:'2026-10-05',...window,generated_questions:[]});
  assert.notEqual(second.questions[0].id,question.id);
  s.saveSettings(alice.id,{dailyPracticeSources:{...context.settings,ratings:[]}});
  assert.equal(s.getDailyPracticeSourceContext(alice.id,window).reusableQuestions.length,0);
  assert.throws(()=>s.createDailyPractice(alice.id,{date:'2026-10-05',...window,generated_questions:[]}),/No daily practice/);
  s.saveSettings(alice.id,{feedbackMode:'batch'});
  assert.deepEqual(s.getStudyState(alice.id).settings.dailyPracticeSources.ratings,[]);
});

test('subjective cards are separate from objective accuracy and review-only summaries save', () => {
  const context=generateDailySummaryContext(s.getDb(),alice.id,'2026-10-04');
  assert.equal(context.overallStats.totalQuestions,0);
  assert.equal(context.cardReviews.totalReviews,3);
  const saved=upsertDailySummary(s.getDb(),alice.id,{date:'2026-10-04',total_questions:0,correct_count:0,incorrect_count:0,accuracy:0,stats:{byKind:[],uniqueItems:0},strengths:[],weaknesses:[],confusion_groups:[],recommendations:[],wrong_questions:[],summary_zh:'今天只进行了卡片复习。'});
  assert.equal(saved.totalQuestions,0);
  assert.equal(getDailySummary(s.getDb(),alice.id,'2026-10-04').cardReviews.totalReviews,3);
  assert.equal(s.getStudyPlan(alice.id).dailySummaries.find(day=>day.date==='2026-10-04').cardReviews.uniqueCards,2);
});

test('user time zones, rolling windows, DST and invalid boundaries', () => {
  const defaults=h.normalizeDailyPracticeSources();
  assert.deepEqual(h.practiceSourceWindow(defaults,{now:new Date('2026-10-05T01:00:00Z')}),{start:'2026-10-03T15:00:00.000Z',end:'2026-10-04T15:00:00.000Z'});
  assert.deepEqual(h.practiceSourceWindow({...defaults,window:'last_hours',hours:12},{now:new Date('2026-10-05T01:00:00Z')}),{start:'2026-10-04T13:00:00.000Z',end:'2026-10-05T01:00:00.000Z'});
  const dst=h.practiceSourceWindow({...defaults,timeZone:'America/New_York'},{now:new Date('2026-03-09T12:00:00Z')});
  assert.equal(Date.parse(dst.end)-Date.parse(dst.start),23*3600000);
  assert.throws(()=>h.practiceSourceWindow(defaults,{start:'bad',end:'bad'}),/valid/);
  assert.equal(h.normalizeDailyPracticeSources({timeZone:'bad',runAt:'99:99',ratings:['invalid']}).timeZone,'Asia/Tokyo');
});

test('MCP context follows owner preferences and rating event retries do not count twice', async () => {
  rateReviewCard(alice.id,'a','hard',new Date('2026-10-04T04:00:00Z'),'mcp-retry');
  rateReviewCard(alice.id,'a','hard',new Date('2026-10-04T05:00:00Z'),'mcp-retry');
  assert.equal(h.listCardReviews(s.getDb(),alice.id,window).filter(e=>e.eventId==='mcp-retry').length,1);
  const tool=tools.find(t=>t.name==='get_daily_practice_source_context');
  const result=JSON.parse((await tool.handler(window,{ownerId:String(bob.id)})).content[0].text);
  assert.equal(result.cardReviews.length,0);
  assert.equal(result.reusableQuestions.length,0);
  assert.equal(tool.annotations.readOnlyHint,true);
});


test('card progress merges independent events, retries and late arrivals over a legacy baseline', () => {
  for (const id of ['merge-a','merge-b']) {
    s.upsertReviewItem({id,deck:'n1_vocab',type:'vocabulary',original:id,reading:id,meaning_zh:'合并',examples:[{ja:'これは例文です。',zh:'这是例句。'},{ja:'毎日日本語を勉強します。',zh:'每天学习日语。'}],practice_questions:[seed]}, {userId:alice.id});
    s.saveProgressEntry(alice.id,id,{correct:8,wrong:2,reviewCount:10,ease:2.5,status:'review',lastReviewedAt:'2026-10-01T00:00:00Z',nextReviewAt:'2026-10-04T00:00:00Z',intervalDays:3});
  }
  const events = [['easy','2026-10-06T01:01:00Z','easy'],['forgot','2026-10-06T01:00:00Z','forgot'],['hard','2026-10-05T01:00:00Z','old']];
  for (const [rating,time,id] of events) save('merge-a',rating,time,'a-'+id);
  for (const [rating,time,id] of [...events].reverse()) save('merge-b',rating,time,'b-'+id);
  const a=s.getStudyState(alice.id).progress['merge-a'];
  assert.deepEqual(a,s.getStudyState(alice.id).progress['merge-b']);
  assert.equal(a.reviewCount,13);
  assert.equal(a.correct,8);
  assert.equal(a.wrong,2);
  assert.equal(a.intervalDays,0);
  assert.equal(a.status,'learning');
  assert.equal(a.nextReviewAt,'2026-10-06T01:11:00.000Z');
  save('merge-a','easy','2026-10-06T01:01:00Z','a-easy');
  assert.deepEqual(s.getStudyState(alice.id).progress['merge-a'],a);
  // A genuine later review supersedes the close-review conservative schedule.
  save('merge-a','remembered','2026-10-07T01:00:00Z','next-day');
  assert.equal(s.getStudyState(alice.id).progress['merge-a'].intervalDays,3);
});


test('objective answers remain intact after a subsequent card review', () => {
  const id = 'merge-a';
  const before = s.getStudyState(alice.id).progress[id];
  const answeredAt = '2026-10-08T01:00:00Z';
  s.saveAnswer(alice.id, { questionId:'objective-q',itemId:id,selected:'合理的だ',correct:true,
    progressEntry:{...before,correct:before.correct+1,reviewCount:before.reviewCount+1,lastReviewedAt:answeredAt} });
  const objective = s.getStudyState(alice.id).progress[id];
  save(id,'easy','2026-10-09T01:00:00Z','after-objective');
  const after = s.getStudyState(alice.id).progress[id];
  assert.equal(after.correct,objective.correct);
  assert.equal(after.wrong,objective.wrong);
  assert.equal(after.reviewCount,objective.reviewCount+1);
  assert.equal(s.getStudyState(alice.id).answers['objective-q'].correct,true);
});
