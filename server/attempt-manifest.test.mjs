import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {ensureQuestionBankSchema,adaptQuestionSource,saveQuestionSource} from './question-bank.mjs';
import {preserveAttemptManifest,manifestForQuestions} from './attempt-manifest.mjs';
test('attempt presentation survives source edits, retains old score, validates ownership, and never guesses old originals',()=>{
 const db=new DatabaseSync(':memory:');try{
 ensureQuestionBankSchema(db);
 const q={id:'same-stem-1',kind:'grammar',prompt:'原題',choices:['A','B'],answer:'B'};
 const ref=saveQuestionSource(db,adaptQuestionSource(1,{kind:'practice',id:'PR1',questionId:q.id},q));
 Object.assign(q,{canonicalQuestionId:ref.id,questionRevision:ref.revision});
 const incoming={id:'AT1',questionIds:[q.id],answers:[{questionId:q.id,correct:false}],questionManifest:manifestForQuestions([q])};
 const frozen=preserveAttemptManifest(db,1,incoming);
 const completed={...frozen,completedAt:'2026-10-07'};
 const changed=structuredClone(incoming);changed.questionManifest[0].snapshot.answer='A';
 const kept=preserveAttemptManifest(db,1,changed,completed);assert.equal(kept.questionManifest[0].snapshot.answer,'B');assert.equal(kept.answers[0].correct,false);
 assert.throws(()=>preserveAttemptManifest(db,2,incoming),/Owned/);
 assert.equal(preserveAttemptManifest(db,1,{id:'old',questionIds:['missing'],answers:[]}).questionManifest[0].status,'missingOriginal');
 }finally{db.close();}
});

test('late presentation checkpoints cannot erase answers or reopen completed history',()=>{
 const db=new DatabaseSync(':memory:');try{
 const q={id:'q',choices:['A','B'],answer:'A'};const start={id:'AT',questionIds:['q'],answers:[],questionManifest:manifestForQuestions([q])};
 const answered={...start,answers:[{questionId:'q',selected:'A',correct:true,answeredAt:'2026-10-07T00:00:01Z'}]};
 assert.deepEqual(preserveAttemptManifest(db,1,start,answered).answers,answered.answers);
 const complete={...answered,completedAt:'2026-10-07T00:00:02Z',summary:{correct:1}};
 assert.equal(preserveAttemptManifest(db,1,start,complete).completedAt,complete.completedAt);
 }finally{db.close();}
});

test('an old answered missingOriginal entry cannot be upgraded from a current source snapshot',()=>{
 const db=new DatabaseSync(':memory:');try {
 const old={id:'legacy',questionIds:['q'],answers:[{questionId:'q',selected:'A',correct:true}],questionManifest:[{instanceId:'q',status:'missingOriginal'}]};
 const incoming={...old,questionManifest:manifestForQuestions([{id:'q',choices:['A','B'],answer:'B'}])};
 const preserved=preserveAttemptManifest(db,1,incoming,old);assert.equal(preserved.questionManifest[0].status,'missingOriginal');assert.equal(preserved.answers[0].correct,true);
 }finally{db.close();}
});
