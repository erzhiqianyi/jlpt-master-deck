import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressAfterAnswer } from '../src/domain/srs.mjs';
const now = new Date('2026-10-08T11:00:00Z');
test('early repeated answers count without extending the due date or ease', () => {
  const first = progressAfterAnswer(undefined, true, now);
  let p = first;
  for (let i=0;i<100;i++) p=progressAfterAnswer(p,true,now);
  assert.equal(p.correct,101); assert.equal(p.reviewCount,101);
  assert.equal(p.nextReviewAt,first.nextReviewAt); assert.equal(p.ease,first.ease);
  assert.equal(p.intervalDays,1);
  const due = progressAfterAnswer(p,true,new Date(p.nextReviewAt));
  assert.equal(due.intervalDays,3);
  const wrong = progressAfterAnswer(due,false,now);
  assert.equal(wrong.intervalDays,1); assert.equal(wrong.wrong,1);
});
test('due reviews grow from 1 to 3 to 9 days and remain bounded indefinitely', () => {
  let p=progressAfterAnswer(undefined,true,now);
  p=progressAfterAnswer(p,true,new Date(p.nextReviewAt)); assert.equal(p.intervalDays,3);
  p=progressAfterAnswer(p,true,new Date(p.nextReviewAt)); assert.equal(p.intervalDays,9);
  for(let i=0;i<100;i++) p=progressAfterAnswer(p,true,new Date(p.nextReviewAt));
  assert.equal(p.intervalDays,365); assert(Number.isFinite(Date.parse(p.nextReviewAt)));
});
test('the observed cloud overflow recovers without changing historical counts', () => {
  const p=progressAfterAnswer({correct:17,wrong:0,reviewCount:17,ease:3.2,intervalDays:80714138,nextReviewAt:'+223014-07-29T01:10:48.000Z'},true,now);
  assert.equal(p.intervalDays,365); assert.equal(p.correct,18); assert.equal(p.reviewCount,18);
  assert.equal(p.nextReviewAt,'2027-10-08T11:00:00.000Z');
});
