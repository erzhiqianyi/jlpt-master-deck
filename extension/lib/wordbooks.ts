import type { CaptureCategory, Wordbook } from './messages';

// One wordbook holds words, grammar and names, so word and grammar captures may target any wordbook;
// other categories (sentences, listening, reading) have no target wordbook.
export function wordbooksForCategory(wordbooks: Wordbook[], category: CaptureCategory): Wordbook[] {
  return category === 'word' || category === 'grammar' ? wordbooks : [];
}
