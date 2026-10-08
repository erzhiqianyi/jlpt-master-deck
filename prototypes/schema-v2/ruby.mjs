// 按需注音：Anki 写法。汉字[かな]，汉字前面紧接其他字符时用一个空格划定范围：まだ 寒[さむ]い
// 原文永远存在业务列里；注音只是附加层，去掉标记后必须与原文完全一致才会被使用。

const RUBY = / ?([^ \[\]]+?)\[([^\]]*)\]/g;
const KANJI_BASE = /^[\p{Script=Han}々〆ヶ]+$/u;
const KANA_READING = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;

// 与 Anki 的 {{kanji:}} 过滤器一致：去掉 [读音] 和划定范围的空格
export const stripRuby = (annotated) => annotated.replace(RUBY, '$1');

// 拆成显示片段：[{ text, reading? }]
export function parseRuby(annotated) {
  const segments = [];
  let last = 0;
  for (const match of annotated.matchAll(RUBY)) {
    if (match.index > last) segments.push({ text: annotated.slice(last, match.index) });
    segments.push({ text: match[1], reading: match[2] });
    last = match.index + match[0].length;
  }
  if (last < annotated.length) segments.push({ text: annotated.slice(last) });
  return segments;
}

// 写入前校验；返回错误列表，空表示通过
export function validateRuby(annotated, currentText) {
  const errors = [];
  for (const { text, reading } of parseRuby(annotated).filter((s) => s.reading !== undefined)) {
    if (!KANJI_BASE.test(text)) errors.push(`「${text}」不是纯汉字：请在汉字前加一个空格，让注音只覆盖汉字`);
    if (!KANA_READING.test(reading)) errors.push(`「${text}」的读音「${reading}」只能包含假名`);
  }
  if (stripRuby(annotated) !== currentText) errors.push('去掉注音标记后与原文不一致');
  return errors;
}

// 渲染成文本形式，便于在终端演示：学校(がっこう)
export const renderRubyText = (annotated) =>
  parseRuby(annotated).map((s) => (s.reading ? `${s.text}(${s.reading})` : s.text)).join('');
