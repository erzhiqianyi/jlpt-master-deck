import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'jlpt-practice-source-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const { createUser, createReviewPackDraft, listReviewPackDrafts, createDailyPracticeFromDraft, getDailyPractice, getDb } = await import('./storage.mjs');
const user = createUser('source-owner', 'test-pass');
after(() => { getDb().close(); rmSync(dir, { recursive: true, force: true }); });

const question = (id, source_origin, source_reference) => ({
  id, kind: '文法', prompt: `问题 ${id}`, choices: ['正解', '誤答'], answer: '正解',
  explanation_zh: '上下文要求选择符合接续的表达。',
  choiceAnalysis: [
    { choice: '正解', explanation: '符合题干给出的接续形式。' },
    { choice: '誤答', explanation: '这个选项的接续形式与题干不符。' },
  ],
  ...(source_origin ? { source_origin } : {}),
  ...(source_reference ? { source_reference } : {}),
});

test('draft and published practice preserve only explicit, evidenced question origins', () => {
  const draft = createReviewPackDraft(user.id, {
    title: '来源检查专项', status: 'approved',
    content: { sections: [{ title: '文法', questions: [
      question('textbook', 'textbook_original', '教材 A 第 2 课 3 题'),
      question('generated', 'ai_generated'),
      question('legacy'),
      question('missing-citation', 'textbook_original'),
    ] }] },
  });
  assert.equal(listReviewPackDrafts(user.id).find((entry) => entry.id === draft.id)?.sourceSummary,
    '教材原题 1 · AI 生成 1 · 来源待确认 2');

  const published = createDailyPracticeFromDraft(user.id, draft.id);
  const saved = getDailyPractice(user.id, published.id);
  assert.equal(saved.sourceSummary, '教材原题 1 · AI 生成 1 · 来源待确认 2');
  assert.deepEqual(saved.questions.map((entry) => entry.source_origin),
    ['textbook_original', 'ai_generated', undefined, undefined]);
  assert.equal(saved.questions[0].source_reference, '教材 A 第 2 课 3 题');
  assert.equal(saved.questions[3].source_reference, undefined);
});
