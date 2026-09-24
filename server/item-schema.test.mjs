import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalizeItemFields } from './item-schema.mjs';

const dir = mkdtempSync(join(tmpdir(), 'jlpt-item-schema-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const { createUser, upsertReviewItem, loadReviewData, addReviewItemImage, removeReviewItemImage, itemImageForUser, deleteReviewItem, reviewItemById, getDb } = await import('./storage.mjs');

const legacyGrammar = {
  id: 'g-totan', date: '2026-08-31', input_at: '2026-08-31T10:00:00+09:00', deck: 'grammar_expression', type: 'expression',
  original: 'たとたん（に）', grammar_point: '〜たとたん（に）', source_grammar_point: 'Vた + とたん（に）',
  source_original_sentence: 'ドアを開けたとたん、犬が出てきた。', source_chat_summary: 'N1 时间关系语法',
  meaning_zh: '刚一……就……', core_memory: 'た形 + とたん', explanation_zh: '后项是意外。', analysis: '不接意志。',
  grammar_forms: [{ form: 'Vた + とたん（に）', connection_zh: '接た形', example: 'ドアを開けたとたん、犬が出てきた。', meaning_zh: '刚一开门，狗就出来了。' }],
  grammar_features: [{ feature: '前接た形', detail_zh: '不是辞书形' }],
  comparison_notes: [{ target: 'や否や', difference_zh: '更书面' }],
  everyday_alternatives: [{ ja: 'Vたらすぐ', zh: '口语' }],
  usage_register: 'both', usage_register_zh: '书面口语都可', exam_register_zh: '看た形',
  examples: [{ ja: 'ドアを開けたとたん、犬が出てきた。', zh: '刚一开门，狗就出来了。' }],
  localizations: { en: { meaning: 'as soon as', analysis: 'No volition.' } },
  targetWordbookId: 'grammar_expression', review_status: 'new', lesson_topic: '时间关系',
};

test('legacy grammar fields fold into the shared shape without losing content', () => {
  const item = canonicalizeItemFields(legacyGrammar);
  for (const key of ['date', 'grammar_point', 'source_grammar_point', 'grammar_forms', 'grammar_features', 'comparison_notes', 'everyday_alternatives', 'usage_register', 'usage_register_zh', 'exam_register_zh', 'analysis', 'targetWordbookId', 'review_status', 'source_original_sentence', 'source_chat_summary']) {
    assert.equal(item[key], undefined, key);
  }
  // The pattern example duplicated examples[0], so only the form and connection remain.
  assert.deepEqual(item.patterns, [{ pattern: 'Vた + とたん（に）', connection_zh: '接た形' }]);
  assert.deepEqual(item.points, [{ label: '前接た形', detail_zh: '不是辞书形' }]);
  assert.deepEqual(item.comparisons, [{ target: 'や否や', difference_zh: '更书面' }, { target: 'Vたらすぐ', difference_zh: '口语', kind: 'everyday' }]);
  assert.deepEqual(item.register, { level: 'both', note_zh: '书面口语都可', exam_tip_zh: '看た形' });
  assert.equal(item.explanation_zh, '后项是意外。\n\n不接意志。');
  assert.deepEqual(item.localizations, { en: { meaning: 'as soon as', explanation: 'No volition.' } });
  assert.deepEqual(item.source, { chat_summary: 'N1 时间关系语法' });
  assert.equal(item.input_at, '2026-08-31T10:00:00+09:00');
  assert.ok(item.tags.includes('时间关系'));
  assert.deepEqual(canonicalizeItemFields(item), item);
});

test('vocabulary collocations and extra notes use the same fields as grammar', () => {
  const item = canonicalizeItemFields({
    id: 'v1', date: '2026-09-01', deck: 'n1_vocab', type: 'word', original: '行う', base_form: '行う',
    collocations: ['式を行う：举行仪式', { text: '調査を行う' }], transitivity: '他動詞', orthography: '行なう',
  });
  assert.equal(item.input_at, '2026-09-01T00:00:00+09:00');
  assert.equal(item.base_form, undefined);
  assert.deepEqual(item.patterns, [{ pattern: '式を行う', meaning_zh: '举行仪式' }, { pattern: '調査を行う' }]);
  assert.deepEqual(item.points, [{ label: '自他', detail_zh: '他動詞' }, { label: '汉字写法', detail_zh: '行なう' }]);
});

test('images keep only asset ids or https URLs', () => {
  const item = canonicalizeItemFields({ id: 'x', deck: 'n1_vocab', type: 'word', original: 'x', images: [
    { id: 'abcdefgh1234', caption: ' 场景 ' }, { url: 'http://insecure.example/a.png' }, { url: 'https://example.com/a.png' }, { id: '../etc' },
  ] });
  assert.deepEqual(item.images, [{ id: 'abcdefgh1234', caption: '场景' }, { url: 'https://example.com/a.png' }]);
});

test('stored items read back canonical and images attach, dedupe and detach', () => {
  const user = createUser('image-owner', 'test-pass');
  const stored = upsertReviewItem(legacyGrammar, { userId: user.id });
  assert.equal(stored.grammar_forms, undefined);
  assert.equal(loadReviewData(user.id).items[0].patterns[0].pattern, 'Vた + とたん（に）');

  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex').toString('base64');
  assert.throws(() => addReviewItemImage(user.id, 'g-totan', { imageBase64: png, mime: 'image/jpeg' }), /does not match/);
  assert.throws(() => addReviewItemImage(user.id, 'g-totan', { imageBase64: png, mime: 'image/svg+xml' }), /PNG, JPEG/);
  assert.equal(addReviewItemImage(user.id, 'missing', { imageBase64: png, mime: 'image/png' }), null);

  const withImage = addReviewItemImage(user.id, 'g-totan', { imageBase64: png, mime: 'image/png', caption: '门一开狗就冲出来' });
  const [image] = withImage.images;
  assert.equal(image.caption, '门一开狗就冲出来');
  const asset = itemImageForUser(user.id, image.id);
  assert.ok(asset && existsSync(asset.image_path));
  assert.equal(itemImageForUser(user.id + 1, image.id), null);

  const withUrl = addReviewItemImage(user.id, 'g-totan', { url: 'https://example.com/door.png' });
  assert.equal(withUrl.images.length, 2);
  assert.throws(() => addReviewItemImage(user.id, 'g-totan', { url: 'http://example.com/door.png' }), /https/);

  const removed = removeReviewItemImage(user.id, 'g-totan', image.id);
  assert.deepEqual(removed.images, [{ url: 'https://example.com/door.png' }]);
  assert.equal(itemImageForUser(user.id, image.id), null);
  assert.equal(existsSync(asset.image_path), false);
});

test('deleteReviewItem removes the item, its progress/answers and any now-unused image', () => {
  const user = createUser('delete-owner', 'test-pass');
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex').toString('base64');
  upsertReviewItem({ id: 'to-delete', deck: 'grammar_expression', type: 'grammar', original: '〜ざるを得ない', meaning_zh: '不得不' }, { userId: user.id });
  const withImage = addReviewItemImage(user.id, 'to-delete', { imageBase64: png, mime: 'image/png' });
  const asset = itemImageForUser(user.id, withImage.images[0].id);
  const now = new Date().toISOString();
  getDb().prepare('INSERT INTO progress (user_id, item_id, progress_json, updated_at) VALUES (?, ?, ?, ?)').run(user.id, 'to-delete', '{}', now);
  getDb().prepare('INSERT INTO answers (user_id, question_id, item_id, selected, correct, answered_at) VALUES (?, ?, ?, ?, ?, ?)').run(user.id, 'q1', 'to-delete', 'A', 1, now);

  assert.equal(deleteReviewItem(user.id, 'missing'), false);
  assert.equal(deleteReviewItem(user.id, 'to-delete'), true);

  assert.equal(reviewItemById('to-delete', user.id), null);
  assert.ok(!loadReviewData(user.id).items.some((item) => item.id === 'to-delete'));
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM progress WHERE user_id = ? AND item_id = ?').get(user.id, 'to-delete').n, 0);
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM answers WHERE user_id = ? AND item_id = ?').get(user.id, 'to-delete').n, 0);
  assert.equal(itemImageForUser(user.id, withImage.images[0].id), null);
  assert.equal(existsSync(asset.image_path), false);
});
