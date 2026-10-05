import type { DisplaySettings } from '../types';
export type VocabularyQuestionKind = NonNullable<DisplaySettings['jlptVocabularyQuestionKinds']>[number];
export const vocabularyQuestionKinds: VocabularyQuestionKind[];
export function normalizeVocabularyQuestionKinds(settings?: Partial<DisplaySettings>): VocabularyQuestionKind[];
