// v3 阶段 1：设置、单词本、知识点的数据访问。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrateLegacyToV3 } from '../server/v3/migrate/index.mjs';
import { seedReferenceData } from '../server/v3/reference-data.mjs';
import { ensureUser } from '../server/v3/database.mjs';
import { getSettings, updateSettings, listCardTemplates } from '../server/v3/repo/settings.mjs';
import { listWordbooks, createWordbook, renameWordbook, deleteWordbook } from '../server/v3/repo/wordbooks.mjs';
import { createKnowledge, getKnowledge, listKnowledge, updateKnowledge, deleteKnowledge, lookupKnowledge } from '../server/v3/repo/knowledge.mjs';

function freshDb() {
  const legacy = new DatabaseSync(':memory:');
  legacy.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL)');
  const db = new DatabaseSync(':memory:');
  migrateLegacyToV3({ legacy, target: db });
  db.exec('PRAGMA foreign_keys = ON');
  seedReferenceData(db);
  ensureUser(db, { id: 1, username: 'learner' });
  ensureUser(db, { id: 2, username: 'other' });
  return db;
}

test('settings are read with defaults and partially updated with validation', () => {
  const db = freshDb();
  assert.equal(getSettings(db, 1).explanationLanguage, 'zh-Hans');
  assert.equal(getSettings(db, 1).cardTemplates.word, 'word_standard');
  const updated = updateSettings(db, 1, { explanationLanguage: 'en', showRomaji: false, speech: { rate: 1.2, voices: { browser: { voice: 'Kyoko' } } }, cardTemplates: { word: 'word_simple' } });
  assert.equal(updated.explanationLanguage, 'en');
  assert.equal(updated.showRomaji, false);
  assert.equal(updated.speech.rate, 1.2);
  assert.equal(updated.speech.voices.browser.voice, 'Kyoko');
  assert.equal(updated.cardTemplates.word, 'word_simple');
  assert.throws(() => updateSettings(db, 1, { explanationLanguage: 'de' }), /explanationLanguage/);
  assert.throws(() => updateSettings(db, 1, { cardTemplates: { word: 'grammar_standard' } }), /模板/);
  const templates = listCardTemplates(db, 'en');
  assert.equal(templates.find((t) => t.code === 'word_simple').name.text, 'Simple');
  assert.deepEqual(templates.find((t) => t.code === 'word_simple').back.map((f) => f.field), ['reading', 'meaning']);
});

test('wordbooks are per user, uniquely named and cannot be deleted while not empty', () => {
  const db = freshDb();
  const book = createWordbook(db, 1, { title: 'N1 単語' });
  assert.equal(book.code, 'WB1');
  assert.equal(createWordbook(db, 2, { title: 'N1 単語' }).code, 'WB1', '编号按用户各自从 1 开始');
  assert.throws(() => createWordbook(db, 1, { title: 'N1 単語' }), /同名/);
  assert.equal(renameWordbook(db, 1, 'WB1', { title: 'N1 词汇' }).title, 'N1 词汇');
  createKnowledge(db, 1, { kind: 'word', wordbook: 'WB1', expression: '概観', reading: 'がいかん', pos: 'noun', meaning: '概观' });
  assert.throws(() => deleteWordbook(db, 1, 'WB1'), /还有 1 个知识点/);
  assert.equal(listWordbooks(db, 1)[0].stats.total, 1);
  assert.equal(listWordbooks(db, 1)[0].stats.new, 1);
  assert.equal(listWordbooks(db, 2)[0].stats.total, 0);
});

test('knowledge points are created, read in the explanation language with fallback, updated and deleted', () => {
  const db = freshDb();
  createWordbook(db, 1, { title: '词汇' });
  const created = createKnowledge(db, 1, {
    kind: 'word', wordbook: 'WB1', expression: '捉える', reading: 'とらえる', pos: 'verb_2', transitivity: 'transitive', jlptLevel: 'N1',
    meaning: '抓住', meaningJa: 'つかむ。', explanation: '把握要点。', tags: ['动词'],
    examples: [{ sentence: '要点を捉える。', translation: '抓住要点。' }], memoryPoints: ['捉＝抓'],
    notes: [{ kind: 'register', title: '语体', body: '书面' }],
  });
  assert.equal(created.code, 'W1');
  assert.equal(created.romaji, 'toraeru');
  assert.equal(created.meaning.text, '抓住');
  assert.equal(created.conjugations.find((c) => c.form === 'te').written, '捉えて');
  assert.equal(created.conjugations.find((c) => c.form === 'te').reading, 'とらえて');
  assert.ok(created.conjugations.find((c) => c.form === 'te').step.text.includes('る'));

  // 英文：释义没有英文 → 回退到中文并标注
  updateSettings(db, 1, { explanationLanguage: 'en' });
  const en = getKnowledge(db, 1, 'W1');
  assert.equal(en.meaning.language, 'zh-Hans');
  assert.equal(en.meaning.isFallback, true);
  updateKnowledge(db, 1, 'W1', { meaning: 'to grasp', examples: [{ sentence: '要点を捉える。', translation: 'grasp the point' }] });
  const enAfter = getKnowledge(db, 1, 'W1');
  assert.equal(enAfter.meaning.text, 'to grasp');
  assert.equal(enAfter.examples[0].translation.text, 'grasp the point');
  // 按位置替换例句时保留其他语言的译文
  assert.equal(getKnowledge(db, 1, 'W1', { language: 'zh-Hans' }).examples[0].translation.text, '抓住要点。');

  assert.throws(() => updateKnowledge(db, 1, 'W1', { kind: 'grammar' }), /大类/);
  assert.throws(() => createKnowledge(db, 1, { kind: 'word', wordbook: 'WB1', expression: 'x', pos: '名詞' }), /pos/);

  // 搜索：写法、读音、罗马音、释义、编号
  for (const q of ['捉える', 'とらえ', 'toraeru', 'grasp', 'W1']) assert.equal(listKnowledge(db, 1, { q }).total, 1, q);
  assert.equal(listKnowledge(db, 1, { level: 'N1' }).total, 1);
  assert.equal(listKnowledge(db, 1, { status: 'new' }).total, 1);
  assert.equal(listKnowledge(db, 2, {}).total, 0, '其他用户看不到');

  // 查词：活用形也能查到
  assert.equal(lookupKnowledge(db, 1, '捉えて')[0].code, 'W1');
  assert.equal(lookupKnowledge(db, 1, 'とらえた')[0].code, 'W1');

  assert.deepEqual(deleteKnowledge(db, 1, 'W1'), { deleted: 'W1' });
  assert.equal(db.prepare("SELECT count(*) AS n FROM content_translations WHERE owner_table LIKE 'knowledge%'").get().n, 0, '译文随之删除');
});
