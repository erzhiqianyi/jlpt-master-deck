import assert from 'node:assert/strict';
import test from 'node:test';
import { listeningEditorContent } from './listeningExplanation.ts';

const legacyExplanation = `【听力原文】
女：車での来場を減らしましょう。

【全文翻译】
女：减少开车来的人吧。

【正确答案】
2「環境のため」＝为了环境。

【解题关键】
女方提到了活动主题。

【选项分析】
1. 苦情が出るから
＝因为会有投诉。
× 错。上次的问题已经解决。

2. 環境のため
＝为了环境。
○ 正确。与活动主题一致。

【干扰项是怎么设置的】
这里的旧内容在保存时已经截断：这个内`;

function question(overrides = {}) {
  return {
    choices: ['苦情が出るから', '環境のため'],
    choiceDetails: [{ translation: '', explanation: '' }, { translation: '', explanation: '' }],
    transcript: '',
    transcriptTranslation: '',
    explanation: legacyExplanation,
    ...overrides,
  };
}

test('legacy listening sections populate their edit fields without losing remaining analysis', () => {
  const result = listeningEditorContent(question());
  assert.equal(result.transcript, '女：車での来場を減らしましょう。');
  assert.equal(result.transcriptTranslation, '女：减少开车来的人吧。');
  assert.deepEqual(result.choiceDetails, [
    { translation: '因为会有投诉。', explanation: '× 错。上次的问题已经解决。' },
    { translation: '为了环境。', explanation: '○ 正确。与活动主题一致。' },
  ]);
  assert.match(result.explanation, /【解题关键】/);
  assert.match(result.explanation, /这个内$/);
  assert.doesNotMatch(result.explanation, /【听力原文】|【全文翻译】|【选项分析】/);
});

test('conflicting structured content leaves the legacy section available for manual review', () => {
  const result = listeningEditorContent(question({
    transcript: '另一个原文',
    choiceDetails: [{ translation: '已有翻译', explanation: '' }, { translation: '', explanation: '' }],
  }));
  assert.equal(result.transcript, '另一个原文');
  assert.match(result.explanation, /【听力原文】/);
  assert.match(result.explanation, /【选项分析】/);
  assert.equal(result.choiceDetails[0].translation, '已有翻译');
});
