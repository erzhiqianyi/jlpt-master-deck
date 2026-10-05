import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/#/home' });
for (const key of ['window', 'document', 'localStorage', 'HTMLElement', 'HTMLDialogElement', 'HTMLInputElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'Node']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
window.requestAnimationFrame = callback => { callback(); return 0; };
window.cancelAnimationFrame = () => {};
window.scrollTo = () => {};
HTMLDialogElement.prototype.showModal = function () { this.open = true; };
HTMLDialogElement.prototype.close = function () { this.open = false; };
await mkdir('.local', { recursive: true });
const dir = await mkdtemp(resolve('.local', 'primary-redesign-'));
const out = resolve(dir, 'components.mjs');
await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
export { HomeDashboard } from './src/features/home/HomeDashboard';
export { StudyModulesHub, libraryModuleCounts } from './src/features/home/StudyModulesHub';
export { MixedPracticeHub } from './src/features/practice/MixedPracticeHub';
export { ConfirmationContext } from './src/components/confirmation';
export { translations } from './src/i18n/translations';
export { localDateString } from './src/domain/studyPlan';
` }, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, outfile: out });
const { HomeDashboard, StudyModulesHub, libraryModuleCounts, MixedPracticeHub, ConfirmationContext, translations, localDateString } = await import(pathToFileURL(out));
const { createElement: h, act } = await import('react');
const { createRoot } = await import('react-dom/client');
let root;
const noop = () => {};
const labels = translations['zh-CN'];
const today = localDateString(new Date());
const home = { token: '', username: 'test', labels, locale: 'zh-CN', dueItems: [], plan: { profile: { level: 'N1', examDate: '2026-12-06' }, tasks: [] }, todayPractices: [], onOpenReviewItem: noop, onOpenDraft: noop, onNavigate: noop, onStartDailyPractice: noop, onCreateDailyPractice: noop, onOpenPracticeHistory: noop, onStartMock: noop, onTaskStatus: noop };
const mixed = { topicEntries: [], locale: 'zh-CN', labels, questions: [], items: [], progress: {}, modules: [], captures: [], drafts: [], listeningQuestions: [], readingQuestions: [], studyPlan: { tasks: [] }, onStart: noop, onStartMock: noop, onNavigate: noop, onStartModule: noop };
async function render(component, props) { root = createRoot(document.getElementById('root')); await act(async () => root.render(h(component, props))); }
async function click(element) { assert.ok(element, 'expected action exists'); await act(async () => element.click()); }
const button = (text, scope = document) => [...scope.querySelectorAll('button')].find(element => element.textContent.trim() === text || element.getAttribute('aria-label') === text);
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.style.overflow = ''; });
after(async () => { dom.window.close(); await rm(dir, { recursive: true, force: true }); });

test('Learning shows daily confirmation, due review and independent practice routes', async () => {
  let opened;
  const routes = [];
  await render(HomeDashboard, { ...home, latestDraft: { id: 'draft-9', title: 'Draft', status: 'pending' }, dueItems: [{ id: 'a' }, { id: 'b' }], onOpenDraft: id => opened = id, onNavigate: (...args) => routes.push(args) });
  assert.equal(document.querySelector('main').getAttribute('aria-label'), '学习');
  assert.equal(document.querySelector('main h1'), null);
  assert.match(document.querySelector('.learning-status').textContent, /待确认/);
  assert.equal(document.querySelector('.learning-due-count strong').textContent, '2');
  await click(button('确认题目'));
  assert.equal(opened, 'draft-9');
  await click(document.querySelector('.learning-due'));
  await click(document.querySelector('.home-exam-countdown'));
  assert.deepEqual(routes, [['memory-review'], ['plan']]);
});

test('Today continues the real daily set and does not invent answered progress', async () => {
  let opened;
  await render(HomeDashboard, { ...home, todayPractices: [{ id: 'practice-2', title: '真实题组', minutes: 12, questionCount: 2, questions: [{ id: 'q1' }, { id: 'q2' }] }], dailyAnswers: { q1: { selected: 'A', correct: true }, unrelated: { selected: 'A' } }, onStartDailyPractice: id => { opened = id; } });
  assert.match(document.querySelector('.primary-daily-meta').textContent, /1\/2 题 · 12 分钟/);
  await click(button('继续练习'));
  assert.equal(opened, 'practice-2');
});

test('Learning disables empty due review and prepares daily practice', async () => {
  let prepared = 0;
  const routes = [];
  await render(HomeDashboard, { ...home, onCreateDailyPractice: () => prepared++, onNavigate: view => routes.push(view) });
  const review = document.querySelector('.learning-due');
  assert.equal(review.disabled, true);
  await click(review);
  assert.deepEqual(routes, []);
  await click(button('准备今日练习'));
  assert.equal(prepared, 1);
});

test('library totals deduplicate passage/audio and studied excludes detail-open metadata', () => {
  const items = [{ id: 'v1', deck: 'n1_vocab' }, { id: 'v2', deck: 'name_reading' }, { id: 'g1', deck: 'grammar_expression' }];
  const readings = [{ id: 'r1', passage: 'One\r\npassage ' }, { id: 'r2', passage: 'One\npassage' }, { id: 'r3', passage: 'Two' }];
  const listening = [{ id: 'l1', audioAssetId: 'audio-1' }, { id: 'l2', audioAssetId: 'audio-1' }, { id: 'l3', audioAssetId: 'audio-2' }];
  const progress = { v1: { correct: 1, wrong: 0 }, v2: { correct: 0, wrong: 0, firstSeenAt: 'now', status: 'learning' }, g1: { correct: 0, wrong: 0, reviewCount: 2 }, r2: { correct: 0, wrong: 1 }, 'listening-audio:audio-1': { correct: 0, wrong: 0, reviewCount: 1 } };
  assert.deepEqual(libraryModuleCounts(items, readings, listening, progress), { vocabulary: { total: 2, studied: 1 }, grammar: { total: 1, studied: 1 }, reading: { total: 2, studied: 1 }, listening: { total: 2, studied: 1 } });
});

test('Library renders four uniform entries and only supported study information', async () => {
  const destinations = [];
  await render(StudyModulesHub, { locale: 'zh-CN', labels, items: [{ id: 'a', deck: 'n1_vocab' }], readingQuestions: [], listeningQuestions: [], onNavigate: (...args) => destinations.push(args) });
  const entries = [...document.querySelectorAll('.primary-library > button')];
  assert.deepEqual(entries.map(node => node.querySelector('strong').textContent), ['词汇', '语法', '阅读', '听力']);
  assert.match(entries[0].textContent, /1 词/);
  assert.doesNotMatch(document.querySelector('.primary-library').textContent, /已学|已练|更多工具/);
  assert.equal(document.querySelector('.primary-library h1'), null);
  for (const entry of entries) await click(entry);
  assert.deepEqual(destinations, [['vocabulary', 'words'], ['grammar', 'words'], ['reading', 'words'], ['listening', 'words']]);
});

test('Practice is exactly three routes with only real completed rounds', async () => {
  let started = 0;
  let mockStarted = 0;
  await render(MixedPracticeHub, { ...mixed, questions: [{ id: 'q1' }, { id: 'q2' }], topicCount: 4, topicCompletedCount: 3, mockExamCount: 1, mockCompletedCount: 2, attempts: [{ id: 'one', view: 'mixed', completedAt: '2026-10-01' }, { id: 'one', view: 'mixed', completedAt: '2026-10-01' }, { id: 'partial', view: 'mixed' }, { id: 'other', view: 'grammar', completedAt: '2026-10-01' }], onStart: () => started++, onStartMock: () => mockStarted++, dailyPractice: { title: 'Should not appear', questions: [] } });
  const entries = [...document.querySelectorAll('.primary-practice-entries > button')];
  assert.deepEqual(entries.map(node => node.querySelector('strong').textContent), ['专项练习', '综合练习', '模拟考试']);
  assert.match(entries[0].textContent, /4 套·3 次/);
  assert.match(entries[1].textContent, /2 题·1 次/);
  assert.match(entries[1].querySelector('.primary-completed-rounds').title, /保留记录.*不代表全部历史/);
  assert.match(entries[1].querySelector('.primary-completed-rounds').getAttribute('aria-label'), /保留记录/);
  assert.match(entries[2].textContent, /1 套·2 次/);
  assert.equal(document.querySelectorAll('.primary-completed-rounds svg[class*="repeat"]').length, 3);
  assert.doesNotMatch(document.querySelector('main').textContent, /Should not appear|选择练习方式|我的练习|更多练习/);
  await click(entries[0]);
  assert.equal(window.location.hash, '#/mixed/tips/topics');
  await click(entries[1]); await click(entries[2]);
  assert.equal(started, 1); assert.equal(mockStarted, 1);
});

test('Practice omits mock totals and rounds when no reliable counter is supplied', async () => {
  await render(MixedPracticeHub, mixed);
  const entries = [...document.querySelectorAll('.primary-practice-row')];
  assert.equal(entries[2].querySelector('strong').textContent, '模拟考试');
  assert.equal(entries[2].querySelector('small'), null);
  assert.equal(entries[1].querySelector('.primary-completed-rounds'), null);
});

test('Topic rows use completed rounds or pending; mobile filters start closed and reset', async () => {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  let opened;
  const topic = (key, title, status, count, completedCount, module) => ({ key, title, status, count, completedCount, modules: [module], action: () => { opened = key; } });
  await render(MixedPracticeHub, { ...mixed, groupKey: 'topics', topicEntries: [topic('one', '文法・範囲', 'ready', 68, 2, 'grammar'), topic('two', '听力材料', 'pending', 20, 0, 'listening'), topic('three', '单词', 'ready', 6, 0, 'vocabulary')] });
  assert.equal(document.querySelector('dialog').open, false);
  assert.equal(document.querySelector('input[type="search"]'), null);
  const rows = [...document.querySelectorAll('.primary-topic-row')];
  assert.match(rows[0].textContent, /68 题·2 次/);
  assert.match(rows[1].textContent, /20 题·待确认/);
  assert.match(rows[2].textContent, /6 题·未练习/);
  await click(rows[0]); assert.equal(opened, 'one');
  await click(button('搜索与筛选'));
  assert.equal(document.querySelector('dialog').open, true);
  await click(button('听力', document.querySelector('dialog')));
  assert.equal(document.querySelectorAll('.primary-topic-row').length, 1);
  await click(button('关闭'));
  assert.equal(document.querySelector('dialog').open, false);
  assert.match(document.querySelector('.list-applied-summary').textContent, /听力/);
  await click(button('重置'));
  assert.equal(document.querySelectorAll('.primary-topic-row').length, 3);
});


test('topic sharing requires selection and confirmation before publishing', async () => {
  let shared = 0;
  await render(MixedPracticeHub, { ...mixed, groupKey: 'topics', topicEntries: [{ key: 'one', title: '题组', action: noop, share: async () => shared++ }] });
  await click(button('批量管理'));
  assert.equal(button('分享').disabled, true);
  await click(document.querySelector('.topic-select-check input'));
  await click(button('分享'));
  assert.equal(shared, 0, 'declined confirmation never publishes');
});

test('ready topics with missing details show readiness without invented question or completion counts', async () => {
  await render(MixedPracticeHub, { ...mixed, groupKey: 'topics', topicEntries: [{ key: 'unknown', title: '已确认题组', status: 'ready', action: noop }, { key: 'pending-unknown', title: '新草稿', status: 'pending', action: noop }] });
  const rows = [...document.querySelectorAll('.primary-topic-row')];
  assert.equal(rows[0].querySelector('small').textContent, '可练习');
  assert.equal(rows[1].querySelector('small').textContent, '待确认');
  assert.doesNotMatch(document.querySelector('.primary-topic-list').textContent, /0 题|0 次|未练习/);
});

test('Practice omits aggregate topic rounds until every ready topic has completion data', async () => {
  await render(MixedPracticeHub, { ...mixed, topicEntries: [{ key: 'known', title: 'Known', status: 'ready', count: 5, completedCount: 3, action: noop }, { key: 'unknown', title: 'Unknown', status: 'ready', action: noop }, { key: 'pending', title: 'Pending', status: 'pending', action: noop }] });
  const topic = document.querySelector('.primary-practice-row');
  assert.match(topic.textContent, /3 套/);
  assert.equal(topic.querySelector('.primary-completed-rounds'), null);
});

test('pending drafts do not block a known topic completion total', async () => {
  await render(MixedPracticeHub, { ...mixed, topicEntries: [{ key: 'known', title: 'Known', status: 'ready', count: 5, completedCount: 3, action: noop }, { key: 'pending', title: 'Pending', status: 'pending', action: noop }] });
  assert.match(document.querySelector('.primary-practice-row').textContent, /2 套·3 次/);
});


test('Learning uses actual question answers to distinguish ongoing and completed practice', async () => {
  const practice = { id: 'daily', title: 'Daily', questionCount: 99, minutes: 10, questions: [{ id: 'q1' }, { id: 'q2' }] };
  let opened;
  await render(HomeDashboard, { ...home, todayPractices: [practice], dailyAnswers: { q1: { selected: 'A' }, q2: { selected: 'B' }, unrelated: { selected: 'C' } }, onStartDailyPractice: id => opened = id });
  assert.equal(document.querySelector('progress').value, 2);
  assert.equal(document.querySelector('progress').max, 2);
  assert.equal(document.querySelector('.learning-status').textContent, '已完成');
  await click(button('查看练习'));
  assert.equal(opened, 'daily');
});

test('Learning independent routes use supplied counts and callbacks', async () => {
  const routes = []; let mocks = 0;
  await render(HomeDashboard, { ...home, topicCount: 4, topicRounds: 2, mixedQuestionCount: 8, mixedRounds: 3, mockExamCount: 1, mockRounds: 0, onNavigate: (...args) => routes.push(args), onStartMock: () => mocks++ });
  const entries = [...document.querySelectorAll('.learning-practice-grid button')];
  assert.deepEqual(entries.map(entry => entry.querySelector('strong').textContent), ['专项练习', '综合练习', '模拟考试']);
  assert.match(entries[0].textContent, /4 套.*2 次/);
  assert.match(entries[1].textContent, /8 题.*3 次/);
  assert.match(entries[2].textContent, /1 套.*0 次/);
  for (const entry of entries) await click(entry);
  assert.deepEqual(routes, [['mixed', 'tips', 'topics'], ['mixed', 'questions']]);
  assert.equal(mocks, 1);
});

test('Practice uses direct routes without duplicate companion shortcuts', async () => {
  let started = 0;
  await render(MixedPracticeHub, { ...mixed, onStart: () => started++ });
  assert.equal(document.querySelector('.module-practice-mascot'), null);
  assert.equal(document.querySelector('dialog'), null);
  await click(document.querySelectorAll('.primary-practice-entries > button')[1]);
  assert.equal(started, 1);
});

test('Topic management selects original rows and batches confirmed actions without opening practice', async () => {
  const removed = [], shared = [], confirmations = [];
  let opened = 0;
  const entries = ['one', 'two'].map(key => ({ key, title: key, action: () => opened++, remove: async () => removed.push(key), share: async description => shared.push([key, description]) }));
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(h(ConfirmationContext.Provider, { value: async options => { confirmations.push(options); return true; } }, h(MixedPracticeHub, { ...mixed, groupKey: 'topics', topicEntries: entries }))));
  await click(button('批量管理'));
  const checks = [...document.querySelectorAll('.topic-select-check input')];
  assert.equal(checks.length, 2);
  await click(checks[0]); await click(document.querySelectorAll('.primary-topic-row')[1]);
  assert.equal(opened, 0);
  await click(button('分享'));
  assert.deepEqual(shared, [['one', 'one'], ['two', 'two']]);
  assert.match(confirmations[0].description, /公开.*发现/);
  await click(button('全选（2）'));
  await click(button('删除'));
  assert.deepEqual(removed, ['one', 'two']);
  assert.match(confirmations[1].description, /来源草稿.*正式练习和答题记录会保留/);
  assert.equal(document.querySelector('.primary-topic-management'), null);
});
