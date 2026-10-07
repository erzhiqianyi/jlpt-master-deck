import { japaneseAnnotationsSchema } from './japanese-annotations.mjs';
import { z } from 'zod';

const text = (max) => z.string().trim().max(max);
export const readingFields = {
  questionTypeId: z.enum(['reading-short','reading-mid','reading-long','reading-integrated','reading-thematic','reading-information','reading-basic-training']).optional(),
  level: z.enum(['N1','N2','N3','N4','N5']).nullable().optional(),
  materialRef: z.object({id: text(200).min(1),revision:z.number().int().positive()}).nullable().optional(),
  japaneseAnnotations: japaneseAnnotationsSchema.optional(),
  rubyTerms: z.array(z.object({ text: text(200).min(1), reading: text(400).min(1).regex(/^[\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+$/u, 'Use kana for readings.') }).strict()).max(2000).optional()
    .describe('Explicit contextual furigana for Japanese text in passage, question, choices and quoted evidence. Preserve original text. Longest matching text wins; use longer phrases to disambiguate readings. Omitted preserves existing annotations on update; [] clears them. Entire array is replaced.'),
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

// Manual authoring and legacy reads remain compatible with incomplete drafts.
// Agent writes must deliver a complete explanation, including on partial updates.
export const completeReadingFields = {
  ...readingFields,
  explanation: text(12000).min(1).describe('Required overall explanation in Chinese; explain why the answer follows from the passage.'),
  passageTranslation: text(24000).min(1).describe('Required full Chinese translation of every supplied passage paragraph, not a summary. Preserve omissions and flag source transcription uncertainty.'),
  choiceExplanations: z.array(z.object({
    text: text(2000).min(1),
    translation: text(4000).min(1),
    analysis: text(8000).min(1),
    evidence: text(8000).min(1),
    errorType: text(200),
  })).length(4).describe('Required for all four choices in order: Chinese translation, reasoning, passage evidence and distractor type. text must match the choice. Correct answer errorType must be empty; every wrong answer needs a nonempty errorType.'),
  readingAnalysis: z.object({
    summary: text(8000).min(1),
    structure: text(8000).min(1),
    keySentences: z.array(text(8000).min(1)).min(1).max(30),
  }).describe('Required Chinese summary and paragraph structure, with keySentences quoted verbatim from the passage.'),
  explanationNodes: z.array(z.object({ title: text(200).min(1), body: text(12000).min(1) })).min(1).max(12)
    .describe('Required worked solution: step-by-step reasoning and concrete elimination techniques tied to this passage. Use clearly titled sections; generic advice is not sufficient.'),
};

export const completeReadingSchema = z.object(completeReadingFields).strict().superRefine((value, ctx) => {
  const issue = (path, message) => ctx.addIssue({ code: 'custom', path, message });
  value.choiceExplanations.forEach((choice, index) => {
    if (choice.text !== value.choices[index]) issue(['choiceExplanations', index, 'text'], 'Must match the choice at the same index.');
    if (index === value.answerIndex ? choice.errorType !== '' : choice.errorType === '') {
      issue(['choiceExplanations', index, 'errorType'], 'Use an empty errorType only for the correct answer; every distractor needs its error type.');
    }
  });
  const compact = (text) => text.replace(/\s+/gu, '');
  const passage = compact(value.passage);
  value.readingAnalysis.keySentences.forEach((sentence, index) => {
    if (!passage.includes(compact(sentence))) issue(['readingAnalysis', 'keySentences', index], 'Must quote text present in the passage; do not invent evidence.');
  });
});

export function validateCompleteReadingUpdate(current, patch) {
  const changes = readingPatchSchema.parse(patch);
  const merged = { ...current, ...changes };
  // The stored record also has identity/timestamp/reference fields, which are not input.
  return completeReadingSchema.parse(Object.fromEntries(Object.keys(readingFields).map((key) => [key, merged[key]])));
}

export function normalizeReadingQuestion(payload) {
  const value = readingInputSchema.parse(payload);
  if (value.choiceExplanations?.some((entry, index) => entry.text !== value.choices[index])) {
    throw new Error('Choice explanation text must match the choice at the same index; update or clear choiceExplanations when changing choices.');
  }
  return {
    ...value, japaneseAnnotations: value.japaneseAnnotations ?? [], rubyTerms: value.rubyTerms ?? [], title: value.title || value.question.slice(0, 120), explanation: value.explanation ?? '',
    tags: [...new Set(value.tags ?? [])], explanationNodes: value.explanationNodes ?? [], translationLines: value.translationLines ?? [],
    passageTranslation: value.passageTranslation ?? '', choiceExplanations: value.choiceExplanations ?? [],
    readingAnalysis: value.readingAnalysis ?? { summary: '', structure: '', keySentences: [] },
  };
}
