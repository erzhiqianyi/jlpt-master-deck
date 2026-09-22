import { currentPlatform } from './platform.mjs';
import { readLocalOfficialSamples, readLocalMockExam, readLocalMockExamManifest, readLocalNewsCycles, readLocalNewsCycle } from './local-study-data.mjs';
import { decorateReferences, resolveReference, getReferenceQuestion, getReferenceMetadata } from './references.mjs';
import { sharingSources, listShares, shareDetail, sourcePackage } from './market.mjs';
import { readingFields } from './reading-schema.mjs';
// Tool catalogue shared by the OAuth-protected HTTP MCP server (server/mcp-app.mjs) and the
// legacy stdio server (server/mcp-server.mjs). Handlers receive `uid(ctx)`; nothing about the
// caller comes from tool input.
import { z } from 'zod';
import {
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
  createReadingQuestion,
  listReadingQuestions,
  readingQuestionForUser,
  updateReadingQuestion,
  createReviewPackDraft,
  createTopicPractice,
  createWordbook,
  deleteReviewPackDraft,
  exportReviewDataBackup,
  getReviewPackDraft,
  getDailyPractice,
  getPlanGenerationContext,
  getPracticeSession,
  getStudyPlan,
  getStudyState,
  getHistoryQuestions,
  findListeningAudioQuestions,
  listListeningRecordings,
  listDueReviews,
  listListeningQuestions,
  listPendingListeningRecordings,
  listLearningCaptures,
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
import { practiceResource, practiceToolMeta } from './mcp-ui.mjs';
import { createQueryTools } from './mcp-query.mjs';
import { getDb } from './storage.mjs';

/** Scope catalogue. `study` covers everything filtered by user id; `library:write` permits personal item writes. */
export const scopes = {
  study: { description: '读取并更新你的学习记录、计划、草稿、词书和题目', required: true },
  'library:write': { description: '修改你的题库（新增/更新复习条目、导出 JSON 备份）', default: false },
};

const ro = { readOnlyHint: true, openWorldHint: false };
const rw = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
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
  kinds: z.array(z.enum(PRACTICE_KINDS)).max(4).optional().describe('Question kinds to rotate through. Default: all four.'),
  wordbook_id: z.string().optional().describe('Restrict to items assigned to this wordbook (see list_wordbooks).'),
  jlpt_level: z.string().optional().describe('N1–N5; matches the item jlpt_level.'),
  only_due: z.boolean().optional().describe('Only items whose spaced-repetition review is due (or never reviewed).'),
  statuses: z.array(z.enum(['new', 'learning', 'review', 'mastered'])).optional().describe('Only items in these mastery states.'),
  count: z.number().int().min(1).max(50).optional().describe('Number of questions, default 10.'),
  title: z.string().optional().describe('Custom session title; default is derived from the filters.'),
  date: dateString.optional().describe('Practice date, default today in Asia/Tokyo.'),
};

export const tools = [
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
  tool('upsert_review_item', 'Create or update a non-media JLPT review item in your personal SQLite item library. Use for vocabulary, kanji, grammar, and other text-based practice seeds.', {
    item: z.record(z.string(), z.unknown()).describe('Complete review item object. item.original must already be the canonical dictionary form or standard spelling; do not add a separate normalized field. Ordinary vocabulary requires at least two natural Japanese usage examples and a Chinese translation in examples[].zh for each sentence; meta sentences that only say an expression was studied are not valid question contexts. For meaning questions, meaning_ja is a dictionary-style definition and paraphrase_ja is a shorter distinct paraphrase; do not duplicate them. Verbs and adjectives also require part_of_speech, inflection_class (godan, ichidan, suru, kuru, i_adjective, or na_adjective), base_form, and at least three conjugations shaped as { kind, form }.'),
  }, rw, async ({ item }, ctx) => text(upsertReviewItem(item, { source: 'mcp', userId: uid(ctx) })), { scope: 'library:write' }),
  tool('export_review_data_backup', 'Export your personal SQLite review item library into monthly JSON backup files. Use only when a JSON backup is requested.',
    {}, rw, async (_args, ctx) => text(exportReviewDataBackup(uid(ctx))), { scope: 'library:write' }),

  // Everything below is filtered by uid(ctx) inside storage.mjs.
  tool('get_study_state', 'Read the same learning state as the web page: settings, answers, item progress, complete attempt history and active attempt.',
    {}, ro, async (_args, ctx) => text(getStudyState(uid(ctx)))),
  tool('get_history_questions', 'Read the same generated-question details as the history page for completed attempts with wrong answers or related items. Read full attempt snapshots through get_study_state.',
    {}, ro, async (_args, ctx) => text(getHistoryQuestions(uid(ctx)))),
  tool('list_market_sources', 'List your wordbooks and practices available for sharing, as shown in the sharing page.',
    {}, ro, async (_args, ctx) => text(sharingSources(uid(ctx)))),
  tool('list_market_shares', 'List currently published marketplace shares visible to the authenticated learner.',
    {}, ro, async (_args, ctx) => text(listShares(uid(ctx)))),
  tool('get_market_share', 'Read one published share and its complete content package, with the same visibility rules as the web page.',
    { id: z.string() }, ro, async ({ id }, ctx) => text(shareDetail(uid(ctx), id))),
  tool('preview_market_source', 'Preview a share package from your own wordbook or practice without publishing it.',
    { kind: z.enum(['wordbook', 'practice']), sourceId: z.string(), title: z.string().optional(), description: z.string().optional() }, ro,
    async (args, ctx) => text({ package: sourcePackage(uid(ctx), args) })),
  tool('get_study_record', 'Read the full personalized study record from SQLite plus JSON resources.',
    {}, ro, async (_args, ctx) => text(buildStudyRecord(uid(ctx)))),
  tool('list_learning_captures', 'Read the learner inputs that still need explanation, organization, or conversion into review material.',
    { status: z.enum(['inbox', 'processed', 'archived']).optional() }, ro,
    async ({ status }, ctx) => text(listLearningCaptures(uid(ctx), status))),
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
    { itemId: z.string(), wordbookId: z.string().optional().describe('Destination wordbook id from list_wordbooks; must match the item deck family.'), tags: z.array(z.string()).optional().describe('Full replacement tag list.') }, rw,
    async ({ itemId, wordbookId, tags }, ctx) => text(found(organizeReviewItem(uid(ctx), itemId, { wordbookId, tags }), 'Review item not found'))),
  tool('rename_wordbook', 'Rename a wordbook while keeping its id and assigned entries unchanged.',
    { wordbookId: z.string(), title: z.string() }, rw,
    async ({ wordbookId, title }, ctx) => text(found(updateWordbook(uid(ctx), wordbookId, { title }), 'Wordbook not found'))),
  tool('get_study_plan', "Read the learner's saved JLPT exam plan, materials, weekly frequency, and available study time.",
    {}, ro, async (_args, ctx) => text(getStudyPlan(uid(ctx)))),
  tool('get_plan_generation_context', 'Read the learner profile, recent practice, weak points, daily summaries, and instructions needed to generate or revise a daily JLPT plan.',
    {}, ro, async (_args, ctx) => text(getPlanGenerationContext(uid(ctx)))),
  tool('save_generated_study_plan', 'Save a complete agent-generated daily plan for calendar tracking. Replaces generated tasks while preserving matching completed task IDs. Send phases together with tasks so the plan outline stays in sync; omitting phases keeps the stored ones.', {
    phases: z.array(planPhase).max(12).optional().describe('2 to 5 non-overlapping phases covering the study period, ordered by date.'),
    tasks: z.array(planTask).max(730),
  }, rw, async ({ tasks, phases }, ctx) => text(saveGeneratedStudyPlan(uid(ctx), { tasks, phases }))),
  tool('list_due_reviews', 'List items whose nextReviewAt is due or overdue.',
    { at: z.string().optional() }, ro, async ({ at }, ctx) => text(listDueReviews(uid(ctx), at))),
  tool('list_listening_questions', "Read the authenticated user's uploaded listening-question metadata. Audio bytes stay in local storage.",
    {}, ro, async (_args, ctx) => text(listListeningQuestions(uid(ctx)))),
  tool('find_listening_audio_questions', 'Find your listening questions attached to an audio SHA-256, matching the web audio lookup.',
    { sha256: z.string().regex(/^[a-f0-9]{64}$/) }, ro,
    async ({ sha256 }, ctx) => text(findListeningAudioQuestions(uid(ctx), sha256))),
  tool('list_listening_recordings', 'Read all your recordings for a listening question, including completed analyses; this does not claim or change a recording.',
    { question_id: z.string() }, ro,
    async ({ question_id }, ctx) => text(listListeningRecordings(uid(ctx), question_id))),
  tool('create_listening_question', 'Create a local listening question from agent-prepared metadata and audio bytes. Use only when real local audioBase64 is available.', {
    title: z.string().optional(),
    questionTypeId: z.enum(['listening-task', 'listening-points', 'listening-outline', 'listening-quick', 'listening-integrated', 'listening-basic-training']).optional(),
    question: z.string(),
    choices,
    answerIndex: z.number(),
    explanation: z.string().optional(),
    audioFileName: z.string(),
    audioMime: z.string(),
    audioBase64: z.string(),
  }, rw, async (args, ctx) => text(createListeningQuestion(uid(ctx), args))),
  tool('list_pending_listening_recordings', 'List learner recordings waiting for local Agent analysis. Use get_listening_recording_analysis_context to claim one recording and obtain both local audio paths.',
    {}, ro, async (_args, ctx) => text(listPendingListeningRecordings(uid(ctx)))),
  tool('get_listening_recording_analysis_context', 'Claim one learner recording for analysis and return the local learner-recording path, reference-audio path, question metadata, and evidence rules.',
    { recording_id: z.string() }, rw,
    async ({ recording_id }, ctx) => text(found(buildListeningRecordingAnalysisContext(uid(ctx), recording_id), 'Listening recording or local audio file not found'))),
  tool('save_listening_recording_analysis', 'Write the completed local audio comparison back to the learner recording so the detail page can display it.',
    { recording_id: z.string(), status: z.enum(['completed', 'failed']), analysis: recordingAnalysis.optional() }, rw,
    async ({ recording_id, status, analysis }, ctx) => text(found(saveListeningRecordingAnalysis(uid(ctx), recording_id, { status, analysis }), 'Listening recording not found'))),
  tool('list_reading_questions', 'List all reading questions owned by the authenticated learner, including their explanations.',
    {}, ro, async (_args, ctx) => text(listReadingQuestions(uid(ctx)))),
  tool('get_reading_question', 'Get one owned reading question and its complete reading analysis.',
    { id: z.string() }, ro, async ({ id }, ctx) => text(found(readingQuestionForUser(uid(ctx), id), 'Reading question not found'))),
  tool('create_reading_question', 'Create a reading question with full passage translation, ordered choice explanations and reading analysis. explanation remains the overall explanation.',
    readingFields, rw, async (args, ctx) => text(createReadingQuestion(uid(ctx), args))),
  tool('update_reading_question', 'Partially update an owned reading question. Omitted fields are preserved; arrays and readingAnalysis are replaced as a whole. When changing choices, update or clear choiceExplanations to keep them aligned.',
    { id: z.string(), ...Object.fromEntries(Object.entries(readingFields).map(([key, schema]) => [key, schema.optional()])) }, rw,
    async ({ id, ...patch }, ctx) => text(found(updateReadingQuestion(uid(ctx), id, patch), 'Reading question not found'))),
  tool('analyze_weak_points', 'Analyze wrong answers, learning items, due items, and mastery totals.',
    {}, ro, async (_args, ctx) => text(analyzeWeakPoints(uid(ctx)))),
  tool('generate_daily_review_pack', 'Create a personalized daily review-pack draft that the user can preview and annotate.',
    { title: z.string().optional(), minutes: z.number().optional() }, rw,
    async ({ title, minutes }, ctx) => text(createDailyReviewPackDraft(uid(ctx), { title, minutes }))),
  tool('generate_daily_practice', "Create a new version of today's personalized formal daily practice. Analyze the previous Asia/Tokyo day's answer history first, target weak question types with new same-type questions, and determine the appropriate amount of practice from the available evidence. If the previous day has no answers, fall back to broader answer history.",
    { title: z.string().optional(), minutes: z.number().optional(), date: dateString.optional().describe('YYYY-MM-DD. Defaults to today in Asia/Tokyo.') }, rw,
    async ({ title, minutes, date }, ctx) => text(createDailyPractice(uid(ctx), { title, minutes, date }))),
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
  tool('create_review_pack_draft', 'Save generated review-pack content as a draft for in-app preview. Include content.description: a concise learner-facing explanation of scope, target level and learning objectives, based on the actual questions; do not include private source notes.',
    { title: z.string(), content: z.record(z.string(), z.unknown()) }, rw,
    async ({ title, content }, ctx) => text(createReviewPackDraft(uid(ctx), { title, content }))),
  tool('list_review_pack_drafts', 'List saved review-pack drafts for the authenticated user.',
    {}, ro, async (_args, ctx) => text(listReviewPackDrafts(uid(ctx)))),
  tool('get_review_pack_draft', 'Read one review-pack draft with user annotations.',
    { draft_id: z.string() }, ro,
    async ({ draft_id }, ctx) => text(found(getReviewPackDraft(uid(ctx), draft_id), 'Draft not found'))),
  tool('delete_review_pack_draft', 'Delete one saved review-pack draft for the authenticated user.',
    { draft_id: z.string() }, destructive,
    async ({ draft_id }, ctx) => text({ ok: Boolean(found(deleteReviewPackDraft(uid(ctx), draft_id), 'Draft not found')) })),
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
export const resources = [practiceResource];

/** JSON Schema view of a tool's input, for surfaces that do not speak zod (the stdio server). */
export function toolJsonSchema(entry) {
  return z.toJSONSchema(z.object(entry.inputSchema), { io: 'input' });
}
