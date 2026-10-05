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
    export { draftReviewQuestions, reviewedDraftSections, questionReviewKey } from './src/features/drafts/questionReviewState';
    export function renderDraft(answer = 'が早いか', review = false, promptFields = {}) {
      const draft = {
        id: 'sample', title: 'N1 文法・第1課「時間関係」专项练习', status: 'draft',
        updated_at: '2026-09-27T00:00:00Z', annotations: [],
        content: {
          question_count: 56,
          sections: [{ title: '第1課・時間関係', questions: [{ id: 'e1-1', prompt: '空港に着く（　）、コンビニに駆け込んだ。', tested: '～が早いか', choices: ['が早いか', 'そばから'], answer, ...promptFields }] }],
          grammar_points: [{ grammar_point: '～が早いか', core_memory: ['【核心】直后发生', '【接续】动词普通形'] }],
        },
      };
      return renderToStaticMarkup(<DraftsPanel labels={{ draftPracticeQuestions: '练习题', draftGrammarPoints: '语法点', draftUntitledItem: '未命名项目', draftBackToList: '返回草稿列表', draftShowAnswer: '显示答案' }} drafts={[draft]} activeDraft={draft} annotation="" onAnnotationChange={() => {}} onCreateDailyDraft={() => {}} onSelectDraft={() => {}} onSaveAnnotation={() => {}} onCopyRevisionContext={() => {}} onSaveQuestionReview={review ? async () => {} : undefined} onFinalizeReviewedDraft={review ? async () => {} : undefined} detailDraftId="sample" embedded/>);
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
const { renderDraft, selectGrammar, draftReviewQuestions, reviewedDraftSections, questionReviewKey } = await import(pathToFileURL(file));

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


test('section-based drafts use the same review workspace with group titles and bulk confirmation', () => {
  const html = renderDraft('が早いか', true);
  assert.match(html, /题目导航/);
  assert.match(html, /一键确认全部/);
  assert.match(html, /question-review-group-title[^>]*>第1課・時間関係/);
  assert.doesNotMatch(html, /记生词 \/ 提建议/);
});

test('draft extraction preserves order, confirmation keys and group metadata across finalization', () => {
  const first = { id: 'q1', prompt: 'A' }, second = { id: 'q2', prompt: 'B' };
  const content = { sections: [{ title: 'Group A', instruction: 'Read', questions: [first] }, { title: 'Notes', body: 'Keep' }, { title: 'Group B', questions: [second] }] };
  const review = draftReviewQuestions(content);
  assert.deepEqual(review.questions, [first, second]);
  assert.equal(questionReviewKey(review.questions[0], 0), questionReviewKey(first, 0));
  const final = [{ ...first, answerIndex: 0 }, { ...second, answerIndex: 1 }];
  const sections = reviewedDraftSections(content, final, 'Practice');
  assert.deepEqual(sections, [{ ...content.sections[0], questions: [final[0]] }, content.sections[1], { ...content.sections[2], questions: [final[1]] }]);
});

test('legacy arrays retain precedence without duplicating questions and preserve supplementary sections', () => {
  const questions = [{ prompt: 'A' }, { prompt: 'B' }];
  for (const field of ['generated_practice', 'quiz', 'practice_questions', 'review_questions']) {
    const content = { [field]: questions, sections: [{ title: 'Notes', body: 'Keep' }, { title: 'Duplicate', questions }] };
    assert.deepEqual(draftReviewQuestions(content).questions, questions);
    assert.deepEqual(reviewedDraftSections(content, questions, 'Final'), [content.sections[0], { id: 'reviewed', title: 'Final', questions }]);
  }
  assert.deepEqual(draftReviewQuestions({ quiz: [], sections: [{ questions }] }).questions, questions);
  assert.deepEqual(draftReviewQuestions(null).questions, []);
});

 test('draft preview marks promptTarget in both preview and confirmation workspace without changing prompt text', () => {
  const prompt = 'この会社は客先常駐の案件が多いです。';
  for (const review of [false, true]) {
    const html = renderDraft('が早いか', review, { prompt, promptTarget: '客先常駐' });
    assert.match(html, /この会社は<span class="font-semibold underline decoration-2 underline-offset-4">客先常駐<\/span>の案件が多いです。/);
    for (const promptTarget of [undefined, '', '存在しない単語']) {
      const fallback = renderDraft('が早いか', review, { prompt, promptTarget });
      assert.ok(fallback.includes(prompt));
      assert.doesNotMatch(fallback, /underline-offset-4/);
    }
  }
});
