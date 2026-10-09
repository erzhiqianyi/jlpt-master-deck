// 学習計画（一人一つ）：基本情報と教材 → AI が段階と毎日の課題を作る → 学習者が課題を完了・スキップする。
import { pickTexts, preferredLanguage, SUPPORTED_LANGUAGES } from '../i18n.mjs';
import { InputError, NotFoundError, nextCode, nowIso, oneOf, text, list, number, LEVELS } from './common.mjs';
import { writeText } from './materials.mjs';
import { studyOverview } from './stats.mjs';
import { listMistakes } from './practice.mjs';

const MODULES = ['vocabulary', 'grammar', 'reading', 'listening', 'other'];
const TASK_STATUSES = ['pending', 'completed', 'skipped', 'missed'];
const PLAN_TEXTS = { fixedSchedule: 'fixed_schedule', supplementalNeeds: 'supplemental_needs', phaseStrategy: 'phase_strategy', postMaterialStrategy: 'post_material_strategy', goal: 'goal' };
const languageOf = (db, userId, requested) => (SUPPORTED_LANGUAGES.includes(requested) ? requested : preferredLanguage(db, userId));
const date = (value, label) => {
  const v = text(value, label, { optional: false, max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new InputError(`${label} 应为 YYYY-MM-DD`);
  return v;
};

function ensurePlan(db, userId) {
  const now = nowIso();
  db.prepare("INSERT OR IGNORE INTO learning_plans (user_id, status, created_at, updated_at) VALUES (?, 'profile_only', ?, ?)").run(userId, now, now);
}

export function getPlan(db, userId, { language } = {}) {
  const lang = languageOf(db, userId, language);
  const p = db.prepare('SELECT * FROM learning_plans WHERE user_id = ?').get(userId);
  if (!p) return { status: 'none', profile: null, strategy: null, phases: [], tasks: [] };
  const materials = db.prepare('SELECT * FROM learning_plan_materials WHERE user_id = ? ORDER BY position').all(userId);
  const phases = db.prepare('SELECT * FROM learning_plan_phases WHERE user_id = ? ORDER BY position').all(userId);
  const points = phases.length ? db.prepare('SELECT * FROM learning_plan_phase_points WHERE phase_rid IN (SELECT value FROM json_each(?)) ORDER BY phase_rid, position').all(JSON.stringify(phases.map((x) => x.rid))) : [];
  const tasks = db.prepare('SELECT * FROM learning_plan_tasks WHERE user_id = ? ORDER BY scheduled_date, rid').all(userId);
  const texts = pickTexts(db, [['learning_plans', userId], ...materials.map((m) => ['learning_plan_materials', m.rid]), ...phases.map((x) => ['learning_plan_phases', x.rid]),
    ...points.map((x) => ['learning_plan_phase_points', x.rid]), ...tasks.map((x) => ['learning_plan_tasks', x.rid])], lang);
  const own = (table, rid) => texts.get(`${table}:${rid}`) ?? {};
  const planTexts = own('learning_plans', userId);
  return {
    status: p.status, generatedAt: p.generated_at, updatedAt: p.updated_at, language: lang,
    profile: {
      examName: p.exam_name, level: p.level, startDate: p.start_date, examDate: p.exam_date, studyDaysPerWeek: p.study_days_per_week, dailyMinutes: p.daily_minutes,
      materialStartStatus: p.material_start_status, fixedSchedule: planTexts.fixed_schedule ?? null, supplementalNeeds: planTexts.supplemental_needs ?? null,
      materials: materials.map((m) => ({ id: m.rid, position: m.position, module: m.module, title: own('learning_plan_materials', m.rid).title ?? null, currentPosition: own('learning_plan_materials', m.rid).current_position ?? null })),
    },
    strategy: { phaseStrategy: planTexts.phase_strategy ?? null, postMaterialStrategy: planTexts.post_material_strategy ?? null, goal: planTexts.goal ?? null },
    phases: phases.map((x) => ({ position: x.position, startDate: x.start_date, endDate: x.end_date, focus: own('learning_plan_phases', x.rid).focus ?? null, goal: own('learning_plan_phases', x.rid).goal ?? null,
      points: points.filter((pt) => pt.phase_rid === x.rid).map((pt) => own('learning_plan_phase_points', pt.rid).point ?? null).filter(Boolean) })),
    tasks: tasks.map((x) => ({ code: x.code, date: x.scheduled_date, module: x.module, minutes: x.minutes, material: x.material_rid, status: x.status, completedAt: x.completed_at,
      title: own('learning_plan_tasks', x.rid).title ?? null, detail: own('learning_plan_tasks', x.rid).detail ?? null, sourceLabel: own('learning_plan_tasks', x.rid).source_label ?? null })),
  };
}

/** 基本情報と教材を保存する。生成済みの計画は「作り直しが必要」になる。 */
export function savePlanProfile(db, userId, input = {}) {
  ensurePlan(db, userId);
  const language = languageOf(db, userId, input.language);
  const current = db.prepare('SELECT status FROM learning_plans WHERE user_id = ?').get(userId);
  const columns = {};
  if ('examName' in input) columns.exam_name = text(input.examName, 'examName', { max: 120 });
  if ('level' in input) columns.level = input.level == null ? null : oneOf(input.level, LEVELS, 'level');
  if ('startDate' in input) columns.start_date = input.startDate == null ? null : date(input.startDate, 'startDate');
  if ('examDate' in input) columns.exam_date = input.examDate == null ? null : date(input.examDate, 'examDate');
  if ('studyDaysPerWeek' in input) columns.study_days_per_week = number(input.studyDaysPerWeek, 'studyDaysPerWeek', { min: 1, max: 7, integer: true });
  if ('dailyMinutes' in input) columns.daily_minutes = number(input.dailyMinutes, 'dailyMinutes', { min: 5, max: 720, integer: true });
  if ('materialStartStatus' in input) columns.material_start_status = text(input.materialStartStatus, 'materialStartStatus', { max: 40 });
  columns.status = current.status === 'ready' ? 'needs_refresh' : current.status;
  db.prepare(`UPDATE learning_plans SET ${Object.keys(columns).map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE user_id = ?`).run(...Object.values(columns), nowIso(), userId);
  for (const key of ['fixedSchedule', 'supplementalNeeds']) writeText(db, 'learning_plans', userId, PLAN_TEXTS[key], input[key], language);
  if ('materials' in input) {
    const materials = list(input.materials, 'materials', { max: 30 });
    const existing = db.prepare('SELECT rid FROM learning_plan_materials WHERE user_id = ? ORDER BY position').all(userId).map((r) => r.rid);
    db.prepare('UPDATE learning_plan_materials SET position = position + 1000 WHERE user_id = ?').run(userId);
    materials.forEach((m, position) => {
      let rid = existing[position];
      const module = oneOf(m?.module ?? 'other', MODULES, `materials[${position}].module`);
      if (rid) db.prepare('UPDATE learning_plan_materials SET position = ?, module = ? WHERE rid = ?').run(position, module, rid);
      else rid = Number(db.prepare('INSERT INTO learning_plan_materials (user_id, position, module) VALUES (?, ?, ?)').run(userId, position, module).lastInsertRowid);
      writeText(db, 'learning_plan_materials', rid, 'title', text(m?.title, `materials[${position}].title`, { optional: false, max: 200 }), language);
      writeText(db, 'learning_plan_materials', rid, 'current_position', m?.currentPosition ?? null, language);
    });
    for (const extra of existing.slice(materials.length)) db.prepare('DELETE FROM learning_plan_materials WHERE rid = ?').run(extra);
  }
  return getPlan(db, userId, { language });
}

/**
 * AI が作った計画を保存する（段階と毎日の課題を置き換える）。
 * input：{ phaseStrategy, postMaterialStrategy, goal, phases: [{ startDate, endDate, focus, goal, points[] }],
 *          tasks: [{ date, module, minutes, material（教材の位置）, title, detail, sourceLabel }] }
 */
export function saveGeneratedPlan(db, userId, input = {}) {
  ensurePlan(db, userId);
  const language = languageOf(db, userId, input.language);
  const phases = list(input.phases, 'phases', { max: 30 });
  const tasks = list(input.tasks, 'tasks', { max: 2000 });
  if (!tasks.length) throw new InputError('计划至少要有一个每日任务（tasks）');
  const materials = db.prepare('SELECT rid FROM learning_plan_materials WHERE user_id = ? ORDER BY position').all(userId).map((r) => r.rid);
  for (const key of ['phaseStrategy', 'postMaterialStrategy', 'goal']) writeText(db, 'learning_plans', userId, PLAN_TEXTS[key], input[key], language);
  db.prepare('DELETE FROM learning_plan_phases WHERE user_id = ?').run(userId);
  phases.forEach((phase, position) => {
    const rid = Number(db.prepare('INSERT INTO learning_plan_phases (user_id, position, start_date, end_date) VALUES (?, ?, ?, ?)')
      .run(userId, position, date(phase?.startDate, `phases[${position}].startDate`), date(phase?.endDate, `phases[${position}].endDate`)).lastInsertRowid);
    writeText(db, 'learning_plan_phases', rid, 'focus', phase?.focus, language);
    writeText(db, 'learning_plan_phases', rid, 'goal', phase?.goal, language);
    list(phase?.points, `phases[${position}].points`, { max: 20 }).forEach((point, i) => {
      const pointRid = Number(db.prepare('INSERT INTO learning_plan_phase_points (phase_rid, position) VALUES (?, ?)').run(rid, i).lastInsertRowid);
      writeText(db, 'learning_plan_phase_points', pointRid, 'point', point, language);
    });
  });
  // 完了した課題は残し、まだの課題は作り直す
  db.prepare("DELETE FROM learning_plan_tasks WHERE user_id = ? AND status IN ('pending', 'missed')").run(userId);
  const now = nowIso();
  tasks.forEach((task, i) => {
    const { code } = nextCode(db, userId, 'TK');
    const material = task?.material == null ? null : materials[Number(task.material)] ?? null;
    const rid = Number(db.prepare(`INSERT INTO learning_plan_tasks (user_id, code, scheduled_date, module, minutes, material_rid, workload_kind, status, completed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending', NULL, ?, ?)`).run(userId, code, date(task?.date, `tasks[${i}].date`), oneOf(task?.module ?? 'other', MODULES, `tasks[${i}].module`),
      number(task?.minutes, `tasks[${i}].minutes`, { min: 1, max: 720, integer: true }), material, now, now).lastInsertRowid);
    writeText(db, 'learning_plan_tasks', rid, 'title', text(task?.title, `tasks[${i}].title`, { optional: false, max: 200 }), language);
    writeText(db, 'learning_plan_tasks', rid, 'detail', task?.detail ?? null, language);
    writeText(db, 'learning_plan_tasks', rid, 'source_label', task?.sourceLabel ?? null, language);
  });
  db.prepare("UPDATE learning_plans SET status = 'ready', generated_at = ?, updated_at = ? WHERE user_id = ?").run(now, now, userId);
  return getPlan(db, userId, { language });
}

export function setTaskStatus(db, userId, code, status) {
  const task = db.prepare('SELECT rid FROM learning_plan_tasks WHERE user_id = ? AND code = ?').get(userId, String(code ?? '').toUpperCase());
  if (!task) throw new NotFoundError(`找不到计划任务：${code}`);
  const next = oneOf(status, TASK_STATUSES, 'status');
  db.prepare('UPDATE learning_plan_tasks SET status = ?, completed_at = ?, updated_at = ? WHERE rid = ?').run(next, next === 'completed' ? nowIso() : null, nowIso(), task.rid);
  return getPlan(db, userId).tasks.find((t) => t.code === String(code).toUpperCase());
}

/** AI が計画を作るための材料：基本情報、学習の統計、知識項目の状態、最近の間違い。 */
export function planContext(db, userId) {
  return { plan: getPlan(db, userId), stats: studyOverview(db, userId, { days: 30 }), mistakes: listMistakes(db, userId, { limit: 30 }) };
}
