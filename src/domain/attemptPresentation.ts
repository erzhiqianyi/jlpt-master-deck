import type {PracticeAttempt,Question,AnswerState} from '../types';
export function freezePresentedQuestion(attempt:PracticeAttempt,question:Question):PracticeAttempt {
 return {...attempt,questionManifest:attempt.questionIds.map(id=>{
  const old=attempt.questionManifest?.find(entry=>entry.instanceId===id);
  if(old?.status==='frozen' || old?.status==='missingOriginal' && attempt.answers.some(answer=>answer.questionId===id))return old;
  return id===question.id ? {instanceId:id,status:'frozen',...(question.canonicalQuestionId&&question.questionRevision?{questionRef:{id:question.canonicalQuestionId,revision:question.questionRevision}}:{}),snapshot:structuredClone(question)} : old ?? {instanceId:id,status:'notPresented'};
 })};
}

import type {QuestionReference} from './questions';
export function completeAttempt(attempt: PracticeAttempt, answers: AnswerState, questions: QuestionReference[], now: Date): PracticeAttempt {
  const completedAnswers = questions.map((question) => {
    const existing = attempt.answers.find((answer) => answer.questionId === question.id);
    const stored = answers[question.id];
    return existing ?? {
      questionId: question.id,
      itemId: question.itemId,
      kind: question.kind,
      selected: stored?.selected ?? '',
      correct: Boolean(stored?.correct),
      startedAt: stored?.startedAt,
      answeredAt: stored?.answeredAt ?? now.toISOString(),
      elapsedMs: stored?.elapsedMs ?? 0,
    };
  }).filter(answer=>Boolean(answer.selected?.trim()));
  const correct = completedAnswers.filter((answer) => answer.correct).length;
  // Total time is the sum of per-question time, not wall-clock time since the attempt was opened.
  const elapsedMs = completedAnswers.reduce((sum, answer) => sum + Math.max(0, answer.elapsedMs || 0), 0);
  return {
    ...attempt,
    completedAt: now.toISOString(),
    answers: completedAnswers,
    summary: {
      total: completedAnswers.length,
      correct,
      wrong: completedAnswers.length - correct,
      accuracy: completedAnswers.length ? correct / completedAnswers.length : 0,
      elapsedMs,
    },
  };
}

