import {test} from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdtempSync,mkdirSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
test('local REST authors independently, preserves approval gate, reuses identity and serves existing Web/native practice contracts',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'jlpt-author-api-'));mkdirSync(join(dir,'data'));
 const proc=spawn(process.execPath,['server/api.mjs'],{env:{...process.env,JLPT_API_PORT:'19084',JLPT_DB_PATH:join(dir,'db.sqlite'),JLPT_REVIEW_DATA_PATH:join(dir,'data'),JLPT_FIREBASE_CONFIG:'',JLPT_FIREBASE_CONFIG_PATH:join(dir,'no-firebase.json')},stdio:['ignore','pipe','pipe']});
 try {
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Local authoring API did not start')),10000);proc.stdout.once('data',()=>{clearTimeout(timer);resolve();});proc.once('error',error=>{clearTimeout(timer);reject(error);});proc.once('exit',code=>{clearTimeout(timer);reject(new Error(`Local server exited ${code}`));});});
  const call=async(path,{token,body,method='GET'}={})=>{const response=await fetch('http://127.0.0.1:19084'+path,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};};
  const user=(await call('/api/auth/register',{method:'POST',body:{username:'api-question-author',password:'password'}})).body;
  const other=(await call('/api/auth/register',{method:'POST',body:{username:'api-foreign-author',password:'password'}})).body;
  const choices=['だけ','こそ','さえ','まで'];
  const input={requestId:'rest-author-1',title:'独立文法题',question:{questionTypeId:'grammar-form',level:'N1',prompt:'合成fixture：（ ）を選ぶ。',choices,answerIndex:0,explanation:'合成fixture：接続と意味の根拠。',choiceAnalysis:choices.map(choice=>({choice,explanation:`合成fixture：${choice}の接続と意味。`}))}};
  assert.equal((await call('/api/question-drafts',{method:'POST',body:input})).status,401);
  const created=await call('/api/question-drafts',{method:'POST',token:user.token,body:input});assert.equal(created.status,201);assert.equal(created.body.draft.status,'draft');
  const id=created.body.draft.id;
  assert.equal((await call('/api/question-drafts/'+id,{token:other.token})).status,404);
  assert.equal((await call('/api/question-drafts',{method:'POST',token:user.token,body:input})).body.draft.id,id);
  assert.equal((await call(`/api/drafts/${id}/publish-daily-practice`,{method:'POST',token:user.token,body:{date:'2026-10-12'}})).status,400);
  assert.equal((await call(`/api/drafts/${id}/confirm`,{method:'POST',token:user.token,body:{}})).status,200);
  const published=await call(`/api/drafts/${id}/publish-daily-practice`,{method:'POST',token:user.token,body:{date:'2026-10-12'}});assert.equal(published.status,201);
  const q=published.body.practice.questions[0];assert.equal(q.questionTypeId,'grammar-form');assert.equal(q.answer,choices[0]);assert.equal(q.canonicalQuestionId,created.body.acceptedQuestionRef.id);assert.ok(q.questionRevision>0);assert.ok(q.itemId.startsWith('question-bank:'));
 }finally{proc.kill('SIGTERM');}
});
