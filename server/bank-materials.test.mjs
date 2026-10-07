import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ensureQuestionBankSchema, readQuestionVersion } from './question-bank.mjs';
import { ensureBankMaterialSchema, saveMaterial, readMaterialVersion, saveMaterialGroup, persistLibraryQuestion, attachPracticeReferences, bankAudioHasHistory, retireLibraryQuestion } from './bank-materials.mjs';
import { transaction } from './platform.mjs';
const setup=()=>{const db=new DatabaseSync(':memory:');ensureQuestionBankSchema(db);ensureBankMaterialSchema(db);return db;};
const question={id:'q1',kind:'grammar',prompt:'雨（ ）降れば',choices:['さえ','こそ'],answer:'さえ',answerIndex:0};
test('shared audio supports multiple questions and freezes transcript revisions without duplicating asset identity',()=>{
 const db=setup();try {
 const old=saveMaterial(db,1,'audio:AU1',{type:'audio',audioAssetId:'AU1',transcript:'初版'});
 const q1=persistLibraryQuestion(db,1,{kind:'listening',id:'LS1',questionId:'LS1'},question,{materialRefs:[old]});
 const q2=persistLibraryQuestion(db,1,{kind:'listening',id:'LS2',questionId:'LS2'},question,{materialRefs:[old]});
 assert.notEqual(q1.id,q2.id,'same stem does not merge unrelated identity');
 saveMaterialGroup(db,1,'audio:AU1',{materialRefs:[old],questionRefs:[q1,q2]});
 const newer=saveMaterial(db,1,'audio:AU1',{type:'audio',audioAssetId:'AU1',transcript:'修正版'});
 assert.equal(newer.revision,2);assert.equal(readMaterialVersion(db,1,old).transcript,'初版');
 assert.deepEqual(readQuestionVersion(db,1,q1).materialRefs,[old]);
 assert.equal(saveMaterial(db,1,'audio:AU1',{type:'audio',audioAssetId:'AU1',transcript:'修正版'}).revision,2);
 retireLibraryQuestion(db,1,{kind:'listening',id:'LS1',questionId:'LS1'});
 assert.ok(bankAudioHasHistory(db,1,'AU1'));assert.ok(readQuestionVersion(db,1,q1));
 }finally{db.close();}
});
test('owner guards reject material and question references and transaction leaves no partial rows',()=>{
 const db=setup();try {
 const article=saveMaterial(db,1,'article:A',{type:'article',blocks:[{text:'本文'}]});
 assert.equal(readMaterialVersion(db,2,article),null);
 assert.throws(()=>transaction(db,()=>{saveMaterial(db,2,'partial',{type:'article',blocks:[]});persistLibraryQuestion(db,2,{kind:'reading',id:'R',questionId:'R'},question,{materialRefs:[article]});}),/Owned material/);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bank_materials WHERE owner=2').get().n,0);
 const q=persistLibraryQuestion(db,1,{kind:'reading',id:'R',questionId:'R'},question,{materialRefs:[article]});
 assert.throws(()=>saveMaterialGroup(db,2,'foreign',{materialRefs:[],questionRefs:[q]}),/Owned question/);
 assert.throws(()=>attachPracticeReferences(db,2,{id:'PR2',questions:[{...question,canonicalQuestionId:q.id,questionRevision:q.revision}]}),/Owned canonical/);
 }finally{db.close();}
});
test('explicit canonical identity reuses sources across practice copies and source changes preserve old snapshots',()=>{
 const db=setup();try {
 const source=persistLibraryQuestion(db,1,{kind:'item-seed',id:'IT1',questionId:'seed1'},question,{knowledgeIds:['IT1']});
 const make=id=>({id,questions:[{...question,itemId:'IT1',canonicalQuestionId:source.id,questionRevision:source.revision}]});
 const a=attachPracticeReferences(db,1,make('PR1'));const b=attachPracticeReferences(db,1,make('PR2'));
 assert.equal(a.questions[0].canonicalQuestionId,b.questions[0].canonicalQuestionId);
 const frozen=readQuestionVersion(db,1,{id:source.id,revision:a.questions[0].questionRevision});
 const updated=persistLibraryQuestion(db,1,{kind:'item-seed',id:'IT1',questionId:'seed1'},{...question,prompt:'水（ ）あれば'}, {knowledgeIds:['IT1']});
 assert.equal(updated.id,source.id);assert.ok(updated.revision>source.revision);
 assert.deepEqual(readQuestionVersion(db,1,{id:source.id,revision:a.questions[0].questionRevision}),frozen);
 assert.equal(a.questions[0].prompt,question.prompt);
 }finally{db.close();}
});
