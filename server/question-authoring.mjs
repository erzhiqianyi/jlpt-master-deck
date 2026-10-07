import {createHash} from 'node:crypto';
import {getDb,createReviewPackDraft,getReviewPackDraft,updateReviewPackDraft,loadReviewData} from './storage.mjs';
import {questionStrategy,resolveLegacyAnswer} from '../src/domain/questionContract.mjs';
import {readMaterialVersion,persistLibraryQuestion,questionBankMetadata} from './bank-materials.mjs';
import {validateQuestionPayload} from '../src/domain/questionPayload.mjs';
import {transaction} from './platform.mjs';
const failure=(message,code='invalid',statusCode=400,fieldPath=[])=>Object.assign(new Error(message),{code,statusCode,fieldPath});
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,stable(value[key])])):value;
function schema(db){db.exec('CREATE TABLE IF NOT EXISTS bank_author_requests(owner INTEGER NOT NULL,request_id TEXT NOT NULL,fingerprint TEXT NOT NULL,draft_id TEXT NOT NULL,question_id TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(owner,request_id))');}
export function getAuthoredQuestion(owner,draftId) {
 const draft=getReviewPackDraft(owner,draftId);
 if(!draft||draft.content.authoringMode!=='bank-single-question')throw failure('Owned authored draft not found','not_found',404);
 const question=draft.content.sections[0].questions[0];
 return {draft,questionRef:questionBankMetadata(getDb(),owner,{kind:'draft',id:draft.id,questionId:question.id})};
}
/** Independent question authoring reuses the real draft approval/publish flow.
 * It never upserts knowledge and never accepts a caller-supplied ready state. */
export function saveAuthoredQuestion(owner,input) {
 const {requestId,draftId,expectedRevision,title,question,knowledgeIds=[],materialRefs=[]}=input??{};
 if(typeof requestId!=='string'||!requestId||requestId.length>120)throw failure('Stable requestId required','required',400,['requestId']);
 if(typeof title!=='string'||!title.trim()||!question||typeof question!=='object'||Array.isArray(question))throw failure('Title and one question required');
 if(!Array.isArray(knowledgeIds)||new Set(knowledgeIds).size!==knowledgeIds.length||!Array.isArray(materialRefs))throw failure('Distinct knowledge IDs and material refs required');
 if(question.canonicalQuestionId!==undefined||question.questionRevision!==undefined)throw failure('Use draftId and expectedRevision to update an authored question');
 const strategy=questionStrategy(question.questionTypeId);
 if(!strategy||!['vocabulary','grammar'].includes(strategy.module))throw failure('Use the existing reading/listening author tools for those modules','not_applicable',400,['questionTypeId']);
 const owned=new Set(loadReviewData(owner).items.map(item=>item.id));
 if(knowledgeIds.some(id=>!owned.has(id)))throw failure('Accessible knowledge item required','permission',404,['knowledgeIds']);
 const db=getDb();schema(db);
 const fingerprint=createHash('sha256').update(JSON.stringify(stable(input))).digest('hex');
 const {answerIndex,options}=resolveLegacyAnswer(question,{numericAnswerBase:question.numericAnswerBase});
 const normalized={...question,id:'author-q1',kind:strategy.module==='grammar'?'grammar':strategy.aliases[0],answerIndex,answer:options[answerIndex].text,validationMode:'strict',reviewStatus:'pending',knowledgeIds,materialRefs};
 const materials=materialRefs.map(ref=>readMaterialVersion(db,owner,ref));
 if(materials.some(value=>!value))throw failure('Owned material revision required','permission',404,['materialRefs']);
 const validation=validateQuestionPayload(normalized,{materialPayloads:materials});
 if(!validation.valid)throw Object.assign(failure('Question failed type-specific validation','question_validation_failed'),{issues:validation.errors});
 if(!Array.isArray(normalized.choiceAnalysis)||normalized.choiceAnalysis.length!==normalized.choices.length||normalized.choices.some(choice=>normalized.choiceAnalysis.filter(entry=>entry?.choice===choice&&typeof entry.explanation==='string'&&entry.explanation.trim()).length!==1))throw failure('Explain each choice exactly once','required',400,['choiceAnalysis']);
 const articles=materials.filter(material=>material.type==='article'||material.type==='table');
 if(articles.length)normalized.passage=articles.map(material=>(material.blocks??[]).map(block=>block.text??'').join('\n')).join('\n\n');
 return transaction(db,()=>{
  const previous=db.prepare('SELECT * FROM bank_author_requests WHERE owner=? AND request_id=?').get(owner,requestId);
  if(previous) {
   if(previous.fingerprint!==fingerprint)throw failure('requestId conflicts with saved authoring content','event_conflict',409,['requestId']);
   return {...getAuthoredQuestion(owner,previous.draft_id),acceptedQuestionRef:{id:previous.question_id,revision:previous.revision},unchanged:true};
  }
  const content={authoringMode:'bank-single-question',schemaVersion:1,knowledgeIds,sections:[{id:'author',title:strategy.id,instruction:normalized.instruction??'',questions:[normalized]}]};
  let draft;
  if(draftId) {
   const existing=getAuthoredQuestion(owner,draftId);
   if(expectedRevision!==existing.questionRef.questionRevision)throw Object.assign(failure('Question revision conflict','revision_conflict',409,['expectedRevision']),{currentRevision:existing.questionRef.questionRevision});
   draft=updateReviewPackDraft(owner,draftId,{title,content});
   db.prepare("UPDATE review_pack_drafts SET status='draft' WHERE user_id=? AND id=?").run(owner,draftId);
   draft.status='draft';
  } else {
   if(expectedRevision!==undefined)throw failure('expectedRevision requires draftId');
   draft=createReviewPackDraft(owner,{title,content});
  }
  const ref=persistLibraryQuestion(db,owner,{kind:'draft',id:draft.id,questionId:normalized.id},normalized,{status:'needs_review',knowledgeIds,materialRefs});
  db.prepare('INSERT INTO bank_author_requests VALUES(?,?,?,?,?,?)').run(owner,requestId,fingerprint,draft.id,ref.id,ref.revision);
  return {...getAuthoredQuestion(owner,draft.id),acceptedQuestionRef:ref,unchanged:false};
 });
}
