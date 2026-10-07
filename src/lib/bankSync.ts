type Fields=Record<string,unknown>;
export interface BankReference {id:string;revision:number}
export interface BankVersion extends BankReference {schemaVersion:number;payload:Fields}
export function validateBankChange(collection:string,id:string,value:unknown) {
 if(!['questionVersions','materialVersions','materialGroupVersions'].includes(collection))return;
 const version=value as BankVersion;
 if(!version||version.schemaVersion!==1||typeof version.id!=='string'||!version.id||!Number.isSafeInteger(version.revision)||version.revision<1||JSON.stringify([version.id,version.revision])!==id||!version.payload||typeof version.payload!=='object')throw new Error('Invalid immutable bank version; sync cursor must not advance');
}
export function frozenBankQuestion(records:Record<string,Record<string,unknown>>,question:Fields):Fields {
 if(typeof question.canonicalQuestionId!=='string'||!Number.isSafeInteger(question.questionRevision))return question;
 const snapshot=records.questionVersions?.[JSON.stringify([question.canonicalQuestionId,question.questionRevision])] as BankVersion|undefined;
 if(!snapshot)return question; // Old clients/caches retain their original snapshot.
 validateBankChange('questionVersions',JSON.stringify([snapshot.id,snapshot.revision]),snapshot);
 const payload=snapshot.payload;const legacy=payload.legacy as Fields|undefined;
 if(!legacy)return question;
 const result={...question};
 for(const key of ['prompt','question','instruction','context','promptTarget','targetSpan','taskConditions','assembly','blankId','explanation','explanation_zh','correctReason','memoryPoint','choiceAnalysis','choiceDetails','japaneseAnnotations','translationZh'])if(legacy[key]!==undefined)result[key]=legacy[key];
 const options=payload.options as {id:string;text:string}[]|undefined;const answer=payload.answer as {type:string;optionId?:string}|undefined;
 if(options&&answer?.optionId) {
  const index=options.findIndex(option=>option.id===answer.optionId);
  if(index<0)throw new Error('Frozen answer option is missing');
  result.choices=options.map(option=>option.text);
  if('answerIndex' in question)result.answerIndex=index;
  if('answer' in question)result.answer=options[index].text;
 }
 const refs=payload.materialRefs as BankReference[]|undefined;
 if(refs) {
  result.materialRefs=refs;
  const materials=refs.map(ref=>(records.materialVersions?.[JSON.stringify([ref.id,ref.revision])] as BankVersion|undefined)?.payload);
  const articles=materials.filter(material=>material?.type==='article'||material?.type==='table');
  if(materials.every(Boolean)&&articles.length) {
   const text=articles.map(material=>(material!.blocks as {text?:string}[]??[]).map(block=>block.text??'').join('\n')).join('\n\n');
   if('passage' in question)result.passage=text;
   else if(!result.context)result.context=text;
  }
 }
 return result;
}
