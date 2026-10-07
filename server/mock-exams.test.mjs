import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { z } from 'zod';
const dir = mkdtempSync(join(tmpdir(), 'jlpt-exams-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const store = await import('./storage.mjs');
const { tools, toolJsonSchema } = await import('./mcp-tools.mjs');
const { availableTools } = await import('./mcp-app.mjs');
const { withPlatform } = await import('./platform.mjs');
const { createApiHandler } = await import('./api-handler.mjs');
const alice = store.createUser('exam-owner', 'password-one');
const bob = store.createUser('exam-other', 'password-two');
const token = store.loginUser('exam-owner', 'password-one').token;
const handler = createApiHandler({});
const call = async (name, args = {}, owner = alice) => {
  const tool = tools.find(t => t.name === name);
  const response = await tool.handler(z.object(tool.inputSchema).parse(args), { ownerId: String(owner.id) });
  return response.structuredContent ?? JSON.parse(response.content[0].text);
};
const api = async (path, method = 'GET', body, auth = token) => {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  Object.assign(req, { url: path, method, headers: { host: 'localhost', ...(auth ? { authorization: `Bearer ${auth}` } : {}) } });
  let status, result;
  await handler(req, { writeHead(code) { status = code; }, end(value) { result = JSON.parse(value); } });
  return { status, result };
};
const input = { title: '自由な構成', sessions: [{ id: 'part-a', title: '短い問題', questions: [{ id: 'q1', prompt: '選んでください。', choices: ['甲', '乙'], answerIndex: 1, explanation: '乙が正解です。' }] }] };
after(() => { store.getDb().close(); rmSync(dir, { recursive: true, force: true }); });
test('MCP and REST share owned exams, permit arbitrary sessions, guard edits and reject invalid answers', async () => {
  const created = await call('create_mock_exam', input);
  assert.equal(created.sessions.length, 1);
  assert.equal(created.sessions[0].durationMinutes, undefined);
  assert.equal((await api(`/api/mock-exams/${created.id}`)).result.exam.id, created.id);
  assert.equal((await call('list_mock_exams', {}, bob)).exams.length, 0);
  await assert.rejects(call('get_mock_exam', { id: created.id }, bob), /not found/);
  await assert.rejects(call('update_mock_exam', { id: created.id, expectedRevision: 1, title: 'stolen' }, bob), /not found/);
  const updated = await api(`/api/mock-exams/${created.id}`, 'PATCH', { expectedRevision: 1, title: '更新' });
  assert.equal(updated.status, 200, JSON.stringify(updated.result));
  assert.equal(updated.result.exam.revision, 2);
  assert.deepEqual(updated.result.exam.sessions, created.sessions);
  assert.match(created.sessions[0].questions[0].canonicalQuestionId, /^bank-/);
  assert.equal(created.sessions[0].questions[0].questionRevision, 1);
  assert.equal((await api(`/api/mock-exams/${created.id}`, 'PATCH', { expectedRevision: 1, title: 'stale' })).status, 409);
  const invalid = structuredClone(input); invalid.sessions[0].questions[0].answerIndex = 9;
  assert.equal((await api('/api/mock-exams', 'POST', invalid)).status, 400);
  await assert.rejects(call('update_mock_exam', { id: created.id, expectedRevision: 2, sessions: [input.sessions[0], input.sessions[0]] }), /unique/);
  assert.equal((await call('get_mock_exam', { id: created.id })).revision, 2);
  assert.equal((await api('/api/mock-exams', 'GET', undefined, '')).status, 401);
});
test('new tools are hosted-capable and writing requires library:write', () => {
  withPlatform({ dataSource: 'durable-object' }, () => {
    for (const name of ['list_mock_exams', 'get_mock_exam', 'create_mock_exam', 'update_mock_exam']) {
      const tool = availableTools().find(t => t.name === name);
      assert.ok(tool, name); assert.equal(toolJsonSchema(tool).type, 'object');
    }
  });
  for (const name of ['create_mock_exam', 'update_mock_exam']) {
    const tool = tools.find(t => t.name === name);
    assert.equal(tool.scope, 'library:write');
  }
});

test('exam questions preserve authored Japanese tokens and reject changed originals', async () => {
  const annotated = structuredClone(input);
  const annotations = [{ text: '選んでください。', tokens: [{ surface: '選んで', reading: 'えらんで', pos: 'verb' }, { surface: 'ください' }, { surface: '。' }] }];
  annotated.sessions[0].questions[0].japaneseAnnotations = annotations;
  const created = await call('create_mock_exam', annotated);
  assert.deepEqual(created.sessions[0].questions[0].japaneseAnnotations, annotations);
  assert.deepEqual((await api(`/api/mock-exams/${created.id}`)).result.exam.sessions[0].questions[0].japaneseAnnotations, annotations);
  annotated.sessions[0].questions[0].japaneseAnnotations[0].text = '別の文';
  await assert.rejects(call('create_mock_exam', annotated));
});
