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
    await act(async () => root.render(createElement(HomeDashboard, { ...props, todayPractices: [
      { id: 'new', title: '新一份练习', questionCount: 1, minutes: 5, questions: [{ id: 'new-q' }] },
      { id: 'old', title: '早一份练习', questionCount: 2, minutes: 10, questions: [{ id: 'old-q1' }, { id: 'old-q2' }] },
    ], dailyAnswers: { 'new-q': { selected: 'A' }, 'old-q1': { selected: 'B' } } })));
    assert.equal(document.querySelector('.primary-daily-action'), null);
    const choices = [...document.querySelectorAll('.home-daily-practice-list button')];
    assert.equal(choices.length, 2);
    assert.match(choices[0].textContent, /1\/1.*已完成.*查看练习/);
    assert.match(choices[1].textContent, /1\/2.*进行中.*继续练习/);
    await act(async () => choices[1].click());
    assert.equal(actions.at(-1), 'old');
    await act(async () => choices[0].click());
    assert.equal(actions.at(-1), 'new');

  } finally { await act(async () => root.unmount()); }
});

test('desktop context deduplicates answer snapshots, includes hard and forgotten cards, and resumes only unfinished practice', async () => {
  const root = createRoot(document.getElementById('root'));
  const now = new Date().toISOString();
  const actions = [];
  const answer = { questionId: 'q1', itemId: 'grammar', correct: false, answeredAt: now };
  const activeAttempt = { id: 'active', title: '继续专项', view: 'mixed', questionIds: ['q1', 'q2'], answers: [answer] };
  const props = { locale: 'zh-CN', dueItems: [], plan: { profile: {} }, todayPractices: [], onOpenDraft() {}, onNavigate: (...args) => actions.push(args), onStartDailyPractice() {}, onCreateDailyPractice() {}, onStartMock() {},
    dailyAnswers: { q1: answer }, attempts: [activeAttempt], activeAttempt, onResumeAttempt: attempt => actions.push(attempt.id),
    items: [{ id: 'grammar', original: 'に至るまで', deck: 'grammar_expression' }, { id: 'word', original: '促す', deck: 'n1_vocab' }],
    cardReviews: [{ eventId: 'hard', itemId: 'word', rating: 'hard', reviewedAt: now }, { eventId: 'forgot', itemId: 'word', rating: 'forgot', reviewedAt: now }, { eventId: 'easy', itemId: 'word', rating: 'easy', reviewedAt: now }, { eventId: 'old', itemId: 'grammar', rating: 'forgot', reviewedAt: '2000-01-01T00:00:00Z' }] };
  try {
    await act(async () => root.render(createElement(HomeDashboard, props)));
    const totals = [...document.querySelectorAll('.home-activity-totals strong')].map(el => el.textContent);
    assert.deepEqual(totals, ['1/ 7', '1', '3']);
    const focus = [...document.querySelectorAll('.home-focus-list button')];
    assert.match(focus[0].textContent, /促す.*困难 \/ 忘记 2/);
    assert.match(focus[1].textContent, /に至るまで.*答错 1/);
    await act(async () => focus[1].click());
    assert.deepEqual(actions.at(-1), ['grammar', 'words', 'grammar']);
    await act(async () => document.querySelector('.home-resume-card button').click());
    assert.equal(actions.at(-1), 'active');
    await act(async () => root.render(createElement(HomeDashboard, { ...props, activeAttempt: { ...activeAttempt, completedAt: now } })));
    assert.equal(document.querySelector('.home-resume-card'), null);
  } finally { await act(async () => root.unmount()); }
});

test('pending topic and older daily drafts remain actionable beside a prepared daily practice', async () => {
 const root = createRoot(document.getElementById('root')); const opened=[];
 try {
  await act(async()=>root.render(createElement(HomeDashboard,{locale:'zh-CN',dueItems:[],plan:{profile:{}},todayPractices:[{id:'ready',title:'已准备练习',questions:[{id:'q'}]}],pendingDrafts:[{id:'older',title:'昨天的强化',status:'needs_revision',reference:'DR-1'},{id:'topic',title:'语法专项',status:'draft',reference:'DR-2'}],onOpenDraft:id=>opened.push(id),onNavigate:view=>opened.push(view),onStartDailyPractice(){},onCreateDailyPractice(){},onStartMock(){}})));
  const region=document.querySelector('.home-pending-practices'); assert.match(region.textContent,/待确认练习 · 2/);
  await act(async()=>region.querySelectorAll('li button')[1].click()); assert.equal(opened.at(-1),'topic');
  await act(async()=>region.querySelector('.home-context-link').click()); assert.equal(opened.at(-1),'drafts');
 } finally {await act(async()=>root.unmount());}
});
