import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
const dir = await mkdtemp(join(process.cwd(), '.local/type-practice-'));
const output = join(dir, 'home.mjs');
await build({ stdin: { contents: "export { TypePracticeSetup, sampleQuestions } from './src/features/practice/TypePracticeSetup'; export { quickTypePractice } from './src/domain/typePractice';", resolveDir: process.cwd(), loader: 'tsx' }, outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' } });
const { TypePracticeSetup, sampleQuestions, quickTypePractice } = await import(pathToFileURL(output));
const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const dom = new JSDOM('<div id="root"></div>');
for (const key of ['window', 'document', 'HTMLElement']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
after(async () => { dom.window.close(); await rm(dir, { recursive: true, force: true }); });

test('sampling preserves source and never pads a small pool with duplicates', () => {
 const source = Array.from({length: 12}, (_, i) => ({id: `q${i}`}));
 const result = sampleQuestions(source, 5);
 assert.equal(result.length, 5); assert.equal(new Set(result.map(q => q.id)).size, 5);
 assert.deepEqual(source.map(q => q.id), Array.from({length:12}, (_,i)=>`q${i}`));
 assert.equal(sampleQuestions(source, 30).length, 12);
});
test('reading scope uses explicit types and intersects tag filters; selected order remains stable', async () => {
 const root = createRoot(document.getElementById('root')); let selected;
 const props = {items:[],wordbooks:[],listening:[],locale:'zh-CN',reading:[
  {id:'r1',tags:['reading-short','自然']}, {id:'r2',tags:['reading-mid','自然']}, {id:'r3',tags:['reading-short','生活']}, {id:'r4',tags:['自然']}],onStart:value=>selected=value};
 const press = async text => act(async()=>[...document.querySelectorAll('button')].find(n=>n.textContent===text).click());
 const choose = async (label,value) => {const select=[...document.querySelectorAll('label')].find(n=>n.firstChild.textContent===label).querySelector('select');await act(async()=>{select.value=value;select.dispatchEvent(new window.Event('change',{bubbles:true}));});};
 try {
  await act(async()=>root.render(createElement(TypePracticeSetup,props)));
  assert.equal([...document.querySelectorAll('button')].find(n=>n.textContent==='开始练习').disabled,true);
  await press('阅读'); assert.match(document.querySelector('.type-practice-note').textContent,/未分类/);
  await choose('标签','自然'); await choose('题型','reading-short');
  assert.match(document.querySelector('.type-practice-summary').textContent,/符合条件 1.*本次抽取 1/);
  await press('开始练习'); assert.deepEqual(selected.reading.map(q=>q.id),['r1']);
  const snapshot=selected.reading.map(q=>q.id); await act(async()=>root.render(createElement(TypePracticeSetup,{...props,locale:'en'})));
  assert.deepEqual(selected.reading.map(q=>q.id),snapshot);
  await press('Listening'); assert.equal([...document.querySelectorAll('button')].find(n=>n.textContent==='Start practice').disabled,true);
 } finally {await act(async()=>root.unmount());}
});

test('grammar book, tag and question type intersect without including other books', async()=>{
 const root=createRoot(document.getElementById('root'));let selected;
 const item=(id,book,tag)=>({id,deck:'grammar_expression',wordbook_id:book,original:'かつて',meaning_zh:'曾经',tags:[tag],practice_questions:[{id:`${id}-q`,kind:'grammar',prompt:'ここは（　）工場だった。',choices:['かつて','まだ'],answer:'かつて'}]});
 try {
  await act(async()=>root.render(createElement(TypePracticeSetup,{items:[item('keep','book-1','時間'),item('wrong-tag','book-1','場所'),item('wrong-book','book-2','時間')],wordbooks:[{id:'book-1',title:'時間本',deck:'grammar_expression'},{id:'book-2',title:'別の本',deck:'grammar_expression'}],reading:[],listening:[],locale:'zh-CN',defaults:{module:'grammar',book:'book-1',tag:'時間',kind:'grammar'},onStart:value=>selected=value})));
  assert.match(document.querySelector('.type-practice-summary').textContent,/符合条件 1/);
  await act(async()=>[...document.querySelectorAll('button')].find(n=>n.textContent==='开始练习').click());
  assert.deepEqual(selected.questions.map(q=>q.id),['keep-q']);
 }finally{await act(async()=>root.unmount());}
});

test('one-click library practice draws only the chosen material type without padding',()=>{
 const listening=[{id:'l1',questionTypeId:'listening-task'},{id:'l2',questionTypeId:'listening-points'}];
 const selection=quickTypePractice('listening','listening-task','all',[],[],listening,'zh-CN');
 assert.deepEqual(selection.listening.map(q=>q.id),['l1']);assert.deepEqual(selection.questions,[]);
 const reading=[{id:'r1',tags:['reading-short']},{id:'r2',tags:[]}];
 assert.deepEqual(quickTypePractice('reading','reading-short','all',[],reading,[],'zh-CN').reading.map(q=>q.id),['r1']);
});
