import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = mkdtempSync(join(tmpdir(),'jlpt-sync-'));
process.env.JLPT_DB_PATH = join(dir,'db.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir,'data'); mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const s = await import('./storage.mjs');
const { studySync, studySyncStatus } = await import('./study-sync.mjs');
const alice = s.createUser('sync-alice','password'); const bob = s.createUser('sync-bob','password');
after(() => { s.getDb().close(); rmSync(dir,{recursive:true,force:true}); });
const item = (id,meaning='旧') => ({id,deck:'grammar_expression',type:'grammar',original:'〜に限る',meaning_zh:meaning});
function collect(user, cursor, size = 2) {
  let result = studySync(user,{cursor},{pageSize:size});
  const changes = [...result.changes]; const first = result;
  while (result.nextPage) {
    assert.equal(result.cursor,null);
    result = studySync(user,{page:result.nextPage},{pageSize:size}); changes.push(...result.changes);
  }
  return {changes,cursor:result.cursor,reset:first.reset};
}
test('paged bootstrap, unchanged sync, per-record changes, deletion and owner isolation', () => {
  s.upsertReviewItem(item('card-a'),{userId:alice.id}); s.upsertReviewItem(item('private'),{userId:bob.id});
  const practice = {id:'pack-a',date:'2026-10-05',title:'练习',questions:[]};
  s.getDb().prepare('INSERT INTO daily_practices(id,user_id,practice_date,title,minutes,practice_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(practice.id,alice.id,practice.date,practice.title,5,JSON.stringify(practice),practice.date,practice.date);
  const initial=collect(alice.id,null);
  assert.equal(initial.reset,true);
  assert(initial.changes.some(c => c.collection==='packs' && c.id==='pack-a'));
  assert(!initial.changes.some(c => c.id==='private'));
  assert.deepEqual(collect(alice.id,initial.cursor).changes,[]);
  s.upsertReviewItem(item('card-a','新'),{userId:alice.id});
  s.saveProgressEntry(alice.id,'card-a',{correct:1,wrong:0,status:'review'});
  const changed=collect(alice.id,initial.cursor);
  assert(changed.changes.some(c => c.collection==='items' && c.id==='card-a'));
  assert(changed.changes.some(c => c.collection==='progress' && c.id==='card-a'));
  assert(!changed.changes.some(c => c.collection==='packs'));
  s.getDb().prepare('DELETE FROM owned_review_items WHERE id=?').run('card-a');
  const deleted=collect(alice.id,changed.cursor);
  assert(deleted.changes.some(c => c.collection==='items' && c.id==='card-a' && c.deleted));
  const foreign=collect(bob.id,initial.cursor);
  assert.equal(foreign.reset,true);
  assert(!foreign.changes.some(c => c.id==='pack-a'));
  assert.equal(studySyncStatus(alice.id).counts.packs,1);
});
test('pages are immutable during concurrent updates, retryable and scoped to the owner', () => {
  const first=studySync(alice.id,{}, {pageSize:1});
  assert(first.nextPage);
  const page=studySync(alice.id,{page:first.nextPage},{pageSize:1});
  s.saveSettings(alice.id,{showReviewRuby:false});
  assert.deepEqual(studySync(alice.id,{page:first.nextPage},{pageSize:1}),page);
  assert.equal(studySync(bob.id,{page:first.nextPage}).restart,true);
  assert.equal(studySync(alice.id,{page:'00000000-0000-0000-0000-000000000000:0'}).restart,true);
});

test('HTTP sync is authenticated and card upload acknowledges only the changed card', async () => {
  const { createApiHandler } = await import('./api-handler.mjs');
  const { Readable } = await import('node:stream');
  const handler = createApiHandler({});
  const token = s.loginUser('sync-alice','password').token;
  async function request(path,method,body,auth = token) {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    req.url=path; req.method=method; req.headers={host:'localhost', ...(auth ? {authorization:`Bearer ${auth}`} : {})};
    let status, text;
    await handler(req,{writeHead(code){status=code;},end(value){text=value;}});
    return {status,body:JSON.parse(text)};
  }
  assert.equal((await request('/api/sync','POST',{},null)).status,401);
  const response = await request('/api/sync','POST',{});
  assert.equal(response.status,200); assert(response.body.changes.length);
  s.upsertReviewItem(item('http-card'),{userId:alice.id});
  const input={questionId:'memory-card:http-card',itemId:'http-card',selected:'hard',correct:true,
    progressEntry:{correct:1,wrong:0,status:'review',lastReviewedAt:'2026-10-05T01:00:00Z'},reviewEventId:'http-review',reviewedAt:'2026-10-05T01:00:00Z'};
  const ack=await request('/api/answers?compact=1','POST',input);
  assert.equal(ack.status,200);
  assert.deepEqual(Object.keys(ack.body.progress),['http-card']);
  assert.equal(ack.body.cardReviews.length,1);
  assert.equal(ack.body.settings,undefined);
  const { referencesForOwner } = await import('./references.mjs');
  const reference = referencesForOwner(s.getDb(), alice.id).find(r => r.entity === 'item' && r.id === 'http-card').reference;
  const progressPath = `/api/study-state/progress/${reference}`;
  const existing = await request(progressPath,'GET');
  assert.equal(existing.status,200);
  assert.deepEqual(existing.body.progress,ack.body.progress);
  const changed = { ...ack.body.progress['http-card'], correct: 3 };
  assert.equal((await request(progressPath,'PUT',changed)).status,200);
  assert.deepEqual((await request('/api/study-state/progress/http-card','GET')).body.progress,{'http-card':changed});
  assert.equal(s.getStudyState(alice.id).progress[reference],undefined);
  const bobToken = s.loginUser('sync-bob','password').token;
  assert.equal((await request(progressPath,'GET',undefined,bobToken)).status,404);
  assert.equal((await request(progressPath,'PUT',changed,bobToken)).status,404);
  assert.equal((await request('/api/study-state/progress/IT-999999999','GET')).status,404);
  const practiceReference = referencesForOwner(s.getDb(), alice.id).find(r => r.entity === 'practice_session').reference;
  assert.equal((await request(`/api/study-state/progress/${practiceReference}`,'PUT',changed)).status,404);
  const settings=await request('/api/study-state/settings','GET');
  assert.equal(settings.status,200); assert.deepEqual(settings.body.progress,{});
});

test('canonical versions sync with immutable revision keys, survive source changes and never cross owners', async () => {
 const { saveMaterial, persistLibraryQuestion }=await import('./bank-materials.mjs');
 const db=s.getDb();
 const material=saveMaterial(db,alice.id,'article:offline',{type:'article',blocks:[{text:'旧本文'}]});
 const q=persistLibraryQuestion(db,alice.id,{kind:'reading',id:'offline',questionId:'offline'},{choices:['A','B'],answerIndex:0,prompt:'問い'},{materialRefs:[material]});
 const first=collect(alice.id,null,1);
 const old=first.changes.find(c=>c.collection==='questionVersions'&&c.id===JSON.stringify([q.id,q.revision]));
 assert.deepEqual(old.value.payload.materialRefs,[material]);
 assert.ok(first.changes.some(c=>c.collection==='materialVersions'&&c.id===JSON.stringify([material.id,material.revision])));
 const nextMaterial=saveMaterial(db,alice.id,material.id,{type:'article',blocks:[{text:'新本文'}]});
 const nextQuestion=persistLibraryQuestion(db,alice.id,{kind:'reading',id:'offline',questionId:'offline'},{choices:['A','B'],answerIndex:1,prompt:'問い'},{materialRefs:[nextMaterial]});
 const changed=collect(alice.id,first.cursor,1);
 assert.ok(changed.changes.some(c=>c.collection==='questionVersions'&&c.id===JSON.stringify([q.id,nextQuestion.revision])));
 assert.ok(!changed.changes.some(c=>c.collection==='questionVersions'&&c.id===old.id));
 assert.ok(!collect(bob.id,null).changes.some(c=>c.value?.id===q.id||c.value?.id===material.id));
});
