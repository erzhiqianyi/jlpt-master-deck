// 学習の統計（v3）：正答率、日ごとの解答と自己評価、知識項目の状態、連続日数。すべて解答と評価から数えたもの。
import { useEffect, useMemo, useState } from 'react';
import type { Locale } from '../../types';
import { createV3Client } from '../../v3/client';
import type { StudyOverview } from '../../v3/types';
import { practiceText } from './practiceText';
import '../library/library.css';
import './practice.css';

type Links = { onOpenCards?: () => void; onOpenMistakes?: () => void; onOpenHistory?: () => void; onOpenReports?: () => void; onOpenInbox?: () => void };

export function StudyStats({ token, locale, onOpenCards, onOpenMistakes, onOpenHistory, onOpenReports, onOpenInbox }: { token: string; locale: Locale } & Links) {
  const client = useMemo(() => createV3Client(token), [token]);
  const t = practiceText(locale);
  const [stats, setStats] = useState<StudyOverview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { client.stats({ days: 30 }).then(setStats).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))); }, [client]);
  if (!stats) return <section className="library"><p className={error ? 'library-error' : 'library-empty'}>{error || t.loading}</p></section>;
  const max = Math.max(1, ...stats.daily.map((d) => d.answered + d.ratings));
  return (
    <section className="library">
      <header className="library-header"><div><h1>{t.stats}</h1><p>{t.streak(stats.streak)}</p></div>
        <div className="library-row-actions">
          {onOpenCards ? <button type="button" className="library-button" onClick={onOpenCards}>{t.cards}（{stats.knowledge.due}）</button> : null}
          {onOpenMistakes ? <button type="button" onClick={onOpenMistakes}>{t.mistakes}</button> : null}
          {onOpenHistory ? <button type="button" onClick={onOpenHistory}>{t.history}</button> : null}
          {onOpenReports ? <button type="button" onClick={onOpenReports}>{t.reports}</button> : null}
          {onOpenInbox ? <button type="button" onClick={onOpenInbox}>{t.inbox}</button> : null}
        </div>
      </header>
      <dl className="stats-tiles">
        <div><dt>{t.accuracy}</dt><dd>{stats.totals.accuracy == null ? '—' : `${stats.totals.accuracy}%`}</dd></div>
        <div><dt>{t.answered}</dt><dd>{stats.totals.answered}</dd></div>
        <div><dt>{t.ratings}</dt><dd>{stats.totals.ratings}</dd></div>
        <div><dt>{t.today}</dt><dd>{stats.todayActivity.answered + stats.todayActivity.ratings}</dd></div>
      </dl>
      <section className="library-section">
        <h2>{t.knowledgeStates}</h2>
        <dl className="library-stats">{(['new', 'learning', 'review', 'mastered', 'due'] as const).map((k) => <div key={k}><dt>{t.states[k]}</dt><dd>{stats.knowledge[k]}</dd></div>)}</dl>
      </section>
      <section className="library-section">
        <h2>{t.last30}</h2>
        <div className="stats-bars" role="img" aria-label={t.last30}>
          {stats.daily.map((d) => <span key={d.date} title={`${d.date} · ${d.answered} / ${d.ratings}`} style={{ height: `${Math.round(((d.answered + d.ratings) / max) * 100)}%` }} />)}
        </div>
      </section>
      <section className="library-section">
        <h2>{t.byType}</h2>
        <table className="library-conjugations">
          <tbody>{stats.byType.map((r) => <tr key={r.typeId}><th scope="row" lang="ja">{r.labelJa}</th><td>{r.correct}/{r.scored}</td><td>{r.accuracy == null ? '—' : `${r.accuracy}%`}</td></tr>)}</tbody>
        </table>
      </section>
    </section>
  );
}
