import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
const dir = await mkdtemp(join(process.cwd(), '.local/daily-sync-'));
const output = join(dir, 'home.mjs');
await build({ stdin: { contents: "export { HomeDashboard } from './src/features/home/HomeDashboard';", resolveDir: process.cwd(), loader: 'tsx' }, outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' } });
const { HomeDashboard } = await import(pathToFileURL(output));
const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const dom = new JSDOM('<div id="root"></div>');
for (const key of ['window', 'document', 'HTMLElement']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
after(async () => { dom.window.close(); await rm(dir, { recursive: true, force: true }); });
test('pending daily draft opens confirmation and due review precedes independent practice', async () => {
  const actions = [];
  const root = createRoot(document.getElementById('root'));
  const props = { locale: 'zh-CN', dueItems: [{ id: 'due' }], plan: { profile: { level: 'N1', examDate: '2026-12-06' }, tasks: [] }, todayPractices: [], latestDraft: { id: 'pending', title: '2026-10-05 每日薄弱点强化练习', status: 'draft' }, onOpenDraft: id => actions.push(id), onNavigate: view => actions.push(view), onStartDailyPractice: id => actions.push(id), onCreateDailyPractice() {}, onStartMock() {} };
  try {
    await act(async () => root.render(createElement(HomeDashboard, props)));
    assert.equal(document.querySelector('.learning-status').textContent, '待确认');
    assert.match(document.querySelector('.home-practice-title').textContent, /弱点强化/);
    assert.ok(document.querySelector('.learning-today-grid .learning-due'));
    assert.ok(document.querySelector('.learning-today-grid').compareDocumentPosition(document.querySelector('.learning-independent')) & 4);
    await act(async () => document.querySelector('.primary-daily-action').click());
    await act(async () => document.querySelector('.learning-due').click());
    assert.deepEqual(actions, ['pending', 'memory-review']);
    await act(async () => root.render(createElement(HomeDashboard, { ...props, todayPractices: [{ id: 'published', title: '正式强化练习', questionCount: 2, minutes: 5, questions: [{ id: 'q1' }, { id: 'q2' }] }], dailyAnswers: { q1: { selected: 'A' } } })));
    assert.equal(document.querySelector('.learning-status').textContent, '进行中');
    await act(async () => document.querySelector('.primary-daily-action').click());
    assert.equal(actions.at(-1), 'published');
  } finally { await act(async () => root.unmount()); }
});
