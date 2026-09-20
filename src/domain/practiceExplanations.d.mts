interface ExplanationInput {
  choices?: string[];
  answer?: string;
  answerIndex?: number;
  correctReason?: string;
  explanation_zh?: string;
  explanation?: string;
  choiceAnalysis?: { choice: string; explanation?: string; explanation_zh?: string }[];
  choice_analysis?: { choice: string; explanation?: string; explanation_zh?: string }[];
}
export function normalizePracticeExplanations<T extends ExplanationInput>(question: T): T & {
  correctReason: string;
  choiceAnalysis: { choice: string; correct: boolean; explanation: string }[];
};
export function isEmptyReason(text: unknown): boolean;
export function assertPracticeExplanations(questions: ExplanationInput[]): void;
