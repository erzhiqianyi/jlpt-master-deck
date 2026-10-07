import { japaneseAnnotationsSchema } from './japanese-annotations.mjs';
import {questionStrategies} from '../src/domain/questionContract.mjs';
import {questionSpecifications,questionRegistrySchemaVersion} from '../src/domain/questionPayload.mjs';
import { examContentFields, listMockExams, getMockExam, createMockExam, updateMockExam } from './mock-exams.mjs';
import { currentPlatform } from './platform.mjs';
import { practiceExplanationPatchSchema, practiceQuestionPatchSchema } from './practice-explanation-schema.mjs';
import { readLocalOfficialSamples, readLocalMockExam, readLocalMockExamManifest, readLocalNewsCycles, readLocalNewsCycle } from './local-study-data.mjs';
import { decorateReferences, resolveReference, getReferenceQuestion, getReferenceMetadata } from './references.mjs';
import { sharingSources, listShares, shareDetail, sourcePackage } from './market.mjs';
import { completeReadingFields, completeReadingSchema, validateCompleteReadingUpdate } from './reading-schema.mjs';
import { findLookupItems } from './word-lookup.mjs';
import { dailySummaryInput, generateDailySummaryContext, getDailySummary, upsertDailySummary, validSummaryDate } from './daily-summary.mjs';
// Tool catalogue shared by the OAuth-protected HTTP MCP server (server/mcp-app.mjs) and the
// legacy stdio server (server/mcp-server.mjs). Handlers receive `uid(ctx)`; nothing about the
// caller comes from tool input.
import { z } from 'zod';
import {
  addReviewItemImage,
  removeReviewItemImage,
  addDraftAnnotation,
  analyzeWeakPoints,
  buildDraftProcessingContext,
  buildDraftRevisionContext,
  buildListeningRecordingAnalysisContext,
  buildStudyRecord,
  createDailyReviewPackDraft,
  createDailyPractice,
  createDailyPracticeFromDraft,
  createLearningCapture,
  createListeningQuestion,
  listeningTranscriptForUser,
  createReadingQuestion,
  listReadingQuestions,
  readingQuestionForUser,
  updateListeningQuestion,
  updateListeningTranscript,
  updateReadingQuestion,
  createReviewPackDraft,
  createTopicPractice,
  createWordbook,
  deleteListeningQuestion,
  deleteListeningRecording,
  deleteDailyPractice,
  deleteReadingQuestion,
  deleteReviewItem,
  deleteReviewPackDraft,
  deleteWordbook,
  exportReviewDataBackup,
  getReviewPackDraft,
  getDailyPractice,
  updatePracticeQuestionExplanation,
  updatePracticeQuestion,
  getPlanGenerationContext,
  getPracticeSession,
  getStudyPlan,
  getStudyState,
  getHistoryQuestions,
  findListeningAudioQuestions,
  listListeningRecordings,
  listeningAudioForUser,
  listeningRecordingAudioForUser,
  listDueReviews,
  listListeningQuestions,
  readListeningAudioForUser,
  readListeningRecordingAudioForUser,
  listPendingListeningRecordings,
  listLearningCaptures,
  updateLearningCaptureStatus,
  updateReviewPackDraft,
  listReviewPackDrafts,
  listDailyPractices,
  listWordbooks,
  organizeReviewItem,
  loadReviewData,
  saveGeneratedStudyPlan,
  saveListeningRecordingAnalysis,
  submitPracticeAnswer,
  upsertReviewItem,
  updateWordbook,
  PRACTICE_KINDS,
} from './storage.mjs';
import { getReviewCards, rateReviewCard } from './review-cards.mjs';
import { getAiLearningHome } from './ai-learning-home.mjs';
import { aiHomeResource, aiHomeToolMeta, reviewCardsResource, reviewCardsToolMeta, practiceResource, practiceToolMeta } from './mcp-ui.mjs';
import { createQueryTools } from './mcp-query.mjs';
import { getDb, getDailyPracticeSourceContext } from './storage.mjs';

/** Scope catalogue. Audio bytes and library writes each require an optional grant beyond study. */
export const scopes = {
  study: { description: '读取并更新你的学习记录、计划、草稿、词书和题目', required: true },
  'audio:read': { description: '读取你上传的听力音频文件，供授权的 AI Agent 听取和分析', default: false },
  'library:write': { description: '新增/更新听力题和复习条目、导出备份；删除你自己的复习条目、听力题、阅读题、词书、草稿、录音和每日练习', default: false },
};

const ro = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const rw = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const replacing = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
const destructive = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

// users.id is INTEGER in SQLite; the OAuth layer only knows string owner ids.
const uid = (ctx) => Number(ctx.ownerId);
const text = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
// MCP Apps hosts hand `structuredContent` to the view; the text copy keeps plain clients working.
const structured = (value) => ({ ...text(value), structuredContent: value });
const found = (value, message) => {
  if (!value) throw new Error(message);
  return value;
};

// Match the local-only REST material boundary; never expose workstation files through a tunnel.
function requireLocalMaterials(ctx) {
  if (currentPlatform()?.dataSource) throw new Error('Local study materials are unavailable in the cloud environment');
  if (ctx.clientId === 'stdio' && ctx.request == null) return;
  const request = ctx.request;
  const host = request && new URL(request.url).hostname;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)
      || request.headers.get('x-forwarded-host') || request.headers.get('forwarded')) {
    throw new Error('Local study materials require a localhost MCP connection or local stdio');
  }
}
function requireLocalNews() {
  if (currentPlatform()?.dataSource) throw new Error('Local news materials are unavailable in the cloud environment');
}

const dateString = z.string().describe('YYYY-MM-DD');
const choices = z.array(z.string()).min(2).max(6);

const planPhase = z.object({
  id: z.string().optional(),
  startDate: dateString.describe('YYYY-MM-DD within the saved study period.'),
  endDate: dateString.describe('YYYY-MM-DD within the saved study period, on or after startDate.'),
  focus: z.string().describe('Short phase name, for example 技能強化.'),
  points: z.array(z.string()).max(8).optional().describe('Concrete sections or skills this phase covers.'),
  goal: z.string().optional().describe('What the learner should be able to do when the phase ends.'),
});

const planTask = z.object({
  id: z.string().optional(),
  date: dateString.describe('YYYY-MM-DD within the saved study period.'),
  title: z.string(),
  module: z.enum(['grammar', 'reading', 'listening', 'vocabulary', 'other']),
  minutes: z.number(),
  detail: z.string().optional(),
  sourceLabel: z.string().optional(),
  materialId: z.string().optional(),
  workloadKind: z.enum(['standard', 'full_mock']).optional().describe('Use full_mock only for a formally timed full mock-exam day that may exceed the ordinary daily target.'),
});

const recordingAnalysis = z.object({
  summary: z.string(),
  transcript: z.string().optional(),
  referenceTranscript: z.string().optional(),
  strengths: z.array(z.string()).max(8).optional(),
  improvements: z.array(z.string()).max(8).optional(),
  nextPractice: z.string(),
});

const tool = (name, description, inputSchema, annotations, handler, extra = {}) => ({ name, description, inputSchema, annotations, handler: async (args, ctx) => {
  const result = await handler(args, ctx);
  if (result.isError || name.includes('market') || name.includes('local_')) return result;
  return { ...result, ...(result.structuredContent ? { structuredContent: decorateReferences(getDb(), uid(ctx), result.structuredContent) } : {}),
    content: result.content.map(block => {
      if (block.type !== 'text') return block;
      try { return { ...block, text: JSON.stringify(decorateReferences(getDb(), uid(ctx), JSON.parse(block.text)), null, 2) }; } catch { return block; }
    }) };
}, ...extra });

// Practice questions shown to the agent omit the answer key until the question is answered, so the
// learner (not the model) does the work; the same shape drives the inline MCP App view.
const practiceFilters = {
  deck: z.enum(['n1_vocab', 'name_reading', 'grammar_expression']).optional().describe('Restrict to one deck; omit for all decks.'),
  kinds: z.array(z.enum(PRACTICE_KINDS)).max(7).optional().describe('Question kinds to rotate through. Default: all. kana_to_kanji (表記), word_formation (語形成) and usage (用法) only come from item practice_questions seeds.'),
  wordbook_id: z.string().optional().describe('Restrict to items assigned to this wordbook (see list_wordbooks).'),
  jlpt_level: z.string().optional().describe('N1–N5; matches the item jlpt_level.'),
  only_due: z.boolean().optional().describe('Only items whose spaced-repetition review is due (or never reviewed).'),
  statuses: z.array(z.enum(['new', 'learning', 'review', 'mastered'])).optional().describe('Only items in these mastery states.'),
  count: z.number().int().min(1).max(50).optional().describe('Number of questions, default 10.'),
  title: z.string().optional().describe('Custom session title; default is derived from the filters.'),
  date: dateString.optional().describe('Practice date, default today in Asia/Tokyo.'),
};

const listeningCreateFields = {
  japaneseAnnotations: japaneseAnnotationsSchema.optional(),
  title: z.string().optional(),
  questionTypeId: z.enum(['listening-task', 'listening-points', 'listening-outline', 'listening-expression', 'listening-quick', 'listening-integrated', 'listening-basic-training']).optional(),
  question: z.string(),
  choices: z.array(z.string()).max(4),
  choiceDetails: z.array(z.object({ translation: z.string().optional(), explanation: z.string().optional() })).max(4).optional().describe('Optional per-choice translations and explanations, in choice order. They can be added later.'),
  answerIndex: z.number().int(),
  explanation: z.string().optional(),
  transcript: z.string().max(30000).optional().describe('Japanese transcript shared by every question linked to this audio.'),
  transcriptTranslation: z.string().max(30000).optional().describe('Optional full Chinese translation of the shared audio transcript.'),
  audioReference: z.string().regex(/^AU-\d{6,}$/).optional().describe('Reuse an owned uploaded audio by public reference, e.g. AU-001823. Omit all audio upload fields.'),
  audioFileName: z.string().optional(),
  audioMime: z.string().optional(),
  audioBase64: z.string().optional(),
};
const listeningUpdateFields = {
  japaneseAnnotations: japaneseAnnotationsSchema.optional(),
  id: z.string().min(1),
  title: z.string().optional(),
  questionTypeId: z.enum(['listening-task', 'listening-points', 'listening-outline', 'listening-expression', 'listening-quick', 'listening-integrated', 'listening-basic-training']).optional(),
  question: z.string().optional(),
  choices: z.array(z.string()).max(4).optional(),
  choiceDetails: z.array(z.object({ translation: z.string().optional(), explanation: z.string().optional() })).max(4).optional().describe('Optional per-choice translations and explanations, in choice order; replace the full list when supplied.'),
  answerIndex: z.number().int().optional(),
  explanation: z.string().optional(),
  libraryNumber: z.number().int().min(1).optional().describe('New 1-based 题号 position in the owner\'s listening library, e.g. move question #11 to #1.'),
};
const listeningUpdateDescription = "Partially update an owned listening question's title, type, question, choices, per-choice translations and explanations, answer or overall explanation, or move it to a 1-based libraryNumber. Omitted fields are preserved. Moving a question shifts intervening numbers without overwriting another question. Audio is unchanged. A missing or unowned id is an error.";

export const tools = [
  tool('get_question_registry','Read the versioned 23-type registry before authoring. Includes official level applicability, supplementary flags, required-content guidance, explanation steps, tips and knowledge topics. Schema success does not imply semantic approval; existing tool schemas still govern each write.',{},ro,async(_args,ctx)=>{
    uid(ctx);
    return text({schemaVersion:questionRegistrySchemaVersion,types:Object.values(questionStrategies).map(({id,module,applicableLevels,supplementary,aliases})=>({id,module,applicableLevels,supplementary,aliases,...questionSpecifications[id]}))});
  }),
  tool('list_mock_exams', 'List your user-designed exams and their sessions. Available on local and hosted backends. No fixed topic, schedule or question count.',
    {}, ro, async (_args, ctx) => text({ exams: listMockExams(getDb(), uid(ctx)) })),
  tool('get_mock_exam', 'Read a complete owned exam before editing, including revision, sessions, questions, sources and explanations.',
    { id: z.string() }, ro, async ({ id }, ctx) => text(found(getMockExam(getDb(), uid(ctx), id), 'Exam not found'))),
  tool('create_mock_exam', 'Create a user-designed exam. Sessions are independently submitted parts: a single paper, daily work, or any arrangement chosen by the user or automation. Dates and time limits are optional. Supply original or authorized content and explanations. This saves content; it does not certify human review or generate a study plan.',
    examContentFields, rw, async (args, ctx) => text(createMockExam(getDb(), uid(ctx), args)), { scope: 'library:write' }),
  tool('update_mock_exam', 'Update an owned exam using its expectedRevision from get_mock_exam. Omitted fields are preserved. If sessions is supplied it replaces the whole array; read first and retain all sessions/questions you want to keep. Edited question content invalidates the affected browser attempt.',
    { id: z.string(), expectedRevision: z.number().int().positive(), title: examContentFields.title.optional(), description: z.string().optional(), level: z.string().optional(), sessions: examContentFields.sessions.optional() }, replacing,
    async ({ id, ...patch }, ctx) => text(found(updateMockExam(getDb(), uid(ctx), id, patch), 'Exam not found')), { scope: 'library:write' }),

  tool('get_reference_metadata', 'Read owned listening, audio asset, recording, capture or wordbook metadata by public reference. Does not expose audio bytes or filesystem paths.',
    { reference: z.string() }, ro, async ({ reference }, ctx) => text(found(getReferenceMetadata(getDb(), uid(ctx), reference), 'Reference not found'))),
  tool('get_reference_question', 'Read an immutable browser-generated question snapshot by reference. Answer and explanations remain hidden until answered.',
    { reference: z.string() }, ro, async ({ reference }, ctx) => text(found(getReferenceQuestion(getDb(), uid(ctx), reference), 'Question not found'))),
  tool('list_local_official_samples', 'Read official sample data used on the page, optionally filtered by module. Available only through localhost or local stdio, not cloud or tunnel.',
    { module: z.string().optional() }, ro, async ({ module }, ctx) => { requireLocalMaterials(ctx); return text(readLocalOfficialSamples(module)); }),
  tool('list_local_mock_exams', 'Read the local mock exam catalogue. Requires localhost or local stdio.',
    {}, ro, async (_args, ctx) => { requireLocalMaterials(ctx); return text(readLocalMockExamManifest()); }),
  tool('get_local_mock_exam', 'Read a complete local mock exam, including reading passages. Requires localhost or local stdio.',
    { id: z.string().regex(/^[A-Za-z0-9_-]+$/) }, ro, async ({ id }, ctx) => { requireLocalMaterials(ctx); return text(found(readLocalMockExam(id), 'Local mock exam not found')); }),
  tool('list_local_news_cycles', 'Read the local news practice cycle catalogue. Unavailable on Cloudflare; connect to the local backend.',
    {}, ro, async (_args, ctx) => { requireLocalNews(); return text({ cycles: readLocalNewsCycles(uid(ctx)) }); }),
  tool('get_local_news_cycle', 'Read a local news cycle with all module questions, including reading passages and audio references. Omit id for the latest cycle. Unavailable on Cloudflare.',
    { id: z.string().regex(/^\d{4}-W\d{2}$/).optional() }, ro, async ({ id }, ctx) => { requireLocalNews(); return text(readLocalNewsCycle(id, uid(ctx))); }),
  tool('resolve_reference', 'Resolve a visible reference such as IT-000123, PR-000045 or QU-000678 within the authenticated account. Returns the original ID and the next lookup tool. Resolve before using existing update tools; never guess IDs.',
    { reference: z.string() }, ro, async ({ reference }, ctx) => text(found(resolveReference(getDb(), uid(ctx), reference), 'Reference not found'))),
  // Every library operation is bound to the authenticated owner.
  tool('get_review_data', 'Read JLPT review items from your personal SQLite item library. JSON files are treated as export/import backups.',
    {}, ro, async (_args, ctx) => text(loadReviewData(uid(ctx)))),
  tool('lookup_word', 'Exact-match lookup of a word or phrase against the personal item library (original, reading, base form and stored conjugations). Returns matching items with their meanings, or an empty list when nothing matches — queue a miss with create_learning_capture.',
    { query: z.string().describe('The exact word or phrase to look up, as typed or selected by the learner.') }, ro,
    async ({ query }, ctx) => text(findLookupItems(loadReviewData(uid(ctx)).items, query))),
  tool('upsert_review_item', 'Create or update a non-media JLPT review item in your personal SQLite item library. Use for vocabulary, kanji, grammar, and other text-based practice seeds. Knowledge items can be saved independently without practice_questions. settings.jlptVocabularyQuestionKinds is a practice-generation preference, not a save requirement. Submit only applicable authored question kinds; every supplied question needs a non-empty prompt, four distinct choices including answer, explanation_zh and distractor_notes for every wrong choice regardless of settings. On updates omitted practice_questions preserve existing seeds; an explicit empty array clears them.', {
    item: z.record(z.string(), z.unknown()).describe('Complete review item object. Include japanese_annotations for every Japanese content string as [{text, tokens:[{surface, reading?, pos?}]}]. Surfaces including punctuation and whitespace concatenate exactly to text. reading is contextual kana; pos is noun|verb|particle|adjective|adverb|other; omit uncertain categories. Do not embed display colors or reading parentheses in source. Supply this when generating original, meaning_ja, examples, patterns and Japanese quotations. item.original must already be the canonical dictionary form or standard spelling; do not add a separate normalized field. core_memory is an array of exam note strings, one point per entry. Vocabulary and grammar share one field set: patterns[] { pattern, connection_zh?, meaning_zh?, example?, example_zh? } for connection forms, usage patterns and collocations; points[] { label, detail_zh } for usage features and traps; comparisons[] { target, difference_zh, kind?: "everyday" } for near-synonyms and everyday alternatives; register { level: written|spoken|both|formal, note_zh, exam_tip_zh }; explanation_zh for the detailed explanation; source { sentence, chat_summary } for provenance; input_at as the capture timestamp. Legacy names (grammar_forms, grammar_features, collocations, comparison_notes, everyday_alternatives, usage_register*, exam_register_zh, analysis, date, source_*) are still accepted and converted. Attach images with attach_review_item_image. Ordinary vocabulary requires at least two natural Japanese usage examples and a Chinese translation in examples[].zh for each sentence; meta sentences that only say an expression was studied are not valid question contexts. For meaning questions, meaning_ja is a dictionary-style definition and paraphrase_ja is a shorter distinct paraphrase; do not duplicate them. Verbs and adjectives also require part_of_speech, inflection_class (godan, ichidan, suru, kuru, i_adjective, or na_adjective), base_form, and at least three conjugations shaped as { kind, form, reading? }. Supply reading as the full kana reading for each form containing kanji (for example { kind: "polite", form: "頷きます", reading: "うなずきます" }); irregular readings such as 来ない/こない must be explicit. Keep form free of inline reading annotations. JLPT vocabulary questions go in practice_questions[] as { id, kind, instruction, prompt, target, choices, answer, explanation_zh, distractor_notes }, where kind is kanji_to_kana (漢字読み), kana_to_kanji (表記), word_formation (語形成), moji_goi (文脈規定), meaning (言い換え類義) or usage (用法); each needs at least four distinct choices including the answer, explanation_zh, and a specific distractor_notes[choice] for every wrong choice. An authored question replaces the synthetic one of that kind; word_formation and usage exist only as authored questions.'),
  }, replacing, async ({ item }, ctx) => text(upsertReviewItem(item, { source: 'mcp', userId: uid(ctx) })), { scope: 'library:write' }),
  tool('delete_review_item', 'Permanently delete one review item (vocabulary, grammar, kanji-reading, or other seed) from your personal SQLite item library, along with its progress, answer history and now-unused images. This cannot be undone.',
    { id: z.string() }, destructive, async ({ id }, ctx) => text({ ok: found(deleteReviewItem(uid(ctx), id), 'Review item not found') }), { scope: 'library:write' }),
  tool('export_review_data_backup', 'Export your personal SQLite review item library into monthly JSON backup files. Use only when a JSON backup is requested.',
    {}, replacing, async (_args, ctx) => text(exportReviewDataBackup(uid(ctx))), { scope: 'library:write' }),

  // Everything below is filtered by uid(ctx) inside storage.mjs.
  tool('get_study_state', 'Read the same learning state as the web page: settings, answers, item progress, complete attempt history and active attempt. settings.jlptVocabularyQuestionKinds lists preferred vocabulary types for practice generation; it does not constrain independent knowledge capture.',
    {}, ro, async (_args, ctx) => text(getStudyState(uid(ctx)))),
  tool('get_history_questions', 'Read the same generated-question details as the history page for completed attempts with wrong answers or related items. Read full attempt snapshots through get_study_state.',
    {}, ro, async (_args, ctx) => text(getHistoryQuestions(uid(ctx)))),
  tool('list_market_sources', 'List your wordbooks and practices available for sharing, as shown in the sharing page.',
    {}, ro, async (_args, ctx) => text(sharingSources(uid(ctx)))),
  tool('list_market_shares', 'List currently published marketplace shares visible to the authenticated learner.',
    {}, ro, async (_args, ctx) => text(listShares(uid(ctx)))),
  tool('get_market_share', 'Read one published share and its complete content package, with the same visibility rules as the web page.',
    { id: z.string(),revision:z.number().int().positive().optional() }, ro, async ({ id,revision }, ctx) => text(shareDetail(uid(ctx), id,revision))),
  tool('preview_market_source', 'Preview a share package from your own wordbook or practice without publishing it.',
    { kind: z.enum(['wordbook', 'practice']), sourceId: z.string(), title: z.string().optional(), description: z.string().optional() }, ro,
    async (args, ctx) => text({ package: sourcePackage(uid(ctx), args) })),
  tool('get_daily_practice_source_context', 'Read owner-configured daily practice sources, time window, separate card review events/statistics and existing reusable questions. Run scheduling belongs to the learner AI client. Optional ISO start/end override the time range; end is exclusive. Reuse card questions unchanged, skip cards without questions, never generate replacements for reviewed cards.',
    { start: z.iso.datetime({ offset: true }).optional(), end: z.iso.datetime({ offset: true }).optional() }, ro,
    async (args, ctx) => text(getDailyPracticeSourceContext(uid(ctx), args))),
  tool('get_study_record', 'Read the full personalized study record from SQLite plus JSON resources.',
    {}, ro, async (_args, ctx) => text(buildStudyRecord(uid(ctx)))),
  tool('list_learning_captures', 'Read the AI processing queue. Use status inbox for pending work and category to process by type. Preserve context and targetDeck/targetWordbookId. For word/grammar use upsert_review_item (canonical form, source sentence, requested wordbook); for reading use create_reading_question or update_reading_question; for listening use create_listening_question with an owned audioReference or real audio bytes, otherwise leave pending. For sentence/unsure first classify from context; do not invent missing source material. Check existing records before writing to avoid duplicates. Only after successful persistence call update_learning_capture_status with processed; on failure leave inbox.',
    { status: z.enum(['inbox', 'processed', 'archived']).optional(), category: z.enum(['word', 'grammar', 'sentence', 'listening', 'reading', 'unsure']).optional().describe('Filter queue by input type.') }, ro,
    async ({ status, category }, ctx) => text(listLearningCaptures(uid(ctx), status).filter((capture) => !category || capture.category === category))),
  tool('update_learning_capture_status', 'Synchronize an owned queue entry after processing. Mark processed only after the parsed result has been successfully saved using the appropriate library tool. Leave failed or ambiguous inputs in inbox. Use inbox to retry or archived to dismiss.', {
    id: z.string(), status: z.enum(['inbox', 'processed', 'archived']),
  }, replacing, async ({ id, status }, ctx) => text(found(updateLearningCaptureStatus(uid(ctx), id, status), 'Capture not found'))),
  tool('create_learning_capture', 'Save a word, sentence, grammar point, listening issue, or other learner question into the local inbox.', {
    body: z.string(),
    category: z.enum(['word', 'grammar', 'sentence', 'listening', 'reading', 'unsure']).optional(),
    context: z.string().optional(),
    targetDeck: z.enum(['n1_vocab', 'name_reading', 'grammar_expression']).optional().describe('Requested destination deck for word or grammar captures.'),
    targetWordbookId: z.string().optional().describe('Requested destination wordbook id, including custom wordbooks returned by list_wordbooks.'),
  }, rw, async (args, ctx) => text(createLearningCapture(uid(ctx), args))),
  tool('list_wordbooks', 'List built-in and user-created wordbooks (vocabulary and grammar, distinguished by deck) available as capture destinations.',
    {}, ro, async (_args, ctx) => text(listWordbooks(uid(ctx)))),
  tool('create_wordbook', 'Create a custom wordbook for future captures. Use deck grammar_expression for a grammar wordbook.', {
    title: z.string(),
    deck: z.enum(['n1_vocab', 'name_reading', 'grammar_expression']).optional().describe('Base deck used for generated review questions; grammar_expression creates a grammar wordbook.'),
  }, rw, async (args, ctx) => text(createWordbook(uid(ctx), args))),
  tool('organize_review_item', 'File a review item into one wordbook (an item belongs to exactly one wordbook of its own kind) and/or replace its tags. Omit a field to leave it unchanged.',
    { itemId: z.string(), wordbookId: z.string().optional().describe('Destination wordbook id from list_wordbooks; must match the item deck family.'), tags: z.array(z.string()).optional().describe('Full replacement tag list.') }, replacing,
    async ({ itemId, wordbookId, tags }, ctx) => text(found(organizeReviewItem(uid(ctx), itemId, { wordbookId, tags }), 'Review item not found'))),
  tool('attach_review_item_image', 'Attach a memory image to a vocabulary or grammar item; it appears on the item page and, when enabled, on review cards. Before generating the image, read the saved item. A grammar image should visibly include its exact expression, connection form, short meaning, and one saved Japanese example with its Chinese translation; add an essential form note when relevant. A vocabulary image should include the word, meaning or usage cue, and one saved example with translation. Check every rendered character at full size before uploading; the server cannot verify text inside pixels. Pass either image_url (https) or image_base64 with mime (PNG, JPEG, WebP or GIF, at most 5 MB). An item holds at most 6 images. Attach a replacement before removing the old image.',
    {
      itemId: z.string(),
      image_url: z.string().url().optional(),
      image_base64: z.string().optional(),
      mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']).optional(),
      caption: z.string().max(120).optional().describe('Short memory hint shown under the image.'),
    }, rw,
    async ({ itemId, image_url, image_base64, mime, caption }, ctx) => text(found(addReviewItemImage(uid(ctx), itemId, image_url ? { url: image_url, caption } : { imageBase64: image_base64, mime, caption }), 'Review item not found')),
    { scope: 'library:write' }),
  tool('remove_review_item_image', 'Remove one image from a review item, identified by its images[].id or images[].url.',
    { itemId: z.string(), image: z.string() }, destructive,
    async ({ itemId, image }, ctx) => text(found(removeReviewItemImage(uid(ctx), itemId, image), 'Review item not found')),
    { scope: 'library:write' }),
  tool('rename_wordbook', 'Rename a wordbook while keeping its id and assigned entries unchanged.',
    { wordbookId: z.string(), title: z.string() }, replacing,
    async ({ wordbookId, title }, ctx) => text(found(updateWordbook(uid(ctx), wordbookId, { title }), 'Wordbook not found'))),
  tool('delete_wordbook', 'Delete a custom wordbook. Refuses built-in wordbooks and any wordbook that still has items; move its items to another wordbook with organize_review_item first.',
    { wordbookId: z.string() }, destructive,
    async ({ wordbookId }, ctx) => text({ ok: found(deleteWordbook(uid(ctx), wordbookId), 'Wordbook not found') }), { scope: 'library:write' }),
  tool('get_study_plan', "Read the learner's saved JLPT exam plan, materials, weekly frequency, and available study time.",
    {}, ro, async (_args, ctx) => text(getStudyPlan(uid(ctx)))),
  tool('get_plan_generation_context', 'Read the learner profile, recent practice, weak points, daily summaries, and instructions needed to generate or revise a daily JLPT plan.',
    {}, ro, async (_args, ctx) => text(getPlanGenerationContext(uid(ctx)))),
  tool('get_daily_summary', 'Read a saved daily learning summary. Does not generate one; returns not_found when absent.',
    { date: z.iso.date().optional().describe('YYYY-MM-DD in Asia/Tokyo; defaults to today.') }, ro,
    async ({ date }, ctx) => { const day = validSummaryDate(date); const summary = getDailySummary(getDb(), uid(ctx), day); return text(summary ? { status: 'found', ...summary } : { status: 'not_found', date: day, summary: null }); }),
  tool('generate_daily_summary_context', 'Read deterministic statistics, wrong-answer evidence, related items, and recent weak points for an Agent to analyze. Does not call AI or save a summary.',
    { date: z.iso.date().optional().describe('YYYY-MM-DD in Asia/Tokyo; defaults to today.') }, ro,
    async ({ date }, ctx) => text(generateDailySummaryContext(getDb(), uid(ctx), date, analyzeWeakPoints(uid(ctx))))),
  tool('upsert_daily_summary', 'Save an Agent-written daily summary after reading generate_daily_summary_context. One current summary per account and date.',
    dailySummaryInput.shape, replacing,
    async (args, ctx) => text(upsertDailySummary(getDb(), uid(ctx), args))),
  tool('save_generated_study_plan', 'Save a complete agent-generated daily plan for calendar tracking. Replaces generated tasks while preserving matching completed task IDs. Send phases together with tasks so the plan outline stays in sync; omitting phases keeps the stored ones.', {
    phases: z.array(planPhase).max(12).optional().describe('2 to 5 non-overlapping phases covering the study period, ordered by date.'),
    tasks: z.array(planTask).max(730),
  }, replacing, async ({ tasks, phases }, ctx) => text(saveGeneratedStudyPlan(uid(ctx), { tasks, phases }))),
  tool('get_ai_learning_home', 'Open the learner’s AI study home with due-card counts, today’s review progress, recent formal practices, and suggested next actions. This is a read-only overview; actions require the learner to select one.',
    {}, ro, async (_args, ctx) => structured(getAiLearningHome(uid(ctx))), { title: 'AI 学习首页', _meta: aiHomeToolMeta }),
  tool('get_review_cards', 'Start or continue the learner’s vocabulary and grammar review cards. Defaults to due and never-reviewed items. Show the front first; after the learner reveals the back, ask for their own rating and call rate_review_card to persist progress. Respects saved front/back text settings; images are not included.', {
    deck: z.enum(['n1_vocab', 'name_reading', 'grammar_expression']).optional(),
    wordbook_id: z.string().optional(),
    only_due: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).optional(),
    offset: z.number().int().min(0).optional(),
  }, ro, async (args, ctx) => structured(getReviewCards(uid(ctx), args)),
  { title: '复习卡片', _meta: reviewCardsToolMeta }),
  tool('rate_review_card', 'Save the learner’s own memory rating for one owned review card. Call only after the learner has seen the answer and explicitly chosen forgot, hard, remembered, or easy. Updates mastery, review count, and next review time; never rate on the learner’s behalf.',
    { item_id: z.string().min(1), rating: z.enum(['forgot', 'hard', 'remembered', 'easy']), event_id: z.string().min(1).optional().describe('Stable UUID per review; reuse it when retrying the same review.') }, rw,
    async ({ item_id, rating, event_id }, ctx) => structured(rateReviewCard(uid(ctx), item_id, rating, new Date(), event_id))),
  tool('list_due_reviews', 'List items whose nextReviewAt is due or overdue.',
    { at: z.string().optional() }, ro, async ({ at }, ctx) => text(listDueReviews(uid(ctx), at))),
  tool('list_listening_questions', "Read the authenticated user's uploaded listening-question metadata without audio bytes.",
    {}, ro, async (_args, ctx) => text(listListeningQuestions(uid(ctx)).map(({ transcript, transcriptTranslation, ...question }) => question))),
  tool('get_listening_transcript', 'Read the transcript and its optional translation for one owned listening question. The transcript is shared by every question linked to the same audio. Requires audio:read permission.',
    { question_id: z.string().min(1) }, ro, async ({ question_id }, ctx) => text(found(listeningTranscriptForUser(uid(ctx), question_id), 'Listening transcript not found')), { scope: 'audio:read' }),
  tool('update_listening_transcript', 'Update or clear the Japanese transcript and/or Chinese translation shared by every question linked to the selected audio. Requires library:write permission.',
    { question_id: z.string().min(1), transcript: z.string().max(30000).optional(), transcriptTranslation: z.string().max(30000).optional() }, replacing,
    async ({ question_id, ...patch }, ctx) => {
      if (patch.transcript === undefined && patch.transcriptTranslation === undefined) throw new Error('Provide transcript or transcriptTranslation');
      return text(found(updateListeningTranscript(uid(ctx), question_id, patch), 'Listening transcript not found'));
    }, { scope: 'library:write' }),
  tool('get_listening_audio', 'Read the uploaded audio for one owned listening question as MCP audio content. Requires audio:read permission; use an id from list_listening_questions or resolve_reference. Audio is limited to 25 MB.',
    { question_id: z.string().min(1) }, ro,
    async ({ question_id }, ctx) => ({ content: [{ type: 'audio', ...found(await readListeningAudioForUser(uid(ctx), question_id), 'Listening audio not found') }] }),
    { scope: 'audio:read' }),
  tool('get_listening_recording_audio', 'Read one owned learner recording as MCP audio content for transcription and comparison with the reference. Requires audio:read permission; use a recording id from list_listening_recordings or list_pending_listening_recordings. Audio is limited to 25 MB.',
    { recording_id: z.string().min(1) }, ro,
    async ({ recording_id }, ctx) => ({ content: [{ type: 'audio', ...found(await readListeningRecordingAudioForUser(uid(ctx), recording_id), 'Listening recording audio not found') }] }),
    { scope: 'audio:read' }),
  tool('get_listening_audio_download', 'Get a stable authenticated URL for one owned reference audio. The client must send its MCP OAuth Bearer token on the GET request; no token is included in this result. Requires audio:read permission.',
    { question_id: z.string().min(1) }, ro,
    async ({ question_id }, ctx) => {
      const audio = found(listeningAudioForUser(uid(ctx), question_id), 'Listening audio not found');
      if (!ctx.request) throw new Error('Audio download URLs require an HTTP MCP connection');
      return text({ url: new URL(`/api/listening-questions/${encodeURIComponent(question_id)}/audio`, ctx.request.url).toString(), mimeType: audio.audio_mime, size: audio.audio_size, auth: 'MCP OAuth Bearer token with audio:read' });
    }, { scope: 'audio:read' }),
  tool('get_listening_recording_download', 'Get a stable authenticated URL for one owned learner recording. The client must send its MCP OAuth Bearer token on the GET request; no token is included in this result. Requires audio:read permission.',
    { recording_id: z.string().min(1) }, ro,
    async ({ recording_id }, ctx) => {
      const audio = found(listeningRecordingAudioForUser(uid(ctx), recording_id), 'Listening recording audio not found');
      if (!ctx.request) throw new Error('Audio download URLs require an HTTP MCP connection');
      return text({ url: new URL(`/api/listening-recordings/${encodeURIComponent(recording_id)}/audio`, ctx.request.url).toString(), mimeType: audio.audio_mime, size: audio.audio_size, auth: 'MCP OAuth Bearer token with audio:read' });
    }, { scope: 'audio:read' }),
  tool('find_listening_audio_questions', 'Find your listening questions attached to an audio SHA-256, matching the web audio lookup.',
    { sha256: z.string().regex(/^[a-f0-9]{64}$/) }, ro,
    async ({ sha256 }, ctx) => text(findListeningAudioQuestions(uid(ctx), sha256))),
  tool('list_listening_recordings', 'Read all your recordings for a listening question, including completed analyses; this does not claim or change a recording.',
    { question_id: z.string() }, ro,
    async ({ question_id }, ctx) => text(listListeningRecordings(uid(ctx), question_id))),
  tool('create_listening_question', 'Create a listening question using an owned audioReference without reuploading, or real audio bytes (audioFileName, audioMime, audioBase64). Choose exactly one audio source. Provide the shared Japanese transcript and its Chinese translation when available. Per-choice translations and explanations are optional and can be added later. Empty choices with answerIndex -1 are supported for listening-basic-training.',
    listeningCreateFields, rw, async (args, ctx) => text(createListeningQuestion(uid(ctx), args)), { scope: 'library:write' }),
  ...['update_listening_question', 'edit_listening_question', 'patch_listening_question'].map((name) =>
    tool(name, listeningUpdateDescription, listeningUpdateFields, replacing,
      async ({ id, ...patch }, ctx) => text(found(updateListeningQuestion(uid(ctx), id, patch), 'Listening question not found')),
      { scope: 'library:write' })),
  tool('upsert_listening_question', 'With id: partially update an owned question, preserving audio; unknown or unowned ids fail and never create a record. Without id: create a question with question, choices, answerIndex and either an owned audioReference or audioFileName, audioMime and real audioBase64. Audio fields are forbidden when updating; libraryNumber is only supported when updating.', {
    ...Object.fromEntries(Object.entries(listeningCreateFields).map(([key, schema]) => [key, schema.optional()])),
    ...listeningUpdateFields,
    id: z.string().min(1).optional(),
  }, replacing, async (args, ctx) => {
    if (args.id !== undefined) {
      for (const key of ['audioReference', 'audioFileName', 'audioMime', 'audioBase64']) {
        if (args[key] !== undefined) throw new Error(`${key} cannot be supplied when updating; audio is unchanged`);
      }
      const { id, ...patch } = z.object(listeningUpdateFields).parse(args);
      return text(found(updateListeningQuestion(uid(ctx), id, patch), 'Listening question not found'));
    }
    if (args.libraryNumber !== undefined) throw new Error('libraryNumber requires an existing question id');
    return text(createListeningQuestion(uid(ctx), z.object(listeningCreateFields).parse(args)));
  }, { scope: 'library:write' }),
  tool('delete_listening_question', 'Delete one owned listening question from the active library. Its recordings are removed; canonical question versions and historically referenced shared audio are retained. Active-library deletion has no restore tool.',
    { id: z.string() }, destructive, async ({ id }, ctx) => text({ ok: found(deleteListeningQuestion(uid(ctx), id), 'Listening question not found') }), { scope: 'library:write' }),
  tool('delete_listening_recording', 'Permanently delete one owned recording, including its audio and analysis. Preserve the listening question, reference audio and other recordings. This cannot be undone.',
    { recording_id: z.string().min(1) }, destructive,
    async ({ recording_id }, ctx) => text({ ok: found(deleteListeningRecording(uid(ctx), recording_id), 'Listening recording not found') }),
    { scope: 'library:write' }),
  tool('list_pending_listening_recordings', 'List learner recordings waiting for local Agent analysis. Use get_listening_recording_analysis_context to claim one recording and obtain both local audio paths.',
    {}, ro, async (_args, ctx) => text(listPendingListeningRecordings(uid(ctx)))),
  tool('get_listening_recording_analysis_context', 'Claim one learner recording for analysis and return the local learner-recording path, reference-audio path, any saved reference transcript, question metadata, and evidence rules. The learner transcript must be derived from the learner audio.',
    { recording_id: z.string() }, rw,
    async ({ recording_id }, ctx) => text(found(buildListeningRecordingAnalysisContext(uid(ctx), recording_id), 'Listening recording or local audio file not found'))),
  tool('save_listening_recording_analysis', 'Write the completed local audio comparison back to the learner recording so the detail page can display it.',
    { recording_id: z.string(), status: z.enum(['completed', 'failed']), analysis: recordingAnalysis.optional() }, replacing,
    async ({ recording_id, status, analysis }, ctx) => text(found(saveListeningRecordingAnalysis(uid(ctx), recording_id, { status, analysis }), 'Listening recording not found'))),
  tool('list_reading_questions', 'List all reading questions owned by the authenticated learner, including their explanations.',
    {}, ro, async (_args, ctx) => text(listReadingQuestions(uid(ctx)))),
  tool('get_reading_question', 'Get one owned reading question and its complete reading analysis.',
    { id: z.string() }, ro, async ({ id }, ctx) => text(found(readingQuestionForUser(uid(ctx), id), 'Reading question not found'))),
  tool('create_reading_question', 'Create a fully explained reading question. Optional materialRef {id,revision} reuses an owned article version whose full text exactly matches passage. questionTypeId distinguishes six official reading types and supplementary basic training. Required: full Chinese passage translation, four translated choices with reasoning/evidence/error types, overall explanation, summary/structure/verbatim key sentences, and worked solving steps and elimination techniques in explanationNodes. Incomplete analysis is rejected.',
    completeReadingFields, rw, async (args, ctx) => text(createReadingQuestion(uid(ctx), completeReadingSchema.parse(args)))),
  tool('update_reading_question', 'Partially update an owned reading question. The merged result must satisfy the same complete-analysis requirements as create; backfill missing legacy analysis in this update. Omitted fields are preserved; arrays and readingAnalysis are replaced as a whole. Never clear required analysis. When changing choices or the correct answer, keep explanations and error types aligned.',
    { id: z.string(), ...Object.fromEntries(Object.entries(completeReadingFields).map(([key, schema]) => [key, schema.optional()])) }, replacing,
    async ({ id, ...patch }, ctx) => {
      const current = found(readingQuestionForUser(uid(ctx), id), 'Reading question not found');
      validateCompleteReadingUpdate(current, patch);
      return text(found(updateReadingQuestion(uid(ctx), id, patch), 'Reading question not found'));
    }),
  tool('delete_reading_question', 'Permanently delete one owned reading question. This cannot be undone.',
    { id: z.string() }, destructive, async ({ id }, ctx) => text({ ok: found(deleteReadingQuestion(uid(ctx), id), 'Reading question not found') }), { scope: 'library:write' }),
  tool('analyze_weak_points', 'Analyze wrong answers, learning items, due items, and mastery totals.',
    {}, ro, async (_args, ctx) => text(analyzeWeakPoints(uid(ctx)))),
  tool('generate_daily_review_pack', 'Create a personalized daily review-pack draft that the user can preview and annotate.',
    { title: z.string().optional(), minutes: z.number().optional() }, rw,
    async ({ title, minutes }, ctx) => text(createDailyReviewPackDraft(uid(ctx), { title, minutes }))),
  tool('generate_daily_practice', "Create a formal daily practice using settings.dailyPracticeSources. First read get_daily_practice_source_context. Reuse existing questions for qualifying card reviews, skip cards without questions, and generate new questions only for enabled answer sources. Schedule this call in the learner AI client at the configured runAt/timeZone. Supply generated_questions (an empty array for review-only practice) to publish AI-prepared questions; optional ISO start/end use the same source window. No historical fallback outside the configured window.",
    { title: z.string().optional(), minutes: z.number().optional(), date: dateString.optional().describe('YYYY-MM-DD. Defaults to today in Asia/Tokyo.'), start: z.iso.datetime({ offset: true }).optional(), end: z.iso.datetime({ offset: true }).optional(), generated_questions: z.array(z.record(z.string(), z.unknown())).optional().describe('AI-prepared questions for the enabled answer source; card review questions are appended unchanged by the server.') }, replacing,
    async (args, ctx) => text(createDailyPractice(uid(ctx), args))),
  tool('publish_draft_as_daily_practice', 'Publish one approved draft as a complete formal practice set in the Today workspace, preserving its question order and answer choices.',
    { draft_id: z.string(), date: dateString.optional().describe('YYYY-MM-DD. Defaults to today in Asia/Tokyo.'), title: z.string().optional() }, rw,
    async ({ draft_id, date, title }, ctx) => text(createDailyPracticeFromDraft(uid(ctx), draft_id, { date, title }))),
  tool('start_topic_practice', 'Start an interactive topic practice session for the learner: generate questions from the item library by deck / kind / wordbook / due state and open the inline practice card. Hosts that render MCP Apps show the questions as clickable choices; otherwise present each question with its lettered choices, wait for the learner to pick, and record it with submit_practice_answer. Never answer on the learner\'s behalf.', practiceFilters, rw,
    async ({ deck, kinds, wordbook_id, jlpt_level, only_due, statuses, count, title, date }, ctx) => structured(createTopicPractice(uid(ctx), { deck, kinds, wordbookId: wordbook_id, jlptLevel: jlpt_level, onlyDue: only_due, statuses, count, title, date })),
    { title: '开始专题训练', _meta: practiceToolMeta }),
  tool('get_practice_session', 'Reopen a practice session (topic practice or daily practice) with the learner\'s current answers, so it can be continued in the inline card or in chat.',
    { practice_id: z.string() }, ro,
    async ({ practice_id }, ctx) => structured(found(getPracticeSession(uid(ctx), practice_id), 'Practice not found')),
    { title: '继续练习', _meta: practiceToolMeta }),
  tool('submit_practice_answer', 'Record the learner\'s chosen answer for one question of a practice session. Grades it, updates spaced-repetition progress and attempt history exactly like the web app, and returns the explanation plus the next unanswered question. Call only with a choice the learner actually picked.',
    { practice_id: z.string(), question_id: z.string(), selected: z.string().describe('The chosen option text, exactly as listed in choices.') }, rw,
    async ({ practice_id, question_id, selected }, ctx) => structured(submitPracticeAnswer(uid(ctx), { practiceId: practice_id, questionId: question_id, selected }))),
  tool('list_daily_practices', 'List generated formal daily practices for the authenticated user.',
    {}, ro, async (_args, ctx) => text(listDailyPractices(uid(ctx)))),
  tool('get_daily_practice', 'Read one formal daily practice with its generated questions.',
    { practice_id: z.string() }, ro,
    async ({ practice_id }, ctx) => text(found(getDailyPractice(uid(ctx), practice_id), 'Daily practice not found'))),
  tool('update_practice_question', 'Update one question in an owned published daily or topic practice. Read get_daily_practice first; use its practice and question IDs. Supports prompt, promptTarget, instruction, context, choices, answer, answerIndex, Japanese annotations and explanation fields. Omitted fields are preserved. Choices must be distinct and contain the answer; answerIndex is zero-based and must agree with answer. Questions other than kanji reading still require concrete explanations. Preserves IDs and recorded learning history; does not update source drafts, library seeds or other copies. Text changes clear affected old annotations unless replacements are supplied. updated_at advances for device synchronization.',
    { practice_id: z.string().min(1), question_id: z.string().min(1), patch: practiceQuestionPatchSchema }, replacing,
    async ({ practice_id, question_id, patch }, ctx) => text(updatePracticeQuestion(uid(ctx), practice_id, question_id, patch)), { scope: 'library:write' }),
  tool('update_practice_question_explanation', 'Update explanations of one question in an owned published topic or daily practice, including confirmed draft publications. Read get_daily_practice first and use its practice and question IDs. Omitted fields are preserved; choiceAnalysis replaces all option explanations. The merged question must have specific overall and per-choice reasons. Preserves question text, choices, answer, IDs and learning history. Updates the published practice directly, not its source draft or other copies.',
    { practice_id: z.string().min(1), question_id: z.string().min(1), patch: practiceExplanationPatchSchema }, replacing,
    async ({ practice_id, question_id, patch }, ctx) => text(updatePracticeQuestionExplanation(uid(ctx), practice_id, question_id, patch)),
    { scope: 'library:write' }),
  tool('delete_daily_practice', 'Permanently delete one owned daily practice, its attempts and active attempt, and answers not shared by another practice. Preserve vocabulary items, cumulative mastery, source drafts and other practices. This cannot be undone.',
    { practice_id: z.string().min(1) }, destructive,
    async ({ practice_id }, ctx) => text({ ok: found(deleteDailyPractice(uid(ctx), practice_id), 'Daily practice not found') }),
    { scope: 'library:write' }),
  tool('create_review_pack_draft', 'Save generated review-pack content as a draft for in-app preview. Include content.description: a concise learner-facing explanation of scope, target level and learning objectives, based on the actual questions; do not include private source notes. Questions go in content.sections[].questions[] as { id, kind, tested, target, prompt, choices, answer, explanation_zh, choiceAnalysis: [{ choice, explanation }], source_origin, source_reference? }; source_origin must be ai_generated for a newly written question or textbook_original only when the question is transcribed from a textbook. For textbook_original also provide source_reference with the book and page or exercise number. If provenance cannot be verified, omit source_origin so the UI marks it as awaiting confirmation. A question inspired by a textbook but newly written is ai_generated. kind is the JLPT label 漢字読み, 表記, 語形成, 文脈規定, 言い換え類義, 用法 or 文法. Publishing requires a specific explanation for every choice.',
    { title: z.string(), content: z.record(z.string(), z.unknown()) }, rw,
    async ({ title, content }, ctx) => text(createReviewPackDraft(uid(ctx), { title, content }))),
  tool('list_review_pack_drafts', 'List saved review-pack drafts for the authenticated user.',
    {}, ro, async (_args, ctx) => text(listReviewPackDrafts(uid(ctx)))),
  tool('get_review_pack_draft', 'Read one review-pack draft with user annotations.',
    { draft_id: z.string() }, ro,
    async ({ draft_id }, ctx) => text(found(getReviewPackDraft(uid(ctx), draft_id), 'Draft not found'))),
  tool('update_review_pack_draft', 'Update an owned review-pack draft in place. Supply title and/or the complete content object; omitted fields are preserved. Content replaces the entire previous content, so read the draft first and retain any fields or questions you do not intend to change. The draft id, status, and annotations are preserved.',
    { draft_id: z.string().min(1), title: z.string().optional(), content: z.record(z.string(), z.unknown()).optional() }, replacing,
    async ({ draft_id, title, content }, ctx) => {
      if (title === undefined && content === undefined) throw new Error('Provide title or content to update');
      const current = found(getReviewPackDraft(uid(ctx), draft_id), 'Draft not found');
      return text(found(updateReviewPackDraft(uid(ctx), draft_id, {
        title: title ?? current.title,
        content: content ?? current.content,
      }), 'Draft not found'));
    }),
  tool('delete_review_pack_draft', 'Delete one saved review-pack draft for the authenticated user.',
    { draft_id: z.string() }, destructive,
    async ({ draft_id }, ctx) => text({ ok: Boolean(found(deleteReviewPackDraft(uid(ctx), draft_id), 'Draft not found')) }), { scope: 'library:write' }),
  tool('add_draft_annotation', 'Attach a user or agent annotation to a draft.',
    { draft_id: z.string(), body: z.string() }, rw,
    async ({ draft_id, body }, ctx) => text(found(addDraftAnnotation(uid(ctx), draft_id, { body }), 'Draft not found'))),
  tool('get_draft_revision_context', 'Read a draft, its annotations, study record, and an optimization prompt for the next revision.',
    { draft_id: z.string() }, ro,
    async ({ draft_id }, ctx) => text(found(buildDraftRevisionContext(uid(ctx), draft_id), 'Draft not found'))),
  tool('get_draft_processing_context', 'Read an approved draft, user marks such as unknown words, pending captures, study record, and routing rules for agent-driven library updates.',
    { draft_id: z.string() }, ro,
    async ({ draft_id }, ctx) => text(found(buildDraftProcessingContext(uid(ctx), draft_id), 'Draft not found'))),

  // Controlled read-only query layer (docs/mcp-query/schema-map.md): bounded pages, exact
  // aggregates and chunked detail reads instead of the multi-megabyte get_review_data dumps.
  ...createQueryTools({ getDb }),
];

/** Static resources served next to the tools: the MCP App view for practice sessions. */
export const resources = [practiceResource, reviewCardsResource, aiHomeResource];

/** JSON Schema view of a tool's input, for surfaces that do not speak zod (the stdio server). */
export function toolJsonSchema(entry) {
  return z.toJSONSchema(z.object(entry.inputSchema), { io: 'input' });
}
