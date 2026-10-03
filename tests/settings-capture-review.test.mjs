import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(join(tmpdir(), 'jlpt-settings-capture-review-'));
after(() => rm(directory, { recursive: true, force: true }));
const { outputFiles } = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { QuestionReviewWorkspace } from './src/features/drafts/QuestionReviewWorkspace';
    import { SettingsView } from './src/features/settings/SettingsView';
    import { CapturePanel } from './src/features/capture/CapturePanel';
    import { GlobalSearch } from './src/features/search/GlobalSearch';
    export { questionReviewKey, getQuestionReviews, isQuestionConfirmed, allQuestionsConfirmed } from './src/features/drafts/questionReviewState';
    const noop = () => {};
    const labels = { settings: 'Settings', account: 'Account', currentUser: 'Current user', logout: 'Sign out', language: 'Language', fontSize: 'Font size', captureInputLabel: 'Capture text', captureSave: 'Save capture', processing: 'Processing', searchTitle: 'Search learning materials', searchClear: 'Clear query', mobileClose: 'Close search', searchAll: 'All' };
    const settings = { locale: 'en', fontSize: 'standard', showReviewRuby: true, showExplanationRuby: true, feedbackMode: 'immediate', memoryCardFrontFields: ['word'], memoryCardBackFields: ['meaning'], memoryCardWordSpacing: false, ttsProvider: 'browser' };
    export function renderReview(questions, annotations = []) {
      return renderToStaticMarkup(<QuestionReviewWorkspace draft={{ id: 'draft', status: 'draft', content: {}, annotations }} questions={questions} renderQuestion={() => <p>Question body</p>} onSave={async () => {}} onFinalize={async () => {}} />);
    }
    export function renderSettings(activeSection) {
      return renderToStaticMarkup(<SettingsView labels={labels} settings={settings} username="Learner" authToken="fixture" activeSection={activeSection} onOpenSection={noop} onLogout={noop} onUpdateSettings={noop} />);
    }
    export function renderCapture() {
      return renderToStaticMarkup(<CapturePanel labels={labels} deckLabels={{}} wordbooks={[]} onSave={async () => {}} onCreateWordbook={async () => null} onOpenHistory={noop} />);
    }
    export function renderSearch() {
      return renderToStaticMarkup(<GlobalSearch open={false} query="study" results={[]} labels={labels} onQueryChange={noop} onOpenResult={noop} onClose={noop} />);
    }
  ` },
  bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', write: false,
  loader: { '.css': 'empty' }, define: { 'import.meta.env.DEV': 'false' },
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
const file = join(directory, 'render.mjs');
await writeFile(file, outputFiles[0].text);
const { questionReviewKey, getQuestionReviews, isQuestionConfirmed, allQuestionsConfirmed, renderReview, renderSettings, renderCapture, renderSearch } = await import(pathToFileURL(file));
const question = { prompt: '日本語', choices: ['A', 'B'], answerIndex: 0 };
const key = questionReviewKey(question, 0);
const annotation = (confirmed, date = '2026-10-01T10:00:00Z', extra = {}) => ({ id: date, created_at: date, body: JSON.stringify({ kind: 'question_review', key, number: 1, note: '', confirmed, ...extra }) });

test('new and empty drafts are never implicitly confirmed', () => {
  assert.equal(allQuestionsConfirmed([question], []), false);
  assert.equal(allQuestionsConfirmed([], []), false);
  assert.equal(isQuestionConfirmed(key, getQuestionReviews([])), false);
  const html = renderReview([question]);
  assert.match(html, /已确认 <strong>0<\/strong>/);
  assert.doesNotMatch(html, /checked=""/);
  assert.match(html, /disabled=""[^>]*>生成最终版/);
});

test('only explicit boolean confirmation counts', () => {
  for (const confirmed of [undefined, null, false, 'true', 1]) {
    assert.equal(allQuestionsConfirmed([question], [annotation(confirmed)]), false);
  }
  assert.equal(allQuestionsConfirmed([question], [annotation(true)]), true);
  assert.match(renderReview([question], [annotation(true)]), /checked=""/);
});

test('the latest saved review wins even when annotations arrive out of order', () => {
  assert.equal(allQuestionsConfirmed([question], [annotation(false, '2026-10-02T10:00:00Z'), annotation(true)]), false);
  assert.equal(allQuestionsConfirmed([question], [annotation(true, '2026-10-02T10:00:00Z'), annotation(false)]), true);
});

test('editing or reordering a question invalidates its old confirmation', () => {
  const saved = [annotation(true)];
  assert.equal(allQuestionsConfirmed([{ ...question, prompt: '変更済み' }], saved), false);
  assert.equal(allQuestionsConfirmed([{ prompt: 'New question' }, question], saved), false);
});

test('unsaved changed notes invalidate confirmation without mutating saved state', () => {
  const reviews = getQuestionReviews([annotation(true, undefined, { note: 'Original' })]);
  assert.equal(isQuestionConfirmed(key, reviews, { [key]: 'Edited' }), false);
  assert.equal(isQuestionConfirmed(key, reviews, { [key]: 'Original' }), true);
  assert.equal(isQuestionConfirmed(key, reviews), true);
});

test('legacy and malformed annotations cannot confirm questions or crash parsing', () => {
  const bodies = ['A free-text note', 'null', '[]', '{', '{"kind":"question_review","key":1,"confirmed":true}'];
  assert.equal(allQuestionsConfirmed([question], bodies.map((body) => ({ id: body, body, created_at: '' }))), false);
  assert.match(renderReview([]), /暂无可审核的题目/);
});

test('settings uses one section flow at every breakpoint and profile uses actual interface language', () => {
  const root = renderSettings();
  assert.match(root, /Display and Reading/);
  assert.match(root, /App language · English/);
  assert.doesNotMatch(root, /Native Chinese|母语|settings-profile-chevron|settings-desktop-stack|md:hidden/);
  const display = renderSettings('display');
  assert.match(display, /id="settings-display"/);
  assert.match(display, /Font size/);
  assert.doesNotMatch(display, /id="settings-pronunciation"|settings-navigation|Speech provider/);
});

test('account section exposes sign out and browser speech shows no credential form', () => {
  assert.match(renderSettings('account'), /Sign out/);
  const speech = renderSettings('pronunciation');
  assert.match(speech, /Browser&#x27;s built-in speech/);
  assert.doesNotMatch(speech, /type="password"/);
});

test('capture keeps the mobile keyboard closed on arrival and exposes a pending-capable form', () => {
  const html = renderCapture();
  assert.doesNotMatch(html, /autofocus/i);
  assert.match(html, /aria-busy="false"/);
  assert.match(html, /<button type="submit" disabled=""/);
});

test('search close and clear controls have at least 44px target classes', () => {
  const html = renderSearch();
  for (const label of ['Close search', 'Clear query']) {
    assert.match(html, new RegExp('aria-label="' + label + '" class="[^"]*h-11 w-11'));
  }
  assert.doesNotMatch(html, /#a84269|#fff0f5/);
});
