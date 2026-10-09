// HTTP API（ローカル Node）：ヘルスチェック、ローカル資料、ログイン、接続中のエージェント、読み上げ、MCP、v3 の学習データ。
import { handleV3 } from './v3/api.mjs';
import { readLocalOfficialSamples, readLocalMockExam, readLocalMockExamManifest } from './local-study-data.mjs';
import { authConfiguration, firebaseSession, firebaseIdentity } from './firebase-auth.mjs';
import { createUser, databasePath, deleteSession, loginUser, userForToken } from './accounts.mjs';
import { createReadStream, existsSync, readFileSync, statSync } from './files.mjs';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MCP_PATHS } from './mcp-app.mjs';
import { listProviderDescriptors, ttsCredentialStatus, saveTtsCredential, deleteTtsCredential, synthesizeSpeech, listSpeechVoices } from './tts/index.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localOfficialRoot = join(rootDir, '.local', 'official-jlpt');
const localMockRoot = join(rootDir, '.local', 'mock-exams');
const MEDIA_PATH = /^\/api\/v3\/media\/\d+$/;

export function createApiHandler({ mcp, mcpListener, health = () => buildHealthPayload(mcp) }) {
return async (req, res) => {
  if (MCP_PATHS.test(req.url ?? '')) return mcpListener(req, res);
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const token = bearerToken(req);
    let user = userForToken(token);
    // MCP App（ウィジェット）は OAuth のトークンで音声・画像を読む（audio:read が必要）。
    if (!user && req.method === 'GET' && MEDIA_PATH.test(url.pathname) && mcp) {
      const authRequest = new Request(url, { headers: req.headers });
      if (mcp.carriesToken(authRequest)) {
        let grant;
        try { grant = await mcp.authenticate(authRequest); }
        catch { return json(res, 401, { error: 'Authentication required' }); }
        if (!grant) return json(res, 401, { error: 'Authentication required' });
        if (!grant.scopes.includes('audio:read')) return json(res, 403, { error: 'Audio access not granted' });
        user = { id: Number(grant.ownerId) };
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, health());

    if (req.method === 'GET' && url.pathname === '/api/local-official-samples') {
      if (!isLoopbackRequest(req)) return json(res, 403, { error: 'Local official samples are only available from localhost' });
      return json(res, 200, readLocalOfficialSamples(url.searchParams.get('module')));
    }
    if (req.method === 'GET' && url.pathname === '/api/local-mock-exams') {
      if (!isLoopbackRequest(req)) return json(res, 403, { error: 'Local mock exams are only available from localhost' });
      return json(res, 200, readLocalMockExamManifest());
    }
    const localMockExamMatch = /^\/api\/local-mock-exams\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && localMockExamMatch) {
      if (!isLoopbackRequest(req)) return json(res, 403, { error: 'Local mock exams are only available from localhost' });
      const exam = readLocalMockExam(localMockExamMatch[1]);
      return json(res, exam ? 200 : 404, exam ?? { error: 'Local mock exam not found' });
    }
    const localMockFileMatch = /^\/api\/local-mock-files\/(.+)$/.exec(url.pathname);
    if (req.method === 'GET' && localMockFileMatch) {
      if (!isLoopbackRequest(req)) return json(res, 403, { error: 'Local mock files are only available from localhost' });
      return streamLocalFile(res, localMockRoot, localMockFileMatch[1], 'Local mock file not found');
    }
    const localOfficialMatch = /^\/api\/local-official-jlpt\/(.+)$/.exec(url.pathname);
    if (req.method === 'GET' && localOfficialMatch) {
      if (!isLoopbackRequest(req)) return json(res, 403, { error: 'Local official files are only available from localhost' });
      return streamLocalFile(res, localOfficialRoot, localOfficialMatch[1], 'Local official file not found');
    }

    if (req.method === 'GET' && url.pathname === '/api/auth/config') return json(res, 200, authConfiguration());
    if (req.method === 'POST' && url.pathname === '/api/auth/firebase') {
      try { return json(res, 200, await firebaseSession((await readJson(req)).idToken)); }
      catch { return json(res, 401, { error: 'Firebase 登录验证失败，请重试' }); }
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/firebase/link') {
      if (!user) return json(res, 401, { error: '请先登录原来的本地账号' });
      try { return json(res, 200, await firebaseSession((await readJson(req)).idToken, user)); }
      catch (error) { return json(res, 400, { error: error.message }); }
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
      if (!session) return json(res, 401, { error: 'Invalid username or password' });
      return json(res, 200, session);
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      deleteSession(token);
      return json(res, 200, { ok: true });
    }

    if (!user) return json(res, 401, { error: 'Authentication required' });

    if (await handleV3({ req, res, url, user, json, readJson })) return;

    if (req.method === 'GET' && url.pathname === '/api/auth/firebase/status') return json(res, 200, firebaseIdentity(user.id));
    if (req.method === 'GET' && url.pathname === '/api/me') return json(res, 200, { user });

    // OAuth で接続した AI エージェント（設定画面）：一覧と接続解除。
    if (req.method === 'GET' && url.pathname === '/api/agents') return json(res, 200, { grants: await mcp.listGrants(String(user.id)) });
    const revokeAgentMatch = /^\/api\/agents\/([^/]+)\/revoke$/.exec(url.pathname);
    if (req.method === 'POST' && revokeAgentMatch) {
      await mcp.revokeGrant(String(user.id), decodeURIComponent(revokeAgentMatch[1]));
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/tts/providers') return json(res, 200, { providers: listProviderDescriptors() });
    if (req.method === 'GET' && url.pathname === '/api/tts/voices') return json(res, 200, { voices: await listSpeechVoices(user.id, url.searchParams.get('provider')) });
    if (req.method === 'GET' && url.pathname === '/api/tts/credentials') return json(res, 200, { credentials: ttsCredentialStatus(user.id) });
    const ttsCredentialMatch = /^\/api\/tts\/credentials\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'PUT' && ttsCredentialMatch) {
      return json(res, 200, { credentials: saveTtsCredential(user.id, decodeURIComponent(ttsCredentialMatch[1]), await readJson(req)) });
    }
    if (req.method === 'DELETE' && ttsCredentialMatch) {
      deleteTtsCredential(user.id, decodeURIComponent(ttsCredentialMatch[1]));
      return json(res, 200, { credentials: ttsCredentialStatus(user.id) });
    }
    if (req.method === 'POST' && url.pathname === '/api/tts/speak') {
      const { text, provider, voice, style, role } = await readJson(req);
      const { audio, mimeType } = await synthesizeSpeech(user.id, { text, provider, voice, style, role });
      res.writeHead(200, { 'content-type': mimeType, 'content-length': audio.length, 'cache-control': 'private, no-store' });
      return res.end(audio);
    }

    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    const status = Number(error.statusCode) || (/UNIQUE constraint failed/.test(error.message) ? 409 : 400);
    return json(res, status, { error: error.message });
  }
};
}

function buildHealthPayload(mcp) {
  const projectConfigPath = join(rootDir, '.codex', 'config.toml');
  const userConfigPath = join(homedir(), '.codex', 'config.toml');
  const mcpServerPath = join(rootDir, 'server', 'mcp-server.mjs');
  const mcpStatusPath = join(rootDir, '.local', 'mcp-status.json');
  const projectConfig = readJsonFile(projectConfigPath);
  const userConfig = readJsonFile(userConfigPath);
  const mcpStatus = readJsonFile(mcpStatusPath);
  const mcpServerReady = existsSync(mcpServerPath);
  const mcpHttpPath = `${mcp?.paths?.mcp ?? '/api/jlpt/mcp'}`;
  const projectConfigReady = configIncludesJlptMcp(projectConfig, rootDir);
  const userConfigReady = configIncludesJlptMcp(userConfig, rootDir);
  const codexConfigReady = projectConfigReady || userConfigReady;

  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    databaseReady: existsSync(databasePath()),
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
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(payload);
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
