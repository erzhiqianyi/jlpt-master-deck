import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePresentationMaterials,validateQuestionPayload} from '../src/domain/questionPayload.mjs';
const fixtures=JSON.parse(readFileSync(new URL('../apple/Fixtures/native-question-visual.json',import.meta.url))).fixtures;
test('native fixtures use real canonical option IDs, frozen shared materials and declared structural fields',()=>{
 for(const fixture of fixtures){
  const {bankPayload:payload,materialVersions=[]}=fixture;
  assert.equal(payload.schemaVersion,1);assert.equal(payload.questionTypeId,fixture.id);
  const materials=materialVersions.map(record=>record.payload);
  assert.deepEqual(validatePresentationMaterials({...payload.legacy,materialRefs:payload.materialRefs},materials),[],fixture.id);
  if(['single','option'].includes(payload.answer.type))assert.equal(payload.options.filter(option=>option.id===payload.answer.optionId).length,1);
 }
});
test('assembly star and both article blanks validate against the same frozen canonical material',()=>{
 for(const id of ['grammar-composition','grammar-text']){
  const fixture=fixtures.find(f=>f.id===id);const p=fixture.bankPayload;
  const result=validateQuestionPayload({...p.legacy,level:'N2',questionTypeId:id,materialRefs:p.materialRefs},{materialPayloads:fixture.materialVersions.map(record=>record.payload)});
  assert.deepEqual(result.errors,[]);
 }
 const f=fixtures.find(f=>f.id==='grammar-text');assert.deepEqual(f.bankPayload.materialRefs,f.questionVersions[0].payload.materialRefs);assert.notEqual(f.bankPayload.legacy.blankId,f.questionVersions[0].payload.legacy.blankId);
});
test('presentation rejects unowned image links, malformed table units/columns and unknown listening timing',()=>{
 const image=fixtures.find(f=>f.id==='listening-expression');const q={...image.bankPayload.legacy,materialRefs:image.bankPayload.materialRefs};
 assert.ok(validatePresentationMaterials({...q,optionMaterials:[{optionId:'option-0',materialRef:{id:'foreign',revision:1}}]},image.materialVersions.map(m=>m.payload)).length);
 assert.ok(validatePresentationMaterials({},[{type:'table',headers:['料金','時間'],rows:[['800円']]}]).length);
 assert.ok(validatePresentationMaterials({presentationPolicy:{optionsTiming:'immediately-after-selection'}},[]).length);
 assert.ok(validatePresentationMaterials({},[{type:'image',url:'javascript:alert(1)',alt:'image'}]).length);
});
