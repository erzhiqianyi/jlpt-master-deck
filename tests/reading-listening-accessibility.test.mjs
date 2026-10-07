import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(join(tmpdir(), 'jlpt-reading-listening-'));
after(() => rm(directory, { recursive: true, force: true }));
const { outputFiles } = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import { renderToStaticMarkup } from 'react-dom/server';
    import { ReadingChoiceGrid, ReadingPanel } from './src/features/reading/ReadingPanel';
    import { ListeningPanel } from './src/features/listening/ListeningPanel';
    export { requestListeningShare } from './src/features/listening/listeningShare';
    import { WordLookupProvider } from './src/features/review/WordLookup';
    const noop = () => {};
    const labels = { readingShowAnswer: 'Check answer', listeningShowAnswer: 'Check answer', listeningBackToList: 'Back to library', listeningAudioLoading: 'Loading audio', listeningExplanation: 'Explanation', listeningDelete: 'Delete', listeningTranscript: 'Transcript' };
    const reading = { id: 'reading-1', title: 'A passage', passage: '日本語を勉強します。', question: 'What does the author do?', choices: ['日本語を勉強する', '日本語を教える'], answerIndex: 0, tags: [], createdAt: '2026-10-01' };
    export function renderChoices(segmented, selected = null, revealed = false) {
      return renderToStaticMarkup(<WordLookupProvider items={[]} captures={[]} locale="en" enabled={false} onCapture={async () => {}} authToken="" ttsProvider="browser"><ReadingChoiceGrid item={reading} segmented={segmented} selected={selected} revealed={revealed} onSelect={noop} /></WordLookupProvider>);
    }
    export function renderReading() {
      return renderToStaticMarkup(<ReadingPanel mode="library" labels={labels} locale="en" questions={[reading]} activeQuestionId={reading.id} onRecordPractice={async () => {}} onCreate={async () => {}} onDelete={async () => {}} />);
    }
    export function renderListening({ mobile = false, sameStem = false, freeResponse = false } = {}) {
      globalThis.window = { matchMedia: () => ({ matches: mobile }) };
      const question = { id: 'listening-1', title: 'Listening title', question: sameStem ? 'Listening title' : 'Which train should the speaker take?', choices: freeResponse ? [] : ['Train A', 'Train B'], answerIndex: 0, questionTypeId: 'listening-task', audioFileName: 'audio.mp3', audioAssetId: 'audio-1', audioSize: 100, createdAt: '2026-10-01', explanation: 'Private answer explanation' };
      return renderToStaticMarkup(<ListeningPanel mode="library" labels={labels} locale="en" token="fixture" questions={[question]} activeQuestionId={question.id} onRecordPractice={async () => {}} onCreate={async () => {}} onUpdate={async () => {}} onDelete={async () => {}} />);
    }
  ` },
  bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', write: false, loader: { '.css': 'empty' },
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
const file = join(directory, 'render.mjs');
await writeFile(file, outputFiles[0].text);
const { renderChoices, renderReading, renderListening, requestListeningShare } = await import(pathToFileURL(file));
const readingCss = await readFile(new URL('../src/features/reading/reading.css', import.meta.url), 'utf8');
const listeningCss = await readFile(new URL('../src/features/listening/listening.css', import.meta.url), 'utf8');

test('normal reading choices keep the entire option as the answer button', () => {
  const html = renderChoices(false, 1);
  assert.equal((html.match(/class="reading-choice"/g) ?? []).length, 2);
  assert.match(html, /<button[^>]*aria-pressed="true"[^>]*class="reading-choice">/);
  assert.match(html, /<span class="reading-choice-number">2<\/span>/);
  assert.doesNotMatch(html, /lookup-word/);
});

test('lookup answers and word lookups remain separate controls with 44px number targets', () => {
  const html = renderChoices(true);
  assert.equal((html.match(/class="reading-choice-number shrink-0"/g) ?? []).length, 2);
  assert.match(html, /<div[^>]*class="reading-choice">/);
  assert.match(html, /class="lookup-word/);
  assert.match(readingCss, /button\.reading-choice-number\s*\{[^}]*width: 44px;[^}]*height: 44px;/s);
});

test('reading answer state styling and passage disclosure remain intact', () => {
  const html = renderChoices(true, 1, true);
  assert.match(html, /data-answer-state="correct"/);
  assert.match(html, /data-answer-state="incorrect"/);
  const passage = renderReading();
  assert.match(passage, /<details class="reading-passage-body" open="">/);
  assert.match(passage, /<summary[^>]*>Passage<\/summary>/);
  assert.match(passage, /What does the author do\?/);
  assert.match(readingCss, /\.reading-passage summary,[\s\S]*?min-height: 44px;/);
});

test('listening group details show distinct question stems on both mobile and desktop', () => {
  for (const mobile of [true, false]) {
    const html = renderListening({ mobile });
    assert.match(html, /Which train should the speaker take\?/);
    assert.equal((html.match(/data-answer-state="unanswered"/g) ?? []).length, 2);
    assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 2);
    assert.doesNotMatch(html, /Private answer explanation/);
    assert.match(html, /listening-workspace/);
  }
});

test('listening avoids duplicate title stems and preserves free response', () => {
  assert.doesNotMatch(renderListening({ sameStem: true }), /<p class="mt-5 whitespace-pre-wrap text-base font-semibold leading-7">Listening title/);
  const html = renderListening({ freeResponse: true });
  assert.match(html, /<textarea/);
  assert.doesNotMatch(html, /type="radio"/);
});

test('listening sizing and wrapping rules stay within its feature boundary', () => {
  assert.match(listeningCss, /\.listening-workspace\s*\{[^}]*overflow-wrap: anywhere;/s);
  assert.match(listeningCss, /\.listening-workspace button,[^}]*min-height: 44px;/s);
  assert.match(listeningCss, /\.listening-workspace button\s*\{[^}]*min-width: 44px;/s);
  assert.match(listeningCss, /\.listening-workspace audio\s*\{[^}]*max-width: 100%;/s);
});


test('listening share waits for explicit confirmation and cancellation never publishes', async () => {
  let publishCalls = 0;
  let finish;
  let prompt;
  const request = requestListeningShare({ filename: 'lesson.mp3', questionCount: 3, locale: 'en',
    confirm: (options) => { prompt = options; return new Promise((resolve) => { finish = resolve; }); },
    publish: async () => { publishCalls += 1; return { id: 'fixture-share' }; },
  });
  assert.equal(publishCalls, 0);
  assert.match(prompt.description, /lesson\.mp3/);
  assert.match(prompt.description, /Discover for other users/);
  assert.match(prompt.description, /3 questions with answers and explanations/);
  assert.match(prompt.description, /transcript and translation/);
  finish(false);
  assert.equal(await request, null);
  assert.equal(publishCalls, 0);
});

test('approved listening share invokes only the supplied publication action', async () => {
  let publishCalls = 0;
  const result = await requestListeningShare({ filename: 'lesson.mp3', questionCount: 1, locale: 'ja',
    confirm: async (prompt) => { assert.match(prompt.description, /他のユーザー/); return true; },
    publish: async () => { publishCalls += 1; return { id: 'fixture-share' }; },
  });
  assert.deepEqual(result, { id: 'fixture-share' });
  assert.equal(publishCalls, 1);
  assert.match(renderListening(), /Share publicly/);
});
