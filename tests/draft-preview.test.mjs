import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(join(tmpdir(), 'jlpt-draft-preview-'));
after(() => rm(directory, { recursive: true, force: true }));
const { outputFiles } = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { DraftsPanel, grammarPointsForQuestion } from './src/features/drafts/DraftsPanel';
    export function renderDraft(answer = 'が早いか') {
      const draft = {
        id: 'sample', title: 'N1 文法・第1課「時間関係」专项练习', status: 'draft',
        updated_at: '2026-09-27T00:00:00Z', annotations: [],
        content: {
          question_count: 56,
          sections: [{ title: '第1課・時間関係', questions: [{ id: 'e1-1', prompt: '空港に着く（　）、コンビニに駆け込んだ。', tested: '～が早いか', choices: ['が早いか', 'そばから'], answer }] }],
          grammar_points: [{ grammar_point: '～が早いか', core_memory: ['【核心】直后发生', '【接续】动词普通形'] }],
        },
      };
      return renderToStaticMarkup(<DraftsPanel labels={{ draftPracticeQuestions: '练习题', draftGrammarPoints: '语法点', draftUntitledItem: '未命名项目', draftBackToList: '返回草稿列表', draftShowAnswer: '显示答案' }} drafts={[draft]} activeDraft={draft} annotation="" onAnnotationChange={() => {}} onCreateDailyDraft={() => {}} onSelectDraft={() => {}} onSaveAnnotation={() => {}} onCopyRevisionContext={() => {}} detailDraftId="sample" embedded/>);
    }
    export function selectGrammar(question, items) {
      return grammarPointsForQuestion(question, items).map((item) => item.grammar_point);
    }
  ` },
  bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', write: false,
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
const file = join(directory, 'render.mjs');
await writeFile(file, outputFiles[0].text);
const { renderDraft, selectGrammar } = await import(pathToFileURL(file));

test('section questions appear without revealing grammar notes or the tested expression', () => {
  const html = renderDraft();
  assert.match(html, /空港に着く/);
  assert.match(html, /第 1 \/ 1 题/);
  assert.doesNotMatch(html, /【核心】|【接续】|考查语法|<h4[^>]*>～が早いか<\/h4>/);
});

test('draft preview accepts numeric answers and safely ignores malformed answer values', () => {
  for (const answer of [1, 2, ' 2 ', 0, -1, 1.5, NaN, Infinity, null, true, {}, []]) {
    assert.match(renderDraft(answer), /空港に着く/);
  }
});

test('grammar notes follow the current options, with tested grammar for form questions', () => {
  const items = ['～が早いか', '～や・～や否や', '～なり', '～そばから', '～てからというもの（は）', '～にあって']
    .map((grammar_point) => ({ grammar_point }));
  assert.deepEqual(selectGrammar({ tested: '～そばから', choices: ['そばから', 'なり', 'にあって'] }, items), ['～そばから', '～なり', '～にあって']);
  assert.deepEqual(selectGrammar({ tested: '～てからというもの（は）', choices: ['見るや否や', '見てからというもの', '見るなり'] }, items), ['～や・～や否や', '～てからというもの（は）', '～なり']);
  assert.deepEqual(selectGrammar({ tested: '～が早いか', choices: ['見て', '見る', '見るの'] }, items), ['～が早いか']);
});
