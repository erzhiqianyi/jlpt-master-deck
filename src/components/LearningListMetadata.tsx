import type { ReactNode } from 'react';
import type { Locale } from '../types';

export function formatListDate(value: string | undefined, fallback: string, locale: Locale, monthDayOnly = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return fallback;
  // Date-only legacy records should not imply a recorded time of day.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return <time dateTime={value}>{new Intl.DateTimeFormat(locale, {
    ...(monthDayOnly ? { month: 'numeric' as const, day: 'numeric' as const } : { dateStyle: 'medium' as const, ...(dateOnly ? {} : { timeStyle: 'short' as const }) }),
  }).format(new Date(dateOnly ? `${value}T00:00:00` : value))}</time>;
}

export function LearningListMetadata({ locale, addedAt, collectionLabel, collection, nextReviewAt, showPartOfSpeech = false, partOfSpeech }: {
  locale: Locale;
  addedAt?: string;
  collectionLabel: string;
  collection: ReactNode;
  nextReviewAt?: string;
  showPartOfSpeech?: boolean;
  partOfSpeech?: string;
}) {
  const text = locale === 'ja'
    ? { added: '追加日時', next: '次回の復習', unscheduled: '未設定', unknown: '記録なし' }
    : locale === 'en'
      ? { added: 'Added', next: 'Next review', unscheduled: 'Not scheduled', unknown: 'Not recorded' }
      : { added: '添加时间', next: '下次复习时间', unscheduled: '未安排', unknown: '未记录' };
  return <>
    {showPartOfSpeech ? <span className="list-part-of-speech"><span className="list-metadata-label">{locale === 'ja' ? '品詞' : locale === 'en' ? 'Part of speech' : '词性'}</span><span>{partOfSpeech?.trim() || '—'}</span></span> : null}
    <span><span className="list-metadata-label">{text.added}</span><span>{formatListDate(addedAt, text.unknown, locale, true)}</span></span>
    <span><span className="list-metadata-label">{collectionLabel}</span><span>{collection}</span></span>
    <span><span className="list-metadata-label">{text.next}</span><span>{formatListDate(nextReviewAt, text.unscheduled, locale)}</span></span>
  </>;
}

export function LearningListColumns({ locale, title, collectionLabel, showPartOfSpeech = false }: {
  locale: Locale; title: string; collectionLabel: string; showPartOfSpeech?: boolean;
}) {
  return <div className={`list-column-header${showPartOfSpeech ? ' vocabulary-column-header' : ''}`} aria-hidden="true">
    <span>{title}</span><span className="list-column-metadata">
      {showPartOfSpeech ? <span className="list-part-of-speech">{locale === 'ja' ? '品詞' : locale === 'en' ? 'Part of speech' : '词性'}</span> : null}
      <span>{locale === 'ja' ? '追加日時' : locale === 'en' ? 'Added' : '添加时间'}</span>
      <span>{collectionLabel}</span>
      <span>{locale === 'ja' ? '次回の復習' : locale === 'en' ? 'Next review' : '下次复习'}</span>
    </span>
  </div>;
}
