import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';

const dir = mkdtempSync(join(tmpdir(), 'jlpt-mcp-app-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
delete process.env.JLPT_PUBLIC_ORIGIN;

const { createUser, loginUser } = await import('./accounts.mjs');
const { PRACTICE_UI_URI, REVIEW_CARDS_UI_URI, AI_HOME_UI_URI, MCP_APP_MIME, practiceViewAvailable } = await import('./mcp-ui.mjs');
const { createJlptMcp, MCP_PATHS } = await import('./mcp-app.mjs');
const { createApiHandler } = await import('./api-handler.mjs');
const { getV3Db, ensureUser: ensureV3User } = await import('./v3/database.mjs');
const { createCapture: createV3Capture } = await import('./v3/repo/inbox.mjs');
const { tools, toolJsonSchema } = await import('./mcp-tools.mjs');

const origin = 'http://127.0.0.1:4221';
const events = [];
const mcp = createJlptMcp({ onEvent: (event) => events.push(event) });
await mcp.ensureSchema();

const jsonRequest = (path, body, headers = {}) => new Request(origin + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});
const rpc = (token, method, params = {}, id = 1) => mcp.fetch(new Request(origin + '/api/jlpt/mcp', {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
}));
async function rpcResult(response) {
  const raw = await response.text();
  const line = raw.split('\n').find((l) => l.startsWith('data:'));
  return JSON.parse(line ? line.slice(5) : raw);
}

test('MCP_PATHS claims only the OAuth/MCP surface', () => {
  for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-authorization-server', '/api/jlpt/mcp', '/api/jlpt/mcp/schema', '/api/jlpt/oauth/token', '/api/jlpt/oauth/client?client_id=x']) {
    assert.ok(MCP_PATHS.test(path), path);
  }
  for (const path of ['/api/health', '/api/jlpt', '/api/jlptx/mcp', '/api/agents', '/oauth/authorize']) {
    assert.ok(!MCP_PATHS.test(path), path);
  }
});

test('every tool converts to JSON Schema and none carries a token parameter', () => {
  assert.equal(new Set(tools.map((tool) => tool.name)).size, tools.length);
  for (const name of ['get_question_group', 'list_question_groups', 'get_practice', 'get_study_overview', 'list_recordings', 'get_market_share', 'get_local_mock_exam']) {
    assert.ok(tools.some((tool) => tool.name === name), name);
  }
  assert.ok(!tools.some((tool) => tool.name === 'login'));
  for (const tool of tools) {
    const schema = toolJsonSchema(tool);
    assert.equal(schema.type, 'object');
    assert.ok(!('token' in (schema.properties ?? {})), tool.name);
  }
  const plan = toolJsonSchema(tools.find((tool) => tool.name === 'save_generated_study_plan'));
  assert.deepEqual(plan.required, ['tasks']);
  assert.equal(plan.properties.tasks.maxItems, 2000);
  assert.deepEqual(plan.properties.tasks.items.properties.module.enum, ['vocabulary', 'grammar', 'reading', 'listening', 'other']);
});

test('discovery, consent, token exchange and a scoped tool call run on node:sqlite', async () => {
  const user = createUser('agent-owner', 'test-password');
  const session = loginUser('agent-owner', 'test-password');
  createV3Capture(getV3Db(), user.id, { body: '面目躍如', category: 'word' });
  const other = createUser('someone-else', 'test-password');
  ensureV3User(getV3Db(), other);
  createV3Capture(getV3Db(), other.id, { body: 'should not leak', category: 'word' });
  // v3 のファイル（get_media は audio:read が必要）
  const { ensureUser } = await import('./v3/database.mjs');
  const { storeMedia } = await import('./v3/repo/media.mjs');
  ensureUser(getV3Db(), user);
  const mediaId = storeMedia(getV3Db(), user.id, { base64: Buffer.from('mcp-audio-bytes').toString('base64'), mime: 'audio/wav' });

  const resource = await mcp.fetch(new Request(origin + '/.well-known/oauth-protected-resource'));
  assert.equal(resource.status, 200);
  const resourceDoc = await resource.json();
  assert.equal(resourceDoc.resource, origin + '/api/jlpt/mcp');

  // Anonymous discovery is off: no token, no tool list.
  assert.equal((await rpc('', 'tools/list')).status, 401);

  const registered = await (await mcp.fetch(jsonRequest('/api/jlpt/oauth/register', {
    client_name: 'Claude Code',
    redirect_uris: ['http://localhost:9999/callback'],
    token_endpoint_auth_method: 'none',
  }))).json();
  assert.ok(registered.client_id);

  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const authorizeParams = {
    client_id: registered.client_id,
    redirect_uri: 'http://localhost:9999/callback',
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'xyz',
    scope: 'study library:write audio:read',
    resource: origin + '/api/jlpt/mcp',
  };
  const authorize = await mcp.fetch(new Request(origin + '/api/jlpt/oauth/authorize?' + new URLSearchParams(authorizeParams), { redirect: 'manual' }));
  assert.equal(authorize.status, 302);
  const consentUrl = new URL(authorize.headers.get('location'));
  assert.equal(consentUrl.origin + consentUrl.pathname, origin + '/oauth/authorize');
  assert.equal(consentUrl.searchParams.get('client_id'), registered.client_id);

  const clientInfo = await (await mcp.fetch(new Request(origin + '/api/jlpt/oauth/client?' + new URLSearchParams({ client_id: registered.client_id, scope: 'study library:write audio:read' })))).json();
  assert.equal(clientInfo.clientName, 'Claude Code');
  assert.deepEqual(clientInfo.scopeDetails.map((s) => [s.name, s.required, s.default]), [['study', true, true], ['audio:read', false, false], ['library:write', false, false]]);

  // Approving without a session must fail; with the browser's session token it succeeds.
  const anonymous = await mcp.fetch(jsonRequest('/api/jlpt/oauth/approve', { ...Object.fromEntries(consentUrl.searchParams), decision: 'approve', scopes: ['study'] }));
  assert.equal(anonymous.status, 401);
  const approved = await (await mcp.fetch(jsonRequest('/api/jlpt/oauth/approve', { ...Object.fromEntries(consentUrl.searchParams), decision: 'approve', scopes: ['study'] }, { authorization: `Bearer ${session.token}` }))).json();
  const callback = new URL(approved.redirect);
  assert.equal(callback.searchParams.get('state'), 'xyz');
  const code = callback.searchParams.get('code');
  assert.ok(code);

  const tokenResponse = await mcp.fetch(new Request(origin + '/api/jlpt/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: registered.client_id, redirect_uri: 'http://localhost:9999/callback', resource: origin + '/api/jlpt/mcp' }),
  }));
  assert.equal(tokenResponse.status, 200, await tokenResponse.clone().text());
  const issued = await tokenResponse.json();
  assert.ok(issued.access_token.startsWith('agt_'));
  assert.equal(issued.scope, 'study');

  const init = await rpcResult(await rpc(issued.access_token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } }));
  assert.equal(init.result.serverInfo.name, 'jlpt');
  const list = await rpcResult(await rpc(issued.access_token, 'tools/list', {}, 2));
  const names = list.result.tools.map((tool) => tool.name);
  assert.ok(names.includes('list_learning_captures'));
  assert.ok(names.includes('list_knowledge_points'));
  assert.ok(names.includes('update_practice_draft'));
  assert.ok(!names.includes('create_knowledge_point'), 'library:write was not granted');
  assert.ok(!names.includes('get_media'), 'audio:read was not granted');
  const deniedAudio = await rpcResult(await rpc(issued.access_token, 'tools/call', { name: 'get_media', arguments: { mediaId } }));
  assert.ok(deniedAudio.error || deniedAudio.result?.isError);
  const protectedTools = tools.filter((tool) => tool.name.startsWith('delete_') || /^(create|update|edit|patch|upsert)_listening_question$/.test(tool.name));
  for (const tool of protectedTools) {
    assert.equal(tool.scope, 'library:write', tool.name);
    assert.ok(!names.includes(tool.name), tool.name);
    const denied = await rpcResult(await rpc(issued.access_token, 'tools/call', {
      name: tool.name, arguments: { id: 'missing', draft_id: 'missing', wordbookId: 'missing' },
    }));
    assert.ok(denied.error || denied.result?.isError, `${tool.name} must reject an ungranted call`);
  }

  assert.ok(!list.result.tools.some((tool) => 'token' in (tool.inputSchema.properties ?? {})));

  const called = await rpcResult(await rpc(issued.access_token, 'tools/call', { name: 'list_learning_captures', arguments: { status: 'inbox' } }, 3));
  const captures = JSON.parse(called.result.content[0].text);
  assert.deepEqual(captures.items.map((capture) => capture.body), ['面目躍如']);
  assert.ok(events.some((event) => event.type === 'tool' && event.tool === 'list_learning_captures' && event.ownerId === String(user.id) && event.ok));

  // MCP App: the practice tools point at the ui:// resource, the resource is listed and readable,
  // and a full session (start → answer → summary) runs through structuredContent.
  const startTool = list.result.tools.find((tool) => tool.name === 'start_practice');
  assert.deepEqual(startTool._meta, { ui: { resourceUri: PRACTICE_UI_URI } });
  const resourcesList = await rpcResult(await rpc(issued.access_token, 'resources/list', {}, 10));
  assert.deepEqual(resourcesList.result.resources.map((entry) => [entry.uri, entry.mimeType]), [[PRACTICE_UI_URI, MCP_APP_MIME], [REVIEW_CARDS_UI_URI, MCP_APP_MIME], [AI_HOME_UI_URI, MCP_APP_MIME]]);
  if (practiceViewAvailable()) {
    const read = await rpcResult(await rpc(issued.access_token, 'resources/read', { uri: PRACTICE_UI_URI }, 11));
    assert.equal(read.result.contents[0].mimeType, MCP_APP_MIME);
    assert.match(read.result.contents[0].text, /<div id="app"><\/div>/);
    const reviewResource = await rpcResult(await rpc(issued.access_token, 'resources/read', { uri: REVIEW_CARDS_UI_URI }));
    assert.match(reviewResource.result.contents[0].text, /get_due_cards/);
    assert.deepEqual(list.result.tools.find((entry) => entry.name === 'get_due_cards')._meta, { ui: { resourceUri: REVIEW_CARDS_UI_URI } });
    const homeResource = await rpcResult(await rpc(issued.access_token, 'resources/read', { uri: AI_HOME_UI_URI }));
    assert.match(homeResource.result.contents[0].text, /get_ai_learning_home/);
    assert.deepEqual(list.result.tools.find((entry) => entry.name === 'get_ai_learning_home')._meta, { ui: { resourceUri: AI_HOME_UI_URI } });
  }

  // v3 の練習：審査を通った問題で練習を始め、答えると結果が返り、カードを評価できる
  const v3 = getV3Db();
  const { createWordbook: createV3Wordbook } = await import('./v3/repo/wordbooks.mjs');
  const { createKnowledge } = await import('./v3/repo/knowledge.mjs');
  const { createQuestionGroup } = await import('./v3/repo/questions.mjs');
  const { submitReview } = await import('./v3/repo/reviews.mjs');
  const book = createV3Wordbook(v3, user.id, { title: 'MCP 词汇' });
  const point = createKnowledge(v3, user.id, { kind: 'word', wordbook: book.code, expression: '面目躍如', reading: 'めんもくやくじょ', pos: 'noun', meaning: '名副其实地大显身手' });
  const group = createQuestionGroup(v3, user.id, { typeId: 'vocabulary-paraphrase', questions: [{ prompt: '決勝で面目躍如の活躍を見せた。', marks: [{ kind: 'target', start: 3, end: 7 }],
    options: ['評判どおりの活躍で面目を保つこと。', '面目を失って恥をかくこと。', '目立たないように振る舞うこと。', '仲間に功績を譲ること。'].map((text, i) => ({ text, correct: i === 0, analysis: i ? '不对' : '对' })),
    explanation: [{ kind: 'basis', body: '面目躍如＝评价相符的活跃。' }], knowledge: [{ code: point.code }] }] });
  submitReview(v3, user.id, group.code, { verdict: 'pass', summary: 'ok' });
  const started = await rpcResult(await rpc(issued.access_token, 'tools/call', { name: 'start_practice', arguments: { filters: { module: 'vocabulary', count: 5 } } }, 12));
  const practice = started.result.structuredContent;
  assert.equal(practice.summary.total, 1);
  assert.equal(practice.items[0].result, null, 'answer key stays hidden until answered');
  const question = practice.items[0].question;
  const wrong = question.options.find((o) => o.text === '面目を失って恥をかくこと。');
  const submitted = await rpcResult(await rpc(issued.access_token, 'tools/call', { name: 'submit_answer', arguments: { attempt: practice.code, question: question.code, selectedOptionId: wrong.id, eventId: 'mcp-app-1' } }));
  const outcome = submitted.result.structuredContent;
  assert.equal(outcome.item.answer.correct, false);
  assert.equal(outcome.item.result.correctText, '評判どおりの活躍で面目を保つこと。');
  const reopened = await rpcResult(await rpc(issued.access_token, 'tools/call', { name: 'get_practice', arguments: { code: practice.code } }, 14));
  assert.equal(reopened.result.structuredContent.summary.answered, 1);
  assert.equal((await rpcResult(await rpc(issued.access_token, 'tools/call', { name: 'get_practice', arguments: { code: 'AT999' } }, 15))).result.isError, true);
  const home = await rpcResult(await rpc(issued.access_token, 'tools/call', { name: 'get_ai_learning_home', arguments: {} }));
  assert.equal(typeof home.result.structuredContent.due.total, 'number');
  createKnowledge(v3, user.id, { kind: 'word', wordbook: book.code, expression: '捉える', reading: 'とらえる', pos: 'verb_2', meaning: '抓住' });
  const due = await rpcResult(await rpc(issued.access_token, 'tools/call', { name: 'get_due_cards', arguments: {} }));
  const cardCode = due.result.structuredContent.cards[0].code;
  const rated = await rpcResult(await rpc(issued.access_token, 'tools/call', { name: 'rate_card', arguments: { code: cardCode, rating: 'easy', eventId: 'mcp-app-card-1' } }));
  assert.equal(rated.result.structuredContent.code, cardCode);
  assert.ok(rated.result.structuredContent.schedule.intervalDays >= 1);

  // get_connection_info reports the grant's user and environment, not the browser session's.
  assert.ok(names.includes('get_connection_info'));
  const info = (await rpcResult(await rpc(issued.access_token, 'tools/call', { name: 'get_connection_info', arguments: {} }, 16))).result.structuredContent;
  assert.deepEqual(info.user, { id: String(user.id), status: 'active', displayName: 'agent-owner' });
  assert.equal(info.connection.clientName, 'Claude Code');
  assert.deepEqual(info.connection.scopes, ['study']);
  assert.equal(info.connection.endpoint, origin + '/api/jlpt/mcp');
  assert.deepEqual(info.server, { name: 'jlpt', version: '0.2.0', environment: 'local', dataSource: 'sqlite' });

  const grants = await mcp.listGrants(String(user.id));
  assert.equal(grants.length, 1);
  assert.equal(grants[0].name, 'Claude Code');
  assert.deepEqual(await mcp.listGrants(String(other.id)), []);
  // A separately approved write grant exposes the tools and still enforces ownership.
  const writeAuthorize = await mcp.fetch(new Request(origin + '/api/jlpt/oauth/authorize?' + new URLSearchParams(authorizeParams), { redirect: 'manual' }));
  const writeConsent = new URL(writeAuthorize.headers.get('location'));
  const writeApproval = await (await mcp.fetch(jsonRequest('/api/jlpt/oauth/approve', {
    ...Object.fromEntries(writeConsent.searchParams), decision: 'approve', scopes: ['study', 'library:write', 'audio:read'],
  }, { authorization: `Bearer ${session.token}` }))).json();
  const writeToken = await (await mcp.fetch(new Request(origin + '/api/jlpt/oauth/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: new URL(writeApproval.redirect).searchParams.get('code'), code_verifier: verifier, client_id: registered.client_id, redirect_uri: authorizeParams.redirect_uri, resource: authorizeParams.resource }),
  }))).json();
  assert.ok(writeToken.access_token);
  const writeList = await rpcResult(await rpc(writeToken.access_token, 'tools/list'));
  assert.ok(writeList.result.tools.some((entry) => entry.name === 'get_media'));
  const audioResult = await rpcResult(await rpc(writeToken.access_token, 'tools/call', { name: 'get_media', arguments: { mediaId } }));
  assert.equal(audioResult.result.content[0].type, 'audio');
  assert.equal(Buffer.from(audioResult.result.content[0].data, 'base64').toString(), 'mcp-audio-bytes');
  const recordingId = storeMedia(getV3Db(), user.id, { base64: Buffer.from('local-recording').toString('base64'), mime: 'audio/wav' });
  const otherMedia = storeMedia(getV3Db(), other.id, { base64: Buffer.from('other-recording').toString('base64'), mime: 'audio/wav' });
  const localAudio = async (path, bearer) => {
    const chunks = [];
    let status;
    const response = new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
    response.writeHead = (code) => { status = code; return response; };
    const finished = new Promise((resolve) => response.once('finish', resolve));
    await createApiHandler({ mcp })({ method: 'GET', url: path, headers: { host: '127.0.0.1:4221', authorization: `Bearer ${bearer}` } }, response);
    await finished;
    return { status, body: Buffer.concat(chunks).toString() };
  };
  const recordingPath = `/api/v3/media/${recordingId}`;
  assert.deepEqual(await localAudio(recordingPath, writeToken.access_token), { status: 200, body: 'local-recording' });
  assert.equal((await localAudio(recordingPath, issued.access_token)).status, 403);
  assert.equal((await localAudio(recordingPath, 'agt_invalid')).status, 401);
  assert.equal((await localAudio(`/api/v3/media/${otherMedia}`, writeToken.access_token)).status, 404);
  assert.deepEqual(await localAudio(recordingPath, session.token), { status: 200, body: 'local-recording' });
  for (const tool of protectedTools) {
    const exposed = writeList.result.tools.find((entry) => entry.name === tool.name);
    assert.ok(exposed, tool.name);
    if (tool.name.startsWith('delete_')) assert.equal(exposed.annotations.destructiveHint, true);
  }
  // v3 の下書き：作成・修正は study の範囲、削除は library:write が必要。他人の下書きは見えない
  const call = async (token, name, args) => rpcResult(await rpc(token, 'tools/call', { name, arguments: args }));
  const created = await call(issued.access_token, 'create_practice_draft', { title: 'delete-owned', objectives: ['区分清浊'] });
  const draftCode = created.result.structuredContent.code;
  const edited = await call(issued.access_token, 'update_practice_draft', { code: draftCode, title: 'edited title' });
  assert.equal(edited.result.structuredContent.title.text, 'edited title');
  ensureV3User(getV3Db(), other);
  const { createDraft } = await import('./v3/repo/drafts.mjs');
  const otherDraft = createDraft(getV3Db(), other.id, { title: 'keep-other' });
  assert.equal((await call(issued.access_token, 'get_practice_draft', { code: 'DR999' })).result.isError, true);
  assert.equal((await call(issued.access_token, 'delete_practice_draft', { code: draftCode })).error != null || (await call(issued.access_token, 'delete_practice_draft', { code: draftCode })).result?.isError, true, 'library:write was not granted');
  assert.deepEqual((await call(writeToken.access_token, 'delete_practice_draft', { code: draftCode })).result.structuredContent, { deleted: draftCode });
  const { getDraft } = await import('./v3/repo/drafts.mjs');
  assert.equal(getDraft(getV3Db(), other.id, otherDraft.code).title.text, 'keep-other');
  await mcp.revokeGrant(String(user.id), grants[0].id);
  assert.equal((await rpc(issued.access_token, 'tools/list', {}, 4)).status, 401);
});

test('origins follow the forwarded scheme and host, or the pinned public origin', async () => {
  const { originsFor } = await import('./mcp-app.mjs');
  assert.deepEqual(originsFor(new Request('http://127.0.0.1:4221/api/jlpt/mcp'), {}), { publicOrigin: 'http://127.0.0.1:4221', webOrigin: 'http://127.0.0.1:4221' });
  const tunnelled = new Request('http://jlpt-local.erzhiqian.cc/api/jlpt/mcp', { headers: { 'x-forwarded-proto': 'https' } });
  assert.equal(originsFor(tunnelled, {}).publicOrigin, 'https://jlpt-local.erzhiqian.cc');
  assert.equal(originsFor(tunnelled, { JLPT_PUBLIC_ORIGIN: 'https://pinned.example' }).webOrigin, 'https://pinned.example');
});
