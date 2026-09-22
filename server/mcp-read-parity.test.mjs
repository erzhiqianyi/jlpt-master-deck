import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
const dir = mkdtempSync(join(tmpdir(), 'jlpt-read-parity-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
process.env.JLPT_NEWS_SOURCE_DIR = join(dir, 'news');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const storage = await import('./storage.mjs');
const { tools, toolJsonSchema } = await import('./mcp-tools.mjs');
const { createApiHandler } = await import('./api-handler.mjs');
const { withPlatform } = await import('./platform.mjs');
const alice = storage.createUser('parity-reader', 'password-one');
const bob = storage.createUser('parity-other', 'password-two');
const token = storage.loginUser('parity-reader', 'password-one').token;
const handler = createApiHandler({});
const call = async (name, args = {}, user = alice, context = {}) => {
  const entry = tools.find((entry) => entry.name === name);
  assert.ok(entry, name);
  const result = await entry.handler(z.object(entry.inputSchema).parse(args), { ownerId: String(user.id), ...context });
  return result.structuredContent ?? JSON.parse(result.content[0].text);
};
const api = async (path) => {
  let status, body;
  await handler({ method: 'GET', url: path, headers: { host: 'localhost', authorization: `Bearer ${token}` } }, {
    writeHead(code) { status = code; }, end(value) { body = JSON.parse(value); },
  });
  assert.equal(status, 200, path);
  return body;
};
const input = { title: '素材の変化', passage: '昔と今では素材が違う。', question: '何が変わったか。', choices: ['素材', '人', '場所', '日付'], answerIndex: 0,
  tags: ['比較'], passageTranslation: '过去与现在的食材不同。', explanation: '素材が変わった。',
  readingAnalysis: { summary: '变化', structure: '对比', keySentences: ['素材が違う。'] } };
after(() => { storage.getDb().close(); rmSync(dir, { recursive: true, force: true }); });

test('reading REST and MCP list/detail retain the same complete fields', async () => {
  const own = storage.createReadingQuestion(alice.id, input);
  const other = storage.createReadingQuestion(bob.id, { ...input, title: 'private' });
  assert.deepEqual(await call('list_reading_questions'), (await api('/api/reading-questions')).questions);
  assert.deepEqual(await call('get_reading_question', { id: own.id }), (await api(`/api/reading-questions/${own.id}`)).question);
  await assert.rejects(call('get_reading_question', { id: other.id }), /not found/);
});

test('controlled reading search/count/get are discoverable, isolated and revision guarded', async () => {
  const schema = await call('jlpt_describe', { entity: 'reading_question' });
  assert.ok(JSON.stringify(schema).includes('translation'));
  assert.ok(toolJsonSchema(tools.find(t => t.name === 'jlpt_query')).properties.entity.enum.includes('reading_question'));
  const own = storage.createReadingQuestion(alice.id, { ...input, passage: '比較😀'.repeat(1800) });
  const search = await call('jlpt_query', { entity: 'reading_question', filters: [{ field: 'passage', op: 'contains', value: '比較😀' }], include_total: 'exact' });
  assert.deepEqual(search.data.records.map(r => r.id), [own.id]);
  const count = await call('jlpt_aggregate', { entity: 'reading_question', metrics: ['question_count'], filters: [{ field: 'id', op: 'eq', value: own.id }] });
  assert.equal(count.data.groups[0].question_count, 1);
  const forbidden = await call('jlpt_get', { entity: 'reading_question', id: own.id }, bob);
  assert.equal(forbidden.error.code, 'NOT_FOUND');
  const parts = [];
  let page = await call('jlpt_get', { entity: 'reading_question', id: own.id, sections: ['passage', 'translation', 'explanation'], max_bytes: 4096 });
  assert.ok(page.data.next_cursor);
  do {
    parts.push(...page.data.parts);
    if (!page.data.next_cursor) break;
    page = await call('jlpt_get', { cursor: page.data.next_cursor });
  } while (true);
  assert.equal(parts.filter(p => p.section === 'passage').map(p => p.text).join(''), own.passage);
  assert.ok(parts.filter(p => p.section === 'translation').map(p => p.text).join('').includes(input.passageTranslation));
  const first = await call('jlpt_query', { entity: 'reading_question', limit: 1 });
  assert.ok(first.meta.page.next_cursor);
  storage.updateReadingQuestion(alice.id, own.id, { explanation: '更新' });
  assert.equal((await call('jlpt_query', { cursor: first.meta.page.next_cursor })).error.code, 'DATA_CHANGED');
});

test('state, history, recordings, audio match and market reads match web API', async () => {
  storage.saveSettings(alice.id, { language: 'zh' });
  const db = storage.getDb();
  db.prepare(`INSERT INTO listening_questions (id,user_id,title,question,choices_json,answer_index,explanation,audio_file_name,audio_mime,audio_size,audio_path,created_at)
    VALUES ('parity-listening',?,'聴解','問い','["A","B"]',0,'解説','test.mp3','audio/mpeg',1,'/test-only','2026-09-22')`).run(alice.id);
  db.prepare(`INSERT INTO listening_recordings (id,user_id,listening_question_id,audio_mime,audio_size,audio_path,status,analysis_json,created_at,updated_at)
    VALUES ('parity-recording',?,'parity-listening','audio/mpeg',1,'/test-only','completed',?,'2026-09-22','2026-09-22')`).run(alice.id, JSON.stringify({ summary: '完成分析', nextPractice: '再听一次' }));
  const { importPackage, publishShare } = await import('./market.mjs');
  const imported = importPackage(alice.id, { format: 'jlpt-share', version: 1, kind: 'wordbook', title: '共有', items: [{ deck: 'n1_vocab', original: '本', reading: 'ほん', meaning_zh: '书' }] });
  const shared = publishShare(alice.id, { kind: 'wordbook', sourceId: imported.id });
  assert.deepEqual(await call('get_market_share', { id: shared.id }), await api(`/api/market/${shared.id}`));
  assert.equal((await call('list_listening_recordings', { question_id: 'parity-listening' }))[0].analysis.summary, '完成分析');
  assert.deepEqual(await call('list_listening_recordings', { question_id: 'parity-listening' }, bob), []);
  await assert.rejects(call('preview_market_source', { kind: 'wordbook', sourceId: imported.id }, bob), /找不到/);

  for (const [path, name, args, key] of [
    ['/api/study-state', 'get_study_state', {}, null],
    ['/api/history-questions', 'get_history_questions', {}, 'questions'],
    ['/api/listening-questions/parity-listening/recordings', 'list_listening_recordings', { question_id: 'parity-listening' }, 'recordings'],
    [`/api/listening-audio-match?sha256=${'a'.repeat(64)}`, 'find_listening_audio_questions', { sha256: 'a'.repeat(64) }, 'questions'],
    ['/api/market/sources', 'list_market_sources', {}, null],
    ['/api/market', 'list_market_shares', {}, 'shares'],
  ]) {
    const expected = await api(path);
    assert.deepEqual(await call(name, args), key ? expected[key] : expected, name);
  }
});

test('news data uses shared readers and local-only materials retain their access boundary', async () => {
  const root = process.env.JLPT_NEWS_SOURCE_DIR;
  mkdirSync(join(root, 'weekly', '2026-W39'), { recursive: true });
  mkdirSync(join(root, '2026-09-22'), { recursive: true });
  writeFileSync(join(root, 'weekly', '2026-W39', 'cycle-summary.json'), JSON.stringify({ range: { from: '2026-09-22', to: '2026-09-22' }, total_questions: 1 }));
  writeFileSync(join(root, '2026-09-22', 'questions.json'), JSON.stringify({ questions: [{ id: 'news-reading', module: 'reading', passage: '本文' }] }));
  assert.deepEqual(await call('list_local_news_cycles'), await api('/api/local-news-cycles'));
  assert.deepEqual(await call('get_local_news_cycle', { id: '2026-W39' }), await api('/api/local-news-cycle?id=2026-W39'));
  for (const name of ['list_local_official_samples', 'list_local_mock_exams']) {
    await assert.rejects(call(name, {}, alice, { request: new Request('https://public.example/api/jlpt/mcp') }), /localhost/);
    await assert.rejects(call(name, {}, alice, { request: new Request('http://localhost/api/jlpt/mcp', { headers: { 'x-forwarded-host': 'public.example' } }) }), /localhost/);
  }
  await assert.rejects(withPlatform({ dataSource: 'durable-object' }, () => call('get_local_news_cycle')), /unavailable/);
  await assert.rejects(withPlatform({ dataSource: 'durable-object' }, () => call('list_local_mock_exams', {}, alice, { clientId: 'stdio' })), /unavailable/);
});
