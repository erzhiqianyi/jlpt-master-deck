import { z } from 'zod';

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
