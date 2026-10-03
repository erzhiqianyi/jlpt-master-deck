import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>', {url:'http://localhost/'});
for (const key of ['window','document','localStorage','HTMLElement','HTMLDialogElement','Event','MouseEvent','KeyboardEvent','Node']) globalThis[key]=dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
window.requestAnimationFrame=(callback)=>{callback();return 0;};
window.cancelAnimationFrame=()=>{};
window.scrollTo=()=>{};
window.HTMLElement.prototype.scrollIntoView=()=>{};
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
await mkdir('.local',{recursive:true});
const dir=await mkdtemp(resolve('.local','practice-tests-'));
const out=resolve(dir,'components.mjs');
await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
export {MockExamPanel} from './src/features/practice/MockExamPanel';
export {DesignedExamPanel} from './src/features/practice/DesignedExamPanel';
export {legacyMockStorageKey,legacyMockRevision,readLegacyMockState} from './src/features/practice/legacyMockState';
export {PracticePanel,PracticeReviewPanel} from './src/features/practice/StudyPanels';
export {MixedPracticeHub} from './src/features/practice/MixedPracticeHub';
export {practiceReviewModel,conciseEvidence} from './src/features/practice/practicePresentation';
export {translations} from './src/i18n/translations';
`},bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',loader:{'.css':'empty'},outfile:out});
const {MockExamPanel,DesignedExamPanel,legacyMockStorageKey,legacyMockRevision,readLegacyMockState,PracticePanel,PracticeReviewPanel,MixedPracticeHub,practiceReviewModel,conciseEvidence,translations}=await import(pathToFileURL(out));
const {createElement:h,act}=await import('react');
const {createRoot}=await import('react-dom/client');
const root=createRoot(document.getElementById('root'));
const labels=translations['zh-CN'];
const noop=()=>{};
let renderId=0;
async function render(component,props){await act(async()=>root.render(h(component,{key:++renderId,...props})));}
async function click(element){assert.ok(element,'expected element exists');await act(async()=>element.click());}
const button=(text)=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
const questions=[1,2,3].map(i=>({id:`q${i}`,itemId:`word${i}`,kind:'grammar',title:`Question ${i}`,prompt:`問題 ${i}`,choices:['甲','乙','丙','丁'],answer:'乙',correctReason:'第一句依据。第二句详细解释。',memoryPoint:'记住事实。进一步记忆说明。',translationZh:'完整翻译内容',choiceAnalysis:[{choice:'甲',explanation:'甲的完整说明',correct:false}]}));
const base={activeQuestion:questions[0],questions,questionsLength:3,activeIndex:0,answeredCount:1,complete:false,feedbackMode:'immediate',answers:{q1:{selected:'乙',correct:true}},items:[],labels,questionTypeLabel:'Synthetic practice',settings:{locale:'zh-CN',showExplanationRuby:false},onAnswer:noop,onPrev:noop,onNext:noop,onJump:noop,onRestart:noop,onPracticeHome:noop,onPrepareReview:async()=>{},onReview:noop,analysisStatus:'idle'};
after(async()=>{await act(async()=>root.unmount());dom.window.close();await rm(dir,{recursive:true,force:true});});

test('review model retains unanswered and recalculates accuracy from all questions',()=>{
 const model=practiceReviewModel(questions,{q1:{selected:'乙',correct:false},q2:{selected:'甲',correct:true}});
 assert.deepEqual(model.rows.map(row=>row.status),['correct','wrong','unanswered']);
 assert.equal(model.total,3);assert.equal(model.correct,1);assert.equal(model.wrong,1);assert.equal(model.unanswered,1);assert.equal(model.accuracy,1/3);
 const historical=practiceReviewModel(questions,{q1:{selected:'乙',correct:true}},{answers:[],questionIds:['q1','q2','q3']});
 assert.equal(historical.answered,0,'empty historical answer sets must not borrow current answers');
});

test('concise evidence keeps a source excerpt without dropping the full explanation',()=>{
 assert.deepEqual(conciseEvidence('【依据】第一句。第二句。'),{summary:'第一句。',hasMore:true});
 assert.equal(conciseEvidence('Only a short reason').hasMore,false);
 assert.equal(conciseEvidence('a'.repeat(300)).summary.length,181);
});

test('today hub has one primary entry, real progress and all three secondary routes',async()=>{
 await render(MixedPracticeHub,{topicEntries:[],locale:'zh-CN',labels,questions,items:[],progress:{},modules:[],captures:[],drafts:[],listeningQuestions:[],readingQuestions:[],studyPlan:{tasks:[]},onStart:noop,onStartMock:noop,onNavigate:noop,onStartModule:noop,dailyPractice:{title:'Today real set',minutes:18,questions},dailyAnswers:{q1:{selected:'乙',correct:true}}});
 assert.equal(document.querySelectorAll('.practice-today .practice-primary-action').length,1);
 assert.equal(button('继续练习')?.textContent,'继续练习');
 assert.equal(document.querySelector('progress').value,1);assert.equal(document.querySelector('progress').max,3);
 assert.deepEqual([...document.querySelectorAll('.practice-entry-row strong')].map(n=>n.textContent),['专项练习','综合练习','模拟考试']);
});

test('answer feedback prioritizes result and correct answer; all extra content starts collapsed',async()=>{
 await render(PracticePanel,base);
 assert.match(document.querySelector('.practice-feedback-outcome').textContent,/乙/);
 assert.equal(document.querySelector('.practice-feedback-evidence .study-text').textContent,'第一句依据。');
 assert.ok([...document.querySelectorAll('.practice-feedback details')].every(n=>!n.open));
 assert.match(document.querySelector('.practice-feedback').textContent,/第二句详细解释|完整翻译内容|甲的完整说明/);
 assert.equal(document.querySelector('.cute-choice[aria-pressed="true"]').textContent.trim(),'2乙');
});

test('batch touch answers stay on current question; answer sheet pauses shortcuts and closes cleanly',async()=>{
 let answered=0,jumped=0,next=0;
 await render(PracticePanel,{...base,feedbackMode:'batch',answers:{},answeredCount:0,onAnswer:()=>answered++,onJump:()=>jumped++,onNext:()=>next++});
 await click(document.querySelector('.cute-choice'));
 assert.equal(answered,1);assert.equal(jumped,0);
 await click(document.querySelector('.practice-progress-button'));
 assert.equal(document.querySelector('dialog').open,true);
 await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'1',bubbles:true})));
 assert.equal(answered,1,'shortcuts must not answer through a dialog');
 await click(document.querySelector('dialog button[aria-label]'));
 assert.equal(document.querySelector('dialog').open,false);
 await click(button(labels.next));assert.equal(next,1);
});

test('completion is reachable in immediate mode and save failure preserves retry/local results',async()=>{
 let saved=0,reviewed=0;
 await render(PracticePanel,{...base,complete:true,answeredCount:3,onPrepareReview:async()=>{saved++;if(saved===1)throw new Error('Save failed');},onReview:()=>reviewed++});
 await click(button(labels.reviewPage));
 assert.equal(reviewed,0);assert.match(document.querySelector('[role="alert"]').textContent,/Save failed/);
 await click(button(labels.reviewRetry));
 assert.equal(saved,2);assert.equal(reviewed,1);
});

test('review starts with results, supports wrong/all/unanswered and hides unavailable restart',async()=>{
 let back=0;
 await render(PracticeReviewPanel,{questions,answers:{q1:{selected:'乙',correct:true},q2:{selected:'甲',correct:false}},items:[],labels,locale:'zh-CN',showRuby:false,onBackToPractice:()=>back++});
 assert.equal(document.querySelector('.practice-review-detail'),null);
 assert.equal(document.querySelectorAll('.practice-result-rows li').length,1);
 assert.ok(!button('重新练习'));
 await click([...document.querySelectorAll('.practice-result-filters button')].find(n=>n.textContent.startsWith('未答')));
 await click(document.querySelector('.practice-result-rows button'));
 assert.match(document.querySelector('.practice-review-detail').textContent,/尚未作答/);
 await click(button('返回结果'));assert.equal(document.querySelector('.practice-review-detail'),null);
 await click(button('返回练习'));assert.equal(back,1);
});

const mockExam={id:'synthetic-exam',title:'Synthetic exam',level:'N1',totalDurationMinutes:60,sections:[{id:'s1',title:'Knowledge',questionCount:1,durationMinutes:60}],questions:[{id:'mock-q1',sectionId:'s1',group:'Reading',prompt:'Mock prompt',choices:['Correct','Wrong'],answerIndex:0,explanation:'A clear reason. More supporting detail.'}]};

test('legacy mock saved state is account-scoped, revision-checked and sanitized',()=>{
 const key=legacyMockStorageKey(7,mockExam.id), other=legacyMockStorageKey(8,mockExam.id);
 assert.notEqual(key,other);
 const saved={revision:legacyMockRevision(mockExam),status:'active',answers:{'mock-q1':0,unknown:2},flagged:['mock-q1','unknown','mock-q1'],currentIndex:900,startedAt:new Date().toISOString()};
 const storage={getItem:k=>k===key?JSON.stringify(saved):null};
 const restored=readLegacyMockState(storage,key,mockExam);
 assert.deepEqual(restored.answers,{'mock-q1':0});assert.deepEqual(restored.flagged,['mock-q1']);assert.equal(restored.currentIndex,0);
 assert.equal(readLegacyMockState(storage,other,mockExam).status,'intro');
 assert.equal(readLegacyMockState(storage,key,{...mockExam,totalDurationMinutes:30}).status,'intro');
 assert.equal(readLegacyMockState({getItem:()=>JSON.stringify({...saved,startedAt:'bad'})},key,mockExam).status,'intro');
 assert.equal(readLegacyMockState({getItem:()=>{throw Error('Storage unavailable');}},key,mockExam).status,'intro');
});

test('legacy mock does not load unscoped answers and quota failure retains selected answer',async()=>{
 localStorage.clear();
 localStorage.setItem(`jlpt-local-mock:${mockExam.id}`,JSON.stringify({status:'active',answers:{'mock-q1':1},startedAt:new Date().toISOString()}));
 const originalFetch=globalThis.fetch;
 const originalSet=window.Storage.prototype.setItem;
 globalThis.fetch=async()=>({ok:true,json:async()=>mockExam});
 try {
  await render(MockExamPanel,{examId:mockExam.id,userId:71,locale:'en',onBack:noop});
  assert.ok(button('Start full exam'));assert.equal(document.querySelector('button[aria-pressed="true"]'),null);
  window.Storage.prototype.setItem=function(){throw new Error('Quota exceeded');};
  await click(button('Start full exam'));
  await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Correct')));
  assert.match(document.querySelector('[role="alert"]').textContent,/Progress cannot be saved/);
  assert.equal(document.querySelector('button[aria-keyshortcuts="1"]').getAttribute('aria-pressed'),'true');
  assert.match(document.body.textContent,/1\/1 Answered/);
 } finally {window.Storage.prototype.setItem=originalSet;globalThis.fetch=originalFetch;}
});

test('designed exam blocks unscorable sessions and hides questions until a real start',async()=>{
 const originalFetch=globalThis.fetch;
 const makeExam=ready=>({exam:{id:'custom',title:'Custom',revision:1,sessions:[{id:'session',title:'Session',durationMinutes:20,questions:[{...mockExam.questions[0],scoringReady:ready}]}]}});
 try {
  globalThis.fetch=async()=>({ok:true,json:async()=>makeExam(false)});
  await render(DesignedExamPanel,{selection:'custom:custom:session',userId:91,token:'synthetic',locale:'en',onOpen:noop});
  assert.equal(button('Start').disabled,true);
  assert.ok(!document.body.textContent.includes('Mock prompt'));
  await click(button('Start'));assert.ok(!document.body.textContent.includes('Mock prompt'));
  globalThis.fetch=async()=>({ok:true,json:async()=>makeExam(true)});
  await render(DesignedExamPanel,{selection:'custom:custom:session',userId:92,token:'synthetic',locale:'en',onOpen:noop});
  assert.equal(button('Start').disabled,false);assert.ok(!document.body.textContent.includes('Mock prompt'));
  await click(button('Start'));assert.match(document.body.textContent,/Mock prompt/);
  await click([...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='1. Correct'));
  assert.equal(document.querySelector('button[aria-pressed="true"]').textContent.trim(),'1. Correct');
  await click(button('Submit'));await click(button('Confirm submission'));
  assert.equal(document.querySelector('.practice-designed-answer details').open,false);
 } finally {globalThis.fetch=originalFetch;}
});

test('historical scores survive edited keys and missing originals without inventing unanswered results',async()=>{
 const attempt={id:'saved-history',questionIds:['q1','q2','q3'],answers:[{questionId:'q1',selected:'甲',correct:true,elapsedMs:10},{questionId:'q2',selected:'乙',correct:false,elapsedMs:20},{questionId:'q3',selected:'乙',correct:true,elapsedMs:30}],summary:{total:3,correct:2,wrong:1,accuracy:2/3,elapsedMs:60}};
 const model=practiceReviewModel([questions[0],questions[1]],{},attempt);
 assert.equal(model.correct,2);assert.equal(model.wrong,1);assert.equal(model.unanswered,0);assert.equal(model.missingOriginals,1);assert.equal(model.accuracy,2/3);
 assert.equal(model.rows[0].answer.correct,true,'saved right answer stays right even when the current key changed');
 assert.equal(model.rows[1].answer.correct,false,'saved wrong answer stays wrong even when it matches the current key');
 await render(PracticeReviewPanel,{attempt,questions:[questions[0],questions[1]],answers:{},items:[],labels,locale:'zh-CN',showRuby:false,onBackToPractice:noop});
 assert.match(document.querySelector('.practice-result-summary').textContent,/67%|历史成绩已保留/);
 await click(document.querySelector('.practice-result-rows button'));
 assert.equal(document.querySelector('.practice-feedback-status strong').textContent,labels.wrong);
 assert.match(document.querySelector('.practice-feedback-answer').textContent,/当前题目答案/);
 assert.match(document.querySelector('.practice-historical-version').textContent,/当前题目版本/);
});

for (const interruption of ['back','restart','unmount','replace-session']) {
 test(`pending completion cannot navigate after ${interruption}`,async()=>{
  let finish,reviewed=0,left=0,restarted=0;
  const props={...base,complete:true,answeredCount:3,onPrepareReview:()=>new Promise(resolve=>{finish=resolve;}),onReview:()=>reviewed++,onPracticeHome:()=>left++,onRestart:()=>restarted++};
  await render(PracticePanel,props);
  await click(button(labels.reviewPage));
  if(interruption==='back') await click(button(labels.reviewBackToPracticeHome));
  if(interruption==='restart') await click(document.querySelector(`button[aria-label="${labels.restartPractice}"]`));
  if(interruption==='unmount') await render('div',{});
  if(interruption==='replace-session') await act(async()=>root.render(h(PracticePanel,{...props,key:renderId,questionTypeLabel:'A different session'})));
  await act(async()=>finish());
  assert.equal(reviewed,0,'an interrupted save must not force a navigation');
  if(interruption==='back')assert.equal(left,1);
  if(interruption==='restart')assert.equal(restarted,1);
 });
}

test('rejected completion after leaving cannot paint a stale-session error',async()=>{
 let fail,reviewed=0;
 await render(PracticePanel,{...base,complete:true,answeredCount:3,onPrepareReview:()=>new Promise((resolve,reject)=>{fail=reject;}),onReview:()=>reviewed++});
 await click(button(labels.reviewPage));
 await click(button(labels.reviewBackToPracticeHome));
 await act(async()=>fail(new Error('Stale save failure')));
 assert.equal(reviewed,0);assert.ok(!document.body.textContent.includes('Stale save failure'));
});
