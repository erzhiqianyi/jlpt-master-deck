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
  createReviewPackDraft,
  createWordbook,
  deleteReviewPackDraft,
  exportReviewDataBackup,
  getReviewPackDraft,
  getDailyPractice,
  getPlanGenerationContext,
  getStudyPlan,
  listDueReviews,
  listListeningQuestions,
  listPendingListeningRecordings,
  listLearningCaptures,
  listReviewPackDrafts,
  listDailyPractices,
  listWordbooks,
  loadReviewData,
  loginUser,
  saveGeneratedStudyPlan,
  saveListeningRecordingAnalysis,
  upsertReviewItem,
  updateWordbook,
  userForToken,
} from './storage.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const protocolVersion = '2024-11-05';
const serverInfo = { name: 'jlpt-local-mcp', version: '0.1.0' };
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const statusPath = join(rootDir, '.local', 'mcp-status.json');

process.stdin.setEncoding('utf8');
let buffer = '';

process.stdin.on('data', (chunk) => {
  buffer += chunk;
  for (;;) {
    const index = buffer.indexOf('\n');
    if (index === -1) {
      return;
    }
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line) {
      handleMessage(line);
    }
  }
});

async function handleMessage(line) {
  const message = JSON.parse(line);
  try {
    if (message.method === 'initialize') {
      writeMcpStatus({ method: 'initialize' });
      return respond(message.id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo,
      });
    }

    if (message.method === 'tools/list') {
      writeMcpStatus({ method: 'tools/list' });
      return respond(message.id, { tools: toolList() });
    }

    if (message.method === 'tools/call') {
      writeMcpStatus({ method: 'tools/call', tool: message.params?.name });
      const result = await callTool(message.params?.name, message.params?.arguments ?? {});
      return respond(message.id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      });
    }

    if (message.id !== undefined) {
      return respond(message.id, {});
    }
  } catch (error) {
    respondError(message.id, -32000, error.message);
  }
}

async function callTool(name, args) {
  if (name === 'login') {
    const session = loginUser(args.username, args.password);
    if (!session) {
      throw new Error('Invalid username or password');
    }
    return session;
  }

  const user = userForToken(args.token);
  if (!user) {
    throw new Error('Authentication required. Call login first and pass the returned token.');
  }

  if (name === 'get_review_data') {
    return loadReviewData();
  }
  if (name === 'upsert_review_item') {
    return upsertReviewItem(args.item, { source: 'mcp' });
  }
  if (name === 'export_review_data_backup') {
    return exportReviewDataBackup();
  }
  if (name === 'get_study_record') {
    return buildStudyRecord(user.id);
  }
  if (name === 'list_learning_captures') {
    return listLearningCaptures(user.id, args.status);
  }
  if (name === 'create_learning_capture') {
    return createLearningCapture(user.id, { body: args.body, category: args.category, context: args.context, targetDeck: args.targetDeck, targetWordbookId: args.targetWordbookId });
  }
  if (name === 'list_wordbooks') {
    return listWordbooks(user.id);
  }
  if (name === 'create_wordbook') {
    return createWordbook(user.id, args);
  }
  if (name === 'rename_wordbook') {
    const wordbook = updateWordbook(user.id, args.wordbookId, { title: args.title });
    if (!wordbook) throw new Error('Wordbook not found');
    return wordbook;
  }
  if (name === 'get_study_plan') {
    return getStudyPlan(user.id);
  }
  if (name === 'get_plan_generation_context') {
    return getPlanGenerationContext(user.id);
  }
  if (name === 'save_generated_study_plan') {
    return saveGeneratedStudyPlan(user.id, { tasks: args.tasks, phases: args.phases });
  }
  if (name === 'list_due_reviews') {
    return listDueReviews(user.id, args.at);
  }
  if (name === 'list_listening_questions') {
    return listListeningQuestions(user.id);
  }
  if (name === 'create_listening_question') {
    return createListeningQuestion(user.id, args);
  }
  if (name === 'list_pending_listening_recordings') {
    return listPendingListeningRecordings(user.id);
  }
  if (name === 'get_listening_recording_analysis_context') {
    const context = buildListeningRecordingAnalysisContext(user.id, args.recording_id);
    if (!context) throw new Error('Listening recording or local audio file not found');
    return context;
  }
  if (name === 'save_listening_recording_analysis') {
    const recording = saveListeningRecordingAnalysis(user.id, args.recording_id, { status: args.status, analysis: args.analysis });
    if (!recording) throw new Error('Listening recording not found');
    return recording;
  }
  if (name === 'create_reading_question') {
    return createReadingQuestion(user.id, args);
  }
  if (name === 'analyze_weak_points') {
    return analyzeWeakPoints(user.id);
  }
  if (name === 'generate_daily_review_pack') {
    return createDailyReviewPackDraft(user.id, { title: args.title, minutes: args.minutes });
  }
  if (name === 'generate_daily_practice') {
    return createDailyPractice(user.id, { title: args.title, minutes: args.minutes, date: args.date });
  }
  if (name === 'publish_draft_as_daily_practice') {
    return createDailyPracticeFromDraft(user.id, args.draft_id, { date: args.date, title: args.title });
  }
  if (name === 'list_daily_practices') {
    return listDailyPractices(user.id);
  }
  if (name === 'get_daily_practice') {
    const practice = getDailyPractice(user.id, args.practice_id);
    if (!practice) {
      throw new Error('Daily practice not found');
    }
    return practice;
  }
  if (name === 'create_review_pack_draft') {
    return createReviewPackDraft(user.id, { title: args.title, content: args.content });
  }
  if (name === 'list_review_pack_drafts') {
    return listReviewPackDrafts(user.id);
  }
  if (name === 'get_review_pack_draft') {
    const draft = getReviewPackDraft(user.id, args.draft_id);
    if (!draft) {
      throw new Error('Draft not found');
    }
    return draft;
  }
  if (name === 'delete_review_pack_draft') {
    if (!deleteReviewPackDraft(user.id, args.draft_id)) {
      throw new Error('Draft not found');
    }
    return { ok: true };
  }
  if (name === 'add_draft_annotation') {
    const draft = addDraftAnnotation(user.id, args.draft_id, { body: args.body });
    if (!draft) {
      throw new Error('Draft not found');
    }
    return draft;
  }
  if (name === 'get_draft_revision_context') {
    const context = buildDraftRevisionContext(user.id, args.draft_id);
    if (!context) {
      throw new Error('Draft not found');
    }
    return context;
  }
  if (name === 'get_draft_processing_context') {
    const context = buildDraftProcessingContext(user.id, args.draft_id);
    if (!context) {
      throw new Error('Draft not found');
    }
    return context;
  }
  throw new Error(`Unknown tool: ${name}`);
}

function toolList() {
  return [
    {
      name: 'login',
      description: 'Authenticate with a local JLPT username and password. Returns a bearer token for other tools.',
      inputSchema: {
        type: 'object',
        properties: { username: { type: 'string' }, password: { type: 'string' } },
        required: ['username', 'password'],
      },
    },
    tokenTool('get_review_data', 'Read JLPT review items from the local SQLite item library. JSON files are treated as export/import backups.'),
    tokenTool('upsert_review_item', 'Create or update a non-media JLPT review item in the local SQLite item library. Use for vocabulary, kanji, grammar, and other text-based practice seeds.', {
      item: {
        type: 'object',
        description: 'Complete review item object. item.original must already be the canonical dictionary form or standard spelling; do not add a separate normalized field. Ordinary vocabulary requires at least two natural Japanese usage examples and a Chinese translation in examples[].zh for each sentence; meta sentences that only say an expression was studied are not valid question contexts. For meaning questions, meaning_ja is a dictionary-style definition and paraphrase_ja is a shorter distinct paraphrase; do not duplicate them. Verbs and adjectives also require part_of_speech, inflection_class (godan, ichidan, suru, kuru, i_adjective, or na_adjective), base_form, and at least three conjugations shaped as { kind, form }.',
      },
    }, ['token', 'item']),
    tokenTool('export_review_data_backup', 'Export the SQLite review item library into monthly JSON backup files. Use only when a JSON backup is requested.'),
    tokenTool('get_study_record', 'Read the full personalized study record from SQLite plus JSON resources.'),
    tokenTool('list_learning_captures', 'Read the learner inputs that still need explanation, organization, or conversion into review material.', { status: { type: 'string', enum: ['inbox', 'processed', 'archived'] } }),
    tokenTool('create_learning_capture', 'Save a word, sentence, grammar point, listening issue, or other learner question into the local inbox.', {
      body: { type: 'string' },
      category: { type: 'string', enum: ['word', 'grammar', 'sentence', 'listening', 'reading', 'unsure'] },
      context: { type: 'string' },
      targetDeck: { type: 'string', enum: ['n1_vocab', 'name_reading', 'grammar_expression'], description: 'Requested destination deck for word or grammar captures.' },
      targetWordbookId: { type: 'string', description: 'Requested destination wordbook id, including custom wordbooks returned by list_wordbooks.' },
    }, ['token', 'body']),
    tokenTool('list_wordbooks', 'List built-in and user-created vocabulary wordbooks available as capture destinations.'),
    tokenTool('create_wordbook', 'Create a custom vocabulary wordbook for future captures.', {
      title: { type: 'string' },
      deck: { type: 'string', enum: ['n1_vocab', 'name_reading'], description: 'Base deck used for generated review questions.' },
    }, ['token', 'title']),
    tokenTool('rename_wordbook', 'Rename a vocabulary wordbook while keeping its id and assigned entries unchanged.', {
      wordbookId: { type: 'string' },
      title: { type: 'string' },
    }, ['token', 'wordbookId', 'title']),
    tokenTool('get_study_plan', 'Read the learner\'s saved JLPT exam plan, materials, weekly frequency, and available study time.'),
    tokenTool('get_plan_generation_context', 'Read the learner profile, recent practice, weak points, daily summaries, and instructions needed to generate or revise a daily JLPT plan.'),
    tokenTool(
      'save_generated_study_plan',
      'Save a complete agent-generated daily plan for calendar tracking. Replaces generated tasks while preserving matching completed task IDs. Send phases together with tasks so the plan outline stays in sync; omitting phases keeps the stored ones.',
      {
        phases: {
          type: 'array',
          maxItems: 12,
          description: '2 to 5 non-overlapping phases covering the study period, ordered by date.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              startDate: { type: 'string', description: 'YYYY-MM-DD within the saved study period.' },
              endDate: { type: 'string', description: 'YYYY-MM-DD within the saved study period, on or after startDate.' },
              focus: { type: 'string', description: 'Short phase name, for example 技能強化.' },
              points: { type: 'array', maxItems: 8, items: { type: 'string' }, description: 'Concrete sections or skills this phase covers.' },
              goal: { type: 'string', description: 'What the learner should be able to do when the phase ends.' },
            },
            required: ['startDate', 'endDate', 'focus'],
          },
        },
        tasks: {
          type: 'array',
          maxItems: 730,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              date: { type: 'string', description: 'YYYY-MM-DD within the saved study period.' },
              title: { type: 'string' },
              module: { type: 'string', enum: ['grammar', 'reading', 'listening', 'vocabulary', 'other'] },
              minutes: { type: 'number' },
              detail: { type: 'string' },
              sourceLabel: { type: 'string' },
              materialId: { type: 'string' },
              workloadKind: { type: 'string', enum: ['standard', 'full_mock'], description: 'Use full_mock only for a formally timed full mock-exam day that may exceed the ordinary daily target.' },
            },
            required: ['date', 'title', 'module', 'minutes'],
          },
        },
      },
      ['token', 'tasks'],
    ),
    tokenTool('list_due_reviews', 'List items whose nextReviewAt is due or overdue.', { at: { type: 'string' } }),
    tokenTool('list_listening_questions', 'Read the authenticated user\'s uploaded listening-question metadata. Audio bytes stay in local storage.'),
    tokenTool('create_listening_question', 'Create a local listening question from agent-prepared metadata and audio bytes. Use only when real local audioBase64 is available.', {
      title: { type: 'string' },
      questionTypeId: { type: 'string', enum: ['listening-task', 'listening-points', 'listening-outline', 'listening-quick', 'listening-integrated', 'listening-basic-training'] },
      question: { type: 'string' },
      choices: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 6 },
      answerIndex: { type: 'number' },
      explanation: { type: 'string' },
      audioFileName: { type: 'string' },
      audioMime: { type: 'string' },
      audioBase64: { type: 'string' },
    }, ['token', 'question', 'choices', 'answerIndex', 'audioFileName', 'audioMime', 'audioBase64']),
    tokenTool('list_pending_listening_recordings', 'List learner recordings waiting for local Agent analysis. Use get_listening_recording_analysis_context to claim one recording and obtain both local audio paths.'),
    tokenTool('get_listening_recording_analysis_context', 'Claim one learner recording for analysis and return the local learner-recording path, reference-audio path, question metadata, and evidence rules.', {
      recording_id: { type: 'string' },
    }, ['token', 'recording_id']),
    tokenTool('save_listening_recording_analysis', 'Write the completed local audio comparison back to the learner recording so the detail page can display it.', {
      recording_id: { type: 'string' },
      status: { type: 'string', enum: ['completed', 'failed'] },
      analysis: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          transcript: { type: 'string' },
          referenceTranscript: { type: 'string' },
          strengths: { type: 'array', items: { type: 'string' }, maxItems: 8 },
          improvements: { type: 'array', items: { type: 'string' }, maxItems: 8 },
          nextPractice: { type: 'string' },
        },
        required: ['summary', 'nextPractice'],
      },
    }, ['token', 'recording_id', 'status']),
    tokenTool('create_reading_question', 'Create a local reading question from agent-prepared passage, choices, answer, and explanation.', {
      title: { type: 'string' },
      passage: { type: 'string' },
      question: { type: 'string' },
      choices: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 6 },
      answerIndex: { type: 'number' },
      explanation: { type: 'string' },
    }, ['token', 'passage', 'question', 'choices', 'answerIndex']),
    tokenTool('analyze_weak_points', 'Analyze wrong answers, learning items, due items, and mastery totals.'),
    tokenTool('generate_daily_review_pack', 'Create a personalized daily review-pack draft that the user can preview and annotate.', { title: { type: 'string' }, minutes: { type: 'number' } }),
    tokenTool('generate_daily_practice', 'Create a new version of today\'s personalized formal daily practice. Analyze the previous Asia/Tokyo day\'s answer history first, target weak question types with new same-type questions, and determine the appropriate amount of practice from the available evidence. If the previous day has no answers, fall back to broader answer history.', { title: { type: 'string' }, minutes: { type: 'number' }, date: { type: 'string', description: 'YYYY-MM-DD. Defaults to today in Asia/Tokyo.' } }),
    tokenTool('publish_draft_as_daily_practice', 'Publish one approved draft as a complete formal practice set in the Today workspace, preserving its question order and answer choices.', { draft_id: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD. Defaults to today in Asia/Tokyo.' }, title: { type: 'string' } }, ['token', 'draft_id']),
    tokenTool('list_daily_practices', 'List generated formal daily practices for the authenticated user.'),
    tokenTool('get_daily_practice', 'Read one formal daily practice with its generated questions.', { practice_id: { type: 'string' } }, ['token', 'practice_id']),
    tokenTool('create_review_pack_draft', 'Save generated review-pack content as a draft for in-app preview.', { title: { type: 'string' }, content: { type: 'object' } }, ['token', 'title', 'content']),
    tokenTool('list_review_pack_drafts', 'List saved review-pack drafts for the authenticated user.'),
    tokenTool('get_review_pack_draft', 'Read one review-pack draft with user annotations.', { draft_id: { type: 'string' } }, ['token', 'draft_id']),
    tokenTool('delete_review_pack_draft', 'Delete one saved review-pack draft for the authenticated user.', { draft_id: { type: 'string' } }, ['token', 'draft_id']),
    tokenTool('add_draft_annotation', 'Attach a user or agent annotation to a draft.', { draft_id: { type: 'string' }, body: { type: 'string' } }, ['token', 'draft_id', 'body']),
    tokenTool('get_draft_revision_context', 'Read a draft, its annotations, study record, and an optimization prompt for the next revision.', { draft_id: { type: 'string' } }, ['token', 'draft_id']),
    tokenTool('get_draft_processing_context', 'Read an approved draft, user marks such as unknown words, pending captures, study record, and routing rules for agent-driven library updates.', { draft_id: { type: 'string' } }, ['token', 'draft_id']),
  ];
}

function tokenTool(name, description, extraProperties = {}, required = ['token']) {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties: { token: { type: 'string' }, ...extraProperties },
      required,
    },
  };
}

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function respondError(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`);
}

function writeMcpStatus({ method, tool }) {
  mkdirSync(dirname(statusPath), { recursive: true });
  writeFileSync(statusPath, JSON.stringify({
    lastSeenAt: new Date().toISOString(),
    lastMethod: method,
    lastTool: tool ?? null,
  }, null, 2));
}
