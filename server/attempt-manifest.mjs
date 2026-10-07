import {readQuestionVersion} from './question-bank.mjs';
/** Old history is never inferred from today's source. Client snapshots describe presentation, not trusted scoring. */
export function preserveAttemptManifest(db,owner,attempt,previous) {
 if (!attempt) return attempt;
 if(previous?.questionManifest && JSON.stringify(previous.questionIds)!==JSON.stringify(attempt.questionIds))throw new Error('Attempt question order is immutable');
 if (previous?.completedAt && previous.questionManifest) return {...attempt,questionManifest:previous.questionManifest,answers:previous.answers,summary:previous.summary,completedAt:previous.completedAt,unscoredResponses:previous.unscoredResponses};
 if (!attempt.questionManifest) return {...attempt,questionManifest:(attempt.questionIds??[]).map(instanceId=>({instanceId,status:'missingOriginal'}))};
 if (!Array.isArray(attempt.questionManifest)||attempt.questionManifest.length!==(attempt.questionIds??[]).length) throw new Error('Invalid attempt manifest');
 const manifest=attempt.questionManifest.map((entry,index)=>{
  const old=previous?.questionManifest?.find(item=>item.instanceId===entry.instanceId);
  if(old?.status==='frozen' || old?.status==='missingOriginal' && previous?.answers?.some(answer=>answer.questionId===entry.instanceId))return old;
  if(entry.instanceId!==attempt.questionIds[index])throw new Error('Attempt manifest order mismatch');
  if(['missingOriginal','notPresented'].includes(entry.status))return {instanceId:entry.instanceId,status:entry.status};
  const snapshot=entry.snapshot;
  if(!snapshot||snapshot.id!==entry.instanceId||!Array.isArray(snapshot.choices)||typeof snapshot.answer!=='string')throw new Error('Invalid frozen presentation');
  if(entry.questionRef) {
   const payload=readQuestionVersion(db,owner,entry.questionRef);
   if(!payload)throw new Error('Owned attempt question revision required');
   if(snapshot.canonicalQuestionId!==entry.questionRef.id||snapshot.questionRevision!==entry.questionRef.revision)throw new Error('Frozen question reference mismatch');
  }
  return {instanceId:entry.instanceId,status:'frozen',...(entry.questionRef?{questionRef:entry.questionRef}:{}),snapshot:structuredClone(snapshot)};
 });
 const answers=new Map((previous?.answers??[]).map(answer=>[answer.questionId,answer]));
 for(const answer of attempt.answers??[]) { const old=answers.get(answer.questionId);if(!old || Date.parse(answer.answeredAt)>Date.parse(old.answeredAt))answers.set(answer.questionId,answer); }
 return {...attempt,questionManifest:manifest,answers:[...answers.values()]};
}
export function manifestForQuestions(questions) {
 return questions.map(q=>({instanceId:q.id,status:'frozen',...(q.canonicalQuestionId&&q.questionRevision?{questionRef:{id:q.canonicalQuestionId,revision:q.questionRevision}}:{}),snapshot:structuredClone(q)}));
}
