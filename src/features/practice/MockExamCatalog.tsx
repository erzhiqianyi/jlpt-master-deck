import { useEffect, useState } from 'react';
import { LearningCatalog } from '../../components/LearningCatalog';
import { LearningListRow } from '../../components/LearningList';
import { apiRequest } from '../../lib/api';
import type { LocalMockExamManifest, Locale, NewsCycleCatalogData } from '../../types';
import type { ExamSummary } from './mockExamTypes';

type Entry = { id: string; title: string; description: string; status: string };
const copy = {
  'zh-CN': { title: '模拟考试', notice: '内容和安排由你设计。可整套作答，也可拆成多次小测。', loading: '正在读取试卷…', empty: '还没有试卷。可让助手或定时任务通过 MCP 创建。', parts: '部分', questions: '题', legacy: '已有试卷', imported: '原新闻内容', failed: '部分试卷未能读取，请重试或连接对应的本地后端。', retry: '重试' },
  ja: { title: '模擬試験', notice: '内容と予定は自由に設計できます。一括でも、複数回に分けても受験できます。', loading: '読み込み中…', empty: '試験はありません。アシスタントや定期タスクから MCP で作成できます。', parts: 'パート', questions: '問', legacy: '既存の試験', imported: '旧ニュース教材', failed: '一部を読み込めません。再試行するかローカルサーバーに接続してください。', retry: '再試行' },
  en: { title: 'Mock exams', notice: 'Design your own content and schedule. Take a full paper or split it into sessions.', loading: 'Loading exams…', empty: 'No exams yet. Ask an assistant or scheduled task to create one through MCP.', parts: 'sessions', questions: 'questions', legacy: 'Existing paper', imported: 'Previous news content', failed: 'Some exams could not be loaded. Retry or connect to their local backend.', retry: 'Retry' },
};
export function MockExamCatalog({ locale, token, onOpen }: { locale: Locale; token: string; onOpen: (id: string) => void }) {
  const t = copy[locale];
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setEntries(null); setFailed(false);
    Promise.allSettled([
      apiRequest<{ exams: ExamSummary[] }>('/api/mock-exams', { token }).then(({ exams }) => exams.map(exam => ({ id: `custom:${exam.id}`, title: exam.title, description: `${exam.sessions.length} ${t.parts} · ${exam.sessions.reduce((sum, part) => sum + part.questionCount, 0)} ${t.questions}`, status: exam.level ?? '' }))),
      apiRequest<NewsCycleCatalogData>('/api/local-news-cycles', { token }).then(({ cycles }) => cycles.map(cycle => ({ id: `week:${cycle.id}`, title: cycle.id, description: `${cycle.range ? `${cycle.range.from} – ${cycle.range.to} · ` : ''}${cycle.totalQuestions} ${t.questions}`, status: t.imported }))),
      apiRequest<LocalMockExamManifest>('/api/local-mock-exams', { token }).then(({ exams }) => exams.map(exam => ({ id: exam.id, title: locale === 'ja' ? exam.titleJa : exam.title, description: `${exam.questionCount} ${t.questions}`, status: exam.level || t.legacy }))),
    ]).then(results => {
      if (cancelled) return;
      setFailed(results.some(result => result.status === 'rejected'));
      setEntries(results.flatMap(result => result.status === 'fulfilled' ? result.value : []));
    });
    return () => { cancelled = true; };
  }, [token, locale, retry, t]);
  if (!entries) return <p role="status">{t.loading}</p>;
  return <LearningCatalog title={t.title} locale={locale} items={entries} searchText={entry => `${entry.title} ${entry.description} ${entry.status}`}
    notice={<>{t.notice}{failed ? <p role="alert">{t.failed} <button type="button" className="gentle-direct-link" onClick={() => setRetry(value => value + 1)}>{t.retry}</button></p> : null}{!entries.length && !failed ? <p>{t.empty}</p> : null}</>}
    columnLabels={locale === 'ja' ? ['試験', '構成', null] : locale === 'en' ? ['Exam', 'Contents', null] : ['试卷', '内容安排', null]}
    renderRow={entry => <LearningListRow key={entry.id} title={entry.title} description={entry.description} status={entry.status} locale={locale} onOpen={() => onOpen(entry.id)} />} />;
}
