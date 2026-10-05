import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../lib/api';
import type { Locale } from '../../types';
import './DailySummaryPanel.css';

type Labeled = { label: string; detail: string };
type Summary = {
  date: string; totalQuestions: number; correctCount: number; incorrectCount: number; accuracy: number;
  strengths: Labeled[]; weaknesses: Labeled[];
  confusionGroups: { topic: string; items: string[] }[];
  recommendations: { type: string; title: string; detail: string }[];
  summaryZh: string;
};

const tokyoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export function DailySummaryPanel({ token, locale, date: controlledDate, hideDatePicker = false, hideCardReviews = false }: { token: string; locale: Locale; date?: string; hideDatePicker?: boolean; hideCardReviews?: boolean }) {
  const [selectedDate, setDate] = useState(tokyoToday);
  const date = controlledDate ?? selectedDate;
  const [savedDates, setSavedDates] = useState<string[]>([]);
  const [cardReviews, setCardReviews] = useState<{ totalReviews: number; uniqueCards: number; ratings: Record<string, number> } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const copy = locale === 'ja'
    ? { title: '今日の学習まとめ', empty: 'この日の学習まとめはありません', loading: '読み込み中…', error: '学習まとめを読み込めませんでした', total: '解答', correct: '正解', incorrect: '不正解', accuracy: '正答率', strengths: '得意な点', weaknesses: '今日の弱点', confusion: '混同しやすい項目', recommendations: 'おすすめの復習' }
    : locale === 'en'
      ? { title: 'Daily learning summary', empty: 'No learning summary for this day', loading: 'Loading…', error: 'Could not load the summary', total: 'Answers', correct: 'Correct', incorrect: 'Incorrect', accuracy: 'Accuracy', strengths: 'Strengths', weaknesses: 'Weak points', confusion: 'Confusion groups', recommendations: 'Recommended review' }
      : { title: '今日总结', empty: '当天没有学习总结', loading: '读取中…', error: '无法读取学习总结', total: '题', correct: '正确', incorrect: '错误', accuracy: '正确率', strengths: '强项', weaknesses: '今日弱点', confusion: '易混组', recommendations: '推荐复习' };

  useEffect(() => {
    if (hideDatePicker) return;
    let active = true;
    apiRequest<{ summaries: { date: string }[] }>('/api/daily-summaries', { token })
      .then(({ summaries }) => { if (active) setSavedDates(summaries.map((entry) => entry.date)); })
      .catch(() => { if (active) setSavedDates([]); });
    return () => { active = false; };
  }, [token, hideDatePicker]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setCardReviews(null);
    setError('');
    apiRequest<{ summary: Summary | null; cardReviews: { totalReviews: number; uniqueCards: number; ratings: Record<string, number> } }>(`/api/daily-summaries/${date}`, { token })
      .then(({ summary, cardReviews }) => { if (active) { setSummary(summary); setCardReviews(cardReviews); } })
      .catch(() => { if (active) { setSummary(null); setError(copy.error); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [date, token, copy.error]);

  const dates = useMemo(() => {
    const today = tokyoToday();
    const recent = Array.from({ length: 7 }, (_, index) => {
      const d = new Date(`${today}T00:00:00+09:00`);
      d.setUTCDate(d.getUTCDate() - index);
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    });
    return [...new Set([date, ...recent, ...savedDates])].sort((a, b) => b.localeCompare(a));
  }, [date, savedDates]);

  return <section className="daily-summary-panel" aria-label={copy.title}>
    <header className="daily-summary-header"><h2>{copy.title}</h2>
      {!hideDatePicker ? <label><span className="sr-only">{copy.title}</span><select aria-label={copy.title} value={date} onChange={(event) => setDate(event.target.value)}>
        {dates.map((day) => <option key={day} value={day}>{day}</option>)}
      </select></label> : null}
    </header>
    {!hideCardReviews && !loading && !error && cardReviews && <CardReviewStatistics stats={cardReviews} locale={locale} />}
    {loading ? <p role="status">{copy.loading}</p> : error ? <p role="alert">{error}</p> : !summary ? <p className="daily-summary-empty">{copy.empty}</p> : <>
      <h3>{locale === 'ja' ? '解答成績' : locale === 'en' ? 'Question performance' : '做题成绩'}</h3>
      <dl className="daily-summary-stats">
        <div><dt>{copy.total}</dt><dd>{summary.totalQuestions}</dd></div><div><dt>{copy.correct}</dt><dd>{summary.correctCount}</dd></div>
        <div><dt>{copy.incorrect}</dt><dd>{summary.incorrectCount}</dd></div><div><dt>{copy.accuracy}</dt><dd>{summary.totalQuestions ? `${(summary.accuracy * 100).toFixed(1)}%` : '—'}</dd></div>
      </dl>
      <p className="daily-summary-lead">{summary.summaryZh}</p>
      <div className="daily-summary-sections">
        <SummaryList title={copy.strengths} items={summary.strengths} />
        <SummaryList title={copy.weaknesses} items={summary.weaknesses} />
        {summary.confusionGroups.length > 0 && <section><h3>{copy.confusion}</h3><ul>{summary.confusionGroups.map((group, index) => <li key={`${group.topic}-${index}`}><strong>{group.items.join(' ↔ ')}</strong><p>{group.topic}</p></li>)}</ul></section>}
        {summary.recommendations.length > 0 && <section><h3>{copy.recommendations}</h3><ul>{summary.recommendations.map((item, index) => <li key={`${item.title}-${index}`}><strong>{item.title}</strong><p>{item.detail}</p></li>)}</ul></section>}
      </div>
    </>}
  </section>;
}

function SummaryList({ title, items }: { title: string; items: Labeled[] }) {
  return items.length > 0 ? <section><h3>{title}</h3><ul>{items.map((item, index) => <li key={`${item.label}-${index}`}><strong>{item.label}</strong><p>{item.detail}</p></li>)}</ul></section> : null;
}

type CardReviewStats = { totalReviews: number; uniqueCards: number; ratings: Record<string, number> };
export function CardReviewDailyPanel({ token, date, locale }: { token: string; date: string; locale: Locale }) {
  const [stats, setStats] = useState<CardReviewStats | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true; setStats(null); setError(false);
    apiRequest<{ cardReviews: CardReviewStats }>(`/api/daily-summaries/${date}`, { token })
      .then(result => { if (active) setStats(result.cardReviews); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [token, date]);
  return <div className="daily-summary-panel">{stats ? <CardReviewStatistics stats={stats} locale={locale} /> : <p role={error ? 'alert' : 'status'}>{error ? (locale === 'ja' ? 'カード復習を読み込めませんでした' : locale === 'en' ? 'Could not load card reviews' : '无法读取卡片复习记录') : (locale === 'ja' ? '読み込み中…' : locale === 'en' ? 'Loading…' : '读取中…')}</p>}</div>;
}
function CardReviewStatistics({ stats, locale }: { stats: CardReviewStats; locale: Locale }) {
  return <section><h3>{locale === 'ja' ? 'カード復習' : locale === 'en' ? 'Card reviews' : '卡片复习情况'}</h3><p>{locale === 'ja' ? `${stats.totalReviews} 回・${stats.uniqueCards} 枚` : locale === 'en' ? `${stats.totalReviews} reviews · ${stats.uniqueCards} distinct cards` : `${stats.totalReviews} 次复习 · ${stats.uniqueCards} 张卡片`}</p><dl className="daily-summary-stats">{(['forgot','hard','remembered','easy'] as const).map((rating,i) => <div key={rating}><dt>{(locale === 'ja' ? ['忘れた','難しい','覚えている','簡単'] : locale === 'en' ? ['Forgot','Hard','Remembered','Easy'] : ['忘记','困难','记得','轻松'])[i]}</dt><dd>{stats.ratings[rating]}</dd></div>)}</dl></section>;
}
