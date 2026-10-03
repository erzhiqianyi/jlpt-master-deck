import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'https://example.test/#/vocabulary/words' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'HTMLTextAreaElement', 'Event', 'MouseEvent']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom verifies component behavior; real-browser QA owns top-layer focus trapping and geometry.
HTMLDialogElement.prototype.showModal = function () { this.open = true; this.querySelector('[autofocus], button, textarea')?.focus(); };
HTMLDialogElement.prototype.close = function () { this.open = false; };
await mkdir('.local', { recursive: true });
const directory = await mkdtemp(join(process.cwd(), '.local', 'module-actions-'));
const { outputFiles } = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import { createElement, act } from 'react';
    import { createRoot } from 'react-dom/client';
    import { ModuleActionBar } from './src/components/ModuleActionBar';
    import { ShareButton } from './src/components/ShareButton';
    export { act, createRoot };
    export const module = props => createElement(ModuleActionBar, props);
    export const share = props => createElement(ShareButton, props);
  ` },
  bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', write: false, packages: 'external',
});
const file = join(directory, 'render.mjs');
await writeFile(file, outputFiles[0].text);
const ui = await import(pathToFileURL(file));
let root;
const app = document.getElementById('app');
const buttons = (scope = app) => [...scope.querySelectorAll('button')];
const button = (text, scope = app) => buttons(scope).find((element) => element.textContent === text || element.getAttribute('aria-label') === text);
async function click(element) { assert.ok(element, 'button exists'); await ui.act(async () => element.click()); }
async function mount(kind, props) { root = ui.createRoot(app); await ui.act(async () => root.render(ui[kind](props))); }
async function input(element, value) {
  await ui.act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
afterEach(async () => { await ui.act(async () => root?.unmount()); root = undefined; document.body.style.overflow = ''; });
after(async () => { dom.window.close(); await rm(directory, { recursive: true, force: true }); });

test('all declared module actions render, preserve toggle state and respect disabled gates', async () => {
  let count = 0;
  await mount('module', { label: 'Vocabulary', locale: 'en', actions: [
    { key: 'tips', label: 'Learning methods', onClick: () => count++ },
    { key: 'focused', label: 'By question type', active: true, onClick: () => count++ },
    { key: 'add', label: 'Add word', disabled: true, onClick: () => count++ },
  ] });
  assert.equal(button('By question type').getAttribute('aria-pressed'), 'true');
  await click(button('Add word'));
  assert.equal(count, 0);
  await click(button('Learning methods'));
  assert.equal(count, 1);
  await click(button('More actions'));
  const dialog = app.querySelector('dialog');
  assert.equal(dialog.open, true);
  assert.equal(button('Add word', dialog).disabled, true);
  await click(button('By question type', dialog));
  assert.equal(count, 2);
  assert.equal(dialog.open, false);
});

test('practice mode preserves capability gates and restores focus on cancellation', async () => {
  await mount('module', { label: 'Vocabulary', locale: 'en', primary: { label: 'Start practice', onClick() {} } });
  const trigger = button('Start practice');
  trigger.focus();
  await click(trigger);
  const dialog = app.querySelector('dialog');
  assert.equal(button('Practice by content', dialog).disabled, true);
  assert.equal(button('Ask a question', dialog), undefined);
  assert.equal(document.body.style.overflow, 'hidden');
  await ui.act(async () => dialog.dispatchEvent(new Event('cancel', { cancelable: true })));
  assert.equal(dialog.open, false);
  assert.equal(document.activeElement, trigger);
  assert.equal(document.body.style.overflow, '');
});

test('content menu invokes the selected action and closes, including after reopening', async () => {
  let count = 0;
  await mount('module', { label: 'Vocabulary', locale: 'en', primary: { label: 'Start practice', onClick: () => count++ }, contentActions: [
    { key: 'one', label: 'My wordbook', onClick: () => count += 10 },
  ] });
  await click(button('Start practice'));
  await click(button('Practice by content'));
  await click(button('My wordbook'));
  assert.equal(count, 10);
  assert.equal(app.querySelector('dialog').open, false);
  await click(button('Start practice'));
  await click(button('Random practice'));
  assert.equal(count, 11);
  assert.equal(app.querySelector('dialog').open, false);
});

test('question composer prevents duplicate submits, retains failures and links to pending records', async () => {
  let calls = 0;
  let resolve;
  let fail = true;
  await mount('module', { label: 'Vocabulary', locale: 'en', primary: { label: 'Start practice', onClick() {} }, onAsk: async (question) => {
    assert.equal(question, 'What does this mean?'); calls++;
    if (fail) throw new Error('offline');
    await new Promise((done) => { resolve = done; });
  } });
  await click(button('Start practice'));
  await click(button('Ask a question'));
  const textarea = app.querySelector('textarea');
  assert.equal(document.activeElement, textarea);
  await input(textarea, 'What does this mean?');
  await click(button('Add to pending queue'));
  assert.match(app.querySelector('[role="alert"]').textContent, /Could not submit/);
  assert.equal(textarea.value, 'What does this mean?');
  fail = false;
  await ui.act(async () => {
    const form = app.querySelector('form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  assert.equal(calls, 2);
  assert.equal(textarea.disabled, true);
  await ui.act(async () => { resolve(); });
  assert.equal(textarea.value, '');
  assert.equal(app.querySelector('[role="status"] a').getAttribute('href'), '#/captures');
});

test('new dialog copy follows Japanese locale and explicit close is always available', async () => {
  await mount('module', { label: '語彙', locale: 'ja', primary: { label: '練習を開始', onClick() {} }, onAsk: async () => {} });
  await click(button('練習を開始'));
  assert.ok(button('ランダム練習'));
  await click(button('質問する'));
  assert.ok(button('待機リストに追加'));
  await click(button('閉じる'));
  assert.equal(app.querySelector('dialog').open, false);
});

test('share confirmation uses a native modal, names the audience and returns focus on cancel', async () => {
  let shares = 0;
  await mount('share', { locale: 'en', description: 'My practice', onShare: async () => { shares++; } });
  const trigger = button('Share');
  trigger.focus();
  await click(trigger);
  const dialog = app.querySelector('dialog');
  assert.equal(dialog.open, true);
  assert.match(dialog.textContent, /other learners can view and add/);
  assert.equal(app.querySelectorAll('[role="dialog"]').length, 0);
  await click(button('Cancel'));
  assert.equal(dialog.open, false);
  assert.equal(document.activeElement, trigger);
  assert.equal(shares, 0);
});


test('successful sharing preserves a focusable status and cannot publish twice', async () => {
  let shares = 0;
  await mount('share', { locale: 'en', description: 'My practice', onShare: async () => { shares++; } });
  const trigger = button('Share');
  trigger.focus();
  await click(trigger);
  await click(button('Share publicly'));
  assert.equal(shares, 1);
  assert.equal(app.querySelector('dialog').open, false);
  assert.equal(document.activeElement, trigger);
  assert.equal(trigger.getAttribute('aria-disabled'), 'true');
  await click(trigger);
  assert.equal(app.querySelector('dialog').open, false);
  assert.equal(shares, 1);
});
