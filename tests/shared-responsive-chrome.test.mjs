import assert from 'node:assert/strict';
import { test, after, afterEach } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://example.test/#/study' });
for (const name of ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'HTMLInputElement', 'Event', 'MouseEvent']) globalThis[name] = dom.window[name];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
HTMLDialogElement.prototype.showModal = function () { this.open = true; };
HTMLDialogElement.prototype.close = function () { this.open = false; };
await mkdir('.local', { recursive: true });
const directory = await mkdtemp(join(process.cwd(), '.local', 'responsive-chrome-'));
const output = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React, { useState } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PageChromeProvider, PageHeaderActions, usePageHeaderActions } from './src/components/PageChrome';
import { LearningListFrame, LearningListHeader, LearningListSearch } from './src/components/LearningList';
export { MixedPracticeHub } from './src/features/practice/MixedPracticeHub';
export { HistoryPanel } from './src/features/history/HistoryPanel';
export { translations } from './src/i18n/translations';
import { GlobalSearch } from './src/features/search/GlobalSearch';
import { useMockExamCount } from './src/hooks/useMockExamCount';
export { act, createRoot };
function Detail({close}) { usePageHeaderActions([{key:'manage',label:'Manage share',onClick:close}],20); return <p>Detail body</p>; }
export function Fixture() {
 const [query,setQuery]=useState(''); const [detail,setDetail]=useState(false);
 return <PageChromeProvider><PageHeaderActions/><LearningListFrame locale="en"><LearningListHeader title="Library" count="5 items" search={<LearningListSearch locale="en" value={query} onChange={setQuery}/>}><button onClick={()=>setDetail(true)}>Add entry</button></LearningListHeader></LearningListFrame>{detail?<Detail close={()=>setDetail(false)}/>:null}</PageChromeProvider>;
}
export function SearchFixture(){const[open,setOpen]=useState(false);const[query,setQuery]=useState('');return <><button onClick={()=>setOpen(true)}>Find</button><GlobalSearch locale="en" open={open} query={query} onQueryChange={setQuery} results={[]} onOpenResult={()=>{}} onClose={()=>setOpen(false)} labels={{searchTitle:'Find learning content',mobileClose:'Close',filters:'Type',searchAll:'All',searchModuleVocabulary:'Words',searchModuleGrammar:'Grammar',navListening:'Listening',navReading:'Reading',searchHint:'Enter a keyword'}}/></>}
export function CountFixture({token='a',enabled=true}) {const count=useMockExamCount(token,enabled);return <p role="status">{count===undefined?'unknown':String(count)}</p>}
export const element=(Component,props)=>React.createElement(Component,props);
` }, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, write: false });
const path = join(directory, 'render.mjs'); await writeFile(path, output.outputFiles[0].text);
const ui = await import(pathToFileURL(path));
let root;
const container = document.getElementById('root');
const button = name => [...container.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === name || item.textContent === name);
async function mount(component, props) { root = ui.createRoot(container); await ui.act(async () => root.render(ui.element(ui[component], props))); }
async function click(element) { assert.ok(element); await ui.act(async () => element.click()); }
afterEach(async () => { if(root) await ui.act(async () => root.unmount()); root = null; document.body.style.overflow=''; });
after(async () => { dom.window.close(); await rm(directory,{recursive:true,force:true}); });

test('shared controls start closed, expose one header entry, and restore focus on Escape', async () => {
 await mount('Fixture');
 assert.equal(container.querySelectorAll('input[type="search"]').length,0);
 assert.equal(container.querySelectorAll('.list-controls-trigger').length,0);
 const trigger=button('Search and filters'); trigger.focus(); await click(trigger);
 const dialog=container.querySelector('dialog'); assert.equal(dialog.open,true);
 assert.ok(button('Add entry')); assert.equal(document.body.style.overflow,'hidden');
 await ui.act(async()=>dialog.dispatchEvent(new Event('cancel',{cancelable:true})));
 assert.equal(dialog.open,false);assert.equal(document.activeElement,trigger);assert.equal(document.body.style.overflow,'');
});

test('higher-priority detail actions replace and then restore list actions without stale callbacks', async () => {
 await mount('Fixture');await click(button('Search and filters'));await click(button('Add entry'));
 assert.ok(button('Manage share'));assert.equal(button('Search and filters'),undefined);
 await click(button('Manage share'));assert.ok(button('Search and filters'));assert.equal(button('Manage share'),undefined);
});

test('global search opens deliberately, has a single type selector, and returns keyboard focus', async()=>{
 await mount('SearchFixture');const trigger=button('Find');trigger.focus();await click(trigger);
 assert.equal(container.querySelector('dialog').open,true);assert.equal(container.querySelectorAll('select').length,1);
 assert.equal(document.activeElement,container.querySelector('input'));
 assert.equal(container.querySelector('[role="list"]'),null);
 await click(button('Close'));assert.equal(container.querySelector('dialog').open,false);assert.equal(document.activeElement,trigger);
});

test('mock total counts all known catalog families but never turns a failed family into zero', async()=>{
 globalThis.fetch=async path=>({ok:true,json:async()=>path.includes('news-cycles')?{cycles:[{id:'one'}]}:{exams:[{id:'one'}]}});
 await mount('CountFixture');assert.equal(container.textContent,'3');
 await ui.act(async()=>root.unmount());root=null;
 globalThis.fetch=async path=>{if(path.includes('news-cycles'))throw new Error('offline');return {ok:true,json:async()=>({exams:[]})}};
 await mount('CountFixture');assert.equal(container.textContent,'unknown');
});


test('statistics date controls both retained attempt metrics and the summary query', async()=>{
 const requests=[];globalThis.fetch=async path=>{requests.push(path);return {ok:true,json:async()=>({summary:null})}};
 const now=new Date().toISOString(); const prior='2020-01-02T03:00:00.000Z';
 const attempt=(id,date,total)=>({id,title:id,view:'mixed',startedAt:date,completedAt:date,questionIds:[],answers:[],summary:{total,correct:total,elapsedMs:60000}});
 await mount('HistoryPanel',{locale:'en',labels:ui.translations.en,captures:[],attempts:[attempt('Today session',now,3),attempt('Past session',prior,7)],questions:[],onCaptureStatus:async()=>{},embedded:true,mode:'practice',recordSection:'today',summaryToken:'test'});
 assert.equal(container.querySelector('.list-stats dd').textContent,'1');assert.match(container.textContent,/Today session/);assert.doesNotMatch(container.textContent,/Past session/);
 const date=container.querySelector('input[type="date"]');await ui.act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(date,'2020-01-02');date.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.deepEqual([...container.querySelectorAll('.list-stats dd')].map(item=>item.textContent),['1','7','100%','1m 0s']);
 assert.match(container.textContent,/Past session/);assert.doesNotMatch(container.textContent,/Today session/);assert.ok(requests.includes('/api/daily-summaries/2020-01-02'));
});


test('Practice inventory can use an authoritative lightweight total before questions are materialized', async()=>{
 await mount('MixedPracticeHub',{locale:'en',labels:ui.translations.en,questions:[],mixedQuestionCount:42,topicEntries:[],onStart(){},onStartMock(){}});
 assert.match(container.querySelectorAll('.primary-practice-row')[1].textContent,/42 questions/);
});

test('desktop catalogs place one search in the title bar and show controls inline', async () => {
 window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
 try {
  await mount('Fixture');
  assert.equal(container.querySelectorAll('.page-header-control input[type="search"]').length, 1);
  assert.equal(container.querySelectorAll('.list-controls-dialog').length, 0);
  assert.ok(container.querySelector('.list-expanded-filters button'));
  assert.ok(button('Add entry'));
  assert.equal(button('Search and filters'), undefined);
  const input = container.querySelector('input[type="search"]');
  await ui.act(async () => {
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'test');
   input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(input.value, 'test');
  assert.equal(container.querySelectorAll('input[type="search"]').length, 1);
 } finally {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
 }
});
