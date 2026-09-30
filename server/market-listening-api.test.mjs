import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('listening share copies the audio group, imports it for another user, and survives withdrawal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jlpt-listening-share-'));
  mkdirSync(join(dir, 'data'));
  const server = spawn(process.execPath, ['server/api.mjs'], {
    env: { ...process.env, JLPT_API_PORT: '18793', JLPT_DB_PATH: join(dir, 'db.sqlite'), JLPT_REVIEW_DATA_PATH: join(dir, 'data'), JLPT_FIREBASE_CONFIG: '', JLPT_FIREBASE_CONFIG_PATH: join(dir, 'no-firebase.json') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = 'http://127.0.0.1:18793';
  const call = async (path, { token, method = 'GET', body } = {}) => {
    const response = await fetch(base + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server did not start')), 10000);
      server.stdout.once('data', () => { clearTimeout(timer); resolve(); });
      server.once('error', reject);
    });
    const author = (await call('/api/auth/register', { method: 'POST', body: { username: 'listening-author', password: 'local-test-pass' } })).body;
    const reader = (await call('/api/auth/register', { method: 'POST', body: { username: 'listening-reader', password: 'local-test-pass' } })).body;
    const audio = Buffer.from('small test audio');
    const input = { title: '听力测试', questionTypeId: 'listening-basic-training', question: '何ですか', choices: ['一', '二'], choiceDetails: [{ translation: '一', explanation: '' }, { translation: '二', explanation: '' }], answerIndex: 1, explanation: '理由', audioMime: 'audio/mpeg', audioFileName: 'sample.mp3', audioBase64: audio.toString('base64'), transcript: 'これはテストです。', transcriptTranslation: '这是测试。' };
    const first = (await call('/api/listening-questions', { token: author.token, method: 'POST', body: input })).body.question;
    const second = (await call('/api/listening-questions', { token: author.token, method: 'POST', body: { ...input, title: '第二题', question: '誰ですか' } })).body.question;
    assert.equal(first.audioAssetId, second.audioAssetId);
    const published = await call('/api/market/listening', { token: author.token, method: 'POST', body: { sourceId: first.id } });
    assert.equal(published.status, 201);
    const shareId = published.body.id;
    assert.equal(published.body.package.questions.length, 2);
    assert.equal(published.body.package.transcript, input.transcript);
    assert.equal(published.body.package.audioBase64, undefined);
    assert.equal((await fetch(`${base}/api/market/${shareId}/audio`)).status, 401);
    const sharedAudio = await fetch(`${base}/api/market/${shareId}/audio`, { headers: { authorization: `Bearer ${reader.token}` } });
    assert.equal(sharedAudio.status, 200);
    assert.deepEqual(Buffer.from(await sharedAudio.arrayBuffer()), audio);
    const imported = await call('/api/market/import', { token: reader.token, method: 'POST', body: { shareId, package: { title: 'tampered' } } });
    assert.equal(imported.status, 201);
    assert.equal(imported.body.count, 2);
    assert.equal((await call('/api/market/import', { token: reader.token, method: 'POST', body: { shareId } })).body.alreadyImported, true);
    const readerQuestions = (await call('/api/listening-questions', { token: reader.token })).body.questions;
    assert.equal(readerQuestions.length, 2);
    assert.equal(readerQuestions[0].transcript, input.transcript);
    assert.equal((await call(`/api/market/${shareId}`, { token: reader.token, method: 'DELETE' })).status, 404);
    assert.equal((await call(`/api/market/${shareId}`, { token: author.token, method: 'DELETE' })).status, 200);
    assert.equal((await fetch(`${base}/api/market/${shareId}/audio`, { headers: { authorization: `Bearer ${reader.token}` } })).status, 404);
    const ownAudio = await fetch(`${base}/api/listening-questions/${readerQuestions[0].id}/audio`, { headers: { authorization: `Bearer ${reader.token}` } });
    assert.equal(ownAudio.status, 200);
    assert.deepEqual(Buffer.from(await ownAudio.arrayBuffer()), audio);
    for (const item of [...readerQuestions, first, second]) await call(`/api/listening-questions/${item.id}`, { token: readerQuestions.some((q) => q.id === item.id) ? reader.token : author.token, method: 'DELETE' });
  } finally {
    server.kill('SIGTERM');
  }
});
