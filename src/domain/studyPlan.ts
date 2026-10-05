import type { StudyPlanDocument, StudyPlanMaterial, StudyPlanModule, StudyPlanPhase, StudyPlanProfile, StudyPlanTask } from '../types';

const DEFAULT_EXAM_DATE = '2026-12-06';

export function createDefaultStudyPlanProfile(now = new Date()): StudyPlanProfile {
  return {
    level: '',
    examName: '',
    startDate: localDateString(now),
    examDate: DEFAULT_EXAM_DATE,
    studyDaysPerWeek: 6,
    dailyMinutes: 90,
    materials: [
      defaultMaterial('shin-kanzen-grammar', '新完全掌握 N1 语法', 'grammar'),
      defaultMaterial('shin-kanzen-reading', '新完全掌握 N1 阅读', 'reading'),
      defaultMaterial('shin-kanzen-listening', '新完全掌握 N1 听力', 'listening'),
    ],
    materialStartStatus: 'not_started',
    fixedSchedule: '',
    supplementalNeeds: '',
    phaseStrategy: '',
    postMaterialStrategy: '',
    goal: '',
  };
}

export type PlanPhaseView = StudyPlanPhase & {
  totalTasks: number;
  completedTasks: number;
  status: 'done' | 'active' | 'upcoming';
};

export function resolvePlanPhases(plan: StudyPlanDocument, today = localDateString(new Date())): PlanPhaseView[] {
  const phases = plan.phases.length ? plan.phases : phasesFromStrategyText(plan.profile);
  return phases.map((phase) => {
    const phaseTasks = plan.tasks.filter((task) => task.date >= phase.startDate && task.date <= phase.endDate);
    return {
      ...phase,
      totalTasks: phaseTasks.length,
      completedTasks: phaseTasks.filter((task) => task.status === 'completed').length,
      status: today > phase.endDate ? 'done' : today < phase.startDate ? 'upcoming' : 'active',
    };
  });
}

function phasesFromStrategyText(profile: StudyPlanProfile): StudyPlanPhase[] {
  const text = (profile.phaseStrategy ?? '').trim();
  if (!text) {
    return [{ id: 'phase-1', startDate: profile.startDate, endDate: profile.examDate, focus: '', points: [] }];
  }
  const entries = text.split(/[;\n；]+/).map((item) => item.trim()).filter(Boolean);
  const parsed = entries.map((entry, index) => {
    const match = entry.match(/(20\d{2}[-/年.]\d{1,2}[-/月.]\d{1,2}日?)\s*(?:到|至|~|〜|から|to)\s*(20\d{2}[-/年.]\d{1,2}[-/月.]\d{1,2}日?)\s*(.*)/i);
    const body = (match?.[3] ?? entry).replace(/^[:：,\s]+/, '').trim();
    const points = body.split(/[，,、。]/).map((item) => item.trim()).filter(Boolean);
    return {
      id: `phase-${index + 1}`,
      startDate: normalizeLooseDate(match?.[1]) ?? profile.startDate,
      endDate: normalizeLooseDate(match?.[2]) ?? profile.examDate,
      focus: points[0] ?? body,
      points,
    };
  });
  return parsed.length ? parsed : [{ id: 'phase-1', startDate: profile.startDate, endDate: profile.examDate, focus: text, points: [text] }];
}

function normalizeLooseDate(value: string | undefined) {
  if (!value) return null;
  const numbers = value.match(/\d+/g);
  if (!numbers || numbers.length < 3) return null;
  const [year, month, day] = numbers;
  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function createStudyMaterial(): StudyPlanMaterial {
  return defaultMaterial(`material-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, '', 'other');
}

export function tasksForDate(tasks: StudyPlanTask[], date: string) {
  return tasks.filter((task) => task.date === date).sort((left, right) => left.title.localeCompare(right.title));
}

export function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const days = Array.from({ length: first.getDay() }, () => null as string | null);
  for (let day = 1; day <= last.getDate(); day += 1) {
    days.push(localDateString(new Date(month.getFullYear(), month.getMonth(), day)));
  }
  while (days.length % 7) days.push(null);
  return days;
}

export function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function defaultMaterial(id: string, title: string, module: StudyPlanModule): StudyPlanMaterial {
  const currentPosition = {
    'shin-kanzen-grammar': '从第 1 部 文の文法1 开始：ことがらを説明する、時間関係、範囲の始まり・限度、例示、関連・無関係、様子、付随行動、逆接、条件、目的・手段、原因・理由、可能・不可能・禁止、話題・評価、比較対照、結果・最終状態、強調、主張・断定、評価・感想、心情・強制的思い；之后整理文法形式、第 2 部 文の文法2、第 3 部 文章の文法。',
    'shin-kanzen-reading': '从第 1 部 評論・解説・エッセイなど 开始：文章全体の意味、対比、言い換え、比喩、疑問提示文、指示語、だれが/何を、下線部の意味、理由、例；之后广告/通知/说明书/表・リスト，最后实战问题。',
    'shin-kanzen-listening': '从音声の特徴开始：似ている音、音の変化や縮約形；之后即時応答、課題理解、ポイント理解、概要理解、統合理解，并在各技能后做確認問題和模擬試験。',
  }[id] ?? '';
  return { id, title, module, currentPosition };
}
