// 全局参考数据：日语活用规则库（变形种类 + 规则），以及记忆卡模板的英文、日文名称。启动时写入，重复执行不会重复插入。
// 规则 = 词性 + 辞书形词尾 + 变形种类 → 去掉词尾后接上的部分；生成时取最长匹配的词尾，例外动词只是词尾更长的规则。

export const CONJUGATION_FORMS = [
  // [code, 日本語教育的名称, 适用于, 排序]
  ['dictionary', '辞書形', 'both'], ['polite', 'ます形', 'verb'], ['negative', 'ない形', 'both'], ['past', 'た形', 'both'],
  ['te', 'て形', 'both'], ['potential', '可能形', 'verb'], ['passive', '受身形', 'verb'], ['causative', '使役形', 'verb'],
  ['causative_passive', '使役受身形', 'verb'], ['volitional', '意向形', 'verb'], ['conditional_ba', '条件形（ば）', 'both'],
  ['conditional_tara', 'たら形', 'both'], ['imperative', '命令形', 'verb'], ['prohibitive', '禁止形', 'verb'],
  ['adverbial', '副詞形', 'adjective'], ['attributive', '連体形', 'adjective'],
].map(([code, label, appliesTo], i) => ({ code, label, appliesTo, sortOrder: i }));

// 五段动词：词尾 → [い段, あ段, え段, お段, て形, た形]
const GODAN = {
  う: ['い', 'わ', 'え', 'お', 'って', 'った'], く: ['き', 'か', 'け', 'こ', 'いて', 'いた'], ぐ: ['ぎ', 'が', 'げ', 'ご', 'いで', 'いだ'],
  す: ['し', 'さ', 'せ', 'そ', 'して', 'した'], つ: ['ち', 'た', 'て', 'と', 'って', 'った'], ぬ: ['に', 'な', 'ね', 'の', 'んで', 'んだ'],
  ぶ: ['び', 'ば', 'べ', 'ぼ', 'んで', 'んだ'], む: ['み', 'ま', 'め', 'も', 'んで', 'んだ'], る: ['り', 'ら', 'れ', 'ろ', 'って', 'った'],
};

function godanRules() {
  const rules = [];
  for (const [ending, [i, a, e, o, te, ta]] of Object.entries(GODAN)) {
    const forms = {
      dictionary: ending, polite: `${i}ます`, negative: `${a}ない`, past: ta, te, potential: `${e}る`, passive: `${a}れる`,
      causative: `${a}せる`, causative_passive: ending === 'す' ? 'させられる' : `${a}される`, volitional: `${o}う`,
      conditional_ba: `${e}ば`, conditional_tara: `${ta}ら`, imperative: e, prohibitive: `${ending}な`,
    };
    for (const [form, replacement] of Object.entries(forms)) rules.push({ pos: 'verb_1', ending, form, replacement, exception: false });
  }
  return rules;
}

const ICHIDAN = { dictionary: 'る', polite: 'ます', negative: 'ない', past: 'た', te: 'て', potential: 'られる', passive: 'られる', causative: 'させる',
  causative_passive: 'させられる', volitional: 'よう', conditional_ba: 'れば', conditional_tara: 'たら', imperative: 'ろ', prohibitive: 'るな' };
const SURU = { dictionary: 'する', polite: 'します', negative: 'しない', past: 'した', te: 'して', potential: 'できる', passive: 'される', causative: 'させる',
  causative_passive: 'させられる', volitional: 'しよう', conditional_ba: 'すれば', conditional_tara: 'したら', imperative: 'しろ', prohibitive: 'するな' };
const KURU_KANA = { dictionary: 'くる', polite: 'きます', negative: 'こない', past: 'きた', te: 'きて', potential: 'こられる', passive: 'こられる', causative: 'こさせる',
  causative_passive: 'こさせられる', volitional: 'こよう', conditional_ba: 'くれば', conditional_tara: 'きたら', imperative: 'こい', prohibitive: 'くるな' };
const KURU_KANJI = Object.fromEntries(Object.entries(KURU_KANA).map(([form, value]) => [form, `来${value.slice(1)}`]));
const I_ADJ = { dictionary: 'い', negative: 'くない', past: 'かった', te: 'くて', conditional_ba: 'ければ', conditional_tara: 'かったら', adverbial: 'く', attributive: 'い' };
const NA_ADJ = { dictionary: 'だ', negative: 'じゃない', past: 'だった', te: 'で', conditional_ba: 'なら', conditional_tara: 'だったら', adverbial: 'に', attributive: 'な' };

// 例外：词尾更长的规则（写法与读音各一条）
function exceptionRules() {
  const rules = [];
  const add = (pos, endings, forms) => {
    for (const ending of endings) for (const [form, replacement] of Object.entries(forms)) rules.push({ pos, ending, form, replacement: replacement(ending), exception: true });
  };
  // 行く：て形・た形・たら形为「って・った・ったら」
  add('verb_1', ['行く', 'いく'], { te: (e) => `${e[0]}って`, past: (e) => `${e[0]}った`, conditional_tara: (e) => `${e[0]}ったら` });
  // ある：否定为「ない」
  add('verb_1', ['ある', '有る'], { negative: () => 'ない' });
  // 敬语五段：ます形、命令形用「い」
  add('verb_1', ['いらっしゃる', 'おっしゃる', 'なさる', 'くださる', 'ござる', '下さる'], { polite: (e) => `${e.slice(0, -1)}います`, imperative: (e) => `${e.slice(0, -1)}い` });
  // 問う・請う：て形・た形为「うて・うた」
  add('verb_1', ['問う', 'とう', '請う', 'こう'], { te: (e) => `${e}て`, past: (e) => `${e}た`, conditional_tara: (e) => `${e}たら` });
  // いい／よい：变形用「よ」
  add('i_adjective', ['いい', '良い', 'よい'], {
    negative: (e) => (e === '良い' ? '良くない' : 'よくない'), past: (e) => (e === '良い' ? '良かった' : 'よかった'), te: (e) => (e === '良い' ? '良くて' : 'よくて'),
    conditional_ba: (e) => (e === '良い' ? '良ければ' : 'よければ'), conditional_tara: (e) => (e === '良い' ? '良かったら' : 'よかったら'), adverbial: (e) => (e === '良い' ? '良く' : 'よく'),
  });
  // ずる动词：信ずる → 信じない
  add('verb_3_suru', ['ずる'], { polite: () => 'じます', negative: () => 'じない', past: () => 'じた', te: () => 'じて', volitional: () => 'じよう', conditional_ba: () => 'ずれば', conditional_tara: () => 'じたら', imperative: () => 'じろ', prohibitive: () => 'ずるな' });
  return rules;
}

export function conjugationRules() {
  const table = (pos, ending, forms) => Object.entries(forms).map(([form, replacement]) => ({ pos, ending, form, replacement, exception: false }));
  return [
    ...godanRules(),
    ...table('verb_2', 'る', ICHIDAN),
    ...table('verb_3_suru', 'する', SURU),
    ...table('verb_3_kuru', 'くる', KURU_KANA),
    ...table('verb_3_kuru', '来る', KURU_KANJI),
    ...table('i_adjective', 'い', I_ADJ),
    ...table('na_adjective', '', NA_ADJ),
    ...exceptionRules(),
  ];
}

/** 步骤说明（三种语言）。 */
function stepTexts(rule) {
  if (rule.exception) {
    return {
      'zh-Hans': `例外：「${rule.ending}」变为「${rule.replacement}」`,
      en: `Exception: 「${rule.ending}」 becomes 「${rule.replacement}」`,
      ja: `例外：「${rule.ending}」は「${rule.replacement}」になる`,
    };
  }
  if (!rule.ending) return { 'zh-Hans': `接「${rule.replacement}」`, en: `Add 「${rule.replacement}」`, ja: `「${rule.replacement}」を付ける` };
  return {
    'zh-Hans': `去掉词尾「${rule.ending}」，接「${rule.replacement}」`,
    en: `Drop the ending 「${rule.ending}」 and add 「${rule.replacement}」`,
    ja: `語尾「${rule.ending}」を取って「${rule.replacement}」を付ける`,
  };
}

const CARD_TEMPLATE_NAMES = {
  word_standard: { en: ['Standard', 'Spelling → reading, meaning, 1 example, 1 memory point, memory image. For everyday review.'], ja: ['標準', '表記 → 読み、語義、例文 1 件、覚えるポイント 1 件、記憶用画像。日常の復習向け。'] },
  word_simple: { en: ['Simple', 'Spelling → reading, meaning. For going through many words quickly.'], ja: ['シンプル', '表記 → 読み、語義。大量の単語を素早く確認する。'] },
  word_example: { en: ['Example', 'Example (no translation) → spelling, reading, meaning, example translation. Recall meaning in context.'], ja: ['例文', '例文（訳なし）→ 表記、読み、語義、例文の訳。文脈の中で語義を思い出す。'] },
  word_japanese: { en: ['Japanese definition', 'Spelling → reading, Japanese definition, paraphrase, example (no translation). N2 and above.'], ja: ['日本語の語義', '表記 → 読み、日本語の語義、言い換え、例文（訳なし）。N2 以上向け。'] },
  grammar_standard: { en: ['Standard', 'Pattern → connection, meaning, 1 example, 1 memory point.'], ja: ['標準', '文型 → 接続、意味、例文 1 件、覚えるポイント 1 件。'] },
  grammar_example: { en: ['Example', 'Example (no translation) → pattern, meaning, example translation, 1 note. Judge grammar in context.'], ja: ['例文', '例文（訳なし）→ 文型、意味、例文の訳、補足説明 1 件。文脈の中で文法を判断する。'] },
  grammar_comparison: { en: ['Comparison', 'Pattern → meaning, up to 2 synonym comparisons, 1 example. For easily confused grammar.'], ja: ['比較', '文型 → 意味、類義語の比較最大 2 件、例文 1 件。混同しやすい文法向け。'] },
  name_standard: { en: ['Standard', 'Spelling → reading, romaji, description.'], ja: ['標準', '表記 → 読み、ローマ字、説明。'] },
};

export function seedReferenceData(db) {
  const now = new Date().toISOString();
  const translate = db.prepare(`INSERT INTO content_translations (owner_table, owner_rid, field, language, text, origin, verified, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'manual', 1, ?, ?) ON CONFLICT (owner_table, owner_rid, field, language) DO NOTHING`);
  if (!db.prepare('SELECT count(*) AS n FROM conjugation_forms').get().n) {
    const insertForm = db.prepare('INSERT INTO conjugation_forms (code, label_ja, applies_to, sort_order) VALUES (?, ?, ?, ?)');
    for (const f of CONJUGATION_FORMS) insertForm.run(f.code, f.label, f.appliesTo, f.sortOrder);
    const insertRule = db.prepare('INSERT INTO conjugation_rules (pos, ending, form_code, replacement, is_exception) VALUES (?, ?, ?, ?, ?)');
    for (const rule of conjugationRules()) {
      const rid = Number(insertRule.run(rule.pos, rule.ending, rule.form, rule.replacement, rule.exception ? 1 : 0).lastInsertRowid);
      for (const [language, text] of Object.entries(stepTexts(rule))) translate.run('conjugation_rules', rid, 'step', language, text, now, now);
    }
  }
  for (const template of db.prepare('SELECT rid, code FROM card_templates').all()) {
    for (const [language, [name, description]] of Object.entries(CARD_TEMPLATE_NAMES[template.code] ?? {})) {
      translate.run('card_templates', template.rid, 'name', language, name, now, now);
      translate.run('card_templates', template.rid, 'description', language, description, now, now);
    }
  }
}
