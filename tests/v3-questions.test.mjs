// v3 阶段 2：题库（题组 → 小题 → 选项）、按题型的校验、自动检查与 AI 审查。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.JLPT_V3_DB_PATH = join(mkdtempSync(join(tmpdir(), 'v3-questions-')), 'v3.sqlite');
const { migrateLegacyToV3 } = await import('../server/v3/migrate/index.mjs');
const { seedReferenceData } = await import('../server/v3/reference-data.mjs');
const { ensureUser } = await import('../server/v3/database.mjs');
const { createWordbook } = await import('../server/v3/repo/wordbooks.mjs');
const { createKnowledge } = await import('../server/v3/repo/knowledge.mjs');
const { storeMedia } = await import('../server/v3/repo/media.mjs');
const { validateGroup, createQuestionGroup, updateQuestionGroup, getQuestionGroup, listQuestionGroups, deleteQuestionGroup, listQuestionTypes } = await import('../server/v3/repo/questions.mjs');
const { reviewContext, submitReview, listGroupsForReview, reportQuestionProblem } = await import('../server/v3/repo/reviews.mjs');
const { getMaterial, deleteMaterial } = await import('../server/v3/repo/materials.mjs');

function freshDb() {
  const legacy = new DatabaseSync(':memory:');
  legacy.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL)');
  const db = new DatabaseSync(':memory:');
  migrateLegacyToV3({ legacy, target: db });
  db.exec('PRAGMA foreign_keys = ON');
  seedReferenceData(db);
  ensureUser(db, { id: 1, username: 'learner' });
  ensureUser(db, { id: 2, username: 'other' });
  createWordbook(db, 1, { title: '词汇' });
  createKnowledge(db, 1, { kind: 'word', wordbook: 'WB1', expression: '遅刻', reading: 'ちこく', pos: 'noun', isSuruNoun: true, meaning: '迟到', alternateForms: ['ちこく'] });
  return db;
}

const kanjiReading = (overrides = {}) => ({
  typeId: 'vocabulary-kanji-reading', level: 'N3', instruction: '＿＿＿の言葉の読み方として最もよいものを、１・２・３・４から一つえらびなさい。',
  questions: [{
    prompt: '彼は会議に遅刻した。', marks: [{ kind: 'target', start: 5, end: 7 }],
    options: [
      { text: 'ちこく', correct: true, analysis: '「遅」は「ち」、「刻」は「こく」。' },
      { text: 'ちごく', analysis: '「刻」は濁らない。' },
      { text: 'じこく', analysis: '「時刻」と混同。' },
      { text: 'ちきょく', analysis: '存在しない読み方。' },
    ],
    explanation: [{ kind: 'basis', body: '「遅刻」は「ちこく」と読む。' }, { kind: 'tip', body: '先确认词义再读。' }],
    knowledge: [{ code: 'W1' }],
  }],
  ...overrides,
});

test('question types carry the rules shared by every client', () => {
  const db = freshDb();
  const types = listQuestionTypes(db);
  assert.equal(types.length, 26);
  const dictation = types.find((t) => t.typeId === 'listening-basic-dictation');
  assert.equal(dictation.answerMode, 'text_input');
  assert.equal(dictation.rules.options.requirement, 'forbidden');
  assert.equal(dictation.rules.expected_text.requirement, 'required');
  assert.deepEqual(types.find((t) => t.typeId === 'vocabulary-usage').levels, ['N1', 'N2', 'N3']);
});

test('hard checks reject by question type and auto checks only warn', () => {
  const db = freshDb();
  // 选项数量、正确选项、选项理由、正确依据、标记、等级
  const bad = validateGroup(db, 1, kanjiReading({ level: 'N1', questions: [{ prompt: '彼は会議に遅刻した。', options: [{ text: 'ちこく' }, { text: 'ちこく' }], explanation: [] }] }));
  const codes = new Set(bad.errors.map((e) => e.code));
  for (const code of ['options_count', 'correct_option_count', 'option_analysis_required', 'basis_required', 'marks_required', 'option_duplicate']) assert.ok(codes.has(code), code);
  assert.ok(!codes.has('level_not_applicable'), 'N1 适用漢字読み');
  assert.ok(validateGroup(db, 1, { ...kanjiReading(), typeId: 'vocabulary-word-formation', level: 'N1' }).errors.some((e) => e.code === 'level_not_applicable'));
  // 自动检查：干扰项在知识点的其他写法里 → 只警告
  const warned = validateGroup(db, 1, kanjiReading({ questions: [{ ...kanjiReading().questions[0], options: [
    { text: 'ちこく', correct: true, analysis: 'a' }, { text: 'ちごく', analysis: 'b' }, { text: 'じこく', analysis: 'c' }, { text: 'チコク', analysis: 'd' }] }] }));
  assert.equal(warned.ok, true);
  assert.ok(!warned.warnings.some((w) => w.code === 'reading_options_form'), '片假名也是假名');
  assert.throws(() => createQuestionGroup(db, 1, kanjiReading({ questions: [{ prompt: 'x', options: [] }] })), (error) => error.statusCode === 400 && error.details.errors.length > 0);
});

test('a vocabulary question is created, read back, edited with stable option ids, reviewed and listed', () => {
  const db = freshDb();
  const created = createQuestionGroup(db, 1, kanjiReading());
  assert.equal(created.code, 'QS1');
  assert.equal(created.status, 'needs_review');
  assert.equal(created.questions[0].code, 'QV1');
  assert.equal(created.questions[0].marks[0].kind, 'target');
  assert.equal(created.questions[0].options.filter((o) => o.correct).length, 1);
  assert.equal(created.questions[0].knowledge[0].code, 'W1');
  assert.equal(created.review.latest.reviewer, 'system');
  const ids = created.questions[0].options.map((o) => o.id);

  // 读回来改一个干扰项，选项编号不变
  const edit = structuredClone(created);
  edit.questions[0].options[3] = { ...edit.questions[0].options[3], text: 'ちっこく', analysis: '促音を入れない。' };
  const updated = updateQuestionGroup(db, 1, 'QS1', edit);
  assert.deepEqual(updated.questions[0].options.map((o) => o.id), ids);
  assert.equal(updated.questions[0].options[3].text, 'ちっこく');
  assert.equal(updated.questions[0].code, 'QV1');

  // 审查：revise 需要 findings → needs_revision；pass → ready
  const context = reviewContext(db, 1, 'QS1');
  assert.match(context.checklist.checks, /目标必须含汉字/);
  assert.throws(() => submitReview(db, 1, 'QS1', { verdict: 'revise', summary: '要改' }), /finding/);
  const revised = submitReview(db, 1, 'QS1', { verdict: 'revise', summary: '干扰项太弱', agentLabel: 'reviewer-agent',
    findings: [{ question: 'QV1', optionId: ids[3], check: 'distractor_too_weak', severity: 'warning', message: '「ちっこく」没有迷惑性' }] });
  assert.equal(revised.status, 'needs_revision');
  assert.equal(listGroupsForReview(db, 1, { status: 'needs_revision' }).items[0].review.openFindings[0].optionId, ids[3]);
  assert.equal(submitReview(db, 1, 'QS1', { verdict: 'pass', summary: '可用' }).status, 'ready');
  assert.equal(getQuestionGroup(db, 1, 'QS1').review.openFindings.length, 0);
  // 学习者报告问题 → 回到待审查
  assert.equal(reportQuestionProblem(db, 1, 'QV1', { message: '答案好像不唯一' }).status, 'needs_review');

  assert.equal(listQuestionGroups(db, 1, { module: 'vocabulary' }).total, 1);
  assert.equal(listQuestionGroups(db, 1, { q: '会議' }).total, 1);
  assert.equal(listQuestionGroups(db, 1, { knowledge: 'W1' }).total, 1);
  assert.equal(listQuestionGroups(db, 2, {}).total, 0, '其他用户看不到');
  assert.deepEqual(deleteQuestionGroup(db, 1, 'QS1'), { deleted: 'QS1' });
});

test('composition, reading with a passage and evidence, dictation and shadowing follow their own rules', () => {
  const db = freshDb();
  const composition = createQuestionGroup(db, 1, {
    typeId: 'grammar-composition',
    questions: [{
      prompt: 'あの店は（　）（　）（★）（　）おいしい。', marks: [
        { kind: 'slot', start: 5, end: 8, label: '1' }, { kind: 'slot', start: 8, end: 11, label: '2' }, { kind: 'star_slot', start: 11, end: 14, label: '★' }, { kind: 'slot', start: 14, end: 17, label: '4' }],
      options: [{ text: '安い', analysis: 'a' }, { text: 'だけ', analysis: 'b' }, { text: 'でなく', correct: true, analysis: 'c' }, { text: '量も多くて', analysis: 'd' }],
      explanation: [{ kind: 'basis', body: '「安いだけでなく」' }, { kind: 'full_answer', body: 'あの店は安いだけでなく量も多くておいしい。' }],
    }],
  });
  assert.equal(composition.questions[0].code, 'QG1');
  assert.equal(composition.questions[0].marks.filter((m) => m.kind === 'star_slot').length, 1);

  const passage = '駅前の店は先月閉店した。理由は家賃の値上がりだという。';
  const readingInput = {
    typeId: 'reading-short', level: 'N3',
    materials: [{ role: 'main', kind: 'passage', body: passage, title: '閉店', bodyTranslation: '车站前的店上个月关门了。',
      sentences: [{ sentence: '駅前の店は先月閉店した。' }, { sentence: '理由は家賃の値上がりだという。', isKey: true, translation: '据说原因是房租上涨。' }] }],
    questions: [{
      prompt: '店が閉店した理由は何か。',
      options: [{ text: '家賃が上がったから', correct: true, analysis: '第二句。' }, { text: '客が減ったから', analysis: '文中没有。' }, { text: '店長が辞めたから', analysis: '文中没有。' }, { text: '駅が移ったから', analysis: '文中没有。' }],
      explanation: [{ kind: 'basis', body: '「理由は家賃の値上がりだ」。' }],
      evidence: [{ source: 'body', material: 'main', start: 12, end: 26, quote: '理由は家賃の値上がりだという' }],
    }],
  };
  const reading = createQuestionGroup(db, 1, readingInput);
  assert.equal(reading.questions[0].code, 'QR1');
  assert.equal(reading.materials[0].material, 'MT1');
  assert.equal(reading.materials[0].sentences[1].isKey, true);
  assert.equal(reading.questions[0].evidence[0].quote, '理由は家賃の値上がりだという');
  // 证据摘录与位置不一致 → 拒绝
  const wrongEvidence = structuredClone(readingInput);
  wrongEvidence.questions[0].evidence[0].quote = '家賃';
  assert.ok(validateGroup(db, 1, wrongEvidence).errors.some((e) => e.code === 'evidence_quote_mismatch'));
  // 另一个题组引用同一篇素材；素材被使用时不能删除
  const shared = createQuestionGroup(db, 1, { ...readingInput, materials: [{ role: 'main', material: 'MT1' }] });
  assert.equal(shared.materials[0].material, 'MT1');
  assert.deepEqual(getMaterial(db, 1, 'MT1').usedBy.map((u) => u.group), ['QS2', 'QS3']);
  assert.throws(() => deleteMaterial(db, 1, 'MT1'), /正被题组使用/);

  const audio = storeMedia(db, 1, { base64: Buffer.from('ID3fake-mp3-bytes').toString('base64'), mime: 'audio/mpeg', fileName: 'a.mp3' });
  const dictationInput = { typeId: 'listening-basic-dictation', materials: [{ role: 'audio', kind: 'audio', mediaId: audio, transcript: '明日は雨です。' }],
    questions: [{ expectedText: '明日は雨です。' }] };
  const dictation = createQuestionGroup(db, 1, dictationInput);
  assert.equal(dictation.questions[0].code, 'QL1');
  assert.equal(dictation.questions[0].promptMediaId, audio, '没有题干时用题组的音频');
  assert.ok(validateGroup(db, 1, { ...dictationInput, questions: [{ expectedText: 'x', options: [{ text: 'a' }, { text: 'b' }] }] }).errors.some((e) => e.code === 'options_forbidden'));
  // 跟读：没有选项、没有答案、没有解析
  const shadowing = validateGroup(db, 1, { typeId: 'listening-basic-shadowing', materials: [{ role: 'audio', material: dictation.materials[0].material }],
    questions: [{ prompt: '聞いて繰り返してください。', explanation: [{ kind: 'basis', body: 'x' }] }] });
  assert.deepEqual(shadowing.errors.map((e) => e.code), ['basis_forbidden']);
});
