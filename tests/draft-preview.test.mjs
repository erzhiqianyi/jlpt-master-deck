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
    import { DraftsPanel } from './src/features/drafts/DraftsPanel';
    export function renderDraft() {
      const draft = {
        id: 'sample', title: 'N1 文法・第1課「時間関係」专项练习', status: 'draft',
        updated_at: '2026-09-27T00:00:00Z', annotations: [],
        content: {
          question_count: 56,
          sections: [{ title: '第1課・時間関係', questions: [{ id: 'e1-1', prompt: '空港に着く（　）、コンビニに駆け込んだ。', choices: ['が早いか', 'そばから'], answer: 'が早いか' }] }],
          grammar_points: [{ grammar_point: '～が早いか', core_memory: ['【核心】直后发生', '【接续】动词普通形'] }],
        },
      };
      return renderToStaticMarkup(<DraftsPanel labels={{ draftPracticeQuestions: '练习题', draftGrammarPoints: '语法点', draftUntitledItem: '未命名项目', draftBackToList: '返回草稿列表', draftShowAnswer: '显示答案' }} drafts={[draft]} activeDraft={draft} annotation="" onAnnotationChange={() => {}} onCreateDailyDraft={() => {}} onSelectDraft={() => {}} onSaveAnnotation={() => {}} onCopyRevisionContext={() => {}} detailDraftId="sample" embedded/>);
    }
  ` },
  bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', write: false,
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
const file = join(directory, 'render.mjs');
await writeFile(file, outputFiles[0].text);
const { renderDraft } = await import(pathToFileURL(file));

test('section questions remain visible alongside grammar points', () => {
  const html = renderDraft();
  assert.match(html, /空港に着く/);
  assert.match(html, /第 1 \/ 1 题/);
  assert.ok(html.indexOf('空港に着く') < html.indexOf('～が早いか'));
  assert.doesNotMatch(html, /未命名项目/);
  assert.match(html, /<li>【核心】直后发生<\/li>/);
  assert.match(html, /<li>【接续】动词普通形<\/li>/);
});
