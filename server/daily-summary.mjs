import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { listCardReviews, cardReviewStats, calendarDayWindow } from './card-review-history.mjs';
import { ensureLearningEventSchema, learningEventsInWindow } from './learning-events.mjs';
import {readQuestionVersion} from './question-bank.mjs';

const dateSchema = z.iso.date();
const labeled = z.object({ label: z.string().min(1), detail: z.string().min(1) }).strict();
const confusion = z.object({ topic: z.string().min(1), items: z.array(z.string().min(1)).min(2), evidenceQuestionIds: z.array(z.string()).optional() }).strict();
const recommendation = z.object({ type: z.string().min(1), title: z.string().min(1), detail: z.string().min(1) }).strict();
const wrongQuestion = z.object({ questionId: z.string().min(1), questionReference: z.string().nullable().optional(), itemId: z.string().nullable().optional(), itemReference: z.string().nullable().optional(), selected: z.string(), correctAnswer: z.string().nullable().optional() }).strict();
const byKind = z.object({ kind: z.string(), total: z.number().int().nonnegative(), correct: z.number().int().nonnegative(), incorrect: z.number().int().nonnegative(), accuracy: z.number().min(0).max(1) }).strict();

export const dailySummaryInput = z.object({
  time_zone:z.string().refine(value=>{try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}},'Use an IANA time zone').optional(),
  date: dateSchema,
  total_questions: z.number().int().nonnegative(),
  correct_count: z.number().int().nonnegative(),
  incorrect_count: z.number().int().nonnegative(),
  accuracy: z.number().min(0).max(1),
  stats: z.object({ byKind: z.array(byKind), uniqueItems: z.number().int().nonnegative() }).strict(),
  strengths: z.array(labeled),
  weaknesses: z.array(labeled),
  confusion_groups: z.array(confusion),
  recommendations: z.array(recommendation),
  wrong_questions: z.array(wrongQuestion),
  summary_zh: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.total_questions !== value.correct_count + value.incorrect_count) ctx.addIssue({ code: 'custom', path: ['total_questions'], message: 'total_questions must equal correct_count + incorrect_count' });
  if (value.total_questions && Math.abs(value.accuracy - value.correct_count / value.total_questions) > 0.0001) ctx.addIssue({ code: 'custom', path: ['accuracy'], message: 'accuracy must match correct_count / total_questions' });
  if (!value.total_questions && value.accuracy !== 0) ctx.addIssue({ code: 'custom', path: ['accuracy'], message: 'accuracy must be zero when total_questions is zero' });
  const kindTotal = value.stats.byKind.reduce((sum, kind) => sum + kind.total, 0);
  if (kindTotal !== value.total_questions) ctx.addIssue({ code: 'custom', path: ['stats', 'byKind'], message: 'byKind totals must match total_questions' });
  for (const [index, kind] of value.stats.byKind.entries()) {
    if (kind.total !== kind.correct + kind.incorrect || Math.abs(kind.accuracy - (kind.total ? kind.correct / kind.total : 0)) > 0.0001) ctx.addIssue({ code: 'custom', path: ['stats', 'byKind', index], message: 'kind counts and accuracy must agree' });
  }
});

export function tokyoDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function validSummaryDate(value,timeZone='Asia/Tokyo') { return dateSchema.parse(value ?? new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())); }

export function ensureDailySummarySchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS daily_summaries (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    total_questions INTEGER NOT NULL,
    correct_count INTEGER NOT NULL,
    incorrect_count INTEGER NOT NULL,
    accuracy REAL NOT NULL,
    stats_json TEXT NOT NULL,
    strengths_json TEXT NOT NULL,
    weaknesses_json TEXT NOT NULL,
    confusion_groups_json TEXT NOT NULL,
    recommendations_json TEXT NOT NULL,
    wrong_questions_json TEXT NOT NULL,
    summary_zh TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, date)
  );
  CREATE INDEX IF NOT EXISTS daily_summaries_user_date ON daily_summaries(user_id, date DESC);`);
  if (!db.prepare('PRAGMA table_info(daily_summaries)').all().some(c=>c.name==='time_zone')) db.exec("ALTER TABLE daily_summaries ADD COLUMN time_zone TEXT NOT NULL DEFAULT 'Asia/Tokyo'");
}
function accountTimeZone(db,userId) {
  if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_settings'").get()) return 'Asia/Tokyo';
  const row=db.prepare('SELECT settings_json FROM user_settings WHERE user_id=?').get(userId);
  const zone=row?JSON.parse(row.settings_json).dailyPracticeSources?.timeZone:undefined;
  try { new Intl.DateTimeFormat('en',{timeZone:zone??'Asia/Tokyo'});return zone??'Asia/Tokyo'; } catch {return 'Asia/Tokyo';}
}

function mapSummary(row) {
  if (!row) return null;
  return {
    id: row.id, date: row.date,timeZone:row.time_zone??'Asia/Tokyo',
    totalQuestions: row.total_questions, correctCount: row.correct_count, incorrectCount: row.incorrect_count, accuracy: row.accuracy,
    stats: JSON.parse(row.stats_json), strengths: JSON.parse(row.strengths_json), weaknesses: JSON.parse(row.weaknesses_json),
    confusionGroups: JSON.parse(row.confusion_groups_json), recommendations: JSON.parse(row.recommendations_json), wrongQuestions: JSON.parse(row.wrong_questions_json),
    summaryZh: row.summary_zh, generatedAt: row.generated_at, updatedAt: row.updated_at,
  };
}

export function getDailySummary(db, userId, date) {
  const day = validSummaryDate(date,accountTimeZone(db,userId));
  const summary = mapSummary(db.prepare('SELECT * FROM daily_summaries WHERE user_id = ? AND date = ?').get(userId, day));
  return summary ? { ...summary, cardReviews: dailyCardReviewStats(db, userId, day,summary.timeZone) } : null;
}

export function listDailySummaries(db, userId, limit = 7) {
  return db.prepare('SELECT * FROM daily_summaries WHERE user_id = ? ORDER BY date DESC LIMIT ?').all(userId, limit).map(mapSummary);
}

export function upsertDailySummary(db, userId, input) {
  const value = dailySummaryInput.parse(input);
  const previous=db.prepare('SELECT time_zone FROM daily_summaries WHERE user_id=? AND date=?').get(userId,value.date);
  const timeZone=value.time_zone??previous?.time_zone??accountTimeZone(db,userId);
  if (previous&&value.time_zone&&previous.time_zone!==timeZone) throw new Error('Summary time zone conflicts with the saved calendar day');
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO daily_summaries
    (id, user_id, date, total_questions, correct_count, incorrect_count, accuracy, stats_json, strengths_json, weaknesses_json, confusion_groups_json, recommendations_json, wrong_questions_json, summary_zh, generated_at, updated_at,time_zone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      total_questions=excluded.total_questions, correct_count=excluded.correct_count, incorrect_count=excluded.incorrect_count, accuracy=excluded.accuracy,
      stats_json=excluded.stats_json, strengths_json=excluded.strengths_json, weaknesses_json=excluded.weaknesses_json,
      confusion_groups_json=excluded.confusion_groups_json, recommendations_json=excluded.recommendations_json,
      wrong_questions_json=excluded.wrong_questions_json, summary_zh=excluded.summary_zh, updated_at=excluded.updated_at`)
    .run(randomUUID(), userId, value.date, value.total_questions, value.correct_count, value.incorrect_count, value.accuracy,
      JSON.stringify(value.stats), JSON.stringify(value.strengths), JSON.stringify(value.weaknesses), JSON.stringify(value.confusion_groups),
      JSON.stringify(value.recommendations), JSON.stringify(value.wrong_questions), value.summary_zh, now, now,timeZone);
  return getDailySummary(db, userId, value.date);
}

export function dailyCardReviewStats(db, userId, date,timeZone=accountTimeZone(db,userId)) {
  const day = validSummaryDate(date,timeZone);
  return cardReviewStats(listCardReviews(db, userId,calendarDayWindow(day,timeZone)));
}
export function generateDailySummaryContext(db, userId, date, recentWeakPoints = {}) {
  const day = validSummaryDate(date,accountTimeZone(db,userId));
  const saved=db.prepare('SELECT time_zone FROM daily_summaries WHERE user_id=? AND date=?').get(userId,day);
  const window=calendarDayWindow(day,saved?.time_zone??accountTimeZone(db,userId));
  const legacyRows = db.prepare(`SELECT a.question_id, a.item_id, a.selected, a.correct, a.answered_at,
      q.kind, q.answer AS correct_answer, q.reference AS question_reference,
      q.prompt, q.context, q.correct_reason,
      i.reference AS item_reference, i.original AS item_original
    FROM answers a
    LEFT JOIN mcp_questions q ON q.user_id=a.user_id AND q.id=a.question_id
    LEFT JOIN mcp_items i ON i.user_id=a.user_id AND i.id=a.item_id
    WHERE a.user_id=? AND a.submission_state!='draft' AND julianday(a.answered_at)>=julianday(?) AND julianday(a.answered_at)<julianday(?)
    ORDER BY a.answered_at, a.question_id`).all(userId,window.start,window.end);
  ensureLearningEventSchema(db);
  const events=learningEventsInWindow(db,userId,{...window,type:'AnswerSubmitted'});
  const key=(questionId,time)=>JSON.stringify([questionId,Date.parse(time)]);
  const covered=new Set(events.map(event=>key(event.payload.questionId,event.occurredAt)));
  const rows=[...legacyRows.filter(row=>row.selected?.trim()&&!covered.has(key(row.question_id,row.answered_at))),...events.map(event=>{
    const payload=event.payload;
    const context=legacyRows.find(row=>row.question_id===payload.questionId)??{};
    const frozen=payload.questionRef?readQuestionVersion(db,userId,payload.questionRef):null;
    const evidence=frozen?{correct_answer:frozen.options?.find(option=>option.id===frozen.answer.optionId)?.text??null,prompt:frozen.legacy.prompt??frozen.legacy.question,context:frozen.legacy.context,correct_reason:frozen.legacy.correctReason??frozen.legacy.explanation}:{};
    return {...context,...evidence,question_id:payload.questionId,item_id:payload.itemId,selected:payload.selected,correct:payload.correct,answered_at:event.occurredAt,kind:payload.kind&&payload.kind!=='unknown'?payload.kind:context.kind,event_id:event.eventId};
  })];
  const kinds = new Map();
  const itemIds = new Set();
  const wrongAnswers = [];
  for (const row of rows) {
    itemIds.add(row.item_id);
    const kind = row.kind ?? kindFromQuestionId(row.question_id);
    const stat = kinds.get(kind) ?? { kind, total: 0, correct: 0, incorrect: 0, accuracy: 0 };
    stat.total++;
    if (row.correct) stat.correct++; else stat.incorrect++;
    stat.accuracy = stat.correct / stat.total;
    kinds.set(kind, stat);
    if (!row.correct) wrongAnswers.push({ questionId: row.question_id, questionReference: row.question_reference, itemId: row.item_id, itemReference: row.item_reference, itemOriginal: row.item_original, kind, selected: row.selected, correctAnswer: row.correct_answer,
      prompt: row.prompt?.slice(0, 800) ?? null, context: row.context?.slice(0, 800) ?? null, correctReason: row.correct_reason?.slice(0, 1000) ?? null });
  }
  const correct = rows.length - wrongAnswers.length;
  const relatedItems = db.prepare(`SELECT id, reference, original, deck, pattern FROM mcp_items WHERE user_id=? AND id IN (SELECT value FROM json_each(?))`)
    .all(userId, JSON.stringify([...itemIds])).map(({ id, reference, original, deck, pattern }) => ({ id, reference, original, deck, pattern }));
  return {
    date: day,window,
    cardReviews: dailyCardReviewStats(db, userId, day,window.timeZone),
    overallStats: { totalQuestions: rows.length, correctCount: correct, incorrectCount: wrongAnswers.length, accuracy: rows.length ? correct / rows.length : 0, uniqueItems: itemIds.size },
    statsByKind: [...kinds.values()].sort((a, b) => a.kind.localeCompare(b.kind)),
    wrongAnswers, relatedItems,
    recentWeakPoints: { weakestItems: recentWeakPoints.weakest_items ?? [], dueItems: recentWeakPoints.due_items ?? [] },
    instructions: ['Summarize evidence-based error patterns and grammar contrasts in Chinese. Do not infer a confusion solely from a wrong choice without checking the question and item context.', 'Use overallStats and statsByKind unchanged when calling upsert_daily_summary. Store only compact wrong-question references.', 'Describe objective question performance and subjective card reviews separately. Card ratings are not answer correctness. If neither answers nor card reviews exist, do not invent activity. A review-only day may have total_questions=0 and accuracy=0.'],
  };
}

function kindFromQuestionId(id) {
  return ['kanji-to-kana', 'kana-to-kanji', 'moji-goi', 'word-formation', 'meaning', 'usage', 'grammar'].find((part) => id.includes(`-${part}-`))?.replaceAll('-', '_') ?? 'unknown';
}
