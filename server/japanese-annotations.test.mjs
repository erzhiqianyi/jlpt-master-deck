import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { japaneseAnnotationsSchema } from './japanese-annotations.mjs';
import { readingFields } from './reading-schema.mjs';

const directory = mkdtempSync(join(tmpdir(), 'jlpt-japanese-'));
process.env.JLPT_DB_PATH = join(directory, 'study.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(directory, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const storage = await import('./storage.mjs');
const user = storage.createUser('annotations', 'password');
const other = storage.createUser('other-annotations', 'password');
after(() => { storage.getDb().close(); rmSync(directory, { recursive: true, force: true }); });
const text = '温度を測定する。';
const annotations = [{ text, tokens: [{ surface: '温度', reading: 'おんど', pos: 'noun' }, { surface: 'を', pos: 'particle' }, { surface: '測定', reading: 'そくてい', pos: 'noun' }, { surface: 'する', pos: 'verb' }, { surface: '。', pos: 'other' }] }];

test('annotations validate lossless Unicode text and reject malformed data', () => {
  assert.deepEqual(japaneseAnnotationsSchema.parse(annotations), annotations);
  const emoji = [{ text: ' 😊\n見た。', tokens: [{ surface: ' 😊\n' }, { surface: '見た', reading: 'みた', pos: 'verb' }, { surface: '。' }] }];
  assert.deepEqual(japaneseAnnotationsSchema.parse(emoji), emoji);
  assert.throws(() => japaneseAnnotationsSchema.parse([{ ...annotations[0], text: text + '余分' }]));
  assert.throws(() => japaneseAnnotationsSchema.parse([{ text: '見る', tokens: [{ surface: '見る', reading: '错误', pos: 'verb' }] }]));
  assert.throws(() => japaneseAnnotationsSchema.parse([{ text: '見る', tokens: [{ surface: '見る', pos: 'guessed' }] }]));
});

test('MCP annotation schemas omit engine-specific regexes while preserving kana validation', () => {
  const schema = z.toJSONSchema(japaneseAnnotationsSchema, { io: 'input' });
  const readingSchema = schema.items.properties.tokens.items.properties.reading;
  assert.equal(readingSchema.type, 'string');
  assert.equal(readingSchema.minLength, 1);
  assert.equal(readingSchema.maxLength, 1000);
  assert.equal(readingSchema.pattern, undefined);
  assert.match(readingSchema.description, /Kana-only/);

  const withReading = (reading) => [{ text: '語', tokens: [{ surface: '語', reading }] }];
  for (const reading of ['ひらがな', 'カタカナー・', 'ﾊﾝｶｸ', '𛀀𛀁', 'かな カナ\t\n', 'あ'.repeat(1000)]) {
    assert.deepEqual(japaneseAnnotationsSchema.parse(withReading(reading)), withReading(reading));
  }
  for (const reading of ['', '漢字', 'romaji', '123', '<ruby>', 'かな漢字', 'あ'.repeat(1001)]) {
    assert.throws(() => japaneseAnnotationsSchema.parse(withReading(reading)));
  }
});

test('furigana schemas remain portable and still trim and validate kana readings', () => {
  const schema = z.toJSONSchema(readingFields.rubyTerms, { io: 'input' });
  assert.equal(schema.items.properties.reading.pattern, undefined);
  assert.equal(schema.items.properties.reading.minLength, 1);
  assert.equal(schema.items.properties.reading.maxLength, 400);
  assert.deepEqual(readingFields.rubyTerms.parse([{ text: ' 語 ', reading: ' カナ・ー ' }]), [{ text: '語', reading: 'カナ・ー' }]);
  for (const reading of ['ひらがな', 'ﾊﾝｶｸ', '𛀀𛀁', 'あ'.repeat(400)]) {
    assert.equal(readingFields.rubyTerms.parse([{ text: '語', reading }])[0].reading, reading);
  }
  for (const reading of ['', '   ', '漢字', 'romaji', '123', 'かな漢字', 'あ'.repeat(401)]) {
    assert.throws(() => readingFields.rubyTerms.parse([{ text: '語', reading }]));
  }
});

test('reading annotations persist across edits, stay account scoped, and support explicit clearing', () => {
  const saved = storage.createReadingQuestion(user.id, { passage: text, question: '何をするか。', choices: ['A', 'B', 'C', 'D'], answerIndex: 0, japaneseAnnotations: annotations });
  assert.deepEqual(saved.japaneseAnnotations, annotations);
  assert.equal(storage.readingQuestionForUser(other.id, saved.id), null);
  assert.deepEqual(storage.updateReadingQuestion(user.id, saved.id, { explanation: '新解析' }).japaneseAnnotations, annotations);
  assert.throws(() => storage.updateReadingQuestion(user.id, saved.id, { japaneseAnnotations: [{ text, tokens: [{ surface: '別の文' }] }] }));
  assert.deepEqual(storage.readingQuestionForUser(user.id, saved.id).japaneseAnnotations, annotations);
  assert.deepEqual(storage.updateReadingQuestion(user.id, saved.id, { japaneseAnnotations: [] }).japaneseAnnotations, []);
});

test('all four configurable word styles survive a settings round trip', () => {
  const display = { segmented: true, styles: {
    noun: { mode: 'text', color: '#123456' }, verb: { mode: 'underline', color: '#654321' },
    particle: { mode: 'none', color: '#445566' }, adjective: { mode: 'text', color: '#AABBCC' },
  } };
  const previous = storage.getStudyState(user.id).settings;
  const saved = storage.saveSettings(user.id, { ...previous, japaneseDisplay: display });
  assert.deepEqual(saved.japaneseDisplay, display);
  assert.deepEqual(storage.getStudyState(user.id).settings.japaneseDisplay, display);
  assert.equal(saved.showReviewRuby, previous.showReviewRuby);
});

test('the database adds annotation columns alongside legacy reading and listening data', () => {
  for (const table of ['reading_questions', 'listening_questions']) {
    assert.ok(storage.getDb().prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === 'japanese_annotations_json'));
  }
});


test('review-item annotations persist when omitted and clear only on explicit replacement', () => {
  const item = { id: 'annotation-word', deck: 'n1_vocab', type: 'noun', original: '温度', reading: 'おんど', meaning_zh: '温度', part_of_speech: '名詞',
    examples: [{ ja: text, zh: '测量温度。' }, { ja: '温度が上がる。', zh: '温度上升。' }], japanese_annotations: annotations };
  const saved = storage.upsertReviewItem(item, { userId: user.id });
  assert.deepEqual(saved.japanese_annotations, annotations);
  const { japanese_annotations, ...withoutAnnotations } = item;
  assert.deepEqual(storage.upsertReviewItem({ ...withoutAnnotations, meaning_zh: '新的释义' }, { userId: user.id }).japanese_annotations, annotations);
  assert.deepEqual(storage.upsertReviewItem({ ...item, japanese_annotations: [] }, { userId: user.id }).japanese_annotations, []);
});

test('listening annotations persist with audio questions and survive partial updates', () => {
  const saved = storage.createListeningQuestion(user.id, { title: '分词听力', questionTypeId: 'listening-task', question: text, choices: ['A', 'B', 'C', 'D'], answerIndex: 0,
    audioFileName: 'annotation-test.wav', audioMime: 'audio/wav', audioBase64: Buffer.from('test-audio-only').toString('base64'), japaneseAnnotations: annotations });
  try {
    assert.deepEqual(saved.japaneseAnnotations, annotations);
    assert.deepEqual(storage.updateListeningQuestion(user.id, saved.id, { explanation: '新的解析' }).japaneseAnnotations, annotations);
    assert.deepEqual(storage.updateListeningQuestion(user.id, saved.id, { japaneseAnnotations: [] }).japaneseAnnotations, []);
    assert.equal(storage.listeningQuestionForUser(other.id, saved.id), null);
  } finally { storage.deleteListeningQuestion(user.id, saved.id); }
});
