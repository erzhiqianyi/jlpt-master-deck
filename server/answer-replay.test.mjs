import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { progressAfterAnswer } from '../src/domain/srs.mjs';
const dir = mkdtempSync(join(tmpdir(),'jlpt-replay-'));
process.env.JLPT_DB_PATH = join(dir,'db.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir,'data'); mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const s = await import('./storage.mjs');
const alice = s.createUser('replay-alice','password');
const bob = s.createUser('replay-bob','password');
after(() => { s.getDb().close(); rmSync(dir,{recursive:true,force:true}); });
for (const id of ['item','legacy','rating','rollback','reading']) s.upsertReviewItem({id,deck:'grammar_expression',type:'grammar',original:id,meaning_zh:'测试'},{userId:alice.id});
const empty = {correct:0,wrong:0,status:'new'};
function event(id,itemId,correct,time,before=empty,legacy=false) {
  return {eventId:id,legacy,before,input:{questionId:'q-'+id,itemId,selected:correct?'A':'B',correct,progressEntry:progressAfterAnswer(before,correct,new Date(time))}};
}
test('independent new answers merge atomically and retries retain one count and original time', () => {
  const first = event('one','item',true,'2026-10-05T01:00:00Z');
  const second = event('two','item',false,'2026-10-05T02:00:00Z');
  assert.equal(s.replayPendingAnswer(alice.id,first).outcome,'accepted');
  assert.equal(s.replayPendingAnswer(alice.id,second).outcome,'accepted');
  let state = s.getStudyState(alice.id);
  assert.equal(state.progress.item.correct,1); assert.equal(state.progress.item.wrong,1);
  assert.equal(state.progress.item.reviewCount,2);
  assert.equal(s.replayPendingAnswer(alice.id,first).outcome,'duplicate');
  assert.equal(s.getStudyState(alice.id).progress.item.reviewCount,2);
  assert.equal(state.answers['q-one'].answeredAt,'2026-10-05T01:00:00.000Z');
  assert.throws(() => s.replayPendingAnswer(alice.id,{...first,input:{...first.input,selected:'changed'}}),/conflicts/);
  assert.throws(() => s.replayPendingAnswer(bob.id,first),/not found/);
});
test('legacy conflicts require a durable decision, including equality to the old target', () => {
  const old = event('old','legacy',true,'2026-10-05T01:00:00Z',empty,true);
  s.saveProgressEntry(alice.id,'legacy',old.input.progressEntry);
  assert.equal(s.replayPendingAnswer(alice.id,old).outcome,'needs_resolution');
  assert.equal(s.replayPendingAnswer(alice.id,old).outcome,'needs_resolution');
  assert.equal(s.getStudyState(alice.id).progress.legacy.correct,1);
  assert.equal(s.replayPendingAnswer(alice.id,{...old,decision:'already_counted'}).outcome,'already_counted');
  assert.equal(s.replayPendingAnswer(alice.id,{...old,decision:'merge'}).outcome,'duplicate');
  assert.equal(s.getStudyState(alice.id).progress.legacy.correct,1);
  const distinct = event('distinct','legacy',false,'2026-10-05T02:00:00Z',empty,true);
  assert.equal(s.replayPendingAnswer(alice.id,{...distinct,decision:'merge'}).outcome,'accepted');
  assert.equal(s.getStudyState(alice.id).progress.legacy.wrong,1);
  const archive = s.getDb().prepare('SELECT payload_json FROM answer_replay_receipts WHERE event_id=?').get('old');
  assert.equal(JSON.parse(archive.payload_json).input.selected,'A');
});
test('late answers preserve newer rating counts and schedule, then subsequent ratings retain answer counts', () => {
  s.saveCardReview(alice.id,'rating','easy',{lastReviewedAt:'2026-10-06T01:00:00Z'},{eventId:'card',reviewedAt:'2026-10-06T01:00:00Z'});
  const before = s.getStudyState(alice.id).progress.rating;
  const old = event('late','rating',false,'2026-10-05T01:00:00Z');
  const next = s.replayPendingAnswer(alice.id,old).state.progress.rating;
  assert.equal(next.correct,before.correct); assert.equal(next.wrong,before.wrong+1);
  assert.equal(next.nextReviewAt,before.nextReviewAt); assert.equal(next.lastReviewedAt,before.lastReviewedAt);
  s.saveCardReview(alice.id,'rating','hard',{lastReviewedAt:'2026-10-07T01:00:00Z'},{eventId:'later-card',reviewedAt:'2026-10-07T01:00:00Z'});
  assert.equal(s.getStudyState(alice.id).progress.rating.wrong,1);
});
test('numeric reading answers are objective events and stale answers cannot replace the latest answer', () => {
  const recent = event('reading-new','reading',true,'2026-10-06T01:00:00Z');
  recent.input.questionId='memory-card:reading'; recent.input.selected='1';
  s.replayPendingAnswer(alice.id,recent);
  const old = event('reading-old','reading',false,'2026-10-05T01:00:00Z');
  old.input.questionId=recent.input.questionId; old.input.selected='0';
  s.replayPendingAnswer(alice.id,old);
  assert.equal(s.getStudyState(alice.id).answers[recent.input.questionId].selected,'1');
  assert.equal(s.getStudyState(alice.id).progress.reading.wrong,1);
});
test('receipt, progress and history roll back together on persistence failure', () => {
  const input = event('rollback','rollback',true,'2026-10-05T01:00:00Z');
  input.input.attemptHistory=[{}];
  assert.throws(() => s.replayPendingAnswer(alice.id,input),/attempt/);
  assert.equal(s.getStudyState(alice.id).progress.rollback,undefined);
  assert.equal(s.getDb().prepare('SELECT count(*) AS n FROM answer_replay_receipts WHERE event_id=?').get('rollback').n,0);
});
function insertPractice(id, itemId) {
  const practice = {id,date:'2026-10-07',title:'专项练习',questions:[{id:id+'-q01',itemId}]};
  s.getDb().prepare('INSERT INTO daily_practices(id,user_id,practice_date,title,minutes,practice_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(id,alice.id,practice.date,practice.title,5,JSON.stringify(practice),practice.date,practice.date);
  return practice;
}
test('offline answers for deleted practices sync once without restoring deleted answers or sessions', () => {
  const practice = insertPractice('deleted-pack','deleted-only-item');
  assert.equal(s.deleteDailyPractice(alice.id,practice.id),true);
  const input = event('deleted-answer','deleted-only-item',true,'2026-10-07T01:00:00Z');
  input.input.questionId=practice.questions[0].id;
  input.input.attemptHistory=[{id:'deleted-session',practiceId:practice.id,startedAt:'2026-10-07T01:00:00Z'}];
  assert.equal(s.replayPendingAnswer(alice.id,input).outcome,'accepted');
  assert.equal(s.replayPendingAnswer(alice.id,input).outcome,'duplicate');
  assert.equal(s.getStudyState(alice.id).progress['deleted-only-item'].correct,1);
  assert.equal(s.getStudyState(alice.id).answers[input.input.questionId],undefined);
  assert.equal(s.getDailyPractice(alice.id,practice.id),null);
  assert(!s.getStudyState(alice.id).attemptHistory.some(a=>a.id==='deleted-session'));
  assert.throws(()=>s.replayPendingAnswer(bob.id,input),/not found/);
  assert.equal(JSON.parse(s.getDb().prepare('SELECT payload_json FROM answer_replay_receipts WHERE user_id=? AND event_id=?')
    .get(alice.id,input.eventId).payload_json).input.selected,'A');
  const next = event('after-deletion','item',true,'2026-10-07T02:00:00Z');
  next.input.attemptHistory=input.input.attemptHistory;
  assert.equal(s.replayPendingAnswer(alice.id,next).outcome,'accepted');
  assert(!s.getStudyState(alice.id).attemptHistory.some(a=>a.id==='deleted-session'));
});
test('older deletions use only the current account history, and unknown items still fail', () => {
  s.saveProgressEntry(alice.id,'previously-deleted',empty);
  const input=event('old-deletion','previously-deleted',false,'2026-10-07T01:00:00Z');
  assert.equal(s.replayPendingAnswer(alice.id,input).outcome,'accepted');
  assert.equal(s.getStudyState(alice.id).progress['previously-deleted'].wrong,1);
  assert.equal(s.getStudyState(alice.id).answers[input.input.questionId],undefined);
  assert.throws(()=>s.replayPendingAnswer(bob.id,input),/not found/);
  assert.throws(()=>s.replayPendingAnswer(alice.id,event('unknown','never-owned',true,'2026-10-07T01:00:00Z')),/not found/);
});
test('deleting one shared set leaves answers for the surviving set uploadable', () => {
  const first=insertPractice('shared-deleted','shared-item');
  const second=insertPractice('shared-surviving','shared-item');
  second.questions=first.questions;
  s.getDb().prepare('UPDATE daily_practices SET practice_json=? WHERE id=?').run(JSON.stringify(second),second.id);
  s.deleteDailyPractice(alice.id,first.id);
  const input=event('shared-answer','shared-item',true,'2026-10-07T01:00:00Z');
  input.input.questionId=first.questions[0].id;
  assert.equal(s.replayPendingAnswer(alice.id,input).outcome,'accepted');
  assert.equal(s.getStudyState(alice.id).answers[input.input.questionId].selected,'A');
});
test('authenticated replay API exposes a receipt and rejects missing authentication', async () => {
  const { createApiHandler } = await import('./api-handler.mjs');
  const { Readable } = await import('node:stream');
  const handler = createApiHandler({});
  async function request(auth) {
    const req=Readable.from([Buffer.from(JSON.stringify(event('http','item',true,'2026-10-07T01:00:00Z')))]);
    req.url='/api/answers/replay'; req.method='POST'; req.headers={host:'localhost',...(auth?{authorization:`Bearer ${auth}`}:{})};
    let status,body; await handler(req,{writeHead(code){status=code;},end(value){body=JSON.parse(value);}});
    return {status,body};
  }
  assert.equal((await request()).status,401);
  const token=s.loginUser('replay-alice','password').token;
  assert.equal((await request(token)).body.outcome,'accepted');
  assert.equal((await request(token)).body.outcome,'duplicate');
});

test('an old native pending payload replays against inflated cloud intervals and retries once', () => {
  const before={correct:17,wrong:0,status:'mastered',reviewCount:17,ease:3.2,intervalDays:80714138,lastReviewedAt:'2026-10-08T01:10:48Z',nextReviewAt:'+223014-07-29T01:10:48.000Z'};
  s.saveProgressEntry(alice.id,'item',before);
  const payload={eventId:'overflow-native',legacy:false,before,input:{questionId:'overflow-q',itemId:'item',selected:'A',correct:true,
    progressEntry:{...before,correct:18,reviewCount:18,lastReviewedAt:'2026-10-08T11:00:00Z',intervalDays:258285242,nextReviewAt:'invalid-native-date'}}};
  const receipt=s.replayPendingAnswer(alice.id,payload);
  assert.equal(receipt.outcome,'accepted');
  assert.equal(receipt.state.progress.item.correct,18);
  assert.equal(receipt.state.progress.item.intervalDays,365);
  assert.equal(receipt.state.progress.item.nextReviewAt,'2027-10-08T11:00:00.000Z');
  assert.equal(s.replayPendingAnswer(alice.id,payload).outcome,'duplicate');
  assert.equal(s.getStudyState(alice.id).progress.item.correct,18);
});
