import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Functional coverage only. Real-browser screenshots are required for pixel QA.
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Event', 'MouseEvent', 'Node']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
window.requestAnimationFrame = callback => { callback(); return 1; };
window.HTMLElement.prototype.scrollIntoView = () => {};
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
URL.createObjectURL = () => 'blob:test-audio';
URL.revokeObjectURL = () => {};
const requests = [];
globalThis.fetch = async (path, options = {}) => { requests.push({ path: String(path), method: options.method ?? 'GET' }); return { ok: true, status: 200, blob: async () => new Blob(['test']), json: async () => ({ recordings: [], questions: [] }) }; };
await mkdir('.local', { recursive: true });
const directory = await mkdtemp(resolve('.local', 'content-redesign-tests-'));
const output = resolve(directory, 'panels.mjs');
await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import { useState } from 'react';
import { ReadingPanel } from './src/features/reading/ReadingPanel';
import { ListeningPanel } from './src/features/listening/ListeningPanel';
import { AuthoringNavigationProvider } from './src/components/AuthoringNavigation';
import { PageChromeProvider, PageHeaderActions } from './src/components/PageChrome';
export { ConfirmationProvider } from './src/components/ConfirmationProvider';
export { translations } from './src/i18n/translations';
export function Harness({ feature, ...props }) {
  const [location, setLocation] = useState(null);
  const Panel = feature === 'reading' ? ReadingPanel : ListeningPanel;
  return <PageChromeProvider><AuthoringNavigationProvider onChange={setLocation}><header><button type="button" onClick={() => location?.close()}>Header back</button><span id="local-page-title">{location?.label}</span><PageHeaderActions /></header><Panel {...props} /></AuthoringNavigationProvider></PageChromeProvider>;
}
` }, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, outfile: output });
const { Harness, ConfirmationProvider, translations } = await import(pathToFileURL(output));
const { createElement: h, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('root'));
const labels = translations.en;
const reading = { id: 'reading-1', title: 'A passage', passage: '日本語を勉強します。', question: 'What does the author do?', choices: ['Study Japanese', 'Teach Japanese', 'Read', 'Write'], answerIndex: 0, tags: ['Study'], createdAt: '2026-10-01' };
const listening = { id: 'listening-1', title: 'A listening question', question: 'Which train should the speaker take?', choices: ['Train A', 'Train B'], answerIndex: 0, questionTypeId: 'listening-task', audioFileName: 'Track_10.mp3', audioAssetId: 'audio-1', audioSize: 100, createdAt: '2026-10-01', transcript: '男：次の電車に乗ります。', transcriptTranslation: '男：我要乘下一班电车。' };
const defaults = { mode: 'library', labels, locale: 'en', token: 'fixture', onRecordPractice: async () => {}, onCreate: async () => {}, onUpdate: async () => {}, onDelete: async () => {} };
let mount = 0;
async function render(feature, props = {}) { await act(async () => root.render(h(ConfirmationProvider, null, h(Harness, { ...defaults, feature, questions: feature === 'reading' ? [reading] : [listening], ...props, key: ++mount })))); }
async function click(element) { assert.ok(element, 'expected control exists'); await act(async () => element.click()); }
async function fill(element, value) { assert.ok(element); await act(async () => { Object.getOwnPropertyDescriptor(element instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); }); }
const button = text => [...document.querySelectorAll('button')].find(element => element.textContent.trim() === text);
async function openTools() { await click(document.querySelector('header .page-header-action')); }
after(async () => { await act(async () => root.unmount()); dom.window.close(); await rm(directory, { recursive: true, force: true }); });

test('reading list stays concise, its add form groups every field, and cancel preserves the draft', async () => {
  await render('reading');
  assert.equal(document.querySelector('.reading-workspace h1'), null);
  assert.match(document.querySelector('.standard-list-description').textContent, /Study · 1 questions · 0 answers/);
  await openTools();
  await click(button('Add reading material'));
  const form = document.querySelector('.reading-authoring-form');
  assert.ok(form);
  assert.equal(form.querySelectorAll('details').length, 2);
  assert.equal(form.querySelectorAll('textarea').length, 3, 'passage, question and explanation remain available');
  assert.equal(form.querySelectorAll('input').length, 6, 'title, four choices and tags remain available');
  assert.equal(form.querySelector('details').open, false);
  const title = form.querySelector('input');
  await fill(title, 'Keep this draft');
  await click(button('Header back'));
  assert.equal(document.querySelector('form'), null);
  await openTools();
  await click(button('Add reading material'));
  assert.equal(document.querySelector('.reading-authoring-form input').value, 'Keep this draft');
});

test('reading passage collapse and header Back preserve the selected answer without writing history', async () => {
  let records = 0;
  await render('reading', { activeQuestionId: reading.id, onRecordPractice: async () => { records++; } });
  await click(document.querySelectorAll('.reading-choice')[1]);
  await click(button('Close passage and answer'));
  assert.equal(document.querySelector('.reading-passage-body').open, false);
  assert.equal(document.getElementById('local-page-title').textContent, 'Reading questions');
  await click(button('Header back'));
  assert.equal(document.querySelector('.reading-passage-body').open, true);
  assert.equal(document.querySelectorAll('.reading-choice')[1].getAttribute('aria-pressed'), 'true');
  assert.equal(records, 0);
  await click(button(labels.readingShowAnswer));
  assert.equal(records, 1);
});

test('listening shadowing and scoped Back retain partial question answers', async () => {
  let records = 0;
  await render('listening', { activeQuestionId: listening.id, onRecordPractice: async () => { records++; } });
  await click(document.querySelectorAll('input[type="radio"]')[1]);
  await click(button('进入跟读练习'));
  assert.equal(document.getElementById('local-page-title').textContent, 'Shadowing practice');
  assert.equal(document.querySelector('.listening-detail').hidden, true);
  await click(button('Header back'));
  assert.equal(document.querySelector('.listening-detail').hidden, false);
  assert.equal(document.querySelectorAll('input[type="radio"]')[1].checked, true);
  assert.equal(records, 0);
  assert.equal(requests.some(request => request.method !== 'GET'), false, 'opening shadowing makes no recording or history writes');
});

test('listening authoring retains choice translations, explanations, audio and transcript fields in collapsed groups', async () => {
  await render('listening');
  assert.match(document.querySelector('.listening-row-title').textContent, /Track 10/);
  assert.doesNotMatch(document.querySelector('.standard-list-description').textContent, /2026|listening-1/);
  await openTools();
  await click(button(labels.listeningUploadTitle));
  const form = document.querySelector('.listening-authoring-form');
  assert.equal(form.querySelectorAll('details').length, 2);
  assert.equal(form.querySelectorAll('fieldset').length, 4);
  assert.equal(form.querySelectorAll('input[type="file"]').length, 1);
  assert.equal(form.querySelectorAll('textarea').length, 8, 'question, four choice explanations, overall explanation and both transcripts remain available');
  assert.equal(form.querySelector('.listening-audio-form-group').open, false);
  await fill(form.querySelector('input:not([type])'), 'Keep listening draft');
  await click(button('Header back'));
  await openTools();
  await click(button(labels.listeningUploadTitle));
  assert.equal(document.querySelector('.listening-authoring-form input:not([type])').value, 'Keep listening draft');
});


test('shadowing owns Back above a retained listening editor and restores its unsaved draft', async () => {
  await render('listening', { activeQuestionId: listening.id });
  const manage = document.querySelector('#listening-question-group details > summary');
  await click(manage);
  await click(document.querySelector('#listening-question-group details button[title="编辑"]'));
  assert.equal(document.getElementById('local-page-title').textContent, 'Edit listening question');
  await fill(document.querySelector('#listening-question-group form input'), 'Unsaved editor title');
  assert.ok(document.querySelector('header .page-header-action'), 'the listening page exposes its own share action');
  await click(button('进入跟读练习'));
  assert.equal(document.getElementById('local-page-title').textContent, 'Shadowing practice');
  assert.equal(document.querySelector('.listening-detail').hidden, true);
  assert.equal(document.querySelector('header .page-header-action'), null, 'background page actions are unregistered during shadowing');
  await click(button('Header back'));
  assert.equal(document.querySelector('.listening-detail').hidden, false);
  assert.equal(document.getElementById('local-page-title').textContent, 'Edit listening question');
  assert.equal(document.querySelector('#listening-question-group form input').value, 'Unsaved editor title');
  assert.ok(document.querySelector('header .page-header-action'), 'the foreground share action is restored');
  await click(button('Header back'));
  assert.equal(document.querySelector('#listening-question-group form'), null, 'the next Back exits editing only');
});
