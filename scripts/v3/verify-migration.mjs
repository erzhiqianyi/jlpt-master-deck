// 迁移核对：数量对账（每类旧记录都有去向）+ 抽查知识点全部字段。
// 用法：node scripts/v3/verify-migration.mjs <旧库.sqlite> <新库.sqlite> <报告.json> [抽查数量=30]
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const [from, to, reportPath, sampleSize = '30'] = process.argv.slice(2);
const legacy = new DatabaseSync(from, { readOnly: true });
const v3 = new DatabaseSync(to, { readOnly: true });
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const tables = new Set(legacy.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
const L = (name) => (tables.has(`legacy_v1_${name}`) ? `legacy_v1_${name}` : tables.has(name) ? name : null);
const count = (db, sql) => db.prepare(sql).get().n;
const legacyCount = (name) => (L(name) ? count(legacy, `SELECT count(*) AS n FROM "${L(name)}"`) : 0);
const v3Count = (name) => count(v3, `SELECT count(*) AS n FROM "${name}"`);
const warned = (key) => report.warnings[key]?.count ?? 0;
const json = (text, fallback) => { try { return JSON.parse(text); } catch { return fallback; } };
const rows = (name) => (L(name) ? legacy.prepare(`SELECT * FROM "${L(name)}"`).all() : []);

let failures = 0;
const checks = [];
const check = (label, expected, actual, note = '') => {
  const ok = expected === actual;
  if (!ok) failures += 1;
  checks.push({ label, expected, actual, ok, note });
};

// ---------- 数量对账 ----------
check('知识点 = 自己的 + 导入的', legacyCount('owned_review_items') + legacyCount('user_review_items'), v3Count('knowledge_points'));
check('收集箱', legacyCount('learning_captures'), v3Count('inbox_captures'));
check('AI 草稿', legacyCount('review_pack_drafts'), v3Count('ai_drafts'));
check('练习 = 每日练习 + 模拟考试', legacyCount('daily_practices') + legacyCount('mock_exams'), v3Count('practice_sets'));
let practiceQuestions = 0;
for (const r of rows('daily_practices')) practiceQuestions += (json(r.practice_json, {}).questions ?? []).length;
for (const r of rows('mock_exams')) for (const s of json(r.content_json, {}).sessions ?? []) practiceQuestions += (s.questions ?? []).length;
check('练习中的题目条目', practiceQuestions, v3Count('practice_set_entries') + warned('practice.entry_question_missing'));
let attempts = 0;
let attemptQuestions = 0;
for (const r of rows('practice_state')) {
  const list = [...json(r.attempt_history_json, []), ...(json(r.active_attempt_json, null) ? [json(r.active_attempt_json, null)] : [])];
  attempts += list.length;
  for (const a of list) attemptQuestions += (a.questionIds?.length ? a.questionIds : a.answers ?? []).length;
}
check('练习记录', attempts, v3Count('practice_attempts'));
check('练习记录中的每题作答', attemptQuestions, v3Count('attempt_answers'));
const answerQuestions = new Set(rows('answers').map((r) => `${r.user_id}\u0000${r.question_id}`)).size;
check('每题最新作答 + 找不到题目的 ≥ 旧作答题数（同一题的多个旧副本合并）', true, v3Count('question_answer_states') + warned('answers.question_missing') <= answerQuestions && v3Count('question_answer_states') > 0 || answerQuestions === 0);
check('学习事件', legacyCount('learning_events'), v3Count('learning_events'));
check('复习进度 = 迁入 + 未开始学习 + 知识点已不存在', legacyCount('progress'), v3Count('review_schedules') + (report.activity?.schedulesSkipped?.review_schedules ?? 0) + warned('review_schedules.item_missing'),
  '未开始学习（new）的进度不迁移；已不存在的知识点的进度写进报告');
check('复习同步基准 = 迁入 + 未开始学习 + 知识点已不存在', legacyCount('card_review_sync_baselines'), v3Count('review_schedule_baselines') + (report.activity?.schedulesSkipped?.review_schedule_baselines ?? 0) + warned('review_schedule_baselines.item_missing'));
check('卡片自评', legacyCount('card_reviews'), v3Count('memory_ratings') + warned('card_reviews.skipped'));
check('学习计划', legacyCount('study_plans'), v3Count('learning_plans'));
check('每日总结', legacyCount('daily_summaries'), v3Count('daily_reports'));
check('跟读录音', legacyCount('listening_recordings'), v3Count('speaking_recordings'));
check('题目副本都有去向（迁入或注明原因）', report.questions.copies, report.questions.questions + report.questions.merged + warned('question.unknown_type') + warned('question.missing_prompt'));
check('外键完整', 0, report.foreignKeyViolations);

// ---------- 抽查知识点 ----------
const items = [...rows('owned_review_items').map((r) => ({ id: r.id, userId: r.user_id, item: json(r.item_json, {}) }))];
const pick = items.sort((a, b) => (a.id < b.id ? -1 : 1)).filter((_, i, all) => i % Math.max(1, Math.floor(all.length / Number(sampleSize))) === 0).slice(0, Number(sampleSize));
const mapping = new Map(readFileSync(reportPath.replace('.report.json', '.mapping.tsv'), 'utf8').split('\n').slice(1).filter(Boolean)
  .map((line) => line.split('\t')).filter((c) => c[0] === 'item').map((c) => [`${c[1]}\u0000${c[2]}`, Number(c[3])]));
const tr = v3.prepare('SELECT text FROM content_translations WHERE owner_table = ? AND owner_rid = ? AND field = ? AND language = ?');
const text = (table, rid, field, lang) => tr.get(table, rid, field, lang)?.text ?? null;
const clean = (v) => (v == null ? null : String(v).trim() || null);
const spot = [];
for (const { id, userId, item } of pick) {
  const rid = mapping.get(`${userId}\u0000${id}`);
  const point = rid ? v3.prepare('SELECT * FROM knowledge_points WHERE rid = ?').get(rid) : null;
  const problems = [];
  if (!point) { problems.push('没有迁入'); spot.push({ id, problems }); failures += 1; continue; }
  const eq = (label, a, b) => { if (clean(a) !== clean(b)) problems.push(`${label}: 旧「${clean(a)}」新「${clean(b)}」`); };
  eq('写法', item.original, point.expression);
  eq('读音', item.reading, point.reading);
  eq('释义 zh', item.meaning_zh ?? item.meaning, text('knowledge_points', rid, 'meaning', 'zh-Hans'));
  eq('释义 ja', item.meaning_ja, text('knowledge_points', rid, 'meaning', 'ja'));
  eq('讲解', item.explanation_zh, text('knowledge_points', rid, 'explanation', 'zh-Hans'));
  eq('换说', item.paraphrase_ja, point.paraphrase);
  const examples = v3.prepare('SELECT rid, sentence FROM knowledge_examples WHERE point_rid = ? ORDER BY position').all(rid);
  const oldExamples = (item.examples ?? []).filter((e) => clean(e?.ja));
  if (oldExamples.length !== examples.length) problems.push(`例句数：旧 ${oldExamples.length} 新 ${examples.length}`);
  oldExamples.forEach((e, i) => { eq(`例句 ${i + 1}`, e.ja, examples[i]?.sentence); eq(`例句译文 ${i + 1}`, e.zh, examples[i] && text('knowledge_examples', examples[i].rid, 'translation', 'zh-Hans')); });
  const memory = v3.prepare('SELECT rid FROM knowledge_memory_points WHERE point_rid = ? ORDER BY position').all(rid).map((m) => text('knowledge_memory_points', m.rid, 'content', 'zh-Hans'));
  eq('记忆要点', (item.core_memory ?? []).map(clean).filter(Boolean).join(' | '), memory.join(' | '));
  const patterns = v3.prepare('SELECT pattern FROM knowledge_patterns WHERE point_rid = ? ORDER BY position').all(rid).map((p) => p.pattern);
  eq('句型', (item.patterns ?? []).map((p) => clean(p?.pattern)).filter(Boolean).join(' | '), patterns.join(' | '));
  const comparisons = v3.prepare('SELECT target FROM knowledge_comparisons WHERE point_rid = ? ORDER BY position').all(rid).map((c) => c.target);
  eq('近义辨析', (item.comparisons ?? []).map((c) => clean(c?.target)).filter(Boolean).join(' | '), comparisons.join(' | '));
  const notes = v3Count === null ? 0 : v3.prepare('SELECT count(*) AS n FROM knowledge_notes WHERE point_rid = ?').get(rid).n;
  const expectedNotes = (item.points ?? []).filter((p) => clean(p?.label) || clean(p?.detail_zh)).length + (clean(item.register?.note_zh) ? 1 : 0) + (clean(item.register?.exam_tip_zh) ? 1 : 0);
  if (notes !== expectedNotes) problems.push(`补充说明数：应为 ${expectedNotes} 新 ${notes}`);
  const tags = new Set(v3.prepare('SELECT tag FROM knowledge_tags WHERE point_rid = ?').all(rid).map((t) => t.tag));
  for (const tag of item.tags ?? []) if (clean(tag) && !tags.has(clean(tag))) problems.push(`标签缺少：${tag}`);
  if (problems.length) failures += 1;
  spot.push({ id, code: point.code, problems });
}

console.log('数量对账');
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.label}：${c.ok ? c.actual : `应为 ${c.expected}，实际 ${c.actual}`}${c.note && !c.ok ? `（${c.note}）` : ''}`);
console.log(`抽查知识点（${spot.length} 个）`);
for (const s of spot) console.log(`  ${s.problems.length ? '✗' : '✓'} ${s.code ?? s.id}${s.problems.length ? `：${s.problems.join('；')}` : ''}`);
console.log(failures ? `\n${failures} 项不一致` : '\n全部一致');
process.exit(failures ? 1 : 0);
