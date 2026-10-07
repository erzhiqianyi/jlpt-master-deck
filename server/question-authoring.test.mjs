import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'jlpt-authoring-'));process.env.JLPT_DB_PATH=join(dir,'test.sqlite');process.env.JLPT_REVIEW_DATA_PATH=join(dir,'data');mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const storage=await import('./storage.mjs');const {saveAuthoredQuestion,getAuthoredQuestion}=await import('./question-authoring.mjs');const {saveMaterial}=await import('./bank-materials.mjs');const {readQuestionVersion}=await import('./question-bank.mjs');const {tools}=await import('./mcp-tools.mjs');
const owner=storage.createUser('independent-author','password');const other=storage.createUser('foreign-author','password');const db=storage.getDb();
const make=(type,extra={})=>({questionTypeId:type,level:['vocabulary-word-formation','vocabulary-orthography'].includes(type)?'N2':'N1',prompt:'猫のことばを選ぶ。',targetSpan:{start:0,end:1,text:'猫'},choices:['A','B','C','D'],answerIndex:0,explanation:'合成fixture：本文の条件と空欄の接続を照合する。',choiceAnalysis:['A','B','C','D'].map(choice=>({choice,explanation:`合成fixture：${choice}と設問の条件を照合する。`})),...extra});
test('all six vocabulary and three grammar author types persist independently and use actual user approval/publication',()=>{
 const before=storage.loadReviewData(owner.id).items;
 const article=saveMaterial(db,owner.id,'article:authored',{type:'article',blocks:[{text:'文章【1】の接続を確認する。'}]});
 const types=['vocabulary-kanji-reading','vocabulary-orthography','vocabulary-word-formation','vocabulary-context','vocabulary-paraphrase','vocabulary-usage','grammar-form','grammar-composition','grammar-text'];
 for(const type of types) {
  const question=make(type,type==='grammar-composition'?{prompt:'（ ） （ ） ★ （ ）',assembly:{correctOrder:['option-0','option-1','option-2','option-3'],starSlot:0}}:type==='grammar-text'?{blankId:'【1】'}:{});
  const input={requestId:type,title:type,question,...(type==='grammar-text'?{materialRefs:[article]}:{})};
  const first=saveAuthoredQuestion(owner.id,input);const retry=saveAuthoredQuestion(owner.id,input);
  assert.equal(first.draft.status,'draft');assert.equal(first.draft.id,retry.draft.id);assert.deepEqual(first.acceptedQuestionRef,retry.acceptedQuestionRef);assert.equal(retry.unchanged,true);
  const initial=readQuestionVersion(db,owner.id,first.acceptedQuestionRef);assert.equal(initial.strictExamEligible,false);assert.equal(initial.questionTypeId,type);
  assert.throws(()=>storage.createDailyPracticeFromDraft(owner.id,first.draft.id,{date:'2026-10-08'}),/approved/);
  storage.confirmDraftForAgentProcessing(owner.id,first.draft.id);
  const practice=storage.createDailyPracticeFromDraft(owner.id,first.draft.id,{date:'2026-10-08'});const q=practice.questions[0];
  assert.equal(q.canonicalQuestionId,first.acceptedQuestionRef.id);assert.equal(q.questionTypeId,type);assert.equal(q.answer,'A');assert.ok(q.itemId.startsWith('question-bank:'));
  const ready=readQuestionVersion(db,owner.id,{id:q.canonicalQuestionId,revision:q.questionRevision});assert.equal(ready.strictExamEligible,true);
  if(type==='grammar-text'){assert.deepEqual(q.materialRefs,[article]);assert.equal(q.passage,'文章【1】の接続を確認する。');}
 }
 assert.deepEqual(storage.loadReviewData(owner.id).items,before);
});
test('edits reset approval, preserve old version, reject stale/foreign/private references and request reuse conflicts',()=>{
 const input={requestId:'edit-original',title:'作者题',question:make('grammar-form')};const first=saveAuthoredQuestion(owner.id,input);
 storage.confirmDraftForAgentProcessing(owner.id,first.draft.id);
 const oldPractice=storage.createDailyPracticeFromDraft(owner.id,first.draft.id,{date:'2026-10-10'});
 const saved=readQuestionVersion(db,owner.id,first.acceptedQuestionRef);
 const revision=getAuthoredQuestion(owner.id,first.draft.id).questionRef.questionRevision;
 const edit={...input,requestId:'edit-next',draftId:first.draft.id,expectedRevision:revision,question:{...input.question,prompt:'新しい問題を選ぶ。'}};
 const updated=saveAuthoredQuestion(owner.id,edit);assert.equal(updated.draft.status,'draft');assert.equal(updated.acceptedQuestionRef.id,first.acceptedQuestionRef.id);assert.deepEqual(readQuestionVersion(db,owner.id,first.acceptedQuestionRef),saved);
 assert.throws(()=>saveAuthoredQuestion(owner.id,{...edit,requestId:'stale'}),{statusCode:409});
 assert.throws(()=>saveAuthoredQuestion(owner.id,{...input,question:{...input.question,prompt:'衝突'}}),{statusCode:409});
 assert.throws(()=>getAuthoredQuestion(other.id,first.draft.id),{statusCode:404});
 assert.throws(()=>saveAuthoredQuestion(other.id,{...edit,requestId:'foreign'}),{statusCode:404});
 assert.throws(()=>saveAuthoredQuestion(owner.id,{...input,requestId:'bad-knowledge',knowledgeIds:['foreign-item']}),{statusCode:404});
 const article=saveMaterial(db,other.id,'private-article',{type:'article',blocks:[{text:'【1】'}]});
 assert.throws(()=>saveAuthoredQuestion(owner.id,{...input,requestId:'bad-material',question:make('grammar-text',{blankId:'【1】'}),materialRefs:[article]}),{statusCode:404});
 assert.throws(()=>saveAuthoredQuestion(owner.id,{...input,requestId:'inapplicable',question:make('vocabulary-kanji-reading',{prompt:'カタカナ',targetSpan:{start:0,end:4,text:'カタカナ'}})}),/type-specific/);
 storage.confirmDraftForAgentProcessing(owner.id,updated.draft.id);
 const newPractice=storage.createDailyPracticeFromDraft(owner.id,updated.draft.id,{date:'2026-10-11'});
 assert.notEqual(newPractice.id,oldPractice.id);assert.equal(newPractice.questions[0].canonicalQuestionId,oldPractice.questions[0].canonicalQuestionId);
 assert.equal(storage.getDailyPractice(owner.id,oldPractice.id).questions[0].prompt,input.question.prompt);
 assert.equal(newPractice.questions[0].prompt,edit.question.prompt);
 assert.equal(storage.createDailyPracticeFromDraft(owner.id,updated.draft.id,{date:'2026-10-11'}).id,newPractice.id);
});
test('real MCP author/read/publish handlers retain review gate and return canonical IDs without changing knowledge',async()=>{
 const call=async(name,args)=>JSON.parse((await tools.find(tool=>tool.name===name).handler(args,{ownerId:String(owner.id),scopes:['library:write']})).content[0].text);
 const authored=await call('save_question_draft',{requestId:'mcp-author',title:'MCP作者题',question:make('grammar-form',{reviewStatus:'approved'})});
 assert.equal(authored.draft.status,'draft');assert.equal((await call('get_question_draft',{draftId:authored.draft.id})).questionRef.canonicalQuestionId,authored.acceptedQuestionRef.id);
 await assert.rejects(()=>call('publish_draft_as_daily_practice',{draft_id:authored.draft.id,date:'2026-10-09'}),/approved/);
 storage.confirmDraftForAgentProcessing(owner.id,authored.draft.id);
 const practice=await call('publish_draft_as_daily_practice',{draft_id:authored.draft.id,date:'2026-10-09'});
 assert.equal(practice.questions[0].canonicalQuestionId,authored.acceptedQuestionRef.id);
});
test('optional many-to-many links preserve knowledge bytes and new numeric answers require an explicit source base',()=>{
 const insert=db.prepare('INSERT INTO user_review_items(id,user_id,item_json) VALUES(?,?,?)');
 for(const id of ['K1','K2'])insert.run(id,owner.id,JSON.stringify({id,deck:'grammar_expression',type:'grammar',original:`合成fixture-${id}`,meaning_zh:'合成知识点'}));
 insert.run('private-K3',other.id,JSON.stringify({id:'private-K3',deck:'grammar_expression',type:'grammar',original:'其他账号的合成知识点'}));
 const before=db.prepare('SELECT item_json FROM user_review_items WHERE user_id=? ORDER BY id').all(owner.id);
 const q=make('grammar-form');delete q.answerIndex;q.answer=1;
 assert.throws(()=>saveAuthoredQuestion(owner.id,{requestId:'ambiguous-author',title:'数字答案',question:q}),/base/);
 const saved=saveAuthoredQuestion(owner.id,{requestId:'declared-base',title:'数字答案',question:{...q,numericAnswerBase:1},knowledgeIds:['K1','K2']});
 const snapshot=readQuestionVersion(db,owner.id,saved.acceptedQuestionRef);assert.equal(snapshot.answer.optionId,'option-0');assert.deepEqual(snapshot.knowledgeIds,['K1','K2']);
 assert.deepEqual(db.prepare('SELECT item_json FROM user_review_items WHERE user_id=? ORDER BY id').all(owner.id),before);
 assert.throws(()=>saveAuthoredQuestion(owner.id,{requestId:'private-link',title:'隐私',question:make('grammar-form'),knowledgeIds:['private-K3']}),{statusCode:404});
});
