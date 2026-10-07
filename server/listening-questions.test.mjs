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

test('listening choices and answer can be saved before AI explanations are added', async () => {
  const { choiceDetails: _choiceDetails, explanation: _explanation, ...input } = makeInput('analysis-later');
  const saved = await call('create_listening_question', input);
  assert.deepEqual(saved.choiceDetails, input.choices.map(() => ({ translation: '', explanation: '' })));
  assert.equal(saved.answerIndex, 0);

  const revised = await call('update_listening_question', {
    id: saved.id,
    choices: ['男', '女', '両方', '不明'],
    answerIndex: 1,
  });
  assert.equal(revised.answerIndex, 1);
  assert.deepEqual(revised.choiceDetails, revised.choices.map(() => ({ translation: '', explanation: '' })));

  const analyzed = await call('update_listening_question', {
    id: saved.id,
    choiceDetails: [{ explanation: '話しているのは男ではない。' }, { explanation: '女が話している。' }],
  });
  assert.equal(analyzed.choiceDetails[1].explanation, '女が話している。');
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

test('learner audio is readable through MCP and HTTP deletion removes only that recording', async () => {
  const question = await call('create_listening_question', { ...makeInput('recording-audio'), transcript: '保存済みのお手本原文' });
  const bytes = Buffer.from('learner-recording-bytes');
  const recording = storage.createListeningRecording(alice.id, question.id, { audioMime: 'audio/mpeg', audioBase64: bytes.toString('base64') });
  const audioTool = tools.find((entry) => entry.name === 'get_listening_recording_audio');
  assert.equal(audioTool.scope, 'audio:read');
  const audio = await audioTool.handler({ recording_id: recording.id }, { ownerId: String(alice.id) });
  assert.equal(audio.content[0].type, 'audio');
  assert.deepEqual(Buffer.from(audio.content[0].data, 'base64'), bytes);
  await assert.rejects(audioTool.handler({ recording_id: recording.id }, { ownerId: String(bob.id) }), /not found/i);
  const context = await call('get_listening_recording_analysis_context', { recording_id: recording.id });
  assert.equal(context.reference_transcript, '保存済みのお手本原文');
  assert.equal(context.status, 'analyzing');

  const handler = createApiHandler({});
  const request = async (token) => {
    let status, result;
    await handler({ method: 'DELETE', url: `/api/listening-recordings/${recording.id}`, headers: { host: 'localhost', authorization: `Bearer ${token}` } }, { writeHead(code) { status = code; }, end(value) { result = JSON.parse(value); } });
    return { status, ...result };
  };
  assert.equal((await request(storage.loginUser('other-listener', 'password-two').token)).status, 404);
  assert.ok(storage.listeningRecordingForUser(alice.id, recording.id));
  assert.deepEqual(await request(storage.loginUser('listener', 'password-one').token), { status: 200, ok: true });
  assert.equal(storage.listeningRecordingForUser(alice.id, recording.id), null);
  assert.ok(storage.listeningAudioForUser(alice.id, question.id));
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

for (const name of ['create_listening_question', 'upsert_listening_question']) {
  test(`${name} creates questions from an owned audio reference without uploading`, async () => {
    const source = await call('create_listening_question', { ...makeInput(name + '-reference'), transcript: '共有原文' });
    const { audioFileName, audioMime, audioBase64, ...metadata } = makeInput('reuse');
    const input = { ...metadata, questionTypeId: 'listening-basic-training', choices: [], choiceDetails: [], answerIndex: -1, audioReference: source.audioReference };
    const assetsBefore = storage.getDb().prepare('SELECT COUNT(*) AS n FROM listening_audio_assets').get().n;
    const saved = await call(name, input);
    assert.notEqual(saved.id, source.id);
    assert.equal(saved.audioAssetId, source.audioAssetId);
    assert.equal(saved.audioReference, source.audioReference);
    assert.equal(saved.audioFileName, source.audioFileName);
    assert.equal(saved.transcript, '共有原文');
    assert.equal(saved.libraryNumber, source.libraryNumber + 1);
    assert.equal(storage.getDb().prepare('SELECT COUNT(*) AS n FROM listening_audio_assets').get().n, assetsBefore);
    const before = storage.listListeningQuestions(alice.id).length;
    await assert.rejects(call(name, input, bob), /Audio reference not found/);
    await assert.rejects(call(name, { ...input, audioReference: 'AU-999999' }), /Audio reference not found/);
    await assert.rejects(call(name, { ...input, audioBase64 }), /cannot be combined/);
    await assert.rejects(call(name, { ...input, choices: ['one'], answerIndex: 0 }), /choices/);
    assert.equal(storage.listListeningQuestions(alice.id).length, before);
    await call('delete_listening_question', { id: saved.id });
    const audioResult = await tools.find(tool => tool.name === 'get_listening_audio').handler({ question_id: source.id }, { ownerId: String(alice.id), scopes: ['audio:read'] });
    assert.equal(audioResult.content[0].type, 'audio');
  });
}

test('shared AU material versions survive transcript edits and removal of both linked LS questions', async () => {
 const first=await call('create_listening_question',makeInput('bank-material'));
 const {audioBase64: _bytes,audioMime: _mime,audioFileName: _file,...rest}=makeInput('bank-material-second');
 const second=await call('create_listening_question',{...rest,audioReference:first.audioReference});
 assert.equal(first.audioAssetId,second.audioAssetId);
 assert.deepEqual(first.materialRefs,second.materialRefs);
 const database=storage.getDb();
 const before=database.prepare('SELECT payload_json FROM bank_material_versions WHERE owner=? AND material_id=? AND revision=?').get(alice.id,first.materialRefs[0].id,first.materialRefs[0].revision).payload_json;
 storage.updateListeningTranscript(alice.id,first.id,{transcript:'修正版の音声内容。'});
 const changed=storage.listeningQuestionForUser(alice.id,second.id);
 assert.ok(changed.materialRefs[0].revision>second.materialRefs[0].revision);
 assert.equal(database.prepare('SELECT payload_json FROM bank_material_versions WHERE owner=? AND material_id=? AND revision=?').get(alice.id,first.materialRefs[0].id,first.materialRefs[0].revision).payload_json,before);
 storage.deleteListeningQuestion(alice.id,first.id);storage.deleteListeningQuestion(alice.id,second.id);
 assert.ok(database.prepare('SELECT id FROM listening_audio_assets WHERE user_id=? AND id=?').get(alice.id,first.audioAssetId));
 const latest=JSON.parse(database.prepare('SELECT payload_json FROM bank_material_group_versions WHERE owner=? AND group_id=? ORDER BY revision DESC LIMIT 1').get(alice.id,`audio:${first.audioAssetId}`).payload_json);
 assert.deepEqual(latest.questionRefs,[]);
});

test('MCP accepts expression type without silently classifying it as an N1 listening task', async () => {
 const saved=await call('create_listening_question',{...makeInput('expression'),questionTypeId:'listening-expression',choices:['どうぞ','ごめんなさい','ありがとう'],answerIndex:2,choiceDetails:[]});
 assert.equal(saved.questionTypeId,'listening-expression');
 const version=JSON.parse(storage.getDb().prepare('SELECT payload_json FROM bank_question_versions WHERE owner=? AND question_id=? AND revision=?').get(alice.id,saved.canonicalQuestionId,saved.questionRevision).payload_json);
 assert.equal(version.questionTypeId,'listening-expression');
});

test('immutable material audio remains readable after last LS deletion; owner, missing bytes and R2 adapter are enforced',async()=>{
 const q=storage.createListeningQuestion(alice.id,makeInput(94));
 const ref=q.materialRefs[0];const expected=Buffer.from('fake-audio-bytes-94');
 assert.equal(storage.materialAudioForUser(bob.id,ref.id,ref.revision),null);
 assert.equal(storage.materialAudioForUser(alice.id,ref.id,999),null);
 storage.deleteListeningQuestion(alice.id,q.id);
 assert.equal(storage.listeningAudioForUser(alice.id,q.id),null);
 assert.deepEqual(Buffer.from((await storage.readMaterialAudioForUser(alice.id,ref.id,ref.revision)).data,'base64'),expected);
 const descriptor=tools.find(t=>t.name==='get_material_audio');assert.equal(descriptor.scope,'audio:read');
 const result=await descriptor.handler({material_id:ref.id,revision:ref.revision},{ownerId:String(alice.id)});
 assert.deepEqual(Buffer.from(result.content[0].data,'base64'),expected);
 const {withPlatform}=await import('./platform.mjs');
 let requested;
 await withPlatform({files:{existsSync:()=>true},readMedia:async path=>{requested=path;return expected;}},async()=>{
  assert.deepEqual(Buffer.from((await storage.readMaterialAudioForUser(alice.id,ref.id,ref.revision)).data,'base64'),expected);
 });assert.ok(requested);
 await withPlatform({files:{existsSync:()=>true},readMedia:async()=>null},async()=>assert.equal(await storage.readMaterialAudioForUser(alice.id,ref.id,ref.revision),null));
});

test('material audio HTTP authenticates OAuth scope and isolates owners after LS deletion',async()=>{
 const {PassThrough}=await import('node:stream');
 const q=storage.createListeningQuestion(alice.id,makeInput(95));const ref=q.materialRefs[0];storage.deleteListeningQuestion(alice.id,q.id);
 const request=async(owner,scopes)=>{
  const handler=createApiHandler({mcp:{carriesToken:()=>true,authenticate:async()=>({ownerId:String(owner.id),scopes})}});
  const res=new PassThrough();let status;const chunks=[];res.writeHead=(code)=>{status=code;return res;};res.setHeader=()=>{};
  res.on('data',data=>chunks.push(data));const done=new Promise(resolve=>res.on('end',resolve));
  await handler({method:'GET',url:`/api/materials/${encodeURIComponent(ref.id)}/versions/${ref.revision}/audio`,headers:{host:'localhost',authorization:'Bearer synthetic-oauth'}},res);await done;
  return {status,bytes:Buffer.concat(chunks)};
 };
 assert.equal((await request(alice,[])).status,403);assert.equal((await request(bob,['audio:read'])).status,404);
 const owned=await request(alice,['audio:read']);assert.equal(owned.status,200);assert.equal(owned.bytes.toString(),'fake-audio-bytes-95');
});
