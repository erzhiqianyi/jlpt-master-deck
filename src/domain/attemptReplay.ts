import type { AnswerState, PracticeAttempt, ProgressState, Question } from '../types';

export function replayRouteAttemptId(itemId?: string) {
  return itemId?.startsWith('replay:') ? itemId.slice('replay:'.length) : undefined;
}

export function questionsForAttempt(attempt: PracticeAttempt, questions: Question[]) {
  void questions;
  return attempt.questionManifest?.flatMap(entry=>entry.status==='frozen' && entry.snapshot ? [entry.snapshot] : []) ?? [];
}

export function canReplayAttempt(attempt: PracticeAttempt, questions: Question[]) {
  const originals = questionsForAttempt(attempt, questions);
  return attempt.questionIds.length > 0 && originals.length === attempt.questionIds.length
    && originals.every((question) => question.choices.length > 0 && question.choices.includes(question.answer));
}

export function createReplayAttempt(source: PracticeAttempt, id: string, now: string): PracticeAttempt {
  return { id, title: source.title, practiceId: source.practiceId, view: source.view, deck: source.deck,
    startedAt: now, analysisStatus: 'idle', questionIds: [...source.questionIds], questionManifest:structuredClone(source.questionManifest), answers: [] };
}

export function answersForAttempt(attempt: PracticeAttempt): AnswerState {
  return Object.fromEntries(attempt.answers.map((answer) => [answer.questionId, {
    selected: answer.selected, correct: answer.correct, startedAt: answer.startedAt,
    answeredAt: answer.answeredAt, elapsedMs: answer.elapsedMs, attemptId: attempt.id,
  }]));
}

/** Keep writes ordered even when one request fails, without dropping later answers. */
export function enqueuePracticeSave<T>(pending: Promise<unknown>, save: () => Promise<T>): Promise<T> {
  return pending.catch(() => undefined).then(save);
}

/** Replays persist independently; they must never overwrite another active practice's answers. */
export function replayPracticeSaveBody(attemptHistory: PracticeAttempt[], progress?: ProgressState) {
  return { attemptHistory, ...(progress ? { progress } : {}) };
}
