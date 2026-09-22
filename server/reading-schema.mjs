import { z } from 'zod';

const text = (max) => z.string().trim().max(max);
export const readingFields = {
  title: text(120).optional(),
  passage: text(8000).min(1),
  question: text(1000).min(1),
  choices: z.array(text(2000).min(1)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: text(12000).optional(),
  tags: z.array(text(100).min(1)).max(12).optional(),
  explanationNodes: z.array(z.object({ title: text(200), body: text(12000) })).max(12).optional(),
  translationLines: z.array(z.object({ ja: text(8000), zh: text(16000) })).max(80).optional(),
  passageTranslation: text(24000).optional(),
  choiceExplanations: z.array(z.object({
    text: text(2000).min(1),
    translation: text(4000),
    analysis: text(8000),
    evidence: text(8000),
    errorType: text(200),
  })).max(4).refine((items) => items.length === 0 || items.length === 4, 'Provide all four choice explanations in choices order, or [] to clear them.').optional()
    .describe('One entry per choice in the same order; text must match the choice. Use an empty errorType for the correct answer.'),
  readingAnalysis: z.object({
    summary: text(8000),
    structure: text(8000),
    keySentences: z.array(text(8000).min(1)).max(30),
  }).optional(),
};
export const readingInputSchema = z.object(readingFields).strict();
export const readingPatchSchema = readingInputSchema.partial().refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update.');
export function normalizeReadingQuestion(payload) {
  const value = readingInputSchema.parse(payload);
  if (value.choiceExplanations?.some((entry, index) => entry.text !== value.choices[index])) {
    throw new Error('Choice explanation text must match the choice at the same index; update or clear choiceExplanations when changing choices.');
  }
  return {
    ...value, title: value.title || value.question.slice(0, 120), explanation: value.explanation ?? '',
    tags: [...new Set(value.tags ?? [])], explanationNodes: value.explanationNodes ?? [], translationLines: value.translationLines ?? [],
    passageTranslation: value.passageTranslation ?? '', choiceExplanations: value.choiceExplanations ?? [],
    readingAnalysis: value.readingAnalysis ?? { summary: '', structure: '', keySentences: [] },
  };
}
