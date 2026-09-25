import type { ConjugationForm, VocabItem } from '../types';

/** Explicit readings win; infer only an unchanged written stem with kana endings. */
export function conjugationReading(item: VocabItem, entry: ConjugationForm): string | undefined {
  if (entry.reading?.trim()) return entry.reading.trim();
  const annotated = item.ruby_terms?.find((term) => term.text === entry.form);
  if (annotated) return annotated.reading;
  if (entry.form === item.original) return item.reading;
  if (item.inflection_class === 'kuru') return undefined;
  const base = item.base_form || item.original;
  if (base !== item.original || !item.reading) return undefined;
  const match = base.match(/^(.*[\p{Script=Han}々])([ぁ-ゖー]*)$/u);
  if (!match) return undefined;
  const [, stem, suffix] = match;
  if (!entry.form.startsWith(stem) || !item.reading.endsWith(suffix)) return undefined;
  const ending = entry.form.slice(stem.length);
  if (!/^[ぁ-ゖー]*$/u.test(ending)) return undefined;
  return (suffix ? item.reading.slice(0, -suffix.length) : item.reading) + ending;
}
