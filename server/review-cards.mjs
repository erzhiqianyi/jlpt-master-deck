import { getStudyState, loadReviewData, saveCardReview, getDb } from './storage.mjs';
import { normalizeCoreMemory } from '../src/domain/coreMemory.mjs';

// Only configured text fields enter the widget. Media needs separate authenticated delivery.
function cardField(item, field, locale) {
  const localized = item.localizations?.[locale] ?? {};
  const join = (values) => values.filter((value) => typeof value === 'string' && value.trim()).join(' · ');
  switch (field) {
    case 'images': return [];
    case 'reading': return item.reading === item.original ? [] : [item.reading];
    case 'meaning': return [localized.meaning ?? item.meaning_zh];
    case 'core_memory': return normalizeCoreMemory(localized.core_memory ?? item.core_memory);
    case 'explanation': return [localized.explanation ?? item.explanation_zh];
    case 'patterns': return (item.patterns ?? []).map((p) => join([p.pattern, p.connection_zh, p.meaning_zh]));
    case 'points': return (item.points ?? []).map((p) => join([p.label, p.detail_zh]));
    case 'comparisons': return (item.comparisons ?? []).map((p) => join([p.target, p.difference_zh]));
    case 'register': return [join([item.register?.note_zh, item.register?.exam_tip_zh])];
    case 'conjugations': return (item.conjugations ?? []).map((p) => typeof p === 'string' ? p : join(Object.values(p)));
    case 'examples': return (item.examples ?? []).slice(0, 3).map((p) => join([p.ja, p.zh]));
    case 'notes': case 'tags': return item[field] ?? [];
    case 'source': return [join([item.source?.sentence, item.source?.chat_summary])];
    default: return ['original', 'jlpt_level', 'part_of_speech', 'meaning_ja'].includes(field) ? [item[field]] : [];
  }
}

export function getReviewCards(userId, { deck, wordbook_id, only_due = true, limit = 20, offset = 0 } = {}) {
  const { settings, progress } = getStudyState(userId);
  const now = new Date().toISOString();
  const items = loadReviewData(userId).items.filter((item) =>
    (!deck || item.deck === deck) && (!wordbook_id || item.wordbook_id === wordbook_id)
    && (!only_due || !progress[item.id]?.nextReviewAt || progress[item.id].nextReviewAt <= now));
  const face = (item, fields) => fields.map((field) => ({ field,
    lines: cardField(item, field, settings.locale).filter((value) => typeof value === 'string' && value.trim()),
  })).filter((entry) => entry.lines.length);
  return {
    title: '复习卡片', locale: settings.locale, total: items.length, offset,
    next_offset: offset + limit < items.length ? offset + limit : null,
    filters: { ...(deck ? { deck } : {}), ...(wordbook_id ? { wordbook_id } : {}), only_due, limit },
    cards: items.slice(offset, offset + limit).map((item) => {
      const front = face(item, settings.memoryCardFrontFields);
      return { id: item.id, deck: item.deck,
        front: front.length ? front : [{ field: 'original', lines: [item.original] }],
        back: face(item, settings.memoryCardBackFields),
      };
    }),
  };
}

export const MEMORY_RATINGS = ['forgot', 'hard', 'remembered', 'easy'];

/** Apply the same intervals and ease adjustments as the website's focused review. */
export function rateReviewCard(userId, itemId, rating, now = new Date(), eventId) {
  if (!MEMORY_RATINGS.includes(rating)) throw new Error('Invalid card rating');
  const item = loadReviewData(userId).items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error('Review card not found');
  if (eventId) {
    const previous = getDb().prepare('SELECT item_id,rating FROM card_reviews WHERE user_id=? AND event_id=?').get(userId,eventId);
    if (previous) {
      if (previous.item_id !== itemId || previous.rating !== rating) throw new Error('Card review event ID conflicts with saved event');
      return { item_id: itemId, rating, progress: getStudyState(userId).progress[itemId] };
    }
  }
  const current = getStudyState(userId).progress[itemId] ?? { correct: 0, wrong: 0, status: 'new' };
  const intervals = { forgot: 0, hard: 1, remembered: 3, easy: 7 };
  const easeDelta = { forgot: -0.2, hard: -0.05, remembered: 0.05, easy: 0.15 };
  const nextDate = new Date(now);
  if (rating === 'forgot') nextDate.setMinutes(nextDate.getMinutes() + 10);
  else nextDate.setDate(nextDate.getDate() + intervals[rating]);
  const progress = {
    ...current,
    correct: current.correct,
    wrong: current.wrong,
    status: rating === 'forgot' ? 'learning' : (current.reviewCount ?? 0) >= 4 ? 'mastered' : 'review',
    firstSeenAt: current.firstSeenAt ?? now.toISOString(),
    lastReviewedAt: now.toISOString(),
    reviewCount: (current.reviewCount ?? 0) + 1,
    ease: Math.max(1.3, Math.min(3, (current.ease ?? 2.5) + easeDelta[rating])),
    intervalDays: intervals[rating],
    nextReviewAt: nextDate.toISOString(),
  };
  saveCardReview(userId, itemId, rating, progress, { eventId, reviewedAt: now.toISOString(), source: 'mcp' });
  return { item_id: itemId, rating, progress: getStudyState(userId).progress[itemId] };
}
