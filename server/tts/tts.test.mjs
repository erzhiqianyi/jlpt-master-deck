import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'jlpt-tts-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
process.env.JLPT_TTS_SECRETS_KEY = 'test-secret-key';
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);

const { encryptSecret, decryptSecret } = await import('./crypto.mjs');
const storage = await import('../storage.mjs');
const { createApiHandler } = await import('../api-handler.mjs');
after(() => { storage.getDb().close(); rmSync(dir, { recursive: true, force: true }); });

test('encryptSecret/decryptSecret round-trips and rejects the wrong key', () => {
  const payload = encryptSecret('sk-example-key', 'correct-secret');
  assert.equal(decryptSecret(payload, 'correct-secret'), 'sk-example-key');
  assert.throws(() => decryptSecret(payload, 'wrong-secret'));
});

async function call(method, path, { token, body } = {}) {
  let status, responseBody, headers;
  await createApiHandler({})(
    {
      method, url: path,
      headers: { host: 'localhost', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)); },
    },
    {
      writeHead(code, values) { status = code; headers = values; },
      end(value) { status ??= 200; responseBody = value; },
    },
  );
  return { status, body: responseBody, headers };
}

test('TTS credentials are never echoed back, and unknown providers are rejected', async () => {
  const user = storage.createUser('tts-user', 'password-one');
  const { token } = storage.loginUser('tts-user', 'password-one');

  const providers = await call('GET', '/api/tts/providers', { token });
  assert.deepEqual(JSON.parse(providers.body).providers.map((p) => p.id), ['openai', 'google-cloud', 'azure']);

  const before = await call('GET', '/api/tts/credentials', { token });
  assert.deepEqual(JSON.parse(before.body).credentials.find((c) => c.provider === 'openai'), { provider: 'openai', configured: false, updatedAt: null });

  const saved = await call('PUT', '/api/tts/credentials/openai', { token, body: { apiKey: 'sk-secret-value' } });
  assert.equal(saved.status, 200);
  assert.ok(!JSON.stringify(saved.body).includes('sk-secret-value'), 'API key must not be echoed back');
  assert.equal(JSON.parse(saved.body).credentials.find((c) => c.provider === 'openai').configured, true);

  const rejected = await call('PUT', '/api/tts/credentials/not-a-provider', { token, body: { apiKey: 'x' } });
  assert.equal(rejected.status, 400);

  const deleted = await call('DELETE', '/api/tts/credentials/openai', { token });
  assert.equal(JSON.parse(deleted.body).credentials.find((c) => c.provider === 'openai').configured, false);
});

test('POST /api/tts/speak uses the caller\'s stored key and refuses to speak without one', async (t) => {
  const user = storage.createUser('tts-speaker', 'password-one');
  const { token } = storage.loginUser('tts-speaker', 'password-one');

  const noKey = await call('POST', '/api/tts/speak', { token, body: { text: 'こんにちは', provider: 'openai' } });
  assert.equal(noKey.status, 400);

  await call('PUT', '/api/tts/credentials/openai', { token, body: { apiKey: 'sk-secret-value' } });
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.match(String(url), /api\.openai\.com\/v1\/audio\/speech/);
    assert.equal(JSON.parse(init.body).input, 'こんにちは');
    assert.equal(init.headers.authorization, 'Bearer sk-secret-value');
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  });
  const spoken = await call('POST', '/api/tts/speak', { token, body: { text: 'こんにちは', provider: 'openai' } });
  t.mock.restoreAll();
  assert.equal(spoken.status, 200);
  assert.equal(spoken.headers['content-type'], 'audio/mpeg');
  assert.deepEqual([...spoken.body], [1, 2, 3]);

  const other = storage.createUser('tts-other', 'password-one');
  const otherSession = storage.loginUser('tts-other', 'password-one');
  const forbidden = await call('POST', '/api/tts/speak', { token: otherSession.token, body: { text: 'こんにちは', provider: 'openai' } });
  assert.equal(forbidden.status, 400, 'a different user must not see this user\'s stored key');
});
