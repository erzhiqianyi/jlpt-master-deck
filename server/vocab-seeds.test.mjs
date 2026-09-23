import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'jlpt-vocab-seeds-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const { createUser, createTopicPractice, getDailyPractice, upsertReviewItem } = await import('./storage.mjs');

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

test('authored vocab questions must explain every wrong choice', () => {
  const { distractor_notes: _notes, ...withoutNotes } = usageSeed;
  assert.throws(() => upsertReviewItem({ ...item, practice_questions: [withoutNotes] }, { userId: user.id }), /distractor_notes/);
  assert.throws(() => upsertReviewItem({ ...item, practice_questions: [{ ...usageSeed, choices: usageSeed.choices.slice(0, 3) }] }, { userId: user.id }), /four distinct choices/);
  assert.throws(() => upsertReviewItem({ ...item, practice_questions: [{ ...usageSeed, explanation_zh: '' }] }, { userId: user.id }), /explanation_zh/);
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
