import { userReviewData, sharingSources, sourcePackage, publishShare, listShares, shareDetail, withdrawShare, importPackage, validatePackage } from './market.mjs';
import { authConfiguration, firebaseSession, firebaseIdentity } from './firebase-auth.mjs';
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeWeakPoints,
  addDraftAnnotation,
  buildDraftRevisionContext,
  buildDraftProcessingContext,
  buildStudyRecord,
  confirmDraftForAgentProcessing,
  createDailyReviewPackDraft,
  createDailyPractice,
  createDailyPracticeFromDraft,
  createListeningRecording,
  createListeningQuestion,
  createLearningCapture,
  createReviewPackDraft,
  createReadingQuestion,
  createUser,
  createWordbook,
  databasePath,
  deleteSession,
  deleteListeningQuestion,
  deleteReadingQuestion,
  deleteReviewPackDraft,
  getReviewPackDraft,
  getDailyPractice,
  getHistoryQuestions,
  getStudyState,
  getStudyPlan,
  saveGeneratedStudyPlan,
  listReviewPackDrafts,
  listDailyPractices,
  listListeningQuestions,
  listListeningRecordings,
  listReadingQuestions,
  listLearningCaptures,
  listWordbooks,
  organizeReviewItem,
  listeningAudioForUser,
  listeningRecordingAudioForUser,
  loadReviewData,
  loginUser,
  reviewDataPath,
  saveAnswer,
  savePracticeState,
  saveProgressEntry,
  saveSettings,
  saveStudyPlanProfile,
  updateStudyPlanTask,
  updateLearningCaptureStatus,
  updateWordbook,
  updateReviewPackDraft,
  userForToken,
} from './storage.mjs';
import { localConfig } from './local-config.mjs';
import { getRequestListener } from '@hono/node-server';
import { createJlptMcp, MCP_PATHS } from './mcp-app.mjs';

const { apiPort: port, host } = localConfig();
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localOfficialRoot = join(rootDir, '.local', 'official-jlpt');
const localMockRoot = join(rootDir, '.local', 'mock-exams');
const localNewsRoot = resolve(process.env.JLPT_NEWS_SOURCE_DIR ?? '/Users/itsuki/AI/knowledge-base/personal-knowledge/sources/jlpt-news');

// OAuth 2.1 + MCP surface (/api/jlpt/mcp, /api/jlpt/oauth/*, /.well-known/oauth-*). It claims
// its paths before the REST routes below; ensureSchema() runs once at startup.
const mcp = createJlptMcp();
await mcp.ensureSchema();
const mcpListener = getRequestListener(async (request) => (await mcp.fetch(request)) ?? new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } }));

const server = createServer(async (req, res) => {
  if (MCP_PATHS.test(req.url ?? '')) return mcpListener(req, res);
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const token = bearerToken(req);
    const user = userForToken(token);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return json(res, 200, buildHealthPayload());
    }

    if (req.method === 'GET' && url.pathname === '/api/local-official-samples') {
      if (!isLoopbackRequest(req)) {
        return json(res, 403, { error: 'Local official samples are only available from localhost' });
      }
      return json(res, 200, readLocalOfficialSamples(url.searchParams.get('module')));
    }

    if (req.method === 'GET' && url.pathname === '/api/local-mock-exams') {
      if (!isLoopbackRequest(req)) {
        return json(res, 403, { error: 'Local mock exams are only available from localhost' });
      }
      return readLocalMockExamManifest(res);
    }

    if (req.method === 'GET' && url.pathname === '/api/local-news-cycle') {
      if (!isLoopbackRequest(req) && !user) {
        return json(res, 401, { error: 'Authentication required' });
      }
      return json(res, 200, readLocalNewsCycle(url.searchParams.get('id')));
    }

    if (req.method === 'GET' && url.pathname === '/api/local-news-cycles') {
      if (!isLoopbackRequest(req) && !user) {
        return json(res, 401, { error: 'Authentication required' });
      }
      return json(res, 200, { cycles: readLocalNewsCycles() });
    }

    const localNewsAudioMatch = /^\/api\/local-news-audio\/(\d{4}-\d{2}-\d{2})\/(.+)$/.exec(url.pathname);
    if (req.method === 'GET' && localNewsAudioMatch) {
      if (!isLoopbackRequest(req) && !user) {
        return json(res, 401, { error: 'Authentication required' });
      }
      return streamLocalFile(res, localNewsRoot, `${localNewsAudioMatch[1]}/media/${localNewsAudioMatch[2]}`, 'Local news audio not found');
    }

    const localMockExamMatch = /^\/api\/local-mock-exams\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && localMockExamMatch) {
      if (!isLoopbackRequest(req)) {
        return json(res, 403, { error: 'Local mock exams are only available from localhost' });
      }
      return readLocalMockExam(res, localMockExamMatch[1]);
    }

    const localMockFileMatch = /^\/api\/local-mock-files\/(.+)$/.exec(url.pathname);
    if (req.method === 'GET' && localMockFileMatch) {
      if (!isLoopbackRequest(req)) {
        return json(res, 403, { error: 'Local mock files are only available from localhost' });
      }
      return streamLocalFile(res, localMockRoot, localMockFileMatch[1], 'Local mock file not found');
    }

    const localOfficialMatch = /^\/api\/local-official-jlpt\/(.+)$/.exec(url.pathname);
    if (req.method === 'GET' && localOfficialMatch) {
      if (!isLoopbackRequest(req)) {
        return json(res, 403, { error: 'Local official files are only available from localhost' });
      }
      return streamLocalOfficialFile(res, localOfficialMatch[1]);
    }

    if (req.method === 'GET' && url.pathname === '/api/auth/config') return json(res, 200, authConfiguration());
    if (req.method === 'POST' && url.pathname === '/api/auth/firebase') {
      try { return json(res, 200, await firebaseSession((await readJson(req)).idToken)); }
      catch { return json(res, 401, { error: 'Firebase 登录验证失败，请重试' }); }
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/firebase/link') {
      if (!user) return json(res,401,{ error:'请先登录原来的本地账号' });
      try { return json(res,200,await firebaseSession((await readJson(req)).idToken,user)); }
      catch (error) { return json(res,400,{error:error.message}); }
    }
    if (authConfiguration().mode === 'firebase' && ['/api/auth/login', '/api/auth/register'].includes(url.pathname)) {
      return json(res, 403, { error: '此部署使用 Firebase 登录' });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/register') {
      const body = await readJson(req);
      const created = createUser(body.username, body.password);
      const session = loginUser(body.username, body.password);
      return json(res, 201, { user: created, token: session.token });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readJson(req);
      const session = loginUser(body.username, body.password);
      if (!session) {
        return json(res, 401, { error: 'Invalid username or password' });
      }
      return json(res, 200, session);
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      deleteSession(token);
      return json(res, 200, { ok: true });
    }

    if (!user) {
      return json(res, 401, { error: 'Authentication required' });
    }

    if (url.pathname === '/api/auth/firebase/status' && req.method === 'GET') return json(res,200,firebaseIdentity(user.id));
    if (url.pathname === '/api/market/sources' && req.method === 'GET') return json(res,200,sharingSources(user.id));
    if (url.pathname === '/api/market/preview' && req.method === 'POST') return json(res,200,{ package:sourcePackage(user.id,await readJson(req)) });
    if (url.pathname === '/api/market/validate' && req.method === 'POST') return json(res,200,{ package:validatePackage(await readJson(req)) });
    if (url.pathname === '/api/market/import' && req.method === 'POST') return json(res,201,importPackage(user.id,await readJson(req)));
    if (url.pathname === '/api/market' && req.method === 'GET') return json(res,200,{shares:listShares(user.id)});
    if (url.pathname === '/api/market' && req.method === 'POST') return json(res,201,publishShare(user.id,await readJson(req)));
    const shareMatch = /^\/api\/market\/([^/]+)$/.exec(url.pathname);
    if (shareMatch && req.method === 'GET') return json(res,200,shareDetail(user.id,shareMatch[1]));
    if (shareMatch && req.method === 'DELETE') return json(res,200,withdrawShare(user.id,shareMatch[1]));

    if (req.method === 'GET' && url.pathname === '/api/me') {
      return json(res, 200, { user });
    }

    // Agents connected through OAuth (settings page): list and disconnect.
    if (req.method === 'GET' && url.pathname === '/api/agents') {
      return json(res, 200, { grants: await mcp.listGrants(String(user.id)) });
    }
    const revokeAgentMatch = /^\/api\/agents\/([^/]+)\/revoke$/.exec(url.pathname);
    if (req.method === 'POST' && revokeAgentMatch) {
      await mcp.revokeGrant(String(user.id), decodeURIComponent(revokeAgentMatch[1]));
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/review-data') {
      return json(res, 200, userReviewData(user.id));
    }

    if (req.method === 'GET' && url.pathname === '/api/wordbooks') {
      return json(res, 200, { wordbooks: listWordbooks(user.id) });
    }

    if (req.method === 'POST' && url.pathname === '/api/wordbooks') {
      return json(res, 201, { wordbook: createWordbook(user.id, await readJson(req)) });
    }

    const reviewItemMatch = /^\/api\/review-items\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'PATCH' && reviewItemMatch) {
      const item = organizeReviewItem(user.id, decodeURIComponent(reviewItemMatch[1]), await readJson(req));
      return item ? json(res, 200, { item }) : json(res, 404, { error: 'Review item not found' });
    }

    const wordbookMatch = /^\/api\/wordbooks\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'PATCH' && wordbookMatch) {
      const wordbook = updateWordbook(user.id, decodeURIComponent(wordbookMatch[1]), await readJson(req));
      return wordbook ? json(res, 200, { wordbook }) : json(res, 404, { error: 'Wordbook not found' });
    }

    if (req.method === 'GET' && url.pathname === '/api/study-state') {
      return json(res, 200, getStudyState(user.id));
    }

    if (req.method === 'PUT' && url.pathname === '/api/study-state/settings') {
      return json(res, 200, { settings: saveSettings(user.id, await readJson(req)) });
    }

    if (req.method === 'GET' && url.pathname === '/api/study-plan') {
      return json(res, 200, { plan: getStudyPlan(user.id) });
    }

    if (req.method === 'PUT' && (url.pathname === '/api/study-plan' || url.pathname === '/api/study-plan/profile')) {
      return json(res, 200, { plan: saveStudyPlanProfile(user.id, await readJson(req)) });
    }

    if (req.method === 'POST' && url.pathname === '/api/study-plan/generated') {
      return json(res, 200, { plan: saveGeneratedStudyPlan(user.id, await readJson(req)) });
    }

    const planTaskMatch = /^\/api\/study-plan\/tasks\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'PATCH' && planTaskMatch) {
      const body = await readJson(req);
      const plan = updateStudyPlanTask(user.id, planTaskMatch[1], body.status);
      return plan ? json(res, 200, { plan }) : json(res, 404, { error: 'Plan task not found' });
    }

    if (req.method === 'PUT' && url.pathname === '/api/study-state/practice') {
      savePracticeState(user.id, await readJson(req));
      return json(res, 200, getStudyState(user.id));
    }

    const progressMatch = /^\/api\/study-state\/progress\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'PUT' && progressMatch) {
      return json(res, 200, saveProgressEntry(user.id, decodeURIComponent(progressMatch[1]), await readJson(req)));
    }

    if (req.method === 'POST' && url.pathname === '/api/answers') {
      saveAnswer(user.id, await readJson(req));
      return json(res, 200, getStudyState(user.id));
    }

    if (req.method === 'GET' && url.pathname === '/api/study-record') {
      return json(res, 200, buildStudyRecord(user.id));
    }

    if (req.method === 'GET' && url.pathname === '/api/captures') {
      return json(res, 200, { captures: listLearningCaptures(user.id, url.searchParams.get('status')) });
    }

    if (req.method === 'POST' && url.pathname === '/api/captures') {
      return json(res, 201, { capture: createLearningCapture(user.id, await readJson(req)) });
    }

    const captureMatch = /^\/api\/captures\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'PATCH' && captureMatch) {
      const capture = updateLearningCaptureStatus(user.id, captureMatch[1], (await readJson(req)).status);
      return capture ? json(res, 200, { capture }) : json(res, 404, { error: 'Capture not found' });
    }

    if (req.method === 'GET' && url.pathname === '/api/analysis/weak-points') {
      return json(res, 200, analyzeWeakPoints(user.id));
    }

    if (req.method === 'GET' && url.pathname === '/api/listening-questions') {
      return json(res, 200, { questions: listListeningQuestions(user.id) });
    }

    if (req.method === 'POST' && url.pathname === '/api/listening-questions') {
      const question = createListeningQuestion(user.id, await readJson(req, 36 * 1024 * 1024));
      return json(res, 201, { question });
    }

    const listeningAudioMatch = /^\/api\/listening-questions\/([^/]+)\/audio$/.exec(url.pathname);
    if (req.method === 'GET' && listeningAudioMatch) {
      const audio = listeningAudioForUser(user.id, listeningAudioMatch[1]);
      if (!audio) {
        return json(res, 404, { error: 'Listening audio not found' });
      }
      res.writeHead(200, {
        'content-type': audio.audio_mime,
        'content-length': audio.audio_size,
        'cache-control': 'private, no-store',
        'content-disposition': 'inline',
      });
      return createReadStream(audio.audio_path).pipe(res);
    }

    const listeningRecordingsMatch = /^\/api\/listening-questions\/([^/]+)\/recordings$/.exec(url.pathname);
    if (req.method === 'GET' && listeningRecordingsMatch) {
      return json(res, 200, { recordings: listListeningRecordings(user.id, listeningRecordingsMatch[1]) });
    }
    if (req.method === 'POST' && listeningRecordingsMatch) {
      const recording = createListeningRecording(user.id, listeningRecordingsMatch[1], await readJson(req, 36 * 1024 * 1024));
      return json(res, 201, {
        recording,
        agentMessage: `请通过 jlpt_review MCP 调用 get_listening_recording_analysis_context 分析录音 ${recording.id}，再用 save_listening_recording_analysis 写回结果。`,
      });
    }

    const listeningRecordingAudioMatch = /^\/api\/listening-recordings\/([^/]+)\/audio$/.exec(url.pathname);
    if (req.method === 'GET' && listeningRecordingAudioMatch) {
      const audio = listeningRecordingAudioForUser(user.id, listeningRecordingAudioMatch[1]);
      if (!audio) {
        return json(res, 404, { error: 'Listening recording audio not found' });
      }
      res.writeHead(200, {
        'content-type': audio.audio_mime,
        'content-length': audio.audio_size,
        'cache-control': 'private, no-store',
        'content-disposition': 'inline',
      });
      return createReadStream(audio.audio_path).pipe(res);
    }

    const listeningQuestionMatch = /^\/api\/listening-questions\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'DELETE' && listeningQuestionMatch) {
      if (!deleteListeningQuestion(user.id, listeningQuestionMatch[1])) {
        return json(res, 404, { error: 'Listening question not found' });
      }
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/reading-questions') {
      return json(res, 200, { questions: listReadingQuestions(user.id) });
    }

    if (req.method === 'POST' && url.pathname === '/api/reading-questions') {
      const question = createReadingQuestion(user.id, await readJson(req));
      return json(res, 201, { question });
    }

    const readingQuestionMatch = /^\/api\/reading-questions\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'DELETE' && readingQuestionMatch) {
      if (!deleteReadingQuestion(user.id, readingQuestionMatch[1])) {
        return json(res, 404, { error: 'Reading question not found' });
      }
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/drafts') {
      return json(res, 200, { drafts: listReviewPackDrafts(user.id) });
    }

    if (req.method === 'GET' && url.pathname === '/api/history-questions') {
      return json(res, 200, { questions: getHistoryQuestions(user.id) });
    }

    if (req.method === 'GET' && url.pathname === '/api/daily-practices') {
      return json(res, 200, { practices: listDailyPractices(user.id) });
    }

    if (req.method === 'POST' && url.pathname === '/api/daily-practices') {
      const practice = createDailyPractice(user.id, await readJson(req));
      return json(res, 201, { practice });
    }

    const draftPublishMatch = /^\/api\/drafts\/([^/]+)\/publish-daily-practice$/.exec(url.pathname);
    if (req.method === 'POST' && draftPublishMatch) {
      const practice = createDailyPracticeFromDraft(user.id, draftPublishMatch[1], await readJson(req));
      return json(res, 201, { practice });
    }

    const dailyPracticeMatch = /^\/api\/daily-practices\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && dailyPracticeMatch) {
      const practice = getDailyPractice(user.id, dailyPracticeMatch[1]);
      if (!practice) {
        return json(res, 404, { error: 'Daily practice not found' });
      }
      return json(res, 200, { practice });
    }

    if (req.method === 'POST' && url.pathname === '/api/drafts') {
      const body = await readJson(req);
      const draft = body.kind === 'daily_review_pack'
        ? createDailyReviewPackDraft(user.id, body)
        : createReviewPackDraft(user.id, body);
      return json(res, 201, { draft });
    }

    const draftAnnotationMatch = /^\/api\/drafts\/([^/]+)\/annotations$/.exec(url.pathname);
    if (req.method === 'POST' && draftAnnotationMatch) {
      const draft = addDraftAnnotation(user.id, draftAnnotationMatch[1], await readJson(req));
      if (!draft) {
        return json(res, 404, { error: 'Draft not found' });
      }
      return json(res, 200, { draft });
    }

    const draftRevisionMatch = /^\/api\/drafts\/([^/]+)\/revision-context$/.exec(url.pathname);
    if (req.method === 'GET' && draftRevisionMatch) {
      const context = buildDraftRevisionContext(user.id, draftRevisionMatch[1]);
      if (!context) {
        return json(res, 404, { error: 'Draft not found' });
      }
      return json(res, 200, context);
    }

    const draftProcessingMatch = /^\/api\/drafts\/([^/]+)\/processing-context$/.exec(url.pathname);
    if (req.method === 'GET' && draftProcessingMatch) {
      const context = buildDraftProcessingContext(user.id, draftProcessingMatch[1]);
      if (!context) {
        return json(res, 404, { error: 'Draft not found' });
      }
      return json(res, 200, context);
    }

    const draftConfirmMatch = /^\/api\/drafts\/([^/]+)\/confirm$/.exec(url.pathname);
    if (req.method === 'POST' && draftConfirmMatch) {
      const context = confirmDraftForAgentProcessing(user.id, draftConfirmMatch[1], await readJson(req));
      if (!context) {
        return json(res, 404, { error: 'Draft not found' });
      }
      return json(res, 200, context);
    }

    const draftMatch = /^\/api\/drafts\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && draftMatch) {
      const draft = getReviewPackDraft(user.id, draftMatch[1]);
      if (!draft) {
        return json(res, 404, { error: 'Draft not found' });
      }
      return json(res, 200, { draft });
    }

    if (req.method === 'PATCH' && draftMatch) {
      const draft = updateReviewPackDraft(user.id, draftMatch[1], await readJson(req));
      if (!draft) {
        return json(res, 404, { error: 'Draft not found' });
      }
      return json(res, 200, { draft });
    }

    if (req.method === 'DELETE' && draftMatch) {
      if (!deleteReviewPackDraft(user.id, draftMatch[1])) {
        return json(res, 404, { error: 'Draft not found' });
      }
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    const status = Number(error.statusCode) || (/UNIQUE constraint failed/.test(error.message) ? 409 : 400);
    return json(res, status, { error: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`JLPT local backend listening on http://localhost:${port}`);
  console.log(`SQLite: ${databasePath()}`);
});

function buildHealthPayload() {
  const projectConfigPath = join(rootDir, '.codex', 'config.toml');
  const userConfigPath = join(homedir(), '.codex', 'config.toml');
  const mcpServerPath = join(rootDir, 'server', 'mcp-server.mjs');
  const mcpStatusPath = join(rootDir, '.local', 'mcp-status.json');
  const projectConfig = readJsonFile(projectConfigPath);
  const userConfig = readJsonFile(userConfigPath);
  const mcpStatus = readJsonFile(mcpStatusPath);
  const mcpServerReady = existsSync(mcpServerPath);
  const mcpHttpPath = `${mcp.paths.mcp}`;
  const projectConfigReady = configIncludesJlptMcp(projectConfig, rootDir);
  const userConfigReady = configIncludesJlptMcp(userConfig, rootDir);
  const codexConfigReady = projectConfigReady || userConfigReady;

  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    databaseReady: existsSync(databasePath()),
    reviewDataReady: existsSync(reviewDataPath()),
    mcp: {
      httpPath: mcpHttpPath,
      serverReady: mcpServerReady,
      codexConfigReady,
      projectConfigReady,
      userConfigReady,
      configScope: projectConfigReady ? 'project' : userConfigReady ? 'user' : 'none',
      commandReady: mcpServerReady && codexConfigReady,
      lastSeenAt: typeof mcpStatus?.lastSeenAt === 'string' ? mcpStatus.lastSeenAt : null,
      lastMethod: typeof mcpStatus?.lastMethod === 'string' ? mcpStatus.lastMethod : null,
      lastTool: typeof mcpStatus?.lastTool === 'string' ? mcpStatus.lastTool : null,
      lastClient: typeof mcpStatus?.lastClient === 'string' ? mcpStatus.lastClient : null,
    },
  };
}

function readJsonFile(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }
  const raw = readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.json')) {
    return JSON.parse(raw);
  }
  return raw;
}

function configIncludesJlptMcp(config, expectedCwd) {
  if (typeof config !== 'string') {
    return false;
  }
  const match = /\[mcp_servers\.jlpt_review\]([\s\S]*?)(?:\n\[|$)/.exec(config);
  if (!match) {
    return false;
  }
  const section = match[1];
  const cwdMatch = /cwd\s*=\s*"([^"]+)"/.exec(section);
  return /command\s*=\s*"node"/.test(section)
    && /server\/mcp-server\.mjs/.test(section)
    && (!cwdMatch || resolve(cwdMatch[1]) === expectedCwd);
}

function bearerToken(req) {
  const header = req.headers.authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? '';
}

async function readJson(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      const error = new Error('Request body is too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function readLocalOfficialSamples(module) {
  const samplesPath = join(localOfficialRoot, 'sample2018', 'n1', 'official-samples.json');
  if (!existsSync(samplesPath)) {
    return { samples: [] };
  }
  const payload = JSON.parse(readFileSync(samplesPath, 'utf8'));
  const samples = Array.isArray(payload.samples) ? payload.samples : [];
  return {
    samples: module ? samples.filter((sample) => sample.module === module) : samples,
  };
}

function streamLocalOfficialFile(res, relativePath) {
  return streamLocalFile(res, localOfficialRoot, relativePath, 'Local official file not found');
}

function readLocalMockExam(res, examId) {
  const decodedId = decodeURIComponent(examId);
  const examPath = resolve(localMockRoot, decodedId, 'exam.json');
  if (!examPath.startsWith(`${localMockRoot}/`) || !existsSync(examPath)) {
    return json(res, 404, { error: 'Local mock exam not found' });
  }
  return json(res, 200, JSON.parse(readFileSync(examPath, 'utf8')));
}

function readLocalMockExamManifest(res) {
  const manifestPath = join(localMockRoot, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return json(res, 200, { exams: [] });
  }
  return json(res, 200, JSON.parse(readFileSync(manifestPath, 'utf8')));
}

function readLocalNewsCycles() {
  const weeklyRoot = join(localNewsRoot, 'weekly');
  if (!existsSync(weeklyRoot)) return [];
  const reviewItems = loadReviewData().items ?? [];
  return readdirSync(weeklyRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}-W\d{2}$/.test(entry.name))
    .flatMap((entry) => {
      const summaryPath = join(weeklyRoot, entry.name, 'cycle-summary.json');
      if (!existsSync(summaryPath)) return [];
      const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
      const formalPracticeQuestionIds = formalNewsPracticeQuestionIds(reviewItems, summary.range);
      const totalQuestions = Number(summary.total_questions ?? 0);
      return [{
        id: entry.name,
        range: summary.range,
        generatedAt: summary.generated_at,
        totalQuestions,
        moduleCounts: {
          vocabulary: Number(summary.modules?.vocabulary ?? 0),
          grammar: Number(summary.modules?.grammar ?? 0),
          listening: Number(summary.modules?.listening ?? 0),
          reading: Number(summary.modules?.reading ?? 0),
        },
        audioCount: Number(summary.direct_audio_question_count ?? 0),
        needsAudioReviewCount: Number(summary.needs_audio_review_count ?? 0),
        formalQuestionCount: formalPracticeQuestionIds.length,
        formalPracticeQuestionIds,
        status: formalPracticeQuestionIds.length >= totalQuestions && totalQuestions > 0
          ? 'published'
          : formalPracticeQuestionIds.length > 0
            ? 'partially_published'
            : String(summary.status ?? 'draft'),
      }];
    })
    .sort((left, right) => right.id.localeCompare(left.id));
}

function formalNewsPracticeQuestionIds(items, range) {
  if (!range?.from || !range?.to) return [];
  return items
    .flatMap((item) => Array.isArray(item.practice_questions) ? item.practice_questions : [])
    .map((question) => String(question?.id ?? ''))
    .filter((id) => {
      const match = /^news-(\d{4}-\d{2}-\d{2})-.+-formal$/.exec(id);
      return match && match[1] >= range.from && match[1] <= range.to;
    });
}

function readLocalNewsCycle(requestedId) {
  if (!existsSync(localNewsRoot)) return { days: [] };
  const cycles = readLocalNewsCycles();
  const cycleId = requestedId || cycles[0]?.id;
  if (!cycleId || !/^\d{4}-W\d{2}$/.test(cycleId) || !cycles.some((cycle) => cycle.id === cycleId)) {
    return { days: [] };
  }
  let summary;
  const weeklyRoot = join(localNewsRoot, 'weekly');
  const summaryPath = join(weeklyRoot, cycleId, 'cycle-summary.json');
  if (existsSync(summaryPath)) summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const dates = readdirSync(localNewsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .filter((date) => !summary?.range || (date >= summary.range.from && date <= summary.range.to))
    .sort();
  const days = dates.flatMap((date) => {
    const questionsPath = join(localNewsRoot, date, 'questions.json');
    if (!existsSync(questionsPath)) return [];
    const payload = JSON.parse(readFileSync(questionsPath, 'utf8'));
    const questions = (Array.isArray(payload.questions) ? payload.questions : []).map((question) => ({
      ...question,
      audio: question.audio?.fileName
        ? { ...question.audio, previewUrl: `/api/local-news-audio/${date}/${encodeURIComponent(question.audio.fileName)}` }
        : question.audio,
    }));
    const moduleCounts = { vocabulary: 0, grammar: 0, listening: 0, reading: 0 };
    for (const question of questions) {
      if (question.module in moduleCounts) moduleCounts[question.module] += 1;
    }
    return [{
      date,
      questionCount: questions.length,
      audioCount: questions.filter((question) => question.audio?.previewUrl).length,
      sourceCount: new Set(questions.map((question) => question.source_id)).size,
      moduleCounts,
      questions,
    }];
  });
  return { id: cycleId, summary, days };
}

function streamLocalFile(res, root, relativePath, notFoundMessage) {
  const decoded = decodeURIComponent(relativePath);
  const filePath = resolve(root, decoded);
  if (!filePath.startsWith(`${root}/`) || !existsSync(filePath)) {
    return json(res, 404, { error: notFoundMessage });
  }
  const stat = statSync(filePath);
  if (!stat.isFile()) {
    return json(res, 404, { error: notFoundMessage });
  }
  res.writeHead(200, {
    'content-type': contentTypeFor(filePath),
    'content-length': stat.size,
    'cache-control': 'private, no-store',
    'content-disposition': 'inline',
  });
  return createReadStream(filePath).pipe(res);
}

function contentTypeFor(filePath) {
  return ({
    '.pdf': 'application/pdf',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
  })[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function isLoopbackRequest(req) {
  const rawHost = String(req.headers.host ?? '');
  const host = rawHost.startsWith('[')
    ? rawHost.slice(1, rawHost.indexOf(']'))
    : rawHost.split(':')[0];
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}
