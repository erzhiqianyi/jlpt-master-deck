import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const dir = mkdtempSync(join(tmpdir(), 'jlpt-listening-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const storage = await import('./storage.mjs');
const { tools } = await import('./mcp-tools.mjs');
const alice = storage.createUser('listener', 'password-one');
const bob = storage.createUser('other-listener', 'password-two');

const audioBase64 = Buffer.from('fake-audio-bytes').toString('base64');
const makeInput = (n) => ({
  title: `第${n}問`,
  question: `質問${n}`,
  choices: ['A', 'B', 'C', 'D'],
  answerIndex: 0,
  explanation: `解説${n}`,
  audioFileName: `audio-${n}.mp3`,
  audioMime: 'audio/mpeg',
  audioBase64: Buffer.from(`fake-audio-bytes-${n}`).toString('base64'),
});

const call = async (name, args, owner = alice) => {
  const tool = tools.find((tool) => tool.name === name);
  return JSON.parse((await tool.handler(z.object(tool.inputSchema).parse(args), { ownerId: String(owner.id) })).content[0].text);
};

after(() => { storage.getDb().close(); rmSync(dir, { recursive: true, force: true }); });

test('MCP update_listening_question edits metadata without touching audio', async () => {
  const saved = await call('create_listening_question', makeInput(1));
  const changed = await call('update_listening_question', { id: saved.id, question: '新しい質問', answerIndex: 1, explanation: '新しい解説' });
  assert.equal(changed.id, saved.id);
  assert.equal(changed.question, '新しい質問');
  assert.equal(changed.answerIndex, 1);
  assert.equal(changed.explanation, '新しい解説');
  assert.equal(changed.title, saved.title);
  assert.deepEqual(changed.choices, saved.choices);
  assert.equal(changed.audioFileName, saved.audioFileName);
  assert.equal(changed.libraryNumber, saved.libraryNumber);
});

test('libraryNumber reorder (题号) shifts intervening questions and stays unique', async () => {
  const questions = [];
  for (let n = 1; n <= 5; n += 1) questions.push(await call('create_listening_question', makeInput(`order-${n}`)));
  const numbers = () => storage.listListeningQuestions(alice.id)
    .filter((item) => questions.some((q) => q.id === item.id))
    .sort((a, b) => a.libraryNumber - b.libraryNumber)
    .map((item) => item.id);
  const before = numbers();
  const last = questions[questions.length - 1];
  const beforeLast = last.libraryNumber;
  assert.ok(beforeLast > 1);

  const moved = await call('update_listening_question', { id: last.id, libraryNumber: before.length > 1 ? questions[0].libraryNumber : 1 });
  assert.equal(moved.libraryNumber, questions[0].libraryNumber);

  const all = storage.listListeningQuestions(alice.id);
  const ownNumbers = all.filter((item) => questions.some((q) => q.id === item.id)).map((item) => item.libraryNumber);
  assert.equal(new Set(ownNumbers).size, ownNumbers.length, 'library numbers must stay unique after reorder');
  assert.equal(storage.listeningQuestionForUser(alice.id, questions[0].id).libraryNumber, questions[0].libraryNumber + 1);
});

test('ownership: cannot read or update another user\'s listening question', async () => {
  const saved = await call('create_listening_question', makeInput('owned'));
  assert.equal(storage.updateListeningQuestion(bob.id, saved.id, { explanation: 'stolen' }), null);
  await assert.rejects(call('update_listening_question', { id: saved.id, explanation: 'stolen' }, bob), /not found/i);
  assert.equal(storage.listeningQuestionForUser(alice.id, saved.id).explanation, saved.explanation);
});

test('invalid updates are rejected and leave the stored question unchanged', async () => {
  const saved = await call('create_listening_question', makeInput('invalid'));
  for (const patch of [{ answerIndex: 9 }, { choices: ['A', 'B'] }, { choices: ['A', 'B', '', 'D'] }]) {
    await assert.rejects(call('update_listening_question', { id: saved.id, ...patch }), /Question requires|Choose a valid/);
  }
  const unchanged = storage.listeningQuestionForUser(alice.id, saved.id);
  assert.deepEqual(unchanged.choices, saved.choices);
  assert.equal(unchanged.answerIndex, saved.answerIndex);
});
