import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { buildCloudApi } from '../scripts/build-cloud-api.mjs';

const origin = 'https://jlpt.erzhiqian.cc';
const prompt = '彼は問題の本質を的確に捉えている。';
const group = {
  typeId: 'vocabulary-kanji-reading', level: 'N2',
  instruction: '＿＿＿の言葉の読み方として最もよいものを、１・２・３・４から一つ選びなさい。',
  questions: [{
    prompt, marks: [{ kind: 'target', start: 11, end: 14 }], translation: '他准确地把握了问题的本质。',
    options: [
      { text: 'とらえて', correct: true, analysis: '捉える＝とらえる' },
      { text: 'おさえて', correct: false, distractorType: '语义相近', analysis: '押さえる' },
      { text: 'かかえて', correct: false, distractorType: '形式相近', analysis: '抱える' },
      { text: 'つかまえて', correct: false, distractorType: '语义相近', analysis: '捕まえる' },
    ],
    explanation: [{ kind: 'basis', body: '「捉」は とら(える)。' }],
    knowledge: [{ code: 'W1', relation: 'target' }],
  }],
};
const wav = Buffer.from('RIFF\0\0\0\0WAVEfmt test-audio-bytes').toString('base64');

test('Workers SQLite, v3 REST, R2, OAuth and MCP survive restart; legacy data waits for migration', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jlpt-cloud-test-'));
  const scriptPath = '.local/cloud-api-build/runtime-test.mjs';
  await buildCloudApi('cloudflare/fixtures/runtime.mjs', scriptPath);
  const config = JSON.parse(readFileSync('cloudflare/wrangler.api.json'));
  const options = convertV4MiniflareOptions({ modules: true, scriptPath, compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
    durableObjects: { JLPT_DATABASE: { className: 'JlptDatabase', useSQLite: true } }, r2Buckets: ['MEDIA'], bindings: config.vars,
    durableObjectsPersist: join(dir, 'db'), r2Persist: join(dir, 'r2') });
  options.resourcePersistencePath = join(dir, 'state');
  let mf = new Miniflare(options);
  const restart = async () => { await mf.dispose(); mf = new Miniflare(options); };
  const request = (path, method = 'GET', body, token = 'test-1', headers = {}) => mf.dispatchFetch(origin + path, { method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const json = async (...args) => { const r = await request(...args); const text = await r.text(); assert.ok(r.ok, `${args[1] ?? 'GET'} ${args[0]} → ${r.status} ${text}`); return JSON.parse(text); };
  try {
    assert.equal((await json('/api/health')).database, 'durable-object-sqlite');
    assert.equal((await request('/api/me', 'GET', undefined, '')).status, 401);
    assert.equal((await request('/api/v3/wordbooks', 'GET', undefined, '')).status, 401);
    assert.equal((await request('/api/auth/firebase', 'POST', { idToken: 'forged' }, '')).status, 401);
    await request('/__seed');
    assert.equal((await json('/api/auth/config')).market, 'database');

    assert.deepEqual(await json('/__tts-cache'), { generated: true, audio: 'fixture-audio' });
    assert.deepEqual(await json('/__tts-cache'), { generated: false, audio: 'fixture-audio' });

    // Library: a wordbook, a knowledge point and a reviewed question, owned by user 1.
    const book = (await json('/api/v3/wordbooks', 'POST', { title: 'Cloud isolation' })).wordbook;
    assert.equal(book.code, 'WB1');
    assert.equal((await json('/api/v3/wordbooks', 'GET', undefined, 'test-2')).wordbooks.length, 0);
    assert.equal((await request('/api/v3/wordbooks/WB1', 'PATCH', { title: 'stolen' }, 'test-2')).status, 404);
    const point = (await json('/api/v3/knowledge', 'POST', { kind: 'word', wordbook: 'WB1', expression: '捉える', reading: 'とらえる', pos: 'verb_2', meaning: '抓住',
      examples: [{ sentence: prompt, translation: '他准确地把握了问题的本质。' }], language: 'zh-Hans' })).item;
    assert.equal(point.code, 'W1');
    assert.equal((await json('/api/v3/knowledge/lookup?q=' + encodeURIComponent('捉えた'))).items[0].code, 'W1');
    assert.equal((await request('/api/v3/knowledge/W1', 'GET', undefined, 'test-2')).status, 404);
    const created = (await json('/api/v3/question-groups', 'POST', group)).group;
    assert.equal(created.status, 'needs_review');
    await json(`/api/v3/question-groups/${created.code}/reviews`, 'POST', { verdict: 'pass', summary: 'ok' });
    const ready = (await json(`/api/v3/question-groups/${created.code}`)).group;
    assert.equal(ready.status, 'ready');
    const question = ready.questions[0];
    const correct = question.options.find((option) => option.correct);

    // Answers and card ratings are idempotent by eventId and stay with their owner.
    const attempt = (await json('/api/v3/attempts', 'POST', { questions: [question.code] })).attempt;
    const answer = { question: question.code, selectedOptionId: correct.id, eventId: 'cloud-answer-1' };
    assert.equal((await json(`/api/v3/attempts/${attempt.code}/answers`, 'POST', answer)).duplicate, false);
    assert.equal((await json(`/api/v3/attempts/${attempt.code}/answers`, 'POST', answer)).duplicate, true);
    assert.equal((await request(`/api/v3/attempts/${attempt.code}/answers`, 'POST', { ...answer, eventId: 'other' }, 'test-2')).status, 404);
    await json(`/api/v3/attempts/${attempt.code}/complete`, 'POST');
    const rating = { code: 'W1', rating: 'hard', eventId: 'cloud-rating-1', source: 'ios' };
    assert.equal((await json('/api/v3/cards/ratings', 'POST', rating)).duplicate, false);
    assert.equal((await json('/api/v3/cards/ratings', 'POST', rating)).duplicate, true);
    assert.equal((await request('/api/v3/cards/ratings', 'POST', { ...rating, eventId: 'stolen' }, 'test-2')).status, 404);

    // Media goes to R2 inside the request transaction: a failed upload leaves no row behind.
    const failed = await request('/api/v3/recordings', 'POST', { audioBase64: wav, mime: 'audio/wav', question: question.code }, 'test-1', { 'x-test-fail-upload': '1' });
    assert.equal(failed.status, 503);
    assert.equal((await json('/api/v3/recordings')).recordings.length, 0, 'failed R2 upload rolls back SQL');
    const recording = (await json('/api/v3/recordings', 'POST', { audioBase64: wav, mime: 'audio/wav', question: question.code })).recording;
    const mediaPath = `/api/v3/media/${recording.mediaId}`;
    assert.equal(Buffer.from(await (await request(mediaPath)).arrayBuffer()).toString('base64'), wav);
    assert.equal((await request(mediaPath, 'GET', undefined, 'test-2')).status, 404);

    // Market: user 2 sees and imports user 1's share, but cannot withdraw it.
    const share = (await json('/api/v3/market', 'POST', { kind: 'wordbook', source: 'WB1', title: 'Shared words' })).share;
    assert.ok((await json('/api/v3/market', 'GET', undefined, 'test-2')).shares.some((s) => s.id === share.id));
    const imported = await json(`/api/v3/market/${share.id}/import`, 'POST', {}, 'test-2');
    assert.ok(imported.wordbook);
    assert.equal((await json('/api/v3/wordbooks', 'GET', undefined, 'test-2')).wordbooks.length, 1);
    const stolen = await request(`/api/v3/market/${share.id}`, 'DELETE', undefined, 'test-2');
    assert.equal(stolen.status, 404, await stolen.text());

    // Offline clients page through everything they cache.
    const synced = [];
    for (let cursor = ''; ;) {
      const page = await json('/api/v3/sync?limit=2' + (cursor ? '&cursor=' + cursor : ''));
      synced.push(...page.records);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    assert.deepEqual(synced.filter((r) => r.collection === 'knowledge').map((r) => r.code), ['W1']);
    assert.equal(synced.find((r) => r.collection === 'questionGroups').value.questions[0].code, question.code);

    await restart();
    assert.deepEqual(await json('/__tts-cache'), { generated: false, audio: 'fixture-audio' });
    assert.equal((await json('/api/v3/knowledge/W1')).item.expression, '捉える');
    assert.equal((await json('/api/v3/attempts')).items[0].code, attempt.code);
    assert.equal((await json('/api/v3/cards/ratings', 'POST', rating)).duplicate, true, 'event ids survive restart');
    assert.equal(Buffer.from(await (await request(mediaPath)).arrayBuffer()).toString('base64'), wav);
    await json(`/api/v3/market/${share.id}`, 'DELETE');
    assert.equal((await request(`/api/v3/market/${share.id}/import`, 'POST', {}, 'test-2')).status, 409, 'withdrawn shares cannot be imported');
    assert.equal((await request(`/api/v3/market/${share.id}`, 'GET', undefined, 'test-2')).status, 404, 'and are hidden from others');

    // OAuth: library writes and media bytes each need their own scope.
    const doc = await json('/.well-known/oauth-protected-resource');
    assert.equal(doc.resource, origin + '/api/jlpt/mcp');
    const client = await json('/api/jlpt/oauth/register', 'POST', { client_name: 'Runtime test', redirect_uris: ['http://localhost:9999/callback'], token_endpoint_auth_method: 'none' });
    const verifier = 'a'.repeat(64);
    const params = { client_id: client.client_id, redirect_uri: 'http://localhost:9999/callback', response_type: 'code', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256', state: 'test', scope: 'study library:write audio:read', resource: origin + '/api/jlpt/mcp' };
    const issue = async (scopes) => {
      const approved = await json('/api/jlpt/oauth/approve', 'POST', { ...params, decision: 'approve', scopes });
      const response = await mf.dispatchFetch(origin + '/api/jlpt/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code: new URL(approved.redirect).searchParams.get('code'), code_verifier: verifier, client_id: client.client_id, redirect_uri: params.redirect_uri, resource: params.resource }).toString() });
      assert.equal(response.status, 200, await response.clone().text());
      return (await response.json()).access_token;
    };
    const full = await issue(['study', 'library:write', 'audio:read']);
    const studyOnly = await issue(['study']);
    assert.equal((await request(mediaPath, 'GET', undefined, full)).status, 200);
    assert.equal((await request(mediaPath, 'GET', undefined, studyOnly)).status, 403);
    assert.equal((await request(mediaPath, 'GET', undefined, 'agt_invalid')).status, 401);
    const rpc = async (token, method, rpcParams = {}) => {
      const r = await mf.dispatchFetch(origin + '/api/jlpt/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: rpcParams }) });
      assert.equal(r.status, 200, await r.clone().text());
      const raw = await r.text(), line = raw.split('\n').find((x) => x.startsWith('data:'));
      const body = JSON.parse(line ? line.slice(5) : raw); assert.ok(!body.error, JSON.stringify(body)); return body.result;
    };
    const catalogue = (await rpc(full, 'tools/list')).tools;
    const names = catalogue.map((tool) => tool.name);
    for (const name of ['list_local_official_samples', 'list_local_mock_exams', 'get_local_mock_exam']) assert.ok(!names.includes(name), `${name} must not be published from Cloudflare`);
    for (const name of ['get_connection_info', 'list_wordbooks', 'create_knowledge_point', 'start_practice', 'get_media', 'count_learning_captures']) assert.ok(names.includes(name), name);
    for (const tool of catalogue) {
      for (const hint of ['readOnlyHint', 'destructiveHint', 'openWorldHint']) assert.equal(typeof tool.annotations?.[hint], 'boolean', `${tool.name}.${hint}`);
    }
    const studyNames = (await rpc(studyOnly, 'tools/list')).tools.map((tool) => tool.name);
    assert.ok(studyNames.includes('list_wordbooks'));
    assert.ok(!studyNames.includes('create_knowledge_point'), 'library:write was not granted');
    assert.ok(!studyNames.includes('get_media'), 'audio:read was not granted');
    const books = await rpc(full, 'tools/call', { name: 'list_wordbooks', arguments: {} });
    assert.equal(books.structuredContent.wordbooks[0].code, 'WB1');
    const audio = await rpc(full, 'tools/call', { name: 'get_media', arguments: { mediaId: recording.mediaId } });
    assert.equal(audio.content[0].type, 'audio');
    assert.equal(audio.content[0].data, wav);
    assert.match((await rpc(full, 'resources/read', { uri: 'ui://jlpt/ai-learning-home.html' })).contents[0].text, /get_ai_learning_home/);
    const resources = (await rpc(full, 'resources/list')).resources;
    assert.match((await rpc(full, 'resources/read', { uri: resources[0].uri })).contents[0].text, /<div id="app"><\/div>/);

    await json(`/api/v3/recordings/${recording.code}`, 'DELETE');
    assert.equal((await request(`/api/v3/recordings/${recording.code}`)).status, 404);

    assert.deepEqual(await json('/__tts-cache-alarm-recovery'), { failed: true, retrySoon: true });
    assert.deepEqual(await json('/__tts-cache-batches'), { first: 6, remaining: 0 });
    assert.deepEqual(await json('/__tts-cache-expire'), { remaining: 0, alarm: true });

    // A Durable Object that still holds only the legacy tables is never rewritten in place.
    await request('/__make-legacy');
    await restart();
    const waiting = await request('/api/v3/wordbooks');
    assert.equal(waiting.status, 503);
    assert.match((await waiting.json()).error, /迁移/);
    assert.equal((await request('/api/health', 'GET', undefined, '')).status, 503);
  } finally { await mf.dispose(); rmSync(dir, { recursive: true, force: true }); }
});
