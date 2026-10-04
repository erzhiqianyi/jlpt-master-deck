import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
globalThis.Audio = class {};
globalThis.window = { speechSynthesis: { cancel() {}, pause() {}, resume() {} } };
const dir = await mkdtemp(join(tmpdir(), 'speech-playback-'));
await build({ entryPoints: ['src/lib/tts.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'tts.mjs') });
const tts = await import(pathToFileURL(join(dir, 'tts.mjs')));
after(() => rm(dir, { recursive: true, force: true }));

test('long Japanese passages split without losing text or splitting surrogate pairs', () => {
  const text = 'これは長い文章です。'.repeat(200) + '𠮷'.repeat(300);
  const parts = tts.splitSpeechText(text);
  assert.equal(parts.join(''), text);
  assert.ok(parts.every((part) => part.length <= 450));
  assert.ok(parts.every((part) => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(part)));
});

test('stopped pending requests cannot begin playback even if fetch ignores cancellation', async (t) => {
  let finishFetch;
  t.mock.method(globalThis, 'fetch', () => new Promise((resolve) => { finishFetch = resolve; }));
  let constructed = 0;
  t.mock.property(globalThis, 'Audio', class { constructor() { constructed++; } });
  const pending = tts.speak('日本語', { provider: 'azure', token: 'test', owner: 'card' });
  assert.equal(tts.speechSnapshot().status, 'loading');
  tts.stopSpeech();
  finishFetch(new Response(new Uint8Array([1])));
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(constructed, 0);
  assert.equal(tts.speechSnapshot().status, 'idle');
});

test('playback waits for each chunk, forwards voice settings and releases URLs', async (t) => {
  const requests = [], players = [], revoked = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => { requests.push(JSON.parse(options.body)); return new Response(new Uint8Array([1])); });
  t.mock.property(globalThis, 'Audio', class {
    constructor() { players.push(this); }
    async play() {}
    pause() {}
  });
  t.mock.method(URL, 'createObjectURL', () => 'blob:test');
  t.mock.method(URL, 'revokeObjectURL', (url) => revoked.push(url));
  const pending = tts.speak('あ'.repeat(600), { provider: 'azure', token: 'test', voice: 'Nanami', style: 'chat', role: '', rate: 0.8, owner: 'reading' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 1);
  assert.equal(players[0].playbackRate, 0.8);
  tts.pauseSpeech(); assert.equal(tts.speechSnapshot().status, 'paused');
  await tts.resumeSpeech(); assert.equal(tts.speechSnapshot().status, 'playing');
  players[0].onended();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 2);
  assert.equal(requests[1].style, 'chat');
  players[1].onended(); await pending;
  assert.equal(revoked.length, 2);
  assert.equal(tts.speechSnapshot().status, 'idle');
});
