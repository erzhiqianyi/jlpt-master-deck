import { ArrowLeft, ArrowRight, SlidersHorizontal, AlertTriangle, BookOpenCheck, CalendarRange, CheckCircle2, Clock3, School, Target } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
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
  const prompt = section === 'adjust' ? labels.planMcpPrompt.replace('{level}', plan.profile.level) : '';
  const evidence = useMemo(
    () => section === 'daily' ? buildDayEvidence(drafts, captures, attempts, listeningQuestions, readingQuestions) : [],
    [attempts, captures, drafts, listeningQuestions, readingQuestions, section],
  );
  const phases = useMemo(
    () => section === 'overview' || section === 'adjust' ? resolvePlanPhases(plan) : [],
    [plan, section],
  );

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  async function saveProfile(profile: StudyPlanProfile) {
    await onSaveProfile(profile);
    setProfileMode('read');
  }

  const copy = locale === 'zh-CN'
    ? { back: '返回计划首页', intro: '选一件事，慢慢来。', daily: '每天学什么', dailyBody: '看日历，完成今天的小任务', overview: '备考安排', overviewBody: '看看整体计划和学习阶段', adjust: '调整计划', adjustBody: '修改目标、时间和教材' }
    : locale === 'ja'
      ? { back: '計画のトップへ', intro: 'ひとつずつ進めましょう。', daily: '毎日の学習', dailyBody: 'カレンダーと今日のタスク', overview: '試験までの予定', overviewBody: '全体の計画と学習段階', adjust: '計画を調整', adjustBody: '目標・時間・教材を変更' }
      : { back: 'Back to plan', intro: 'One step at a time.', daily: 'Daily learning', dailyBody: 'Calendar and today’s tasks', overview: 'Exam preparation', overviewBody: 'Overall plan and learning stages', adjust: 'Adjust plan', adjustBody: 'Change goals, time and materials' };
  const entries = [
    { id: 'daily', title: copy.daily, body: copy.dailyBody, icon: CalendarRange },
    { id: 'overview', title: copy.overview, body: copy.overviewBody, icon: BookOpenCheck },
    { id: 'adjust', title: copy.adjust, body: copy.adjustBody, icon: SlidersHorizontal },
  ];
  const activeEntry = section === 'textbooks' ? { title: locale === 'zh-CN' ? '教材计划' : locale === 'ja' ? '教材の学習予定' : 'Textbook plan' } : entries.find((entry) => entry.id === section);
  const textbookTasks = useMemo(
    () => section === 'textbooks'
      ? plan.tasks.filter((task) => task.materialId || plan.profile.materials.some((material) => {
          const source = `${task.title} ${task.sourceLabel ?? ''}`;
          return source.includes(material.title) || (task.module === material.module && /^新完全掌握/u.test(source));
        }))
      : [],
    [plan.profile.materials, plan.tasks, section],
  );

  return (
    <div className={`gentle-plan mx-auto max-w-4xl space-y-5${!activeEntry ? ' gentle-entry-page' : ''}`}>
      <header className="plan-page-heading gentle-section-heading">
        {activeEntry ? <a className="plan-entry-back" href={section === 'textbooks' ? '#/home' : '#/plan'}><ArrowLeft size={18} />{section === 'textbooks' ? (locale === 'zh-CN' ? '返回今天' : locale === 'ja' ? '今日に戻る' : 'Back to today') : copy.back}</a> : null}
        <p className="text-sm font-semibold text-[#7d6032]">JLPT {plan.profile.level}</p>
        <h1 className="mt-1 text-2xl font-semibold text-[#27312c]">{activeEntry?.title ?? labels.planTitle}</h1>
        {!activeEntry ? <span>{copy.intro}</span> : null}
      </header>

      {!activeEntry ? <nav className="plan-entry-list" aria-label={labels.planTitle}>
        {entries.map(({ id, title, body, icon: Icon }) => <a key={id} className={`plan-entry-link entry-${id}`} href={`#/plan/${id}`}>
          <span className="plan-entry-icon"><Icon size={26} aria-hidden="true" /></span>
          <span><strong>{title}</strong><small>{body}</small></span>
          <ArrowRight size={20} aria-hidden="true" />
        </a>)}
      </nav> : null}

      {section === 'textbooks' ? <PlanCalendar labels={labels} locale={locale} tasks={textbookTasks} summaries={[]} evidence={[]} onTaskStatus={onTaskStatus} /> : null}
      {section === 'daily' ? <PlanCalendar labels={labels} locale={locale} tasks={plan.tasks} summaries={plan.dailySummaries} evidence={evidence} onTaskStatus={onTaskStatus} /> : null}
      {section === 'overview' ? <>
        <PlanOverviewPanel labels={labels} locale={locale} plan={plan} phases={phases} />
        <a className="gentle-direct-link" href="#/mock-exams">{locale === 'zh-CN' ? '模拟考试' : locale === 'ja' ? '模擬試験' : 'Mock exams'}<ArrowRight size={20} aria-hidden="true" /></a>
        <PlanReferencePanel labels={labels} locale={locale} plan={plan} phases={phases} mode="phases" />
      </> : null}
      {section === 'adjust' ? <>
        {profileMode === 'edit' ? <PlanSetupForm labels={labels} profile={plan.profile} onSave={saveProfile} onCancel={() => setProfileMode('read')} /> : <>
          <PlanReferencePanel labels={labels} locale={locale} plan={plan} phases={phases} mode="profile" />
          <button type="button" className="gentle-back" onClick={() => setProfileMode('edit')}>{labels.planEditProfile}</button>
        </>}
        <section className="plan-ai-help">
          <h2 className="text-lg font-semibold">{labels.planMcpRequired}</h2>
          <p className="mt-2 text-sm leading-6 text-[#647669]">{labels.planMcpRequiredBody}</p>
          <button type="button" onClick={copyPrompt} className="gentle-back mt-3">{copied ? labels.planPromptCopied : labels.planCopyPrompt}</button>
        </section>
      </> : null}
    </div>
  );
}

function PlanOverviewPanel({ labels, locale, plan, phases }: { labels: Record<string, string>; locale: Locale; plan: StudyPlanDocument; phases: PlanPhaseView[] }) {
  const today = localDateString(new Date());
  const activePhase = phases.find((phase) => phase.status === 'active') ?? phases.find((phase) => phase.status === 'upcoming') ?? phases[phases.length - 1];
  const totalCompleted = plan.tasks.filter((task) => task.status === 'completed').length;
  const missedTasks = plan.tasks.filter((task) => task.status === 'missed').length;
  const totalRate = plan.tasks.length ? Math.round((totalCompleted / plan.tasks.length) * 100) : 0;
  const remainingTasks = plan.tasks.filter((task) => task.date >= today && task.status !== 'completed' && task.status !== 'skipped').length;
  const materialCount = plan.profile.materials.filter((material) => material.module !== 'other').length;
  const needsRefresh = plan.status === 'needs_refresh' || missedTasks > 0 || !plan.phases.length;
  const healthLabel = needsRefresh ? labels.planHealthNeedsRefresh : labels.planHealthOnTrack;
  const healthBody = needsRefresh
    ? labels.planHealthNeedsRefreshBody
        .replace('{missed}', String(missedTasks))
        .replace('{phases}', String(plan.phases.length))
    : labels.planHealthOnTrackBody;

  return (
    <section className="rounded-lg border border-[#dfe5dc] bg-[#fffdf6] p-4 shadow-sm md:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
        <div className="min-w-0 rounded-lg border border-[#dfe5dc] bg-white p-4">
          <p className="text-sm font-semibold text-[#7d6032]">{labels.planOverviewEyebrow}</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#27312c]">{labels.planContentTitle}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <KidMetric icon={<CalendarRange className="h-5 w-5" aria-hidden="true" />} label={labels.planPlanRange} value={formatDateRange(plan.profile.startDate, plan.profile.examDate, locale)} meta={`${remainingTasks} ${labels.planRemainingTasks}`} />
            <KidMetric icon={<BookOpenCheck className="h-5 w-5" aria-hidden="true" />} label={labels.planMaterials} value={`${materialCount}`} meta={labels.planMaterialsUnit} />
            <KidMetric icon={<Target className="h-5 w-5" aria-hidden="true" />} label={labels.planCompletionRate} value={`${totalRate}%`} meta={`${totalCompleted}/${plan.tasks.length} ${labels.planCalendarTasks}`} />
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#edf1ec]">
            <span className="block h-full rounded-full bg-[#58a777]" style={{ width: `${totalRate}%` }} />
          </div>
        </div>

        <div className={`rounded-lg border p-4 ${needsRefresh ? 'border-[#dfc27b] bg-[#fff8df]' : 'border-[#c8dccf] bg-[#eef8f0]'}`}>
          <div className="flex items-center gap-2">
            {needsRefresh ? <AlertTriangle className="h-5 w-5 text-[#8a6a22]" aria-hidden="true" /> : <CheckCircle2 className="h-5 w-5 text-[#31564c]" aria-hidden="true" />}
            <h3 className="text-base font-semibold text-[#27312c]">{healthLabel}</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#4f5b55]">{healthBody}</p>
          <p className="mt-3 text-xs font-semibold text-[#68716b]">
            {activePhase?.focus || labels.planNoValue} · {activePhase ? formatDateRange(activePhase.startDate, activePhase.endDate, locale) : formatDateRange(plan.profile.startDate, plan.profile.examDate, locale)}
          </p>
        </div>
      </div>
    </section>
  );
}

function KidMetric({ icon, label, value, meta }: { icon: ReactNode; label: string; value: string; meta: string }) {
  return (
    <div className="min-w-0 rounded-md border border-[#e3e8e3] bg-[#fbfcf8] p-3">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[#e8f4eb] text-[#31564c]">{icon}</span>
      <p className="mt-2 text-xs font-semibold text-[#68716b]">{label}</p>
      <strong className="mt-1 block text-xl font-semibold leading-snug text-[#27312c]">{value}</strong>
      <span className="mt-0.5 block truncate text-xs font-semibold text-[#4f5b55]">{meta}</span>
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
