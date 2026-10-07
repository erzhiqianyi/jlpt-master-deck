import {listeningPracticeKey} from './listeningPractice';
import type {Question,PracticeAttempt,ReadingQuestion,ListeningQuestion} from '../types';
export function dedicatedAttempt(items:(ReadingQuestion|ListeningQuestion)[],sessionId:string,view:'reading'|'listening',now:string):PracticeAttempt {
 const questions:Question[]=items.map(item=>({id:item.id,itemId:item.id,kind:'grammar',questionTypeId:item.questionTypeId??`${view}-basic-training`,canonicalQuestionId:item.canonicalQuestionId,questionRevision:item.questionRevision,materialRefs:item.materialRefs,title:item.title,prompt:item.question,choices:[...item.choices],answer:item.choices[item.answerIndex]??'',context:'passage' in item?item.passage:item.transcript??'',passage:'passage' in item?item.passage:undefined,correctReason:item.explanation,memoryPoint:'',choiceAnalysis:[]}));
 return {id:`${view}:${sessionId}`,title:items[0]?.title,practiceId:items[0] ? (view==='listening' ? listeningPracticeKey(items[0] as ListeningQuestion) : items[0].id) : undefined,view,deck:'all',startedAt:now,questionIds:questions.map(q=>q.id),answers:[],questionManifest:questions.map(q=>({instanceId:q.id,status:'frozen',...(q.canonicalQuestionId&&q.questionRevision?{questionRef:{id:q.canonicalQuestionId,revision:q.questionRevision}}:{}),snapshot:q}))};
}
export function recordDedicatedChoice(attempt:PracticeAttempt,questionId:string,response:number|string,now:string):PracticeAttempt {
 const q=attempt.questionManifest?.find(entry=>entry.instanceId===questionId)?.snapshot;if(!q)throw new Error('Question was not presented');
 if(!q.choices.length) {
  const text=String(response).trim();if(!text)throw new Error('Please enter a response');
  const unscored=new Map((attempt.unscoredResponses??[]).map(entry=>[entry.questionId,entry]));unscored.set(questionId,{questionId,response:text,answeredAt:now});
  return finish({...attempt,unscoredResponses:[...unscored.values()]},now);
 }
 if(typeof response!=='number'||!q.choices[response])throw new Error('Please choose a valid option');
 if(attempt.answers.some(answer=>answer.questionId===questionId))return attempt;
 const selected=q.choices[response];return finish({...attempt,answers:[...attempt.answers,{questionId,itemId:q.itemId,kind:q.kind,selected,correct:selected===q.answer,answeredAt:now,elapsedMs:0}]},now);
}
function finish(attempt:PracticeAttempt,now:string):PracticeAttempt {
 if(attempt.answers.length+(attempt.unscoredResponses?.length??0)<attempt.questionIds.length)return attempt;
 const correct=attempt.answers.filter(a=>a.correct).length,total=attempt.answers.length;
 return {...attempt,completedAt:now,summary:{total,correct,wrong:total-correct,accuracy:total?correct/total:0,elapsedMs:0}};
}
