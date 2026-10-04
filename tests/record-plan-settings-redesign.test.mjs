import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Event', 'MouseEvent', 'Node']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.HTMLElement.prototype.scrollIntoView = () => {};
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
await mkdir('.local', { recursive: true });
const directory = await mkdtemp(resolve('.local', 'record-plan-settings-tests-'));
const outfile = resolve(directory, 'components.mjs');
await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
export { CapturePanel } from './src/features/capture/CapturePanel';
export { PageChromeProvider, PageHeaderActions } from './src/components/PageChrome';
export { HistoryPanel } from './src/features/history/HistoryPanel';
export { SettingsView } from './src/features/settings/SettingsView';
export { PlanSetupForm } from './src/features/plan/PlanSetupForm';
export { StudyPlanPanel } from './src/features/plan/StudyPlanPanel';
export { DraftsPanel } from './src/features/drafts/DraftsPanel';
export { AuthoringNavigationProvider } from './src/components/AuthoringNavigation';
export { ConfirmationProvider } from './src/components/ConfirmationProvider';
export { createDefaultStudyPlanProfile, localDateString } from './src/domain/studyPlan';
export { translations } from './src/i18n/translations';
` }, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, define: { 'import.meta.env.DEV': 'false' }, outfile });
const { CapturePanel, PageChromeProvider, PageHeaderActions, HistoryPanel, SettingsView, StudyPlanPanel, PlanSetupForm, DraftsPanel, AuthoringNavigationProvider, ConfirmationProvider, createDefaultStudyPlanProfile, localDateString, translations } = await import(pathToFileURL(outfile));
const { createElement: h, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('root'));
const labels = translations['zh-CN'];
let navigation = null, key = 0;
const noop = () => {};
async function render(Component, props) { navigation = null; await act(async () => root.render(h(ConfirmationProvider, null, h(AuthoringNavigationProvider, { onChange: value => navigation = value }, h(Component, { key: ++key, labels, ...props }))))); }
async function click(element) { assert.ok(element, 'expected control exists'); await act(async () => element.click()); }
const button = (text) => [...document.querySelectorAll('button')].find(element => element.textContent.trim() === text);
async function type(element, text) { assert.ok(element); await act(async () => { const setter = Object.getOwnPropertyDescriptor(element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set; setter.call(element, text); element.dispatchEvent(new Event('input', { bubbles: true })); }); }
after(async () => { await act(async () => root.unmount()); dom.window.close(); await rm(directory, { recursive: true, force: true }); });

test('records lead with actual today result and count only completed history and distinct mistake entries', async () => {
  const now = new Date().toISOString();
  const answer = (questionId, itemId, correct) => ({ questionId, itemId, correct, selected: 'answer', answeredAt: now, elapsedMs: 100 });
  const attempts = [
    { id: 'one', view: 'grammar', questionIds: ['q1', 'q2'], startedAt: now, completedAt: now, answers: [answer('q1', 'i1', false), answer('q2', 'i2', true)] },
    { id: 'two', view: 'grammar', questionIds: ['q1'], startedAt: now, completedAt: now, answers: [answer('q1', 'i1', false)] },
    { id: 'unfinished', view: 'grammar', questionIds: ['q3'], startedAt: now, answers: [answer('q3', 'i3', false)] },
  ];
  await render(HistoryPanel, { locale: 'zh-CN', captures: [], attempts, questions: [], embedded: true, mode: 'practice', recordSection: 'home', draftCount: 4, summaryToken: 'unused-home-token', onCaptureStatus: async () => {} });
  assert.equal(document.querySelector('.history-panel').firstElementChild.className, 'record-home');
  assert.equal(document.querySelector('.daily-summary-panel'), null);
  assert.deepEqual([...document.querySelectorAll('.record-home-today .record-home-stats dd')].map(el => el.textContent), ['2', '3', '33%']);
  assert.deepEqual([...document.querySelectorAll('.record-dashboard-total dd')].map(el => el.textContent), ['3', '33%', '1 / 7']);
  assert.match(document.querySelector('.record-module-metrics').textContent, /3 次作答 · 33%/);
  assert.equal(document.querySelectorAll('.record-dashboard-recent li').length, 2);
  assert.match(document.querySelector('.record-home-review').textContent, /2 次练习/);
  assert.match(document.querySelector('.record-home-review').textContent, /1 个知识点/);
  assert.match(document.querySelector('a[href="#/drafts"]').textContent, /4 条记录/);
});

test('empty statistics preserve metrics, seven calendar days and the practice CTA', async () => {
  await render(HistoryPanel, { locale: 'zh-CN', captures: [], attempts: [], questions: [], embedded: true, mode: 'practice', recordSection: 'home', draftCount: 0, onCaptureStatus: async () => {} });
  const status = document.querySelector('.record-home-empty-note');
  assert.ok(status);
  assert.match(status.textContent, /今天还没有完成练习/);
  assert.equal(status.querySelector('a').getAttribute('href'), '#/mixed/tips');
  assert.match(status.querySelector('a').textContent, /去练习/);
  assert.ok(document.querySelector('.record-home-stats'));
  assert.equal(document.querySelectorAll('.record-week-day').length, 7);
  assert.deepEqual([...document.querySelectorAll('.record-week-day strong')].map(node => node.textContent), Array(7).fill('0'));
  assert.equal(document.querySelectorAll('.record-home-today button').length, 1);
  const rows = document.querySelector('.record-home-primary-links');
  assert.equal(rows.children.length, 2);
  assert.match(rows.children[0].textContent, /练习历史0 次练习 · 0 次作答/);
  assert.match(rows.children[1].textContent, /错题集0 个知识点/);
  assert.equal(document.querySelector('.record-home .navigation-grid'), null);

});

test('settings groups preferences and account links, and global search is an explicit requested entry', async () => {
  let searches = 0;
  const settings = { locale: 'zh-CN', fontSize: 'standard', showReviewRuby: true, showExplanationRuby: true, feedbackMode: 'batch', memoryCardFrontFields: ['word'], memoryCardBackFields: ['meaning'], memoryCardWordSpacing: false, ttsProvider: 'browser' };
  await render(SettingsView, { settings, username: 'Actual user', authToken: '', onLogout: noop, onUpdateSettings: noop, onSearch: () => searches++ });
  assert.equal(document.querySelectorAll('.settings-nav-group').length, 2);
  assert.equal(document.querySelector('.settings-profile-card h3').textContent, 'Actual user');
  await click([...document.querySelectorAll('button')].find(el => el.textContent.includes('搜索所有学习内容')));
  assert.equal(searches, 1);
  assert.equal(document.querySelector('.settings-detail-card'), null);
});

test('plan date chooser remains collapsed until requested and date selection closes it', async () => {
  const profile = createDefaultStudyPlanProfile(new Date());
  await render(StudyPlanPanel, { locale: 'zh-CN', plan: { profile, tasks: [], phases: [], dailySummaries: [] }, drafts: [], captures: [], attempts: [], listeningQuestions: [], readingQuestions: [], onSaveProfile: async () => {}, onTaskStatus: async () => {} });
  const picker = document.querySelector('.plan-month-toggle');
  assert.equal(picker.getAttribute('aria-expanded'), 'false');
  assert.match(document.querySelector('.plan-day-empty').textContent, /今天没有安排/);
  await click(picker);
  assert.equal(picker.getAttribute('aria-expanded'), 'true');
  await click(document.querySelector('.plan-date'));
  assert.equal(picker.getAttribute('aria-expanded'), 'false');
});

test('profile edit is isolated, Back retains unsaved text, and failed saves remain retryable', async () => {
  let saves = 0;
  const profile = createDefaultStudyPlanProfile(new Date());
  await render(StudyPlanPanel, { locale: 'zh-CN', plan: { profile, tasks: [], phases: [], dailySummaries: [] }, drafts: [], captures: [], attempts: [], listeningQuestions: [], readingQuestions: [], onSaveProfile: async () => { saves++; throw new Error('Save failed'); }, onTaskStatus: async () => {} });
  await click(button('备考安排'));
  assert.equal(navigation.kind, 'detail');
  await click(button(labels.planEditProfile));
  assert.equal(navigation.kind, 'form');
  assert.ok(document.querySelector('.plan-single').hidden);
  const goal = document.querySelector('.plan-profile-form textarea');
  await type(goal, 'Keep this unsaved goal');
  await act(async () => navigation.close());
  assert.equal(document.querySelector('.plan-single').hidden, false);
  assert.equal(navigation.kind, 'detail');
  assert.equal(document.querySelector('.plan-arrangement-page').hidden, false);
  await click(button(labels.planEditProfile));
  assert.equal(document.querySelector('.plan-profile-form textarea').value, 'Keep this unsaved goal');
  await click(document.querySelector('.plan-profile-form button[type="submit"]'));
  assert.equal(saves, 1);
  assert.match(document.querySelector('.plan-profile-form').textContent, /Save failed/);
  assert.equal(document.querySelector('.plan-profile-form textarea').value, 'Keep this unsaved goal');
});

test('plan polling never overwrites a dirty profile, while clean and saved profiles accept server refreshes', async () => {
  const profile = { ...createDefaultStudyPlanProfile(new Date()), goal: 'Initial goal' };
  let saves = 0;
  const onSave = async () => { saves++; };
  const renderSame = async (nextProfile) => { await act(async () => root.render(h(PlanSetupForm, { key: 'polling-profile', labels, profile: nextProfile, onSave }))); };
  await renderSame(profile);
  let goal = document.querySelector('.plan-profile-form textarea');
  assert.equal(goal.value, 'Initial goal');
  await renderSame({ ...profile, goal: 'Clean server update' });
  goal = document.querySelector('.plan-profile-form textarea');
  assert.equal(goal.value, 'Clean server update');
  await type(goal, 'My unsaved goal');
  await renderSame({ ...profile, goal: 'Clean server update' });
  assert.equal(document.querySelector('.plan-profile-form textarea').value, 'My unsaved goal', 'a cloned response must not overwrite a draft');
  await renderSame({ ...profile, goal: 'Concurrent server change' });
  assert.equal(document.querySelector('.plan-profile-form textarea').value, 'My unsaved goal', 'a changed response must not overwrite a draft');
  await click(document.querySelector('.plan-profile-form button[type="submit"]'));
  assert.equal(saves, 1);
  await renderSame({ ...profile, goal: 'Persisted after save' });
  assert.equal(document.querySelector('.plan-profile-form textarea').value, 'Persisted after save');
  await type(document.querySelector('.plan-profile-form textarea'), 'Draft for old account');
  await act(async () => root.render(h(PlanSetupForm, { key: 'another-account', labels, profile: { ...profile, goal: 'New account profile' }, onSave })));
  assert.equal(document.querySelector('.plan-profile-form textarea').value, 'New account profile');
});

test('plan arrangement is a secondary view and local Back restores the agenda and selected date', async () => {
  const profile = createDefaultStudyPlanProfile(new Date());
  await render(StudyPlanPanel, { locale: 'zh-CN', plan: { profile, tasks: [], phases: [], dailySummaries: [] }, drafts: [], captures: [], attempts: [], listeningQuestions: [], readingQuestions: [], onSaveProfile: async () => {}, onTaskStatus: async () => {} });
  await click(document.querySelector('.plan-month-toggle'));
  await click(document.querySelector('.plan-date'));
  const date = document.querySelector('.plan-month-toggle').textContent;
  await click(button('备考安排'));
  assert.equal(navigation.kind, 'detail');
  assert.equal(document.querySelector('.plan-agenda-page').hidden, true);
  assert.equal(document.querySelector('.plan-arrangement-page').hidden, false);
  assert.ok(document.querySelector('.plan-arrangement-page .plan-target-summary'));
  await act(async () => navigation.close());
  assert.equal(document.querySelector('.plan-agenda-page').hidden, false);
  assert.equal(document.querySelector('.plan-arrangement-page').hidden, true);
  assert.equal(document.querySelector('.plan-month-toggle').textContent, date);
});

test('draft edit replaces preview, preserves unsaved edits on Back, and retries once per pending save', async () => {
  let saves = 0, settle;
  const draft = { id: 'draft', title: 'Real saved title', status: 'draft', content: { note: 'Original content' }, annotations: [], updated_at: new Date().toISOString() };
  await render(DraftsPanel, { drafts: [draft], activeDraft: draft, annotation: '', onAnnotationChange: noop, onCreateDailyDraft: noop, onSelectDraft: noop, onSaveAnnotation: noop, onCopyRevisionContext: noop, detailDraftId: draft.id, embedded: true, onUpdateDraft: async () => { saves++; if (saves === 1) throw new Error('Draft save failed'); await new Promise(resolve => settle = resolve); } });
  await click(button(labels.draftEdit));
  assert.ok(document.querySelector('.draft-editor-page'));
  assert.equal(document.querySelector('.gentle-draft-body'), null);
  assert.equal(navigation.kind, 'form');
  await type(document.querySelector('.draft-editor input'), 'Unsaved title');
  await act(async () => navigation.close());
  assert.equal(document.querySelector('.draft-editor-page'), null);
  await click(button(labels.draftEdit));
  assert.equal(document.querySelector('.draft-editor input').value, 'Unsaved title');
  await click(button(labels.draftEditSave));
  assert.match(document.querySelector('[role="alert"]').textContent, /Draft save failed/);
  assert.equal(document.querySelector('.draft-editor input').value, 'Unsaved title');
  const save = button(labels.draftEditSave);
  await act(async () => { save.click(); save.click(); });
  assert.equal(saves, 2);
  await act(async () => settle());
  assert.equal(document.querySelector('.draft-editor-page'), null);
});

async function renderWithHeader(Component, props) {
  navigation = null;
  await act(async () => root.render(h(ConfirmationProvider, null, h(AuthoringNavigationProvider, { onChange: value => navigation = value }, h(PageChromeProvider, null, h('header', { id: 'test-page-header' }, h(PageHeaderActions)), h(Component, { key: ++key, labels, ...props }))))));
}

test('capture uses the page-header save action and retains native form submission and failure recovery', async () => {
  let saves = 0, settle;
  await renderWithHeader(CapturePanel, { deckLabels: {}, wordbooks: [], onCreateWordbook: async () => null, onOpenHistory: noop, onSave: async () => { saves++; if (saves === 1) throw new Error('Capture failed'); await new Promise(resolve => settle = resolve); } });
  const headerSave = () => document.querySelector('#test-page-header button');
  assert.equal(headerSave().disabled, true);
  assert.equal(document.querySelector('.capture-form button[type="submit"]').hidden, true);
  await type(document.querySelector('.capture-form textarea'), 'Keep my captured text');
  assert.equal(headerSave().disabled, false);
  await click(headerSave());
  assert.equal(saves, 1);
  assert.match(document.querySelector('[role="alert"]').textContent, /Capture failed/);
  assert.equal(document.querySelector('.capture-form textarea').value, 'Keep my captured text');
  await act(async () => { headerSave().click(); headerSave().click(); });
  assert.equal(saves, 2);
  await act(async () => settle());
  assert.equal(document.querySelector('.capture-form textarea').value, '');
});

test('draft management and save actions belong to the header without duplicated body primary controls', async () => {
  let saves = 0;
  const draft = { id: 'header-draft', title: 'Saved title', status: 'draft', content: { note: 'Original content' }, annotations: [], updated_at: new Date().toISOString() };
  await renderWithHeader(DraftsPanel, { drafts: [draft], activeDraft: draft, annotation: '', onAnnotationChange: noop, onCreateDailyDraft: noop, onSelectDraft: noop, onSaveAnnotation: noop, onCopyRevisionContext: noop, detailDraftId: draft.id, embedded: true, onUpdateDraft: async () => { saves++; } });
  const management = document.querySelector('#test-page-header button[aria-label="管理草稿"]');
  assert.ok(management);
  assert.equal(document.querySelector('.gentle-draft-heading .preview-disclosure-trigger').hidden, true);
  await click(management);
  assert.equal(document.querySelector('.gentle-draft-heading dialog').open, true);
  await click(button(labels.draftEdit));
  assert.equal(document.querySelector('#test-page-header button').textContent, labels.draftEditSave);
  assert.equal(document.querySelector('.draft-editor button[type="submit"]').parentElement.hidden, true);
  assert.equal(document.querySelector('#test-page-header button[aria-label="管理草稿"]'), null);
  await type(document.querySelector('.draft-editor textarea'), '{ invalid json');
  await click(document.querySelector('#test-page-header button'));
  assert.equal(saves, 0);
  assert.match(document.querySelector('[role="alert"]').textContent, new RegExp(labels.draftEditInvalidJson));
  await type(document.querySelector('.draft-editor textarea'), '{"note":"Edited content"}');
  await click(document.querySelector('#test-page-header button'));
  assert.equal(saves, 1);
  assert.ok(document.querySelector('#test-page-header button[aria-label="管理草稿"]'));
});
