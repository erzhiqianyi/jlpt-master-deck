import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const built=await build({entryPoints:['src/domain/dedicatedAttempts.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {dedicatedAttempt,recordDedicatedChoice}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
test('dedicated Web reading freezes article and answer before choosing; later source edits cannot change grading',()=>{
 const source={id:'RD1',title:'文章',passage:'原始文章',question:'原始任务',choices:['A','B','C','D'],answerIndex:1,explanation:'旧解析'};
 const attempt=dedicatedAttempt([source],'session','reading','2026-10-07');source.answerIndex=0;source.passage='新文章';
 assert.equal(attempt.answers.length,0);assert.equal(attempt.questionManifest[0].snapshot.context,'原始文章');
 const finished=recordDedicatedChoice(attempt,'RD1',1,'2026-10-08');assert.equal(finished.answers[0].correct,true);assert.equal(finished.summary.total,1);
});
test('dedicated Web listening excludes free responses and deduplicates scored retries',()=>{
 const question={id:'LS1',title:'音频',question:'任务',choices:['A','B','C'],answerIndex:1,explanation:'解析'};
 let attempt=dedicatedAttempt([question,{...question,id:'free',choices:[],answerIndex:-1}],'session','listening','2026-10-07');
 attempt=recordDedicatedChoice(attempt,'LS1',1,'2026-10-07');assert.equal(attempt.completedAt,undefined);
 const finished=recordDedicatedChoice(attempt,'free','私の答え','2026-10-07');assert.equal(finished.summary.total,1);assert.equal(finished.answers.length,1);assert.equal(finished.unscoredResponses.length,1);
 assert.equal(recordDedicatedChoice(finished,'LS1',1,'2026-10-08').answers.length,1);
});
