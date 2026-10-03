import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'Node']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.requestAnimationFrame = (callback) => setTimeout(callback, 0);
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
await mkdir('.local', { recursive: true });
const directory = await mkdtemp(resolve('.local', 'replay-tests-'));
const outfile = resolve(directory, 'components.mjs');
await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
export {HistoryReplayPanel} from './src/features/history/HistoryReplayPanel';
export {ModuleReviewPanel} from './src/features/history/ModuleReviewPanel';
export {ConfirmationProvider} from './src/components/ConfirmationProvider';
export {translations} from './src/i18n/translations';
` }, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, outfile });
const { HistoryReplayPanel, ModuleReviewPanel, ConfirmationProvider, translations } = await import(pathToFileURL(outfile));
const { createElement: h, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('root'));
const labels = translations['zh-CN'];
const settings = { locale: 'zh-CN', feedbackMode: 'batch', showExplanationRuby: false, showReviewRuby: false, fontSize: 'medium' };
const questions = [
  { id: 'original-2', itemId: 'item-2', kind: 'meaning', prompt: 'Second original question first', choices: ['correct-2', 'wrong-2'], answer: 'correct-2' },
  { id: 'original-1', itemId: 'item-1', kind: 'meaning', prompt: 'First original question second', choices: ['correct-1', 'wrong-1'], answer: 'correct-1' },
];
const source = Object.freeze({ id: 'source', view: 'grammar', deck: 'grammar_expression', title: 'Exact original set', startedAt: '2026-10-01', completedAt: '2026-10-01', questionIds: ['original-2', 'original-1'], answers: Object.freeze([{ questionId: 'original-1', selected: 'wrong-1', correct: false, elapsedMs: 9 }]) });
const attempt = { ...source, id: 'replay', completedAt: undefined, analysisStatus: 'idle', answers: [] };
let nextKey = 0;
const noop = () => {};
async function render(component, props) { await act(async () => root.render(h(ConfirmationProvider, null, h(component, { key: ++nextKey, ...props })))); }
async function click(element) { assert.ok(element, 'expected control exists'); await act(async () => element.click()); }
const button = (label) => [...document.querySelectorAll('button')].find((element) => element.textContent.trim() === label);
const choice = (text) => [...document.querySelectorAll('button')].find((element) => element.textContent.includes(text));
const props = (onSave, extra = {}) => ({ attempt, questions, items: [], labels, locale: 'zh-CN', settings, token: '', review: false, onSave, onRestart: noop, onReview: noop, onPractice: noop, onBack: noop, ...extra });
after(async () => { await act(async () => root.unmount()); dom.window.close(); await rm(directory, { recursive: true, force: true }); });

test('replay uses original order, keeps every answer under delayed saves, and preserves original history', async () => {
  const snapshots = [], resolveSaves = [];
  await render(HistoryReplayPanel, props((saved) => { snapshots.push(structuredClone(saved)); return new Promise((resolve) => resolveSaves.push(resolve)); }));
  assert.match(document.body.textContent, /Second original question first/);
  await click(choice('correct-2'));
  await click(button(labels.next));
  assert.match(document.body.textContent, /First original question second/);
  await click(choice('wrong-1'));
  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots[1].answers.map((answer) => answer.questionId), ['original-2', 'original-1']);
  // Delayed responses may settle out of order; they cannot replace local answer state.
  await act(async () => resolveSaves[1]());
  await act(async () => resolveSaves[0]());
  assert.equal(choice('wrong-1').getAttribute('aria-pressed'), 'true');
  assert.equal(source.id, 'source');
  assert.equal(source.answers.length, 1);
  assert.equal(source.answers[0].selected, 'wrong-1');
  assert.equal(source.completedAt, '2026-10-01');
});

test('failed completion retains answers, retry saves the same attempt, repeated activation saves once', async () => {
  const snapshots = [];
  let completionCalls = 0, reviewCalls = 0, finish;
  await render(HistoryReplayPanel, props(async (saved) => {
    snapshots.push(structuredClone(saved));
    if (!saved.completedAt) return;
    completionCalls += 1;
    if (completionCalls === 1) throw new Error('Save failed deliberately');
    await new Promise((resolve) => { finish = resolve; });
  }, { onReview: () => reviewCalls++ }));
  await click(choice('correct-2'));
  await click(button(labels.next));
  await click(choice('correct-1'));
  await click(button(labels.reviewPage));
  assert.match(document.body.textContent, /Save failed deliberately/);
  assert.equal(reviewCalls, 0);
  assert.equal(choice('correct-1').getAttribute('aria-pressed'), 'true');
  const retry = button(labels.reviewRetry);
  await act(async () => { retry.click(); retry.click(); });
  assert.equal(completionCalls, 2, 'same-batch repeated activation must not submit twice');
  assert.equal(reviewCalls, 0, 'do not leave before save resolves');
  await act(async () => finish());
  assert.equal(reviewCalls, 1);
  const completed = snapshots.filter((saved) => saved.completedAt);
  assert.equal(completed[0].id, 'replay');
  assert.equal(completed[1].id, 'replay');
  assert.equal(completed[1].answers.length, 2);
  assert.equal(completed[1].summary.correct, 2);
});

test('resuming a replay reconstructs only its answers and skips already answered questions', async () => {
  await render(HistoryReplayPanel, props(async () => {}, { attempt: { ...attempt, answers: [{ questionId: 'original-2', itemId: 'item-2', kind: 'meaning', selected: 'correct-2', correct: true, answeredAt: '2026-10-03', elapsedMs: 2 }] } }));
  assert.match(document.body.textContent, /First original question second/);
  assert.equal(choice('correct-1').getAttribute('aria-pressed'), 'false');
  assert.equal(choice('wrong-1').getAttribute('aria-pressed'), 'false');
});

test('module review has explicit empty recovery and audio-level real progress', async () => {
  let starts = 0, opened;
  await render(ModuleReviewPanel, { module: 'reading', locale: 'zh-CN', readingQuestions: [], listeningQuestions: [], progress: {}, onOpen: noop, onPractice: () => starts++ });
  assert.match(document.body.textContent, /还没有练习记录/);
  await click(button('开始练习'));
  assert.equal(starts, 1);
  await render(ModuleReviewPanel, { module: 'listening', locale: 'zh-CN', readingQuestions: [], listeningQuestions: [{ id: 'q1', audioAssetId: 'a1', audioReference: 'A-1', audioFileName: 'Audio one', title: 'Q1' }, { id: 'q2', audioAssetId: 'a1', title: 'Q2' }], progress: { 'listening-audio:a1': { reviewCount: 3, correct: 0, wrong: 0 } }, onOpen: (id) => opened = id, onPractice: noop });
  assert.equal(document.querySelectorAll('li').length, 1);
  assert.match(document.body.textContent, /练习次数: 3/);
  assert.match(document.body.textContent, /历史选项答案未保存/);
  await click(document.querySelector('li button'));
  assert.equal(opened, 'A-1');
});
