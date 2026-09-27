import type { CaptureCategory, Wordbook } from './messages';

// Word captures can target any non-grammar wordbook; grammar captures any grammar wordbook.
// Mirrors the built-in/custom split in src/features/capture/CapturePanel.tsx.
export function wordbooksForCategory(wordbooks: Wordbook[], category: CaptureCategory): Wordbook[] {
  return wordbooks.filter((book) => (category === 'grammar') === (book.deck === 'grammar_expression'));
}
