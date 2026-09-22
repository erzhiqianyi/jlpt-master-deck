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
const { tools } = await import('./mcp-tools.mjs');
const { createApiHandler } = await import('./api-handler.mjs');
const alice = storage.createUser('reader', 'password-one');
const bob = storage.createUser('other-reader', 'password-two');
const input = { title: '読解', passage: '昔と今では素材が違う。', question: '筆者の主張は何か。', choices: ['A', 'B', 'C', 'D'], answerIndex: 1, explanation: '総解説', passageTranslation: '过去与现在的食材不同。', choiceExplanations: ['A', 'B', 'C', 'D'].map((text, index) => ({ text, translation: `翻译${index}`, analysis: `分析${index}`, evidence: '昔と今では素材が違う。', errorType: index === 1 ? '' : '无中生有' })), readingAnalysis: { summary: '素材变化', structure: '过去与现在的对比', keySentences: ['昔と今では素材が違う。'] } };
const call = async (name, args, owner = alice) => {
  const tool = tools.find((tool) => tool.name === name);
  return JSON.parse((await tool.handler(z.object(tool.inputSchema).parse(args), { ownerId: String(owner.id) })).content[0].text);
};
after(() => { storage.getDb().close(); rmSync(dir, { recursive: true, force: true }); });

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
