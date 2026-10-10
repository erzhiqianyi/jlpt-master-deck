import TinySegmenter from 'tiny-segmenter';

export const normalizeLookup = (text: string) => text.normalize('NFKC').trim();

// A compact Japanese tokenizer also works on browsers without Intl.Segmenter.
// Merge known library forms across token boundaries without losing source text.
const tokenizer = new TinySegmenter();
const wordSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ja', { granularity: 'word' }) : null;
export function segmentJapanese(text: string, forms: Set<string> = new Set()) {
  const tokens = wordSegmenter ? Array.from(wordSegmenter.segment(text), (part) => part.segment) : tokenizer.segment(text);
  const segments = tokens.map((part: string) => ({ text: part, word: /[\p{L}\p{N}]/u.test(part) }));
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
