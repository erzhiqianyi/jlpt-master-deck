// Reading distractors for 漢字読み questions. Every variant comes from a confusion learners
// actually make (on-reading swaps, long vowels, sokuon, voicing), never from blindly swapping
// the final kana, so each wrong choice can be explained concretely.

const ON_READING_SWAPS = [
  ['せい', 'しょう'],
  ['しょう', 'せい'],
  ['てい', 'たい'],
  ['ねん', 'とし'],
  ['とし', 'ねん'],
  ['かん', 'がん'],
  ['にん', 'じん'],
  ['じん', 'にん'],
  ['じょう', 'しょう'],
  ['もつ', 'ぶつ'],
  ['ぶつ', 'もつ'],
];

const SOKUON_BEFORE = /[かきくけこさしすせそたちつてとぱぴぷぺぽ]/u;
const LONG_O = /([おこそとのほもよろごぞどぼぽ]|[きしちにひみりぎじびぴ]ょ)う/gu;
const SHORT_O = /([こそとほごぞどぼ]|[きしちにひみりぎじび]ょ)(?![うょ])/gu;
const LONG_E = /([けせてねへめれげぜでべ])い/gu;

function stripVoicing(value) {
  return value.normalize('NFD').replace(/[゙゚]/gu, '').normalize('NFC');
}

function toggleVoicing(char) {
  const base = stripVoicing(char);
  if (base !== char) return base;
  const voiced = `${char}゙`.normalize('NFC');
  return voiced.length === 1 ? voiced : '';
}

function replaceAt(value, index, length, replacement) {
  return value.slice(0, index) + replacement + value.slice(index + length);
}

function everyMatch(reading, pattern, replace) {
  return [...reading.matchAll(pattern)].map((match) => replaceAt(reading, match.index, match[0].length, replace(match)));
}

function variantGroups(reading) {
  const onReading = ON_READING_SWAPS
    .filter(([source]) => reading.includes(source))
    .map(([source, target]) => reading.replace(source, target));

  const sokuon = [];
  for (let index = 1; index < reading.length - 1; index += 1) {
    const char = reading[index];
    const next = reading[index + 1];
    if (char === 'っ') sokuon.push(replaceAt(reading, index, 1, next === 'か' || next === 'こ' ? 'く' : 'つ'));
    else if ((char === 'つ' || char === 'く') && SOKUON_BEFORE.test(next)) sokuon.push(replaceAt(reading, index, 1, 'っ'));
  }

  const longVowel = [
    ...everyMatch(reading, LONG_O, (match) => match[1]),
    ...everyMatch(reading, LONG_E, (match) => match[1]),
    ...everyMatch(reading, SHORT_O, (match) => `${match[1]}う`),
  ];

  // Voicing confusion (rendaku and 清濁): toggle voicing on a non-initial kana.
  const voicing = [];
  for (let index = 1; index < reading.length; index += 1) {
    const toggled = toggleVoicing(reading[index]);
    if (toggled && toggled !== 'ゔ' && /[ぁ-ゖ]/u.test(toggled)) voicing.push(replaceAt(reading, index, 1, toggled));
  }

  return [onReading, sokuon, longVowel, voicing];
}

/** Plausible misreadings, interleaved across confusion types so choices are not all alike. */
export function readingDistractors(reading, limit = 6) {
  const value = String(reading ?? '');
  if (!value) return [];
  const groups = variantGroups(value);
  const result = [];
  for (let round = 0; result.length < limit && groups.some((group) => group[round] !== undefined); round += 1) {
    for (const group of groups) {
      const choice = group[round];
      if (choice && choice !== value && !result.includes(choice)) result.push(choice);
      if (result.length >= limit) break;
    }
  }
  return result;
}

/** Explain concretely how a wrong reading differs from the correct one, or '' if unrelated. */
export function describeReadingConfusion(choice, reading, original = '') {
  const wrong = String(choice ?? '');
  const right = String(reading ?? '');
  if (!wrong || !right || wrong === right) return '';
  let prefix = 0;
  while (prefix < wrong.length && prefix < right.length && wrong[prefix] === right[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < wrong.length - prefix
    && suffix < right.length - prefix
    && wrong[wrong.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) suffix += 1;
  const expected = right.slice(prefix, right.length - suffix);
  const actual = wrong.slice(prefix, wrong.length - suffix);
  // Too different to be a single confusion: let the caller use another explanation.
  if (expected.length > 4 || actual.length > 4) return '';

  const around = right.slice(Math.max(0, prefix - 1), prefix + expected.length + 1) || right;
  let detail;
  if (!expected && /^[うい]$/u.test(actual)) detail = `在「${around}」处多加了长音「${actual}」`;
  else if (/^[うい]$/u.test(expected) && !actual) detail = `漏掉了「${around}」中的长音「${expected}」`;
  else if (expected === 'っ') detail = `把促音「っ」读成了「${actual}」，没有促音化`;
  else if (actual === 'っ') detail = `把「${expected}」错误地促音化成了「っ」`;
  else if (expected.length === actual.length && stripVoicing(expected) === stripVoicing(actual)) {
    detail = stripVoicing(actual) === actual
      ? `把浊音「${expected}」读成了清音「${actual}」`
      : `把清音「${expected}」读成了浊音「${actual}」`;
  } else detail = `把「${expected}」读成了「${actual}」`;

  const target = original ? `「${original}」应读作「${right}」` : `正确读音是「${right}」`;
  return `「${wrong}」${detail}；${target}。`;
}
