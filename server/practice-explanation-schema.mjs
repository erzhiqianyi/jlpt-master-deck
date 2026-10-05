import { z } from 'zod';
import { japaneseAnnotationsSchema } from './japanese-annotations.mjs';

export const practiceExplanationFields = {
  correctReason: z.string().trim().min(1).max(24000).optional(),
  memoryPoint: z.string().trim().max(8000).optional(),
  translationZh: z.string().trim().max(24000).optional(),
  choiceAnalysis: z.array(z.object({
    choice: z.string().min(1),
    explanation: z.string().trim().min(1).max(12000),
  }).strict()).min(2).max(8).optional()
    .describe('Replace all option explanations. Include every existing choice exactly once; correct flags are computed by the server.'),
};

export const practiceExplanationPatchSchema = z.object(practiceExplanationFields).strict()
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), 'Provide at least one explanation field');

export const practiceQuestionPatchSchema = z.object({
  ...practiceExplanationFields,
  prompt: z.string().trim().min(1).max(30000).optional(),
  promptTarget: z.string().trim().max(1000).optional(),
  instruction: z.string().trim().max(8000).optional(),
  context: z.string().trim().max(30000).optional(),
  choices: z.array(z.string().trim().min(1).max(12000)).min(2).max(8)
    .refine((choices) => new Set(choices).size === choices.length, 'Choices must be distinct').optional(),
  answer: z.string().trim().min(1).max(12000).optional(),
  answerIndex: z.number().int().min(0).max(7).optional(),
  japaneseAnnotations: japaneseAnnotationsSchema.optional(),
}).strict().refine((patch) => Object.values(patch).some((value) => value !== undefined), 'Provide at least one question field');
