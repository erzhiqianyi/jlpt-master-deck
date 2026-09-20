import type { AttemptAnswer, PracticeAttempt, Question, VocabItem } from '../types';

export type MistakeEntry = {
  id: string;
  item?: VocabItem;
  question?: Question;
  total: number;
  wrong: number;
  lastWrongAt: string;
  answers: { answer: AttemptAnswer; question?: Question; attemptId: string }[];
};

// Count actual answers in completed practices, including later correct answers.
export function buildMistakeEntries(attempts: PracticeAttempt[], questions: Question[], items: VocabItem[]): MistakeEntry[] {
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const groups = new Map<string, MistakeEntry>();
  for (const attempt of attempts) {
    if (!attempt.completedAt) continue;
    for (const answer of attempt.answers) {
      const question = questionMap.get(answer.questionId);
      const itemId = answer.itemId || question?.itemId;
      const id = itemId ? `item:${itemId}` : `question:${answer.questionId}`;
      const entry = groups.get(id) ?? { id, item: itemMap.get(itemId ?? ''), question, total: 0, wrong: 0, lastWrongAt: '', answers: [] };
      entry.total += 1;
      if (!answer.correct) {
        entry.wrong += 1;
        const timestamp = answer.answeredAt || attempt.completedAt;
        if (!entry.lastWrongAt || Date.parse(timestamp) > Date.parse(entry.lastWrongAt)) entry.lastWrongAt = timestamp;
      }
      entry.answers.push({ answer, question, attemptId: attempt.id });
      groups.set(id, entry);
    }
  }
  return [...groups.values()].filter((entry) => entry.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || Date.parse(b.lastWrongAt) - Date.parse(a.lastWrongAt));
}
