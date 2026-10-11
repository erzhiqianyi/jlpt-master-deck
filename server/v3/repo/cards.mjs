// 記憶カード（v3）：期限の来た知識項目と新しい項目をカードにする。表・裏の内容は学習者が選んだテンプレート（card_templates）で決まる。
// 自己評価（忘れた / 難しい / 覚えた / 簡単）は event_id で重複を除き、復習予定を進める。
import { createHash } from 'node:crypto';
import { scheduleAfterRating } from '../../../src/domain/reviewSchedule.mjs';
import { preferredLanguage, SUPPORTED_LANGUAGES } from '../i18n.mjs';
import { ConflictError, InputError, NotFoundError, nowIso, oneOf, text, LEVELS } from './common.mjs';
import { getKnowledge } from './knowledge.mjs';
import { getSettings } from './settings.mjs';
import { updateSchedule } from './practice.mjs';

const RATINGS = ['forgot', 'hard', 'remembered', 'easy'];
const SOURCES = ['ios', 'web', 'app', 'mcp'];
const languageOf = (db, userId, requested) => (SUPPORTED_LANGUAGES.includes(requested) ? requested : preferredLanguage(db, userId));

/** テンプレートの項目 → カードに載せる内容。 */
function fieldContent(point, field, { maxItems, withTranslation }) {
  const take = (items) => (maxItems ? items.slice(0, maxItems) : items);
  switch (field) {
    case 'expression': return [{ text: point.expression, lang: 'ja' }];
    case 'reading': return point.reading && point.reading !== point.expression ? [{ text: point.reading, lang: 'ja' }] : [];
    case 'romaji': return point.romaji ? [{ text: point.romaji }] : [];
    case 'meaning': return point.meaning ? [{ text: point.meaning.text, language: point.meaning.language, isFallback: point.meaning.isFallback ?? false }] : [];
    case 'meaning_ja': return point.meaningJa ? [{ text: point.meaningJa, lang: 'ja' }] : [];
    case 'paraphrase': return point.paraphrase ? [{ text: point.paraphrase, lang: 'ja' }] : [];
    case 'example': return take(point.examples).map((e) => ({ text: e.sentence, lang: 'ja', ...(withTranslation && e.translation ? { translation: e.translation.text } : {}) }));
    case 'memory_point': return take(point.memoryPoints).map((m) => ({ text: m.text }));
    case 'pattern': return take(point.patterns).map((p) => ({ text: p.pattern, lang: 'ja', ...(withTranslation && p.meaning ? { translation: p.meaning.text } : {}) }));
    case 'note': return take(point.notes).map((n) => ({ text: n.body?.text ?? '', ...(n.title ? { title: n.title.text } : {}) }));
    case 'image': return point.memoryImage && (point.memoryImage.media || point.memoryImage.url)
      ? [{ mediaId: point.memoryImage.media, url: point.memoryImage.url, caption: point.memoryImage.caption }] : [];
    default: return [];
  }
}

/** 知識項目 1 件のカード（学習者のテンプレートで表・裏を作る）。 */
export function cardFor(db, userId, code, { language } = {}) {
  const lang = languageOf(db, userId, language);
  const point = getKnowledge(db, userId, code, { language: lang });
  const templateCode = getSettings(db, userId).cardTemplates[point.kind];
  const template = db.prepare('SELECT rid, code FROM card_templates WHERE code = ?').get(templateCode);
  const fields = template ? db.prepare('SELECT side, field, max_items, with_translation FROM card_template_fields WHERE template_rid = ? ORDER BY side, position').all(template.rid) : [];
  const side = (name) => fields.filter((f) => f.side === name)
    .map((f) => ({ field: f.field, items: fieldContent(point, f.field, { maxItems: f.max_items, withTranslation: f.with_translation === 1 }) }))
    .filter((f) => f.items.length);
  return {
    code: point.code, kind: point.kind, template: templateCode, language: lang,
    front: side('front'), back: side('back'),
    schedule: point.review,
  };
}

/**
 * 今日のカード：期限の来た項目（期限の早い順）と、まだ学んでいない項目（登録の古い順）。
 * filters：{ kinds, wordbook, level, limit, newLimit }
 */
export function dueCards(db, userId, filters = {}) {
  const language = languageOf(db, userId, filters.language);
  const where = ['k.user_id = :user'];
  const params = { user: userId };
  const now = nowIso();
  if (filters.kinds?.length) { where.push('k.kind IN (SELECT value FROM json_each(:kinds))'); params.kinds = JSON.stringify(filters.kinds.map((k) => oneOf(k, ['word', 'grammar', 'name'], 'kinds'))); }
  if (filters.wordbook) { where.push('k.wordbook_rid = (SELECT rid FROM wordbooks WHERE user_id = :user AND code = :wordbook)'); params.wordbook = String(filters.wordbook).toUpperCase(); }
  if (filters.level) {
    const n = Number(oneOf(filters.level, LEVELS, 'level').slice(1));
    where.push('CAST(substr(k.jlpt_level_max, 2) AS INTEGER) <= :level AND CAST(substr(k.jlpt_level_min, 2) AS INTEGER) >= :level');
    params.level = n;
  }
  const limit = Math.min(200, Math.max(1, Number(filters.limit) || 30));
  const newLimit = Math.min(limit, Math.max(0, filters.newLimit == null ? 10 : Number(filters.newLimit)));
  const due = db.prepare(`SELECT k.code FROM knowledge_points k JOIN review_schedules r ON r.user_id = k.user_id AND r.point_rid = k.rid
    WHERE ${where.join(' AND ')} AND r.due_at <= :now ORDER BY r.due_at, k.rid LIMIT :limit`).all({ ...params, now, limit }).map((r) => r.code);
  const fresh = due.length < limit && newLimit ? db.prepare(`SELECT k.code FROM knowledge_points k WHERE ${where.join(' AND ')}
    AND NOT EXISTS (SELECT 1 FROM review_schedules r WHERE r.user_id = k.user_id AND r.point_rid = k.rid) ORDER BY k.captured_at, k.rid LIMIT :limit`)
    .all({ ...params, limit: Math.min(newLimit, limit - due.length) }).map((r) => r.code) : [];
  const counts = db.prepare(`SELECT
      (SELECT count(*) FROM knowledge_points k JOIN review_schedules r ON r.user_id = k.user_id AND r.point_rid = k.rid WHERE ${where.join(' AND ')} AND r.due_at <= :now) AS due,
      (SELECT count(*) FROM knowledge_points k WHERE ${where.join(' AND ')} AND NOT EXISTS (SELECT 1 FROM review_schedules r WHERE r.user_id = k.user_id AND r.point_rid = k.rid)) AS fresh`).get({ ...params, now });
  return { due: counts.due, new: counts.fresh, cards: [...due, ...fresh].map((code) => cardFor(db, userId, code, { language })) };
}

/** カードの自己評価。同じ eventId の二度目は保存済みの結果を返し、内容が違えば拒否する。 */
export function rateCard(db, userId, input = {}) {
  const point = db.prepare('SELECT rid, code FROM knowledge_points WHERE user_id = ? AND code = ?').get(userId, String(input.code ?? '').toUpperCase());
  if (!point) throw new NotFoundError(`找不到知识点：${input.code}`);
  const rating = oneOf(input.rating, RATINGS, 'rating');
  const eventId = text(input.eventId, 'eventId', { optional: false, max: 120 });
  const source = oneOf(input.source ?? 'web', SOURCES, 'source');
  const parsed = input.reviewedAt ? new Date(input.reviewedAt) : null;
  if (parsed && Number.isNaN(parsed.getTime())) throw new InputError('reviewedAt 应为时间');
  const reviewedAt = parsed ? parsed.toISOString() : nowIso();
  const previous = db.prepare('SELECT point_rid, rating FROM memory_ratings WHERE user_id = ? AND event_id = ?').get(userId, eventId);
  if (previous) {
    if (previous.point_rid !== point.rid || previous.rating !== rating) throw new ConflictError(`事件 ${eventId} 已用于另一次自评`);
    return { duplicate: true, code: point.code, rating, schedule: getKnowledge(db, userId, point.code).review };
  }
  db.prepare('INSERT INTO memory_ratings (user_id, event_id, point_rid, rating, reviewed_at, source) VALUES (?, ?, ?, ?, ?, ?)').run(userId, eventId, point.rid, rating, reviewedAt, source);
  const hash = createHash('sha256').update(JSON.stringify({ point: point.code, rating })).digest('hex');
  db.prepare(`INSERT INTO learning_events (user_id, event_id, event_type, occurred_at, received_at, payload_hash, question_rid, point_rid, selected_option_rid, selected_text, correct, type_id, rating, source, count_outcome)
    VALUES (?, ?, 'MemoryRated', ?, ?, ?, NULL, ?, NULL, NULL, NULL, NULL, ?, ?, 'counted')`).run(userId, eventId, reviewedAt, nowIso(), hash, point.rid, rating, source);
  const schedule = updateSchedule(db, userId, point.rid, (current) => scheduleAfterRating(current, rating, new Date(reviewedAt)));
  return { duplicate: false, code: point.code, rating, schedule };
}

/** 自己評価の記録（新しい順）。 */
export function listRatings(db, userId, { code, since, limit = 100 } = {}) {
  const where = ['m.user_id = :user'];
  const params = { user: userId };
  if (code) { where.push('k.code = :code'); params.code = String(code).toUpperCase(); }
  if (since) { where.push('m.reviewed_at >= :since'); params.since = String(since); }
  return db.prepare(`SELECT m.event_id, k.code, m.rating, m.reviewed_at, m.source FROM memory_ratings m JOIN knowledge_points k ON k.rid = m.point_rid
    WHERE ${where.join(' AND ')} ORDER BY m.reviewed_at DESC LIMIT :limit`).all({ ...params, limit: Math.min(1000, Math.max(1, Number(limit) || 100)) })
    .map((r) => ({ eventId: r.event_id, code: r.code, rating: r.rating, reviewedAt: r.reviewed_at, source: r.source }));
}
