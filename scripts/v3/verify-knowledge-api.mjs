// 第 1 段階の核対：旧データの知識項目を無作為に抜き出し、v3 の API（getKnowledge）が返す全項目と突き合わせる。
// 用法：node scripts/v3/verify-knowledge-api.mjs <旧库.sqlite> <新库.sqlite> <对照表.mapping.tsv> [数量=30] [乱数种子=1]
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { getKnowledge } from '../../server/v3/repo/knowledge.mjs';
import { seedReferenceData } from '../../server/v3/reference-data.mjs';

const [from, to, mappingPath, size = '30', seedText = '1'] = process.argv.slice(2);
if (!from || !to || !mappingPath) { console.error('用法：node scripts/v3/verify-knowledge-api.mjs <旧库> <新库> <对照表> [数量] [种子]'); process.exit(2); }
const legacy = new DatabaseSync(from, { readOnly: true });
const v3 = new DatabaseSync(to);
seedReferenceData(v3); // 活用规则（读取变形时需要）
const tables = new Set(legacy.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
const T = (name) => (tables.has(`legacy_v1_${name}`) ? `legacy_v1_${name}` : name);
const codes = new Map(readFileSync(mappingPath, 'utf8').trim().split('\n').slice(1).map((line) => line.split('\t'))
  .filter(([kind]) => kind === 'item').map(([, userId, legacyId, , code]) => [`${userId}\u0000${legacyId}`, code]));

// 決まった種で並べ替え（再実行しても同じ 30 件）
let seed = Number(seedText) || 1;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const items = [
  ...legacy.prepare(`SELECT user_id, item_json FROM "${T('owned_review_items')}"`).all(),
  ...(tables.has(T('user_review_items')) ? legacy.prepare(`SELECT user_id, item_json FROM "${T('user_review_items')}"`).all() : []),
].map((r) => ({ userId: r.user_id, item: JSON.parse(r.item_json) })).sort(() => random() - 0.5).slice(0, Number(size));

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const list = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const texts = (v) => list(v).map((x) => (typeof x === 'string' ? x : x?.text ?? x?.content ?? x?.zh ?? null)).map(str).filter(Boolean);
const results = [];
for (const { userId, item } of items) {
  const code = codes.get(`${userId}\u0000${item.id}`);
  const problems = [];
  const eq = (field, expected, actual) => {
    const a = JSON.stringify(expected ?? null);
    const b = JSON.stringify(actual ?? null);
    if (a !== b) problems.push({ field, expected: expected ?? null, actual: actual ?? null });
  };
  if (!code) { results.push({ userId, id: item.id, code: null, problems: [{ field: 'code', expected: '迁移后的编号', actual: null }] }); continue; }
  const k = getKnowledge(v3, userId, code, { language: 'zh-Hans' });
  eq('expression', str(item.original), k.expression);
  eq('reading', str(item.reading), k.reading);
  eq('meaning(zh-Hans)', str(item.meaning_zh) ?? str(item.meaning), k.meaning?.language === 'zh-Hans' ? k.meaning.text : null);
  eq('meaningJa', str(item.meaning_ja), k.meaningJa);
  eq('paraphrase', str(item.paraphrase_ja), k.paraphrase);
  eq('explanation', str(item.explanation_zh), k.explanation?.text ?? null);
  const examples = list(item.examples).filter((e) => str(e?.ja));
  eq('examples.sentence', examples.map((e) => str(e.ja)), k.examples.map((e) => e.sentence));
  eq('examples.reading', examples.map((e) => str(e.reading)), k.examples.map((e) => e.reading));
  eq('examples.translation', examples.map((e) => str(e.zh)), k.examples.map((e) => e.translation?.text ?? null));
  eq('examples.analysis', examples.map((e) => str(e.analysis_zh)), k.examples.map((e) => e.analysis?.text ?? null));
  eq('comparisons', list(item.comparisons).filter((c) => str(c?.target)).map((c) => [str(c.target), str(c.difference_zh)]), k.comparisons.map((c) => [c.target, c.difference?.text ?? null]));
  eq('relatedWords', list(item.related_words).map(str).filter(Boolean), k.relatedWords);
  eq('compileNote', str(item.source?.chat_summary), k.compileNote);
  eq('memoryPoints', texts(item.core_memory), k.memoryPoints.map((m) => m.text));
  eq('alternateForms', list(item.alternate_forms).map(str).filter(Boolean), k.alternateForms);
  // 出会った文：教材の章などは出典（sources）へ移る
  const sentence = str(item.source?.sentence);
  if (sentence && k.sourceSentence !== sentence && !k.sources.some((source) => source.title === sentence)) problems.push({ field: 'sourceSentence', expected: sentence, actual: k.sourceSentence });
  // 等級：min は低いほう（数字の大きいほう）
  const numbers = (str(item.jlpt_level)?.normalize('NFKC').match(/N([1-5])/g) ?? []).map((n) => Number(n.slice(1)));
  const levelText = str(item.jlpt_level)?.normalize('NFKC');
  const parsable = levelText && /^N[1-5](\s*[-~〜～]\s*N[1-5]|関連)?$/.test(levelText);
  eq('jlptLevel', parsable ? { min: `N${Math.max(...numbers)}`, max: `N${Math.min(...numbers)}` } : null, k.jlptLevel);
  if (levelText && !parsable && levelText !== 'unknown' && !k.tags.includes(levelText)) problems.push({ field: 'jlptLevel→tags', expected: levelText, actual: k.tags });
  for (const tag of list(item.tags).map(str).filter(Boolean)) if (!k.tags.includes(tag)) problems.push({ field: 'tags', expected: tag, actual: k.tags });
  results.push({ userId, id: item.id, code, expression: k.expression, problems });
}
const failed = results.filter((r) => r.problems.length);
console.log(JSON.stringify({ checked: results.length, passed: results.length - failed.length, failed: failed.length, failures: failed }, null, 2));
process.exit(failed.length ? 1 : 0);
