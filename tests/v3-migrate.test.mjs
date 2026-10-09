// 旧数据 → v3 迁移：用一个最小的旧库验证各领域的换算规则。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrateLegacyToV3 } from '../server/v3/migrate/index.mjs';

function legacyFixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT, created_at TEXT);
    INSERT INTO users VALUES (1, 'learner', 'x', '2026-09-01T00:00:00Z');
    CREATE TABLE user_settings (user_id INTEGER, settings_json TEXT, updated_at TEXT);
    CREATE TABLE owned_review_items (user_id INTEGER, id TEXT, item_json TEXT, source TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE daily_practices (id TEXT, user_id INTEGER, practice_date TEXT, version INTEGER, title TEXT, minutes INTEGER, practice_json TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE practice_state (user_id INTEGER, attempt_history_json TEXT, active_attempt_json TEXT, updated_at TEXT);
    CREATE TABLE answers (user_id INTEGER, question_id TEXT, item_id TEXT, selected TEXT, correct INTEGER, answered_at TEXT, submission_state TEXT, answer_event_id TEXT, question_ref_json TEXT, question_kind TEXT);
    CREATE TABLE progress (user_id INTEGER, item_id TEXT, progress_json TEXT, updated_at TEXT);
  `);
  db.prepare('INSERT INTO user_settings VALUES (1, ?, ?)').run(JSON.stringify({
    locale: 'ja', fontSize: 'large', showRomaji: false, speech: { rate: 1.2, voices: { browser: { voice: 'Kyoko', style: '', role: '' }, azure: { voice: '' } } },
    memoryCardFrontFields: ['original'], jlptVocabularyQuestionKinds: ['kanji_to_kana'],
  }), '2026-09-02T00:00:00Z');
  const item = {
    id: 'w-gaikan', deck: 'n1_vocab', type: 'vocabulary', original: '概観', reading: 'がいかん', part_of_speech: '名詞・サ変動詞', jlpt_level: 'N2-N1',
    meaning_zh: '概观', meaning_ja: '全体を大まかに見渡すこと。', paraphrase_ja: 'ざっと見る', explanation_zh: '从整体上把握。',
    core_memory: ['俯瞰全貌'], examples: [{ ja: '歴史を概観する。', zh: '概览历史。' }], tags: ['N1'], register: { level: 'written', note_zh: '书面语' },
    source: { sentence: '実力養成編 第2課 写真1', chat_summary: '教材整理' },
    practice_questions: [{ id: 'seed-1', kind: 'kanji_to_kana', prompt: '歴史を概観する。', target: '概観', choices: ['がいかん', 'がいけん', 'かいかん', 'かいけん'], answer: 'がいかん', explanation_zh: '観读かん。' }],
  };
  db.prepare('INSERT INTO owned_review_items VALUES (1, ?, ?, ?, ?, ?)').run('w-gaikan', JSON.stringify(item), 'mcp', '2026-09-03T00:00:00Z', '2026-09-03T00:00:00Z');
  const verb = { id: 'w-toraeru', deck: 'n1_vocab', type: 'vocabulary', original: '捉える', reading: 'とらえる', part_of_speech: '動詞・他動詞', inflection_class: 'ichidan', meaning_zh: '抓住', examples: [] };
  db.prepare('INSERT INTO owned_review_items VALUES (1, ?, ?, ?, ?, ?)').run('w-toraeru', JSON.stringify(verb), 'mcp', '2026-09-04T00:00:00Z', '2026-09-04T00:00:00Z');
  // 练习里是同一道题的副本（题干相同），并且有作答
  const practiceQuestion = { id: 'pq-1', itemId: 'w-gaikan', kind: 'kanji_to_kana', title: '問題1 漢字読み', prompt: '歴史を概観する。', promptTarget: '概観', choices: ['がいかん', 'がいけん', 'かいかん', 'かいけん'], answerIndex: 0, correctReason: '「観」は「かん」。', memoryPoint: '濁らない' };
  db.prepare('INSERT INTO daily_practices VALUES (?, 1, ?, 1, ?, 10, ?, ?, ?)').run('dp-1', '2026-09-05', '今日', JSON.stringify({ title: '今日の練習', questions: [practiceQuestion] }), '2026-09-05T00:00:00Z', '2026-09-05T00:00:00Z');
  db.prepare('INSERT INTO practice_state VALUES (1, ?, NULL, ?)').run(JSON.stringify([{ id: 'att-1', view: 'daily-practice', practiceId: 'dp-1', startedAt: '2026-09-05T01:00:00Z', completedAt: '2026-09-05T01:05:00Z', questionIds: ['pq-1'], answers: [{ questionId: 'pq-1', selected: 'がいけん', correct: false }] }]), '2026-09-05T01:05:00Z');
  db.prepare('INSERT INTO answers VALUES (1, ?, ?, ?, 0, ?, ?, NULL, NULL, ?)').run('pq-1', 'w-gaikan', 'がいけん', '2026-09-05T01:04:00Z', 'legacy_submitted', 'kanji_to_kana');
  db.prepare('INSERT INTO progress VALUES (1, ?, ?, ?)').run('w-gaikan', JSON.stringify({ status: 'review', reviewCount: 3, ease: 2.6, intervalDays: 4, nextReviewAt: '2026-09-09T00:00:00Z' }), '2026-09-05T00:00:00Z');
  db.prepare('INSERT INTO progress VALUES (1, ?, ?, ?)').run('deleted-item', JSON.stringify({ status: 'learning' }), '2026-09-05T00:00:00Z');
  return db;
}

test('legacy data migrates into the v3 schema with codes, translations and de-duplicated questions', () => {
  const target = new DatabaseSync(':memory:');
  const report = migrateLegacyToV3({ legacy: legacyFixture(), target, now: '2026-10-09T00:00:00.000Z' });
  assert.equal(report.foreignKeyViolations, 0);

  const prefs = target.prepare('SELECT * FROM user_preferences WHERE user_id = 1').get();
  assert.equal(prefs.ui_language, 'ja');
  assert.equal(prefs.explanation_language, 'ja');
  assert.equal(prefs.font_scale, 1.2);
  assert.equal(prefs.show_romaji, 0);
  assert.deepEqual(target.prepare('SELECT provider, voice FROM user_speech_voices').all().map((r) => ({ ...r })), [{ provider: 'browser', voice: 'Kyoko' }]);
  assert.equal(target.prepare('SELECT type_id FROM user_question_kinds').get().type_id, 'vocabulary-kanji-reading');

  const wordbook = target.prepare('SELECT code, title FROM wordbooks').get();
  assert.deepEqual({ ...wordbook }, { code: 'WB1', title: 'N1/N2 词汇' });

  const noun = target.prepare("SELECT * FROM knowledge_points WHERE expression = '概観'").get();
  assert.equal(noun.code, 'W1');
  assert.equal(noun.kind, 'word');
  assert.equal(noun.pos, 'noun');
  assert.equal(noun.is_suru_noun, 1);
  assert.equal(noun.jlpt_level_min, 'N2');
  assert.equal(noun.jlpt_level_max, 'N1');
  assert.equal(noun.romaji, 'gaikan');
  assert.equal(noun.register_level, 'written');
  assert.equal(noun.source_sentence, null, '教材章节不是原句');
  const text = (table, rid, field, language) => target.prepare('SELECT text FROM content_translations WHERE owner_table = ? AND owner_rid = ? AND field = ? AND language = ?').get(table, rid, field, language)?.text;
  assert.equal(text('knowledge_points', noun.rid, 'meaning', 'ja'), '全体を大まかに見渡すこと。');
  assert.equal(text('knowledge_points', noun.rid, 'meaning', 'zh-Hans'), '概观');
  assert.equal(target.prepare('SELECT title FROM knowledge_sources WHERE point_rid = ?').get(noun.rid).title, '実力養成編 第2課 写真1');
  const note = target.prepare('SELECT rid, kind FROM knowledge_notes WHERE point_rid = ?').get(noun.rid);
  assert.equal(note.kind, 'register');
  assert.equal(text('knowledge_notes', note.rid, 'body', 'zh-Hans'), '书面语');

  const verb = target.prepare("SELECT * FROM knowledge_points WHERE expression = '捉える'").get();
  assert.equal(verb.code, 'W2');
  assert.equal(verb.pos, 'verb_2');
  assert.equal(verb.transitivity, 'transitive');

  // 知识点自带题与练习题是同一道题：只建一道，题型与标记统一
  assert.equal(target.prepare('SELECT count(*) AS n FROM questions').get().n, 1);
  const question = target.prepare('SELECT q.*, g.type_id, g.status FROM questions q JOIN question_groups g ON g.rid = q.group_rid').get();
  assert.equal(question.code, 'QV1');
  assert.equal(question.type_id, 'vocabulary-kanji-reading');
  assert.equal(question.status, 'ready');
  const mark = target.prepare('SELECT * FROM question_marks WHERE question_rid = ?').get(question.rid);
  assert.equal(question.prompt.slice(mark.start_offset, mark.end_offset), '概観');
  const correct = target.prepare('SELECT text FROM question_options WHERE question_rid = ? AND is_correct = 1').get(question.rid);
  assert.equal(correct.text, 'がいかん');
  const sections = target.prepare('SELECT kind FROM question_explanation_sections WHERE question_rid = ? ORDER BY position').all(question.rid).map((s) => s.kind);
  assert.deepEqual(sections, ['basis', 'tip']);
  assert.equal(target.prepare('SELECT count(*) AS n FROM knowledge_point_questions WHERE point_rid = ? AND question_rid = ?').get(noun.rid, question.rid).n, 1);

  // 练习、练习记录、作答：选项编号 + 当时的文字与对错
  assert.equal(target.prepare('SELECT count(*) AS n FROM practice_set_entries').get().n, 1);
  const answer = target.prepare('SELECT a.*, o.text AS option_text FROM attempt_answers a JOIN question_options o ON o.rid = a.selected_option_rid').get();
  assert.equal(answer.option_text, 'がいけん');
  assert.equal(answer.correct_text, 'がいかん');
  assert.equal(answer.correct, 0);
  assert.equal(target.prepare('SELECT submission_state FROM question_answer_states').get().submission_state, 'submitted');

  // 复习进度：已不存在的知识点写进报告
  assert.equal(target.prepare('SELECT count(*) AS n FROM review_schedules').get().n, 1);
  assert.equal(report.warnings['review_schedules.item_missing'].count, 1);
  assert.equal(target.prepare("SELECT next_no FROM id_sequences WHERE user_id = 1 AND prefix = 'W'").get().next_no, 3);
});

test('the old "require vocabulary questions" flag without kinds becomes all six vocabulary types', () => {
  const legacy = legacyFixture();
  legacy.prepare("INSERT INTO users VALUES (2, 'old-flag', 'x', '2026-09-01T00:00:00Z')").run();
  legacy.prepare('INSERT INTO user_settings VALUES (2, ?, ?)').run(JSON.stringify({ requireJlptVocabularyQuestions: true }), '2026-09-02T00:00:00Z');
  const target = new DatabaseSync(':memory:');
  migrateLegacyToV3({ legacy, target });
  const kinds = target.prepare('SELECT type_id FROM user_question_kinds WHERE user_id = 2 ORDER BY type_id').all().map((r) => r.type_id);
  assert.deepEqual(kinds, ['vocabulary-context', 'vocabulary-kanji-reading', 'vocabulary-orthography', 'vocabulary-paraphrase', 'vocabulary-usage', 'vocabulary-word-formation']);
});
