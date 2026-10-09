// v3 の MCP ツール：知識項目・単語帳・設定・翻訳・ふりがなを v3 データベース経由で扱う。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const dir = mkdtempSync(join(tmpdir(), 'v3-mcp-'));
process.env.JLPT_DB_PATH = join(dir, 'legacy.sqlite');
process.env.JLPT_V3_DB_PATH = join(dir, 'v3.sqlite');
const { v3Tools } = await import('../server/v3/mcp-tools.mjs');
const { resetV3Db } = await import('../server/v3/database.mjs');

const byName = Object.fromEntries(v3Tools.map((t) => [t.name, t]));
async function call(name, args = {}, ownerId = '1') {
  const entry = byName[name];
  const parsed = z.object(entry.inputSchema).parse(args);
  return entry.handler(parsed, { ownerId });
}

test.after(() => { resetV3Db(); rmSync(dir, { recursive: true, force: true }); });

test('every v3 tool has a JSON schema and a unique name', () => {
  assert.equal(new Set(v3Tools.map((t) => t.name)).size, v3Tools.length);
  for (const t of v3Tools) assert.ok(z.toJSONSchema(z.object(t.inputSchema), { io: 'input' }), t.name);
});

test('knowledge, wordbooks, translations and ruby work through the tools', async () => {
  const book = (await call('create_wordbook', { title: '词汇' })).structuredContent;
  assert.equal(book.code, 'WB1');
  const created = (await call('create_knowledge_point', { kind: 'word', wordbook: 'WB1', expression: '捉える', reading: 'とらえる', pos: 'verb_2',
    meaning: '抓住', examples: [{ sentence: '要点を捉える。', translation: '抓住要点。' }] })).structuredContent;
  assert.equal(created.code, 'W1');
  assert.equal((await call('lookup_word', { query: '捉えた' })).structuredContent.items[0].code, 'W1');
  assert.equal((await call('list_knowledge_points', { q: 'toraeru' })).structuredContent.total, 1);
  assert.equal((await call('list_knowledge_points', {}, '2')).structuredContent.total, 0, '他のユーザーには見えない');
  assert.equal((await call('list_wordbooks')).structuredContent.wordbooks[0].stats.words, 1);

  const missing = (await call('list_missing_translations', { language: 'en' })).structuredContent;
  const example = missing.items.find((i) => i.target.startsWith('knowledge_examples:') && i.field === 'translation');
  assert.ok(example, '例文の英訳が足りない');
  await call('set_translation', { target: example.target, field: 'translation', language: 'en', text: 'grasp the point' });
  assert.equal((await call('get_knowledge_point', { code: 'W1', language: 'en' })).structuredContent.examples[0].translation.text, 'grasp the point');

  // 他人の内容は書けない
  const denied = await call('set_translation', { target: example.target, field: 'translation', language: 'ko', text: 'x' }, '2');
  assert.equal(denied.isError, true);

  await call('set_ruby_annotation', { target: example.target, field: 'sentence', annotated_text: '要点[ようてん]を 捉[とら]える。' });
  assert.equal((await call('list_ruby_annotations', { target: example.target })).structuredContent.annotations.length, 1);
  const badRuby = await call('set_ruby_annotation', { target: example.target, field: 'sentence', annotated_text: '要点[ようてん]を捉える！' });
  assert.equal(badRuby.isError, true, '括弧を外すと元の文にならないものは拒否');

  const settings = (await call('update_settings', { settings: { explanationLanguage: 'en' } })).structuredContent;
  assert.equal(settings.explanationLanguage, 'en');
  assert.ok((await call('list_card_templates')).structuredContent.templates.length > 0);

  assert.equal((await call('delete_wordbook', { code: 'WB1' })).isError, true, '空でない単語本は消せない');
  await call('delete_knowledge_point', { code: 'W1' });
  assert.deepEqual((await call('delete_wordbook', { code: 'WB1' })).structuredContent, { deleted: 'WB1' });
});

test('question groups are validated, created, reviewed by another agent and audio is readable through MCP', async () => {
  const group = {
    typeId: 'listening-basic-dictation',
    materials: [{ role: 'audio', kind: 'audio', mediaId: 0, transcript: '明日は雨です。' }],
    questions: [{ expectedText: '明日は雨です。' }],
  };
  const upload = (await call('upload_media', { base64: Buffer.from('ID3-test-audio').toString('base64'), mime: 'audio/mpeg' })).structuredContent;
  group.materials[0].mediaId = upload.mediaId;
  const bad = (await call('validate_question', { ...group, questions: [{ expectedText: '明日', options: [{ text: 'a' }, { text: 'b' }] }] })).structuredContent;
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.code === 'options_forbidden'));
  const created = (await call('create_question_group', group)).structuredContent;
  assert.equal(created.status, 'needs_review');
  const code = created.questions[0].code;
  const context = (await call('get_question_review_context', { code })).structuredContent;
  assert.equal(context.group.code, created.code);
  assert.ok(context.checklist.task);
  const reviewed = (await call('submit_question_review', { code, verdict: 'pass', summary: '参考答案与音频一致' }, '1')).structuredContent;
  assert.equal(reviewed.status, 'ready');
  const media = await byName.get_media.handler({ mediaId: upload.mediaId }, { ownerId: '1' });
  assert.equal(media.content[0].type, 'audio');
  assert.equal(Buffer.from(media.content[0].data, 'base64').toString(), 'ID3-test-audio');
  assert.equal((await byName.get_media.handler({ mediaId: upload.mediaId }, { ownerId: '2' })).isError, true, '他人のファイルは読めない');
  assert.equal((await call('list_question_groups', { module: 'listening' })).structuredContent.total, 1);
});
