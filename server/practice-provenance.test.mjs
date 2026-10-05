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
  translation_zh: `问题 ${id} 的完整中文译文。`,
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
  assert.equal(saved.questions[0].translationZh, '问题 textbook 的完整中文译文。');
  assert.equal(saved.questions[0].correctReason, '上下文要求选择符合接续的表达。');
  assert.equal(saved.questions[3].source_reference, undefined);
});

test('final publication preserves canonical reading kinds and accepts answer-only explanations', () => {
  for (const kindFields of [{ kind: 'kanji_to_kana', type: '漢字読み' }, { kind: 'kanji_to_kana' }, { type: '漢字読み' }]) {
    const draft = createReviewPackDraft(user.id, {
      title: '每日读音发布回归', status: 'approved',
      content: { sections: [{ title: '今日强化', questions: [{
        id: 'reading', ...kindFields, prompt: '給与には諸手当が含まれます。', target: '諸手当',
        choices: ['しょてあて', 'しょうてあて', 'しょであて', 'しょてあで'], answerIndex: 0,
      }] }] },
    });
    const published = createDailyPracticeFromDraft(user.id, draft.id);
    const saved = getDailyPractice(user.id, published.id).questions[0];
    assert.equal(saved.kind, 'kanji_to_kana');
    assert.equal(saved.answer, 'しょてあて');
    assert.equal(saved.correctReason, '正确答案是「しょてあて」。');
    assert.equal(saved.choiceAnalysis[1].explanation, '');
  }
});

test('final publication preserves all canonical kinds and still rejects missing grammar analysis', () => {
  const kinds = ['meaning', 'grammar', 'kana_to_kanji', 'word_formation', 'moji_goi', 'usage'];
  const draft = createReviewPackDraft(user.id, {
    title: 'canonical kinds', status: 'approved', content: { sections: [{ title: 'mixed', questions:
      kinds.map((kind) => ({ ...question(kind), kind })),
    }] },
  });
  assert.deepEqual(createDailyPracticeFromDraft(user.id, draft.id).questions.map((q) => q.kind), kinds);
  const invalid = createReviewPackDraft(user.id, {
    title: 'missing grammar', status: 'approved', content: { sections: [{ questions: [{
      ...question('grammar'), kind: 'grammar', choiceAnalysis: [],
    }] }] },
  });
  assert.throws(() => createDailyPracticeFromDraft(user.id, invalid.id), /缺少具体辨析/);
});
