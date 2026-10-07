import {questionStrategy,resolveLegacyAnswer} from './questionContract.mjs';
import specifications from '../data/questionSpecifications.json' with {type:'json'};
export const questionRegistrySchemaVersion=specifications.schemaVersion;
export const questionSpecifications=Object.freeze(Object.fromEntries(specifications.types.map(spec=>[spec.id,Object.freeze(spec)])));
// Versioned presentation fields are shared by native/Web/MCP; references still require ownership.
export function validatePresentationMaterials(question, materials) {
 const errors=[];
 const tableValid=m=>Array.isArray(m.headers)&&m.headers.length>0&&m.headers.every(x=>typeof x==='string'&&x.trim())&&Array.isArray(m.rows)&&m.rows.length>0&&m.rows.every(row=>Array.isArray(row)&&row.length===m.headers.length&&row.every(x=>typeof x==='string'));
 for(const [index,material] of materials.entries()) {
  if(material?.type==='table'&&!tableValid(material)&&!(material.blocks??[]).some(block=>block.type==='table'&&tableValid(block)))errors.push(issue('invalid',['materials',index],'Preserve table headers and rectangular rows'));
  if(material?.type==='image'&&(!material.alt?.trim()||typeof material.url!=='string'||!(/^(?:https:\/\/|data:image\/(?:png|jpeg|webp);base64,)/.test(material.url))))errors.push(issue('invalid',['materials',index],'Image requires an accessible image URL and alternative text'));
 }
 for(const [index,entry] of (question.optionMaterials??[]).entries()) {
  const optionIds=(question.choices??[]).map((_,i)=>`option-${i}`);
  const slot=(question.materialRefs??[]).findIndex(ref=>ref.id===entry.materialRef?.id&&ref.revision===entry.materialRef?.revision);
  if(!optionIds.includes(entry.optionId)||slot<0||materials[slot]?.type!=='image')errors.push(issue('invalid',['optionMaterials',index],'Image option must reference a declared owned image material revision'));
 }
 for(const key of ['questionTiming','optionsTiming'])if(question.presentationPolicy?.[key]!==undefined&&!['beforeAudio','afterAudio'].includes(question.presentationPolicy[key]))errors.push(issue('invalid',['presentationPolicy',key],'Unknown audio presentation timing'));
 return errors;
}
const issue=(code,fieldPath,message)=>({code,fieldPath,message});
/** Strict authored-content validation is opt-in for new canonical authoring.
 * Legacy archival remains readable and never gets promoted merely by parsing. */
export function validateQuestionPayload(question,{strict=true,materialPayloads=[]}={}) {
 const errors=[];const strategy=questionStrategy(question.questionTypeId??question.kind??question.type);
 if(!strategy) return {valid:false,errors:[issue('not_applicable',['questionTypeId'],'Select a registered question type')]};
 if(!strict) return {valid:true,errors,strictExamEligible:false};
 if(!question.level||!['N1','N2','N3','N4','N5'].includes(question.level)) errors.push(issue('required',['level'],'An explicit JLPT level is required'));
 else if(!strategy.supplementary&&!strategy.applicableLevels.includes(question.level)) errors.push(issue('not_applicable',['level'],'This type is not an official task at this level'));
 if(typeof question.prompt!=='string'||!question.prompt.trim())errors.push(issue('required',['prompt'],'Preserve the actual task and conditions'));
 const choices=question.choices;
 let resolved;
 if(strategy.supplementary&&Array.isArray(choices)&&!choices.length) {
  if(question.answerIndex!==-1) errors.push(issue('invalid',['answerIndex'],'Unscored training must declare answerIndex -1'));
 } else {
  try{resolved=resolveLegacyAnswer(question,{numericAnswerBase:question.numericAnswerBase});}catch(error){errors.push(issue('invalid',['answer'],error.message));}
  const count=['listening-quick','listening-expression'].includes(strategy.id)?3:4;
  if(!Array.isArray(choices)||choices.length!==count||choices.some(c=>typeof c!=='string'||!c.trim())||new Set(choices).size!==choices.length)errors.push(issue('invalid',['choices'],`Provide ${count} distinct, non-empty choices`));
 }
 const materials=materialPayloads;
 errors.push(...validatePresentationMaterials(question,materials));
 if(materials.length) {
  const refs=question.materialRefs;
  if(!Array.isArray(refs)||refs.length!==materials.length||refs.some(ref=>typeof ref?.id!=='string'||!ref.id||!Number.isSafeInteger(ref.revision)||ref.revision<1)||new Set(refs.map(ref=>JSON.stringify([ref.id,ref.revision]))).size!==refs.length)errors.push(issue('invalid',['materialRefs'],'Each material must have a distinct owned version reference'));
 }
 if(strategy.module==='reading'||strategy.id==='grammar-text') {
  const articles=materials.filter(m=>m?.type==='article'||m?.type==='table');
  const count=strategy.id==='reading-integrated'?2:1;
  if(articles.length<count)errors.push(issue('required',['materialRefs'],`Provide ${count} owned article/table revisions`));
  if(strategy.id==='reading-information'&&(!Array.isArray(question.taskConditions)||!question.taskConditions.length))errors.push(issue('required',['taskConditions'],'Keep the information-search conditions'));
  if(strategy.id==='grammar-text') {
   const blank=question.blankId;
   if(typeof blank!=='string'||!blank||!articles.some(m=>(m.blocks??[]).some(b=>b.text?.includes(blank))))errors.push(issue('invalid',['blankId'],'The selected blank must occur in the referenced article'));
  }
 }
 if(strategy.module==='listening'&&!materials.some(m=>m?.type==='audio'))errors.push(issue('required',['materialRefs'],'Provide an owned audio revision; bytes and transcript need separate review'));
 if(['vocabulary-kanji-reading','vocabulary-orthography','vocabulary-paraphrase'].includes(strategy.id)) {
  const target=question.targetSpan;
  if(!target||!Number.isInteger(target.start)||!Number.isInteger(target.end)||target.start<0||target.end<=target.start||question.prompt?.slice(target.start,target.end)!==target.text)errors.push(issue('invalid',['targetSpan'],'Target offsets must reproduce the original target exactly'));
  else if(strategy.id==='vocabulary-kanji-reading'&&!/\p{Script=Han}/u.test(target.text))errors.push(issue('not_applicable',['targetSpan'],'A pure kana target cannot test kanji reading'));
 }
 if(strategy.id==='grammar-composition') {
  const assembly=question.assembly;const optionIds=resolved?.options.map(o=>o.id)??[];
  if(!assembly||!Array.isArray(assembly.correctOrder)||assembly.correctOrder.length!==optionIds.length||new Set(assembly.correctOrder).size!==optionIds.length||assembly.correctOrder.some(id=>!optionIds.includes(id)))errors.push(issue('invalid',['assembly','correctOrder'],'Each fragment must occur once in the complete order'));
  else if(!Number.isInteger(assembly.starSlot)||assembly.starSlot<0||assembly.starSlot>=optionIds.length||assembly.correctOrder[assembly.starSlot]!==resolved.answer.optionId)errors.push(issue('invalid',['assembly','starSlot'],'The star fragment must agree with the frozen answer'));
 }
 if(!question.correctReason&&!question.explanation&&!question.explanation_zh)errors.push(issue('required',['explanation'],'Explain the evidence for the correct answer'));
 // Structural success does not establish semantic quality or audio validity.
 return {valid:!errors.length,errors,strictExamEligible:!strategy.supplementary&&!errors.length&&question.reviewStatus==='approved',registrySchemaVersion:questionRegistrySchemaVersion};
}
