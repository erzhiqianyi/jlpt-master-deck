// 语言相关的 MCP 工具（原型）。格式与 server/mcp-tools.mjs 一致：名称、说明、zod 参数、只读标注、处理函数。
// 翻译由用户自己连接的 AI 完成：先查语言设置和待翻译清单，翻译后逐条写回。
import { z } from 'zod';
import * as s from './service.mjs';

const ro = { readOnlyHint: true };
const write = { readOnlyHint: false, idempotentHint: true };
const text = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value });

const tool = (name, description, inputSchema, annotations, handler) => ({ name, description, inputSchema, annotations, handler });

export const languageTools = [
  tool('list_languages',
    'List the languages this app supports for meanings, translations and explanations (BCP 47 codes) and each language\'s fallback.',
    {}, ro, (_args, { db }) => text(s.listLanguages(db))),

  tool('get_language_settings',
    'Read the learner\'s interface language, explanation language and the fallback chain used when a translation is missing.',
    {}, ro, (_args, { db, userId }) => text(s.getLanguageSettings(db, userId))),

  tool('set_language_settings',
    'Change the learner\'s interface language and/or explanation language. Existing content is not translated automatically: '
    + 'call list_missing_translations afterwards and fill the gaps with set_translation.',
    {
      ui_language: z.string().optional().describe('Interface language code from list_languages.'),
      explanation_language: z.string().optional().describe('Language for meanings, translations and explanations.'),
    }, write, ({ ui_language, explanation_language }, { db, userId, now }) =>
      text(s.setLanguageSettings(db, userId, { uiLanguage: ui_language, explanationLanguage: explanation_language, now }))),

  tool('list_missing_translations',
    'List content that has no text in the given language. Each item has target_code, field, the Japanese source and existing '
    + 'translations in other languages for reference. Translate from the Japanese source; use references only for meaning.',
    {
      language: z.string().describe('Target language code.'),
      limit: z.number().int().min(1).max(200).optional().describe('Maximum items to return, default 50.'),
    }, ro, ({ language, limit }, { db, userId }) => text(s.listMissingTranslations(db, userId, { language, limit }))),

  tool('set_translation',
    'Write one field in one language, e.g. target_code "W12.m1" field "meaning", "W12.ex2" "translation", "QV15r1" "explanation", '
    + '"QV15r1.opt3" "analysis". Saved as AI-generated and unverified until the learner confirms it. '
    + 'Existing translations of question revisions already used in practice cannot be changed; adding a new language is allowed.',
    {
      target_code: z.string(), field: z.string(), language: z.string(), text: z.string().min(1).max(20000),
    }, write, ({ target_code, field, language, text: value }, { db, userId, now }) => {
      s.setTranslation(db, userId, { targetCode: target_code, field, language, text: value, origin: 'ai', now });
      return text({ ok: true, target_code, field, language });
    }),

  tool('set_ruby_annotation',
    'Add furigana to one field the learner asked about, Anki style: 寒[さむ]い. Put a space before a kanji that follows other '
    + 'characters (まだ 寒[さむ]い). Removing the brackets must give back the current text exactly. Japanese fields use language "ja".',
    {
      target_code: z.string(), field: z.string(), language: z.string().default('ja'), annotated_text: z.string().min(1),
    }, write, ({ target_code, field, language, annotated_text }, { db, userId, now }) =>
      text(s.setRubyAnnotation(db, userId, { targetCode: target_code, field, language, annotatedText: annotated_text, now }))),
];

// 模拟 MCP 调用：校验参数后执行（userId 来自认证上下文，不由 AI 传入）
export function callTool(name, args, context) {
  const entry = languageTools.find((t) => t.name === name);
  if (!entry) throw new Error(`未知工具：${name}`);
  return entry.handler(z.object(entry.inputSchema).strict().parse(args), context).structuredContent;
}
