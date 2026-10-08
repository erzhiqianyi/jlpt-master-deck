import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDatabase, tableCounts, checkStoredRomaji, meaningsWithoutText, nextCode, languageChain, setTranslation } from './service.mjs';
import { runDemo } from './demo.mjs';
import { callTool, languageTools } from './mcp-tools.mjs';
import { kanaToRomaji, romajiSearchKey, acceptCustomRomaji } from './romaji.mjs';
import { stripRuby, validateRuby, parseRuby } from './ruby.mjs';

test('样例数据：外键完整、罗马音一致、每个义项都有释义、除导入两表外每张表都有数据', () => {
  const db = openDatabase();
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  assert.deepEqual(checkStoredRomaji(db), []);
  assert.deepEqual(meaningsWithoutText(db), []);
  const empty = Object.entries(tableCounts(db)).filter(([, n]) => n === 0).map(([t]) => t);
  assert.deepEqual(empty, ['market_import_items', 'market_imports']);   // 由 demo 导入步骤创建
});

test('表结构里没有带语言后缀的列', () => {
  const schema = readFileSync(new URL('schema.sql', import.meta.url), 'utf8');
  const columns = [...schema.matchAll(/^\s+(\w+)\s+(?:TEXT|INTEGER|REAL)/gm)].map((m) => m[1]);
  assert.deepEqual(columns.filter((c) => /_(zh|ja|en|ko|vi)$/.test(c)), []);
});

test('语言回退链', () => {
  const db = openDatabase();
  assert.deepEqual(languageChain(db, 'zh-Hant'), ['zh-Hant', 'zh-Hans']);
  assert.deepEqual(languageChain(db, 'en'), ['en']);
  assert.throws(() => setTranslation(db, 1, { targetCode: 'W1.m1', field: 'meaning', language: 'xx', text: 'x', now: 't' }), /不支持的语言/);
  assert.throws(() => setTranslation(db, 1, { targetCode: 'W1.ex1', field: 'translation', language: 'ja', text: 'x', now: 't' }), /CHECK/);
  assert.throws(() => setTranslation(db, 1, { targetCode: 'W1', field: 'expression', language: 'en', text: 'x', now: 't' }), /不是可翻译字段/);
});

test('MCP 语言工具：设置、待翻译清单、写回', () => {
  const db = openDatabase();
  const ctx = { db, userId: 1, now: '2026-10-08T00:00:00Z' };
  assert.deepEqual(languageTools.map((t) => t.name), ['list_languages', 'get_language_settings', 'set_language_settings',
    'list_missing_translations', 'set_translation', 'set_ruby_annotation']);
  assert.ok(callTool('list_languages', {}, ctx).some((l) => l.code === 'vi'));
  assert.throws(() => callTool('set_language_settings', { explanation_language: 'xx' }, ctx), /不支持的语言/);
  assert.throws(() => callTool('get_language_settings', { user_id: 2 }, ctx));          // 用户只能来自认证上下文
  assert.deepEqual(callTool('set_language_settings', { explanation_language: 'vi' }, ctx).fallbackChain, ['vi', 'en']);
  const before = callTool('list_missing_translations', { language: 'vi' }, ctx);
  assert.ok(before.items.every((i) => i.targetCode && i.field && i.source !== undefined && Object.keys(i.references).length));
  const first = before.items[0];
  callTool('set_translation', { target_code: first.targetCode, field: first.field, language: 'vi', text: 'bản dịch' }, ctx);
  assert.equal(callTool('list_missing_translations', { language: 'vi' }, ctx).total, before.total - 1);
});

test('编号：按用户、按业务类型自增，格式由 CHECK 约束', () => {
  const db = openDatabase();
  assert.equal(nextCode(db, 1, 'W').id, 'W5');
  assert.equal(nextCode(db, 1, 'W').id, 'W6');
  assert.equal(nextCode(db, 2, 'W').id, 'W2');          // 用户 2 独立计数
  assert.equal(nextCode(db, 1, 'TP').id, 'TP1');        // 新业务类型从 1 开始
  assert.throws(() => db.prepare("INSERT INTO wordbooks VALUES (1,'WB9',3,'错号',0,NULL,'t','t')").run(), /CHECK/);
});

test('罗马音规则', () => {
  const cases = {
    たべる: 'taberu', がっこう: 'gakkou', とうきょう: 'toukyou', ゲーム: 'geemu', ファイル: 'fairu', ティー: 'tii',
    ディズニー: 'dizunii', ウェブ: 'webu', ヴァイオリン: 'vaiorin', きんえん: "kin'en", ほんや: "hon'ya", しんぶん: 'shinbun',
    まっちゃ: 'matcha', ちぢむ: 'chijimu', つづく: 'tsuzuku', '～にさいして': '~nisaishite',
  };
  for (const [kana, romaji] of Object.entries(cases)) assert.equal(kanaToRomaji(kana), romaji, kana);
  assert.equal(romajiSearchKey('tōkyō'), romajiSearchKey('toukyou'));
  assert.ok(acceptCustomRomaji('こんにちは', 'konnichiwa'));
  assert.ok(acceptCustomRomaji('～とはいえ', '~to wa ie'));
  assert.ok(!acceptCustomRomaji('たべる', 'tabemasu'));
  assert.throws(() => kanaToRomaji('食べる'), /只能包含假名/);
});

test('Anki 写法注音', () => {
  assert.equal(stripRuby('まだ 寒[さむ]い 日[ひ]'), 'まだ寒い日');
  assert.deepEqual(parseRuby('明日[あした]、 学校[がっこう]へ'), [
    { text: '明日', reading: 'あした' }, { text: '、' }, { text: '学校', reading: 'がっこう' }, { text: 'へ' }]);
  assert.match(validateRuby('へ行[い]く', 'へ行く')[0], /不是纯汉字/);
  assert.match(validateRuby('寒[samu]い', '寒い')[0], /只能包含假名/);
  assert.match(validateRuby('寒[さむ]い', '暑い')[0], /不一致/);
});

test('完整 demo 流程', () => {
  const db = openDatabase();
  const r = runDemo(db, () => {});
  // 多语言
  assert.equal(r.w1en.meanings[0].text.meaning, 'to eat');
  assert.deepEqual([r.missingKoBefore, r.missingKoAfter], [17, 14]);
  assert.deepEqual([r.w1ko.meanings[0].text.meaning, r.w1ko.meanings[0].text.origin], ['먹다', 'ai']);
  assert.equal(r.w1en.examples[0].translation.origin, 'ai');
  assert.deepEqual([r.g1HantBefore.meanings[0].text.language, r.g1HantBefore.meanings[0].text.isFallback], ['zh-Hans', true]);
  assert.deepEqual([r.g1HantAfter.meanings[0].text.meaning, r.g1HantAfter.meanings[0].text.isFallback], ['雖說……但是', false]);
  assert.deepEqual(r['search:school'], ['W2']);
  assert.deepEqual(r['search:雖說'], ['G1']);
  // 搜索
  assert.deepEqual(r['search:tokyo'], ['N1']);
  assert.deepEqual(r['search:たべる'], ['W1']);
  assert.deepEqual(r['search:to wa ie'], ['G1']);
  assert.deepEqual(r.due, ['W2', 'W1']);
  // 作答前不泄露答案、解析、注音
  assert.ok(r.before.options.every((o) => !('isCorrect' in o) && !('analysis' in o)));
  assert.equal(r.before.texts, undefined);
  assert.equal(r.before.ruby, undefined);
  // 作答后按语言显示，缺译回退
  assert.match(r['after:zh-Hans'].ruby.explanation, /学校\[がっこう\]/);
  assert.equal(r['after:en'].texts.language, 'en');
  assert.equal(r['after:en'].ruby.explanation, undefined);      // 注音挂在中文解析上，英文解析没有
  assert.ok(r['after:en'].options.some((o) => o.analysis?.isFallback));
  assert.deepEqual([r.attempt.answered_count, r.attempt.correct_count, r.attempt.status], [3, 2, 'completed']);
  // 注音与冻结
  assert.equal(r.rubyRejected.ok, false);
  assert.equal(r.rubyAccepted.ok, true);
  assert.equal(r.staleRuby, null);
  assert.equal(r.staleTranslation.verified, 0);
  assert.match(r['frozen:改题面'], /不能修改/);
  assert.match(r['frozen:改中文解析'], /已有译文不能修改/);
  assert.equal(r.revised, 'QV1r2');
  assert.deepEqual(r.revisedLanguages, ['en', 'zh-Hans', 'zh-Hant']);
  // 总结、计划、草稿、收集箱、市场、删除账号
  assert.deepEqual([r.summary.answered, r.summary.correct, r.summary.reviews, r.summary.weaknesses, r.summary.language], [3, 2, 2, ['QG1'], 'zh-Hans']);
  assert.ok(r.tasks.every((t) => t.status === 'completed'));
  assert.equal(r.approved.status, 'active');
  assert.equal(r.capturedId, 'G2');
  assert.deepEqual([r.imported.importCode, r.imported.created, r.importedAgain.alreadyImported], ['MI1', ['W5'], true]);
  assert.equal(r.cat.meanings[0].text.meaning, '猫');
  assert.deepEqual(r.afterDelete, { left: 0, importRow: { share_id: null, share_title: '日常动物词' }, fkProblems: 0 });
});
