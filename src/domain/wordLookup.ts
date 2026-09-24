import TinySegmenter from 'tiny-segmenter';
import type { VocabItem } from '../types';

export const normalizeLookup = (text: string) => text.normalize('NFKC').trim();
export function lookupForms(item: VocabItem): string[] {
  return [item.original, item.reading, item.base_form, ...(item.conjugations ?? []).map((entry) => entry.form)]
    .filter((value): value is string => Boolean(value)).map(normalizeLookup);
}
export function findLookupItems(items: VocabItem[], query: string) {
  const word = normalizeLookup(query);
  return word ? items.filter((item) => lookupForms(item).includes(word)) : [];
}

// A compact Japanese tokenizer also works on browsers without Intl.Segmenter.
// Merge known library forms across token boundaries without losing source text.
const tokenizer = new TinySegmenter();
export function segmentJapanese(text: string, forms: Set<string> = new Set()) {
  const segments = tokenizer.segment(text).map((part: string) => ({ text: part, word: /[\p{L}\p{N}]/u.test(part) }));
  const result: { text: string; word: boolean }[] = [];
  for (let i = 0; i < segments.length; i++) {
    let end = i;
    let joined = segments[i].text;
    if (segments[i].word) {
      for (let j = i + 1; j < segments.length && segments[j].word; j++) {
        joined += segments[j].text;
        if (forms.has(normalizeLookup(joined))) end = j;
      }
    }
    result.push({ text: segments.slice(i, end + 1).map((part) => part.text).join(''), word: segments[i].word });
    i = end;
  }
  return result;
}
