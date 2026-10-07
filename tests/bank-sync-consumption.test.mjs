import {test} from 'node:test';import assert from 'node:assert/strict';import {transform} from 'esbuild';import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/lib/bankSync.ts',import.meta.url),'utf8');
const {code}=await transform(source,{loader:'ts',format:'esm'});
const {frozenBankQuestion,validateBankChange}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('actual sync consumer keeps legacy identity and hydrates frozen answers and articles instead of latest',()=>{
 const key=(id,revision)=>JSON.stringify([id,revision]);
 const version=(id,revision,payload)=>({id,revision,schemaVersion:1,payload});
 const records={questionVersions:{[key('B1',1)]:version('B1',1,{legacy:{id:'source-question',itemId:'source-item',prompt:'原题',taskConditions:['一万円以下']},options:[{id:'option-0',text:'A'},{id:'option-1',text:'B'}],answer:{type:'option',optionId:'option-0'},materialRefs:[{id:'article/A',revision:1}]})},materialVersions:{[key('article/A',1)]:version('article/A',1,{type:'article',blocks:[{text:'旧文章'}]}),[key('article/A',2)]:version('article/A',2,{type:'article',blocks:[{text:'新文章'}]})}};
 const legacy={id:'PR-Q1',itemId:'I1',prompt:'后来修改的题',choices:['B','A'],answer:'B',passage:'后来修改的文章',canonicalQuestionId:'B1',questionRevision:1};
 const result=frozenBankQuestion(records,legacy);
 assert.equal(result.id,'PR-Q1');assert.equal(result.itemId,'I1');assert.equal(result.prompt,'原题');assert.deepEqual(result.choices,['A','B']);assert.equal(result.answer,'A');assert.equal(result.passage,'旧文章');assert.deepEqual(result.taskConditions,['一万円以下']);
 assert.equal(legacy.answer,'B');assert.deepEqual(frozenBankQuestion({},legacy),legacy);
 assert.throws(()=>validateBankChange('questionVersions',key('B1',2),records.questionVersions[key('B1',1)]),/cursor/);
});
