import type { LocalMockExam } from '../../types';

export type SavedExamState = {
  revision: string;
  status: 'intro' | 'active' | 'result';
  answers: Record<string, number>;
  flagged: string[];
  currentIndex: number;
  startedAt?: string;
  submittedAt?: string;
};

export function legacyMockStorageKey(userId: number, examId: string) {
  return `jlpt-local-mock:${userId}:${examId}`;
}

export function legacyMockRevision(exam: LocalMockExam) {
  return JSON.stringify({ questions: exam.questions, sections: exam.sections, totalDurationMinutes: exam.totalDurationMinutes });
}

export function emptyLegacyMockState(revision = ''): SavedExamState {
  return { revision, status: 'intro', answers: {}, flagged: [], currentIndex: 0 };
}

/** Unscoped historical keys are deliberately never adopted by a different signed-in account. */
export function readLegacyMockState(storage: Pick<Storage, 'getItem'>, key: string, exam: LocalMockExam): SavedExamState {
  const revision = legacyMockRevision(exam);
  const empty = emptyLegacyMockState(revision);
  try {
    const value = JSON.parse(storage.getItem(key) ?? 'null');
    if (!value || value.revision !== revision || !['intro', 'active', 'result'].includes(value.status)) return empty;
    const startedAt = typeof value.startedAt === 'string' && Number.isFinite(Date.parse(value.startedAt)) ? value.startedAt : undefined;
    if (value.status === 'active' && !startedAt) return empty;
    const answers: Record<string, number> = {};
    for (const question of exam.questions) {
      const answer = value.answers?.[question.id];
      if (Number.isInteger(answer) && answer >= 0 && answer < question.choices.length) answers[question.id] = answer;
    }
    const validIds = new Set(exam.questions.map((question) => question.id));
    return {
      revision, status: value.status, answers, startedAt,
      flagged: Array.isArray(value.flagged) ? [...new Set<string>(value.flagged.filter((id: unknown) => typeof id === 'string' && validIds.has(id)))] : [],
      currentIndex: Number.isInteger(value.currentIndex) ? Math.max(0, Math.min(Math.max(0, exam.questions.length - 1), value.currentIndex)) : 0,
      submittedAt: typeof value.submittedAt === 'string' && Number.isFinite(Date.parse(value.submittedAt)) ? value.submittedAt : undefined,
    };
  } catch { return empty; }
}
