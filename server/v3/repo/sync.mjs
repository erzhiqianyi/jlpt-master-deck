// 端末の同期（iOS）：オフラインで使うスナップショットを読み、オフラインのあいだに起きた学習イベントをまとめて受け取る。
// イベントは event_id で重複を除く（同じ番号の再送は一度だけ数え、内容が違えば拒否）。練習の開始は clientKey で一つにまとめる。
import { preferredLanguage } from '../i18n.mjs';
import { InputError, nowIso, oneOf, text } from './common.mjs';
import { getSettings, listCardTemplates } from './settings.mjs';
import { listWordbooks } from './wordbooks.mjs';
import { getKnowledge } from './knowledge.mjs';
import { getQuestionGroup } from './questions.mjs';
import { listPracticeSets, getPracticeSet, startAttempt, submitAnswer, completeAttempt, activeAttempt } from './practice.mjs';
import { rateCard } from './cards.mjs';

const MAX_EVENTS = 500;

/** 小さいもの全部：設定、単語帳、カード模板、復習予定、練習の一覧、知識点の件数と最終更新。 */
export function syncOverview(db, userId) {
  const language = preferredLanguage(db, userId);
  const knowledge = db.prepare('SELECT count(*) AS n, max(updated_at) AS updated FROM knowledge_points WHERE user_id = ?').get(userId);
  const schedules = db.prepare(`SELECT k.code, s.status, s.review_count, s.ease, s.interval_days, s.due_at, s.first_seen_at, s.last_reviewed_at
    FROM review_schedules s JOIN knowledge_points k ON k.rid = s.point_rid WHERE s.user_id = ? ORDER BY k.rid`).all(userId)
    .map((s) => ({ code: s.code, status: s.status, reviewCount: s.review_count, ease: s.ease, intervalDays: s.interval_days, dueAt: s.due_at,
      firstSeenAt: s.first_seen_at, lastReviewedAt: s.last_reviewed_at }));
  const active = activeAttempt(db, userId, { language });
  return {
    serverTime: nowIso(), language,
    settings: getSettings(db, userId),
    wordbooks: listWordbooks(db, userId),
    cardTemplates: listCardTemplates(db, language),
    questionTypes: db.prepare('SELECT type_id, module, label_ja, answer_mode FROM question_types ORDER BY sort_order').all()
      .map((t) => ({ typeId: t.type_id, module: t.module, labelJa: t.label_ja, answerMode: t.answer_mode })),
    knowledge: { total: knowledge.n, updatedAt: knowledge.updated },
    schedules,
    practiceSets: listPracticeSets(db, userId, { limit: 200, language }).items,
    activeAttempt: active ? { code: active.code, practice: active.practice, kind: active.kind } : null,
  };
}

/** 知識点の詳細を順に（since を渡すとそれより後に更新されたものだけ）。 */
export function syncKnowledge(db, userId, { offset = 0, limit = 100, since } = {}) {
  const size = Math.min(200, Math.max(1, Number(limit) || 100));
  const start = Math.max(0, Number(offset) || 0);
  const where = since ? 'user_id = ? AND updated_at > ?' : 'user_id = ?';
  const args = since ? [userId, String(since)] : [userId];
  const total = db.prepare(`SELECT count(*) AS n FROM knowledge_points WHERE ${where}`).get(...args).n;
  const codes = db.prepare(`SELECT code FROM knowledge_points WHERE ${where} ORDER BY rid LIMIT ? OFFSET ?`).all(...args, size, start).map((r) => r.code);
  const language = preferredLanguage(db, userId);
  const items = codes.map((code) => {
    const { questions, ...item } = getKnowledge(db, userId, code, { language });
    void questions;
    return item;
  });
  return { total, offset: start, items, nextOffset: start + items.length < total ? start + items.length : null,
    codes: since ? null : start === 0 ? db.prepare('SELECT code FROM knowledge_points WHERE user_id = ? ORDER BY rid').all(userId).map((r) => r.code) : null };
}

/** 練習一つ：題目の並びと、使う題組の全部（オフラインで採点できるよう正解と解説を含む。表示は答えた後だけにする）。 */
export function syncPractice(db, userId, code) {
  const language = preferredLanguage(db, userId);
  const set = getPracticeSet(db, userId, code, { language });
  const groupCodes = [...new Set([...set.entries, ...set.sections.flatMap((s) => s.entries)].map((e) => e.group))];
  const groups = groupCodes.map((group) => {
    const { review, ...full } = getQuestionGroup(db, userId, group, { language });
    void review;
    return full;
  });
  return { practice: set, groups };
}

function attemptCode(db, userId, key) {
  const value = String(key ?? '');
  const row = db.prepare('SELECT code FROM practice_attempts WHERE user_id = ? AND (client_key = ? OR code = ?)').get(userId, value, value.toUpperCase());
  if (!row) throw new InputError(`找不到练习记录：${value}（先提交 AttemptStarted）`);
  return row.code;
}

function applyOne(db, userId, event) {
  const eventId = text(event?.eventId, 'eventId', { optional: false, max: 120 });
  const type = oneOf(event.type, ['MemoryRated', 'AttemptStarted', 'AnswerSubmitted', 'AttemptCompleted'], 'type');
  const at = event.occurredAt ?? undefined;
  if (type === 'MemoryRated') {
    const result = rateCard(db, userId, { code: event.knowledge, rating: event.rating, eventId, reviewedAt: at, source: 'ios' });
    return { duplicate: Boolean(result.duplicate), schedule: result.schedule ?? null };
  }
  if (type === 'AttemptStarted') {
    const before = db.prepare('SELECT code FROM practice_attempts WHERE user_id = ? AND client_key = ?').get(userId, eventId);
    const attempt = startAttempt(db, userId, { clientKey: eventId, practice: event.practice ?? undefined, questions: event.questions ?? undefined, kind: event.kind ?? undefined, startedAt: at });
    return { duplicate: Boolean(before), attempt: attempt.code };
  }
  if (type === 'AnswerSubmitted') {
    const code = attemptCode(db, userId, event.attempt);
    const result = submitAnswer(db, userId, code, { question: event.question, selectedOptionId: event.selectedOptionId ?? undefined, answerText: event.answerText ?? undefined,
      eventId, answeredAt: at, elapsedMs: event.elapsedMs ?? undefined, source: 'ios' });
    return { duplicate: result.duplicate, attempt: code, correct: result.item?.answer?.correct ?? null };
  }
  const code = attemptCode(db, userId, event.attempt);
  const already = db.prepare('SELECT completed_at FROM practice_attempts WHERE user_id = ? AND code = ?').get(userId, code)?.completed_at;
  completeAttempt(db, userId, code, { completedAt: at });
  return { duplicate: Boolean(already), attempt: code };
}

/**
 * オフラインの学習イベントを起きた順に反映する。1 件ずつ結果を返す：applied / duplicate / rejected（入力の誤り・見つからない・食い違い）。
 * rejected のイベントは送り直しても通らないので、端末は記録して捨ててよい。予期しないエラーは全体を取り消す。
 */
export function applyEvents(db, userId, events) {
  if (!Array.isArray(events)) throw new InputError('events 应为数组');
  if (events.length > MAX_EVENTS) throw new InputError(`一次最多 ${MAX_EVENTS} 个事件`);
  const results = events.map((event) => {
    try {
      const { duplicate, ...rest } = applyOne(db, userId, event);
      return { eventId: event.eventId, status: duplicate ? 'duplicate' : 'applied', ...rest };
    } catch (error) {
      if (!error.statusCode) throw error;
      return { eventId: event?.eventId ?? null, status: 'rejected', error: error.message };
    }
  });
  return { results, serverTime: nowIso() };
}
