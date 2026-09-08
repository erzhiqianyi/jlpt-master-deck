import { ArrowRight, BookOpenText, Brain, CalendarDays, Check, History, ListChecks, Sparkles } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { localDateString, tasksForDate } from '../../domain/studyPlan';
import type { AppView, DailyPracticeSummary, DraftSummary, Locale, StudyPlanDocument, StudyPlanMaterial, StudyPlanTask, StudyPlanTaskStatus } from '../../types';

type TaskCard = {
  key: string;
  icon: ReactNode;
  title: string;
  meta: string;
  action: () => void;
  tone: 'green' | 'blue' | 'yellow' | 'red';
  status: string;
  progress: number;
};

export function HomeDashboard({ locale, hasMemoryReview, plan, todayPractices, latestDraft, onOpenDraft, onNavigate, onStartDailyPractice, onCreateDailyPractice, onOpenPracticeHistory }: {
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
  const remaining = todayTasks.length - completed - skipped;
  const completionPercent = todayTasks.length ? Math.round(completed / todayTasks.length * 100) : 0;
  const dateLabel = new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
  const examCountdown = daysUntil(plan.profile.examDate);
  const examDateLabel = formatShortDate(plan.profile.examDate, locale);
  const taskCards: TaskCard[] = [
    {
      key: 'study',
      icon: <Brain size={30} />,
      title: '复习卡片',
      meta: hasMemoryReview ? '翻一翻，记住学过的内容' : '今天复习完了，也可以再看看',
      action: () => onNavigate('memory-review'),
      tone: 'green',
      status: hasMemoryReview ? '待复习' : '已清空',
      progress: hasMemoryReview ? 0 : 100,
    },
    ...(todayPractices.length ? todayPractices.map((entry) => ({
      key: entry.id,
      icon: <Sparkles size={30} />,
      title: '做今日练习',
      meta: `${entry.questionCount} 题 · ${entry.minutes} 分钟`,
      action: () => onStartDailyPractice(entry.id),
      tone: 'blue' as const,
      status: '已生成',
      progress: 0,
    })) : [{
      key: 'create-practice',
      icon: <Sparkles size={30} />,
      title: '准备今日练习',
      meta: '准备好题目，就可以开始了',
      action: () => onCreateDailyPractice(),
      tone: 'blue' as const,
      status: '待生成',
      progress: 0,
    }]),
  ];
  const reviewCard = taskCards[0];
  const practiceCard: TaskCard = latestDraft ? {
    key: latestDraft.id, icon: <Sparkles size={30} />, title: '看一看新题目',
    meta: '今日练习准备好了，先看看再开始', action: () => onOpenDraft(latestDraft.id),
    tone: 'blue', status: '待确认', progress: 0,
  } : taskCards[1];
  const learningCards = [reviewCard, practiceCard];
  return (
    <main className="gentle-home">
      <header className="gentle-heading gentle-section-heading">
        <p>今天</p>
        <h1>今天学什么？</h1>
        <span>{dateLabel}</span>
      </header>
      <section className="gentle-today-progress" aria-label="今日计划进度">
        <div><strong>今日计划</strong><span>{todayTasks.length ? `已完成 ${completed} / ${todayTasks.length} 项` : '今天还没有安排任务'}</span></div>
        <progress max={todayTasks.length || 1} value={completed} aria-label="今日计划完成进度" />
        <p>{todayTasks.length ? `${completionPercent}% · 待完成 ${remaining} 项${skipped ? ` · 已跳过 ${skipped} 项` : ''}` : '可以先复习卡片，或做一组练习。'}</p>
        <button type="button" className="gentle-history-link" onClick={onOpenPracticeHistory}>
          <History size={17} aria-hidden="true" />
          <span>{todayPractices.length ? '查看今天和历史练习记录' : '查看历史练习记录'}</span>
        </button>
      </section>
      <section className="gentle-exam-countdown" aria-label="JLPT 倒计时">
        <span className="gentle-exam-icon" aria-hidden="true"><CalendarDays size={22} /></span>
        <span><strong>JLPT {plan.profile.level}</strong><small>{examDateLabel}</small></span>
        <b>{examCountdown > 0 ? `${examCountdown} 天` : examCountdown === 0 ? '今天' : '已结束'}</b>
      </section>
      <section className="gentle-start" aria-label="开始学习">
        {learningCards.map((card, index) => (
          <button key={card.key} type="button" className={`gentle-choice is-${card.tone}`} onClick={card.action}>
            <span className="gentle-choice-icon" aria-hidden="true">{card.icon}</span>
            <span className="gentle-choice-copy"><small>{index === 0 ? '先记一记' : latestDraft ? '有新练习' : '再试一试'}</small><strong>{card.title}</strong><span>{card.meta}</span></span>
            <ArrowRight size={22} aria-hidden="true" />
          </button>
        ))}
        <button type="button" className="gentle-choice is-yellow" onClick={() => onNavigate('mixed')}>
          <span className="gentle-choice-icon" aria-hidden="true"><BookOpenText size={30} /></span>
          <span className="gentle-choice-copy"><small>自己选</small><strong>学点别的</strong><span>单词、句子、听力和阅读</span></span>
          <ArrowRight size={22} aria-hidden="true" />
        </button>
        <a className="gentle-choice is-purple" href="#/plan/textbooks">
          <span className="gentle-choice-icon" aria-hidden="true"><ListChecks size={30} /></span>
          <span className="gentle-choice-copy"><strong>今日教材计划</strong><span>{textbookTasks.length ? `已完成 ${textbookCompleted} / ${textbookTasks.length} 项 · 查看教材任务` : '今天没有教材任务 · 查看其他日期'}</span></span>
          <ArrowRight size={22} aria-hidden="true" />
        </a>
      </section>
      <p className="gentle-encouragement"><Check size={18} aria-hidden="true" />{completed ? `今天已完成 ${completed} 项学习，继续加油！` : '每天学一点，也是在进步。'}</p>

    </main>
  );
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
