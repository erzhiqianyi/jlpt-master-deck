import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const dir = mkdtempSync(join(tmpdir(), 'jlpt-prewarm-'));
process.env.JLPT_DB_PATH = join(dir, 'db.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
process.env.JLPT_TTS_SECRETS_KEY = 'test-only-key';
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const storage = await import('../storage.mjs');
const { withPlatform } = await import('../platform.mjs');
const { saveTtsCredential, synthesizeSpeech } = await import('./index.mjs');
after(() => { storage.getDb().close(); rmSync(dir, {recursive:true,force:true}); });

function create(userId, item) {
  const platform = { afterCommit: [], ttsSecretKey: 'test-only-key' };
  const saved = withPlatform(platform, () => storage.upsertReviewItem(item, {userId}));
  return { saved, jobs: platform.afterCommit, run: () => withPlatform(platform, async () => { for (const job of platform.afterCommit) await job(); }) };
}
const grammar = id => ({id, deck:'grammar_expression',type:'expression',original:'〜ざるを得ない',meaning_zh:'不得不'});

test('new vocabulary and grammar generate the selected pronunciation after commit and playback reuses its cache', async t => {
  const user = storage.createUser('configured', 'test-password');
  saveTtsCredential(user.id, 'openai', {apiKey:'test-key'});
  storage.saveSettings(user.id, {ttsProvider:'openai',speech:{voices:{openai:{voice:'nova'}}}});
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_, init) => { calls.push(JSON.parse(init.body)); return new Response(new Uint8Array([1,2,3])); });
  const word = create(user.id, {id:'word',deck:'n1_vocab',type:'word',original:'青春',reading:'せいしゅん',meaning_zh:'青春',examples:[{ja:'青春の思い出です。',zh:'青春的回忆。'},{ja:'青春時代を思い出した。',zh:'回想起青春时代。'}]});
  const expression = create(user.id, grammar('grammar'));
  assert.equal(calls.length, 0);
  assert.equal(word.jobs.length, 1); assert.equal(expression.jobs.length, 1);
  await word.run(); await expression.run();
  assert.deepEqual(calls.map(value => [value.input,value.voice]), [['せいしゅん','nova'],['〜ざるを得ない','nova']]);
  await synthesizeSpeech(user.id, {provider:'openai',text:'せいしゅん',voice:'nova'});
  assert.equal(calls.length, 2);
  assert.equal(create(user.id, grammar('grammar')).jobs.length, 0, 'editing does not regenerate');
});

test('unconfigured or browser speech never makes a cloud request', async t => {
  const user = storage.createUser('no-provider', 'test-password');
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('must not request speech'); });
  await create(user.id, grammar('browser')).run();
  storage.saveSettings(user.id, {ttsProvider:'azure'});
  await create(user.id, grammar('missing-key')).run();
});

test('failed pronunciation leaves the saved item intact; invalid saves schedule nothing', async t => {
  const user = storage.createUser('failed-provider', 'test-password');
  saveTtsCredential(user.id, 'openai', {apiKey:'test-key'});
  storage.saveSettings(user.id, {ttsProvider:'openai'});
  t.mock.method(globalThis, 'fetch', async () => new Response('unavailable', {status:503}));
  t.mock.method(console, 'warn', () => {});
  const item = create(user.id, grammar('saved'));
  await item.run();
  assert.equal(storage.reviewItemById('saved',user.id).original, '〜ざるを得ない');
  const platform = {afterCommit:[]};
  assert.throws(() => withPlatform(platform, () => storage.upsertReviewItem({...grammar('bad'),wordbook_id:'missing'}, {userId:user.id})));
  assert.equal(platform.afterCommit.length,0);
});
