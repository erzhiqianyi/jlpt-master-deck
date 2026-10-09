import { z } from 'zod';

// Unicode property escapes need JavaScript's `u` flag, which JSON Schema's
// `pattern` cannot carry and some MCP clients reject during tool discovery.
// Keep the exact kana check at runtime without exporting it as a regex pattern.
const kanaReading = /^[\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+$/u;
export const isKanaReading = (value) => kanaReading.test(value);

// No offsets: surfaces preserve punctuation/whitespace and concatenate to the exact source.
// This avoids JS UTF-16 vs Swift grapheme offset differences and stale ranges after edits.
export const japaneseAnnotationsSchema = z.array(z.object({
  text: z.string().min(1).max(30000),
  tokens: z.array(z.object({
    surface: z.string().min(1).max(30000),
    reading: z.string().min(1).max(1000)
      .refine(isKanaReading, 'Reading must contain kana only.')
      .describe('Kana-only reading; hiragana, katakana, ー, ・ and whitespace. Validated by the server.')
      .optional(),
    pos: z.enum(['noun', 'verb', 'particle', 'adjective', 'adverb', 'other']).optional(),
  }).strict()).min(1).max(10000),
}).strict().refine((entry) => entry.tokens.map((token) => token.surface).join('') === entry.text,
  'Token surfaces must concatenate to the exact original text, including punctuation and whitespace.')).max(1000)
  .describe('Japanese display annotations authored when generating content: [{text, tokens:[{surface, reading?, pos?}]}]. Include every Japanese sentence, prompt, choice and quoted expression. Preserve original text exactly: concatenate all surfaces including punctuation/whitespace to text. reading is contextual kana; pos is noun|verb|particle|adjective|adverb|other. Use other or omit pos when unsure, never guess. No HTML, inline reading parentheses, colors or display spacing in source. [] clears annotations; omitted preserves existing annotations on updates.');

export function normalizeJapaneseAnnotations(value) {
  return value === undefined ? [] : japaneseAnnotationsSchema.parse(value);
}

export function normalizeJapaneseDisplay(value) {
  const keys = ['noun', 'verb', 'particle', 'adjective'];
  const defaults = { noun: '#326B9C', verb: '#B65340', particle: '#8B5E9F', adjective: '#4F7C5C' };
  return {
    segmented: value?.segmented === true,
    styles: Object.fromEntries(keys.map((key) => {
      const style = value?.styles?.[key];
      return [key, {
        mode: ['none', 'underline', 'text'].includes(style?.mode) ? style.mode : 'underline',
        color: /^#[\da-f]{6}$/i.test(style?.color ?? '') ? style.color : defaults[key],
      }];
    })),
  };
}
