import type { JapaneseAnnotation } from '../../types';
export type ExamQuestion = {
  canonicalQuestionId?: string;
  questionRevision?: number;
  questionTypeId?: string;
  materialRefs?: {id:string;revision:number}[];
  japaneseAnnotations?: JapaneseAnnotation[];
  id: string; prompt: string; passage?: string; choices: string[]; answerIndex: number; explanation: string;
  choiceExplanations?: string[]; translation?: string; sourceUrl?: string; sourceLabel?: string; type?: string;
  audioUrl?: string; transcript?: string; scoringReady?: boolean;
};
export type ExamSession = {
  id: string; title: string; description?: string; scheduledDate?: string; durationMinutes?: number; questions: ExamQuestion[];
};
export type DesignedExam = {
  id: string; title: string; description?: string; level?: string; revision: number; sessions: ExamSession[];
};
export type ExamSummary = Omit<DesignedExam, 'sessions'> & { sessions: Array<Omit<ExamSession, 'questions'> & { questionCount: number }> };
