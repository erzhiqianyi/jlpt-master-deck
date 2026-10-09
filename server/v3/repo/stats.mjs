// 学習の統計（v3）：すべて解答・自己評価・復習予定から数える（回数の列は持たない）。
import { getSettings } from './settings.mjs';
import { nowIso, oneOf } from './common.mjs';

/** その日のタイムゾーンでの日付（YYYY-MM-DD）。 */
function localDate(iso, timeZone) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); }
  catch { return iso.slice(0, 10); }
}

/**
 * 概要：題型ごとの正答率、日ごとの解答数と自己評価数、知識項目の状態の内訳、連続学習日数。
 * options：{ days（日ごとの集計の日数、既定 30）, module }
 */
export function studyOverview(db, userId, { days = 30, module } = {}) {
  const settings = getSettings(db, userId);
  const timeZone = settings.dailySource.timeZone || 'Asia/Tokyo';
  const params = { user: userId };
  const moduleWhere = module ? 'AND t.module = :module' : '';
  if (module) params.module = oneOf(module, ['vocabulary', 'grammar', 'reading', 'listening'], 'module');
  const byType = db.prepare(`SELECT g.type_id, t.module, t.label_ja, count(*) AS answered, sum(x.correct IS NOT NULL) AS scored, sum(x.correct = 1) AS correct, sum(x.elapsed_ms) AS elapsed
    FROM attempt_answers x JOIN practice_attempts a ON a.rid = x.attempt_rid JOIN questions q ON q.rid = x.question_rid JOIN question_groups g ON g.rid = q.group_rid
    JOIN question_types t ON t.type_id = g.type_id WHERE a.user_id = :user AND x.status = 'answered' ${moduleWhere} GROUP BY g.type_id ORDER BY t.sort_order`).all(params)
    .map((r) => ({ typeId: r.type_id, module: r.module, labelJa: r.label_ja, answered: r.answered, scored: r.scored, correct: r.correct ?? 0,
      accuracy: r.scored ? Math.round(((r.correct ?? 0) / r.scored) * 1000) / 10 : null, elapsedMs: r.elapsed ?? 0 }));
  const span = Math.min(366, Math.max(1, Number(days) || 30));
  const since = new Date(Date.now() - (span + 1) * 86400000).toISOString();
  const answers = db.prepare(`SELECT x.answered_at, x.correct FROM attempt_answers x JOIN practice_attempts a ON a.rid = x.attempt_rid
    WHERE a.user_id = ? AND x.status = 'answered' AND x.answered_at >= ?`).all(userId, since);
  const ratings = db.prepare('SELECT reviewed_at FROM memory_ratings WHERE user_id = ? AND reviewed_at >= ?').all(userId, since);
  const daily = new Map();
  const day = (date) => { if (!daily.has(date)) daily.set(date, { date, answered: 0, correct: 0, ratings: 0 }); return daily.get(date); };
  for (const a of answers) { const d = day(localDate(a.answered_at, timeZone)); d.answered += 1; if (a.correct === 1) d.correct += 1; }
  for (const r of ratings) day(localDate(r.reviewed_at, timeZone)).ratings += 1;
  const today = localDate(nowIso(), timeZone);
  // 連続日数：今日（なければ昨日）から遡る
  const active = new Set([...daily.values()].filter((d) => d.answered || d.ratings).map((d) => d.date));
  const allDays = new Set(db.prepare(`SELECT x.answered_at AS at FROM attempt_answers x JOIN practice_attempts a ON a.rid = x.attempt_rid WHERE a.user_id = ? AND x.status = 'answered'
    UNION ALL SELECT reviewed_at FROM memory_ratings WHERE user_id = ?`).all(userId, userId).map((r) => localDate(r.at, timeZone)));
  let streak = 0;
  for (let cursor = new Date(`${today}T12:00:00Z`); ; cursor = new Date(cursor.getTime() - 86400000)) {
    const date = cursor.toISOString().slice(0, 10);
    if (allDays.has(date)) streak += 1;
    else if (date !== today) break;
    if (streak > 3660) break;
  }
  const knowledge = db.prepare(`SELECT
      count(*) AS total,
      sum(r.point_rid IS NULL) AS fresh, sum(r.status = 'learning') AS learning, sum(r.status = 'review') AS review, sum(r.status = 'mastered') AS mastered,
      sum(r.due_at <= ?) AS due
    FROM knowledge_points k LEFT JOIN review_schedules r ON r.user_id = k.user_id AND r.point_rid = k.rid WHERE k.user_id = ?`).get(nowIso(), userId);
  const totalScored = byType.reduce((n, t) => n + t.scored, 0);
  const totalCorrect = byType.reduce((n, t) => n + t.correct, 0);
  return {
    timeZone, today,
    totals: { answered: byType.reduce((n, t) => n + t.answered, 0), scored: totalScored, correct: totalCorrect,
      accuracy: totalScored ? Math.round((totalCorrect / totalScored) * 1000) / 10 : null, ratings: db.prepare('SELECT count(*) AS n FROM memory_ratings WHERE user_id = ?').get(userId).n },
    byType,
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    todayActivity: daily.get(today) ?? { date: today, answered: 0, correct: 0, ratings: 0 },
    streak: active.has(today) || streak ? streak : 0,
    knowledge: { total: knowledge.total, new: knowledge.fresh ?? 0, learning: knowledge.learning ?? 0, review: knowledge.review ?? 0, mastered: knowledge.mastered ?? 0, due: knowledge.due ?? 0 },
  };
}
