import type { Locale } from '../types';

// Card fields map onto the item fields shared by vocabulary and grammar (server/item-schema.mjs),
// so one front/back layout works for every deck. Keep in sync with server/storage.mjs.
export const memoryCardFields = [
  'original',
  'reading',
  'jlpt_level',
  'part_of_speech',
  'images',
  'meaning',
  'meaning_ja',
  'patterns',
  'core_memory',
  'explanation',
  'points',
  'comparisons',
  'register',
  'conjugations',
  'examples',
  'notes',
  'tags',
  'source',
] as const;

export type MemoryCardField = typeof memoryCardFields[number];

export const configurableMemoryCardFields: MemoryCardField[] = [...memoryCardFields];

export const defaultMemoryCardFrontFields: MemoryCardField[] = ['original'];
export const defaultMemoryCardBackFields: MemoryCardField[] = ['original', 'reading', 'images', 'patterns', 'meaning', 'examples', 'core_memory'];

const memoryCardFieldSet = new Set<string>(configurableMemoryCardFields);

export function normalizeMemoryCardFields(value: unknown, fallback: MemoryCardField[]): MemoryCardField[] {
  if (!Array.isArray(value)) return [...fallback];
  const fields = [...new Set(value.filter((field): field is MemoryCardField => typeof field === 'string' && memoryCardFieldSet.has(field)))];
  return fields.length ? fields : [...fallback];
}

export const memoryCardFieldLabels: Record<Locale, Record<MemoryCardField, string>> = {
  'zh-CN': {
    original: '原词 / 语法', reading: '读音', jlpt_level: 'JLPT 等级', part_of_speech: '词性', images: '记忆图片',
    meaning: '释义', meaning_ja: '日文释义', patterns: '接续 / 搭配', core_memory: '记忆点', explanation: '详细解析',
    points: '用法要点', comparisons: '辨析 / 日常说法', register: '语体与考试提示', conjugations: '活用',
    examples: '例句', notes: '备注', tags: '标签', source: '学习来源',
  },
  ja: {
    original: '語句 / 文法', reading: '読み方', jlpt_level: 'JLPT レベル', part_of_speech: '品詞', images: '記憶用の画像',
    meaning: '意味', meaning_ja: '日本語の意味', patterns: '接続 / 組み合わせ', core_memory: '記憶ポイント', explanation: '詳しい解説',
    points: '使い方のポイント', comparisons: '使い分け / 日常表現', register: '文体と試験ポイント', conjugations: '活用',
    examples: '例文', notes: 'メモ', tags: 'タグ', source: '学習元',
  },
  en: {
    original: 'Word / grammar', reading: 'Reading', jlpt_level: 'JLPT level', part_of_speech: 'Part of speech', images: 'Memory images',
    meaning: 'Meaning', meaning_ja: 'Japanese definition', patterns: 'Patterns / collocations', core_memory: 'Memory point', explanation: 'Detailed explanation',
    points: 'Usage points', comparisons: 'Contrasts / everyday forms', register: 'Register and exam tip', conjugations: 'Conjugations',
    examples: 'Examples', notes: 'Notes', tags: 'Tags', source: 'Learning source',
  },
};
