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
afterEach(async () => { await ui.act(async () => root?.unmount()); root = undefined; document.body.style.overflow = ''; });
after(async () => { dom.window.close(); await rm(directory, { recursive: true, force: true }); });

test('inline actions preserve active state and disabled capability gates', async () => {
  let count = 0;
  await mount('module', { label: 'Vocabulary', title: 'Words', count: '2', locale: 'en', actions: [
    { key: 'focused', label: 'By question type', active: true, onClick: () => count++ },
    { key: 'add', label: 'Add word', disabled: true, onClick: () => count += 100 },
  ] });
  assert.equal(app.querySelector('h2').textContent, 'Words');
  assert.equal(app.querySelector('[role="group"]').getAttribute('aria-label'), 'Vocabulary · Actions');
  assert.equal(button('By question type').getAttribute('aria-pressed'), 'true');
  assert.equal(button('Add word').disabled, true);
  await click(button('Add word'));
  assert.equal(count, 0);
  await click(button('By question type'));
  assert.equal(count, 1);
});

test('retired shortcuts remain hidden while heading and child controls render', async () => {
  const { createElement } = await import('react');
  for (const props of [{ primary: { label: 'Practice', onClick() {} } }, { shortcuts: true }]) {
    await mount('module', { label: 'Vocabulary', title: 'Words', ...props,
      actions: [{ key: 'legacy', label: 'Legacy action', onClick() {} }],
      children: createElement('button', null, 'Child action') });
    assert.equal(app.querySelector('.module-practice-mascot'), null);
    assert.equal(app.querySelector('dialog'), null);
    assert.equal(button('Legacy action'), undefined);
    assert.ok(button('Child action'));
    await ui.act(async () => root.unmount()); root = undefined;
  }
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
