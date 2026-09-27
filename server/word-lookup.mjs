// Server-side port of the exact-match lookup logic in src/domain/wordLookup.ts.
// Keep these three functions in sync with that file — segmentJapanese/TinySegmenter
// are intentionally not ported here since callers (e.g. the Chrome extension) already
// send the exact selected word/phrase, not a whole sentence to tokenize.

export const normalizeLookup = (text) => text.normalize('NFKC').trim();

export function lookupForms(item) {
  return [item.original, item.reading, item.base_form, ...(item.conjugations ?? []).map((entry) => entry.form)]
    .filter((value) => Boolean(value)).map(normalizeLookup);
}

export function findLookupItems(items, query) {
  const word = normalizeLookup(query);
  return word ? items.filter((item) => lookupForms(item).includes(word)) : [];
}
