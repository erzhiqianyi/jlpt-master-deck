import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Event', 'Node']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let reduced = false, hidden = false, failImages = false, mediaListener;
Object.defineProperty(document, 'visibilityState', { get: () => hidden ? 'hidden' : 'visible' });
window.matchMedia = () => ({ get matches() { return reduced; }, addEventListener(_, cb) { mediaListener = cb; }, removeEventListener() {} });
window.Image = class { set src(_) { queueMicrotask(() => failImages ? this.onerror?.() : this.onload?.()); } };
let timers = new Map(), nextTimer = 0;
window.setTimeout = (fn, ms) => { timers.set(++nextTimer, { fn, ms }); return nextTimer; };
window.clearTimeout = id => timers.delete(id);
await mkdir('.local', { recursive: true });
const dir = await mkdtemp(resolve('.local', 'mascot-test-'));
const out = resolve(dir, 'fixture.mjs');
await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import { useStudyCompanion } from './src/components/StudyCompanion';
export { AnswerCelebration } from './src/components/StudyCompanion';
export { PracticePanel } from './src/features/practice/StudyPanels';
export { translations } from './src/i18n/translations';
export function Fixture({ onOpen, action = 'wave' }) { const c = useStudyCompanion(); return <button onClick={() => c.play(action, onOpen)}>{c.image}</button>; }
` }, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, outfile: out });
const { Fixture, AnswerCelebration, PracticePanel, translations } = await import(pathToFileURL(out));
const { act, createElement: h } = await import('react');
const { createRoot } = await import('react-dom/client');
let root, opens;
async function render(action = 'wave') { opens = 0; root = createRoot(document.getElementById('root')); await act(async () => root.render(h(Fixture, { action, onOpen: () => opens++ }))); }
async function click() { await act(async () => document.querySelector('button').click()); }
async function step() { assert.equal(timers.size, 1); const [id, timer] = [...timers][0]; timers.delete(id); await act(async () => timer.fn()); return timer.ms; }
const pose = () => document.querySelector('img').dataset.mascotAction;
afterEach(async () => { await act(async () => root?.unmount()); assert.equal(timers.size, 0); reduced = false; hidden = false; failImages = false; });
after(async () => { dom.window.close(); await rm(dir, { recursive: true, force: true }); });
test('idle uses sparse blink; repeated activation runs only one wave then opens once', async () => {
  await render(); assert.equal(pose(), 'idle');
  assert.equal(await step(), 2600); assert.match(document.querySelector('img').src, /idle\/01.png$/);
  await click(); await click(); assert.equal(pose(), 'wave'); assert.equal(opens, 0);
  const durations = []; for (let i = 0; i < 9; i++) durations.push(await step());
  assert.equal(durations.reduce((a, b) => a + b), 2000); assert.equal(opens, 1); assert.equal(pose(), 'idle');
});
test('background suspends frames and navigation; foreground resumes the action', async () => {
  await render(); await click(); await step();
  const src = document.querySelector('img').src;
  hidden = true; await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  assert.equal(timers.size, 0); assert.equal(opens, 0); assert.equal(document.querySelector('img').src, src);
  hidden = false; await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  for (let i = 0; i < 8; i++) await step();
  assert.equal(opens, 1); assert.equal(pose(), 'idle');
});
test('celebration returns to idle after exact supplied sequence', async () => {
  await render('celebrate'); await click(); assert.equal(pose(), 'celebrate');
  let duration = 0; for (let i = 0; i < 8; i++) duration += await step();
  assert.equal(duration, 2400); assert.equal(pose(), 'idle');
});
test('reduced motion and failed frames preserve immediate original entry', async () => {
  reduced = true; await render(); assert.equal(pose(), 'static'); await click(); assert.equal(opens, 1); assert.equal(timers.size, 0);
});
test('preload failure preserves original still and action', async () => {
  failImages = true; await render(); assert.equal(pose(), 'static'); await click(); assert.equal(opens, 1); assert.equal(timers.size, 0);
});
test('changing reduced motion during wave completes once without animated frames', async () => {
  await render(); await click(); reduced = true; await act(async () => mediaListener());
  assert.equal(pose(), 'static'); assert.equal(opens, 1); assert.equal(timers.size, 0);
});
test('unmount cancels pending opening and every timer', async () => {
  await render(); await click(); await act(async () => root.unmount()); root = null;
  assert.equal(opens, 0); assert.equal(timers.size, 0);
});

test('saved correct feedback does not replay; newly revealed feedback celebrates', async () => {
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(h(AnswerCelebration, { correct: true })));
  assert.equal(pose(), 'idle');
  await act(async () => root.render(h(AnswerCelebration, { correct: false })));
  assert.equal(document.querySelector('img'), null); assert.equal(timers.size, 0);
  await act(async () => root.render(h(AnswerCelebration, { correct: true })));
  assert.equal(pose(), 'celebrate');
});
test('a displayed frame failure finishes the entry once and falls back to the original still', async () => {
  await render(); await click();
  await act(async () => document.querySelector('img').dispatchEvent(new Event('error')));
  assert.equal(pose(), 'static'); assert.equal(opens, 1); assert.equal(timers.size, 0);
  assert.match(document.querySelector('img').src, /study-companion.png$/);
});
test('leaving a feedback state cancels its animation so the next answer can celebrate', async () => {
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(h(AnswerCelebration, { correct: false })));
  await act(async () => root.render(h(AnswerCelebration, { correct: true })));
  assert.equal(pose(), 'celebrate');
  await act(async () => root.render(h(AnswerCelebration, { correct: false })));
  assert.equal(timers.size, 0);
  await act(async () => root.render(h(AnswerCelebration, { correct: true })));
  assert.equal(pose(), 'celebrate');
});
test('a timer queued before visibility effect cleanup cannot advance a hidden document', async () => {
  await render(); await click();
  const src = document.querySelector('img').src;
  hidden = true;
  await step();
  assert.equal(document.querySelector('img').src, src); assert.equal(opens, 0);
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  hidden = false;
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  for (let i = 0; i < 9; i++) await step();
  assert.equal(opens, 1);
});

test('practice waits for an asynchronously accepted answer before starting its celebration', async () => {
  const q = { id: 'q1', itemId: 'word1', kind: 'grammar', title: 'Question', prompt: '問題', choices: ['甲', '乙'], answer: '乙' };
  const noop = () => {};
  const props = { activeQuestion: q, questions: [q], questionsLength: 1, activeIndex: 0, answeredCount: 0, complete: false, feedbackMode: 'immediate', answers: {}, items: [], labels: translations['zh-CN'], questionTypeLabel: 'Test', settings: { locale: 'zh-CN', showExplanationRuby: false }, onAnswer: noop, onPrev: noop, onNext: noop, onJump: noop, onRestart: noop, onPracticeHome: noop, onPrepareReview: async () => {}, onReview: noop, analysisStatus: 'idle' };
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(h(PracticePanel, props)));
  await act(async () => document.querySelectorAll('.question-renderer .question-options button')[1].click());
  assert.equal(document.querySelector('[data-mascot-action]'), null);
  await act(async () => root.render(h(PracticePanel, { ...props, answers: { q1: { selected: '乙', correct: true } }, answeredCount: 1 })));
  assert.equal(document.querySelector('[data-mascot-action]').dataset.mascotAction, 'celebrate');
});
