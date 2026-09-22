import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'jlpt-mcp-app-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
delete process.env.JLPT_PUBLIC_ORIGIN;

const { createUser, loginUser, createLearningCapture, upsertReviewItem, getStudyState } = await import('./storage.mjs');
const { PRACTICE_UI_URI, MCP_APP_MIME, practiceViewAvailable } = await import('./mcp-ui.mjs');
const { createJlptMcp, MCP_PATHS } = await import('./mcp-app.mjs');
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
  for (const name of ['get_reading_question', 'list_reading_questions', 'get_study_state', 'get_history_questions', 'list_listening_recordings', 'get_market_share', 'get_local_news_cycle', 'get_local_mock_exam']) {
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
  assert.equal(plan.properties.tasks.maxItems, 730);
  assert.deepEqual(plan.properties.tasks.items.properties.module.enum, ['grammar', 'reading', 'listening', 'vocabulary', 'other']);
});

test('discovery, consent, token exchange and a scoped tool call run on node:sqlite', async () => {
  const user = createUser('agent-owner', 'test-password');
  const session = loginUser('agent-owner', 'test-password');
  createLearningCapture(user.id, { body: '面目躍如', category: 'word' });
  const other = createUser('someone-else', 'test-password');
  createLearningCapture(other.id, { body: 'should not leak', category: 'word' });

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
    scope: 'study library:write',
    resource: origin + '/api/jlpt/mcp',
  };
  const authorize = await mcp.fetch(new Request(origin + '/api/jlpt/oauth/authorize?' + new URLSearchParams(authorizeParams), { redirect: 'manual' }));
  assert.equal(authorize.status, 302);
  const consentUrl = new URL(authorize.headers.get('location'));
  assert.equal(consentUrl.origin + consentUrl.pathname, origin + '/oauth/authorize');
  assert.equal(consentUrl.searchParams.get('client_id'), registered.client_id);

  const clientInfo = await (await mcp.fetch(new Request(origin + '/api/jlpt/oauth/client?' + new URLSearchParams({ client_id: registered.client_id, scope: 'study library:write' })))).json();
  assert.equal(clientInfo.clientName, 'Claude Code');
  assert.deepEqual(clientInfo.scopeDetails.map((s) => [s.name, s.required, s.default]), [['study', true, true], ['library:write', false, false]]);

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
  assert.ok(names.includes('get_review_data'));
  assert.ok(!names.includes('upsert_review_item'), 'library:write was not granted');
  assert.ok(!list.result.tools.some((tool) => 'token' in (tool.inputSchema.properties ?? {})));

  const called = await rpcResult(await rpc(issued.access_token, 'tools/call', { name: 'list_learning_captures', arguments: { status: 'inbox' } }, 3));
  const captures = JSON.parse(called.result.content[0].text);
  assert.deepEqual(captures.map((capture) => capture.body), ['面目躍如']);
  assert.ok(events.some((event) => event.type === 'tool' && event.tool === 'list_learning_captures' && event.ownerId === String(user.id) && event.ok));

  // MCP App: the practice tools point at the ui:// resource, the resource is listed and readable,
  // and a full session (start → answer → summary) runs through structuredContent.
  const startTool = list.result.tools.find((tool) => tool.name === 'start_topic_practice');
  assert.deepEqual(startTool._meta, { ui: { resourceUri: PRACTICE_UI_URI } });
  const resourcesList = await rpcResult(await rpc(issued.access_token, 'resources/list', {}, 10));
  assert.deepEqual(resourcesList.result.resources.map((entry) => [entry.uri, entry.mimeType]), [[PRACTICE_UI_URI, MCP_APP_MIME]]);
  if (practiceViewAvailable()) {
    const read = await rpcResult(await rpc(issued.access_token, 'resources/read', { uri: PRACTICE_UI_URI }, 11));
    assert.equal(read.result.contents[0].mimeType, MCP_APP_MIME);
    assert.match(read.result.contents[0].text, /<div id="app"><\/div>/);
  }

  upsertReviewItem({
    id: 'item-topic-1', deck: 'n1_vocab', type: 'word', original: '面目躍如', reading: 'めんもくやくじょ', jlpt_level: 'N1',
    meaning_ja: '評価にふさわしい活躍をして、名声が高まるさま。', paraphrase_ja: '評判どおりの活躍で面目を保つこと。', meaning_zh: '名副其实地大显身手。',
    examples: [{ ja: '決勝で面目躍如の活躍を見せた。', zh: '在决赛中大显身手。' }, { ja: '彼の面目躍如たる演技だった。', zh: '这是他名副其实的精彩表演。' }],
    practice_questions: [{ id: 'item-topic-1-meaning', kind: 'meaning', instruction: '意味として最も近いものを選びなさい。', prompt: '決勝で面目躍如の活躍を見せた。', target: '面目躍如', choices: ['評判どおりの活躍で面目を保つこと。', '面目を失って恥をかくこと。', '目立たないように振る舞うこと。', '相手の顔色をうかがうこと。'], answer: '評判どおりの活躍で面目を保つこと。', explanation_zh: '「面目躍如」指名副其实地大显身手。' }],
  }, { userId: user.id });
  const started = await rpcResult(await rpc(issued.access_token, 'tools/call', { name: 'start_topic_practice', arguments: { deck: 'n1_vocab', kinds: ['meaning'], count: 5 } }, 12));
  const practice = started.result.structuredContent;
  assert.equal(practice.progress.total, 1);
  assert.equal(practice.questions[0].answered, false);
  assert.ok(!('answer' in practice.questions[0]), 'answer key stays hidden until answered');
  const submitted = await rpcResult(await rpc(issued.access_token, 'tools/call', { name: 'submit_practice_answer', arguments: { practice_id: practice.id, question_id: practice.questions[0].id, selected: practice.questions[0].choices[1] } }, 13));
  const outcome = submitted.result.structuredContent;
  assert.equal(outcome.question.correct, false);
  assert.equal(outcome.question.answer, '評判どおりの活躍で面目を保つこと。');
  assert.equal(outcome.completed, true);
  assert.equal(outcome.next, null);
  const state = getStudyState(user.id);
  assert.equal(state.progress['item-topic-1'].status, 'learning');
  assert.equal(state.attemptHistory[0].practiceId, practice.id);
  assert.equal(state.attemptHistory[0].summary.wrong, 1);
  const reopened = await rpcResult(await rpc(issued.access_token, 'tools/call', { name: 'get_practice_session', arguments: { practice_id: practice.id } }, 14));
  assert.equal(reopened.result.structuredContent.completed, true);
  assert.equal((await rpcResult(await rpc(other.id ? issued.access_token : '', 'tools/call', { name: 'get_practice_session', arguments: { practice_id: 'nope' } }, 15))).result.isError, true);

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
