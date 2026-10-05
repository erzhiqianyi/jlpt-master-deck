import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

const dir = mkdtempSync(join(tmpdir(), 'jlpt-explanation-update-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const storage = await import('./storage.mjs');
const { tools } = await import('./mcp-tools.mjs');
const { createApiHandler } = await import('./api-handler.mjs');
const db = storage.getDb();
const alice = storage.createUser('explanation-alice', 'password-one');
const bob = storage.createUser('explanation-bob', 'password-two');
const question = { id: 'q1', itemId: 'i1', kind: 'grammar', prompt: '雨（ ）降れば', choices: ['さえ', 'こそ'], answer: 'さえ', answerIndex: 0, correctReason: 'さえ〜ば表示最低条件。', choiceAnalysis: [{ choice: 'さえ', explanation: '与ば呼应，表示只要下雨。' }, { choice: 'こそ', explanation: '强调名词，不能构成最低条件句型。' }] };
db.prepare("INSERT INTO daily_practices(id,user_id,practice_date,version,title,minutes,practice_json,created_at,updated_at) VALUES(?,?,'2026-10-02',1,'专项练习',30,?,'2026-10-02','2026-10-02')")
  .run('p1', alice.id, JSON.stringify({ sourceDraftId: 'archived-draft', questions: [question, { ...question, id: 'q2' }] }));
db.prepare('INSERT INTO answers(user_id,question_id,item_id,selected,correct,answered_at) VALUES(?,?,?,?,?,?)')
  .run(alice.id, 'q1', 'i1', 'さえ', 1, '2026-10-02');
const savedAnswers = db.prepare('SELECT * FROM answers').all();
after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

test('MCP persists a partial explanation update without changing answers or adjacent questions', async () => {
  const tool = tools.find((entry) => entry.name === 'update_practice_question_explanation');
  assert.equal(tool.scope, 'library:write');
  await tool.handler({ practice_id: 'p1', question_id: 'q1', patch: { correctReason: 'さえ与条件形ば呼应，突出成立的最低条件。' } }, { ownerId: String(alice.id) });
  const practice = storage.getDailyPractice(alice.id, 'p1');
  assert.match(practice.questions[0].correctReason, /最低条件/);
  const { correctReason, choiceAnalysis, ...rest } = practice.questions[0];
  const { correctReason: oldReason, choiceAnalysis: oldAnalysis, ...oldRest } = question;
  assert.deepEqual(rest, oldRest);
  assert.deepEqual(choiceAnalysis.map(({ correct, ...entry }) => entry), oldAnalysis);
  assert.equal(practice.questions[1].correctReason, oldReason);
  assert.deepEqual(db.prepare('SELECT * FROM answers').all(), savedAnswers);
});

test('invalid updates and cross-owner access leave the stored practice unchanged', () => {
  const before = db.prepare('SELECT practice_json FROM daily_practices').get();
  const update = (patch, owner = alice.id, id = 'q1') => storage.updatePracticeQuestionExplanation(owner, 'p1', id, patch);
  assert.throws(() => update({ correctReason: 'x' }, bob.id), /not found/);
  assert.throws(() => update({ correctReason: 'x' }, alice.id, 'missing'), /not found/);
  for (const patch of [{}, { answer: 'こそ' }, { correctReason: '' }, { correctReason: '正确答案是さえ' },
    { choiceAnalysis: [{ choice: 'さえ', explanation: '理由' }, { choice: 'さえ', explanation: '重复' }] },
    { choiceAnalysis: [{ choice: 'さえ', explanation: '理由' }, { choice: 'unknown', explanation: '错位' }] }]) {
    assert.throws(() => update(patch));
  }
  assert.deepEqual(db.prepare('SELECT practice_json FROM daily_practices').get(), before);
});

test('HTTP PATCH updates all option explanations and subsequent GET returns them', async () => {
  const handler = createApiHandler({});
  const token = storage.loginUser('explanation-alice', 'password-one').token;
  const request = async (method, body) => {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    Object.assign(req, { method, url: '/api/daily-practices/p1' + (method === 'PATCH' ? '/questions/q1/explanation' : ''), headers: { host: 'localhost', authorization: `Bearer ${token}` } });
    let status, result;
    await handler(req, { writeHead(code) { status = code; }, end(value) { result = JSON.parse(value); } });
    return { status, result };
  };
  const patch = { translationZh: '只要下雨', memoryPoint: '最低条件', choiceAnalysis: [{ choice: 'こそ', explanation: 'こそ强调焦点，不能与ば构成本题所需的条件表达。' }, { choice: 'さえ', explanation: 'さえ〜ば把下雨作为唯一必要条件。' }] };
  assert.equal((await request('PATCH', patch)).status, 200);
  const read = await request('GET');
  assert.equal(read.status, 200);
  assert.equal(read.result.practice.questions[0].translationZh, patch.translationZh);
  assert.deepEqual(read.result.practice.questions[0].choiceAnalysis.map((entry) => entry.correct), [true, false]);
  assert.deepEqual(db.prepare('SELECT * FROM answers').all(), savedAnswers);
});

test('MCP edits published prompt and target, preserving IDs, history and neighboring copies', async () => {
  const tool = tools.find((entry) => entry.name === 'update_practice_question');
  assert.equal(tool.scope, 'library:write');
  const before = storage.getDailyPractice(alice.id, 'p1');
  const patch = { prompt: '水（ ）あれば十分だ。', promptTarget: 'さえ' };
  await tool.handler({ practice_id: 'p1', question_id: 'q1', patch }, { ownerId: String(alice.id) });
  const after = storage.getDailyPractice(alice.id, 'p1');
  assert.equal(after.questions[0].prompt, patch.prompt);
  assert.equal(after.questions[0].promptTarget, patch.promptTarget);
  assert.equal(after.questions[0].id, 'q1');
  assert.equal(after.questions[0].itemId, 'i1');
  assert.equal(after.questions[0].answer, before.questions[0].answer);
  assert.deepEqual(after.questions[1], before.questions[1]);
  assert.notEqual(after.updated_at, before.updated_at);
  assert.deepEqual(db.prepare('SELECT * FROM answers').all(), savedAnswers);
});

test('general question updates reject unknown fields, invalid answers and other owners atomically', () => {
  const before = db.prepare('SELECT practice_json FROM daily_practices').get();
  for (const patch of [{ prompt: '' }, { id: 'replacement' }, { choices: ['さえ', 'さえ'] },
    { answer: 'unknown' }, { answer: 'さえ', answerIndex: 1 }, { answerIndex: 7 }]) {
    assert.throws(() => storage.updatePracticeQuestion(alice.id, 'p1', 'q1', patch));
  }
  assert.throws(() => storage.updatePracticeQuestion(bob.id, 'p1', 'q1', { prompt: '変更' }), /not found/);
  assert.deepEqual(db.prepare('SELECT practice_json FROM daily_practices').get(), before);
});

test('HTTP question PATCH persists corrected reading choices and clears stale prompt annotations', async () => {
  const reading = { id: 'reading-q', itemId: 'reading-item', kind: 'kanji_to_kana', prompt: '手当', context: '手当', choices: ['てあて', 'てとう'], answer: 'てあて', answerIndex: 0, japaneseAnnotations: [{ text: '手当', tokens: [{ surface: '手当', reading: 'てあて' }] }] };
  db.prepare("INSERT INTO daily_practices(id,user_id,practice_date,version,title,minutes,practice_json,created_at,updated_at) VALUES(?,?,'2026-10-06',1,'読み',10,?,'old','old')")
    .run('reading-p', alice.id, JSON.stringify({ questions: [reading] }));
  const token = storage.loginUser('explanation-alice', 'password-one').token;
  const req = Readable.from([Buffer.from(JSON.stringify({ prompt: '諸手当', choices: ['しょてあて', 'しょうてあて'], answerIndex: 0, correctReason: '正确答案是「しょてあて」。' }))]);
  Object.assign(req, { method: 'PATCH', url: '/api/daily-practices/reading-p/questions/reading-q', headers: { host: 'localhost', authorization: `Bearer ${token}` } });
  let status;
  await createApiHandler({})(req, { writeHead(code) { status = code; }, end() {} });
  assert.equal(status, 200);
  const result = storage.getDailyPractice(alice.id, 'reading-p').questions[0];
  assert.equal(result.prompt, '諸手当');
  assert.equal(result.context, '諸手当');
  assert.equal(result.answer, 'しょてあて');
  assert.equal(result.answerIndex, 0);
  assert.deepEqual(result.japaneseAnnotations, []);
  assert.deepEqual(db.prepare('SELECT * FROM answers').all(), savedAnswers);
});
