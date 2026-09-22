import { LearningList, LearningListRow } from '../../components/LearningList';
import { Undo2, SkipForward, BookAudio, BookOpenText, ChevronLeft, ChevronRight, ClipboardList, Check, FileStack, ListChecks } from 'lucide-react';
import { useMemo, useState } from 'react';
import { calendarDays, localDateString, tasksForDate } from '../../domain/studyPlan';
import type { Locale, StudyDailySummary, StudyPlanDayEvidence, StudyPlanTask, StudyPlanTaskStatus } from '../../types';

export function PlanCalendar({
  labels,
  locale,
  tasks,
  summaries,
  evidence,
  onTaskStatus,
}: {
  labels: Record<string, string>;
  locale: Locale;
  tasks: StudyPlanTask[];
  summaries: StudyDailySummary[];
  evidence: StudyPlanDayEvidence[];
  onTaskStatus: (id: string, status: StudyPlanTaskStatus) => Promise<void>;
}) {
  const today = localDateString(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [month, setMonth] = useState(() => new Date(`${today.slice(0, 7)}-01T00:00:00`));
  const [updatingId, setUpdatingId] = useState('');
  const days = useMemo(() => calendarDays(month), [month]);
  const selectedTasks = tasksForDate(tasks, selectedDate);
  const selectedSummary = summaries.find((summary) => summary.date === selectedDate);
  const selectedEvidence = evidence.find((item) => item.date === selectedDate) ?? emptyEvidence(selectedDate);
  const weekdays = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2026, 7, 23 + index)));

  async function update(id: string, status: StudyPlanTaskStatus) {
    setUpdatingId(id);
    try {
      await onTaskStatus(id, status);
    } finally {
      setUpdatingId('');
    }
  }

  return (
    <div className="plan-agenda-layout">
      <aside className="plan-month"><div>
        <div className="flex items-center justify-between gap-2">
          <button type="button" aria-label={labels.planPreviousMonth} title={labels.planPreviousMonth} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className={iconButtonClass}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="min-w-0 text-center">

            <h2 className="truncate text-base font-semibold text-[#27312c]">{new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(month)}</h2>
          </div>
          <button type="button" aria-label={labels.planNextMonth} title={labels.planNextMonth} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className={iconButtonClass}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <button type="button" onClick={() => { setSelectedDate(today); setMonth(new Date(`${today.slice(0, 7)}-01T00:00:00`)); }} className="plan-today-link">
          {labels.planJumpToday}
        </button>

        <div className="plan-month-grid">
          {weekdays.map((weekday) => (
            <div key={weekday} className="plan-weekday">{weekday}</div>
          ))}
          {days.map((date, index) => {
            const dayTasks = date ? tasksForDate(tasks, date) : [];
            const completed = dayTasks.filter((task) => task.status === 'completed').length;
            const selected = date === selectedDate;
            const isToday = date === today;
            return date ? (
              <button key={date} type="button" aria-label={`${formatFullDate(date, locale)} · ${completed}/${dayTasks.length}`} aria-pressed={selected} onClick={() => setSelectedDate(date)} className={`plan-date ${selected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''} ${completed && completed === dayTasks.length ? 'is-complete' : ''}`}>
                <span className="plan-date-number">{Number(date.slice(-2))}</span>
                <span className="plan-date-mark" aria-hidden="true">{completed && completed === dayTasks.length ? <Check size={12} /> : dayTasks.length ? <span className={completed ? 'has-progress' : ''} /> : null}</span>
              </button>
            ) : <div key={`empty-${index}`} className="plan-date-empty" />;
          })}
        </div>
      <div className="plan-calendar-key"><span><i />{locale === 'zh-CN' ? '有安排' : locale === 'ja' ? '予定あり' : 'Planned'}</span><span><Check size={13} />{locale === 'zh-CN' ? '已完成' : locale === 'ja' ? '完了' : 'Done'}</span></div>
      </div></aside>
      <section className="min-w-0 space-y-5">
        <DayFocus
          labels={labels}
          locale={locale}
          date={selectedDate}
          tasks={selectedTasks}
          summary={selectedSummary}
          evidence={selectedEvidence}
          updatingId={updatingId}
          onTaskStatus={update}
        />
      </section>


    </div>
  );
}

function DayFocus({ labels, locale, date, tasks, summary, evidence, updatingId, onTaskStatus }: {
  labels: Record<string, string>;
  locale: Locale;
  date: string;
  tasks: StudyPlanTask[];
  summary?: StudyDailySummary;
  evidence: StudyPlanDayEvidence;
  updatingId: string;
  onTaskStatus: (id: string, status: StudyPlanTaskStatus) => Promise<void>;
}) {
  const completedTasks = tasks.filter((task) => task.status === 'completed');
  const completionRate = tasks.length ? Math.round((completedTasks.length / tasks.length) * 100) : 0;
  return (
    <section className="plan-day-agenda">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#7d6032]">{formatFullDate(date, locale)}</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#27312c]">{labels.planSelectedDayTasks}</h2>
        </div>
        <div className="plan-day-count">
          <p className="text-xs font-semibold text-[#68716b]">{labels.planTaskProgress}</p>
          <p className="text-xl font-semibold text-[#31564c]">{completedTasks.length} / {tasks.length}</p>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e5ebe6]" aria-label={labels.planDayCompletionRate} aria-valuemin={0} aria-valuemax={100} aria-valuenow={completionRate} role="progressbar">
        <span className="block h-full rounded-full bg-[#31564c]" style={{ width: `${completionRate}%` }} />
      </div>

      <div className="mt-5 grid gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#46514c]">{labels.planDayPlanContents}</h3>
          <TaskList locale={locale} labels={labels} tasks={tasks} updatingId={updatingId} onTaskStatus={onTaskStatus} />
        </div>

        <details className="gentle-details"><summary>{labels.planDayDone}</summary>
          <DoneList labels={labels} tasks={completedTasks} evidence={evidence} />
          <DailySummary labels={labels} summary={summary} evidence={evidence} tasks={tasks} compact />
        </details>
      </div>
    </section>
  );
}

function TaskList({ labels, locale, tasks, updatingId, onTaskStatus }: {
  locale: Locale;
  labels: Record<string, string>;
  tasks: StudyPlanTask[];
  updatingId: string;
  onTaskStatus: (id: string, status: StudyPlanTaskStatus) => Promise<void>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return <div className="plan-task-list"><LearningList locale={locale} hasActions columnLabels={locale === "ja" ? ["タスク", "モジュール・時間", "状態"] : locale === "en" ? ["Task", "Module / duration", "Status"] : ["任务", "模块与用时", "状态"]}>{tasks.map((task) => <LearningListRow key={task.id}
    title={task.title} description={`${labels[`planModule_${task.module}`]} · ${task.minutes} ${labels.minutes}`}
    statusKind={task.status} status={(locale === 'ja' ? { completed: '完了', skipped: 'スキップ', pending: 'これから', missed: '未完了' } : locale === 'en' ? { completed: 'Done', skipped: 'Skipped', pending: 'To do', missed: 'Missed' } : { completed: '已完成', skipped: '已跳过', pending: '待完成', missed: '未完成' })[task.status]} expanded={expandedId === task.id} locale={locale}
    onOpen={() => setExpandedId(expandedId === task.id ? null : task.id)}
    trailing={<label className="learning-list-task-check"><input type="checkbox" aria-label={`${labels.planCompletedTasks}: ${task.title}`} title={labels.planCompletedTasks} checked={task.status === 'completed'} disabled={updatingId === task.id} onChange={(event) => onTaskStatus(task.id, event.target.checked ? 'completed' : 'pending')}/></label>}
    secondary={expandedId === task.id ? <div className="learning-list-task-detail">{task.detail ? <p>{task.detail}</p> : null}<button type="button" aria-label={task.status === 'skipped' ? labels.planRestoreTask : labels.planSkipTask} title={task.status === 'skipped' ? labels.planRestoreTask : labels.planSkipTask} disabled={updatingId === task.id} onClick={() => onTaskStatus(task.id, task.status === 'skipped' ? 'pending' : 'skipped')}>{task.status === 'skipped' ? <Undo2 size={20}/> : <SkipForward size={20}/>}</button></div> : null}/>)}</LearningList></div>;

}

function DoneList({ labels, tasks, evidence }: { labels: Record<string, string>; tasks: StudyPlanTask[]; evidence: StudyPlanDayEvidence }) {
  const hasEvidence = evidenceCount(evidence) > 0;
  if (!tasks.length && !hasEvidence) {
    return <p className="mt-3 text-sm text-[#68716b]">{labels.planSummary_not_started}</p>;
  }

  return (
    <div className="mt-3 space-y-3">
      {tasks.length ? (
        <div className="space-y-2">
          {tasks.slice(0, 4).map((task) => (
            <p key={task.id} className="flex items-start gap-2 text-sm font-semibold text-[#31564c]">
              <ListChecks className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">{task.title}</span>
            </p>
          ))}
        </div>
      ) : null}
      {hasEvidence ? (
        <div className="grid gap-2 text-xs font-semibold text-[#4f5b55]">
          <EvidenceRow icon={FileStack} label={labels.planEvidenceDrafts} value={evidence.drafts} emphasis={evidence.confirmedDrafts} />
          <EvidenceRow icon={ClipboardList} label={labels.planEvidenceCaptures} value={evidence.captures} emphasis={evidence.processedCaptures} />
          <EvidenceRow icon={ListChecks} label={labels.planEvidencePractice} value={evidence.practiceAttempts} emphasis={evidence.practiceQuestions} />
          <EvidenceRow icon={BookAudio} label={labels.planEvidenceMedia} value={evidence.mediaDrafts} />
          <EvidenceRow icon={BookOpenText} label={labels.planEvidenceReading} value={evidence.readingDrafts} />
        </div>
      ) : null}
    </div>
  );
}

function DailySummary({ labels, summary, evidence, tasks, compact = false }: { labels: Record<string, string>; summary?: StudyDailySummary; evidence: StudyPlanDayEvidence; tasks: StudyPlanTask[]; compact?: boolean }) {
  const completedTasks = tasks.filter((task) => task.status === 'completed').length;
  const attempted = summary?.attempted ?? evidence.practiceQuestions;
  const accuracy = summary?.accuracy ?? null;
  const practiceMinutes = summary?.practiceMinutes ?? 0;
  return (
    <div className={`${compact ? 'mt-4 border-t' : 'mt-3 border-y'} border-[#dfe5dc] py-3`}>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <p><span className="text-[#68716b]">{labels.planTaskProgress}</span><strong className="ml-2 text-[#27312c]">{completedTasks}/{tasks.length}</strong></p>
        <p><span className="text-[#68716b]">{labels.answered}</span><strong className="ml-2 text-[#27312c]">{attempted}</strong></p>
        <p><span className="text-[#68716b]">{labels.accuracy}</span><strong className="ml-2 text-[#27312c]">{accuracy === null ? '-' : `${Math.round(accuracy * 100)}%`}</strong></p>
        <p><span className="text-[#68716b]">{labels.planPracticeMinutes}</span><strong className="ml-2 text-[#27312c]">{practiceMinutes}</strong></p>
      </div>
      {compact ? null : <div className="mt-3 grid gap-2 text-xs font-semibold text-[#4f5b55]">
        <EvidenceRow icon={FileStack} label={labels.planEvidenceDrafts} value={evidence.drafts} emphasis={evidence.confirmedDrafts} />
        <EvidenceRow icon={ClipboardList} label={labels.planEvidenceCaptures} value={evidence.captures} emphasis={evidence.processedCaptures} />
        <EvidenceRow icon={ListChecks} label={labels.planEvidencePractice} value={evidence.practiceAttempts} emphasis={evidence.practiceQuestions} />
        <EvidenceRow icon={BookAudio} label={labels.planEvidenceMedia} value={evidence.mediaDrafts} />
        <EvidenceRow icon={BookOpenText} label={labels.planEvidenceReading} value={evidence.readingDrafts} />
      </div>}
      <p className="mt-3 text-xs font-semibold text-[#4f5b55]">{labels[`planSummary_${summary?.note ?? dayStatus(tasks, summary, evidence)}`]}</p>
    </div>
  );
}

function EvidenceRow({ icon: Icon, label, value, emphasis }: { icon: typeof FileStack; label: string; value: number; emphasis?: number }) {
  return (
    <p className="flex items-center justify-between gap-3">
      <span className="inline-flex min-w-0 items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-[#7a807b]" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      <strong className="shrink-0 text-[#27312c]">{emphasis ? `${emphasis}/${value}` : value}</strong>
    </p>
  );
}

function dayStatus(tasks: StudyPlanTask[], summary: StudyDailySummary | undefined, evidence: StudyPlanDayEvidence) {
  if (summary?.note) return summary.note;
  if (!tasks.length && !evidenceCount(evidence)) return 'no_activity';
  if (tasks.length && tasks.every((task) => task.status === 'completed')) return 'complete';
  if (tasks.some((task) => task.status === 'completed') || evidenceCount(evidence)) return 'partial';
  return 'not_started';
}

function evidenceCount(evidence: StudyPlanDayEvidence) {
  return evidence.drafts + evidence.captures + evidence.practiceAttempts + evidence.mediaDrafts + evidence.readingDrafts;
}

function emptyEvidence(date: string): StudyPlanDayEvidence {
  return {
    date,
    drafts: 0,
    confirmedDrafts: 0,
    captures: 0,
    processedCaptures: 0,
    practiceAttempts: 0,
    practiceQuestions: 0,
    mediaDrafts: 0,
    readingDrafts: 0,
  };
}

function formatFullDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${value}T00:00:00`));
}

const iconButtonClass = 'inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#c8d1c8] bg-white text-[#31564c] hover:bg-[#f3f6f1]';
