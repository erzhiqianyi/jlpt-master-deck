import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';

const dir = mkdtempSync(join(tmpdir(), 'jlpt-reading-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
// Start from the legacy schema to exercise migration without replacing saved records.
const legacy = new DatabaseSync(process.env.JLPT_DB_PATH);
legacy.exec(`CREATE TABLE reading_questions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, title TEXT NOT NULL, passage TEXT NOT NULL, question TEXT NOT NULL, choices_json TEXT NOT NULL, answer_index INTEGER NOT NULL, explanation TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
INSERT INTO reading_questions VALUES ('legacy', 1, '旧题', '本文', '問い', '["A","B","C","D"]', 1, '旧総解説', '2026-01-01');`);
legacy.close();
const storage = await import('./storage.mjs');
const { saveMaterial } = await import('./bank-materials.mjs');
const { tools } = await import('./mcp-tools.mjs');
const { createApiHandler } = await import('./api-handler.mjs');
const alice = storage.createUser('reader', 'password-one');
const bob = storage.createUser('other-reader', 'password-two');
const input = { title: '読解', passage: '昔と今では素材が違う。', question: '筆者の主張は何か。', choices: ['A', 'B', 'C', 'D'], answerIndex: 1, explanation: '総解説', passageTranslation: '过去与现在的食材不同。', choiceExplanations: ['A', 'B', 'C', 'D'].map((text, index) => ({ text, translation: `翻译${index}`, analysis: `分析${index}`, evidence: '昔と今では素材が違う。', errorType: index === 1 ? '' : '无中生有' })), readingAnalysis: { summary: '素材变化', structure: '过去与现在的对比', keySentences: ['昔と今では素材が違う。'] } };
input.explanationNodes = [{ title: '解题思路与排除技巧', body: '先定位昔と今的对比，再排除认为食材没变的选项。' }];
const call = async (name, args, owner = alice) => {
  const tool = tools.find((tool) => tool.name === name);
  return JSON.parse((await tool.handler(z.object(tool.inputSchema).parse(args), { ownerId: String(owner.id) })).content[0].text);
};
after(() => { storage.getDb().close(); rmSync(dir, { recursive: true, force: true }); });

test('MCP preserves integrated articles and information table conditions across edits', async () => {
  const refs = ['A','B'].map(id => saveMaterial(storage.getDb(),alice.id,`typed-${id}`,{type:'article',blocks:[{id,type:'paragraph',text:`本文${id}`}]}));
  const integrated = await call('create_reading_question',{...input,questionTypeId:'reading-integrated',materialRefs:refs});
  assert.deepEqual(integrated.materialRefs,refs);
  assert.deepEqual((await call('update_reading_question',{id:integrated.id,explanation:'改訂解説'})).materialRefs,refs);
  const table = saveMaterial(storage.getDb(),alice.id,'typed-table',{type:'table',headers:['時間','料金'],rows:[['9時','800円']]});
  const info = await call('create_reading_question',{...input,questionTypeId:'reading-information',materialRefs:[table],taskConditions:['9時に行く','1000円以内']});
  const edited = await call('update_reading_question',{id:info.id,explanation:'条件を照合する'});
  assert.deepEqual(edited.materialRefs,[table]); assert.deepEqual(edited.taskConditions,info.taskConditions);
  assert.throws(()=>storage.createReadingQuestion(bob.id,{...input,materialRefs:refs}),/Owned/);
});

test('legacy schema migrates in place and explanation remains editable', () => {
  const old = storage.readingQuestionForUser(alice.id, 'legacy');
  assert.equal(old.explanation, '旧総解説');
  assert.deepEqual(old.choiceExplanations, []);
  assert.equal(old.passageTranslation, '');
  const saved = storage.updateReadingQuestion(alice.id, old.id, { passageTranslation: '本文翻译' });
  assert.equal(saved.explanation, '旧総解説');
  assert.equal(saved.createdAt, old.createdAt);
});

test('MCP create/list/get/update round trip and partial update preserve all fields', async () => {
  const saved = await call('create_reading_question', input);
  assert.deepEqual(saved.choiceExplanations, input.choiceExplanations);
  assert.deepEqual((await call('get_reading_question', { id: saved.id })).readingAnalysis, input.readingAnalysis);
  assert.ok((await call('list_reading_questions', {})).some((item) => item.id === saved.id));
  const changed = await call('update_reading_question', { id: saved.id, explanation: '新総解説' });
  assert.equal(changed.id, saved.id);
  assert.equal(changed.createdAt, saved.createdAt);
  assert.deepEqual(changed.choiceExplanations, saved.choiceExplanations);
  assert.equal(changed.passageTranslation, input.passageTranslation);
  assert.equal(changed.explanation, '新総解説');
  assert.equal(storage.getDb().prepare('SELECT passage_translation FROM reading_questions WHERE id = ?').get(saved.id).passage_translation, input.passageTranslation);
  assert.equal(storage.readingQuestionForUser(bob.id, saved.id), null);
  assert.equal(storage.updateReadingQuestion(bob.id, saved.id, { explanation: 'stolen' }), null);
  assert.ok(!(await call('list_reading_questions', {}, bob)).some((item) => item.id === saved.id));
  await assert.rejects(call('get_reading_question', { id: saved.id }, bob), /not found/i);
  await assert.rejects(call('update_reading_question', { id: saved.id, explanation: 'stolen' }, bob), /not found/i);
});

test('invalid updates fail atomically; choice order cannot silently detach from explanations', () => {
  const saved = storage.createReadingQuestion(alice.id, input);
  for (const patch of [{}, { answerIndex: 4 }, { choiceExplanations: input.choiceExplanations.slice(1) }, { choices: ['B', 'A', 'C', 'D'] }, { readingAnalysis: { summary: 'partial' } }, { passageTranslation: 123 }]) {
    assert.throws(() => storage.updateReadingQuestion(alice.id, saved.id, patch));
    assert.deepEqual(storage.readingQuestionForUser(alice.id, saved.id), saved);
  }
  const cleared = storage.updateReadingQuestion(alice.id, saved.id, { choices: ['B', 'A', 'C', 'D'], choiceExplanations: [], passageTranslation: '', readingAnalysis: { summary: '', structure: '', keySentences: [] } });
  assert.deepEqual(cleared.choiceExplanations, []);
  assert.equal(cleared.explanation, input.explanation);
});

test('MCP delete_reading_question removes an owned question and is ownership-scoped', async () => {
  const saved = await call('create_reading_question', input);
  await assert.rejects(call('delete_reading_question', { id: saved.id }, bob), /not found/i);
  assert.ok(storage.readingQuestionForUser(alice.id, saved.id));
  const result = await call('delete_reading_question', { id: saved.id });
  assert.equal(result.ok, true);
  assert.equal(storage.readingQuestionForUser(alice.id, saved.id), null);
  await assert.rejects(call('delete_reading_question', { id: saved.id }), /not found/i);
});

test('MCP create advertises and enforces every required explanation field before writing', async () => {
  const before = storage.listReadingQuestions(alice.id);
  for (const field of ['explanation', 'passageTranslation', 'choiceExplanations', 'readingAnalysis', 'explanationNodes']) {
    const incomplete = { ...input };
    delete incomplete[field];
    await assert.rejects(call('create_reading_question', incomplete), new RegExp(field));
  }
  const invalid = [
    { explanation: '   ' }, { passageTranslation: ' \n ' }, { choiceExplanations: [] },
    { explanationNodes: [] }, { explanationNodes: [{ title: '方法', body: ' ' }] },
    ...['translation', 'analysis', 'evidence'].map((field) => ({ choiceExplanations: input.choiceExplanations.map((choice, i) => i === 2 ? { ...choice, [field]: ' ' } : choice) })),
    ...['summary', 'structure'].map((field) => ({ readingAnalysis: { ...input.readingAnalysis, [field]: ' ' } })),
    { readingAnalysis: { ...input.readingAnalysis, keySentences: [] } },
    { readingAnalysis: { ...input.readingAnalysis, keySentences: ['原文にはない根拠。'] } },
    { choiceExplanations: [...input.choiceExplanations].reverse() },
    { choiceExplanations: input.choiceExplanations.map((choice) => ({ ...choice, errorType: '' })) },
    { choiceExplanations: input.choiceExplanations.map((choice) => ({ ...choice, errorType: '错误' })) },
  ];
  for (const patch of invalid) await assert.rejects(call('create_reading_question', { ...input, ...patch }));
  assert.deepEqual(storage.listReadingQuestions(alice.id), before);
});

test('MCP updates validate the merged record atomically and cannot bypass checks by omitting fields', async () => {
  const saved = await call('create_reading_question', input);
  const before = storage.readingQuestionForUser(alice.id, saved.id);
  for (const patch of [
    {}, { passageTranslation: ' ' }, { explanationNodes: [] }, { choiceExplanations: [] },
    { answerIndex: 0 }, { choices: ['B', 'A', 'C', 'D'] }, { passage: '全く違う本文。' },
    { readingAnalysis: { ...input.readingAnalysis, keySentences: ['捏造された引用。'] } },
  ]) {
    await assert.rejects(call('update_reading_question', { id: saved.id, ...patch }));
    assert.deepEqual(storage.readingQuestionForUser(alice.id, saved.id), before);
  }
  const reordered = await call('update_reading_question', { id: saved.id, choices: ['B', 'A', 'C', 'D'], answerIndex: 0,
    choiceExplanations: [input.choiceExplanations[1], input.choiceExplanations[0], ...input.choiceExplanations.slice(2)] });
  assert.equal(reordered.answerIndex, 0);
  assert.equal(reordered.choiceExplanations[0].text, 'B');
  assert.equal(reordered.passageTranslation, input.passageTranslation);

  const old = storage.createReadingQuestion(alice.id, { passage: input.passage, question: input.question, choices: input.choices, answerIndex: input.answerIndex });
  await assert.rejects(call('update_reading_question', { id: old.id, title: '只改标题' }), /explanation|passageTranslation/);
  assert.deepEqual(storage.readingQuestionForUser(alice.id, old.id), old);
  const repaired = await call('update_reading_question', { id: old.id, ...input });
  assert.equal(repaired.createdAt, old.createdAt);
  assert.equal(repaired.explanationNodes.length, 1);
});

test('MCP handler checks completeness even when called without tool-schema parsing', async () => {
  const create = tools.find((tool) => tool.name === 'create_reading_question');
  const update = tools.find((tool) => tool.name === 'update_reading_question');
  const ctx = { ownerId: String(alice.id) };
  await assert.rejects(create.handler({ ...input, passageTranslation: '' }, ctx));
  const saved = await call('create_reading_question', input);
  const before = storage.readingQuestionForUser(alice.id, saved.id);
  await assert.rejects(update.handler({ id: saved.id, explanationNodes: [] }, ctx));
  assert.deepEqual(storage.readingQuestionForUser(alice.id, saved.id), before);
});

test('HTTP get/patch honor ownership and return validation errors', async () => {
  const token = storage.loginUser('reader', 'password-one').token;
  const handler = createApiHandler({});
  const saved = storage.createReadingQuestion(alice.id, input);
  const request = async (method, id, body) => {
    let status, result;
    const req = { method, url: `/api/reading-questions/${id}`, headers: { host: 'localhost', authorization: `Bearer ${token}` }, async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(JSON.stringify(body)); } };
    await handler(req, { writeHead(code) { status = code; }, end(value) { result = JSON.parse(value); } });
    return { status, ...result };
  };
  assert.equal((await request('GET', saved.id)).question.passageTranslation, input.passageTranslation);
  assert.equal((await request('PATCH', saved.id, { explanation: 'HTTP updated' })).question.explanation, 'HTTP updated');
  assert.equal((await request('PATCH', saved.id, { answerIndex: 9 })).status, 400);
  const other = storage.createReadingQuestion(bob.id, input);
  assert.equal((await request('GET', other.id)).status, 404);
  assert.equal((await request('PATCH', other.id, { explanation: 'stolen' })).status, 404);
});

test('MCP readings round-trip independently, preserve analysis and validate kana atomically', async () => {
  const rubyTerms = [{ text: '素材', reading: 'そざい' }];
  const saved = await call('create_reading_question', { ...input, rubyTerms });
  assert.deepEqual(saved.rubyTerms, rubyTerms);
  assert.deepEqual((await call('get_reading_question', { id: saved.id })).rubyTerms, rubyTerms);
  const revised = await call('update_reading_question', { id: saved.id, rubyTerms: [{ text: '昔', reading: 'むかし' }] });
  assert.equal(revised.passage, saved.passage);
  assert.deepEqual(revised.choiceExplanations, saved.choiceExplanations);
  assert.deepEqual(revised.readingAnalysis, saved.readingAnalysis);
  assert.equal(revised.createdAt, saved.createdAt);
  const untouched = await call('update_reading_question', { id: saved.id, title: '更新标题' });
  assert.deepEqual(untouched.rubyTerms, revised.rubyTerms);
  const beforeInvalid = storage.readingQuestionForUser(alice.id, saved.id);
  await assert.rejects(call('update_reading_question', { id: saved.id, rubyTerms: [{ text: '昔', reading: '错误' }] }));
  assert.deepEqual(storage.readingQuestionForUser(alice.id, saved.id), beforeInvalid);
  assert.deepEqual((await call('update_reading_question', { id: saved.id, rubyTerms: [] })).rubyTerms, []);
});

test('shared article reference groups questions, freezes versions and forks changed passages', () => {
 const first=storage.createReadingQuestion(alice.id,{...input,questionTypeId:'reading-short',level:'N1'});
 const second=storage.createReadingQuestion(alice.id,{...input,question:'別の問い',materialRef:first.materialRef,questionTypeId:'reading-short'});
 assert.deepEqual(first.materialRef,second.materialRef);
 assert.equal(first.materialGroupId,second.materialGroupId);
 const database=storage.getDb();
 const readGroup=id=>JSON.parse(database.prepare('SELECT payload_json FROM bank_material_group_versions WHERE owner=? AND group_id=? ORDER BY revision DESC LIMIT 1').get(alice.id,id).payload_json);
 assert.equal(readGroup(first.materialGroupId).questionRefs.length,2);
 const before=database.prepare('SELECT payload_json FROM bank_question_versions WHERE owner=? AND question_id=? AND revision=?').get(alice.id,first.canonicalQuestionId,first.questionRevision).payload_json;
 storage.updateReadingQuestion(alice.id,first.id,{passageTranslation:'新版翻译'});
 assert.equal(database.prepare('SELECT payload_json FROM bank_question_versions WHERE owner=? AND question_id=? AND revision=?').get(alice.id,first.canonicalQuestionId,first.questionRevision).payload_json,before);
 const changed=storage.updateReadingQuestion(alice.id,second.id,{passage:'新しい本文。',choiceExplanations:[],readingAnalysis:{summary:'',structure:'',keySentences:[]}});
 assert.notEqual(changed.materialRef.id,first.materialRef.id);
 assert.equal(changed.id,second.id);assert.equal(changed.canonicalQuestionId,second.canonicalQuestionId);
 const count=database.prepare('SELECT COUNT(*) AS n FROM reading_questions').get().n;
 assert.throws(()=>storage.createReadingQuestion(bob.id,{...input,materialRef:first.materialRef}),/owner|article/i);
 assert.equal(database.prepare('SELECT COUNT(*) AS n FROM reading_questions').get().n,count);
 storage.deleteReadingQuestion(alice.id,changed.id);
 assert.equal(readGroup(changed.materialGroupId).questionRefs.length,0);
 assert.ok(database.prepare('SELECT payload_json FROM bank_question_versions WHERE owner=? AND question_id=? AND revision=?').get(alice.id,changed.canonicalQuestionId,changed.questionRevision));
});
