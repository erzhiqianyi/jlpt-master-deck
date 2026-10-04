import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/#/vocabulary/words' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'Node']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.requestAnimationFrame = (callback) => { callback(); return 0; };
window.cancelAnimationFrame = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
await mkdir('.local', { recursive: true });
const directory = await mkdtemp(resolve('.local', 'study-templates-'));
const output = resolve(directory, 'components.mjs');
await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
  export {WordIndexPanel, WordDetailPanel, WordbookManagerPanel, PracticeReviewPanel} from './src/features/practice/StudyPanels';
  export {FocusedMemoryReview} from './src/features/review/FocusedMemoryReview';
  export {MockExamCatalog} from './src/features/practice/MockExamCatalog';
  export {QuestionBankPanel} from './src/features/practice/QuestionBankPanel';
  export {MistakesPanel} from './src/features/history/MistakesPanel';
  export {AuthoringNavigationProvider} from './src/components/AuthoringNavigation';
  export {RecordsOverview} from './src/features/overview/RecordsOverview';
  export {PageChromeProvider, PageHeaderActions} from './src/components/PageChrome';
  export {translations} from './src/i18n/translations';
` }, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, outfile: output });
const ui = await import(pathToFileURL(output));
const { createElement: h, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('root'));
let mount = 0, location;
const labels = ui.translations['zh-CN'];
const noop = () => {};
async function render(Component, props) { await act(async () => root.render(h(ui.AuthoringNavigationProvider, { onChange: (next) => location = next }, h(Component, { key: ++mount, ...props })))); }
async function renderWithChrome(Component, props) { await act(async () => root.render(h(ui.AuthoringNavigationProvider, { onChange: (next) => location = next }, h(ui.PageChromeProvider, null, h('header', { className: 'test-global-header' }, h(ui.PageHeaderActions)), h(Component, { key: ++mount, ...props }))))); }
async function click(element) { assert.ok(element, 'control exists'); await act(async () => element.click()); }
const button = (label) => [...document.querySelectorAll('button')].find((element) => element.textContent.trim() === label);
async function type(element, value) {
  await act(async () => { Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); });
}
const word = { id: 'word-1', deck: 'n1_vocab', original: '捉える', reading: 'とらえる', meaning_ja: '物事を理解する。', meaning_zh: '把握；理解；捕捉', part_of_speech: '動詞', core_memory: ['用场景记忆'], input_at: '2026-10-01', reference: 'w-11', examples: [{ ja: '第一例句', zh: '第一译文' }, { ja: '第二例句', zh: '第二译文' }, { ja: '第三例句', zh: '第三译文' }] };
const book = { id: 'n1_vocab', deck: 'n1_vocab', title: 'N1/N2 词汇', builtIn: true };
const wordProps = { items: [word, { ...word, id: 'word-2', original: 'かつて', reading: 'かつて' }], questions: [], answers: {}, progress: {}, labels, locale: 'zh-CN', deckLabels: { n1_vocab: 'N1/N2 词汇' }, wordbooks: [book], captureCategory: 'word', onOpen: noop, onPractice: noop, onSaveCapture: async () => {}, onCreateWordbook: async () => null };
after(async () => { await act(async () => root.unmount()); dom.window.close(); await rm(directory, { recursive: true, force: true }); });

test('word rows preserve meaning and distinct reading, display only actual completed-round counts', async () => {
  await render(ui.WordIndexPanel, { ...wordProps, attempts: [{ id: 'attempt-1', completedAt: '2026-10-03', answers: [{ itemId: word.id, questionId: 'q1', answeredAt: '2026-10-03' }, { itemId: word.id, questionId: 'q2', answeredAt: '2026-10-03' }] }] });
  const rows = [...document.querySelectorAll('[role="listitem"]')];
  assert.equal(rows.length, 2);
  const studied = rows.find(row => row.textContent.includes('捉える'));
  const fresh = rows.find(row => row.textContent.includes('かつて'));
  assert.match(studied.textContent, /捉える.*とらえる.*把握；理解；捕捉/s);
  assert.equal(studied.querySelector('.entry-completed-rounds').textContent, '1 次');
  assert.equal(fresh.querySelector('.entry-completed-rounds'), null);
  assert.equal(fresh.querySelector('.list-item-reading'), null);
  assert.doesNotMatch(document.body.textContent, /近期练习|语法笔记/);
  assert.ok(document.querySelector('.list-frame.is-simple-study-list'));
  assert.ok(document.querySelector('.list-item-references'), 'reference codes remain available for detailed mode');
  assert.equal(document.querySelector('input[type="search"]'), null, 'filters are initially collapsed');
  assert.equal(document.querySelectorAll('.module-practice-entry').length, 1);
});

test('capture editor unmounts list controls, and Back retains its typed draft', async () => {
  await render(ui.WordIndexPanel, wordProps);
  await click(document.querySelector('.list-controls-trigger'));
  assert.equal(document.querySelector('.list-controls-dialog').open, true);
  await click(button('记一个单词'));
  assert.equal(document.querySelector('.list-controls-dialog'), null);
  assert.equal(document.querySelector('[role="list"]'), null);
  assert.equal(location.label, '记一个单词');
  const input = document.querySelector('.entry-capture-form textarea');
  await type(input, '捉えるを追加したい');
  await act(async () => location.close());
  assert.ok(document.querySelector('[role="list"]'));
  await click(document.querySelector('.list-controls-trigger'));
  await click(button('记一个单词'));
  assert.equal(document.querySelector('.entry-capture-form textarea').value, '捉えるを追加したい');
});

test('detail preserves every example and conjugation behind progressive sections', async () => {
  await render(ui.WordDetailPanel, { item: { ...word, conjugations: [{ kind: 'past', form: '捉えた' }], patterns: [{ pattern: '意味を捉える', example: '文の意味を捉える。' }] }, index: 0, total: 1, showRuby: true, labels, locale: 'zh-CN', onShowRubyChange: noop, onPrevious: noop, onNext: noop });
  assert.equal(document.querySelector('.study-entry-heading h1').textContent, '捉える');
  assert.match(document.querySelector('.study-entry-section').textContent, /物事.*を理解する/);
  const more = [...document.querySelectorAll('.study-entry-disclosure')].find((entry) => entry.querySelector('summary').textContent.includes('更多例句'));
  assert.ok(more);
  assert.equal(more.open, false);
  assert.match(more.textContent, /第二例句.*第三例句/s);
  assert.match(document.querySelector('.study-entry-conjugations').textContent, /捉えた/);
  assert.equal(document.querySelector('.study-entry-conjugations').closest('details').open, false);
});

test('wordbook rename is a registered child that Back cancels without renaming', async () => {
  let saves = 0;
  await render(ui.WordbookManagerPanel, { labels, locale: 'zh-CN', family: 'vocabulary', wordbooks: [book], items: [word], onCreateWordbook: async () => null, onRenameWordbook: async () => { saves++; return null; }, onShareWordbook: async () => {}, onBack: noop });
  assert.equal(document.querySelector('form'), null, 'new-wordbook form starts collapsed');
  await click(document.querySelector('[role="listitem"] button'));
  assert.equal(location.kind, 'form');
  assert.equal(document.querySelector(`input[aria-label="${labels.wordbookRenameTitle}"]`).value, book.title);
  await act(async () => location.close());
  assert.equal(saves, 0);
  assert.equal(document.querySelector(`input[aria-label="${labels.wordbookRenameTitle}"]`), null);
});

test('answer detail Back returns to the same attempt results rather than leaving practice', async () => {
  let leaves = 0;
  const question = { id: 'q1', itemId: word.id, kind: 'meaning', prompt: '問題一', choices: ['甲', '乙'], answer: '乙', correctReason: '解析' };
  await render(ui.PracticeReviewPanel, { questions: [question], answers: { q1: { selected: '甲', correct: false } }, items: [], labels, locale: 'zh-CN', showRuby: false, onBackToPractice: () => leaves++ });
  await click(document.querySelector('.practice-result-rows button'));
  assert.equal(location.kind, 'detail');
  assert.equal(document.querySelector('.practice-result-summary'), null);
  assert.ok(document.querySelector('.practice-review-detail'));
  await act(async () => location.close());
  assert.equal(leaves, 0);
  assert.ok(document.querySelector('.practice-result-summary'));
  assert.equal(document.querySelector('.practice-review-detail'), null);
});

test('zero mock papers show a genuine empty state and failures do not claim there are no papers', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (path) => ({ ok: true, json: async () => path.includes('news') ? { cycles: [] } : { exams: [] } });
    await render(ui.MockExamCatalog, { locale: 'zh-CN', token: '', onOpen: noop });
    assert.match(document.querySelector('.study-mock-empty').textContent, /还没有试卷/);
    assert.equal(document.querySelector('.study-mock-empty a').getAttribute('href'), '#/mcp');
    assert.equal(document.querySelector('[role="listitem"]'), null);
    globalThis.fetch = async () => { throw new Error('Network unavailable'); };
    await render(ui.MockExamCatalog, { locale: 'zh-CN', token: '', onOpen: noop });
    assert.match(document.querySelector('.study-mock-empty').textContent, /未能读取/);
    assert.doesNotMatch(document.querySelector('.study-mock-empty').textContent, /还没有试卷/);
    assert.ok(button('重试'));
  } finally { globalThis.fetch = originalFetch; }
});

test('memory ratings prevent repeated writes and retain the revealed card after a failed save', async () => {
  let reject, calls = 0;
  await render(ui.FocusedMemoryReview, { items: [word], locale: 'zh-CN', wordSpacing: false, frontFields: ['original'], backFields: ['original', 'meaning', 'examples'], onExit: noop, onRate: () => { calls++; return new Promise((_, fail) => { reject = fail; }); } });
  await click(button('显示答案'));
  const ratings = document.querySelectorAll('.ledger-memory-ratings button');
  assert.equal(ratings.length, 4);
  await act(async () => { ratings[0].click(); ratings[0].click(); });
  assert.equal(calls, 1);
  await act(async () => reject(new Error('保存失败，重试')));
  assert.match(document.querySelector('[role="alert"]').textContent, /保存失败/);
  assert.ok(document.querySelector('.ledger-memory-flip.is-flipped'));
  assert.equal(document.querySelector('.ledger-memory-ratings button').disabled, false);
  assert.match(document.querySelector('.ledger-focus-topbar').textContent, /1 \/ 1/);
});

test('focused practice selector is a child screen with no list controls or duplicate practice entry', async () => {
  await render(ui.WordIndexPanel, { ...wordProps, questions: [{ id: 'q1', itemId: word.id, kind: 'meaning' }] });
  await click(document.querySelector('.module-practice-entry'));
  await click(button('按题型练习'));
  assert.ok(document.querySelector('.study-focused-selector'));
  assert.equal(document.querySelector('.module-practice-entry'), null);
  assert.equal(document.querySelector('.list-controls-dialog'), null);
  assert.equal(document.querySelector('[role="list"]'), null);
  assert.equal(location.kind, 'detail');
  await act(async () => location.close());
  assert.ok(document.querySelector('[role="list"]'));
  assert.ok(document.querySelector('.module-practice-entry'));
});

test('mistake detail shows the saved answer and Back returns to its filtered list', async () => {
  const question = { id: 'q1', itemId: word.id, prompt: 'どの言葉？', choices: ['捉える', '替える'], answer: '捉える', correctReason: '意味を理解する場面。' };
  const attempts = [{ id: 'a1', completedAt: '2026-10-03', answers: [{ questionId: 'q1', itemId: word.id, selected: '替える', correct: false, answeredAt: '2026-10-03T12:00:00Z' }] }];
  await render(ui.MistakesPanel, { attempts, questions: [question], items: [word], locale: 'zh-CN' });
  await click(document.querySelector('[role="listitem"] button'));
  assert.equal(location.label, '错题详情');
  assert.match(document.querySelector('.study-mistake-answer.is-wrong').textContent, /你的答案替える/);
  assert.match(document.querySelector('.study-mistake-answer.is-correct').textContent, /正确答案捉える/);
  await act(async () => location.close());
  assert.ok(document.querySelector('[role="listitem"]'));
  assert.equal(document.querySelector('.study-mistake-details'), null);
});

test('question-bank navigation and filters start collapsed, with applied summary and reset', async () => {
  await render(ui.QuestionBankPanel, { grammarQuestions: [{ id: 'g1', prompt: '文法の問題', choices: ['甲', '乙'], answer: '乙' }], dailyPractices: [], loadingDaily: false, locale: 'zh-CN' });
  assert.equal(document.querySelector('a[href="#/reading/words"]'), null);
  assert.equal(document.querySelector('input[type="search"]'), null);
  await click(document.querySelector('.list-controls-trigger'));
  assert.ok(document.querySelector('a[href="#/reading/words"]'));
  await click(button('语法'));
  await type(document.querySelector('input[type="search"]'), '文法');
  await click(document.querySelector('.list-controls-dialog button[aria-label="关闭"]'));
  assert.match(document.querySelector('.list-applied-summary').textContent, /语法 · 文法/);
  await click(button('重置'));
  assert.equal(document.querySelector('.list-applied-summary'), null);
  assert.ok(document.querySelector('.study-bank-question-heading'));
});


test('due-card count and start review remain outside the collapsed controls', async () => {
  let starts = 0;
  await renderWithChrome(ui.RecordsOverview, { view: 'memory', items: [word, { ...word, id: 'future-word' }], progress: { 'future-word': { nextReviewAt: '2099-01-01' } }, attempts: [], questions: [], locale: 'zh-CN', onOpenMemoryReview: () => starts++, onOpenSettings: noop });
  assert.equal(document.querySelector('.study-due-count').textContent, '1 项待复习');
  const start = button('开始复习');
  assert.ok(start);
  assert.equal(start.closest('dialog'), null);
  assert.ok(start.closest('.study-due-action-dock'));
  assert.equal(document.querySelector('.list-controls-dialog').open, false);
  await click(start);
  assert.equal(starts, 1);
  await renderWithChrome(ui.RecordsOverview, { view: 'memory', items: [], progress: {}, attempts: [], questions: [], locale: 'zh-CN', onOpenMemoryReview: () => starts++, onOpenSettings: noop });
  assert.equal(document.querySelector('.study-due-action-dock button').disabled, true);
});

test('wordbook New lives in global chrome and disappears while create or rename is open', async () => {
  const props = { labels, locale: 'zh-CN', family: 'vocabulary', wordbooks: [book], items: [word], onCreateWordbook: async () => null, onRenameWordbook: async () => null, onShareWordbook: async () => {}, onBack: noop };
  await renderWithChrome(ui.WordbookManagerPanel, props);
  assert.equal(document.querySelectorAll('button[aria-label="新建"]').length, 1);
  assert.equal(document.querySelector('.study-wordbook-fallback-heading'), null);
  assert.equal(button(labels.backToEntryList), undefined);
  await click(document.querySelector('button[aria-label="新建"]'));
  assert.ok(document.querySelector('.study-wordbook-manager form'));
  assert.equal(document.querySelector('button[aria-label="新建"]'), null);
  await act(async () => location.close());
  assert.ok(document.querySelector('button[aria-label="新建"]'));
  await click(document.querySelector('[role="listitem"] button'));
  assert.equal(location.kind, 'form');
  assert.equal(document.querySelector('button[aria-label="新建"]'), null);
  await act(async () => location.close());
  assert.ok(document.querySelector('button[aria-label="新建"]'));
});

test('capture under global chrome has no duplicate heading and keeps a bottom Cancel', async () => {
  await renderWithChrome(ui.WordIndexPanel, wordProps);
  await click(document.querySelector('.test-global-header button'));
  await click(button('记一个单词'));
  assert.equal(location.label, '记一个单词');
  assert.equal(document.querySelector('.study-form-heading'), null);
  assert.ok(document.querySelector('.entry-capture-form textarea'));
  const cancel = document.querySelector('.entry-capture-form > .study-form-cancel');
  assert.equal(cancel.textContent, labels.draftEditCancel);
  assert.equal(document.querySelector('.test-global-header button'), null, 'list controls unregister on the editor');
  await click(cancel);
  assert.ok(document.querySelector('[role="list"]'));
  assert.ok(document.querySelector('.test-global-header button'));
});


test('study typography preserves the user font scale, including responsive clamps and memory cards', async () => {
  const css = await readFile('src/features/practice/practice-layout.css', 'utf8');
  const sizes = [...css.matchAll(/font-size:\s*([^;]+);/g)].map((match) => match[1]);
  assert.ok(sizes.length > 50);
  assert.ok(sizes.every((value) => value.includes('var(--ui-font-scale') || value.includes('var(--memory-')), 'every explicit font size must track the display setting');
  const responsive = sizes.filter((value) => value.includes('clamp('));
  assert.ok(responsive.length >= 3);
  assert.ok(responsive.every((value) => (value.match(/var\(--ui-font-scale/g) ?? []).length === 3), 'minimum, fluid and maximum text sizes all scale');
  assert.doesNotMatch(css, /font:\s*(?:[\d.]+px|(?:normal|bold)\s+[\d.]+px)/);
});

test('word-list applied filters show book, tag, sort and one query with a single reset', async () => {
  let resetBook;
  await render(ui.WordIndexPanel, { ...wordProps, items: [{ ...word, tags: ['重点'] }], selectedWordbookId: book.id, onWordbookChange: (id) => resetBook = id });
  assert.match(document.querySelector('.list-applied-summary').textContent, /N1\/N2 词汇/);
  await click(document.querySelector('.list-controls-trigger'));
  const selects = [...document.querySelectorAll('.study-entry-filter-fields select')];
  const tag = selects.find(select => [...select.options].some(option => option.value === '重点'));
  const sort = selects.find(select => [...select.options].some(option => option.value === 'kana-asc'));
  await act(async () => { tag.value = '重点'; tag.dispatchEvent(new Event('change', { bubbles: true })); sort.value = 'kana-asc'; sort.dispatchEvent(new Event('change', { bubbles: true })); });
  await type(document.querySelector('input[type="search"]'), '捉える');
  await click(document.querySelector('.list-controls-dialog button[aria-label="关闭"]'));
  const summary = document.querySelector('.list-applied-summary').textContent;
  assert.match(summary, /N1\/N2 词汇.*#重点/s);
  assert.ok(summary.includes(labels['entrySort_kana-asc']));
  assert.equal(summary.split('捉える').length - 1, 1);
  await click(button('重置'));
  assert.equal(resetBook, 'all');
  assert.doesNotMatch(document.querySelector('.list-applied-summary').textContent, /#重点|捉える/);
});

test('mistake sorting uses localized collapsed controls and a resettable applied summary', async () => {
  await render(ui.MistakesPanel, { attempts: [], questions: [], items: [], locale: 'en' });
  await click(document.querySelector('.list-controls-trigger'));
  assert.match(document.querySelector('.list-controls-dialog').textContent, /Sort/);
  const sort = document.querySelector('.list-controls-dialog select');
  await act(async () => { sort.value = 'recent'; sort.dispatchEvent(new Event('change', { bubbles: true })); });
  await click(document.querySelector('.list-controls-dialog button[aria-label="Close"]'));
  assert.match(document.querySelector('.list-applied-summary').textContent, /Most recent mistake/);
  await click(button('Reset'));
  assert.equal(document.querySelector('.list-applied-summary'), null);
});


test('detailed word rows retain original added date, review date, book, part of speech and study status', async () => {
  await render(ui.WordIndexPanel, { ...wordProps, items: [word], progress: { [word.id]: { status: 'review', nextReviewAt: '2026-10-20T12:00:00Z' } } });
  assert.equal(document.querySelector('.list-added'), null, 'compact rows do not render extra metadata');
  await click(document.querySelector('.list-controls-trigger'));
  await click(button('详细列表'));
  await click(document.querySelector('.list-controls-dialog button[aria-label="关闭"]'));
  assert.ok(document.querySelector('.list-added time[datetime="2026-10-01"]'));
  assert.ok(document.querySelector('.list-next-review time[datetime="2026-10-20T12:00:00Z"]'));
  assert.match(document.querySelector('.list-collection').textContent, /N1\/N2 词汇/);
  assert.match(document.querySelector('.list-part-of-speech').textContent, /動詞/);
  assert.ok(document.querySelector('.list-learning-status').textContent.includes(labels.statusReview));
  assert.ok(document.querySelector('.list-item-references').textContent.includes('w-11'));
});

test('entry navigation clears the mobile app header and returns to static desktop flow', async () => {
  const css = await readFile('src/features/practice/practice-layout.css', 'utf8');
  assert.match(css, /\.study-entry-detail \.study-entry-navigation\s*\{[^}]*top:\s*calc\(56px \+ env\(safe-area-inset-top, 0px\)\)/s);
  assert.match(css, /@media \(min-width: 768px\)\s*\{ \.study-entry-detail \.study-entry-navigation \{ position: static; top: auto;/);
});
