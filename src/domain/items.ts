import type { Locale, LocalizedText, VocabItem } from '../types';

export function localized(item: VocabItem, locale: Locale, key: keyof LocalizedText) {
  return item.localizations?.[locale]?.[key];
}

export function itemMeaning(item: VocabItem, locale: Locale) {
  return localized(item, locale, 'meaning') ?? item.meaning_zh;
}

export function itemMemory(item: VocabItem, locale: Locale) {
  return localized(item, locale, 'core_memory') ?? item.core_memory;
}

export function itemExplanation(item: VocabItem, locale: Locale) {
  return localized(item, locale, 'explanation') ?? item.explanation_zh;
}

/** Pattern texts and pattern example sentences, for search and question contexts. */
export function itemPatternTexts(item: VocabItem) {
  return (item.patterns ?? []).flatMap((entry) => [entry.pattern, entry.example]).map((value) => value?.trim() ?? '').filter(Boolean);
}

/** The reading, unless it only repeats the entry (kana grammar such as たとたん（に） / たとたんに). */
export function distinctReading(item: VocabItem) {
  const reading = item.reading?.trim() ?? '';
  const bare = (value: string) => value.replace(/[\s（）()〜~～・]/gu, '');
  return reading && bare(reading) !== bare(item.original) ? reading : '';
}
