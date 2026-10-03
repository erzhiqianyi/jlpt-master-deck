import type { AnswerState, AttemptAnswer, PracticeAttempt, Question } from '../../types';

/** Historical records keep their saved score, even when their original questions change or disappear. */
export function practiceReviewModel(questions: Question[], answers: AnswerState, attempt?: PracticeAttempt) {
  const stored: AttemptAnswer[] = attempt
    ? attempt.answers
    : questions.flatMap((question) => {
      const answer = answers[question.id];
      return answer ? [{ ...answer, questionId: question.id, itemId: question.itemId, kind: question.kind, answeredAt: answer.answeredAt ?? '', elapsedMs: answer.elapsedMs ?? 0 }] : [];
    });
  const answerMap = new Map(stored.map((answer) => [answer.questionId, answer]));
  const originalIds = new Set(attempt?.questionIds ?? questions.map((question) => question.id));
  const reviewQuestions = attempt ? questions.filter((question) => originalIds.has(question.id)) : questions;
  const rows = reviewQuestions.map((question, index) => {
    const storedAnswer = answerMap.get(question.id);
    const answer = storedAnswer ? { ...storedAnswer, correct: attempt ? storedAnswer.correct : storedAnswer.selected === question.answer } : undefined;
    return { question, index, answer, status: !answer ? 'unanswered' as const : answer.correct ? 'correct' as const : 'wrong' as const };
  });
  const total = attempt ? attempt.summary?.total ?? attempt.questionIds.length : questions.length;
  const answered = attempt ? answerMap.size : rows.filter((row) => row.answer).length;
  const correct = attempt ? attempt.summary?.correct ?? [...answerMap.values()].filter((answer) => answer.correct).length : rows.filter((row) => row.status === 'correct').length;
  const wrong = attempt ? attempt.summary?.wrong ?? [...answerMap.values()].filter((answer) => !answer.correct).length : rows.filter((row) => row.status === 'wrong').length;
  const availableIds = new Set(reviewQuestions.map((question) => question.id));
  const missingOriginals = attempt ? Math.max([...originalIds].filter((id) => !availableIds.has(id)).length, total - reviewQuestions.length) : 0;
  return {
    rows, total, correct, wrong, answered, missingOriginals,
    unanswered: Math.max(0, total - answered),
    accuracy: attempt?.summary?.accuracy ?? (total ? correct / total : 0),
    elapsedMs: attempt?.summary?.elapsedMs ?? stored.reduce((sum, answer) => sum + (answer.elapsedMs ?? 0), 0),
  };
}

/** A short, source-only excerpt. Full explanations remain available in disclosure content. */
export function conciseEvidence(value: string, maxLength = 180) {
  const normalized = String(value ?? '').replace(/\\r\\n|\\n|\\r/g, '\n').replace(/\r\n?/g, '\n');
  const line = normalized.split('\n').map((part) => part.trim().replace(/^#{1,6}\s+/, '').replace(/^【[^】]{1,24}】\s*/, '')).find(Boolean) ?? '';
  const sentence = line.match(/^.*?[。！？](?:[」』）])?/u)?.[0] ?? line;
  const summary = sentence.length > maxLength ? `${sentence.slice(0, maxLength).trimEnd()}…` : sentence;
  return { summary, hasMore: normalized.trim() !== summary };
}
