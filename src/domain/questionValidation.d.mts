// questionValidation.mjs の型。
import type { QuestionType, ValidationIssue } from '../v3/types';

export type ValidationType = Pick<QuestionType, 'typeId' | 'module' | 'targetMarking' | 'optionMedia' | 'materialKinds' | 'answerMode' | 'drawWholeGroup' | 'levels' | 'rules'>;
export function validateQuestionGroup(group: unknown, type: ValidationType | null | undefined, options?: { materialTexts?: Record<string, { kind?: string; body?: string | null; transcript?: string | null }> }): { errors: ValidationIssue[]; warnings: ValidationIssue[] };
export function typeForValidation(entry: QuestionType | null | undefined): ValidationType | null | undefined;
