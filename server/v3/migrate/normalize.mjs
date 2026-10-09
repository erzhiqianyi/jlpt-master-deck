// 旧数据的规范化：题型、词性、等级、语言判断、题干规范化。
import { questionStrategy } from '../../../src/domain/questionContract.mjs';

// 旧数据里的自定义题型名：没有完全对应的正式题型，归入最接近的一种（迁移报告单独列出）
export const CUSTOM_KINDS = { description_selection: 'vocabulary-paraphrase', reading_logic: 'grammar-form', error_detection: 'grammar-form' };

/** 旧 kind / questionTypeId → 官方题型 ID。 */
export function typeIdFor(question, { source } = {}) {
  const raw = question?.questionTypeId ?? question?.question_type_id ?? question?.kind ?? null;
  if (source === 'reading') return 'reading-basic-training';
  if (raw === 'listening-basic-training') {
    const choices = Array.isArray(question.choices) ? question.choices : [];
    if (choices.length >= 2) return 'listening-basic-discrimination';
    // 解析里有「标准还原」（把缩约、音变还原成标准形）的是听写：参考答案就是还原后的句子
    return expectedTextOf(question) ? 'listening-basic-dictation' : 'listening-basic-free';
  }
  if (raw === 'grammar' || raw === '文法') return /★/.test(question?.prompt ?? '') ? 'grammar-composition' : 'grammar-form';
  const strategy = raw ? questionStrategy(raw) : null;
  if (strategy) return strategy.id;
  return CUSTOM_KINDS[raw] ?? null;
}

/** 听写题的参考答案：解析中【标准还原】与下一个【…】之间的文字。 */
export function expectedTextOf(question) {
  const text = [question?.correctReason, question?.explanation_zh, question?.explanation].filter((v) => typeof v === 'string').join('\n');
  const match = /【标准还原】\s*([\s\S]*?)\s*(?=【|$)/.exec(text);
  return match?.[1]?.trim() || null;
}

export const moduleOf = (typeId) => typeId.split('-')[0];
export const questionPrefix = (typeId) => ({ vocabulary: 'QV', grammar: 'QG', reading: 'QR', listening: 'QL' }[moduleOf(typeId)]);

/** 知识点大类：旧 type → word / grammar / name。 */
export function kindOf(item) {
  const type = String(item.type ?? '').trim();
  if (type === 'proper_name') return 'name';
  if (type === 'grammar' || type === 'listening_rule') return 'grammar';
  if (!type && item.deck === 'grammar_expression') return 'grammar';
  return 'word';
}
/** 细分类型转成的标签。 */
export const typeTag = { phrase: '词组', expression: '惯用表达', phrase_set: '表达集合', listening_rule: '口语音变' };

const SIMPLIFIED = { 动: '動', 词: '詞', 连: '連', 变: '変', 过: '過', 语: '語', 类: '類', 态: '態', 级: '級' };
const POS_WORDS = new Set([
  '名詞', '動詞', '自動詞', '他動詞', '形容詞', '形容動詞', 'ナ形容詞', 'な形容詞', 'イ形容詞', 'い形容詞', '副詞', '接続詞', '連体詞', '感動詞',
  '接頭辞', '接頭語', '接尾辞', '接尾語', '連語', '慣用表現', '慣用句', '固有名詞', 'サ変動詞', 'サ変自動詞', 'サ変他動詞', 'サ変表現', 'サ変用法',
  '補助動詞', '複合動詞', '自他両用', '表現', '名詞句', '動詞句', 'イ形容詞句', '名詞表現', '名詞述語句', '固定表現', 'ことわざ',
]);
const isConjugationWord = (s) => /^(?:[ァ-ヶ]行)?(?:五段|一段|上一段|下一段|カ変|サ変)(?:活用|動詞)?$/.test(s) || /^(?:五段|一段)動詞$/.test(s) || /(?:形|連用形|て形|過去形|可能形|否定形|受身形)$/.test(s);

/**
 * 旧词性文字 + inflection_class → { pos, transitivity, isSuruNoun, tags, unresolved }。
 * 规则见设计文档 §5“词性换算”。
 */
export function convertPartOfSpeech({ partOfSpeech, inflectionClass, kind, expression, baseForm }) {
  const text = String(partOfSpeech ?? '').replace(/[动词连变过语类态级]/g, (c) => SIMPLIFIED[c]).normalize('NFKC').trim();
  const ic = String(inflectionClass ?? '').trim();
  const head = expression ?? '';
  const dictionary = baseForm || head;
  const result = { pos: null, transitivity: null, isSuruNoun: false, tags: [], unresolved: false };
  const segments = text.split(/[・、，,／/（）()「」\s]+/).map((s) => s.trim()).filter(Boolean);
  for (const segment of segments) {
    if (POS_WORDS.has(segment) || isConjugationWord(segment)) continue;
    if (/^文法$|^口語$|^口語縮約$/.test(segment)) continue;
    if (/動詞|形容詞|名詞/.test(segment) && segment.length > 6) continue; // 「動詞「済む」の否定形」等说明性长串
    result.tags.push(segment);
  }
  if (/文法・/.test(text)) result.tags = [...new Set(result.tags)];
  if (kind === 'grammar' || kind === 'name') return { ...result, tags: [...new Set(result.tags)] };

  const verbFromClass = { godan: 'verb_1', ichidan: 'verb_2', kuru: 'verb_3_kuru' }[ic];
  if (verbFromClass) result.pos = verbFromClass;
  else if (ic === 'suru') {
    if (/する$/.test(dictionary) && !/^名詞/.test(text) && /する$/.test(head)) result.pos = 'verb_3_suru';
    else { result.pos = 'noun'; result.isSuruNoun = true; }
  } else if (ic === 'i_adjective') result.pos = 'i_adjective';
  else if (ic === 'na_adjective') result.pos = 'na_adjective';

  if (!result.pos) {
    if (/カ変/.test(text) || /^(来る|くる)$/.test(head)) result.pos = 'verb_3_kuru';
    else if (/五段/.test(text)) result.pos = 'verb_1';
    else if (/一段/.test(text)) result.pos = 'verb_2';
    else if (/動詞/.test(text) && /サ変|する$/.test(text + head) && /する$/.test(head)) result.pos = 'verb_3_suru';
    else if (/^(?:動詞|自動詞|他動詞)/.test(text)) result.unresolved = true; // 动词但没写分组
    else if (/イ形容詞|い形容詞|^形容詞/.test(text)) result.pos = 'i_adjective';
    else if (/ナ形容詞|な形容詞|形容動詞/.test(text)) result.pos = /^名詞/.test(text) && !/^名詞・ナ形容詞/.test(text) ? 'noun' : 'na_adjective';
    else if (/^連体詞/.test(text)) result.pos = 'adnominal';
    else if (/^接続詞/.test(text)) result.pos = 'conjunction';
    else if (/^感動詞/.test(text)) result.pos = 'interjection';
    else if (/^副詞/.test(text)) result.pos = 'adverb';
    else if (/^接頭/.test(text)) result.pos = 'prefix';
    else if (/^接尾/.test(text)) result.pos = 'suffix';
    else if (/慣用|ことわざ|固定表現/.test(text)) result.pos = 'idiom';
    else if (/^名詞|^固有名詞|地名|駅名|人名|山名|寺院名|神社名|大学名|作品名|時間名詞/.test(text)) result.pos = 'noun';
    else if (/連語|句|表現/.test(text)) result.pos = 'phrase';
    else if (text) result.unresolved = true;
  }
  if (result.pos === 'noun' && /サ変/.test(text)) result.isSuruNoun = true;
  if (result.pos?.startsWith('verb_')) {
    const transitive = /他動詞/.test(text);
    const intransitive = /自動詞/.test(text);
    result.transitivity = transitive && intransitive ? 'both' : transitive ? 'transitive' : intransitive ? 'intransitive' : null;
  }
  result.tags = [...new Set(result.tags)];
  return result;
}

/** 旧 jlpt_level → { min, max, tag }。 */
export function convertLevel(value) {
  const text = String(value ?? '').normalize('NFKC').trim();
  if (!text || text === 'unknown') return { min: null, max: null, tag: null };
  let m = /^N([1-5])$/.exec(text);
  if (m) return { min: `N${m[1]}`, max: `N${m[1]}`, tag: null };
  m = /^N([1-5])\s*[-~〜～]\s*N([1-5])$/.exec(text);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return { min: `N${Math.max(a, b)}`, max: `N${Math.min(a, b)}`, tag: null };
  }
  m = /^N([1-5])関連$/.exec(text);
  if (m) return { min: `N${m[1]}`, max: `N${m[1]}`, tag: null };
  return { min: null, max: null, tag: text };
}

/** 没有标语言的说明文字：假名占汉字和假名总数一半以上视为日语，否则视为简体中文。 */
export function detectLanguage(text) {
  const value = String(text ?? '');
  const kana = (value.match(/[぀-ヿ]/g) ?? []).length;
  const han = (value.match(/[一-鿿]/g) ?? []).length;
  if (!kana && !han) return 'zh-Hans'; // 旧数据的说明都是写给中文学习者的；只有字母（缩写 ES 等）也按简体中文
  return kana / (kana + han) > 0.5 ? 'ja' : 'zh-Hans';
}

/** 去重用的题干规范化：NFKC、去空白、统一括号与下划线。 */
export function normalizePrompt(prompt) {
  return String(prompt ?? '').normalize('NFKC').replace(/\s+/g, '').replace(/[（(]\s*[)）]/g, '()').replace(/[＿_]+/g, '_');
}

/** 选项文字比较用的规范化。 */
export const normalizeChoice = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/g, '').trim();
