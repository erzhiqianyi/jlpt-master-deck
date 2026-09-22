import { LearningCatalog } from '../../components/LearningCatalog';
import { LearningList, LearningListRow } from '../../components/LearningList';
import { ChevronLeft, ChevronRight, Clock3, Headphones, LoaderCircle, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LocalMockExamManifest, LocalMockExamSummary, Locale } from '../../types';

const MOCK_EXAM_PAGE_SIZE = 20;

const copy = {
  'zh-CN': { title: '模拟试题', subtitle: 'N1 - N5 · 两套完整试卷', notice: '外部 Agent 写回练习题 · 非官方真题 · 未人工审校 · 系统合成听力', loading: '正在读取本地试卷目录...', unavailable: '本地试卷目录无法读取。请确认本地后端正在运行。', questions: '题', minutes: '分钟', audio: '听力', open: '打开', total: '套试卷', exam: '试卷', level: '级别', duration: '时长', prev: '上一页', next: '下一页', noMore: '没有更多了' },
  ja: { title: '模擬試験', subtitle: 'N1 - N5 · 2回分の一式試験', notice: 'AI オリジナル練習 · 公式問題ではありません · 未校閲 · 合成音声', loading: 'ローカル試験一覧を読み込んでいます...', unavailable: 'ローカル試験一覧を読み込めません。ローカルサーバーを確認してください。', questions: '問', minutes: '分', audio: '聴解', open: '開く', total: '回分', exam: '試験', level: '級', duration: '時間', prev: '前へ', next: '次へ', noMore: 'これ以上ありません' },
  en: { title: 'Mock exams', subtitle: 'N1 - N5 · Two full papers', notice: 'AI-original practice · Not official papers · Not human-reviewed · Synthesized listening', loading: 'Loading the local exam catalog...', unavailable: 'The local exam catalog could not be loaded. Check the local backend.', questions: 'questions', minutes: 'minutes', audio: 'listening', open: 'Open', total: 'papers', exam: 'Paper', level: 'Level', duration: 'Duration', prev: 'Previous page', next: 'Next page', noMore: 'No more items' },
} satisfies Record<Locale, Record<string, string>>;

export function MockExamCatalog({ locale, onOpen }: { locale: Locale; onOpen: (examId: string) => void }) {
  const t = copy[locale];
  const [manifest, setManifest] = useState<LocalMockExamManifest | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    fetch('/api/local-mock-exams').then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<LocalMockExamManifest>;
    }).then((payload) => { if (!cancelled) setManifest(payload); }).catch(() => { if (!cancelled) setError(t.unavailable); });
    return () => { cancelled = true; };
  }, [t.unavailable]);
  const exams = useMemo(() => manifest?.exams ?? [], [manifest]);
  return <section className="mx-auto w-full max-w-5xl py-1 md:py-4">
    {!manifest ? <p role="status">{error || t.loading}</p> : <LearningCatalog columnLabels={locale === "ja" ? ["模擬試験", "問題数・時間", "レベル"] : locale === "en" ? ["Exam", "Questions / duration", "Level"] : ["试卷", "题数与时长", "等级"]} title={t.title} items={exams} locale={locale} notice={t.notice} searchText={(exam) => `${exam.title} ${exam.titleJa} ${exam.level}`} renderRow={(exam) => <LearningListRow key={exam.id} title={locale === 'ja' ? exam.titleJa : exam.title} description={`${exam.questionCount} ${t.questions} · ${exam.totalDurationMinutes} ${t.minutes}`} status={exam.level} locale={locale} onOpen={() => onOpen(exam.id)}/>}/>}
  </section>;
}
