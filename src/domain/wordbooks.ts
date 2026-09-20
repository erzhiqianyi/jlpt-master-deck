import type { Deck, VocabItem, Wordbook } from '../types';

export type WordbookFamily = 'vocabulary' | 'grammar';

export function wordbookFamily(deck: Deck): WordbookFamily {
  return deck === 'grammar_expression' ? 'grammar' : 'vocabulary';
}

/** Wordbooks that belong to one library (单词本 or 语法本). */
export function wordbooksForFamily(wordbooks: Wordbook[], family: WordbookFamily) {
  return wordbooks.filter((wordbook) => wordbookFamily(wordbook.deck) === family);
}

/** An item is filed in exactly one wordbook: its own wordbook_id, or the built-in wordbook of its deck. */
export function itemWordbookId(item: VocabItem) {
  return item.wordbook_id || item.deck;
}

export function itemInWordbook(item: VocabItem, wordbookId: string) {
  return wordbookId === 'all' || itemWordbookId(item) === wordbookId;
}

const internalTags = new Set(['mcp-draft', 'codex-chat-review']);

export function itemTagList(item: VocabItem) {
  return [...new Set((item.tags ?? []).filter((tag) => tag && !internalTags.has(tag)))];
}

/** Tags worth offering as a filter: skip level labels, textbook-week markers and housekeeping tags. */
export function isFilterableTag(tag: string) {
  if (/^N[1-5](?:\/N[1-5])?$/.test(tag)) return false;
  if (/^教材・第\d+週$/.test(tag)) return false;
  if (tag.includes('単語') || tag.includes('单词')) return false;
  if (tag.includes('待整理')) return false;
  return tag.length > 1;
}

export function filterableTags(item: VocabItem) {
  return itemTagList(item).filter(isFilterableTag);
}
