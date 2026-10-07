import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {presentationView} from '../server/presentation-view.mjs';
const fixtures=JSON.parse(readFileSync(new URL('../apple/Fixtures/native-question-visual.json',import.meta.url))).fixtures;
const presentation=id=>{const fixture=fixtures.find(f=>f.id===id);return {payload:fixture.bankPayload,materials:fixture.materialVersions};};
const dir=await mkdtemp(join(tmpdir(),'jlpt-typed-web-'));after(()=>rm(dir,{recursive:true,force:true}));
// React's server/client bundle owns MessagePorts; release them after this isolated DOM suite.
after(()=>{for(const handle of process._getActiveHandles())if(handle.constructor.name==='MessagePort')handle.unref();});
const {outputFiles}=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import {act} from 'react'; import {createRoot} from 'react-dom/client';import {renderToStaticMarkup} from 'react-dom/server';import {QuestionRenderer} from './src/components/QuestionRenderer';export {assemblyOption,presentationVisible} from './src/domain/typedPresentation';
export const render=(presentation,props={})=>renderToStaticMarkup(<QuestionRenderer questionId="Q1" prompt="fallback" choices={[]} onSelect={()=>{}} presentation={presentation} {...props}/>);
export const mount=async(element,presentation,onSelect)=>{const root=createRoot(element);await act(async()=>root.render(<QuestionRenderer questionId="Q1" prompt="fallback" choices={[]} presentation={presentation} onSelect={onSelect}/>));return {click:async(button)=>act(async()=>button.click()),close:async()=>act(async()=>root.unmount())};};
`},bundle:true,platform:'node',format:'esm',jsx:'automatic',write:false,loader:{'.css':'empty'},banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}});
const file=join(dir,'fixture.mjs');await writeFile(file,outputFiles[0].text);const {render,mount,assemblyOption,presentationVisible}=await import(pathToFileURL(file));
test('Web and MCP consume real A/B, table, image and exact target structures without answer leakage',()=>{
 const ab=render(presentation('reading-integrated'));assert.match(ab,/A ·/);assert.match(ab,/B ·/);
 const table=render(presentation('reading-information'));assert.match(table,/<table>/);assert.match(table,/<th>/);assert.match(table,/円/);
 const image=render(presentation('listening-expression'));assert.equal((image.match(/<img /g)??[]).length,3);
 const span=new JSDOM(render(presentation('vocabulary-kanji-reading')));const targets=span.window.document.querySelectorAll('.underline');assert.equal(targets.length,1);assert.equal(targets[0].textContent,'明確');assert.equal(span.window.document.querySelector('.question-renderer-prompt').textContent,'明確な条件を、もう一度明確にしてください。');span.window.close();
 const publicData=presentationView(presentation('grammar-composition'));assert.equal(publicData.payload.answer,undefined);assert.equal(publicData.payload.legacy.assembly.correctOrder,undefined);assert.equal(publicData.payload.legacy.correctReason,undefined);
 assert.doesNotMatch(render(publicData),/完整排列|data-answer-state="correct"/);
 assert.deepEqual(presentationView(presentation('grammar-composition'),{revealed:true}),presentation('grammar-composition'));
});
test('real React assembly controls reject partial order and submit the canonical star option',async()=>{
 const dom=new JSDOM('<div id="root"></div>');globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const selected=[];const view=await mount(document.getElementById('root'),presentationView(presentation('grammar-composition')),(index,order)=>selected.push({index,order}));
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 assert.equal(button('确认排列').disabled,true);
 for(const text of ['昨日','駅で','会った','人'])await view.click(button(text));
 assert.equal(button('确认排列').disabled,false);await view.click(button('确认排列'));
 assert.deepEqual(selected,[{index:2,order:['option-0','option-1','option-2','option-3']}]);
 assert.equal(assemblyOption(presentation('grammar-composition'),['option-0','option-0']),null);
 await view.close();dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
test('outline timing hides both task and choices until completion; unscored response remains editable',()=>{
 const p=presentationView(presentation('listening-outline'));assert.equal(presentationVisible(p,false,true),false);assert.equal(presentationVisible(p,false,false),false);
 const hidden=render(p);assert.doesNotMatch(hidden,/話の主な内容|明日の予定と待ち合わせ/);
 const finished=render(p,{audioFinished:true});assert.match(finished,/話の主な内容/);assert.match(finished,/明日の予定と待ち合わせ/);
 assert.match(render(presentation('listening-basic-training'),{freeResponse:{value:'自答',onChange:()=>{},label:'回答'}}),/<textarea/);
});
