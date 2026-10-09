// v3 の MCP ツール：知識項目、単語帳、設定、言語、翻訳、ふりがな。旧ツールと同じ形（name, description, inputSchema, annotations, handler）。
import { z } from 'zod';
import { scheduleItemPronunciation } from '../tts/prewarm.mjs';
import { getV3Db, ensureUser } from './database.mjs';
import { transaction } from '../platform.mjs';
import { SUPPORTED_LANGUAGES, preferredLanguage } from './i18n.mjs';
import { getSettings, updateSettings, listLanguages, listCardTemplates } from './repo/settings.mjs';
import { listWordbooks, createWordbook, renameWordbook, deleteWordbook } from './repo/wordbooks.mjs';
import { listKnowledge, getKnowledge, createKnowledge, updateKnowledge, deleteKnowledge, lookupKnowledge, POS } from './repo/knowledge.mjs';
import { listMissingTranslations, setTranslation, setRubyAnnotation, listRubyAnnotations, listTranslationTargets } from './repo/translations.mjs';
import { setMemoryImage, removeMemoryImage, storeMedia, mediaFor, readMediaBytes } from './repo/media.mjs';
import { listQuestionTypes, validateGroup, listQuestionGroups, getQuestionGroup, createQuestionGroup, updateQuestionGroup, deleteQuestionGroup, setGroupStatus, groupOfQuestion } from './repo/questions.mjs';
import { reviewContext, submitReview, listGroupsForReview } from './repo/reviews.mjs';
import { listMaterials, getMaterial, createMaterial, updateMaterial, deleteMaterial } from './repo/materials.mjs';
import { createPracticeSet, listPracticeSets, getPracticeSet, deletePracticeSet, startAttempt, getAttempt, submitAnswer, completeAttempt, activeAttempt, listAttempts, listMistakes } from './repo/practice.mjs';
import { dueCards, rateCard, listRatings } from './repo/cards.mjs';
import { studyOverview } from './repo/stats.mjs';
import { learningHome } from './repo/home.mjs';
import { listCaptures, countCaptures, createCapture, setCaptureStatus } from './repo/inbox.mjs';
import { getRecording, listRecordings, claimRecording, saveRecordingAnalysis, deleteRecording } from './repo/recordings.mjs';
import { getPlan, savePlanProfile, saveGeneratedPlan, setTaskStatus, planContext } from './repo/plans.mjs';
import { reportContext, upsertReport, getReport, listReports, dailyPracticeContext } from './repo/reports.mjs';
import { createDraft, updateDraft, setDraftStatus, addDraftComment, deleteDraft, getDraft, listDrafts, publishDraft } from './repo/drafts.mjs';
import { sharingSources, buildPackage, listShares, shareDetail, importShare } from './repo/market.mjs';
import { aiHomeToolMeta, reviewCardsToolMeta, practiceToolMeta } from '../mcp-ui.mjs';

const ro = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const rw = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const destructive = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
const uid = (ctx) => Number(ctx.ownerId);
const json = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value });

/** ハンドラーを v3 データベースとトランザクションで包む。入力エラーは isError で返す。 */
function tool(name, description, inputSchema, annotations, handler, extra = {}) {
  return {
    name, description, inputSchema, annotations, ...extra,
    handler: async (args, ctx) => {
      const db = getV3Db();
      ensureUser(db, { id: uid(ctx) });
      try {
        const run = () => handler({ db, userId: uid(ctx), ctx }, args ?? {});
        return json(annotations.readOnlyHint ? run() : transaction(db, run));
      } catch (error) {
        if (!error.statusCode) throw error;
        return { isError: true, content: [{ type: 'text', text: error.message }] };
      }
    },
  };
}

const language = z.enum(SUPPORTED_LANGUAGES);
const level = z.enum(['N5', 'N4', 'N3', 'N2', 'N1']);
const knowledgeFields = {
  wordbook: z.string().optional().describe('Wordbook code such as WB1 (list_wordbooks). Required when creating.'),
  expression: z.string().optional().describe('The knowledge point itself in Japanese: the dictionary form or standard spelling of a word, or the pattern of a grammar point (～を皮切りに).'),
  reading: z.string().optional().describe('Kana reading. Romaji is generated from it.'),
  pos: z.enum(POS).optional().describe('Part of speech (Japanese-language-education categories): verb_1 (五段), verb_2 (一段), verb_3_suru, verb_3_kuru, i_adjective, na_adjective, noun, adverb, conjunction, adnominal, interjection, prefix, suffix, phrase, idiom. Words only; grammar and names have none. Conjugations are generated from it.'),
  transitivity: z.enum(['transitive', 'intransitive', 'both']).optional().describe('Verbs only.'),
  isSuruNoun: z.boolean().optional().describe('Noun that takes する (規制 → 規制する).'),
  baseForm: z.string().optional().describe('Dictionary form when it differs from expression.'),
  jlptLevel: z.union([level, z.object({ min: level, max: level })]).optional().describe('N1 or a range { min: "N2", max: "N1" } (min is the lower level).'),
  register: z.enum(['written', 'spoken', 'formal', 'both']).optional(),
  paraphrase: z.string().optional().describe('Short Japanese paraphrase, the correct option of 言い換え類義 questions; must differ from meaningJa.'),
  meaning: z.string().optional().describe('Meaning in `language`.'),
  meaningJa: z.string().optional().describe('Japanese dictionary-style definition.'),
  explanation: z.string().optional().describe('Detailed explanation in `language`.'),
  examples: z.array(z.object({ sentence: z.string(), reading: z.string().optional(), spokenSentence: z.string().optional(), targetReading: z.string().optional(),
    translation: z.string().optional(), spokenTranslation: z.string().optional(), analysis: z.string().optional(), formAnalysis: z.string().optional() })).optional()
    .describe('Natural Japanese example sentences; translations and analyses are in `language`. Replaces the list by position (translations in other languages are kept).'),
  memoryPoints: z.array(z.string()).optional().describe('Short memory points, one per entry.'),
  patterns: z.array(z.object({ pattern: z.string(), example: z.string().optional(), connection: z.string().optional(), meaning: z.string().optional(), exampleTranslation: z.string().optional() })).optional(),
  notes: z.array(z.object({ kind: z.enum(['register', 'exam_tip', 'key_point', 'other']), title: z.string().optional(), body: z.string() })).optional()
    .describe('Supplementary notes rendered as a list of title + body.'),
  comparisons: z.array(z.object({ target: z.string(), kind: z.enum(['synonym', 'everyday']).optional(), difference: z.string().optional() })).optional(),
  alternateForms: z.array(z.string()).optional(), relatedWords: z.array(z.string()).optional(), tags: z.array(z.string()).optional(),
  sources: z.array(z.object({ title: z.string(), url: z.string().optional() })).optional().describe('Dictionary entries, official pages, textbook chapters.'),
  sourceSentence: z.string().optional().describe('The Japanese sentence where the learner met this item.'),
  compileNote: z.string().optional().describe('Internal note on how the item was compiled; not shown to learners.'),
  questionKinds: z.array(z.string()).optional().describe('Official question type IDs suited to this item.'),
  distractors: z.record(z.string(), z.array(z.string())).optional().describe('Distractor options per question type ID.'),
  language: language.optional().describe('Language of meaning, explanation and translations in this call. Defaults to the learner explanation language.'),
};

// ---------- 题库的输入形式（所有题型共用）----------
const translated = z.union([z.string(), z.object({ text: z.string(), language: language.optional() }).passthrough()]);
const materialInput = z.object({
  role: z.enum(['main', 'passage_a', 'passage_b', 'notice', 'scene_image', 'audio']).describe('Role in the group: main passage, passage A / B (統合理解), notice or table (情報検索), scene image (発話表現), audio.'),
  material: z.string().optional().describe('Reuse an existing material by code (MT3). Omit the other fields then.'),
  kind: z.enum(['passage', 'notice', 'image', 'audio']).optional().describe('New material kind.'),
  body: z.string().optional().describe('Japanese text of a passage or notice (tables as Markdown). 文章の文法 blanks are written （１）（２）….'),
  transcript: z.string().optional().describe('Japanese transcript of audio.'),
  mediaId: z.number().int().optional().describe('Uploaded file id from upload_media (image or audio).'),
  clipStartMs: z.number().int().optional(), clipEndMs: z.number().int().optional(),
  title: translated.optional(), bodyTranslation: translated.optional(), summary: translated.optional(), structure: translated.optional(), transcriptTranslation: translated.optional(),
  sentences: z.array(z.object({ sentence: z.string(), isKey: z.boolean().optional(), translation: translated.optional() })).optional().describe('Sentence-by-sentence alignment; isKey marks sentences the answer depends on.'),
}).passthrough();
const questionInput = z.object({
  prompt: z.string().optional().describe('Japanese question text. Optional only where the type allows (listening).'),
  promptMediaId: z.number().int().optional().describe('The question\'s own audio or image.'),
  expectedText: z.string().optional().describe('Dictation only: the reference answer.'),
  translation: translated.optional().describe('Translation of the prompt.'),
  marks: z.array(z.object({ kind: z.enum(['target', 'blank', 'slot', 'star_slot']), start: z.number().int(), end: z.number().int(), label: z.string().nullable().optional(),
    material: z.string().nullable().optional().describe('Material role when the mark is in a passage (文章の文法); omit for the prompt.') })).optional()
    .describe('Positions are UTF-16 offsets (JavaScript text.slice(start, end)). underline types: target; blank types: blank; 文の組み立て: one slot per blank and exactly one star_slot.'),
  options: z.array(z.object({ id: z.number().int().nullable().optional().describe('Keep when editing: the option\'s fixed id from get_question_group.'),
    text: z.string().nullable().optional(), mediaId: z.number().int().nullable().optional(), correct: z.boolean().optional(),
    distractorType: z.string().nullable().optional().describe('Why a wrong option is tempting: 与原文不符, 语义相近, 形式相近 …'),
    analysis: translated.nullable().optional().describe('Why this option is right or wrong.'), translation: translated.nullable().optional() })).optional()
    .describe('Exactly one option has correct: true for choice types. The answer is the option, never a position.'),
  explanation: z.array(z.object({ kind: z.enum(['basis', 'step', 'full_answer', 'tip', 'objective']), title: translated.nullable().optional(), body: translated })).optional()
    .describe('Ordered explanation sections: basis (why the answer is right) is required for most types; step, full_answer (e.g. the complete sentence of 文の組み立て), tip, objective.'),
  evidence: z.array(z.object({ option: z.number().int().nullable().optional().describe('Option index (0-based) this evidence is about; omit for the whole question.'),
    material: z.string().nullable().optional(), source: z.enum(['prompt', 'body', 'transcript']), start: z.number().int().nullable().optional(), end: z.number().int().nullable().optional(),
    quote: z.string().describe('Verbatim Japanese quote; must match the text at start–end, or be found in the text when no position is given.') })).optional(),
  tags: z.array(z.string()).optional(),
  knowledge: z.array(z.object({ code: z.string(), relation: z.enum(['target', 'prerequisite', 'contrast']).optional() })).optional().describe('Knowledge points this question tests (W12, G3).'),
}).passthrough();
const groupInput = {
  typeId: z.string().describe('Question type id from get_question_types, e.g. vocabulary-kanji-reading, reading-short, listening-basic-dictation.'),
  status: z.enum(['draft', 'needs_review']).optional().describe('draft keeps it out of review and practice; default needs_review.'),
  level: z.enum(['N5', 'N4', 'N3', 'N2', 'N1']).nullable().optional().describe('Only a verified level, within the type\'s levels.'),
  official: z.boolean().optional(), shuffleOptions: z.boolean().optional().describe('Default true; false when options refer to each other or for official questions.'),
  instruction: z.string().nullable().optional(), instructionTranslation: translated.nullable().optional(),
  context: z.string().nullable().optional().describe('Scene, roles, task conditions (Japanese).'), contextTranslation: translated.nullable().optional(),
  sourceReference: z.string().nullable().optional(),
  materials: z.array(materialInput).optional(),
  questions: z.array(questionInput).describe('Sub-questions in order. Vocabulary and grammar types have exactly one.'),
  language: language.optional().describe('Language of translations, analyses and explanations given as plain strings. Defaults to the learner explanation language.'),
};
const groupCode = z.string().describe('Group code QS12, or a question code (QV12, QG3, QR5, QL8) of a question in it.');
const resolveGroup = (db, userId, code) => (/^QS\d+$/i.test(code) ? code : groupOfQuestion(db, userId, code));

export const v3Tools = [
  tool('list_languages', 'List the languages supported for meanings, translations and explanations and the fallback used when a text is missing.',
    {}, ro, ({ db }) => ({ languages: listLanguages(db) })),
  tool('get_settings', 'Read the learner settings: interface and explanation language, display, practice, speech and memory card templates.',
    {}, ro, ({ db, userId }) => getSettings(db, userId)),
  tool('update_settings', 'Change learner settings. Only the given keys change. Use cardTemplates { word, grammar, name } with template codes from list_card_templates.', {
    settings: z.record(z.string(), z.unknown()).describe('Partial settings, same shape as get_settings.'),
  }, rw, ({ db, userId }, args) => updateSettings(db, userId, args.settings)),
  tool('list_card_templates', 'List memory card templates per category (word, grammar, name) with the content shown on the front and back.',
    {}, ro, ({ db, userId }) => ({ templates: listCardTemplates(db, preferredLanguage(db, userId)) })),
  tool('list_wordbooks', 'List the learner wordbooks with live statistics (total, words, grammar, names, due, new, mastered). One wordbook may hold every category.',
    {}, ro, ({ db, userId }) => ({ wordbooks: listWordbooks(db, userId) })),
  tool('create_wordbook', 'Create a wordbook. Titles are unique per learner.', { title: z.string() }, rw, ({ db, userId }, args) => createWordbook(db, userId, args)),
  tool('rename_wordbook', 'Rename a wordbook by code (WB1).', { code: z.string(), title: z.string() }, rw, ({ db, userId }, args) => renameWordbook(db, userId, args.code, args)),
  tool('delete_wordbook', 'Delete an empty wordbook by code. Move or delete its knowledge points first.', { code: z.string() }, destructive,
    ({ db, userId }, args) => deleteWordbook(db, userId, args.code), { scope: 'library:write' }),
  tool('list_knowledge_points', 'Search knowledge points. q matches spelling, reading, romaji, code and meanings in any language. Filters: wordbook (WB1), kind, level, tag, status (new, learning, review, mastered, due).', {
    q: z.string().optional(), wordbook: z.string().optional(), kind: z.enum(['word', 'grammar', 'name']).optional(), level: level.optional(), tag: z.string().optional(),
    status: z.enum(['new', 'learning', 'review', 'mastered', 'due']).optional(), limit: z.number().int().min(1).max(500).optional(), offset: z.number().int().min(0).optional(),
  }, ro, ({ db, userId }, args) => listKnowledge(db, userId, args)),
  tool('get_knowledge_point', 'Read one knowledge point by code (W12, G3, N1) with every field, texts in the explanation language (with fallback information), generated conjugations, linked questions and review progress.',
    { code: z.string(), language: language.optional() }, ro, ({ db, userId }, args) => getKnowledge(db, userId, args.code, args)),
  tool('lookup_word', 'Exact lookup of a word against the learner library: spelling, reading, dictionary form, alternative spellings and generated conjugations (捉えて finds 捉える). Empty list when nothing matches — queue it with create_learning_capture.',
    { query: z.string() }, ro, ({ db, userId }, args) => ({ items: lookupKnowledge(db, userId, args.query) })),
  tool('create_knowledge_point', 'Create a knowledge point. kind decides the code prefix (word → W, grammar → G, name → N). Words need pos for conjugations; conjugations are generated, never supplied.', {
    kind: z.enum(['word', 'grammar', 'name']), ...knowledgeFields,
  }, rw, ({ db, userId }, args) => { const item = createKnowledge(db, userId, args); scheduleItemPronunciation(userId, item); return item; }, { scope: 'library:write' }),
  tool('update_knowledge_point', 'Change a knowledge point by code. Only the given fields change; list fields replace the list by position. kind cannot change. Pass wordbook to move it.', {
    code: z.string(), ...knowledgeFields,
  }, rw, ({ db, userId }, { code, ...changes }) => updateKnowledge(db, userId, code, changes), { scope: 'library:write' }),
  tool('delete_knowledge_point', 'Permanently delete a knowledge point by code with its examples, notes and review progress. Linked questions are kept.', { code: z.string() }, destructive,
    ({ db, userId }, args) => deleteKnowledge(db, userId, args.code), { scope: 'library:write' }),
  tool('get_translation_targets', 'List the targets (table:rid) of a knowledge point by code (W12): the point itself and each example, memory point, pattern, note and comparison by position, with their translatable fields and the languages already present. Pass a target to set_translation or set_ruby_annotation.',
    { code: z.string() }, ro, ({ db, userId }, args) => listTranslationTargets(db, userId, args.code)),
  tool('set_memory_image', 'Set the memory image of a knowledge point for one language (text inside the image is in that language). Write concept and prompt first (status prompt_ready); attach the generated image with image_base64 + mime or an https image_url (status becomes generated); set status approved once the learner accepts it. A grammar image should visibly contain its exact expression.', {
    code: z.string(), language: language.default('zh-Hans'),
    concept: z.string().max(2000).optional().describe('Scene idea linking the picture to the meaning.'),
    prompt: z.string().max(4000).optional().describe('Image-generation prompt written for this language.'),
    caption: z.string().max(120).optional().describe('Short memory hint shown under the image, in this language.'),
    image_base64: z.string().optional(), mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']).optional(), image_url: z.string().url().optional(),
    status: z.enum(['pending', 'prompt_ready', 'generated', 'approved']).optional(),
  }, rw, ({ db, userId }, { code, image_base64, image_url, ...rest }) => setMemoryImage(db, userId, code, { ...rest, imageBase64: image_base64, url: image_url }), { scope: 'library:write' }),
  tool('remove_memory_image', 'Remove the image of a knowledge point memory image in one language. The concept and prompt stay (status back to prompt_ready) unless all is true.',
    { code: z.string(), language: language.default('zh-Hans'), all: z.boolean().optional() }, destructive,
    ({ db, userId }, args) => removeMemoryImage(db, userId, args.code, args), { scope: 'library:write' }),

  // ---------- 题库 ----------
  tool('get_question_types', 'List the 26 question types with their module, marking style, option form, materials, answer mode, applicable levels, task, tip and the validation rules (required / optional / forbidden / warn) used when saving. Read before writing questions.',
    {}, ro, ({ db, userId }) => ({ types: listQuestionTypes(db, preferredLanguage(db, userId)) })),
  tool('validate_question', 'Check a question group against its type rules without saving. Returns errors (would be rejected) and warnings (saved as review findings). Same checks as create_question_group.',
    groupInput, ro, ({ db, userId }, args) => { const { ok, errors, warnings } = validateGroup(db, userId, args); return { ok, errors, warnings }; }),
  tool('list_question_groups', 'Search question groups (one group = one 大問: a single vocabulary/grammar question, or a passage / audio with its questions). Filters: module, typeId, status, level, knowledge (W12), q (prompt, option text or code).', {
    module: z.enum(['vocabulary', 'grammar', 'reading', 'listening']).optional(), typeId: z.string().optional(), status: z.enum(['draft', 'needs_review', 'needs_revision', 'ready', 'retired']).optional(),
    level: z.enum(['N5', 'N4', 'N3', 'N2', 'N1']).optional(), knowledge: z.string().optional(), q: z.string().optional(), limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).optional(),
  }, ro, ({ db, userId }, args) => listQuestionGroups(db, userId, args)),
  tool('get_question_group', 'Read a whole question group: materials, questions, marks, options with fixed ids and the correct one, explanation sections, evidence, linked knowledge points and the latest review. The result can be edited and passed back to update_question_group.',
    { code: groupCode, language: language.optional() }, ro, ({ db, userId }, args) => getQuestionGroup(db, userId, resolveGroup(db, userId, args.code), args)),
  tool('create_question_group', 'Create a question group of any type in the unified format. Rejected with an error list when a required/forbidden rule of the type fails (call validate_question first). Warnings become review findings; the group waits for review (needs_review) and becomes usable only after another agent passes it with submit_question_review.',
    groupInput, rw, ({ db, userId }, args) => createQuestionGroup(db, userId, args), { scope: 'library:write' }),
  tool('update_question_group', 'Replace a question group (pass the edited result of get_question_group). Questions keep their codes by position and options keep their ids when id is passed, so answer history stays linked. The type cannot change. The group goes back to needs_review (or draft).',
    { code: groupCode, ...groupInput }, rw, ({ db, userId }, { code, ...group }) => updateQuestionGroup(db, userId, resolveGroup(db, userId, code), group), { scope: 'library:write' }),
  tool('set_question_group_status', 'Set a group to draft, needs_review or retired (stop using it). ready is reached only through review.',
    { code: groupCode, status: z.enum(['draft', 'needs_review', 'retired']) }, rw, ({ db, userId }, args) => setGroupStatus(db, userId, resolveGroup(db, userId, args.code), args.status), { scope: 'library:write' }),
  tool('delete_question_group', 'Permanently delete a question group and its questions. Refused when a practice or draft uses one of its questions — retire it instead.',
    { code: groupCode }, destructive, ({ db, userId }, args) => deleteQuestionGroup(db, userId, resolveGroup(db, userId, args.code)), { scope: 'library:write' }),
  tool('list_question_reviews', 'List groups waiting for review (needs_review) or for revision after review (needs_revision), with their open findings. Revise needs_revision groups with update_question_group.', {
    status: z.enum(['needs_review', 'needs_revision']).optional(), limit: z.number().int().min(1).max(100).optional(), offset: z.number().int().min(0).optional(),
  }, ro, ({ db, userId }, args) => listGroupsForReview(db, userId, args)),
  tool('get_question_review_context', 'Everything needed to review one group: its full content, open findings (including automatic checks), the type rules, the review checklist and explanation template from the question type specification, and the review history.',
    { code: groupCode, language: language.optional() }, ro, ({ db, userId }, args) => reviewContext(db, userId, resolveGroup(db, userId, args.code), args)),
  tool('submit_question_review', 'Record your review of a group. pass → ready (usable in practice); revise → needs_revision with findings saying what to change; reject → retired. Judge every question and every option: is the answer unique, is each distractor tempting yet wrong, does the explanation cover every option. Do not review questions you just wrote.', {
    code: groupCode, verdict: z.enum(['pass', 'revise', 'reject']), summary: z.string().min(1).max(4000),
    findings: z.array(z.object({ question: z.string().optional().describe('Question code (QV12).'), optionId: z.number().int().optional(), check: z.string().describe('distractor_also_correct, distractor_too_weak, answer_not_unique, explanation_missing_option, unnatural_prompt, option_length_skew …'),
      severity: z.enum(['error', 'warning', 'info']).optional(), message: z.string() })).optional(),
    language: language.optional(),
  }, rw, ({ db, userId, ctx }, { code, ...review }) => submitReview(db, userId, resolveGroup(db, userId, code), { ...review, reviewer: 'ai', agentLabel: ctx.clientName ?? null }), { scope: 'library:write' }),


  // ---------- 练习、作答 ----------
  tool('start_practice', 'Start a practice for the learner. Choose questions with practice (a practice code such as DP3), questions (question codes), or filters to draw ready questions at random. Only reviewed (ready) questions are drawn; reading and listening groups come whole. Answers, explanations, transcripts and translations stay hidden until each question is answered. One practice is active at a time.', {
    practice: z.string().optional(), questions: z.array(z.string()).max(200).optional(),
    filters: z.object({ module: z.enum(['vocabulary', 'grammar', 'reading', 'listening']).optional(), typeIds: z.array(z.string()).optional(), level: z.enum(['N5', 'N4', 'N3', 'N2', 'N1']).optional(),
      wordbook: z.string().optional(), knowledge: z.array(z.string()).optional().describe('Knowledge point codes the questions test.'), onlyDue: z.boolean().optional(),
      statuses: z.array(z.enum(['new', 'learning', 'review', 'mastered'])).optional(), excludeAnsweredCorrectly: z.boolean().optional(), count: z.number().int().min(1).max(100).optional() }).optional(),
    kind: z.enum(['daily', 'vocabulary', 'grammar', 'reading', 'listening', 'mixed', 'mock']).optional(), title: z.string().optional(), language: language.optional(),
  }, rw, ({ db, userId }, args) => startAttempt(db, userId, args), { title: '开始练习', _meta: practiceToolMeta }),
  tool('get_practice', 'Read a practice record (AT12) or the active one when code is omitted: questions in order, the learner answers so far and, for answered questions only, the correct option, explanation and translations.',
    { code: z.string().optional(), language: language.optional() }, ro, ({ db, userId }, args) => (args.code ? getAttempt(db, userId, args.code, args) : activeAttempt(db, userId, args) ?? { active: null }), { title: '继续练习', _meta: practiceToolMeta }),
  tool('submit_answer', 'Record the learner own answer to one question of a practice: selectedOptionId for choice questions (the option id, not its position), answerText for dictation, recordingId for shadowing. Pass a fresh eventId per answer; a repeated eventId is counted once. Updates mistakes and the review schedule of the tested knowledge points, and returns the result with the explanation.', {
    attempt: z.string(), question: z.string().describe('Question code in the practice, e.g. QV12.'), selectedOptionId: z.number().int().optional(), answerText: z.string().optional(), recordingId: z.number().int().optional(),
    eventId: z.string().min(1).max(120), startedAt: z.string().optional(), elapsedMs: z.number().int().min(0).optional(),
  }, rw, ({ db, userId }, { attempt, ...answer }) => submitAnswer(db, userId, attempt, { ...answer, source: 'mcp' })),
  tool('complete_practice', 'Finish a practice record; it is no longer active and its score is final.', { attempt: z.string() }, rw, ({ db, userId }, args) => completeAttempt(db, userId, args.attempt)),
  tool('list_practice_history', 'List practice records, newest first, with answered and correct counts computed from the answers.', {
    kind: z.enum(['daily', 'vocabulary', 'grammar', 'reading', 'listening', 'mixed', 'mock']).optional(), practice: z.string().optional(), completed: z.boolean().optional(),
    limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).optional(),
  }, ro, ({ db, userId }, args) => listAttempts(db, userId, args)),
  tool('list_mistakes', 'List questions whose latest answer was wrong, with the chosen and the correct option.', {
    module: z.enum(['vocabulary', 'grammar', 'reading', 'listening']).optional(), limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).optional(),
  }, ro, ({ db, userId }, args) => listMistakes(db, userId, args)),
  tool('create_practice_set', 'Create a practice the learner can start later: a daily practice (kind daily), a topic or mixed practice, or a mock exam (kind mock, one section per session with durationMinutes). Give sections with question codes, a flat questions list, or filters to draw ready questions. Create and review the questions first with create_question_group.', {
    kind: z.enum(['daily', 'topic', 'mixed', 'mock']), title: z.string(), description: z.string().optional(), disclaimer: z.string().optional(), sourceSummary: z.string().optional(),
    date: z.string().optional().describe('YYYY-MM-DD; daily practices default to today.'), minutes: z.number().int().min(1).max(600).optional(), level: z.enum(['N5', 'N4', 'N3', 'N2', 'N1']).optional(),
    strategy: z.enum(['approved_draft_full_set', 'agent_topic', 'targeted_by_history']).optional(),
    sections: z.array(z.object({ title: z.string().optional(), description: z.string().optional(), instruction: z.string().optional(), durationMinutes: z.number().int().optional(),
      scheduledDate: z.string().optional(), questions: z.array(z.string()) })).optional(),
    questions: z.array(z.string()).optional(),
    filters: z.object({ module: z.enum(['vocabulary', 'grammar', 'reading', 'listening']).optional(), typeIds: z.array(z.string()).optional(), level: z.enum(['N5', 'N4', 'N3', 'N2', 'N1']).optional(),
      wordbook: z.string().optional(), onlyDue: z.boolean().optional(), statuses: z.array(z.enum(['new', 'learning', 'review', 'mastered'])).optional(), count: z.number().int().min(1).max(100).optional() }).optional(),
    language: language.optional(),
  }, rw, ({ db, userId }, args) => createPracticeSet(db, userId, args), { scope: 'library:write' }),
  tool('list_practice_sets', 'List daily, topic, mixed practices and mock exams with question counts and completions.', {
    kind: z.enum(['daily', 'topic', 'mixed', 'mock']).optional(), date: z.string().optional(), limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).optional(),
  }, ro, ({ db, userId }, args) => listPracticeSets(db, userId, args)),
  tool('get_practice_set', 'Read one practice (DP3, TP2, MX1): sections, question codes and the records of attempts at it.',
    { code: z.string(), language: language.optional() }, ro, ({ db, userId }, args) => getPracticeSet(db, userId, args.code, args)),
  tool('delete_practice_set', 'Delete a practice. Its practice records stay (without the link).', { code: z.string() }, destructive, ({ db, userId }, args) => deletePracticeSet(db, userId, args.code), { scope: 'library:write' }),

  // ---------- 记忆卡片、统计 ----------
  tool('get_due_cards', 'Memory cards to review now: knowledge points whose review is due (earliest first) followed by new ones. The front and back follow the learner chosen card template for each kind. Show the front first; reveal the back before asking for a rating.', {
    kinds: z.array(z.enum(['word', 'grammar', 'name'])).optional(), wordbook: z.string().optional(), level: z.enum(['N5', 'N4', 'N3', 'N2', 'N1']).optional(),
    limit: z.number().int().min(1).max(200).optional(), newLimit: z.number().int().min(0).max(200).optional(), language: language.optional(),
  }, ro, ({ db, userId }, args) => dueCards(db, userId, args), { title: '复习卡片', _meta: reviewCardsToolMeta }),
  tool('rate_card', 'Save the learner own memory rating of one card: forgot, hard, remembered or easy. Pass a fresh eventId; repeats are counted once. Returns the next review time.', {
    code: z.string().describe('Knowledge point code, e.g. W12.'), rating: z.enum(['forgot', 'hard', 'remembered', 'easy']), eventId: z.string().min(1).max(120), reviewedAt: z.string().optional(),
  }, rw, ({ db, userId }, args) => rateCard(db, userId, { ...args, source: 'mcp' })),
  tool('list_card_ratings', 'List memory ratings, newest first.', { code: z.string().optional(), since: z.string().optional(), limit: z.number().int().min(1).max(1000).optional() }, ro,
    ({ db, userId }, args) => ({ ratings: listRatings(db, userId, args) })),
  tool('get_study_overview', 'Study statistics computed from answers and ratings: accuracy per question type, daily answers and ratings, knowledge points by state (new, learning, review, mastered, due) and the current streak.', {
    days: z.number().int().min(1).max(366).optional(), module: z.enum(['vocabulary', 'grammar', 'reading', 'listening']).optional(),
  }, ro, ({ db, userId }, args) => studyOverview(db, userId, args)),

  tool('get_ai_learning_home', 'Open the learner AI study home: due cards by kind, cards reviewed today, recent practices and suggested next steps.',
    {}, ro, ({ db, userId }) => learningHome(db, userId), { title: 'AI 学习首页', _meta: aiHomeToolMeta }),


  // ---------- 收集箱 ----------
  tool('count_learning_captures', 'Count inbox entries without reading them. Same status / category filters as list_learning_captures; omit status to count every status.', {
    status: z.enum(['inbox', 'processed', 'archived']).optional(), category: z.enum(['word', 'grammar', 'sentence', 'listening', 'reading', 'unsure']).optional(),
  }, ro, ({ db, userId }, args) => countCaptures(db, userId, args)),
  tool('list_learning_captures', 'Read the inbox of things the learner noted while studying (words, grammar, sentences, listening or reading questions), newest first. Use status inbox for unprocessed entries. Returns {total,items,nextCursor}; pass nextCursor back as cursor (with the same filters) for the next page. Marking entries processed does not make the next page skip any.', {
    status: z.enum(['inbox', 'processed', 'archived']).optional(), category: z.enum(['word', 'grammar', 'sentence', 'listening', 'reading', 'unsure']).optional(), limit: z.number().int().min(1).max(500).optional(),
    cursor: z.string().max(40).optional().describe('nextCursor of the previous page (an inbox code such as IN12).'),
  }, ro, ({ db, userId }, args) => listCaptures(db, userId, args)),
  tool('create_learning_capture', 'Add something to the learner inbox for later processing, e.g. a word lookup that found nothing. wordbook (WB1) is where it should go once processed.', {
    body: z.string().min(1).max(4000), category: z.enum(['word', 'grammar', 'sentence', 'listening', 'reading', 'unsure']).optional(), context: z.string().max(8000).optional(), wordbook: z.string().optional(),
  }, rw, ({ db, userId }, args) => createCapture(db, userId, args)),
  tool('update_learning_capture_status', 'Mark an inbox entry (IN12) processed after turning it into knowledge points or questions, or archived.', {
    code: z.string(), status: z.enum(['inbox', 'processed', 'archived']),
  }, rw, ({ db, userId }, args) => setCaptureStatus(db, userId, args.code, args.status)),

  // ---------- 跟读录音 ----------
  tool('list_recordings', 'List the learner shadowing / speaking recordings with their analysis. status pending lists recordings waiting for your analysis.', {
    question: z.string().optional(), status: z.enum(['pending', 'analyzing', 'completed', 'failed']).optional(), limit: z.number().int().min(1).max(200).optional(),
  }, ro, ({ db, userId }, args) => ({ recordings: listRecordings(db, userId, args) })),
  tool('claim_recording', 'Start analysing a recording (RC3): marks it analyzing and returns its mediaId and the reference transcript. Listen to it with get_media, compare with the reference, then save_recording_analysis.',
    { code: z.string() }, rw, ({ db, userId }, args) => claimRecording(db, userId, args.code)),
  tool('save_recording_analysis', 'Write your analysis of a recording: what the learner said (transcript), a summary, strengths, improvements and the next practice suggestion.', {
    code: z.string(), status: z.enum(['completed', 'failed']).optional(), transcript: z.string().optional(), summary: z.string().optional(), nextPractice: z.string().optional(),
    strengths: z.array(z.string()).max(12).optional(), improvements: z.array(z.string()).max(12).optional(), language: language.optional(),
  }, rw, ({ db, userId }, { code, ...analysis }) => saveRecordingAnalysis(db, userId, code, analysis)),
  tool('delete_recording', 'Permanently delete a recording and its analysis.', { code: z.string() }, destructive, ({ db, userId }, args) => deleteRecording(db, userId, args.code), { scope: 'library:write' }),

  // ---------- 学习计划 ----------
  tool('get_study_plan', 'Read the learner study plan: exam, level, dates, weekly days, daily minutes, materials, strategy, phases and dated tasks with their status.',
    {}, ro, ({ db, userId }) => getPlan(db, userId)),
  tool('get_plan_generation_context', 'Everything needed to write or refresh the study plan: the current plan and profile, study statistics, item states and recent mistakes.',
    {}, ro, ({ db, userId }) => planContext(db, userId)),
  tool('save_study_plan_profile', 'Save the learner plan profile and materials (what the learner tells you). A generated plan becomes needs_refresh.', {
    examName: z.string().optional(), level: z.enum(['N5', 'N4', 'N3', 'N2', 'N1']).optional(), startDate: z.string().optional(), examDate: z.string().optional(),
    studyDaysPerWeek: z.number().int().min(1).max(7).optional(), dailyMinutes: z.number().int().min(5).max(720).optional(), materialStartStatus: z.string().optional(),
    fixedSchedule: z.string().optional(), supplementalNeeds: z.string().optional(),
    materials: z.array(z.object({ title: z.string(), module: z.enum(['vocabulary', 'grammar', 'reading', 'listening', 'other']).optional(), currentPosition: z.string().optional() })).optional(),
    language: language.optional(),
  }, rw, ({ db, userId }, args) => savePlanProfile(db, userId, args)),
  tool('save_generated_study_plan', 'Save a complete plan you generated: strategy texts, phases and dated tasks (material is the index of a profile material). Pending tasks are replaced; completed and skipped ones stay.', {
    phaseStrategy: z.string().optional(), postMaterialStrategy: z.string().optional(), goal: z.string().optional(),
    phases: z.array(z.object({ startDate: z.string(), endDate: z.string(), focus: z.string().optional(), goal: z.string().optional(), points: z.array(z.string()).optional() })).optional(),
    tasks: z.array(z.object({ date: z.string(), module: z.enum(['vocabulary', 'grammar', 'reading', 'listening', 'other']), minutes: z.number().int().min(1).max(720).optional(),
      material: z.number().int().min(0).optional(), title: z.string(), detail: z.string().optional(), sourceLabel: z.string().optional() })).min(1).max(2000),
    language: language.optional(),
  }, rw, ({ db, userId }, args) => saveGeneratedPlan(db, userId, args)),
  tool('set_plan_task_status', 'Mark a plan task (TK12) completed, skipped, missed or pending.', { code: z.string(), status: z.enum(['pending', 'completed', 'skipped', 'missed']) }, rw,
    ({ db, userId }, args) => setTaskStatus(db, userId, args.code, args.status)),

  // ---------- 每日总结、每日练习依据 ----------
  tool('get_daily_summary_context', 'Figures for one day (date YYYY-MM-DD, learner time zone; default today) computed from saved answers and card ratings: totals, accuracy by type, wrong answers with the tested items, hard and forgotten cards, plus the existing summary. Write the summary from these facts.',
    { date: z.string().optional() }, ro, ({ db, userId }, args) => reportContext(db, userId, args)),
  tool('save_daily_summary', 'Save the daily summary you wrote for a date. The numbers are recounted by the server; you supply the text: summary, strengths, weaknesses, confusions (with knowledge and question codes as evidence) and recommendations.', {
    date: z.string(), summary: z.string().min(1).max(20000),
    strengths: z.array(z.object({ label: z.string(), detail: z.string().optional() })).max(12).optional(), weaknesses: z.array(z.object({ label: z.string(), detail: z.string().optional() })).max(12).optional(),
    confusions: z.array(z.object({ topic: z.string(), knowledge: z.array(z.string()).optional(), questions: z.array(z.string()).optional() })).max(12).optional(),
    recommendations: z.array(z.object({ type: z.enum(['review', 'practice', 'quality', 'priority', 'card_review']), title: z.string(), detail: z.string().optional() })).max(12).optional(),
    language: language.optional(),
  }, rw, ({ db, userId }, args) => upsertReport(db, userId, args)),
  tool('get_daily_summary', 'Read the saved daily summary of a date.', { date: z.string() }, ro, ({ db, userId }, args) => getReport(db, userId, args.date)),
  tool('list_daily_summaries', 'List saved daily summaries, newest first, with their totals.', { limit: z.number().int().min(1).max(366).optional() }, ro, ({ db, userId }, args) => ({ reports: listReports(db, userId, args) })),
  tool('get_daily_practice_context', 'Material for today daily practice, following the learner daily source settings: wrong answers and hard or forgotten cards in the window. Create the questions (create_question_group), have them reviewed, then put them in a daily practice (create_practice_set kind daily, or a draft for the learner to confirm).',
    {}, ro, ({ db, userId }) => dailyPracticeContext(db, userId)),

  // ---------- AI 草稿 ----------
  tool('create_practice_draft', 'Create a practice draft for the learner to read and confirm: title, description, objectives, sections with explanation text and question codes, an optional quiz and generated questions. Create the questions first with create_question_group (status draft is fine).', {
    title: z.string(), description: z.string().optional(), nextStep: z.string().optional(), kind: z.enum(['daily_review_pack', 'grammar_practice']).optional(),
    strategy: z.enum(['targeted_by_history', 'agent_topic']).optional(), targetLevel: z.enum(['N5', 'N4', 'N3', 'N2', 'N1']).optional(), date: z.string().optional(), minutes: z.number().int().min(1).max(600).optional(),
    objectives: z.array(z.string()).max(20).optional(),
    sections: z.array(z.object({ title: z.string().optional(), body: z.string().optional(), instruction: z.string().optional(), questions: z.array(z.string()).optional() })).max(20).optional(),
    quiz: z.array(z.string()).optional(), generated: z.array(z.string()).optional(), language: language.optional(),
  }, rw, ({ db, userId }, args) => createDraft(db, userId, args)),
  tool('list_practice_drafts', 'List practice drafts with their status (draft, needs_revision, approved, archived), question and comment counts.', {
    status: z.enum(['draft', 'needs_revision', 'approved', 'archived']).optional(), limit: z.number().int().min(1).max(200).optional(),
  }, ro, ({ db, userId }, args) => ({ drafts: listDrafts(db, userId, args) })),
  tool('get_practice_draft', 'Read a draft (DR7) with objectives, sections, question codes with their review status, and the learner comments to address.',
    { code: z.string(), language: language.optional() }, ro, ({ db, userId }, args) => getDraft(db, userId, args.code, args)),
  tool('update_practice_draft', 'Revise a draft after the learner comments. Given fields change; sections, quiz and generated replace the lists. The draft goes back to draft for the learner to confirm.', {
    code: z.string(), title: z.string().optional(), description: z.string().optional(), nextStep: z.string().optional(), targetLevel: z.enum(['N5', 'N4', 'N3', 'N2', 'N1']).optional(),
    date: z.string().optional(), minutes: z.number().int().min(1).max(600).optional(), objectives: z.array(z.string()).max(20).optional(),
    sections: z.array(z.object({ title: z.string().optional(), body: z.string().optional(), instruction: z.string().optional(), questions: z.array(z.string()).optional() })).max(20).optional(),
    quiz: z.array(z.string()).optional(), generated: z.array(z.string()).optional(), language: language.optional(),
  }, rw, ({ db, userId }, { code, ...changes }) => updateDraft(db, userId, code, changes)),
  tool('add_draft_comment', 'Add a comment to a draft (as the agent, e.g. what you changed). The learner comments are listed by get_practice_draft.', { code: z.string(), body: z.string().min(1).max(8000) }, rw,
    ({ db, userId }, args) => addDraftComment(db, userId, args.code, args.body)),
  tool('set_practice_draft_status', 'Set a draft status: approved when the learner confirmed it, needs_revision, draft or archived.', { code: z.string(), status: z.enum(['draft', 'needs_revision', 'approved', 'archived']) }, rw,
    ({ db, userId }, args) => setDraftStatus(db, userId, args.code, args.status)),
  tool('publish_practice_draft', 'Publish a confirmed draft as a daily practice. Every question group in it must have passed review (ready).', { code: z.string(), date: z.string().optional(), title: z.string().optional() }, rw,
    ({ db, userId }, { code, ...options }) => publishDraft(db, userId, code, options), { scope: 'library:write' }),
  tool('delete_practice_draft', 'Delete a draft. Its questions stay in the question bank.', { code: z.string() }, destructive, ({ db, userId }, args) => deleteDraft(db, userId, args.code), { scope: 'library:write' }),

  // ---------- 市场 ----------
  tool('list_market_sources', 'List the learner wordbooks and practices that can be shared.', {}, ro, ({ db, userId }) => sharingSources(db, userId)),
  tool('preview_market_source', 'Build the share package of a wordbook (WB1) or practice (DP3) without publishing it.', {
    kind: z.enum(['wordbook', 'practice']), source: z.string(), title: z.string().optional(), description: z.string().optional(),
  }, ro, ({ db, userId }, args) => buildPackage(db, userId, args).pkg),
  tool('list_market_shares', 'List published shares (wordbooks and practices) from all learners, or only the learner own with mine.', { mine: z.boolean().optional() }, ro,
    ({ db, userId }, args) => ({ shares: listShares(db, userId, args) })),
  tool('get_market_share', 'Read a share and its package (knowledge points and question groups) before importing.', { id: z.string(), revision: z.number().int().optional() }, ro,
    ({ db, userId }, args) => shareDetail(db, userId, args.id, args)),
  tool('import_market_share', 'Import a share into the learner library: a new wordbook with its knowledge points, and question groups waiting for review (or needs_revision when they break the type rules), plus a topic practice for practice shares. Importing the same version again returns the earlier result.',
    { id: z.string() }, rw, ({ db, userId }, args) => importShare(db, userId, args.id), { scope: 'library:write' }),

  // ---------- 素材与文件 ----------
  tool('list_materials', 'List passages, notices, images and audio usable by question groups.', {
    kind: z.enum(['passage', 'notice', 'image', 'audio']).optional(), q: z.string().optional(), limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).optional(),
  }, ro, ({ db, userId }, args) => listMaterials(db, userId, args)),
  tool('get_material', 'Read one material by code (MT3): text or transcript, translations, sentence alignment with key sentences, and the groups using it.',
    { code: z.string(), language: language.optional() }, ro, ({ db, userId }, args) => getMaterial(db, userId, args.code, args)),
  tool('create_material', 'Create a reusable material. Passages and notices need body; images and audio need mediaId from upload_media.',
    materialInput.omit({ role: true, material: true }).extend({ kind: z.enum(['passage', 'notice', 'image', 'audio']), language: language.optional() }).shape, rw,
    ({ db, userId }, args) => createMaterial(db, userId, args), { scope: 'library:write' }),
  tool('update_material', 'Change a material in place; every group using it shows the new content. Only given fields change; sentences replace the list by position.',
    { code: z.string(), ...materialInput.omit({ role: true, material: true, kind: true }).shape, language: language.optional() }, rw,
    ({ db, userId }, { code, ...changes }) => updateMaterial(db, userId, code, changes), { scope: 'library:write' }),
  tool('delete_material', 'Delete a material that no group uses.', { code: z.string() }, destructive, ({ db, userId }, args) => deleteMaterial(db, userId, args.code), { scope: 'library:write' }),
  tool('upload_media', 'Upload an image (PNG, JPEG, WebP, GIF; up to 5 MB) or audio file (MP3, M4A, AAC, WAV, WebM, Ogg; up to 40 MB) as base64. Returns its mediaId for materials, prompts and options. Identical content returns the same id.', {
    base64: z.string(), mime: z.string(), fileName: z.string().optional(),
  }, rw, ({ db, userId }, args) => { const id = storeMedia(db, userId, args); const f = mediaFor(db, userId, id); return { mediaId: id, kind: f.kind, mime: f.mime, size: f.size }; }, { scope: 'library:write' }),
  tool('list_missing_translations', 'List learner content that has no text in a language. Each entry has target (pass to set_translation), field, the business code, the Japanese source and existing texts in other languages. Translate from the Japanese.', {
    language, code: z.string().optional().describe('Only content under this code, e.g. W12.'), limit: z.number().int().min(1).max(200).optional(),
  }, ro, ({ db, userId }, args) => listMissingTranslations(db, userId, args)),
  tool('set_translation', 'Write one field in one language, e.g. target "knowledge_examples:812" field "translation" language "en". Saved as AI-written and unverified.', {
    target: z.string(), field: z.string(), language, text: z.string().min(1).max(20000),
  }, rw, ({ db, userId }, args) => setTranslation(db, userId, args)),
  tool('set_ruby_annotation', 'Add furigana to one field the learner asked about, Anki style: 寒[さむ]い; put a space before a kanji run that follows other characters (まだ 寒[さむ]い). Removing the brackets must give back the current text. Japanese source columns (e.g. field "sentence" of knowledge_examples) use language "ja".', {
    target: z.string(), field: z.string(), language: language.default('ja'), annotated_text: z.string().min(1).max(20000),
  }, rw, ({ db, userId }, args) => setRubyAnnotation(db, userId, { ...args, annotatedText: args.annotated_text })),
  tool('list_ruby_annotations', 'List furigana annotations that still match their text.', { target: z.string().optional() }, ro, ({ db, userId }, args) => ({ annotations: listRubyAnnotations(db, userId, args) })),
];

/** 自分のファイルの中身（音声・画像）を MCP の audio / image として返す。 */
v3Tools.push({
  name: 'get_media', description: 'Read an owned audio or image file by mediaId (from a material, prompt or option) so you can listen to or look at it.',
  inputSchema: { mediaId: z.number().int() }, annotations: ro, scope: 'audio:read',
  handler: async ({ mediaId }, ctx) => {
    const db = getV3Db();
    try {
      const file = mediaFor(db, uid(ctx), mediaId);
      return { content: [{ type: file.kind === 'audio' ? 'audio' : 'image', data: (await readMediaBytes(file)).toString('base64'), mimeType: file.mime }] };
    } catch (error) {
      if (!error.statusCode) throw error;
      return { isError: true, content: [{ type: 'text', text: error.message }] };
    }
  },
});
