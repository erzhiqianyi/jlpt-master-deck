import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {questionStrategies} from '../src/domain/questionContract.mjs';
const dir=await mkdtemp(join(tmpdir(),'jlpt-renderer-'));after(()=>rm(dir,{recursive:true,force:true}));
const {outputFiles}=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import {renderToStaticMarkup} from 'react-dom/server';
 import {QuestionRenderer} from './src/components/QuestionRenderer';
 export const render=(props)=>renderToStaticMarkup(<QuestionRenderer questionId="Q1" prompt="実際の条件と★を保存" choices={['正解','不正解']} answerIndex={0} onSelect={()=>{}} feedback={<p>PRIVATE_EXPLANATION</p>} {...props} />);
`},bundle:true,platform:'node',format:'esm',jsx:'automatic',write:false,loader:{'.css':'empty'},banner:{js:"import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);"}});
const file=join(dir,'fixture.mjs');await writeFile(file,outputFiles[0].text);const {render}=await import(pathToFileURL(file));
test('every registered type uses the shared frame without revealing answers or explanations before authorized reveal',()=>{
 for(const id of Object.keys(questionStrategies)) {
  const hidden=render({questionTypeId:id,selected:1,taskConditions:['平日18時以降','費用1000円以内']});
  assert.match(hidden,/data-question-type=/);assert.match(hidden,/平日18時以降/);assert.match(hidden,/実際の条件と★を保存/);
  assert.doesNotMatch(hidden,/PRIVATE_EXPLANATION|data-answer-state="correct"/);
  const revealed=render({questionTypeId:id,selected:1,reveal:true});
  assert.match(revealed,/PRIVATE_EXPLANATION/);assert.match(revealed,/data-answer-state="incorrect-selected"/);assert.match(revealed,/data-answer-state="correct"/);
 }
});
test('pause disables choices; free response has no fictitious objectively correct option',()=>{
 const paused=render({paused:true});assert.equal((paused.match(/disabled=""/g)??[]).length,2);
 const free=render({freeResponse:{value:'自答',onChange:()=>{},label:'回答'},reveal:false});
 assert.match(free,/<textarea/);assert.doesNotMatch(free,/data-answer-state|PRIVATE_EXPLANATION/);
});
