// 毎日の学習まとめ：その日の数字（解答数・正答数・形式別・間違えた問題）はサーバーが解答から数え、
// AI は文章（総評、良い点・弱点、混同しやすい点、次の提案）を書く。毎日の練習を作る材料（直近の間違いと苦手なカード）もここ。
import { pickTexts, preferredLanguage, SUPPORTED_LANGUAGES } from '../i18n.mjs';
import { InputError, NotFoundError, nowIso, oneOf, text, list } from './common.mjs';
import { getSettings } from './settings.mjs';
import { writeText } from './materials.mjs';

const languageOf = (db, userId, requested) => (SUPPORTED_LANGUAGES.includes(requested) ? requested : preferredLanguage(db, userId));
const RECOMMENDATION_TYPES = ['review', 'practice', 'quality', 'priority', 'card_review'];

function zoneOf(db, userId) {
  return getSettings(db, userId).dailySource.timeZone || 'Asia/Tokyo';
}
function localDate(iso, timeZone) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); } catch { return iso.slice(0, 10); }
}
function checkDate(value) {
  const v = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new InputError('date 应为 YYYY-MM-DD');
  return v;
}

/** 期間内の解答と自己評価（since〜until、ISO）。 */
function activityBetween(db, userId, since, until) {
  const answers = db.prepare(`SELECT x.answered_at, x.correct, x.selected_text, x.correct_text, x.answer_text, q.rid AS question_rid, q.code, q.prompt, g.type_id
    FROM attempt_answers x JOIN practice_attempts a ON a.rid = x.attempt_rid JOIN questions q ON q.rid = x.question_rid JOIN question_groups g ON g.rid = q.group_rid
    WHERE a.user_id = ? AND x.status = 'answered' AND x.answered_at >= ? AND x.answered_at < ? ORDER BY x.answered_at`).all(userId, since, until);
  const ratings = db.prepare(`SELECT m.rating, m.reviewed_at, k.code, k.expression FROM memory_ratings m JOIN knowledge_points k ON k.rid = m.point_rid
    WHERE m.user_id = ? AND m.reviewed_at >= ? AND m.reviewed_at < ? ORDER BY m.reviewed_at`).all(userId, since, until);
  const knowledge = (questionRid) => db.prepare("SELECT k.code, k.expression FROM knowledge_point_questions l JOIN knowledge_points k ON k.rid = l.point_rid WHERE l.question_rid = ? AND l.relation = 'target'").all(questionRid);
  return { answers, ratings, knowledge };
}

/** 指定日の数字（その人のタイムゾーンで 1 日）。 */
export function dayFigures(db, userId, date) {
  const timeZone = zoneOf(db, userId);
  const day = checkDate(date);
  const since = new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString();
  const until = new Date(Date.parse(`${day}T00:00:00Z`) + 2 * 86400000).toISOString();
  const { answers: all, ratings: allRatings, knowledge } = activityBetween(db, userId, since, until);
  const answers = all.filter((a) => localDate(a.answered_at, timeZone) === day);
  const ratings = allRatings.filter((r) => localDate(r.reviewed_at, timeZone) === day);
  const scored = answers.filter((a) => a.correct != null);
  const byType = new Map();
  for (const a of scored) {
    const t = byType.get(a.type_id) ?? { typeId: a.type_id, total: 0, correct: 0, incorrect: 0 };
    t.total += 1; if (a.correct === 1) t.correct += 1; else t.incorrect += 1;
    byType.set(a.type_id, t);
  }
  const points = new Set();
  const wrong = [];
  for (const a of answers) {
    const linked = knowledge(a.question_rid);
    for (const k of linked) points.add(k.code);
    if (a.correct === 0) wrong.push({ question: a.code, typeId: a.type_id, prompt: a.prompt, selected: a.selected_text ?? a.answer_text, correctAnswer: a.correct_text, knowledge: linked.map((k) => k.code) });
  }
  const correct = scored.filter((a) => a.correct === 1).length;
  return {
    date: day, timeZone,
    totals: { total: scored.length, correct, incorrect: scored.length - correct, accuracy: scored.length ? Math.round((correct / scored.length) * 1000) / 10 : null, uniqueItems: points.size, answered: answers.length },
    byType: [...byType.values()].map((t) => ({ ...t, accuracy: Math.round((t.correct / t.total) * 1000) / 10 })),
    wrongAnswers: wrong,
    ratings: { total: ratings.length, ...Object.fromEntries(['forgot', 'hard', 'remembered', 'easy'].map((r) => [r, ratings.filter((x) => x.rating === r).length])),
      hardOrForgot: ratings.filter((r) => r.rating === 'forgot' || r.rating === 'hard').map((r) => ({ code: r.code, expression: r.expression, rating: r.rating })) },
  };
}

/** AI が日報を書くための材料：その日の数字と、すでにある日報。 */
export function reportContext(db, userId, { date } = {}) {
  const day = date ? checkDate(date) : localDate(nowIso(), zoneOf(db, userId));
  let existing = null;
  try { existing = getReport(db, userId, day); } catch { existing = null; }
  return { figures: dayFigures(db, userId, day), existing };
}

/**
 * 日報を保存（その日の分を置き換える）。数字はサーバーが数え直す（AI の数字は使わない）。
 * input：{ date, summary, strengths: [{ label, detail }], weaknesses: [...], confusions: [{ topic, knowledge: [W1], questions: [QV1] }],
 *          recommendations: [{ type, title, detail }], language }
 */
export function upsertReport(db, userId, input = {}) {
  const day = checkDate(input.date);
  const language = languageOf(db, userId, input.language);
  const figures = dayFigures(db, userId, day);
  const now = nowIso();
  const existing = db.prepare('SELECT rid FROM daily_reports WHERE user_id = ? AND summary_date = ?').get(userId, day);
  if (existing) db.prepare('DELETE FROM daily_reports WHERE rid = ?').run(existing.rid);
  const rid = Number(db.prepare(`INSERT INTO daily_reports (user_id, summary_date, time_zone, total_questions, correct_count, incorrect_count, accuracy, unique_items, generated_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(userId, day, figures.timeZone, figures.totals.total, figures.totals.correct, figures.totals.incorrect, figures.totals.accuracy,
    figures.totals.uniqueItems, now, now, now).lastInsertRowid);
  writeText(db, 'daily_reports', rid, 'summary', text(input.summary, 'summary', { optional: false, max: 20000 }), language);
  for (const t of figures.byType) db.prepare('INSERT INTO daily_report_type_stats (report_rid, type_id, total, correct, incorrect, accuracy) VALUES (?, ?, ?, ?, ?, ?)').run(rid, t.typeId, t.total, t.correct, t.incorrect, t.accuracy);
  for (const [kind, key] of [['strength', 'strengths'], ['weakness', 'weaknesses']]) {
    list(input[key], key, { max: 12 }).forEach((p, position) => {
      const pointRid = Number(db.prepare('INSERT INTO daily_report_points (report_rid, kind, position) VALUES (?, ?, ?)').run(rid, kind, position).lastInsertRowid);
      writeText(db, 'daily_report_points', pointRid, 'label', text(p?.label, `${key}[${position}].label`, { optional: false, max: 200 }), language);
      writeText(db, 'daily_report_points', pointRid, 'detail', p?.detail ?? null, language);
    });
  }
  list(input.confusions, 'confusions', { max: 12 }).forEach((c, position) => {
    const confusionRid = Number(db.prepare('INSERT INTO daily_report_confusions (report_rid, position) VALUES (?, ?)').run(rid, position).lastInsertRowid);
    writeText(db, 'daily_report_confusions', confusionRid, 'topic', text(c?.topic, `confusions[${position}].topic`, { optional: false, max: 200 }), language);
    for (const code of new Set(list(c?.knowledge, 'knowledge', { max: 20 }).map((x) => String(x).toUpperCase()))) {
      const point = db.prepare('SELECT rid FROM knowledge_points WHERE user_id = ? AND code = ?').get(userId, code);
      if (!point) throw new InputError(`找不到知识点：${code}`);
      db.prepare('INSERT INTO daily_report_confusion_points (confusion_rid, point_rid) VALUES (?, ?)').run(confusionRid, point.rid);
    }
    for (const code of new Set(list(c?.questions, 'questions', { max: 20 }).map((x) => String(x).toUpperCase()))) {
      const question = db.prepare('SELECT rid FROM questions WHERE user_id = ? AND code = ?').get(userId, code);
      if (!question) throw new InputError(`找不到题目：${code}`);
      db.prepare('INSERT INTO daily_report_confusion_questions (confusion_rid, question_rid) VALUES (?, ?)').run(confusionRid, question.rid);
    }
  });
  list(input.recommendations, 'recommendations', { max: 12 }).forEach((r, position) => {
    const recRid = Number(db.prepare('INSERT INTO daily_report_recommendations (report_rid, position, type) VALUES (?, ?, ?)').run(rid, position, oneOf(r?.type ?? 'practice', RECOMMENDATION_TYPES, `recommendations[${position}].type`)).lastInsertRowid);
    writeText(db, 'daily_report_recommendations', recRid, 'title', text(r?.title, `recommendations[${position}].title`, { optional: false, max: 200 }), language);
    writeText(db, 'daily_report_recommendations', recRid, 'detail', r?.detail ?? null, language);
  });
  figures.wrongAnswers.slice(0, 50).forEach((w, position) => {
    db.prepare(`INSERT INTO daily_report_wrong_answers (report_rid, position, question_rid, point_rid, selected, correct_answer)
      VALUES (?, ?, (SELECT rid FROM questions WHERE user_id = ? AND code = ?), (SELECT rid FROM knowledge_points WHERE user_id = ? AND code = ?), ?, ?)`)
      .run(rid, position, userId, w.question, userId, w.knowledge[0] ?? null, w.selected, w.correctAnswer);
  });
  return getReport(db, userId, day, { language });
}

export function getReport(db, userId, date, { language } = {}) {
  const lang = languageOf(db, userId, language);
  const r = db.prepare('SELECT * FROM daily_reports WHERE user_id = ? AND summary_date = ?').get(userId, checkDate(date));
  if (!r) throw new NotFoundError(`没有 ${date} 的每日总结`);
  const points = db.prepare('SELECT rid, kind FROM daily_report_points WHERE report_rid = ? ORDER BY kind, position').all(r.rid);
  const confusions = db.prepare('SELECT rid FROM daily_report_confusions WHERE report_rid = ? ORDER BY position').all(r.rid);
  const recs = db.prepare('SELECT rid, type FROM daily_report_recommendations WHERE report_rid = ? ORDER BY position').all(r.rid);
  const texts = pickTexts(db, [['daily_reports', r.rid], ...points.map((p) => ['daily_report_points', p.rid]), ...confusions.map((c) => ['daily_report_confusions', c.rid]),
    ...recs.map((x) => ['daily_report_recommendations', x.rid])], lang);
  const own = (table, rid) => texts.get(`${table}:${rid}`) ?? {};
  const point = (p) => ({ label: own('daily_report_points', p.rid).label ?? null, detail: own('daily_report_points', p.rid).detail ?? null });
  return {
    date: r.summary_date, timeZone: r.time_zone, generatedAt: r.generated_at, language: lang,
    totals: { total: r.total_questions, correct: r.correct_count, incorrect: r.incorrect_count, accuracy: r.accuracy, uniqueItems: r.unique_items },
    summary: own('daily_reports', r.rid).summary ?? null,
    byType: db.prepare('SELECT type_id, total, correct, incorrect, accuracy FROM daily_report_type_stats WHERE report_rid = ? ORDER BY type_id').all(r.rid)
      .map((t) => ({ typeId: t.type_id, total: t.total, correct: t.correct, incorrect: t.incorrect, accuracy: t.accuracy })),
    strengths: points.filter((p) => p.kind === 'strength').map(point), weaknesses: points.filter((p) => p.kind === 'weakness').map(point),
    confusions: confusions.map((c) => ({ topic: own('daily_report_confusions', c.rid).topic ?? null,
      knowledge: db.prepare('SELECT k.code, k.expression FROM daily_report_confusion_points x JOIN knowledge_points k ON k.rid = x.point_rid WHERE x.confusion_rid = ?').all(c.rid).map((k) => ({ code: k.code, expression: k.expression })),
      questions: db.prepare('SELECT q.code FROM daily_report_confusion_questions x JOIN questions q ON q.rid = x.question_rid WHERE x.confusion_rid = ?').all(c.rid).map((q) => q.code) })),
    recommendations: recs.map((x) => ({ type: x.type, title: own('daily_report_recommendations', x.rid).title ?? null, detail: own('daily_report_recommendations', x.rid).detail ?? null })),
    wrongAnswers: db.prepare(`SELECT w.selected, w.correct_answer, q.code AS question, q.prompt, k.code AS knowledge FROM daily_report_wrong_answers w LEFT JOIN questions q ON q.rid = w.question_rid
      LEFT JOIN knowledge_points k ON k.rid = w.point_rid WHERE w.report_rid = ? ORDER BY w.position`).all(r.rid)
      .map((w) => ({ question: w.question, prompt: w.prompt, knowledge: w.knowledge, selected: w.selected, correctAnswer: w.correct_answer })),
  };
}

export function listReports(db, userId, { limit = 30 } = {}) {
  return db.prepare('SELECT summary_date, total_questions, correct_count, accuracy FROM daily_reports WHERE user_id = ? ORDER BY summary_date DESC LIMIT ?')
    .all(userId, Math.min(366, Math.max(1, Number(limit) || 30))).map((r) => ({ date: r.summary_date, total: r.total_questions, correct: r.correct_count, accuracy: r.accuracy }));
}

/**
 * 毎日の練習を作る材料：設定（dailySource）の範囲の、間違えた問題と、評価が対象（既定は忘れた・難しい）のカード。
 * AI はこれを見て問題を作り（create_question_group）、練習にまとめる（create_practice_set kind daily）。
 */
export function dailyPracticeContext(db, userId, { now = new Date() } = {}) {
  const source = getSettings(db, userId).dailySource;
  const timeZone = source.timeZone || 'Asia/Tokyo';
  let since;
  let until = now.toISOString();
  if (source.window === 'last_hours') since = new Date(now.getTime() - (source.hours || 24) * 3600000).toISOString();
  else {
    const today = localDate(until, timeZone);
    const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const figures = dayFigures(db, userId, yesterday);
    return { window: { kind: 'previous_day', date: yesterday, timeZone }, sources: source, wrongAnswers: source.answers ? figures.wrongAnswers : [],
      cards: source.cardReviews ? figures.ratings.hardOrForgot.filter((c) => !source.ratings.length || source.ratings.includes(c.rating)) : [] };
  }
  const { answers, ratings, knowledge } = activityBetween(db, userId, since, until);
  return {
    window: { kind: 'last_hours', since, until, timeZone }, sources: source,
    wrongAnswers: source.answers ? answers.filter((a) => a.correct === 0).map((a) => ({ question: a.code, typeId: a.type_id, prompt: a.prompt, selected: a.selected_text ?? a.answer_text, correctAnswer: a.correct_text, knowledge: knowledge(a.question_rid).map((k) => k.code) })) : [],
    cards: source.cardReviews ? ratings.filter((r) => (source.ratings.length ? source.ratings : ['forgot', 'hard']).includes(r.rating)).map((r) => ({ code: r.code, expression: r.expression, rating: r.rating })) : [],
  };
}
