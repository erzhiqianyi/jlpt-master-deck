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
window.speechSynthesis = { cancel() {}, resume() {} };
await mkdir('.local', { recursive: true });
const dir = await mkdtemp(resolve('.local', 'reading-review-'));
await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
export { ReadingPanel } from './src/features/reading/ReadingPanel';
export { SpeechProvider } from './src/components/SpeechControls';
export { WordLookupProvider } from './src/features/review/WordLookup';
` }, outfile: resolve(dir, 'ui.mjs'), bundle: true, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' } });
const { ReadingPanel, SpeechProvider, WordLookupProvider } = await import(pathToFileURL(resolve(dir, 'ui.mjs')));
const { createElement: h, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('root'));
const question = { id: 'reading-1', title: '読解', passage: '日本語を勉強します。\n毎日読みます。', question: '何を勉強しますか。', choices: ['日本語', '英語'], answerIndex: 0, explanation: '日本語です。', rubyTerms: [{ text: '日本語', reading: 'にほんご' }], tags: [], createdAt: '2026-10-05' };
let key = 0;
async function render(questions, record, progress = {}, mode = 'library') {
  await act(async () => root.render(h(SpeechProvider, { settings: { locale: 'zh-CN', ttsProvider: 'browser' }, token: '' }, h(WordLookupProvider, { items: [], captures: [], locale: 'zh-CN', enabled: false, onCapture: async () => {}, authToken: '', ttsProvider: 'browser' }, h(ReadingPanel, { key: ++key, mode, progress, labels: { readingShowAnswer: '确认答案', readingSelectAnswer: '请先选择答案' }, locale: 'zh-CN', questions, activeQuestionId: question.id, onRecordPractice: record, onCreate: async () => {}, onDelete: async () => {} })))));
}
const switches = () => document.querySelectorAll('[role="switch"]');
const speech = () => document.querySelectorAll('button[aria-label^="朗读"]');
async function confirm(index = 0) {
  const section = document.querySelectorAll('.reading-question')[index];
  await act(async () => section.querySelector('.reading-choice').click());
  await act(async () => section.querySelector('.reading-confirm-answer').click());
}
after(async () => { await act(async () => root.unmount()); dom.window.close(); await rm(dir, { recursive: true, force: true }); });

test('answering hides all reading aids; successful confirmation unlocks optional ruby, lookup and speech', async () => {
  const records = [];
  await render([question], async (...args) => { records.push(args); });
  assert.equal(switches().length, 0);
  assert.equal(speech().length, 0);
  assert.equal(document.querySelectorAll('ruby').length, 0);
  await act(async () => document.querySelector('.reading-confirm-answer').click());
  assert.equal(records.length, 0);
  assert.equal(switches().length, 0);
  await confirm();
  assert.equal(records.length, 1);
  assert.equal(switches().length, 2);
  assert.ok([...switches()].every(input => !input.checked));
  assert.equal(speech().length, 3, 'whole passage and two paragraphs');
  await act(async () => switches()[0].click());
  assert.ok(document.querySelector('ruby'));
  await act(async () => switches()[1].click());
  assert.ok(document.querySelector('.reading-original-text .lookup-word'));
});

test('shared passage aids stay hidden until every question is confirmed', async () => {
  await render([question, { ...question, id: 'reading-2', question: 'いつ読みますか。' }], async () => {});
  await confirm(0);
  assert.equal(switches().length, 0);
  assert.equal(speech().length, 0);
  await confirm(1);
  assert.equal(switches().length, 2);
  assert.equal(speech().length, 3);
});

test('pending or failed saves never unlock review controls', async () => {
  let rejectSave;
  await render([question], () => new Promise((_, reject) => { rejectSave = reject; }));
  await act(async () => document.querySelector('.reading-choice').click());
  await act(async () => document.querySelector('.reading-confirm-answer').click());
  assert.equal(switches().length, 0);
  assert.equal(speech().length, 0);
  await act(async () => rejectSave(new Error('保存失败')));
  assert.match(document.querySelector('.reading-question').textContent, /保存失败/);
  assert.equal(switches().length, 0);
  assert.equal(speech().length, 0);
});

for (const mode of ['library', 'practice']) {
  test(`${mode}: only previously answered questions allow viewing without recording`, async () => {
    const records = [];
    await render([question], async (...args) => records.push(args), {}, mode);
    assert.equal(document.querySelector('.reading-view-answer'), null);
    await render([question], async (...args) => records.push(args), { [question.id]: { correct: 0, wrong: 1, reviewCount: 1 } }, mode);
    await act(async () => document.querySelector('.reading-view-answer').click());
    assert.equal(records.length, 0);
    assert.equal(document.querySelector('.reading-choice').dataset.answerState, 'correct');
    assert.ok(document.querySelector('.reading-explanations'));
    assert.equal(switches().length, 2);
    await act(async () => document.querySelectorAll('.reading-choice')[1].click());
    assert.equal(document.querySelector('.reading-explanations'), null);
    await act(async () => document.querySelector('.reading-confirm-answer').click());
    assert.equal(records.length, 1);
  });
}
