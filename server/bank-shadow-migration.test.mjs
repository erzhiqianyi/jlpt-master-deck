import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {legacyInventory,migrateBankShadow} from './bank-shadow-migration.mjs';
test('shadow batches resume without changing legacy answers, identities or drafts, and report ambiguous answers',()=>{
 const db=new DatabaseSync(':memory:');try{
 db.exec('CREATE TABLE daily_practices(id TEXT,user_id INTEGER,practice_json TEXT); CREATE TABLE answers(question_id TEXT,correct INTEGER); CREATE TABLE review_pack_drafts(id TEXT,user_id INTEGER,content_json TEXT);');
 const insert=db.prepare('INSERT INTO daily_practices VALUES(?,?,?)');
 insert.run('PR1',1,JSON.stringify({questions:[{id:'Q1',kind:'grammar',prompt:'問題',choices:['A','B','C','D'],answer:'A'}]}));
 insert.run('PR2',1,JSON.stringify({questions:[{id:'Q2',kind:'grammar',prompt:'問題',choices:['A','B','C','D'],answer:1}]}));
 db.prepare('INSERT INTO review_pack_drafts VALUES(?,?,?)').run('DR947',1,JSON.stringify({sections:[{questions:[{id:'DR947-Q1',answer:0,choices:['A','B','C','D']}]}]}));
 db.prepare('INSERT INTO answers VALUES(?,?)').run('Q1',1);
 const before=legacyInventory(db);
 const first=migrateBankShadow(db,{batchSize:1,maxBatches:1});assert.equal(first.nextIndex,1);
 const final=migrateBankShadow(db,{batchSize:1});assert.equal(final.nextIndex,3);assert.equal(final.complete,false);assert.equal(final.errors.length,1);assert.equal(final.errors[0].id,'PR2');
 assert.deepEqual(legacyInventory(db),before);
 const count=db.prepare('SELECT COUNT(*) AS n FROM bank_question_versions').get().n;
 migrateBankShadow(db);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bank_question_versions').get().n,count);
 const draft=JSON.parse(db.prepare("SELECT payload_json FROM bank_question_versions WHERE payload_json LIKE '%DR947-Q1%'").get().payload_json);
 assert.equal(draft.legacy.answer,0);assert.equal(draft.answer.type,'unscored');
 }finally{db.close();}
});
test('unowned global knowledge and orphan listening sources prevent declaring full migration complete',()=>{
 const db=new DatabaseSync(':memory:');try{db.exec("CREATE TABLE review_items(id TEXT); INSERT INTO review_items VALUES('global'); CREATE TABLE listening_questions(id TEXT); INSERT INTO listening_questions VALUES('LS1');");
 const result=migrateBankShadow(db);assert.equal(result.complete,false);assert.equal(result.unsupported.length,2);assert.ok(result.legacyUnchanged);
 }finally{db.close();}
});
test('audio assets are reused for multiple LS questions without uploads and legacy media rows stay identical',()=>{
 const db=new DatabaseSync(':memory:');try{
 db.exec('CREATE TABLE listening_audio_assets(id TEXT,user_id INTEGER,file_name TEXT,mime TEXT,sha256 TEXT,transcript TEXT,transcript_translation TEXT); CREATE TABLE listening_questions(id TEXT,user_id INTEGER,audio_asset_id TEXT,title TEXT,question TEXT,choices_json TEXT,answer_index INTEGER,explanation TEXT,question_type_id TEXT);');
 db.prepare('INSERT INTO listening_audio_assets VALUES(?,?,?,?,?,?,?)').run('AU1',1,'existing.mp3','audio/mpeg','hash','本文','译文');
 for(const id of ['LS1','LS2'])db.prepare('INSERT INTO listening_questions VALUES(?,?,?,?,?,?,?,?,?)').run(id,1,'AU1',id,'問題','["A","B","C","D"]',2,'理由','listening-task');
 const before=legacyInventory(db);const report=migrateBankShadow(db);assert.equal(report.complete,true);assert.deepEqual(legacyInventory(db),before);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bank_materials').get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bank_questions').get().n,2);
 const group=JSON.parse(db.prepare('SELECT payload_json FROM bank_material_group_versions').get().payload_json);assert.equal(group.questionRefs.length,2);
 }finally{db.close();}
});
