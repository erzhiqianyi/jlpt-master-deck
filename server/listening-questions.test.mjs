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
const { createApiHandler } = await import('./api-handler.mjs');
const alice = storage.createUser('listener', 'password-one');
const bob = storage.createUser('other-listener', 'password-two');

const audioBase64 = Buffer.from('fake-audio-bytes').toString('base64');
const makeInput = (n) => ({
  title: `第${n}問`,
  question: `質問${n}`,
  choices: ['A', 'B', 'C', 'D'],
  choiceDetails: ['A', 'B', 'C', 'D'].map((choice) => ({ translation: choice, explanation: `${choice} の理由` })),
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

test('HTTP edit updates one question and the shared transcript without changing audio', async () => {
  const token = storage.loginUser('listener', 'password-one').token;
  const handler = createApiHandler({});
  const input = makeInput('http-edit');
  const first = storage.createListeningQuestion(alice.id, input);
  const second = storage.createListeningQuestion(alice.id, { ...input, title: '第2問', question: '質問2' });
  const request = async (id, body) => {
    let status, result;
    await handler({ method: 'PATCH', url: `/api/listening-questions/${id}`, headers: { host: 'localhost', authorization: `Bearer ${token}` }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } }, { writeHead(code) { status = code; }, end(value) { result = JSON.parse(value); } });
    return { status, ...result };
  };
  const changed = await request(first.id, { title: '改訂', question: '新しい質問', choices: ['A', 'B', 'C', 'D'], choiceDetails: input.choiceDetails, answerIndex: 1, transcript: '音声の原文', transcriptTranslation: '音频原文' });
  assert.equal(changed.status, 200);
  assert.equal(changed.question.title, '改訂');
  assert.equal(changed.question.answerIndex, 1);
  assert.equal(changed.question.audioAssetId, first.audioAssetId);
  assert.equal(storage.listeningQuestionForUser(alice.id, second.id).transcript, '音声の原文');
  assert.equal(storage.listeningQuestionForUser(alice.id, second.id).question, '質問2');
  assert.equal((await request(first.id, { answerIndex: 9 })).status, 400);
  assert.equal((await request(storage.createListeningQuestion(bob.id, makeInput('other-http-edit')).id, { title: 'stolen' })).status, 404);
});

test('questions sharing one audio play in their numbered order', async () => {
  const audio = makeInput('shared-audio');
  const saved = [];
  for (let number = 1; number <= 4; number += 1) {
    saved.push(await call('create_listening_question', {
      ...audio,
      title: `第${number}問`,
      question: `質問${number}`,
    }));
  }
  const ids = new Set(saved.map((item) => item.id));
  assert.deepEqual(
    storage.listListeningQuestions(alice.id).filter((item) => ids.has(item.id)).map((item) => item.title),
    ['第1問', '第2問', '第3問', '第4問'],
  );
});

test('MCP audio returns the owned file as audio content and rejects other users', async () => {
  const saved = await call('create_listening_question', makeInput('mcp-audio'));
  const tool = tools.find((entry) => entry.name === 'get_listening_audio');
  assert.equal(tool.scope, 'audio:read');
  const result = await tool.handler({ question_id: saved.id }, { ownerId: String(alice.id) });
  assert.equal(result.content[0].type, 'audio');
  assert.equal(result.content[0].mimeType, 'audio/mpeg');
  assert.deepEqual(Buffer.from(result.content[0].data, 'base64'), Buffer.from('fake-audio-bytes-mcp-audio'));
  await assert.rejects(tool.handler({ question_id: saved.id }, { ownerId: String(bob.id) }), /not found/i);
});

test('transcript and its translation are shared by questions on one audio and have separate scopes', async () => {
  const audio = makeInput('transcript-shared');
  const first = await call('create_listening_question', {
    ...audio,
    transcript: '男：大学の願書をコピーします。',
    transcriptTranslation: '男：我会复印大学的申请表。',
    choiceDetails: [
      { translation: '复印申请表', explanation: '正确：对话最后明确要求先复印一张。' },
      { translation: '填写申请表', explanation: '错误：填写要在复印之后。' },
      { translation: '寄出申请表', explanation: '错误：对话没有提到邮寄。' },
      { translation: '检查申请表', explanation: '错误：这是之后才做的事情。' },
    ],
  });
  const second = await call('create_listening_question', { ...audio, title: '第2题', question: '次に何をしますか。' });
  assert.equal(second.transcript, first.transcript);
  assert.equal(second.transcriptTranslation, first.transcriptTranslation);
  assert.equal(second.choiceDetails[0].translation, 'A');
  assert.equal(first.choiceDetails[0].explanation, '正确：对话最后明确要求先复印一张。');

  const getTool = tools.find((entry) => entry.name === 'get_listening_transcript');
  const updateTool = tools.find((entry) => entry.name === 'update_listening_transcript');
  assert.equal(getTool.scope, 'audio:read');
  assert.equal(updateTool.scope, 'library:write');
  assert.equal((await call('get_listening_transcript', { question_id: second.id })).transcript, first.transcript);
  assert.equal(Object.hasOwn((await call('list_listening_questions', {})).find((item) => item.id === first.id), 'transcript'), false);
  const updated = await call('update_listening_transcript', { question_id: second.id, transcript: '女：先复印一张。' });
  assert.equal(updated.transcript, '女：先复印一张。');
  assert.equal(storage.listeningQuestionForUser(alice.id, first.id).transcript, '女：先复印一张。');
  await assert.rejects(call('update_listening_transcript', { question_id: second.id, transcript: '越权' }, bob), /not found/i);
});

test('question updates keep each choice translation and explanation aligned by index', async () => {
  const saved = await call('create_listening_question', {
    ...makeInput('choice-details'),
  });
  const changed = await call('update_listening_question', {
    id: saved.id,
    choiceDetails: [{ translation: '一', explanation: '依据一' }, { translation: '二', explanation: '理由二' }, { translation: '三', explanation: '错因三' }, { translation: '四', explanation: '错因四' }],
  });
  assert.deepEqual(changed.choiceDetails.map((entry) => entry.translation), ['一', '二', '三', '四']);
  assert.deepEqual(changed.choiceDetails.map((entry) => entry.explanation), ['依据一', '理由二', '错因三', '错因四']);
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

test('MCP delete_listening_question removes an owned question and is ownership-scoped', async () => {
  const saved = await call('create_listening_question', makeInput('to-delete'));
  await assert.rejects(call('delete_listening_question', { id: saved.id }, bob), /not found/i);
  assert.ok(storage.listeningQuestionForUser(alice.id, saved.id));
  const result = await call('delete_listening_question', { id: saved.id });
  assert.equal(result.ok, true);
  assert.equal(storage.listeningQuestionForUser(alice.id, saved.id), null);
  await assert.rejects(call('delete_listening_question', { id: saved.id }), /not found/i);
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

for (const name of ['edit_listening_question', 'patch_listening_question', 'upsert_listening_question']) {
  test(`${name} preserves omitted fields and rejects unowned or missing ids`, async () => {
    const saved = await call('create_listening_question', makeInput(name));
    const updated = await call(name, { id: saved.id, explanation: '更新' });
    assert.equal(updated.explanation, '更新');
    assert.equal(updated.question, saved.question);
    assert.equal(updated.audioAssetId, saved.audioAssetId);
    await assert.rejects(call(name, { id: saved.id, explanation: 'unauthorized' }, bob), /not found/i);
    await assert.rejects(call(name, { id: 'missing', explanation: 'missing' }), /not found/i);
    assert.equal(storage.listeningQuestionForUser(alice.id, saved.id).explanation, '更新');
  });
}

test('upsert creates with complete audio input and rejects ambiguous operations before writing', async () => {
  const before = storage.listListeningQuestions(alice.id).length;
  await assert.rejects(call('upsert_listening_question', { question: 'missing audio' }));
  await assert.rejects(call('upsert_listening_question', { ...makeInput('bad-order'), libraryNumber: 1 }), /requires an existing/);
  assert.equal(storage.listListeningQuestions(alice.id).length, before);
  const saved = await call('upsert_listening_question', makeInput('upsert-create'));
  assert.equal(storage.listListeningQuestions(alice.id).length, before + 1);
  await assert.rejects(call('upsert_listening_question', { id: saved.id, audioBase64, explanation: 'must not save' }), /cannot be supplied/);
  assert.equal(storage.listeningQuestionForUser(alice.id, saved.id).explanation, saved.explanation);
});

test('MCP supports basic-training questions without choices', async () => {
  const saved = await call('upsert_listening_question', {
    ...makeInput('free-response'), questionTypeId: 'listening-basic-training', choices: [], answerIndex: -1,
  });
  const updated = await call('patch_listening_question', { id: saved.id, choices: [], answerIndex: -1 });
  assert.deepEqual(updated.choices, []);
  assert.equal(updated.answerIndex, -1);
});
