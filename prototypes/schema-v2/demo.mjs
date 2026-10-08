// 完整演示：node prototypes/schema-v2/demo.mjs [--db 文件路径]
// 用样例数据走一遍“查词 → 多语言 → 复习 → 每日练习 → 注音 → 改题 → 总结 → 草稿审批 → 收集箱 → 市场 → 删除账号”。
import { fileURLToPath } from 'node:url';
import * as s from './service.mjs';
import { renderRubyText } from './ruby.mjs';
import { kanaToRomaji } from './romaji.mjs';
import { callTool } from './mcp-tools.mjs';

const U = 1, TODAY = '2026-10-08', ZH = 'zh-Hans';
const at = (time) => `${TODAY}T${time}:00.000Z`;   // UTC；东京时间 = +9 小时

// 显示一段译文，并标出实际语言、是否回退、是否 AI 未核对
const tr = (t, field) => {
  if (!t || t[field] == null) return '（无）';
  const flags = [t.isFallback ? `${t.requested} 缺译，显示 ${t.language}` : t.language, t.verified ? null : t.origin === 'ai' ? 'AI 未核对' : '待核对'].filter(Boolean);
  return `${t[field]}  [${flags.join('，')}]`;
};

export function runDemo(db, log = console.log) {
  const results = {};
  let stepNo = 0;
  const step = (title) => log(`\n━━ ${++stepNo}. ${title}`);
  const showQuestion = (q) => {
    log(`  [${q.code}] ${q.instruction ?? ''}`);
    log(`  ${q.prompt}${q.material ? `  （音频 ${q.material.audioMediaId}）` : ''}`);
    for (const o of q.options) log(`    ${o.label}. ${o.text}${o.isCorrect ? '  ✓' : ''}${o.analysis ? `  —— ${tr(o.analysis, 'analysis')}` : ''}`);
  };

  step('编号查找：新编号和旧编号都能找到');
  for (const code of ['W1', 'IT101', 'QV1', 'DR947']) {
    const hit = s.findByCode(db, U, code);
    log(`  ${code.padEnd(6)} → ${hit.code}（${hit.table}）${hit.legacyCode ? ' ← 旧编号' : ''}`);
  }

  step('同一个词条，按不同语言显示');
  for (const language of [ZH, 'en']) {
    const w1 = s.getKnowledgePoint(db, U, 'W1', language);
    log(`  [${language}] ${w1.id} ${w1.expression}  ${w1.reading}  ${w1.romaji}`);
    log(`    释义：${tr(w1.meanings[0].text, 'meaning')}`);
    log(`    例句：${w1.examples[0].sentence}  →  ${tr(w1.examples[0].translation, 'translation')}`);
    log(`    比较：${w1.notes[0].label}  ${tr(w1.notes[0].body, 'body')}`);
  }
  log(`  日语释义（国语辞典式）：${s.getKnowledgePoint(db, U, 'W1', ZH).meanings[0].japaneseDefinition}`);
  results.w1en = s.getKnowledgePoint(db, U, 'W1', 'en');

  step('繁体中文缺译：按 languages.fallback_code 回退到简体');
  const g1Hant = s.getKnowledgePoint(db, U, 'G1', 'zh-Hant');
  log(`  G1 ${g1Hant.expression}  ${g1Hant.romaji}  释义：${tr(g1Hant.meanings[0].text, 'meaning')}`);
  log(`  例句：${g1Hant.examples[0].ruby ? renderRubyText(g1Hant.examples[0].ruby) : g1Hant.examples[0].sentence}`);
  results.g1HantBefore = g1Hant;

  step('用户让 AI 补繁体译文（MCP: set_translation），之后不再回退');
  s.setTranslation(db, U, { targetCode: 'G1.m1', field: 'meaning', language: 'zh-Hant', text: '雖說……但是', now: at('00:10') });
  s.setTranslation(db, U, { targetCode: 'G1.ex1', field: 'translation', language: 'zh-Hant', text: '雖說是春天，但還是很冷。', now: at('00:10') });
  const g1HantAfter = s.getKnowledgePoint(db, U, 'G1', 'zh-Hant');
  log(`  释义：${tr(g1HantAfter.meanings[0].text, 'meaning')}`);
  log(`  例句译文：${tr(g1HantAfter.examples[0].translation, 'translation')}`);
  results.g1HantAfter = g1HantAfter;

  step('用户把说明语言切到韩语，让自己的 AI 通过 MCP 补译');
  const mcp = { db, userId: U, now: at('00:20') };
  const settings = callTool('set_language_settings', { explanation_language: 'ko' }, mcp);
  log(`  set_language_settings → 说明语言 ${settings.explanation_language}，回退链 ${settings.fallbackChain.join(' → ')}`);
  const missing = callTool('list_missing_translations', { language: 'ko', limit: 3 }, mcp);
  log(`  list_missing_translations → 共 ${missing.total} 项缺韩语，前 3 项：`);
  for (const item of missing.items) log(`    ${item.targetCode} ${item.field}：${item.source}  参考 ${Object.keys(item.references).join('/')}`);
  // 这里用固定译文代替 AI 的翻译结果
  const aiKorean = { 'W1.m1': '먹다', 'W1.ex1': '매일 아침 빵을 먹습니다.', 'W1.note1': '「召し上がる」는 「食べる」의 존경어입니다.' };
  for (const [targetCode, value] of Object.entries(aiKorean)) {
    const field = targetCode.includes('.ex') ? 'translation' : targetCode.includes('.note') ? 'body' : 'meaning';
    callTool('set_translation', { target_code: targetCode, field, language: 'ko', text: value }, mcp);
  }
  const w1ko = s.getKnowledgePoint(db, U, 'W1', 'ko');
  log(`  AI 写回 3 条后，W1 用韩语查看：`);
  log(`    释义：${tr(w1ko.meanings[0].text, 'meaning')}`);
  log(`    例句：${tr(w1ko.examples[0].translation, 'translation')}`);
  log(`  G1 还没翻译，按回退链显示英语：${tr(s.getKnowledgePoint(db, U, 'G1', 'ko').meanings[0].text, 'meaning')}`);
  log(`  剩余缺韩语 ${callTool('list_missing_translations', { language: 'ko' }, mcp).total} 项`);
  callTool('set_language_settings', { explanation_language: ZH }, mcp);
  results.missingKoBefore = missing.total; results.w1ko = w1ko;
  results.missingKoAfter = callTool('list_missing_translations', { language: 'ko' }, mcp).total;

  step('搜索：汉字 / 假名 / 罗马音 / 任意语言的释义');
  for (const query of ['学校', 'たべる', 'tokyo', 'to wa ie', 'school', '雖說']) {
    const hits = s.searchKnowledge(db, U, query);
    log(`  「${query}」→ ${hits.map((h) => `${h.id} ${h.expression}`).join('，') || '无'}`);
    results[`search:${query}`] = hits.map((h) => h.id);
  }

  step('今日计划与到期卡片');
  for (const t of s.todayTasks(db, U, TODAY)) log(`  ${t.id} ${t.title}  ${t.completed_count}/${t.target_count}  ${t.status}`);
  const due = s.dueReviews(db, U, at('00:30'));
  log(`  到期：${due.map((d) => `${d.id} ${d.expression}`).join('，')}`);
  results.due = due.map((d) => d.id);

  step('卡片复习（离线重传同一事件不会重复计数）');
  for (const [kp, rating, event] of [['W2', 'remembered', 'ios-8a01-0001'], ['W1', 'hard', 'ios-8a01-0002'], ['W1', 'hard', 'ios-8a01-0002']]) {
    const r = s.rateMemory(db, U, { knowledgePointId: kp, rating, clientEventId: event, source: 'ios', now: at('00:40'), localDate: TODAY });
    log(`  ${kp} ${rating} → ${r.ratingCode}${r.replayed ? '（重传，已忽略）' : `，下次 ${r.dueAt.slice(0, 16)}，间隔 ${r.intervalDays} 天`}`);
  }

  step('开始每日练习 DP1：作答前只有日语题面');
  const attempt = s.startAttempt(db, U, { practiceSetId: 'DP1', source: 'web', now: at('01:00') });
  log(`  创建练习记录 ${attempt}`);
  const before = s.deliverQuestion(db, U, attempt, 1, ZH);
  showQuestion(before);
  results.before = before;

  step('作答三题：单选、单选、排列（只按 ★ 位置评分）');
  const answers = [
    { ordinal: 1, selectedOptionNo: 1, clientEventId: 'web-01' },          // がっこう：对
    { ordinal: 2, selectedOptionNo: 3, clientEventId: 'web-02' },          // ばかりか：错
    { ordinal: 3, arrangement: [4, 2, 1, 3], clientEventId: 'web-03' },    // いつも 約束を ★必ず 守る：对
  ];
  for (const a of answers) {
    const r = s.submitAnswer(db, U, { attemptId: attempt, source: 'web', elapsedMs: 9000, now: at('01:05'), ...a });
    log(`  第${a.ordinal}题 → ${r.answerCode} ${r.isCorrect ? '正确' : '错误'}`);
  }
  const replay = s.submitAnswer(db, U, { attemptId: attempt, ordinal: 1, selectedOptionNo: 1, clientEventId: 'web-01', source: 'web', now: at('01:06') });
  log(`  重传第1题 → ${replay.answerCode}（replayed=${replay.replayed}）`);
  for (const language of [ZH, 'en']) {
    const after = s.deliverQuestion(db, U, attempt, 1, language);
    log(`  作答后第1题 [${language}]：`);
    showQuestion(after);
    log(`  解析：${after.ruby.explanation ? `${renderRubyText(after.ruby.explanation)}  [${after.texts.language}，含注音]` : tr(after.texts, 'explanation')}`);
    results[`after:${language}`] = after;
  }
  const done = s.completeAttempt(db, U, attempt, at('01:10'), TODAY);
  log(`  完成 ${attempt}：答 ${done.answered_count} 对 ${done.correct_count}`);
  results.attempt = done;

  step('用户在对话里让 AI 给第2题题干加注音（MCP: set_ruby_annotation）');
  const bad = s.setRubyAnnotation(db, U, { targetCode: 'QG1r1', field: 'prompt', annotatedText: '春（　　）、まだ寒[さむ]い日[ひ]が続[つづ]いている。', now: at('02:00') });
  log(`  第一次：${bad.ok ? '通过' : `被拒绝 —— ${bad.errors[0]}`}`);
  const good = s.setRubyAnnotation(db, U, { targetCode: 'QG1r1', field: 'prompt', annotatedText: '春[はる]（　　）、まだ 寒[さむ]い 日[ひ]が 続[つづ]いている。', now: at('02:00') });
  log(`  AI 修正后：${good.ok ? '通过' : good.errors}`);
  log(`  显示：${renderRubyText(s.validAnnotation(db, U, 'QG1r1', 'prompt', 'ja'))}`);
  results.rubyRejected = bad; results.rubyAccepted = good;

  step('改例句后，旧注音自动失效，译文改为待核对');
  s.editExampleSentence(db, U, 'G1', 1, '春とはいえ、まだ少し寒い。', at('02:10'));
  const stale = s.getKnowledgePoint(db, U, 'G1', ZH).examples[0];
  log(`  例句1：${stale.sentence}（注音：${stale.ruby ?? '已过期，不显示'}）`);
  log(`  译文仍保留，但改为待核对：${tr(stale.translation, 'translation')}`);
  results.staleRuby = stale.ruby; results.staleTranslation = stale.translation;

  step('已使用的题目修订：原文和已有译文冻结，但可以补新语言');
  for (const [label, sql] of [
    ['改题面', "UPDATE question_revisions SET prompt='改一下' WHERE user_id=1 AND question_id='QV1' AND revision=1"],
    ['改中文解析', "UPDATE question_revision_translations SET explanation='改一下' WHERE user_id=1 AND question_id='QV1' AND revision=1 AND language='zh-Hans'"],
  ]) {
    try { db.prepare(sql).run(); } catch (error) { log(`  ${label} QV1r1 → 拒绝：${error.message}`); results[`frozen:${label}`] = error.message; }
  }
  s.setTranslation(db, U, { targetCode: 'QV1r1', field: 'explanation', language: 'zh-Hant', text: '「学校」讀作がっこう，注意促音。', now: at('02:15') });
  log(`  补繁体解析到 QV1r1 → 允许：${tr(s.deliverQuestion(db, U, attempt, 1, 'zh-Hant').texts, 'explanation')}`);
  const revised = s.reviseQuestion(db, U, 'QV1', { translations: { [ZH]: { explanation: '「学校」读作がっこう：が＋っ＋こう，促音和长音都不能漏。' } } }, at('02:20'));
  const revisedTexts = db.prepare("SELECT language, explanation FROM question_revision_translations WHERE user_id=1 AND question_id='QV1' AND revision=2 ORDER BY language").all();
  log(`  改解析要新建 ${revised}，各语言译文随之复制：${revisedTexts.map((t) => t.language).join('、')}`);
  log(`  旧练习记录仍指向 QV1r1，注音也仍然有效：${renderRubyText(s.validAnnotation(db, U, 'QV1r1', 'explanation', ZH))}`);
  results.revised = revised; results.revisedLanguages = revisedTexts.map((t) => t.language);

  step('今日总结（用用户的说明语言生成）');
  const summary = s.buildDailySummary(db, U, TODAY, at('12:00'));
  log(`  [${summary.language}] 答题 ${summary.answered}，答对 ${summary.correct}，复习 ${summary.reviews}；错题：${summary.weaknesses.join('，')}`);
  for (const t of s.todayTasks(db, U, TODAY)) log(`  ${t.id} ${t.title}  ${t.completed_count}/${t.target_count}  ${t.status}`);
  results.summary = summary; results.tasks = s.todayTasks(db, U, TODAY);

  step('审批 AI 草稿 DR1：草稿内容原地转为正式');
  s.approveDraftBatch(db, U, 'DR1', at('12:10'));
  const w4 = s.getKnowledgePoint(db, U, 'W4', ZH);
  log(`  ${w4.id} ${w4.expression} → ${w4.status}，已核对=${w4.verified}；QV2 → ${db.prepare("SELECT status FROM questions WHERE user_id=1 AND id='QV2'").get().status}`);
  results.approved = w4;

  step('收集箱 CP1 整理成语法知识点（自定义罗马音须通过校验）');
  const capture = { kind: 'grammar', wordbookId: 'WB2', expression: '～にもかかわらず', reading: '～にもかかわらず', origin: 'manual', now: at('12:20'),
    meanings: [{ partOfSpeech: 'expression', translations: { [ZH]: '尽管……还是', en: 'despite' } }] };
  try { s.processCapture(db, U, 'CP1', { ...capture, customRomaji: '~ni mo kakawarazu desu' }); }
  catch (error) { log(`  错误的罗马音被拒绝：${error.message}`); }
  const g2 = s.processCapture(db, U, 'CP1', { ...capture, customRomaji: '~ni mo kakawarazu' });
  log(`  新建 ${g2}（自动罗马音 ${kanaToRomaji('～にもかかわらず')}，采用分词写法 ~ni mo kakawarazu），释义 ${Object.keys(capture.meanings[0].translations).join('、')}`);
  results.capturedId = g2;

  step('导入英语用户（用户 2）分享的 SH1：包里的多语言释义一并导入');
  const imported = s.importMarketShare(db, U, { shareId: 'SH1', wordbookId: 'WB1', now: at('12:30') });
  const cat = s.getKnowledgePoint(db, U, imported.created[0], ZH);
  log(`  ${imported.importCode}：新建 ${cat.id} ${cat.expression} ${cat.romaji}，释义 ${tr(cat.meanings[0].text, 'meaning')}`);
  const again = s.importMarketShare(db, U, { shareId: 'SH1', wordbookId: 'WB1', now: at('12:31') });
  log(`  再次导入 → ${again.importCode}，alreadyImported=${again.alreadyImported}`);
  results.imported = imported; results.importedAgain = again; results.cat = cat;

  step('同步：iPhone 上次同步到 seq 2，拉取之后的变更');
  const device = db.prepare("SELECT last_synced_seq FROM sync_devices WHERE user_id=1 AND device_name='iPhone'").get();
  const changes = db.prepare('SELECT seq, table_name, record_code, operation FROM sync_changes WHERE user_id=1 AND seq>? ORDER BY seq').all(device.last_synced_seq);
  log(`  共 ${changes.length} 条：${changes.map((c) => c.record_code).join(' ')}`);
  results.syncChanges = changes;

  step('删除账号：用户 2 的数据全部清除，用户 1 的导入记录和词条保留');
  s.deleteAccount(db, 2);
  const left = db.prepare('SELECT count(*) AS n FROM knowledge_points WHERE user_id=2').get().n;
  const importRow = db.prepare('SELECT share_id, share_title FROM market_imports WHERE user_id=1').get();
  const fkProblems = db.prepare('PRAGMA foreign_key_check').all().length;
  log(`  用户 2 剩余知识点 ${left}；用户 1 的导入记录：share_id=${importRow.share_id}，标题快照「${importRow.share_title}」；外键检查问题数 ${fkProblems}`);
  results.afterDelete = { left, importRow: { ...importRow }, fkProblems };

  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dbIndex = process.argv.indexOf('--db');
  const db = s.openDatabase(dbIndex > 0 ? process.argv[dbIndex + 1] : ':memory:');
  runDemo(db);
  console.log('\n━━ 各表行数');
  console.log(Object.entries(s.tableCounts(db)).map(([t, n]) => `  ${t.padEnd(32)}${n}`).join('\n'));
}
