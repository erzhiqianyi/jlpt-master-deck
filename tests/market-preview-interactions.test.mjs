import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Exercise real React handlers in a DOM; pixel/layout QA requires a real browser.
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/#/market/share-a' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'Node']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.requestAnimationFrame = callback => { callback(); return 1; };
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
await mkdir('.local', { recursive: true });
const directory = await mkdtemp(resolve('.local', 'market-tests-'));
const output = resolve(directory, 'market.mjs');
await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import { useState } from 'react';
import { MarketPanel } from './src/features/market/MarketPanel';
import { AuthoringNavigationProvider } from './src/components/AuthoringNavigation';
import { PageChromeProvider, PageHeaderActions } from './src/components/PageChrome';
export function MarketPanelHarness(props) {
  const [location, setLocation] = useState(null);
  return <PageChromeProvider><AuthoringNavigationProvider onChange={setLocation}><header><button type="button" onClick={() => location ? location.close() : window.location.hash = '#/market'}>Header back</button><PageHeaderActions /></header><MarketPanel {...props} /></AuthoringNavigationProvider></PageChromeProvider>;
}
export { ConfirmationProvider } from './src/components/ConfirmationProvider';
export { translations } from './src/i18n/translations';
` }, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, outfile: output });
const { MarketPanelHarness, ConfirmationProvider, translations } = await import(pathToFileURL(output));
const { createElement: h, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('root'));
const labels = translations.en;
const settings = { locale: 'en', showReviewRuby: false, showExplanationRuby: false, fontSize: 'standard', feedbackMode: 'immediate', questionTypeTips: {}, customQuestionTypeTips: [] };
const practice = { format: 'jlpt-share', version: 1, kind: 'practice', title: 'Shared practice A', description: 'Two trial questions', questions: [
  { prompt: 'First question', choices: ['A', 'B'], answer: 'A', correctReason: 'First explanation' },
  { prompt: 'Second question', choices: ['A', 'B'], answerIndex: 1, explanation: 'Second explanation' },
] };
const share = { id: 'share-a', title: practice.title, kind: 'practice', count: 2, description: practice.description, mine: false };
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
let calls = [], fetchHandler, mount = 0;
globalThis.fetch = async (path, options = {}) => { const call = { path: String(path), method: options.method ?? 'GET', body: options.body }; calls.push(call); return fetchHandler(call); };
const defaults = { token: 'test-token', initialShareId: 'share-a', labels, settings, locale: 'en', onAdded: async () => {} };
async function render(props = {}, fresh = false) {
  if (fresh) mount++;
  await act(async () => root.render(h(ConfirmationProvider, null, h(MarketPanelHarness, { ...defaults, ...props, key: mount }))));
}
async function click(element) { assert.ok(element, 'expected control exists'); await act(async () => element.click()); }
const button = text => [...document.querySelectorAll('button')].find(element => element.textContent.trim() === text);
const choice = index => document.querySelectorAll('button.cute-choice')[index];
function baseFetch(call) {
  if (call.path === '/api/market') return response({ shares: [share] });
  if (call.path === '/api/market/share-a') return response({ package: practice });
  throw new Error(`Unexpected request: ${call.method} ${call.path}`);
}
after(async () => { await act(async () => root.unmount()); dom.window.close(); await rm(directory, { recursive: true, force: true }); });

test('trial completes into results, returns with answers, restarts and exits without persisting records', async () => {
  calls = []; fetchHandler = baseFetch;
  await render({}, true);
  assert.equal(document.querySelector('.practice-session'), null);
  assert.match(document.body.textContent, /not saved to study history or progress/);
  await click(button('Try without saving'));
  assert.equal(document.querySelector('.discovery-heading'), null);
  assert.equal(button('View trial results'), undefined);
  await click(choice(1));
  await click(button(labels.next));
  assert.match(document.querySelector('.practice-session').textContent, /Second question/);
  await click(choice(1));
  await click(button('View trial results'));
  assert.ok(document.querySelector('.practice-review-results'));
  assert.match(document.querySelector('.practice-result-score').textContent, /50%/);
  await click(button('Back to practice'));
  assert.equal(choice(1).disabled, true, 'returning to the trial keeps the answers');
  await click(button('View trial results'));
  await click(button('Restart practice'));
  assert.match(document.querySelector('.practice-session').textContent, /First question/);
  assert.equal(choice(0).disabled, false);
  assert.equal(button('View trial results'), undefined);
  await click(button('Back to share details'));
  assert.ok(button('Try without saving'));
  await click(button('Try without saving'));
  assert.equal(choice(0).disabled, false, 're-entering a discarded trial starts cleanly');
  assert.equal(calls.filter(call => call.method !== 'GET').length, 0, 'trial answers/results never write a practice record');
});

test('repeat import events share one operation and success stays added even when refresh fails', async () => {
  calls = []; let finishImport;
  fetchHandler = call => call.path === '/api/market/import' ? new Promise(resolve => { finishImport = resolve; }) : baseFetch(call);
  await render({ onAdded: async () => { throw new Error('refresh failed'); } }, true);
  const add = button('Add to my content');
  await act(async () => { add.click(); add.click(); });
  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(button('Adding…').disabled, true);
  await act(async () => finishImport(response({ id: 'personal-copy' }, 201)));
  assert.equal(button('Added').disabled, true);
  assert.match(document.querySelector('[role="alert"]').textContent, /Added, but the list could not refresh/);
  await click(button('Added'));
  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
  await render({ initialShareId: undefined });
  assert.equal(document.querySelector('.market-row-add'), null, 'list rows have no import clutter');
  await render({ initialShareId: 'share-a' });
  assert.equal(button('Added').disabled, true, 'the detail retains the successful import status');
});

test('failed import remains retryable without marking the item as added', async () => {
  calls = []; let imports = 0;
  fetchHandler = call => call.path === '/api/market/import' ? (++imports === 1 ? response({ error: 'Temporary error' }, 503) : response({ alreadyImported: true })) : baseFetch(call);
  await render({}, true);
  await click(button('Add to my content'));
  assert.match(document.querySelector('[role="alert"]').textContent, /Action failed/);
  assert.equal(button('Add to my content').disabled, false);
  await click(button('Add to my content'));
  assert.equal(imports, 2);
  assert.equal(button('Added').disabled, true);
  assert.match(document.querySelector('[role="status"]').textContent, /already in your library/);
});

test('a slow previous share cannot replace the newer preview or carry answers into it', async () => {
  calls = []; let finishA;
  const second = { ...practice, title: 'Shared practice B', questions: [{ prompt: 'Only B question', choices: ['C', 'D'], answer: 'C' }] };
  fetchHandler = call => {
    if (call.path === '/api/market/share-a') return new Promise(resolve => { finishA = resolve; });
    if (call.path === '/api/market/share-b') return response({ package: second });
    return baseFetch(call);
  };
  await render({}, true);
  assert.equal(document.querySelector('.learning-list-frame'), null);
  await render({ initialShareId: 'share-b' });
  await act(async () => finishA(response({ package: practice })));
  assert.equal(document.querySelector('.market-preview h2').textContent, second.title);
  await click(button('Try without saving'));
  assert.match(document.querySelector('.practice-session').textContent, /Only B question/);
  assert.equal(button('View trial results'), undefined);
});

test('failed detail loading offers a real retry and empty practice cannot start', async () => {
  calls = []; let attempt = 0;
  fetchHandler = call => call.path === '/api/market/share-a' ? (++attempt === 1 ? response({ error: 'Unavailable' }, 503) : response({ package: { ...practice, questions: [] } })) : baseFetch(call);
  await render({}, true);
  assert.match(document.querySelector('[role="alert"]').textContent, /Action failed/);
  assert.equal(button('Back to shared content'), undefined, 'detail relies on the single shared header Back');
  assert.ok(button('Header back'));
  await click(button('Retry'));
  assert.equal(attempt, 2);
  assert.equal(button('Try without saving').disabled, true);
  assert.match(document.body.textContent, /No questions are available/);
});

test('own shares have no import button and withdrawing requires explicit confirmation', async () => {
  calls = [];
  fetchHandler = call => call.method === 'DELETE' ? response({ ok: true }) : call.path === '/api/market' ? response({ shares: [{ ...share, mine: true }] }) : baseFetch(call);
  await render({ initialShareId: undefined }, true);
  assert.equal(document.querySelector('.market-row-add'), null);
  await render({ initialShareId: 'share-a' });
  await click(button('Manage'));
  await click(document.querySelector('.market-management-dialog > button'));
  assert.equal(calls.some(call => call.method === 'DELETE'), false);
  assert.match(document.querySelector('.app-confirmation').textContent, /Others will no longer see/);
  await click([...document.querySelectorAll('.app-confirmation button')].find(element => !element.classList.contains('is-danger')));
  assert.equal(calls.some(call => call.method === 'DELETE'), false);
  await click(button('Manage'));
  await click(document.querySelector('.market-management-dialog > button'));
  await click(document.querySelector('.app-confirmation .is-danger'));
  assert.equal(calls.filter(call => call.method === 'DELETE').length, 1);
});


test('detail shows a real sample and expandable introduction while header Back returns from local trial', async () => {
  calls = []; fetchHandler = baseFetch;
  await render({}, true);
  assert.equal(document.querySelector('.market-question-prompt').textContent, 'First question');
  assert.equal(document.querySelectorAll('.market-question-preview li').length, 2);
  assert.equal(button('Expand introduction').getAttribute('aria-expanded'), 'false');
  await click(button('Expand introduction'));
  assert.equal(button('Collapse introduction').getAttribute('aria-expanded'), 'true');
  await click(button('Try without saving'));
  await click(choice(0));
  await click(button('Header back'));
  assert.ok(button('Try without saving'));
  assert.equal(document.querySelector('.practice-session'), null);
  assert.equal(calls.filter(call => call.method !== 'GET').length, 0);
});

test('discovery list contains title and type/count, with optional tools in its shared header sheet', async () => {
  calls = []; fetchHandler = baseFetch;
  await render({ initialShareId: undefined }, true);
  assert.equal(document.querySelector('.discovery-panel h1'), null);
  assert.equal(document.querySelector('.market-row-withdraw'), null);
  assert.equal(document.querySelector('.market-row-add'), null);
  assert.match(document.querySelector('.standard-list-description').textContent, /topic practice · 2 questions/);
  assert.doesNotMatch(document.querySelector('.learning-list').textContent, /Two trial questions/);
  await click(document.querySelector('header .page-header-action'));
  assert.equal(document.querySelector('.list-controls-dialog').open, true);
  const scope = document.querySelector('select[aria-label="Share scope"]');
  await act(async () => { scope.value = 'mine'; scope.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.match(document.querySelector('.list-applied-summary').textContent, /My shares/);
  await click(button('Reset'));
  assert.equal(document.querySelector('.list-applied-summary'), null);
});
