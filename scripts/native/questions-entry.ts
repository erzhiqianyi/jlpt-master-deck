import { buildQuestions } from '../../src/domain/questions';
import type { Locale, VocabItem } from '../../src/types';

// JSON boundary also works in JavaScriptCore on iOS, with no browser or network.
export function forItem(itemsJSON: string, itemID: string, locale: Locale): string {
  const items = JSON.parse(itemsJSON) as VocabItem[];
  const item = items.find((value) => value.id === itemID);
  const annotations = [...(item?.japanese_annotations ?? []), ...(item?.practice_questions ?? []).flatMap((seed) => seed.japanese_annotations ?? [])];
  return JSON.stringify(buildQuestions(items, locale, Infinity, new Set([itemID])).map((question) => ({ ...question, japaneseAnnotations: annotations })));
}

export function all(itemsJSON: string, locale: Locale): string {
  const items = JSON.parse(itemsJSON) as VocabItem[];
  return JSON.stringify(buildQuestions(items, locale).map(question => {
    const item = items.find(value => value.id === question.itemId);
    return { ...question, japaneseAnnotations: [...(item?.japanese_annotations ?? []), ...(item?.practice_questions ?? []).flatMap(seed => seed.japanese_annotations ?? [])] };
  }));
}
