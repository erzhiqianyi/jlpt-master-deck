// 按“辞书形 + 读音 + 词性”查活用规则库生成变形；取最长匹配的词尾，例外动词就是词尾更长的规则。
const CONJUGATING = new Set(['verb_1', 'verb_2', 'verb_3_suru', 'verb_3_kuru', 'i_adjective', 'na_adjective']);
let cache = null;

function rulesFor(db) {
  if (cache?.db === db) return cache.rules;
  const rules = db.prepare(`SELECT r.rid, r.pos, r.ending, r.form_code, r.replacement, r.is_exception, f.label_ja, f.sort_order
    FROM conjugation_rules r JOIN conjugation_forms f ON f.code = r.form_code ORDER BY f.sort_order`).all();
  cache = { db, rules };
  return rules;
}

/** 找最长匹配的规则：同一变形下，词尾越长越优先。 */
function bestRule(rules, pos, form, text) {
  let best = null;
  for (const rule of rules) {
    if (rule.pos !== pos || rule.form_code !== form || !text.endsWith(rule.ending)) continue;
    if (!best || rule.ending.length > best.ending.length) best = rule;
  }
  return best;
}

/**
 * 生成知识点的全部变形。返回 [{ form, label, written, reading, ruleRid, exception }]。
 * 名詞＋する（is_suru_noun）按サ変生成：「規制」→「規制する」→「規制します」。
 */
export function conjugate(db, { pos, isSuruNoun, expression, reading, baseForm }) {
  let kind = pos;
  let written = baseForm || expression;
  let kana = reading ?? null;
  if (isSuruNoun && pos === 'noun') {
    kind = 'verb_3_suru';
    written = /する$/.test(written) ? written : `${written}する`;
    kana = kana && !/する$/.test(kana) ? `${kana}する` : kana;
  }
  if (!CONJUGATING.has(kind) || !written) return [];
  if (kind === 'na_adjective') { written = written.replace(/[だな]$/, ''); kana = kana?.replace(/[だな]$/, '') ?? null; }
  const rules = rulesFor(db);
  const forms = [...new Set(rules.filter((r) => r.pos === kind).map((r) => r.form_code))];
  const result = [];
  for (const form of forms) {
    const writtenRule = bestRule(rules, kind, form, written);
    if (!writtenRule) continue;
    const readingRule = kana ? bestRule(rules, kind, form, kana) : null;
    result.push({
      form,
      label: writtenRule.label_ja,
      written: written.slice(0, written.length - writtenRule.ending.length) + writtenRule.replacement,
      reading: readingRule ? kana.slice(0, kana.length - readingRule.ending.length) + readingRule.replacement : null,
      ruleRid: writtenRule.rid,
      exception: Boolean(writtenRule.is_exception || readingRule?.is_exception),
      sortOrder: writtenRule.sort_order,
    });
  }
  return result.sort((a, b) => a.sortOrder - b.sortOrder).map(({ sortOrder, ...rest }) => rest);
}
