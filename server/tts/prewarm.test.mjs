import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const dir = mkdtempSync(join(tmpdir(), 'jlpt-prewarm-'));
process.env.JLPT_DB_PATH = join(dir, 'db.sqlite');
process.env.JLPT_TTS_SECRETS_KEY = 'test-only-key';
const accounts = await import('../accounts.mjs');
const { withPlatform } = await import('../platform.mjs');
const { createApiHandler } = await import('../api-handler.mjs');
const { updateSettings } = await import('../v3/repo/settings.mjs');
const { createWordbook } = await import('../v3/repo/wordbooks.mjs');
const { saveTtsCredential, synthesizeSpeech } = await import('./index.mjs');
after(() => { accounts.getDb().close(); rmSync(dir, { recursive: true, force: true }); });

async function request(token, method, url, body) {
  const platform = { afterCommit: [], ttsSecretKey: 'test-only-key' };
  let status;
  let text = '';
  await withPlatform(platform, () => createApiHandler({})(
    { method, url, headers: { host: 'localhost', authorization: `Bearer ${token}` }, async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(JSON.stringify(body)); } },
    { writeHead(code) { status = code; }, end(value) { text = String(value ?? ''); } },
  ));
  return { status, body: text ? JSON.parse(text) : null, jobs: platform.afterCommit, run: () => withPlatform(platform, async () => { for (const job of platform.afterCommit) await job(); }) };
}

function signUp(name) {
  const user = accounts.createUser(name, 'test-password');
  const { token } = accounts.loginUser(name, 'test-password');
  const book = createWordbook(accounts.getDb(), user.id, { title: '单词' }).code;
  const create = (input) => request(token, 'POST', '/api/v3/knowledge', { wordbook: book, ...input });
  return { user, token, create };
}
const grammar = (expression = '〜ざるを得ない') => ({ kind: 'grammar', expression, meaning: '不得不' });

test('new words and grammar generate the selected pronunciation after commit and playback reuses its cache', async (t) => {
  const { user, token, create } = signUp('configured');
  saveTtsCredential(user.id, 'openai', { apiKey: 'test-key' });
  updateSettings(accounts.getDb(), user.id, { speech: { provider: 'openai', voices: { openai: { voice: 'nova' } } } });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_, init) => { calls.push(JSON.parse(init.body)); return new Response(new Uint8Array([1, 2, 3])); });
  const word = await create({ kind: 'word', expression: '青春', reading: 'せいしゅん', pos: 'noun', meaning: '青春' });
  const expression = await create(grammar());
  assert.equal(word.status, 201);
  assert.equal(calls.length, 0);
  assert.equal(word.jobs.length, 1); assert.equal(expression.jobs.length, 1);
  await word.run(); await expression.run();
  assert.deepEqual(calls.map((value) => [value.input, value.voice]), [['せいしゅん', 'nova'], ['〜ざるを得ない', 'nova']]);
  await synthesizeSpeech(user.id, { provider: 'openai', text: 'せいしゅん', voice: 'nova' });
  assert.equal(calls.length, 2);
  const edited = await request(token, 'PATCH', `/api/v3/knowledge/${expression.body.item.code}`, { meaning: '只好' });
  assert.equal(edited.status, 200);
  assert.equal(edited.jobs.length, 0, 'editing does not regenerate');
});

test('unconfigured or browser speech never makes a cloud request', async (t) => {
  const { user, create } = signUp('no-provider');
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('must not request speech'); });
  await (await create(grammar('〜に限る'))).run();
  updateSettings(accounts.getDb(), user.id, { speech: { provider: 'azure' } });
  await (await create(grammar('〜までもない'))).run();
});

test('failed pronunciation leaves the saved item intact; invalid saves schedule nothing', async (t) => {
  const { user, token, create } = signUp('failed-provider');
  saveTtsCredential(user.id, 'openai', { apiKey: 'test-key' });
  updateSettings(accounts.getDb(), user.id, { speech: { provider: 'openai' } });
  t.mock.method(globalThis, 'fetch', async () => new Response('unavailable', { status: 503 }));
  t.mock.method(console, 'warn', () => {});
  const item = await create(grammar());
  await item.run();
  assert.equal((await request(token, 'GET', `/api/v3/knowledge/${item.body.item.code}`)).body.item.expression, '〜ざるを得ない');
  const invalid = await create({ kind: 'word', expression: 'x', pos: '名詞' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.jobs.length, 0);
});
