import { ArrowRight, BookOpen, CalendarDays, Check, ChevronRight, Clock3 } from 'lucide-react';
import { useState } from 'react';
import { localDateString, tasksForDate } from '../../domain/studyPlan';
import type { AnswerState, AppView, DailyPracticeSummary, DraftSummary, Locale, Question, StudyPlanDocument, StudyPlanTaskStatus, VocabItem } from '../../types';
import './HomeDashboard.css';

export function HomeDashboard({ locale, dueItems, plan, todayPractices, dailyAnswers = {}, latestDraft, onOpenDraft, onNavigate, onStartDailyPractice, onCreateDailyPractice, onTaskStatus }: {
  token: string; username: string;
  labels: Record<string, string>; locale: Locale;
  dueItems: VocabItem[]; onOpenReviewItem: (item: VocabItem) => void; plan: StudyPlanDocument;
  todayPractices: Array<DailyPracticeSummary & { questions?: Question[] }>; dailyAnswers?: AnswerState;
  latestDraft?: DraftSummary; onOpenDraft: (id: string) => void;
  onNavigate: (view: AppView) => void; onStartDailyPractice: (id?: string) => void; onCreateDailyPractice: () => void;
  onOpenPracticeHistory: () => void;
  onStartMock: () => void; onTaskStatus: (id: string, status: StudyPlanTaskStatus) => void | Promise<void>;
}) {
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const today = localDateString(new Date());
  const tasks = tasksForDate(plan.tasks, today);
  const completed = tasks.filter(task => task.status === 'completed').length;
  const practice = todayPractices[0];
  const answered = practice?.questions?.filter(question => Boolean(dailyAnswers[question.id])).length ?? 0;
  const total = practice?.questions?.length ?? practice?.questionCount ?? 0;
  const complete = total > 0 && answered === total;
  const text = locale === 'zh-CN' ? {
    title: '今日', plan: '今日计划', all: '查看计划', empty: '今天尚未安排任务', setup: '安排', minutes: '分钟', done: '已完成', mark: '标为已完成', undo: '恢复待完成', practice: '今日练习', start: '开始练习', resume: '继续练习', open: '查看练习', prepare: '准备今日练习', confirm: '确认今日题目', reviewDraft: '查看待确认题目', review: '记忆复习', reviewCount: (count: number) => `${count} 项待复习`, questions: '题', skipped: '已跳过'
  } : locale === 'ja' ? {
    title: '今日', plan: '今日の計画', all: '計画を見る', empty: '今日の予定はまだありません', setup: '予定を追加', minutes: '分', done: '完了', mark: '完了にする', undo: '未完了に戻す', practice: '今日の練習', start: '練習を始める', resume: '練習を続ける', open: '練習を見る', prepare: '今日の練習を準備', confirm: '今日の問題を確認', reviewDraft: '確認待ちの問題を見る', review: '記憶の復習', reviewCount: (count: number) => `復習待ち ${count} 件`, questions: '問', skipped: 'スキップ'
  } : {
    title: 'Today', plan: "Today's plan", all: 'View plan', empty: 'Nothing planned for today', setup: 'Plan', minutes: 'min', done: 'completed', mark: 'Mark done', undo: 'Mark pending', practice: "Today's practice", start: 'Start practice', resume: 'Continue practice', open: 'View practice', prepare: 'Prepare today’s practice', confirm: 'Confirm today’s questions', reviewDraft: 'Review pending questions', review: 'Memory review', reviewCount: (count: number) => `${count} items due`, questions: 'questions', skipped: 'Skipped'
  };

  async function toggle(id: string, done: boolean) {
    setSaving(id);
    setError('');
    try { await onTaskStatus(id, done ? 'pending' : 'completed'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(''); }
  }

  return <main className="primary-today" aria-label={text.title}>
    <p className="primary-today-date"><time dateTime={today}>{new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</time></p>
    <section className="primary-daily-task" aria-labelledby="primary-daily-title">
      <h2 id="primary-daily-title">{practice?.title || (latestDraft ? text.confirm : text.prepare)}</h2>
      {practice ? <p className="primary-daily-meta">{total} {text.questions}{practice.minutes > 0 ? ` · ${practice.minutes} ${text.minutes}` : ''}{answered > 0 ? ` · ${answered} / ${total} ${text.done}` : ''}</p> : null}
      <button type="button" className="primary-daily-action" onClick={() => practice ? onStartDailyPractice(practice.id) : latestDraft ? onOpenDraft(latestDraft.id) : onCreateDailyPractice()}>
        {practice ? complete ? text.open : answered > 0 ? text.resume : text.start : latestDraft ? text.reviewDraft : text.prepare}<ArrowRight size={21} aria-hidden="true" />
      </button>
    </section>

    <button type="button" className="primary-navigation-row primary-review-entry" onClick={() => onNavigate(dueItems.length ? 'memory-review' : 'memory')}>
      <BookOpen className="primary-entry-icon" size={29} aria-hidden="true" />
      <span className="primary-entry-copy"><strong>{text.review}</strong><small>{text.reviewCount(dueItems.length)}</small></span>
      <ChevronRight className="primary-entry-chevron" size={21} aria-hidden="true" />
    </button>

    <section className="primary-plan-section" aria-labelledby="primary-plan-title">
      <button type="button" className="primary-navigation-row primary-plan-entry" onClick={() => onNavigate('plan')}>
        <CalendarDays className="primary-entry-icon" size={29} aria-hidden="true" />
        <span className="primary-entry-copy"><strong id="primary-plan-title">{text.plan}</strong><small>{tasks.length ? `${completed} / ${tasks.length} ${text.done}` : text.empty}</small></span>
        <span className="primary-plan-action">{tasks.length ? text.all : text.setup}<ChevronRight size={19} aria-hidden="true" /></span>
      </button>
      {tasks.length ? <ul className="primary-today-tasks">{tasks.slice(0, 4).map(task => <li key={task.id} className={task.status === 'completed' ? 'is-done' : undefined}>
        <button type="button" className="primary-task-check" disabled={Boolean(saving)} aria-label={`${task.status === 'completed' ? text.undo : text.mark}: ${task.title}`} aria-pressed={task.status === 'completed'} onClick={() => void toggle(task.id, task.status === 'completed')}>{task.status === 'completed' ? <Check size={17} aria-hidden="true" /> : <span />}</button>
        <div><strong>{task.title}</strong><small><Clock3 size={13} aria-hidden="true" />{task.minutes} {text.minutes}{task.status === 'skipped' ? ` · ${text.skipped}` : ''}</small></div>
      </li>)}</ul> : null}
      {error ? <p className="primary-task-error" role="alert">{error}</p> : null}
    </section>
  </main>;
}
