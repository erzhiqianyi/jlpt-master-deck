import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const dir = mkdtempSync(join(tmpdir(), 'jlpt-references-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const { getDb, createUser } = await import('./storage.mjs');
const { ensureReferenceSchema, referencesForOwner, resolveReference, decorateReferences, registerQuestionReference, getReferenceQuestion, getReferenceMetadata } = await import('./references.mjs');
const { tools } = await import('./mcp-tools.mjs');
const db = getDb();
const alice = createUser('alice', 'password-123');
const bob = createUser('bob', 'password-123');
const insertItem = (user, id) => db.prepare("INSERT INTO owned_review_items(user_id,id,item_json,source,created_at,updated_at) VALUES(?,?,?,'test','2026-09-22','2026-09-22')").run(user.id, id, JSON.stringify({ id, original: '試験' }));
insertItem(alice, 'shared-id'); insertItem(bob, 'shared-id');

test('same internal IDs across owners have distinct references; edits and restart keep them stable', () => {
  const a = referencesForOwner(db, alice.id)[0];
  const b = referencesForOwner(db, bob.id)[0];
  assert.notEqual(a.reference, b.reference);
  assert.equal(resolveReference(db, bob.id, a.reference), null);
  db.prepare("UPDATE owned_review_items SET item_json=? WHERE user_id=?").run('{"id":"shared-id","original":"更新"}', alice.id);
  const sequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name='record_references'").get().seq;
  ensureReferenceSchema(db);
  assert.equal(db.prepare("SELECT seq FROM sqlite_sequence WHERE name='record_references'").get().seq, sequence);
  assert.deepEqual(referencesForOwner(db, alice.id)[0], a);
  assert.equal(resolveReference(db, alice.id, ` ${a.reference.toLowerCase()} `).id, 'shared-id');
});

test('deleted references cannot resolve and their numbers are not reused', () => {
  insertItem(alice, 'deleted');
  const old = referencesForOwner(db, alice.id).find(r => r.id === 'deleted');
  db.prepare('DELETE FROM owned_review_items WHERE id=?').run('deleted');
  assert.equal(resolveReference(db, alice.id, old.reference), null);
  insertItem(alice, 'replacement');
  assert.notEqual(referencesForOwner(db, alice.id).find(r => r.id === 'replacement').reference, old.reference);
});

test('formal practice and question references survive reordering and expose parent references', () => {
  const questions = [{ id: 'p-q1', prompt: 'one' }, { id: 'p-q2', prompt: 'two' }];
  db.prepare("INSERT INTO daily_practices(id,user_id,practice_date,version,title,minutes,practice_json,created_at,updated_at) VALUES('p',?,'2026-09-22',1,'test',10,?,'2026-09-22','2026-09-22')").run(alice.id, JSON.stringify({ questions }));
  const before = decorateReferences(db, alice.id, { id: 'p', questions });
  assert.match(before.reference, /^PR-/);
  assert.match(before.questions[0].reference, /^QU-/);
  assert.equal(before.questions[0].practiceReference, before.reference);
  db.prepare("UPDATE daily_practices SET practice_json=? WHERE id='p'").run(JSON.stringify({ questions: questions.toReversed() }));
  assert.equal(decorateReferences(db, alice.id, questions)[0].reference, before.questions[0].reference);
});

test('browser drill snapshots are idempotent, versioned by content and answer gated', () => {
  const question = { id: 'browser-q', itemId: 'shared-id', prompt: '試験', choices: ['しけん', 'じけん'], answer: 'しけん', correctReason: 'Explanation' };
  const first = registerQuestionReference(db, alice.id, question);
  assert.deepEqual(registerQuestionReference(db, alice.id, question), first);
  const changed = registerQuestionReference(db, alice.id, { ...question, prompt: '試験？' });
  assert.notEqual(first.reference, changed.reference);
  const read = getReferenceQuestion(db, alice.id, first.reference);
  assert.equal(read.question.prompt, question.prompt);
  assert.equal(read.question.answer, undefined);
  assert.equal(read.question.correctReason, undefined);
  assert.equal(getReferenceQuestion(db, bob.id, first.reference), null);
  assert.throws(() => registerQuestionReference(db, bob.id, { ...question, itemId: 'replacement' }), /Item not found/);
  db.prepare('INSERT INTO answers(user_id,question_id,item_id,selected,correct,answered_at) VALUES(?,?,?,?,?,?)').run(alice.id, question.id, question.itemId, question.answer, 1, '2026-09-22');
  assert.equal(getReferenceQuestion(db, alice.id, first.reference).question.answer, question.answer);
});

test('MCP resolves the reference and returns an authorized follow-up tool', async () => {
  const ref = referencesForOwner(db, alice.id).find(r => r.entity === 'item');
  const tool = tools.find(t => t.name === 'resolve_reference');
  const result = await tool.handler({ reference: ref.reference }, { ownerId: String(alice.id) });
  assert.deepEqual(JSON.parse(result.content[0].text).lookup, { tool: 'jlpt_get', arguments: { entity: 'item', id: ref.id } });
  await assert.rejects(tool.handler({ reference: ref.reference }, { ownerId: String(bob.id) }), /not found/);
});


test('legacy records are backfilled without reallocating existing references', () => {
  db.exec('DROP TRIGGER refs_owned_review_items_INSERT');
  insertItem(alice, 'legacy');
  assert.equal(referencesForOwner(db, alice.id).some(r => r.id === 'legacy'), false);
  ensureReferenceSchema(db);
  assert.match(referencesForOwner(db, alice.id).find(r => r.id === 'legacy').reference, /^IT-/);
});

test('audio metadata lookup exposes no filesystem path and is owner isolated', () => {
  db.prepare("INSERT INTO listening_audio_assets(id,user_id,file_name,mime,size,sha256,audio_path,created_at) VALUES('audio-test',?,'test.mp3','audio/mpeg',42,'hash','/private/audio/test.mp3','2026-09-22')").run(alice.id);
  const ref = referencesForOwner(db, alice.id).find(r => r.id === 'audio-test');
  assert.equal(resolveReference(db, alice.id, ref.reference).lookup.tool, 'get_reference_metadata');
  const metadata = getReferenceMetadata(db, alice.id, ref.reference);
  assert.equal(metadata.metadata.file_name, 'test.mp3');
  assert.equal(JSON.stringify(metadata).includes('/private/'), false);
  assert.equal(getReferenceMetadata(db, bob.id, ref.reference), null);
});

test('reference decoration binds a fixed number of variables however many IDs a payload holds', () => {
  // getDb() enforces the Workers SQLite limit of 100 bound variables, so an expanded IN list would throw here.
  const items = Array.from({ length: 450 }, (_, i) => ({ id: `bulk-${i}` }));
  for (const { id } of items) insertItem(alice, id);
  const decorated = decorateReferences(db, alice.id, { items });
  assert.equal(decorated.items.filter(item => item.reference).length, 450);
});
