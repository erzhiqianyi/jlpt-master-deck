import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
for (const key of ['window', 'document', 'HTMLElement', 'Event', 'Node']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const spoken = [];
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
window.speechSynthesis = { getVoices: () => [], cancel() {}, resume() {}, speak(utterance) { spoken.push(utterance.text); queueMicrotask(() => utterance.onend()); } };
await mkdir('.local', { recursive: true });
const dir = await mkdtemp(resolve('.local', 'speech-ui-'));
await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
export { SpeechProvider } from './src/components/SpeechControls';
export { FocusedMemoryReview } from './src/features/review/FocusedMemoryReview';
` }, outfile: resolve(dir, 'ui.mjs'), bundle: true, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' } });
const { SpeechProvider, FocusedMemoryReview } = await import(pathToFileURL(resolve(dir, 'ui.mjs')));
const { createElement: h, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('root'));
let key = 0;
const item = { id: 'grammar-1', type: 'grammar', deck: 'n1_grammar', original: 'に限らず', examples: [{ ja: '日本に限らず、世界中で人気がある。', zh: '不限于日本。' }] };
async function render(speech, locale = 'zh-CN') {
  spoken.length = 0;
  await act(async () => root.render(h(SpeechProvider, { settings: { locale, ttsProvider: 'browser', speech }, token: '' }, h(FocusedMemoryReview, { key: ++key, items: [item], locale, frontFields: ['original'], backFields: ['original', 'examples'], wordSpacing: false, onExit() {}, async onRate() {} }))));
}
after(async () => { await act(async () => root.unmount()); dom.window.close(); await rm(dir, { recursive: true, force: true }); });

test('grammar autoplay is opt-in even when card autoplay is on', async () => {
  await render({ cardAuto: 'front', grammarAuto: false });
  assert.equal(spoken.length, 0);
  const manual = document.querySelector('button[aria-label="朗读"]');
  assert.ok(manual);
  await act(async () => manual.click());
  assert.deepEqual(spoken, ['に限らず']);
  assert.equal(document.querySelector('.is-flipped'), null, 'speech button must not flip the card');
});

test('reveal autoplay reads the grammar and optional example only after revealing', async () => {
  await render({ cardAuto: 'back', grammarAuto: true, includeExample: true });
  assert.equal(spoken.length, 0);
  const reveal = [...document.querySelectorAll('button')].find((button) => button.textContent === '显示答案');
  await act(async () => reveal.click());
  assert.equal(spoken.join(''), 'に限らず。日本に限らず、世界中で人気がある。');
});

for (const [locale, read, reveal, rating] of [['ja', '読み上げ', '答えを表示', '覚えている'], ['en', 'Read aloud', 'Show answer', 'Remembered']]) {
  test(`memory review controls use icons and ${locale} labels`, async () => {
    await render({ cardAuto: 'off' }, locale);
    const speechButton = document.querySelector(`button[aria-label="${read}"]`);
    assert.ok(speechButton.querySelector('svg'));
    assert.equal(speechButton.textContent, '');
    const revealButton = [...document.querySelectorAll('button')].find(button => button.textContent === reveal);
    assert.ok(revealButton);
    await act(async () => revealButton.click());
    assert.match(document.querySelector('[data-rating="remembered"]').textContent, new RegExp(rating));
    assert.doesNotMatch(document.querySelector('.ledger-memory-ratings').textContent, /分钟|天|忘记/);
    await act(async () => document.querySelector('[data-rating="remembered"]').click());
    assert.doesNotMatch(document.querySelector('.ledger-review-complete').textContent, /今日复习完成|返回今天/);
  });
}
