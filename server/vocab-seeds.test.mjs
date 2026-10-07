import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'jlpt-vocab-seeds-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const { createUser, createTopicPractice, getDailyPractice, upsertReviewItem, getStudyState, saveSettings, loadReviewData, getDb } = await import('./storage.mjs');

const user = createUser('seed-author', 'test-pass');

const usageSeed = {
  id: 'vocab-kisei-usage-1',
  kind: '用法',
  prompt: '規制',
  target: '規制',
  choices: [
    '台風の影響で、一部の道路では交通が規制されている。',
    '毎朝七時に起きるように、自分を規制している。',
    'この料理は塩を規制して作ったので、薄味だ。',
    '部屋が狭いので、家具の数を規制して置いた。',
  ],
  answer: '台風の影響で、一部の道路では交通が規制されている。',
  explanation_zh: '「規制」是由法律、规则或行政对社会行为加以管制，交通規制是典型用法。',
  distractor_notes: {
    '毎朝七時に起きるように、自分を規制している。': '约束自己应说「自分を律する」，「規制」用于社会、制度层面的管制。',
    'この料理は塩を規制して作ったので、薄味だ。': '减少用量应说「塩を控える」，「規制」不用于个人的分量调整。',
    '部屋が狭いので、家具の数を規制して置いた。': '限制数量应说「数を制限する・絞る」，这里没有规则或管理主体。',
  },
};

const item = {
  id: 'vocab-kisei', deck: 'n1_vocab', type: 'vocabulary', part_of_speech: '名詞・サ変動詞', original: '規制', reading: 'きせい', jlpt_level: 'N1',
  meaning_ja: '法律や規則によって行動や活動を制限すること。', paraphrase_ja: 'ルールで自由にできないようにすること。', meaning_zh: '限制、管制',
  inflection_class: 'suru', base_form: '規制する',
  conjugations: [{ kind: 'ます形', form: '規制します' }, { kind: 'て形', form: '規制して' }, { kind: '受身形', form: '規制される' }],
  examples: [
    { ja: '台風の影響で、一部の道路では交通が規制されている。', zh: '受台风影响，部分道路正在实施交通管制。' },
    { ja: '政府は、インターネット広告に対する規制を強化する方針だ。', zh: '政府计划加强对网络广告的监管。' },
  ],
};

test('authored vocab questions must explain every wrong choice when required', () => {
  saveSettings(user.id, { ...getStudyState(user.id).settings, requireJlptVocabularyQuestions: true, jlptVocabularyQuestionKinds: ['usage'] });
  const { distractor_notes: _notes, ...withoutNotes } = usageSeed;
  assert.throws(() => upsertReviewItem({ ...item, practice_questions: [withoutNotes] }, { userId: user.id }), /distractor_notes/);
  assert.throws(() => upsertReviewItem({ ...item, practice_questions: [{ ...usageSeed, choices: usageSeed.choices.slice(0, 3) }] }, { userId: user.id }), /four distinct choices/);
  assert.throws(() => upsertReviewItem({ ...item, practice_questions: [{ ...usageSeed, explanation_zh: '' }] }, { userId: user.id }), /explanation_zh/);
  saveSettings(user.id, { ...getStudyState(user.id).settings, requireJlptVocabularyQuestions: false, jlptVocabularyQuestionKinds: [] });
});

test('用法 seeds become usage practice questions with their authored explanations', () => {
  upsertReviewItem({ ...item, question_kinds: ['usage'], practice_questions: [usageSeed] }, { userId: user.id });
  const session = createTopicPractice(user.id, { deck: 'n1_vocab', kinds: ['usage'], count: 5 });
  // The session view hides the answer key until answered; read the stored practice instead.
  const [question] = getDailyPractice(user.id, session.id).questions;
  assert.equal(question.kind, 'usage');
  assert.deepEqual(question.choices, usageSeed.choices);
  const note = question.choiceAnalysis?.find((entry) => entry.choice === usageSeed.choices[1])?.explanation;
  assert.match(note ?? '', /自分を律する/);
});

test('usage is never synthesized without an authored seed', () => {
  upsertReviewItem({ ...item, id: 'vocab-kisei-plain', jlpt_level: 'N2', practice_questions: [] }, { userId: user.id });
  assert.throws(() => createTopicPractice(user.id, { deck: 'n1_vocab', kinds: ['usage'], jlptLevel: 'N2', count: 5 }), /No practice questions/);
});

test('語形成 seeds become word_formation questions; 表記 is accepted but never synthesized without a seed', () => {
  const wordFormationSeed = {
    id: 'vocab-kisei-word-formation-1',
    kind: '語形成',
    prompt: '（　）規制の動きが広がっている。',
    choices: ['脱', '非', '無', '不'],
    answer: '脱',
    explanation_zh: '「脱～」表示摆脱、去除，「脱規制」＝放松、撤除管制，与「動きが広がる」相符。',
    distractor_notes: {
      非: '「非～」表示“不是～”（非公式・非常識），「非規制」不是常用词。',
      無: '「無～」表示“没有～”（無許可・無制限），不与「規制」组合。',
      不: '「不～」接在表示状态、性质的词前（不自由・不公平），「規制」是行为名词，不能加「不」。',
    },
  };
  upsertReviewItem({ ...item, id: 'vocab-kisei-wf', practice_questions: [wordFormationSeed] }, { userId: user.id });
  const session = createTopicPractice(user.id, { deck: 'n1_vocab', kinds: ['word_formation'], count: 5 });
  const [question] = getDailyPractice(user.id, session.id).questions;
  assert.equal(question.kind, 'word_formation');
  assert.match(question.choiceAnalysis.find((entry) => entry.choice === '不').explanation, /不自由/);
  assert.throws(() => createTopicPractice(user.id, { deck: 'n1_vocab', kinds: ['kana_to_kanji'], count: 5 }), /No practice questions/);
});

const { tools } = await import('./mcp-tools.mjs');
const call = async (name, args, owner) => {
  const result = await tools.find(tool => tool.name === name).handler(args, { ownerId: String(owner.id) });
  return result.structuredContent ?? JSON.parse(result.content[0].text);
};

test('MCP saves knowledge independently and validates supplied questions for every owner', async () => {
  const owner = createUser('required-questions', 'test-pass');
  const other = createUser('optional-questions', 'test-pass');
  assert.equal((await call('get_study_state', {}, owner)).settings.requireJlptVocabularyQuestions, false);
  saveSettings(owner.id, { ...getStudyState(owner.id).settings, requireJlptVocabularyQuestions: true, jlptVocabularyQuestionKinds: ['usage'] });
  assert.equal((await call('get_study_state', {}, owner)).settings.requireJlptVocabularyQuestions, true);
  const requiredItem = { ...item, id: 'required-word' };
  await call('upsert_review_item', { item: requiredItem }, owner);
  await assert.rejects(call('upsert_review_item', { item: { ...requiredItem, practice_questions: [{ ...usageSeed, kind: 'grammar' }] } }, owner), /vocabulary kind/);
  await assert.rejects(call('upsert_review_item', { item: { ...requiredItem, practice_questions: [{ ...usageSeed, prompt: '' }] } }, owner), /prompt/);
  assert.equal(loadReviewData(owner.id).items.find(entry => entry.id === requiredItem.id).practice_questions?.length ?? 0, 0);
  await call('upsert_review_item', { item: { ...requiredItem, practice_questions: [usageSeed] } }, owner);
  await call('upsert_review_item', { item: requiredItem }, owner);
  assert.equal(loadReviewData(owner.id).items.find(entry => entry.id === requiredItem.id).practice_questions[0].id, usageSeed.id);
  await call('upsert_review_item', { item: requiredItem }, other);
  await assert.rejects(call('upsert_review_item', { item: { ...requiredItem, practice_questions: [{ kind: 'usage' }] } }, other), /prompt/);
  await call('upsert_review_item', { item: { id: 'grammar-exempt', deck: 'grammar_expression', type: 'grammar', original: '〜にほかならない' } }, owner);
  saveSettings(owner.id, { ...getStudyState(owner.id).settings, requireJlptVocabularyQuestions: false, jlptVocabularyQuestionKinds: [] });
  await call('upsert_review_item', { item: requiredItem }, owner);
});


test('selected kinds are canonical preferences and do not require unrelated authored questions', async () => {
  const owner = createUser('multi-kinds', 'test-pass');
  saveSettings(owner.id, { jlptVocabularyQuestionKinds: ['usage', 'meaning', 'usage', 'invalid'] });
  assert.deepEqual(getStudyState(owner.id).settings.jlptVocabularyQuestionKinds, ['meaning', 'usage']);
  const input = { ...item, id: 'multi-kinds-word', practice_questions: [usageSeed] };
  await call('upsert_review_item', { item: input }, owner);
  const meaningSeed = { ...usageSeed, id: 'meaning-seed', kind: 'meaning' };
  await call('upsert_review_item', { item: { ...input, practice_questions: [usageSeed, meaningSeed] } }, owner);
  saveSettings(owner.id, { jlptVocabularyQuestionKinds: [], requireJlptVocabularyQuestions: true });
  assert.equal(getStudyState(owner.id).settings.requireJlptVocabularyQuestions, false);
  await call('upsert_review_item', { item: { ...item, id: 'empty-selection-word' } }, owner);
});

test('legacy enabled rules migrate to all six vocabulary kinds', () => {
  const owner = createUser('legacy-kinds', 'test-pass');
  getDb().prepare('UPDATE user_settings SET settings_json = ? WHERE user_id = ?').run(JSON.stringify({ requireJlptVocabularyQuestions: true }), owner.id);
  const saved = getStudyState(owner.id).settings;
  assert.deepEqual(saved.jlptVocabularyQuestionKinds, ['kanji_to_kana', 'kana_to_kanji', 'word_formation', 'moji_goi', 'meaning', 'usage']);
});

test('all six preferences allow kana knowledge and independent conjugation updates', async () => {
  const owner = createUser('independent-capture', 'test-pass');
  saveSettings(owner.id, { requireJlptVocabularyQuestions: true });
  const kana = { ...item, id: 'kana-item', original: 'チェック', reading: 'チェック' };
  await call('upsert_review_item', { item: kana }, owner);
  await call('upsert_review_item', { item: { ...kana, conjugations: [...kana.conjugations, { kind: 'negative', form: 'チェックしない' }] } }, owner);
  await call('upsert_review_item', { item: { ...item, id: 'with-seed', practice_questions: [usageSeed] } }, owner);
  await call('upsert_review_item', { item: { ...item, id: 'with-seed', practice_questions: [] } }, owner);
  assert.equal(loadReviewData(owner.id).items.find(entry => entry.id === 'with-seed').practice_questions?.length ?? 0, 0);
});

test('knowledge-only updates preserve legacy incomplete seeds without forcing question repair', () => {
  const owner=createUser('legacy-independent', 'test-pass');
  upsertReviewItem({...item,id:'legacy-seed-update'},{userId:owner.id});
  const row=getDb().prepare('SELECT item_json FROM owned_review_items WHERE user_id=? AND id=?').get(owner.id,'legacy-seed-update');
  const old=JSON.parse(row.item_json);old.practice_questions=[{kind:'usage',prompt:'規制'}];
  getDb().prepare('UPDATE owned_review_items SET item_json=? WHERE user_id=? AND id=?').run(JSON.stringify(old),owner.id,old.id);
  const saved=upsertReviewItem({...item,id:old.id,conjugations:[...item.conjugations,{kind:'negative',form:'規制しない'}]},{userId:owner.id});
  assert.deepEqual(saved.practice_questions,old.practice_questions);
  assert.throws(()=>upsertReviewItem({...item,id:old.id,practice_questions:old.practice_questions},{userId:owner.id}),/four distinct choices/);
});
