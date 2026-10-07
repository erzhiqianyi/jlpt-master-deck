import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const built=await build({entryPoints:['src/domain/attemptPresentation.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {freezePresentedQuestion,completeAttempt}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
test('paged questions freeze at first display before any choice; unseen entries are not historical guesses',()=>{
 const start={id:'attempt',questionIds:['a','b'],answers:[],questionManifest:[{instanceId:'a',status:'notPresented'},{instanceId:'b',status:'notPresented'}]};
 const source={id:'a',prompt:'首次呈现',choices:['A','B'],answer:'B',canonicalQuestionId:'bank-a',questionRevision:1};
 const first=freezePresentedQuestion(start,source);source.prompt='随后修改';source.answer='A';
 assert.equal(first.answers.length,0);assert.equal(first.questionManifest[0].snapshot.prompt,'首次呈现');assert.equal(first.questionManifest[0].snapshot.answer,'B');
 assert.equal(first.questionManifest[1].status,'notPresented');assert.equal(freezePresentedQuestion(first,source).questionManifest[0].snapshot.answer,'B');
 assert.equal(freezePresentedQuestion(first,{id:'b',prompt:'第二题第一次显示',choices:['C','D'],answer:'C'}).questionManifest[1].status,'frozen');
});

test('unpresented and unanswered questions do not become wrong answers when closing an attempt',()=>{
 const attempt={id:'AT',questionIds:['a','b'],answers:[{questionId:'a',itemId:'i',kind:'grammar',selected:'A',correct:true,answeredAt:'2026-10-07',elapsedMs:0}]};
 const closed=completeAttempt(attempt,{},[{id:'a',itemId:'i',kind:'grammar'},{id:'b',itemId:'i',kind:'grammar'}],new Date('2026-10-07'));
 assert.equal(closed.answers.length,1);assert.equal(closed.summary.total,1);assert.equal(closed.summary.wrong,0);
});
