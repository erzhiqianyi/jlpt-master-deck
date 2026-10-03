import type { DraftAnnotation } from '../../types';

export type QuestionReview = { kind: 'question_review'; key: string; number: number; note: string; confirmed: boolean };

// Include the full question so editing any part invalidates its saved confirmation.
export function questionReviewKey(question: unknown, index: number): string {
  return JSON.stringify([index, question]);
}

export function getQuestionReviews(annotations: DraftAnnotation[]): Map<string, QuestionReview> {
  const reviews = new Map<string, QuestionReview>();
  for (const annotation of [...annotations].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    try {
      const entry: unknown = JSON.parse(annotation.body);
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const review = entry as Partial<QuestionReview>;
      if (review.kind !== 'question_review' || typeof review.key !== 'string') continue;
      reviews.set(review.key, {
        kind: 'question_review', key: review.key, number: typeof review.number === 'number' ? review.number : 0,
        note: typeof review.note === 'string' ? review.note : '', confirmed: review.confirmed === true,
      });
    } catch { /* Free-text annotations cannot confirm a question. */ }
  }
  return reviews;
}

export function isQuestionConfirmed(key: string, reviews: Map<string, QuestionReview>, notes: Record<string, string> = {}): boolean {
  const review = reviews.get(key);
  return review?.confirmed === true && (notes[key] === undefined || notes[key] === review.note);
}

export function allQuestionsConfirmed(questions: unknown[], annotations: DraftAnnotation[]): boolean {
  const reviews = getQuestionReviews(annotations);
  return questions.length > 0 && questions.every((question, index) => isQuestionConfirmed(questionReviewKey(question, index), reviews));
}
