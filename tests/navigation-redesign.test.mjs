import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/#/mixed/tips/dialogue' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Event', 'MouseEvent', 'Node']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.requestAnimationFrame = (callback) => { callback(0); return 0; };
window.HTMLElement.prototype.scrollIntoView = () => {};
globalThis.IntersectionObserver = class { observe() {} disconnect() {} };
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
await mkdir('.local', { recursive: true });
const directory = await mkdtemp(resolve('.local', 'navigation-redesign-'));
const output = resolve(directory, 'components.mjs');
await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    export * from './src/domain/appNavigation';
    export { HomeDashboard } from './src/features/home/HomeDashboard';
    export { routeFromHash } from './src/domain/appRoutes';
    export * from './src/components/AuthoringNavigation';
    export { PageChromeProvider, PageHeaderActions } from './src/components/PageChrome';
    export { DialoguePracticePanel } from './src/features/practice/DialoguePracticePanel';
    export { QuestionTypeGuide } from './src/features/question-types/QuestionTypeGuide';
    export { QuestionTypeDetail } from './src/features/question-types/QuestionTypeDetail';
    export { translations } from './src/i18n/translations';
    export { officialN1QuestionTypes } from './src/data/questionTypes';
  ` },
  bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, outfile: output,
});
const {
  HomeDashboard, routeFromHash, isPrimaryNavigationRoot, contextualBackRoute, createNavigationRegistry, AuthoringNavigationProvider,
  DialoguePracticePanel, QuestionTypeGuide, QuestionTypeDetail, translations, officialN1QuestionTypes,
  PageChromeProvider, PageHeaderActions,
} = await import(pathToFileURL(output));
const { createElement: h, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('root'));
let location = null;
const onChange = (next) => { location = next; };
const noop = () => {};
async function render(Component, props = {}) {
  await act(async () => root.render(h(PageChromeProvider, null, h(AuthoringNavigationProvider, { onChange }, h(PageHeaderActions), h(Component, props)))));
}
async function click(element) {
  assert.ok(element, 'control exists');
  await act(async () => element.click());
}
async function fill(element, value) {
  assert.ok(element, 'input exists');
  const prototype = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const button = (label) => [...document.querySelectorAll('button')].find((element) => element.textContent.trim() === label || element.getAttribute('aria-label') === label);
after(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  await rm(directory, { recursive: true, force: true });
});

test('phone tabs are reserved for exactly four roots and never a local child screen', () => {
  const roots = [
    { view: 'home', page: 'questions' },
    { view: 'market', page: 'questions' }, { view: 'history', page: 'questions' }, { view: 'study', page: 'questions' },
  ];
  for (const route of roots) {
    assert.equal(isPrimaryNavigationRoot(route), true, JSON.stringify(route));
    assert.equal(isPrimaryNavigationRoot(route, true), false, 'a selected record or local form is a secondary screen');
    assert.equal(isPrimaryNavigationRoot({ ...route, itemId: 'detail' }), false);
    assert.equal(contextualBackRoute(route), null);
  }
  for (const view of ['plan', 'settings', 'profile', 'about', 'mcp', 'capture', 'captures', 'drafts', 'mistakes', 'memory', 'data', 'insights', 'question-types', 'mock-exams', 'news-cycle', 'daily-practice']) {
    assert.equal(isPrimaryNavigationRoot({ view, page: 'questions' }), false, view);
  }
  for (const view of ['vocabulary', 'grammar', 'reading', 'listening', 'mixed']) {
    for (const page of ['words', 'wordbooks', 'questions', 'review', 'bank', 'samples', 'mock']) {
      assert.equal(isPrimaryNavigationRoot({ view, page }), false, `${view}/${page}`);
    }
  }
});

test('one semantic Back hierarchy covers detail, list, form, replay and nested exam routes', () => {
  const cases = [
    [{ view: 'market', page: 'questions', itemId: 'share' }, { view: 'market', page: 'questions' }],
    [{ view: 'history', page: 'questions', itemId: 'history' }, { view: 'history', page: 'questions' }],
    [{ view: 'history', page: 'questions', itemId: 'today' }, { view: 'history', page: 'questions' }],
    [{ view: 'settings', page: 'questions', itemId: 'display' }, { view: 'settings', page: 'questions' }],
    [{ view: 'settings', page: 'questions' }, { view: 'home', page: 'questions' }],
    [{ view: 'plan', page: 'questions' }, { view: 'home', page: 'questions' }],
    [{ view: 'mixed', page: 'tips', itemId: 'opinion/topic' }, { view: 'mixed', page: 'tips', itemId: 'opinion' }],
    [{ view: 'mixed', page: 'tips', itemId: 'dialogue' }, { view: 'home', page: 'questions' }],
    [{ view: 'mixed', page: 'questions' }, { view: 'home', page: 'questions' }],
    [{ view: 'mixed', page: 'review' }, { view: 'mixed', page: 'questions' }],
    [{ view: 'mixed', page: 'review', itemId: 'replay:old' }, { view: 'history', page: 'questions', itemId: 'history' }],
    [{ view: 'vocabulary', page: 'words', itemId: 'word' }, { view: 'vocabulary', page: 'words' }],
    [{ view: 'grammar', page: 'wordbooks' }, { view: 'grammar', page: 'words' }],
    [{ view: 'grammar', page: 'review' }, { view: 'grammar', page: 'questions' }],
    [{ view: 'vocabulary', page: 'review' }, { view: 'vocabulary', page: 'questions' }],
    [{ view: 'reading', page: 'review' }, { view: 'reading', page: 'words' }],
    [{ view: 'listening', page: 'words' }, { view: 'study', page: 'questions' }],
    [{ view: 'question-types', page: 'questions', itemId: 'type' }, { view: 'question-types', page: 'questions' }],
    [{ view: 'question-types', page: 'questions' }, { view: 'study', page: 'questions' }],
    [{ view: 'capture', page: 'questions' }, { view: 'captures', page: 'questions' }],
    [{ view: 'drafts', page: 'questions' }, { view: 'history', page: 'questions' }],
    [{ view: 'mock-exams', page: 'questions', itemId: 'week:2026-W40:2026-10-04' }, { view: 'mock-exams', page: 'questions', itemId: 'week:2026-W40' }],
    [{ view: 'daily-practice', page: 'review', itemId: 'DP-42' }, { view: 'daily-practice', page: 'questions', itemId: 'DP-42' }],
  ];
  for (const [route, expected] of cases) assert.deepEqual(contextualBackRoute(route), expected, JSON.stringify(route));
});

test('daily Back distinguishes Today tasks from topic packs and review returns to the same set', () => {
  const route = { view: 'daily-practice', page: 'questions', itemId: 'DP-42' };
  assert.deepEqual(contextualBackRoute(route), { view: 'home', page: 'questions' });
  assert.deepEqual(contextualBackRoute(route, { dailyPracticeIsTopic: true }), { view: 'mixed', page: 'tips', itemId: 'topics' });
  for (const dailyPracticeIsTopic of [false, true]) assert.deepEqual(contextualBackRoute({ ...route, page: 'review' }, { dailyPracticeIsTopic }), route);
});

test('navigation registry cleanup belongs to its owner and restores underlying navigation', () => {
  let current;
  const publish = createNavigationRegistry((value) => { current = value; });
  const parent = Symbol('parent'), child = Symbol('child'), unrelated = Symbol('unrelated');
  publish(parent, { label: 'Detail', close: noop });
  publish(child, { label: 'Roleplay', close: noop, priority: 1 });
  publish(unrelated, null);
  assert.equal(current.label, 'Roleplay');
  publish(parent, { label: 'Updated detail', close: noop });
  assert.equal(current.label, 'Roleplay', 'lower priority updates cannot steal a nested screen');
  publish(child, null);
  assert.equal(current.label, 'Updated detail');
  publish(child, null);
  assert.equal(current.label, 'Updated detail', 'repeated child cleanup is harmless');
  publish(parent, null);
  assert.equal(current, null);
});

test('dialogue header Back exits roleplay, then selected dialogue, before leaving its list', async () => {
  await render(DialoguePracticePanel);
  assert.equal(location, null);
  await click(document.querySelector('.standard-list-open, .list-item-open'));
  const detailTitle = location.label;
  assert.equal(location.kind, 'detail');
  await click(button('开始模拟练习'));
  assert.equal(location.label, '分角色模拟对话');
  assert.equal(location.kind, 'practice');
  await act(async () => location.close());
  assert.equal(location.label, detailTitle);
  assert.equal(document.querySelector('.dialogue-chat'), null);
  await act(async () => location.close());
  assert.equal(location, null);
  assert.ok(document.querySelector('.standard-list-open, .list-item-open'));
  assert.equal(window.location.hash, '#/mixed/tips/dialogue');
});

test('guide category is visible with tools closed and reset restores the initial category and query', async () => {
  const labels = translations.en;
  await render(QuestionTypeGuide, { labels, locale: 'en', customTips: {}, customTipEntries: [], onOpen: noop, onCreateCustomTip: () => 'custom' });
  const summary = () => document.querySelector('.list-applied-summary').textContent;
  assert.match(summary(), new RegExp(`Category: ${labels.questionTypeSection_vocabulary}`));
  assert.equal(document.querySelector('select'), null);
  await click(button('Search and filters'));
  await fill(document.querySelector('input[type="search"]'), 'no matching guide');
  await act(async () => {
    const category = document.querySelector('select');
    category.value = 'listening';
    category.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click(button('Close'));
  assert.equal(document.querySelector('dialog').open, false);
  assert.match(summary(), new RegExp(`Category: ${labels.questionTypeSection_listening}`));
  assert.match(summary(), /no matching guide/);
  await click(button('Reset'));
  assert.match(summary(), new RegExp(`Category: ${labels.questionTypeSection_vocabulary}`));
  assert.doesNotMatch(summary(), /no matching guide/);
  await click(button('Search and filters'));
  assert.equal(document.querySelector('select').value, 'vocabulary');
  assert.equal(document.querySelector('input[type="search"]').value, '');
  await click(button('Close'));
});

test('question-type add and edit register a local form and Back does not save or navigate', async () => {
  const labels = translations.en;
  let saved = 0;
  await render(QuestionTypeGuide, { labels, locale: 'en', customTips: {}, customTipEntries: [], onOpen: () => saved++, onCreateCustomTip: () => { saved++; return 'custom'; } });
  assert.equal(button(labels.questionTypeAddCustom), undefined, 'Add is inside the closed contextual tools');
  assert.equal(document.querySelector('select'), null, 'category controls are initially collapsed');
  await click(button('Search and filters'));
  await click(button(labels.questionTypeAddCustom));
  assert.equal(location.kind, 'form');
  assert.equal(location.label, labels.questionTypeAddCustom);
  assert.equal(document.querySelector('dialog'), null, 'opening a form unmounts the list tools');
  assert.equal(button('Search and filters'), undefined, 'form does not inherit a list action');
  assert.equal(document.querySelectorAll('.page-header-actions button').length, 1);
  assert.equal(document.querySelector('.page-header-actions button').getAttribute('aria-label'), labels.questionTypeSaveTip);
  await fill(document.querySelector('textarea'), 'Keep my unsaved tip');
  await act(async () => location.close());
  assert.equal(location, null);
  assert.equal(document.querySelector('textarea'), null);
  assert.equal(saved, 0);
  await click(button('Search and filters'));
  await click(button(labels.questionTypeAddCustom));
  assert.equal(document.querySelector('textarea').value, 'Keep my unsaved tip');
  await act(async () => location.close());
  await render(QuestionTypeDetail, { id: officialN1QuestionTypes[0].id, labels, locale: 'en', onBack: () => saved++, onUpdateTip: () => saved++, onUpdateCustomTip: noop, onDeleteCustomTip: noop });
  await click(button(labels.questionTypeEditTip));
  assert.equal(location.label, labels.questionTypeEditTip);
  assert.equal(button('Search and filters'), undefined);
  assert.equal(document.querySelectorAll('.page-header-actions button').length, 1);
  assert.equal(document.querySelector('.page-header-actions button').getAttribute('aria-label'), labels.questionTypeSaveTip);
  await fill(document.querySelector('textarea'), 'Keep my edited explanation');
  await act(async () => location.close());
  assert.equal(location.kind, 'detail');
  assert.equal(document.querySelector('textarea'), null);
  assert.equal(saved, 0);
  assert.equal([...document.querySelectorAll('button')].some((element) => element.textContent.includes('←')), false, 'shared header owns Back');
  await click(button(labels.questionTypeEditTip));
  assert.equal(document.querySelector('textarea').value, 'Keep my edited explanation');
  await click(button(labels.questionTypeSaveTip));
  assert.equal(saved, 1);
  assert.equal(location.kind, 'detail');
});

test('App uses the same Back handler for both headers and root-only bottom navigation', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.equal((app.match(/onBack=\{handlePageBack\}/g) ?? []).length, 2);
  assert.match(app, /const showMobileBottomNavigation = isPrimaryRoot;/);
  assert.doesNotMatch(app, /const showMobileBottomNavigation = !isImmersiveRoute/);
  assert.doesNotMatch(app, /parentCrumbRoute/);
});


test('legacy practice home converges on Learn while topic routes stay deep-linkable', () => {
  for (const hash of ['#/mixed', '#/mixed/tips']) assert.deepEqual(routeFromHash(hash), {view: 'home', page: 'questions'});
  assert.deepEqual(routeFromHash('#/mixed/tips/topics'), {view: 'mixed', page: 'tips', itemId: 'topics'});
});

test('learning dashboard uses saved answers and preserves every practice destination and countdown', async () => {
  const opened = [];
  const questions = Array.from({length: 20}, (_, i) => ({id: `q${i}`}));
  const props = {
    locale: 'zh-CN', plan: {profile: {examDate: '2099-12-06', level: 'N1'}, tasks: []}, dueItems: [{id: 'due'}],
    todayPractices: [{id: 'today-pack', title: '词汇与语法', minutes: 15, questions}],
    onNavigate: (...route) => opened.push(route), onStartDailyPractice: id => opened.push(['daily', id]),
    onStartMock: () => opened.push(['mock']), topicCount: 12, mixedQuestionCount: 180, mockExamCount: 4,
  };
  await render(HomeDashboard, props);
  assert.ok(button('开始练习'));
  assert.equal(document.querySelector('progress').value, 0);
  assert.match(document.body.textContent, /JLPT 考试倒计时/);
  await render(HomeDashboard, {...props, dailyAnswers: Object.fromEntries(questions.slice(0,8).map(q => [q.id, {selected: 'A'}]))});
  assert.equal(document.querySelector('progress').value, 8);
  assert.match(document.body.textContent, /进行中/);
  await click(button('继续练习'));
  await click([...document.querySelectorAll('button')].find(b => b.textContent.includes('专项练习')));
  await click([...document.querySelectorAll('button')].find(b => b.textContent.includes('综合练习')));
  await click([...document.querySelectorAll('button')].find(b => b.textContent.includes('模拟考试')));
  await click([...document.querySelectorAll('button')].find(b => b.textContent.includes('到期复习')));
  assert.deepEqual(opened, [['daily','today-pack'], ['mixed','tips','topics'], ['mixed','questions'], ['mock'], ['memory-review']]);
  await render(HomeDashboard, {...props, dailyAnswers: Object.fromEntries(questions.map(q => [q.id, {selected: 'A'}]))});
  assert.ok(button('查看练习'));
  assert.equal(document.querySelector('progress').value, 20);
});
