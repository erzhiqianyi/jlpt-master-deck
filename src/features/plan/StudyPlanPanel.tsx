import { ArrowRight, AlertTriangle, BookOpenCheck, CalendarRange, ChevronDown, Clock3, School, Target } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { localDateString, resolvePlanPhases, type PlanPhaseView } from '../../domain/studyPlan';
import type {
  DraftSummary,
  LearningCapture,
  ListeningQuestion,
  Locale,
  PracticeAttempt,
  ReadingQuestion,
  StudyPlanDayEvidence,
  StudyPlanDocument,
  StudyPlanProfile,
  StudyPlanTask,
  StudyPlanTaskStatus,
} from '../../types';
import { PlanCalendar } from './PlanCalendar';
import { PlanSetupForm } from './PlanSetupForm';

type StudyPlanPanelProps = {
  section?: string;
  labels: Record<string, string>;
  locale: Locale;
  plan: StudyPlanDocument;
  drafts: DraftSummary[];
  captures: LearningCapture[];
  attempts: PracticeAttempt[];
  listeningQuestions: ListeningQuestion[];
  readingQuestions: ReadingQuestion[];
  onSaveProfile: (profile: StudyPlanProfile) => Promise<void>;
  onTaskStatus: (id: string, status: StudyPlanTaskStatus) => Promise<void>;
};

export function StudyPlanPanel({
  section,  labels,
  locale,
  plan,
  drafts,
  captures,
  attempts,
  listeningQuestions,
  readingQuestions,
  onSaveProfile,
  onTaskStatus,
}: StudyPlanPanelProps) {
  const [profileMode, setProfileMode] = useState<'read' | 'edit'>('read');
  const [copied, setCopied] = useState(false);
  const settingsRef = useRef<HTMLDetailsElement>(null);
  const isTextbooks = section === 'textbooks';
  const prompt = labels.planMcpPrompt.replace('{level}', plan.profile.level);
  const evidence = useMemo(
    () => isTextbooks ? [] : buildDayEvidence(drafts, captures, attempts, listeningQuestions, readingQuestions),
    [attempts, captures, drafts, listeningQuestions, readingQuestions, isTextbooks],
  );
  const phases = useMemo(() => isTextbooks ? [] : resolvePlanPhases(plan), [plan, isTextbooks]);

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  async function saveProfile(profile: StudyPlanProfile) {
    await onSaveProfile(profile);
    setProfileMode('read');
  }

  // "Adjust" is not a page of its own: it lives in the settings fold at the bottom of the single plan page.
  function openSettings() {
    const element = settingsRef.current;
    if (!element) return;
    element.open = true;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const copy = locale === 'zh-CN'
    ? { today: '今天要做什么', arrangement: '备考安排', settings: '目标与时间', settingsHint: '级别、考试日期、每周时间和教材，点开就能改' }
    : locale === 'ja'
      ? { today: '今日やること', arrangement: '試験までの予定', settings: '目標と時間', settingsHint: 'レベル・試験日・週の時間・教材はここで変更' }
      : { today: 'Today', arrangement: 'Exam preparation', settings: 'Goal and time', settingsHint: 'Level, exam date, weekly time and materials — open to change' };
  const textbookTasks = useMemo(
    () => isTextbooks
      ? plan.tasks.filter((task) => task.materialId || plan.profile.materials.some((material) => {
          const source = `${task.title} ${task.sourceLabel ?? ''}`;
          return source.includes(material.title) || (task.module === material.module && /^新完全掌握/u.test(source));
        }))
      : [],
    [plan.profile.materials, plan.tasks, isTextbooks],
  );

  if (isTextbooks) {
    return (
      <div className="gentle-plan mx-auto max-w-4xl space-y-5">
        <PlanCalendar labels={labels} locale={locale} tasks={textbookTasks} summaries={[]} evidence={[]} onTaskStatus={onTaskStatus} />
      </div>
    );
  }

  return (
    <div className="gentle-plan plan-single mx-auto max-w-4xl">
      <section className="plan-single-section" aria-labelledby="plan-today-title">
        <h2 id="plan-today-title" className="plan-single-title">{copy.today}</h2>
        <PlanCalendar labels={labels} locale={locale} tasks={plan.tasks} summaries={plan.dailySummaries} evidence={evidence} onTaskStatus={onTaskStatus} />
      </section>

      <section className="plan-single-section plan-overview-page" aria-labelledby="plan-arrangement-title">
        <h2 id="plan-arrangement-title" className="plan-single-title">{copy.arrangement}</h2>
        <PlanOverviewPanel labels={labels} locale={locale} plan={plan} phases={phases} onAdjust={openSettings} />
      </section>

      <details ref={settingsRef} className="gentle-details plan-settings" id="plan-settings">
        <summary>
          <span className="plan-settings-summary">
            <span>{copy.settings} · JLPT {plan.profile.level} · {formatDateRange(plan.profile.startDate, plan.profile.examDate, locale)}</span>
            <span>{copy.settingsHint}</span>
          </span>
          <ChevronDown size={18} aria-hidden="true" />
        </summary>
        {profileMode === 'edit' ? <PlanSetupForm labels={labels} profile={plan.profile} onSave={saveProfile} onCancel={() => setProfileMode('read')} /> : <>
          <PlanReferencePanel labels={labels} locale={locale} plan={plan} phases={phases} mode="profile" />
          <button type="button" className="gentle-back" onClick={() => setProfileMode('edit')}>{labels.planEditProfile}</button>
        </>}
        <section className="plan-ai-help">
          <h2 className="text-lg font-semibold">{labels.planMcpRequired}</h2>
          <p className="mt-2 text-sm leading-6 text-[#647669]">{labels.planMcpRequiredBody}</p>
          <button type="button" onClick={copyPrompt} className="gentle-back mt-3">{copied ? labels.planPromptCopied : labels.planCopyPrompt}</button>
        </section>
      </details>
    </div>
  );
}

function PlanOverviewPanel({ labels, locale, plan, phases, onAdjust }: { labels: Record<string, string>; locale: Locale; plan: StudyPlanDocument; phases: PlanPhaseView[]; onAdjust: () => void }) {
  const activePhase = phases.find((phase) => phase.status === 'active') ?? phases.find((phase) => phase.status === 'upcoming') ?? phases[phases.length - 1];
  const totalCompleted = plan.tasks.filter((task) => task.status === 'completed').length;
  const missedTasks = plan.tasks.filter((task) => task.status === 'missed').length;
  const totalRate = plan.tasks.length ? Math.round((totalCompleted / plan.tasks.length) * 100) : 0;
  const needsRefresh = plan.status === 'needs_refresh' || missedTasks > 0 || !plan.phases.length;
  const copy = locale === 'zh-CN'
    ? { now: '现阶段重点', next: '下一阶段', past: '最近阶段', daily: '查看每日安排', adjust: '调整计划', roadmap: '完整备考路线', expand: '展开', collapse: '收起', progress: '本阶段已完成', overall: '整体进度', materials: '学习资料', mock: '模拟考试', empty: '先安排学习目标', notice: '有些安排需要更新，已完成的内容会保留。' }
    : locale === 'ja'
      ? { now: '今の学習ポイント', next: '次の段階', past: '直近の段階', daily: '毎日の予定を見る', adjust: '計画を調整', roadmap: '試験までの学習段階', expand: '開く', collapse: '閉じる', progress: 'この段階の完了数', overall: '全体の進捗', materials: '教材', mock: '模擬試験', empty: '学習目標を設定する', notice: '予定の更新が必要です。完了した内容は保持されます。' }
      : { now: 'Your focus now', next: 'Next stage', past: 'Latest stage', daily: 'View daily schedule', adjust: 'Adjust plan', roadmap: 'Full study roadmap', expand: 'Expand', collapse: 'Collapse', progress: 'Completed in this stage', overall: 'Overall progress', materials: 'Study materials', mock: 'Mock exams', empty: 'Set your learning goal', notice: 'Some tasks need rescheduling. Completed work will be kept.' };
  const phaseRate = activePhase?.totalTasks ? Math.round(activePhase.completedTasks / activePhase.totalTasks * 100) : 0;
  const focusPoints = [...new Set(activePhase?.points ?? [])].filter((point) => point !== activePhase?.focus);

  return (
    <div className="plan-overview-content">
      <section className="plan-focus" aria-labelledby="plan-focus-title">
        <div className="plan-focus-topline">
          <span>{activePhase?.status === 'upcoming' ? copy.next : activePhase?.status === 'done' ? copy.past : copy.now}</span>
          {activePhase ? <span>{labels.planPhaseLabel.replace('{number}', String(phases.indexOf(activePhase) + 1))} / {phases.length}</span> : null}
        </div>
        <h2 id="plan-focus-title">{activePhase?.focus || copy.empty}</h2>
        {activePhase ? <p className="plan-focus-dates">{formatDateRange(activePhase.startDate, activePhase.endDate, locale)}</p> : null}
        {activePhase?.goal && activePhase.goal !== activePhase.focus ? <p className="plan-focus-goal">{activePhase.goal}</p> : null}
        {focusPoints.length ? <ul className="plan-focus-points">{focusPoints.map((point) => <li key={point}>{point}</li>)}</ul> : null}
        <div className="plan-focus-bottom">
          <div className="plan-focus-progress">
            <p>{copy.progress}<strong>{activePhase?.completedTasks ?? 0} / {activePhase?.totalTasks ?? 0} {labels.planCalendarTasks}</strong></p>
            <div role="progressbar" aria-label={labels.planPhaseProgress} aria-valuemin={0} aria-valuemax={100} aria-valuenow={phaseRate}><span style={{ width: `${phaseRate}%` }} /></div>
          </div>
        </div>
      </section>

      {needsRefresh ? <aside className="plan-refresh-note">
        <AlertTriangle size={18} aria-hidden="true" />
        <p><strong>{labels.planHealthNeedsRefresh}</strong><span>{copy.notice}</span></p>
        <button type="button" onClick={onAdjust}>{copy.adjust}<ArrowRight size={16} aria-hidden="true" /></button>
      </aside> : null}

      <details className="plan-roadmap">
        <summary><span>{copy.roadmap}</span><span className="plan-roadmap-toggle"><span className="when-closed">{copy.expand}</span><span className="when-open">{copy.collapse}</span><ChevronDown size={18} aria-hidden="true" /></span></summary>
        <ol>
          {phases.map((phase, index) => <li key={phase.id} className={phase.status === 'active' ? 'is-current' : ''}>
            <span className="plan-roadmap-number">{index + 1}</span>
            <div><div className="plan-roadmap-heading"><h3>{phase.focus || copy.empty}</h3><span>{labels[`planPhaseStatus_${phase.status}`]}</span></div>
              <p>{formatDateRange(phase.startDate, phase.endDate, locale)} · {phase.completedTasks} / {phase.totalTasks} {labels.planCalendarTasks}</p>
              {phase.goal && phase.goal !== phase.focus ? <p>{phase.goal}</p> : null}
              {phase.points.filter((point) => point !== phase.focus).length ? <ul>{[...new Set(phase.points)].filter((point) => point !== phase.focus).map((point) => <li key={point}>{point}</li>)}</ul> : null}
            </div>
          </li>)}
        </ol>
      </details>

      <footer className="plan-overview-footer">
        <div className="plan-overview-facts">
          <span>{labels.planPlanRange}<strong>{formatDateRange(plan.profile.startDate, plan.profile.examDate, locale)}</strong></span>
          <span>{copy.overall}<strong>{totalCompleted} / {plan.tasks.length} {labels.planCalendarTasks} · {totalRate}%</strong></span>
          <span>{copy.materials}<strong>{plan.profile.materials.filter((material) => material.module !== 'other').length} {labels.planMaterialsUnit}</strong></span>
        </div>
        <nav aria-label={labels.planTitle}><a href="#/mock-exams">{copy.mock}<ArrowRight size={16} aria-hidden="true" /></a></nav>
      </footer>
    </div>
  );
}

function PlanReferencePanel({ labels, locale, plan, phases, mode }: { mode: 'phases' | 'profile'; labels: Record<string, string>; locale: Locale; plan: StudyPlanDocument; phases: PlanPhaseView[] }) {
  return (
    <section className="rounded-lg border border-[#dfe5dc] bg-[#fbfcf8] p-3 shadow-sm">
      <div className="grid gap-3">
        {mode === 'phases' ? <details open className="rounded-md border border-[#dfe5dc] bg-white p-4">
          <summary className="flex cursor-pointer list-none items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#edf4ef] text-[#31564c]">
              <CalendarRange className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-semibold text-[#27312c]">{labels.planPhaseTracker}</span>
              <span className="mt-0.5 block text-xs font-semibold text-[#68716b]">{labels.planOpenReference}</span>
            </span>
          </summary>
          <div className="mt-4 flex items-start gap-3 border-t border-[#edf1ec] pt-4">
            <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#edf4ef] text-[#31564c] sm:inline-flex">
              <CalendarRange className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[#27312c]">{labels.planPhaseTracker}</h2>
              <p className="mt-1 text-sm leading-6 text-[#68716b]">{labels.planPhaseTrackerBody}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {phases.map((phase, index) => (
              <article key={phase.id} className={`rounded-md border p-4 ${phase.status === 'active' ? 'border-[#7aa08f] bg-[#f3f8f5]' : 'border-[#e0e6dd] bg-[#fbfcf8]'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#7d6032]">{labels.planPhaseLabel.replace('{number}', String(index + 1))}</p>
                    <h3 className="mt-1 text-sm font-semibold leading-5 text-[#27312c]">{phase.focus || labels.planNoValue}</h3>
                  </div>
                  <span className={`shrink-0 rounded px-2 py-1 text-[11px] font-semibold ${phase.status === 'active' ? 'bg-[#31564c] text-white' : phase.status === 'done' ? 'bg-[#e2ebe6] text-[#31564c]' : 'bg-[#f3eddc] text-[#765c25]'}`}>
                    {labels[`planPhaseStatus_${phase.status}`]}
                  </span>
                </div>
                <p className="mt-3 text-xs font-semibold text-[#68716b]">{formatDateRange(phase.startDate, phase.endDate, locale)}</p>
                {phase.goal ? <p className="mt-2 text-xs leading-5 text-[#5c675f]">{phase.goal}</p> : null}
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e5ebe6]" aria-label={labels.planPhaseProgress} aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase.totalTasks ? Math.round((phase.completedTasks / phase.totalTasks) * 100) : 0} role="progressbar">
                  <span className="block h-full rounded-full bg-[#31564c]" style={{ width: `${phase.totalTasks ? Math.round((phase.completedTasks / phase.totalTasks) * 100) : 0}%` }} />
                </div>
                <p className="mt-2 text-xs text-[#68716b]">{phase.completedTasks} / {phase.totalTasks} {labels.planCalendarTasks}</p>
                {phase.points.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {phase.points.slice(0, 4).map((point) => <span key={point} className="rounded bg-white px-2 py-1 text-xs font-semibold text-[#4f5b55] ring-1 ring-[#dce4dd]">{point}</span>)}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </details> : null}

        {mode === 'profile' ? <details open className="rounded-md border border-[#dfe5dc] bg-white p-4">
          <summary className="flex cursor-pointer list-none items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#edf4ef] text-[#31564c]">
              <Target className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-semibold text-[#27312c]">{labels.planBasicInfo}</span>
              <span className="mt-0.5 block text-xs font-semibold text-[#68716b]">{labels.planOpenReference}</span>
            </span>
          </summary>
          <div className="mt-4 border-t border-[#edf1ec] pt-4">
            <div className="space-y-3 text-sm">
              <SnapshotRow icon={Target} label={labels.planLevel} value={`JLPT ${plan.profile.level}`} />
              <SnapshotRow icon={CalendarRange} label={labels.planExamDate} value={formatDateRange(plan.profile.startDate, plan.profile.examDate, locale)} />
              <SnapshotRow icon={Clock3} label={labels.planDailyMinutes} value={`${plan.profile.studyDaysPerWeek} ${labels.planDaysUnit} · ${plan.profile.dailyMinutes} ${labels.minutes}`} />
              <SnapshotRow icon={School} label={labels.planFixedSchedule} value={plan.profile.fixedSchedule || labels.planNoValue} />
              <SnapshotRow icon={BookOpenCheck} label={labels.planMaterials} value={`${plan.profile.materials.length} ${labels.planMaterialsUnit}`} />
            </div>
            <p className="mt-4 border-t border-[#dfe5dc] pt-3 text-xs font-semibold leading-5 text-[#4f5b55]">{labels.planWeekdaySchoolRule}</p>
          </div>
        </details> : null}
      </div>
    </section>
  );
}

function SnapshotRow({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) {
  return (
    <p className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#6f7d73]" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-[#68716b]">{label}</span>
        <strong className="mt-0.5 block break-words font-semibold text-[#27312c]">{value}</strong>
      </span>
    </p>
  );
}

function buildDayEvidence(
  drafts: DraftSummary[],
  captures: LearningCapture[],
  attempts: PracticeAttempt[],
  listeningQuestions: ListeningQuestion[],
  readingQuestions: ReadingQuestion[],
): StudyPlanDayEvidence[] {
  const byDate = new Map<string, StudyPlanDayEvidence>();

  function entry(date: string) {
    const current = byDate.get(date);
    if (current) return current;
    const next: StudyPlanDayEvidence = {
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
    byDate.set(date, next);
    return next;
  }

  for (const draft of drafts) {
    const day = entry(dateKey(draft.updated_at));
    day.drafts += 1;
    if (draft.status === 'confirmed' || draft.status === 'approved' || draft.status === 'processed') {
      day.confirmedDrafts += 1;
    }
  }
  for (const capture of captures) {
    const day = entry(dateKey(capture.updatedAt || capture.createdAt));
    day.captures += 1;
    if (capture.status === 'processed') day.processedCaptures += 1;
  }
  for (const attempt of attempts) {
    if (!attempt.completedAt) continue;
    const day = entry(dateKey(attempt.completedAt));
    day.practiceAttempts += 1;
    day.practiceQuestions += attempt.summary?.total ?? attempt.answers.length;
  }
  for (const question of listeningQuestions) {
    entry(dateKey(question.createdAt)).mediaDrafts += 1;
  }
  for (const question of readingQuestions) {
    entry(dateKey(question.createdAt)).readingDrafts += 1;
  }

  return [...byDate.values()].sort((left, right) => right.date.localeCompare(left.date));
}

function dateKey(value: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

function formatDateRange(startDate: string, endDate: string, locale: Locale) {
  const formatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  return `${formatter.format(new Date(`${startDate}T00:00:00`))} - ${formatter.format(new Date(`${endDate}T00:00:00`))}`;
}

function formatFullDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${value}T00:00:00`));
}
