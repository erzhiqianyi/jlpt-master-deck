// Stable domain taxonomy. UI and legacy storage may retain their original kind.
const definitions = [
  ['vocabulary-kanji-reading', 'vocabulary', ['kanji_to_kana', '漢字読み'], [1,2,3,4,5]],
  ['vocabulary-orthography', 'vocabulary', ['kana_to_kanji', '表記'], [2,3,4,5]],
  ['vocabulary-word-formation', 'vocabulary', ['word_formation', '語形成'], [2]],
  ['vocabulary-context', 'vocabulary', ['moji_goi', '文脈規定'], [1,2,3,4,5]],
  ['vocabulary-paraphrase', 'vocabulary', ['meaning', '言い換え類義'], [1,2,3,4,5]],
  ['vocabulary-usage', 'vocabulary', ['usage', '用法'], [1,2,3]],
  ['grammar-form', 'grammar', ['grammar', '文法形式の判断'], [1,2,3,4,5]],
  ['grammar-composition', 'grammar', ['文の組み立て'], [1,2,3,4,5]],
  ['grammar-text', 'grammar', ['文章の文法'], [1,2,3,4,5]],
  ...['short','mid','long','integrated','thematic','information'].map(type =>
    [`reading-${type}`, 'reading', [], type === 'long' ? [1,3] : ['integrated','thematic'].includes(type) ? [1,2] : [1,2,3,4,5]]),
  ['reading-basic-training', 'reading', ['reading', 'unclassified'], []],
  ...['task','points','outline','expression','quick','integrated'].map(type =>
    [`listening-${type}`, 'listening', [], type === 'integrated' ? [1,2] : type === 'expression' ? [3,4,5] : type === 'outline' ? [1,2,3] : [1,2,3,4,5]]),
  ['listening-basic-training', 'listening', [], []],
];
export const questionStrategies = Object.freeze(Object.fromEntries(definitions.map(([id,module,aliases,levels]) => [id, Object.freeze({
  id, module, aliases: Object.freeze(aliases), applicableLevels: Object.freeze(levels.map(n => `N${n}`)),
  supplementary: id.endsWith('basic-training'),
  explanationTemplate: `${id}:option-evidence`, tipKey: id,
  validateAnswer: resolveLegacyAnswer,
})])));
export function questionStrategy(kind) {
  return questionStrategies[kind] ?? Object.values(questionStrategies).find(strategy => strategy.aliases.includes(kind)) ?? null;
}

// No inference from a bare numeric answer: callers must declare that source's base.
export function resolveLegacyAnswer(question, { numericAnswerBase } = {}) {
  const choices = question.choices;
  if (!Array.isArray(choices) || choices.length < 2) throw new Error('Question requires choices');
  const options = choices.map((choice,index) => ({ id: `option-${index}`, text: String(choice) }));
  let index;
  if (question.answerIndex !== undefined) {
    index = question.answerIndex;
    if (!Number.isInteger(index)) throw new Error('answerIndex must be a zero-based integer');
  } else if (typeof question.answer === 'number') {
    if (numericAnswerBase !== 0 && numericAnswerBase !== 1) throw new Error('Numeric answer requires explicit source base');
    index = question.answer - numericAnswerBase;
  } else {
    const matches = options.flatMap((option,i) => option.text === String(question.answer ?? '') ? [i] : []);
    if (matches.length !== 1) throw new Error('Answer text must match exactly one choice');
    [index] = matches;
  }
  if (!Number.isInteger(index) || index < 0 || index >= options.length) throw new Error('Invalid answer index');
  if (question.answerIndex !== undefined && question.answer !== undefined) {
    const expected = typeof question.answer === 'number'
      ? (numericAnswerBase === 0 || numericAnswerBase === 1 ? question.answer - numericAnswerBase : undefined)
      : options[index].text === String(question.answer) ? index : undefined;
    if (expected !== index) throw new Error('Conflicting answer and answerIndex');
  }
  return { options, answer: { type: 'single', optionId: options[index].id }, answerIndex: index };
}
