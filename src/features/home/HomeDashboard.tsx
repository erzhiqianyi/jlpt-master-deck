import { ArrowRight, Brain, CalendarDays, Check, Clock3, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { localDateString, tasksForDate } from '../../domain/studyPlan';
import type { AppView, DailyPracticeSummary, DraftSummary, Locale, StudyPlanDocument, StudyPlanTaskStatus } from '../../types';

export function HomeDashboard({ username, locale, hasMemoryReview, plan, todayPractices, latestDraft, onOpenDraft, onNavigate, onStartDailyPractice, onCreateDailyPractice, onTaskStatus }: {
  token: string; username: string;
  labels: Record<string, string>; locale: Locale;
  hasMemoryReview: boolean; plan: StudyPlanDocument; todayPractices: DailyPracticeSummary[];
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
  const zh = locale === 'zh-CN'; const ja = locale === 'ja';
  const text = zh ? {
    title: '今日', plan: '今日计划', all: '查看计划', empty: '今天还没有安排任务。', setup: '安排学习计划', minutes: '分钟', done: '已完成', mark: '标为已完成', undo: '恢复待完成', practice: '今日练习', start: '开始练习', prepare: '准备今日练习', reviewDraft: '查看待确认题目', review: '记忆复习', reviewBody: '再看一遍学过的内容，让记忆更牢固。', reviewEmpty: '还没有学习卡片。', library: '学习模块', days: '天', goal: '备考目标', recent: '最近 7 天', study: '学习', full: '完整记录', more: '更多练习', moreBody: '专项、综合与模拟考试', hello: '你好', noActivity: '完成练习后，这里会记录你的学习节奏。'
  } : ja ? {
    title: '今日', plan: '今日の計画', all: '計画を見る', empty: '今日の予定はまだありません。', setup: '計画を立てる', minutes: '分', done: '完了', mark: '完了にする', undo: '未完了に戻す', practice: '今日の練習', start: '練習を始める', prepare: '今日の練習を準備', reviewDraft: '確認待ちの問題を見る', review: '記憶の復習', reviewBody: '学んだ内容を、もう一度振り返りましょう。', reviewEmpty: '学習カードはまだありません。', library: 'ライブラリへ', days: '日', goal: '学習目標', recent: '最近7日間', study: '学習', full: '記録を見る', more: 'ほかの練習', moreBody: 'テーマ別・総合・模擬試験', hello: 'こんにちは', noActivity: '練習を終えると、ここに記録されます。'
  } : {
    title: 'Today', plan: "Today's plan", all: 'View plan', empty: 'Nothing planned for today yet.', setup: 'Make a plan', minutes: 'min', done: 'Done', mark: 'Mark done', undo: 'Mark pending', practice: "Today's practice", start: 'Start practice', prepare: 'Prepare practice', reviewDraft: 'Review pending questions', review: 'Memory review', reviewBody: 'Return to what you have learned and make it stick.', reviewEmpty: 'No learning cards yet.', library: 'Study modules', days: 'days', goal: 'Your goal', recent: 'Last 7 days', study: 'Study', full: 'View history', more: 'More practice', moreBody: 'Topics, mixed practice and mock exams', hello: 'Hello', noActivity: 'Your study rhythm will appear after your first practice.'
  };
  const days = Array.from({length: 7}, (_, index) => { const date = new Date(); date.setDate(date.getDate() - 6 + index); const day = localDateString(date); return { day, label: new Intl.DateTimeFormat(locale, {weekday:'short'}).format(date), minutes: plan.dailySummaries.find(s => s.date === day)?.practiceMinutes ?? 0 }; });
  const total = days.reduce((sum, day) => sum + day.minutes, 0);
  const max = Math.max(1, ...days.map(day => day.minutes));
  const countdown = Math.ceil((new Date(`${plan.profile.examDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
  async function toggle(id: string, done: boolean) { setSaving(id); setError(''); try { await onTaskStatus(id, done ? 'pending' : 'completed'); } catch (error) { setError(error instanceof Error ? error.message : String(error)); } finally { setSaving(''); } }
  return <main className="light-today">
    <header className="light-heading"><p>{new Intl.DateTimeFormat(locale, {month:'long', day:'numeric', weekday:'long'}).format(new Date())} · {text.hello}，{username}</p><h1>{text.title}</h1></header>
    <div className="light-today-grid"><div className="light-main-column">
      <section className="light-panel light-today-plan"><div className="light-section-head"><h2>{text.plan}</h2><button onClick={() => onNavigate('plan')}>{text.all}<ArrowRight size={16}/></button></div>
        <div className="light-plan-progress"><strong>{completed}<span> / {tasks.length}</span></strong><span>{text.done}</span><progress max={tasks.length || 1} value={completed} aria-label={text.plan}/></div>
        {tasks.length ? <ul className="light-task-list">{tasks.slice(0,4).map(task => <li key={task.id} className={task.status === 'completed' ? 'is-done' : ''}><button className="light-task-check" disabled={Boolean(saving)} aria-label={`${task.status === 'completed' ? text.undo : text.mark}: ${task.title}`} aria-pressed={task.status === 'completed'} onClick={() => void toggle(task.id, task.status === 'completed')}>{task.status === 'completed' ? <Check size={17}/> : <span/>}</button><div><strong>{task.title}</strong><small><Clock3 size={13}/>{task.minutes} {text.minutes}{task.status === 'skipped' ? ` · ${zh ? '已跳过' : ja ? 'スキップ' : 'Skipped'}` : ''}</small></div></li>)}</ul> : <div className="light-empty"><p>{text.empty}</p><button onClick={() => onNavigate('plan')}>{text.setup}<ArrowRight size={16}/></button></div>}
        {tasks.length > 4 && <button className="light-text-link" onClick={() => onNavigate('plan')}>{text.all} · {tasks.length}<ChevronRight size={16}/></button>}
        {error && <p role="alert">{error}</p>}
      </section>
      <section className="light-panel light-practice-feature"><span className="light-eyebrow">{text.practice}</span><h2>{practice?.title ?? text.prepare}</h2>{practice && <p>{practice.questionCount} {zh ? '题' : ja ? '問' : 'questions'} · {practice.minutes} {text.minutes}</p>}<button className="light-primary" onClick={() => practice ? onStartDailyPractice(practice.id) : latestDraft ? onOpenDraft(latestDraft.id) : onCreateDailyPractice()}>{practice ? text.start : latestDraft ? text.reviewDraft : text.prepare}<ArrowRight size={17}/></button></section>
      <button className="light-more-row" onClick={() => onNavigate('mixed')}><span><strong>{text.more}</strong><small>{text.moreBody}</small></span><ArrowRight size={20}/></button>
    </div><aside className="light-aside-column">
      <section className="light-panel light-review-panel"><Brain size={28}/><h2>{text.review}</h2>{!hasMemoryReview ? <p>{text.reviewEmpty}</p> : null}<button className="light-primary" onClick={() => onNavigate(hasMemoryReview ? 'memory-review' : 'study')}>{hasMemoryReview ? text.review : text.library}<ArrowRight size={17}/></button></section>
      <section className="light-panel light-week"><div className="light-section-head"><h2>{text.recent}</h2><button aria-label={text.full} onClick={() => onNavigate('history')}><ArrowRight size={16}/></button></div><div className="light-bars">{days.map(day => <div key={day.day}><div className="light-bar-track"><span style={{height:`${day.minutes / max * 100}%`}} title={`${day.day}: ${day.minutes} ${text.minutes}`}/></div><small>{day.label}</small></div>)}</div><p>{total ? `${text.study} ${total} ${text.minutes}` : text.noActivity}</p></section>
      <button className="light-goal" onClick={() => onNavigate('plan')}><CalendarDays size={22}/><span><small>{text.goal} · JLPT {plan.profile.level}</small><strong>{Number.isFinite(countdown) && countdown > 0 ? `${countdown} ${text.days}` : plan.profile.examDate}</strong></span><ChevronRight size={18}/></button>
    </aside></div>
  </main>;
}
