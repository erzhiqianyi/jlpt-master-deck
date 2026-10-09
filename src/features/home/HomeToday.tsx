// ホーム（v3）：今日の練習、期限の来たカード、進行中の練習、この 7 日の学習、練習の入口。データは /api/v3 から読む。
import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CalendarDays, ChevronRight, History, Layers3, NotebookPen } from 'lucide-react';
import type { AppView, Locale, StudyPage } from '../../types';
import { createV3Client } from '../../v3/client';
import type { Attempt, DraftSummary, PracticeSetSummary, StudyOverview } from '../../v3/types';
import { usePageHeaderActions } from '../../components/PageChrome';
import '../library/library.css';
import '../practice/practice.css';
import './HomeToday.css';

type Props = {
  token: string; locale: Locale;
  onNavigate: (view: AppView, page?: StudyPage, itemId?: string) => void; onOpenDraft: (code: string) => void;
};

const TEXT = {
  'zh-CN': { today: '今日', countdown: (d: number) => `距离考试还有 ${d} 天`, examToday: '今天考试', setExam: '设置考试日期', cards: '记忆卡片', cardsLine: (d: number, n: number) => `待复习 ${d} · 新卡 ${n}`,
    review: '开始复习', daily: '今日练习', noDaily: '今天还没有练习。可以让 AI 按你的情况出一份（create_practice_set）。', start: '开始', resume: '继续练习', week: '最近 7 天',
    answers: '答题', ratings: '卡片', streak: (n: number) => `连续 ${n} 天`, accuracy: '正确率', practice: '练习', modules: { vocabulary: '词汇', grammar: '语法', reading: '阅读', listening: '听力' },
    mixed: '综合练习', mock: '模拟考试', history: '练习记录', draft: '待处理的 AI 草稿', plan: '学习计划', questions: (n: number) => `${n} 题` },
  ja: { today: '今日', countdown: (d: number) => `試験まであと ${d} 日`, examToday: '今日は試験日', setExam: '試験日を設定', cards: '記憶カード', cardsLine: (d: number, n: number) => `復習 ${d} · 新規 ${n}`,
    review: '復習を始める', daily: '今日の練習', noDaily: '今日の練習はまだありません。AI に作ってもらえます（create_practice_set）。', start: '始める', resume: '練習を続ける', week: '直近 7 日',
    answers: '解答', ratings: 'カード', streak: (n: number) => `${n} 日連続`, accuracy: '正答率', practice: '練習', modules: { vocabulary: '語彙', grammar: '文法', reading: '読解', listening: '聴解' },
    mixed: '総合練習', mock: '模擬試験', history: '練習の記録', draft: '未処理の AI 下書き', plan: '学習計画', questions: (n: number) => `${n} 問` },
  en: { today: 'Today', countdown: (d: number) => `${d} days until the exam`, examToday: 'Exam day', setExam: 'Set exam date', cards: 'Memory cards', cardsLine: (d: number, n: number) => `${d} due · ${n} new`,
    review: 'Start review', daily: "Today's practice", noDaily: 'No practice for today yet. Your AI can write one (create_practice_set).', start: 'Start', resume: 'Continue practice', week: 'Last 7 days',
    answers: 'Answers', ratings: 'Cards', streak: (n: number) => `${n}-day streak`, accuracy: 'Accuracy', practice: 'Practice', modules: { vocabulary: 'Vocabulary', grammar: 'Grammar', reading: 'Reading', listening: 'Listening' },
    mixed: 'Mixed practice', mock: 'Mock exams', history: 'History', draft: 'AI drafts to handle', plan: 'Study plan', questions: (n: number) => `${n} questions` },
} as const;

export function HomeToday({ token, locale, onNavigate, onOpenDraft }: Props) {
  const client = useMemo(() => createV3Client(token), [token]);
  const t = TEXT[locale];
  const [stats, setStats] = useState<StudyOverview | null>(null);
  const [cards, setCards] = useState<{ due: number; new: number } | null>(null);
  const [daily, setDaily] = useState<PracticeSetSummary[]>([]);
  const [active, setActive] = useState<Attempt | null>(null);
  const [examDate, setExamDate] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  usePageHeaderActions([{ key: 'plan', label: t.plan, icon: <CalendarDays size={22} />, onClick: () => onNavigate('plan') }]);
  useEffect(() => {
    client.stats({ days: 7 }).then((s) => {
      setStats(s);
      client.practiceSets({ kind: 'daily', date: s.today }).then((r) => setDaily(r.items)).catch(() => undefined);
    }).catch(() => undefined);
    client.dueCards({ limit: 1, newLimit: 0 }).then((r) => setCards({ due: r.due, new: r.new })).catch(() => undefined);
    client.activeAttempt().then(setActive).catch(() => undefined);
    client.plan().then((plan) => setExamDate(plan.profile?.examDate ?? null)).catch(() => undefined);
    client.drafts().then((list) => setDrafts(list.filter((d) => d.status === 'draft' || d.status === 'needs_revision' || d.status === 'approved'))).catch(() => undefined);
  }, [client]);
  const start = async (practice: string) => { const attempt = await client.startAttempt({ practice, kind: 'daily' }); onNavigate('daily-practice', 'questions', attempt.code); };

  const latestDraft = drafts[0];
  const pendingDraftCount = drafts.length;
  const today = stats?.today ?? new Date().toISOString().slice(0, 10);
  const examDays = examDate ? Math.round((Date.parse(`${examDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000) : null;
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.parse(`${today}T00:00:00Z`) - (6 - i) * 86400000).toISOString().slice(0, 10);
    return stats?.daily.find((d) => d.date === date) ?? { date, answered: 0, correct: 0, ratings: 0 };
  });
  const max = Math.max(1, ...week.map((d) => d.answered + d.ratings));
  return (
    <section className="library home-today">
      <header className="library-header">
        <div><h1>{t.today}</h1><p>{examDays == null ? '' : examDays > 0 ? t.countdown(examDays) : examDays === 0 ? t.examToday : ''}{stats ? ` · ${t.streak(stats.streak)}` : ''}</p></div>
        {examDays == null ? <button type="button" onClick={() => onNavigate('plan')}>{t.setExam}</button> : null}
      </header>

      {active && !active.completedAt ? (
        <button type="button" className="practice-resume" onClick={() => onNavigate(active.kind === 'daily' ? 'daily-practice' : 'mixed', 'questions', active.code)}>
          {t.resume} · {active.code} · {active.summary.answered}/{active.summary.total}
        </button>
      ) : null}

      <div className="home-today-grid">
        <section className="library-section home-card">
          <h2>{t.cards}</h2>
          <p className="home-big">{cards ? cards.due : '…'}</p>
          <p className="library-muted">{cards ? t.cardsLine(cards.due, cards.new) : ''}</p>
          <button type="button" className="library-button" onClick={() => onNavigate('memory-review')}>{t.review}</button>
        </section>
        <section className="library-section home-card">
          <h2>{t.daily}</h2>
          {daily.length ? daily.map((s) => (
            <div key={s.code} className="home-daily-row">
              <span><strong>{s.title?.text ?? s.code}</strong><small className="library-muted"> · {t.questions(s.questionCount)}</small></span>
              <button type="button" className="library-button" onClick={() => void start(s.code)}>{t.start}</button>
            </div>
          )) : <p className="library-muted">{t.noDaily}</p>}
        </section>
        <section className="library-section home-card">
          <h2>{t.week}</h2>
          <div className="stats-bars home-week">{week.map((d) => <span key={d.date} title={`${d.date} · ${d.answered} / ${d.ratings}`} style={{ height: `${Math.max(2, Math.round(((d.answered + d.ratings) / max) * 100))}%` }} />)}</div>
          <p className="library-muted">{t.answers} {week.reduce((n, d) => n + d.answered, 0)} · {t.ratings} {week.reduce((n, d) => n + d.ratings, 0)}{stats?.totals.accuracy != null ? ` · ${t.accuracy} ${stats.totals.accuracy}%` : ''}</p>
        </section>
      </div>

      <section className="library-section">
        <h2>{t.practice}</h2>
        <div className="home-entries">
          {(['vocabulary', 'grammar', 'reading', 'listening'] as const).map((m) => (
            <button key={m} type="button" onClick={() => onNavigate(m, 'questions')}><BookOpen size={18} aria-hidden="true" />{t.modules[m]}<ChevronRight size={16} aria-hidden="true" /></button>
          ))}
          <button type="button" onClick={() => onNavigate('mixed', 'questions')}><Layers3 size={18} aria-hidden="true" />{t.mixed}<ChevronRight size={16} aria-hidden="true" /></button>
          <button type="button" onClick={() => onNavigate('mock-exams')}><NotebookPen size={18} aria-hidden="true" />{t.mock}<ChevronRight size={16} aria-hidden="true" /></button>
          <button type="button" onClick={() => onNavigate('history')}><History size={18} aria-hidden="true" />{t.history}<ChevronRight size={16} aria-hidden="true" /></button>
        </div>
      </section>

      {latestDraft || pendingDraftCount ? (
        <section className="library-section">
          <h2>{t.draft}（{pendingDraftCount}）</h2>
          {latestDraft ? <button type="button" className="practice-link" onClick={() => onOpenDraft(latestDraft.code)}>{latestDraft.title?.text ?? latestDraft.code}</button> : null}
        </section>
      ) : null}
    </section>
  );
}
