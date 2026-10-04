import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// DOM interactions exercise the actual React event handlers, not source-string assertions.
// This is deliberately not a substitute for real browser layout/accessibility QA.
const dom = new JSDOM('<!doctype html><div id="root"></div>', {url:'http://localhost/'});
for (const key of ['window','document','HTMLElement','HTMLTextAreaElement','HTMLInputElement','Event','MouseEvent','KeyboardEvent','Node']) globalThis[key]=dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
await mkdir('.local',{recursive:true});
const dir=await mkdtemp(resolve('.local','interaction-tests-'));
const out=resolve(dir,'components.mjs');
await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
export {HistoryPanel} from './src/features/history/HistoryPanel';
export {CapturePanel} from './src/features/capture/CapturePanel';
export {PlanCalendar} from './src/features/plan/PlanCalendar';
export {ModuleActionBar} from './src/components/ModuleActionBar';
export {SettingsView} from './src/features/settings/SettingsView';
export {ConfirmationProvider} from './src/components/ConfirmationProvider';
export {translations} from './src/i18n/translations';
`},bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',loader:{'.css':'empty'},outfile:out});
const {CapturePanel,HistoryPanel,PlanCalendar,ModuleActionBar,SettingsView,ConfirmationProvider,translations}=await import(pathToFileURL(out));
const {createElement:h,act}=await import('react');
const {createRoot}=await import('react-dom/client');
const root=createRoot(document.getElementById('root'));
const labels=translations['zh-CN'];
const noop=()=>{};
async function render(component,props){await act(async()=>root.render(h(ConfirmationProvider,null,h(component,props))));}
async function click(element){assert.ok(element,'expected element exists');await act(async()=>element.click());}
async function fill(element,value){await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));});}
const button=(text)=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text||b.getAttribute('aria-label')===text);
after(async()=>{await act(async()=>root.unmount());dom.window.close();await rm(dir,{recursive:true,force:true});});

test('capture rejects visibly, retains input, deduplicates pending retry and clears only on success',async()=>{
 let calls=0,resolveSave;
 await render(CapturePanel,{labels,deckLabels:{},wordbooks:[],onCreateWordbook:async()=>null,onOpenHistory:noop,onSave:()=>{calls++;return calls===1?Promise.reject(new Error('Save failed')):new Promise(r=>{resolveSave=r;});}});
 await fill(document.querySelector('textarea'),'例文を残します');
 await click(button(labels.captureSave));
 assert.equal(calls,1);
 assert.match(document.querySelector('[role="alert"]').textContent,/Save failed/);
 assert.equal(document.querySelector('textarea').value,'例文を残します');
 await click(button(labels.captureSave));
 assert.equal(document.querySelector('textarea').disabled,true);
 await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(calls,2,'repeated submission must not write twice');
 await act(async()=>resolveSave());
 assert.equal(document.querySelector('textarea').value,'');
 assert.match(document.body.textContent,/已保存/);
});

test('plan update failure shows recovery and preserves existing task state',async()=>{
 let calls=0;
 const now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 await render(PlanCalendar,{labels,locale:'zh-CN',tasks:[{id:'task',date,title:'Keep my task',minutes:10,module:'grammar',status:'pending'}],summaries:[],evidence:[],onTaskStatus:async()=>{calls++;throw new Error('Task failed');}});
 const input=document.querySelector('input[type="checkbox"]');
 await click(input);
 assert.equal(calls,1);
 assert.match(document.querySelector('[role="alert"]').textContent,/Task failed/);
 assert.equal(input.checked,false);
 assert.equal(input.disabled,false);
 assert.match(document.body.textContent,/Keep my task/);
});

test('module actions execute, disabled gates remain, and sheet dismisses after selection',async()=>{
 let calls=0;
 await render(ModuleActionBar,{label:'词汇',actions:[{key:'add',label:'添加单词',onClick:()=>calls++},{key:'blocked',label:'不可用',disabled:true,onClick:()=>calls+=100}],primary:{label:'开始练习',onClick:noop}});
 await click(button('选择练习模式'));
 await click(button('添加单词'));
 assert.equal(calls,1);
 await click(button('选择练习模式'));
 await click(button('不可用'));
 assert.equal(calls,1);
 const mascot=document.querySelector('.module-practice-entry');
 assert.ok(mascot);
 assert.equal(document.querySelector('.module-action-overflow'),null);
 assert.equal(mascot.querySelector('img'), null);
 assert.equal(document.querySelector('dialog').open,true);
 await click([...document.querySelectorAll('dialog button')].find(b=>b.textContent==='添加单词'));
 assert.equal(calls,2);
 assert.equal(document.querySelector('dialog').open,false);
});


test('capture detail deduplicates status updates and keeps a failed record visible', async()=>{
 let calls=0,rejectUpdate;
 const capture={id:'capture-status',body:'Preserved capture',category:'unsure',status:'inbox',createdAt:new Date().toISOString()};
 await render(HistoryPanel,{labels,locale:'zh-CN',captures:[capture],attempts:[],mode:'captures',selectedCaptureId:capture.id,onSelectedCaptureChange:noop,onCaptureStatus:()=>{calls++;return new Promise((_,reject)=>{rejectUpdate=reject;});}});
 const control=button(labels.captureMarkProcessed);
 await click(control);await click(control);
 assert.equal(calls,1);assert.equal(control.disabled,true);
 await act(async()=>rejectUpdate(new Error('Status failed')));
 assert.match(document.querySelector('[role="alert"]').textContent,/Status failed/);
 assert.match(document.body.textContent,/Preserved capture/);
 assert.equal(button(labels.captureMarkProcessed).disabled,false);
});
