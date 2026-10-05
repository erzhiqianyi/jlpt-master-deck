import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { build } from 'esbuild';
import { webcrypto } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const stored = new Map();
let failWrites = false;
const cache = {
  async match(request) { return stored.get(request.url)?.clone(); },
  async put(request, response) { if (failWrites) throw new DOMException('Storage full', 'QuotaExceededError'); stored.set(request.url, response.clone()); },
};
globalThis.window = { caches: { async open() { return cache; } }, crypto: webcrypto, location: { origin: 'https://jlpt.test' }, speechSynthesis: { cancel() {}, resume() {} } };
const players = [];
globalThis.Audio = class {
  constructor() { players.push(this); }
  async play() { queueMicrotask(() => this.onended?.()); }
  pause() {}
};
const dir = await mkdtemp(join(tmpdir(), 'speech-download-'));
await build({ entryPoints: ['src/lib/tts.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'tts.mjs') });
let tts = await import(pathToFileURL(join(dir, 'tts.mjs')));
after(() => rm(dir, { recursive: true, force: true }));
const options = { provider: 'azure', token: 'private-token', cacheScope: 'account-1', voice: 'Nanami', style: 'chat', role: '' };
const response = () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } });

test('downloaded R2 response survives a new playback session, needs no network and uses the current playback rate', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => { requests++; assert.equal(init.headers.authorization, 'Bearer private-token'); return response(); });
  const text = '青春。'.repeat(250);
  await tts.downloadSpeech(text, options);
  assert.ok(requests > 1);
  assert.equal(await tts.speechDownloaded(text, options), true);
  const initialRequests = requests;
  tts = await import(`${pathToFileURL(join(dir, 'tts.mjs'))}?session=next`);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  await tts.speak(text, { ...options, token: 'renewed-token', rate: 0.8 });
  assert.equal(requests, initialRequests);
  assert.ok(players.length > 1);
  assert.ok(players.every(player => player.playbackRate === 0.8));
  assert.ok([...stored.keys()].every(key => !key.includes('private-token') && !key.includes('青春')));
});

test('downloads are isolated by account, text and voice settings', async () => {
  const text = '青春。'.repeat(250);
  assert.equal(await tts.speechDownloaded(text, { ...options, cacheScope: 'account-2' }), false);
  assert.equal(await tts.speechDownloaded(text, { ...options, voice: 'Keita' }), false);
  assert.equal(await tts.speechDownloaded(text, { ...options, style: 'cheerful' }), false);
  assert.equal(await tts.speechDownloaded('別の単語', options), false);
});

test('playback stores its audio locally and the second play uses only that local copy', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return response(); });
  await tts.speak('日本語', options);
  await tts.speak('日本語', options);
  assert.equal(requests, 1);
});

test('failed or interrupted downloads cannot report a complete offline copy', async (t) => {
  const text = 'まだダウンロードしていない音声';
  t.mock.method(globalThis, 'fetch', async () => response());
  failWrites = true;
  await assert.rejects(tts.downloadSpeech(text, options), { name: 'QuotaExceededError' });
  failWrites = false;
  assert.equal(await tts.speechDownloaded(text, options), false);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(tts.downloadSpeech(text, options, controller.signal), { name: 'AbortError' });
  assert.equal(await tts.speechDownloaded(text, options), false);
});

test('invalid non-audio responses and system speech never produce downloadable audio', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('not audio'));
  await assert.rejects(tts.downloadSpeech('invalid', options), /有效的朗读音频/);
  assert.equal(await tts.speechDownloaded('invalid', options), false);
  await assert.rejects(tts.downloadSpeech('system', { ...options, provider: 'browser' }), /系统内置语音/);
});
