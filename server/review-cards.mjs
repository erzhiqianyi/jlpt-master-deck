import { getStudyState, loadReviewData } from './storage.mjs';

// Only configured text fields enter the widget. Media needs separate authenticated delivery.
function cardField(item, field, locale) {
  const localized = item.localizations?.[locale] ?? {};
  const join = (values) => values.filter((value) => typeof value === 'string' && value.trim()).join(' · ');
  switch (field) {
    case 'images': return [];
    case 'reading': return item.reading === item.original ? [] : [item.reading];
    case 'meaning': return [localized.meaning ?? item.meaning_zh];
    case 'core_memory': return [localized.core_memory ?? item.core_memory];
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
