import { ArrowRight, Bot, ChevronRight, CircleCheck, Play, Brain, CalendarDays, ListChecks, Sparkles, UserRound } from 'lucide-react';
import { aiCapabilities } from '../../data/aiCapabilities';
import { useMemo } from 'react';
import './HomeDashboard.css';
import { HomeDiscovery } from './HomeDiscovery';
import { LearningStatusIcon } from '../../components/LearningStatusIcon';
import { localDateString, tasksForDate } from '../../domain/studyPlan';
import type { AppView, DailyPracticeSummary, DraftSummary, Locale, StudyPlanDocument, StudyPlanMaterial, StudyPlanTask, StudyPlanTaskStatus } from '../../types';

export function HomeDashboard({ token, username, locale, hasMemoryReview, plan, todayPractices, latestDraft, onOpenDraft, onNavigate, onStartDailyPractice, onCreateDailyPractice }: {
  token: string; username: string;
  labels: Record<string, string>; locale: Locale;
  hasMemoryReview: boolean; plan: StudyPlanDocument; todayPractices: DailyPracticeSummary[];
  latestDraft?: DraftSummary; onOpenDraft: (id: string) => void;
  onNavigate: (view: AppView) => void; onStartDailyPractice: (id?: string) => void; onCreateDailyPractice: () => void;
  onOpenPracticeHistory: () => void;
  onStartMock: () => void; onTaskStatus: (id: string, status: StudyPlanTaskStatus) => void | Promise<void>;
}) {
  const today = localDateString(new Date());
  const todayTasks = useMemo(() => tasksForDate(plan.tasks, today), [plan.tasks, today]);
  const textbookTasks = useMemo(
    () => todayTasks.filter((task) => task.materialId || plan.profile.materials.some((material) => taskMatchesMaterial(task, material))),
    [plan.profile.materials, todayTasks],
  );
  const textbookCompleted = textbookTasks.filter((task) => task.status === 'completed').length;
  const completed = todayTasks.filter((task) => task.status === 'completed').length;
  const skipped = todayTasks.filter((task) => task.status === 'skipped').length;
  const dateLabel = new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
  const examCountdown = daysUntil(plan.profile.examDate);
  const examDateLabel = formatShortDate(plan.profile.examDate, locale);
  const practice = todayPractices[0];
  const copy = locale === 'ja' ? {
    planProgress: '今日の計画の進捗', plan: '今日の計画', completed: '完了', items: '件', progress: '今日の達成状況', noTasks: '今日のタスクはありません', skipped: 'スキップ済み',
    countdown: 'JLPT までの日数', untilExam: 'JLPT', remaining: 'あと', days: '日', examToday: '試験当日', examEnded: '試験は終了しました',
    startLearning: '学習を始める', dailyPractice: '今日の練習', prepareTitle: '今日の練習問題を用意する', draftReady: '新しい問題ができました。内容を確認してから始めましょう。', practiceMeta: (count: number, minutes: number) => `${count} 問 · 約 ${minutes} 分`, prepareHint: '問題を用意して、今日の学習を始めましょう。', viewDraft: '新しい問題を見る', startPractice: '練習を始める', preparePractice: '今日の練習を準備',
    reviewCards: '復習カード', reviewAvailable: '学んだ内容をカードで振り返る', reviewDone: '今日の復習は完了しました。もう一度確認できます', textbookPlan: '今日の教材計画', textbookProgress: '教材の進捗', noTextbookTasks: '今日の教材タスクはありません', viewTextbook: '教材のタスクを見る',
  } : locale === 'en' ? {
    planProgress: "Today's plan progress", plan: "Today's plan", completed: 'Completed', items: 'items', progress: "Today's progress", noTasks: 'No tasks planned today', skipped: 'Skipped',
    countdown: 'JLPT countdown', untilExam: 'Until JLPT', remaining: '', days: 'days left', examToday: 'Exam day', examEnded: 'Exam finished',
    startLearning: 'Start studying', dailyPractice: "Today's practice", prepareTitle: 'Prepare a practice set for today', draftReady: 'New questions are ready. Review them before starting.', practiceMeta: (count: number, minutes: number) => `${count} questions · about ${minutes} minutes`, prepareHint: 'Prepare questions and start studying.', viewDraft: 'View new questions', startPractice: 'Start practice', preparePractice: 'Prepare practice',
    reviewCards: 'Review cards', reviewAvailable: 'Review what you have learned', reviewDone: 'All caught up. You can review again', textbookPlan: "Today's textbook plan", textbookProgress: 'Textbook progress', noTextbookTasks: 'No textbook tasks today', viewTextbook: 'View textbook tasks',
  } : {
    planProgress: '今日计划进度', plan: '今日计划', completed: '已完成', items: '项', progress: '今日完成进度', noTasks: '今天还没有安排任务', skipped: '已跳过',
    countdown: 'JLPT 倒计时', untilExam: '距 JLPT', remaining: '还有', days: '天', examToday: '就是今天', examEnded: '考试已结束',
    startLearning: '开始学习', dailyPractice: '今日练习', prepareTitle: '给今天准备一组练习', draftReady: '新题目已准备好，先看看内容再开始。', practiceMeta: (count: number, minutes: number) => `${count} 题 · 约 ${minutes} 分钟`, prepareHint: '准备好题目，开始今天的学习。', viewDraft: '查看新题目', startPractice: '开始练习', preparePractice: '准备今日练习',
    reviewCards: '复习卡片', reviewAvailable: '翻一翻，记住学过的内容', reviewDone: '今天复习完了，也可以再看看', textbookPlan: '今日教材计划', textbookProgress: '教材完成进度', noTextbookTasks: '今天没有教材任务', viewTextbook: '查看教材任务',
  };
  const practiceTitle = latestDraft?.title || practice?.title || copy.prepareTitle;
  const practiceAction = latestDraft ? () => onOpenDraft(latestDraft.id)
    : practice ? () => onStartDailyPractice(practice.id) : onCreateDailyPractice;
  const greeting = greetingFor(new Date().getHours(), locale);
  return (
    <main className="gentle-home">
      <div className="today-dashboard">
        <a href="#/profile" className="today-welcome" aria-label={`${greeting}，${username}`}>
          <span className="today-welcome-avatar" aria-hidden="true"><UserRound size={22} /></span>
          <span className="today-welcome-text"><span>{greeting}</span><strong>{username}</strong></span>
          <ChevronRight size={18} aria-hidden="true" className="today-welcome-chevron" />
        </a>
        <header className="today-summary">
          <section className="today-progress" aria-label={copy.planProgress}>
            <p className="today-date">{dateLabel}</p>
            <div className="today-progress-label"><strong>{copy.plan}</strong><span aria-label={`${copy.completed} ${completed} / ${todayTasks.length} ${copy.items}`} title={copy.progress}>{todayTasks.length ? <><CircleCheck size={16} aria-hidden="true"/>{completed} / {todayTasks.length}</> : copy.noTasks}</span></div>
            <progress max={todayTasks.length || 1} value={completed} aria-label={copy.planProgress} />
            {skipped > 0 && <small><LearningStatusIcon kind="skipped" label={copy.skipped}/> {skipped}</small>}
          </section>
          <section className="today-countdown" aria-label={copy.countdown}>
            <CalendarDays size={20} aria-hidden="true" />
            <div><span>{copy.untilExam} {plan.profile.level}</span><strong>{examCountdown > 0 ? <>{copy.remaining} <b>{examCountdown}</b> {copy.days}</> : examCountdown === 0 ? copy.examToday : copy.examEnded}</strong><small>{examDateLabel}</small></div>
          </section>
        </header>
        <section className="today-learning" aria-label={copy.startLearning}>
          <button type="button" className="today-feature" onClick={practiceAction}>
            <span className="today-feature-label"><Sparkles size={20} aria-hidden="true" />{copy.dailyPractice}</span>
            <strong className="today-feature-title">{practiceTitle}</strong>
            <span className="today-feature-meta">{latestDraft ? copy.draftReady : practice ? copy.practiceMeta(practice.questionCount, practice.minutes) : copy.prepareHint}</span>
            <span className="today-feature-action">{latestDraft ? copy.viewDraft : practice ? copy.startPractice : copy.preparePractice}<Play size={17} aria-hidden="true" /></span>
          </button>
          <div className="today-side">
            <button type="button" className="today-secondary" onClick={() => onNavigate('memory-review')}>
              <span className="today-card-icon"><Brain size={24} aria-hidden="true" /></span>
              <span><strong>{copy.reviewCards}</strong><small>{hasMemoryReview ? copy.reviewAvailable : copy.reviewDone}</small></span>

            </button>
            <a className="today-secondary today-textbooks" href="#/plan/textbooks">
              <span className="today-card-icon"><ListChecks size={24} aria-hidden="true" /></span>
              <span><strong>{copy.textbookPlan}</strong><small aria-label={`${copy.completed} ${textbookCompleted} / ${textbookTasks.length} ${copy.items}`}><LearningStatusIcon kind={textbookTasks.length && textbookCompleted === textbookTasks.length ? "completed" : "pending"} label={textbookTasks.length ? copy.textbookProgress : copy.noTextbookTasks}/>{textbookCompleted} / {textbookTasks.length}</small><span className="today-textbook-hint">{copy.viewTextbook}</span></span>

            </a>
          </div>
        </section>
        <AiTip locale={locale} />
        <HomeDiscovery token={token} locale={locale} />
      </div>
    </main>
  );
}

/** One random "what a connected AI can do" tip per visit; the full list lives on the AI assistant page. */
function AiTip({ locale }: { locale: Locale }) {
  const tip = useMemo(() => {
    const capabilities = aiCapabilities(locale);
    const capability = capabilities[Math.floor(Math.random() * capabilities.length)];
    return { capability, prompt: capability.prompts[Math.floor(Math.random() * capability.prompts.length)] };
  }, [locale]);
  const copy = locale === 'zh-CN'
    ? { label: 'AI 技巧', say: '可以这样说', more: '更多用法' }
    : locale === 'ja'
      ? { label: 'AI のコツ', say: 'こう頼める', more: 'ほかの使い方' }
      : { label: 'AI tip', say: 'Try saying', more: 'More ways' };
  return (
    <section className="today-ai-tip" aria-label={copy.label}>
      <span className="today-card-icon"><Bot size={22} aria-hidden="true" /></span>
      <div className="today-ai-tip-body">
        <span className="today-ai-tip-label">{copy.label} · {tip.capability.title}</span>
        <q>{tip.prompt}</q>
        <small>{tip.capability.result}</small>
      </div>
      <a href="#/about" className="today-ai-tip-more">{copy.more}<ArrowRight size={15} aria-hidden="true" /></a>
    </section>
  );
}

function greetingFor(hour: number, locale: Locale) {
  const slot = hour < 5 ? 'night' : hour < 11 ? 'morning' : hour < 14 ? 'noon' : hour < 18 ? 'afternoon' : 'evening';
  const copy = locale === 'zh-CN'
    ? { night: '夜深了', morning: '早上好', noon: '中午好', afternoon: '下午好', evening: '晚上好' }
    : locale === 'ja'
      ? { night: 'お疲れさま', morning: 'おはようございます', noon: 'こんにちは', afternoon: 'こんにちは', evening: 'こんばんは' }
      : { night: 'Still up?', morning: 'Good morning', noon: 'Hello', afternoon: 'Good afternoon', evening: 'Good evening' };
  return copy[slot];
}

function taskMatchesMaterial(task: StudyPlanTask, material: StudyPlanMaterial) {
  const source = `${task.title} ${task.sourceLabel ?? ''}`;
  return task.materialId === material.id || source.includes(material.title) || (task.module === material.module && /^新完全掌握/u.test(source));
}

function daysUntil(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(year, month - 1, day);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.ceil((target.getTime() - todayStart.getTime()) / 86_400_000);
}

function formatShortDate(date: string, locale: Locale) {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(year, month - 1, day));
}
