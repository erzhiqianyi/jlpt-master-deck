import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const dir = mkdtempSync(join(tmpdir(), 'jlpt-deletion-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const storage = await import('./storage.mjs');
const { tools } = await import('./mcp-tools.mjs');
const alice = storage.createUser('deletion-alice', 'password-one');
const bob = storage.createUser('deletion-bob', 'password-two');
const db = storage.getDb();
const call = async (name, args, owner = alice) => {
  const tool = tools.find((entry) => entry.name === name);
  return JSON.parse((await tool.handler(z.object(tool.inputSchema).parse(args), { ownerId: String(owner.id) })).content[0].text);
};
after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

function practice(id, user, questionIds) {
  db.prepare(`INSERT INTO daily_practices(id,user_id,practice_date,version,title,minutes,practice_json,created_at,updated_at)
    VALUES(?,?,'2026-09-24',1,'test',10,?,'2026-09-24','2026-09-24')`)
    .run(id, user.id, JSON.stringify({ questions: questionIds.map((id) => ({ id, itemId: 'item', choices: ['A','B'], answer: 'A' })) }));
}
function answer(user, questionId) {
  db.prepare("INSERT INTO answers VALUES (?,?,'item','A',1,'2026-09-24')").run(user.id, questionId);
}
function state(user, history, active) {
  db.prepare("INSERT OR REPLACE INTO practice_state VALUES (?,?,?,'2026-09-24')")
    .run(user.id, JSON.stringify(history), active ? JSON.stringify(active) : null);
}

test('recording deletion removes only owned audio and analysis, including analyzing recordings', async () => {
  const referencePath = join(dir, 'reference.mp3');
  writeFileSync(referencePath, 'reference');
  db.prepare(`INSERT INTO listening_questions(id,user_id,title,question,choices_json,answer_index,explanation,audio_file_name,audio_mime,audio_size,audio_path,created_at)
    VALUES('question',?,'title','question','["A","B","C"]',0,'','reference.mp3','audio/mpeg',9,?,'2026-09-24')`).run(alice.id, referencePath);
  for (const id of ['recording', 'sibling', 'missing-file']) {
    const path = join(dir, id + '.mp3');
    if (id !== 'missing-file') writeFileSync(path, id);
    db.prepare(`INSERT INTO listening_recordings VALUES(?,?,'question','audio/mpeg',9,?,'analyzing','{"summary":"analysis"}','2026-09-24','2026-09-24')`).run(id, alice.id, path);
  }
  await assert.rejects(call('delete_listening_recording', { recording_id: 'recording' }, bob), /not found/i);
  assert.ok(existsSync(join(dir, 'recording.mp3')));
  assert.deepEqual(await call('delete_listening_recording', { recording_id: 'recording' }), { ok: true });
  assert.equal(storage.listeningRecordingForUser(alice.id, 'recording'), null);
  assert.ok(!existsSync(join(dir, 'recording.mp3')));
  assert.ok(storage.listeningQuestionForUser(alice.id, 'question'));
  assert.ok(existsSync(referencePath));
  assert.ok(existsSync(join(dir, 'sibling.mp3')));
  assert.ok(storage.listeningRecordingForUser(alice.id, 'sibling'));
  await assert.rejects(call('delete_listening_recording', { recording_id: 'recording' }), /not found/i);
  assert.deepEqual(await call('delete_listening_recording', { recording_id: 'missing-file' }), { ok: true });
});

test('practice deletion isolates users, clears related attempts, and preserves shared answers and mastery', async () => {
  practice('target', alice, ['target-q', 'shared-q']);
  practice('keep', alice, ['keep-q', 'shared-q']);
  practice('bob-practice', bob, ['target-q']);
  for (const id of ['target-q', 'keep-q', 'shared-q']) answer(alice, id);
  answer(bob, 'target-q');
  const keepAttempt = { id: 'keep-attempt', practiceId: 'keep', questionIds: ['keep-q'] };
  state(alice, [{ id: 'target-attempt', practiceId: 'target' }, keepAttempt,
    { id: 'legacy', view: 'daily-practice', questionIds: ['target-q'] }], { practiceId: 'target' });
  state(bob, [{ practiceId: 'bob-practice' }], { practiceId: 'bob-practice' });
  db.prepare("INSERT INTO progress VALUES (?,'item',?,'2026-09-24')").run(alice.id, JSON.stringify({ status: 'review' }));
  await assert.rejects(call('delete_daily_practice', { practice_id: 'target' }, bob), /not found/i);
  assert.ok(storage.getDailyPractice(alice.id, 'target'));
  assert.deepEqual(await call('delete_daily_practice', { practice_id: 'target' }), { ok: true });
  assert.equal(storage.getDailyPractice(alice.id, 'target'), null);
  assert.ok(storage.getDailyPractice(alice.id, 'keep'));
  const own = storage.getStudyState(alice.id);
  assert.deepEqual(Object.keys(own.answers).sort(), ['keep-q', 'shared-q']);
  assert.deepEqual(own.attemptHistory, [keepAttempt]);
  assert.equal(own.activeAttempt, null);
  assert.equal(own.progress.item.status, 'review');
  assert.ok(storage.getStudyState(bob.id).answers['target-q']);
  assert.equal(storage.getStudyState(bob.id).activeAttempt.practiceId, 'bob-practice');
  await assert.rejects(call('delete_daily_practice', { practice_id: 'target' }), /not found/i);
});

test('practice deletion rolls back if dependent cleanup fails and preserves unrelated active attempts', async () => {
  practice('rollback', alice, ['rollback-q']);
  answer(alice, 'rollback-q');
  state(alice, [], { practiceId: 'keep' });
  db.exec("CREATE TRIGGER reject_answer_delete BEFORE DELETE ON answers WHEN OLD.question_id='rollback-q' BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
  await assert.rejects(call('delete_daily_practice', { practice_id: 'rollback' }), /test failure/);
  assert.ok(storage.getDailyPractice(alice.id, 'rollback'));
  assert.ok(storage.getStudyState(alice.id).answers['rollback-q']);
  db.exec('DROP TRIGGER reject_answer_delete');
  await call('delete_daily_practice', { practice_id: 'rollback' });
  assert.equal(storage.getStudyState(alice.id).activeAttempt.practiceId, 'keep');
});
