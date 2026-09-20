import { ArrowRight, Bot, ChevronRight, CircleCheck, Play, Brain, CalendarDays, ListChecks, Sparkles, UserRound } from 'lucide-react';
import { aiCapabilities } from '../../data/aiCapabilities';
import { useMemo } from 'react';
import './HomeDashboard.css';
import { HomeDiscovery } from './HomeDiscovery';
import { LearningStatusIcon } from '../../components/LearningStatusIcon';
import { localDateString, tasksForDate } from '../../domain/studyPlan';
import type { AppView, DailyPracticeSummary, DraftSummary, Locale, StudyPlanDocument, StudyPlanMaterial, StudyPlanTask, StudyPlanTaskStatus } from '../../types';

export function HomeDashboard({ token, cloud, username, locale, hasMemoryReview, plan, todayPractices, latestDraft, onOpenDraft, onNavigate, onStartDailyPractice, onCreateDailyPractice }: {
  token: string; cloud: boolean; username: string;
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
  const practiceTitle = latestDraft?.title || practice?.title || '给今天准备一组练习';
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
          <section className="today-progress" aria-label="今日计划进度">
            <p className="today-date">{dateLabel}</p>
            <div className="today-progress-label"><strong>今日计划</strong><span aria-label={`已完成 ${completed} / ${todayTasks.length} 项`} title="今日完成进度">{todayTasks.length ? <><CircleCheck size={16} aria-hidden="true"/>{completed} / {todayTasks.length}</> : '今天还没有安排任务'}</span></div>
            <progress max={todayTasks.length || 1} value={completed} aria-label="今日计划完成进度" />
            {skipped > 0 && <small><LearningStatusIcon kind="skipped" label="已跳过"/> {skipped}</small>}
          </section>
          <section className="today-countdown" aria-label="JLPT 倒计时">
            <CalendarDays size={20} aria-hidden="true" />
            <div><span>距 JLPT {plan.profile.level}</span><strong>{examCountdown > 0 ? <>还有 <b>{examCountdown}</b> 天</> : examCountdown === 0 ? '就是今天' : '考试已结束'}</strong><small>{examDateLabel}</small></div>
          </section>
        </header>
        <section className="today-learning" aria-label="开始学习">
          <button type="button" className="today-feature" onClick={practiceAction}>
            <span className="today-feature-label"><Sparkles size={20} aria-hidden="true" />今日练习</span>
            <strong className="today-feature-title">{practiceTitle}</strong>
            <span className="today-feature-meta">{latestDraft ? '新题目已准备好，先看看内容再开始。' : practice ? `${practice.questionCount} 题 · 约 ${practice.minutes} 分钟` : '准备好题目，开始今天的学习。'}</span>
            <span className="today-feature-action">{latestDraft ? '查看新题目' : practice ? '开始练习' : '准备今日练习'}<Play size={17} aria-hidden="true" /></span>
          </button>
          <div className="today-side">
            <button type="button" className="today-secondary" onClick={() => onNavigate('memory-review')}>
              <span className="today-card-icon"><Brain size={24} aria-hidden="true" /></span>
              <span><strong>复习卡片</strong><small>{hasMemoryReview ? '翻一翻，记住学过的内容' : '今天复习完了，也可以再看看'}</small></span>

            </button>
            <a className="today-secondary today-textbooks" href="#/plan/textbooks">
              <span className="today-card-icon"><ListChecks size={24} aria-hidden="true" /></span>
              <span><strong>今日教材计划</strong><small aria-label={`已完成 ${textbookCompleted} / ${textbookTasks.length} 项`}><LearningStatusIcon kind={textbookTasks.length && textbookCompleted === textbookTasks.length ? "completed" : "pending"} label={textbookTasks.length ? "教材完成进度" : "今天没有教材任务"}/>{textbookCompleted} / {textbookTasks.length}</small><span className="today-textbook-hint">查看教材任务</span></span>

            </a>
          </div>
        </section>
        <AiTip locale={locale} />
        <HomeDiscovery token={token} cloud={cloud} />
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
