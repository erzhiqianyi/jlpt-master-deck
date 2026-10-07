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
