import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cachedSpeech, cleanupTtsCache, cachePolicy, cacheObjects } from './cache.mjs';
import { withPlatform } from '../platform.mjs';
function fixture() {
  const db = new DatabaseSync(':memory:'), blobs = new Map(); let calls = 0, now = 1000;
  const objects = { async get(k) { return blobs.get(k); }, async put(k,v) { blobs.set(k,v); }, async remove(k) { blobs.delete(k); } };
  const options = { db, objects, secret:'test', now:()=>now, policy:{idle:100,age:250,bytes:10,entries:2,enabled:true} };
  const synth = async () => { calls++; await Promise.resolve(); return {audio:Buffer.from('1234'),mimeType:'audio/mpeg'}; };
  return { db, blobs, objects, options, synth, calls:()=>calls, time:n=>now=n, speak:(u=1,key='hello')=>cachedSpeech(u,key,synth,options) };
}
test('persistent metadata hit, user isolation, full parameter identity and concurrent deduplication', async () => {
  const f=fixture();
  await Promise.all(Array.from({length:10},()=>f.speak())); assert.equal(f.calls(),1);
  await cachedSpeech(1,'hello',f.synth,{...f.options}); assert.equal(f.calls(),1);
  await f.speak(2); await f.speak(1,'changed voice/model/style/region/credential'); assert.equal(f.calls(),3);
  assert.ok([...f.blobs.keys()].every(k=>/^tts-cache\/v1\/[a-f0-9]{64}\/[a-f0-9]{32}$/.test(k)));
  f.db.close();
});
test('failure is not cached; unavailable cache falls back; missing bytes regenerate', async()=>{
  const f=fixture();
  await assert.rejects(cachedSpeech(1,'hello',async()=>{throw Error('provider failure');},f.options));
  assert.equal(f.blobs.size,0); await f.speak(); f.blobs.clear(); await f.speak(); assert.equal(f.calls(),2);
  await cachedSpeech(1,'hello',f.synth,{...f.options,objects:{...f.objects,get(){throw Error('down');}}}); assert.equal(f.calls(),3);
  f.db.close();
});
test('idle, absolute age, LRU entry/byte limits, failed deletes retry and original audio protection',async()=>{
  const f=fixture(); f.blobs.set('listening-audio/original',Buffer.from('original'));
  await f.speak(); f.time(1050); await f.speak(); f.time(1100); await f.speak(); assert.equal(f.calls(),1);
  f.time(1200); await f.speak(); assert.equal(f.calls(),2);
  for (const n of [1250,1300,1350,1400]) { f.time(n); await f.speak(); }
  f.time(1450); await f.speak(); assert.equal(f.calls(),3);
  f.time(1451); await f.speak(1,'two'); f.time(1452); await f.speak(1,'three');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM tts_audio_cache WHERE ready=1').get().n,2);
  await cleanupTtsCache({...f.options,now:1453,policy:{...f.options.policy,bytes:4}});
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM tts_audio_cache').get().n,1);
  await cleanupTtsCache({...f.options,now:2000,objects:{...f.objects,remove(){throw Error('offline');}}});
  assert.equal(f.db.prepare('SELECT ready FROM tts_audio_cache').get().ready,-1);
  await cleanupTtsCache({...f.options,now:3602001}); assert.equal(f.db.prepare('SELECT count(*) AS n FROM tts_audio_cache').get().n,0);
  assert.equal(f.blobs.get('listening-audio/original').toString(),'original'); f.db.close();
});
test('local disk and SQLite survive new connection; R2 adapter uses binary bytes and guards prefix',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tts-cache-')); const old=process.env.JLPT_TTS_CACHE_PATH; process.env.JLPT_TTS_CACHE_PATH=dir;
  try {
    let db=new DatabaseSync(join(dir,'meta.sqlite')); let calls=0;
    const synth=async()=>{calls++;return {audio:Buffer.from('audio'),mimeType:'audio/mpeg'};};
    await cachedSpeech(1,'text',synth,{db,secret:'test'}); db.close(); db=new DatabaseSync(join(dir,'meta.sqlite'));
    await cachedSpeech(1,'text',synth,{db,secret:'test'}); assert.equal(calls,1); db.close();
    const map=new Map(), bucket={put:async(k,b)=>map.set(k,b),get:async k=>map.has(k)?{arrayBuffer:async()=>map.get(k)}:null,delete:async k=>map.delete(k)};
    await withPlatform({ttsCacheBucket:bucket},async()=>{const o=cacheObjects(),key=`tts-cache/v1/${'a'.repeat(64)}/${'b'.repeat(32)}`;await o.put(key,Buffer.from('r2'));assert.equal((await o.get(key)).toString(),'r2');await o.remove(key);assert.equal(map.size,0);await assert.rejects(o.remove('listening-audio/original'));});
  } finally { if(old===undefined)delete process.env.JLPT_TTS_CACHE_PATH;else process.env.JLPT_TTS_CACHE_PATH=old;await rm(dir,{recursive:true,force:true}); }
});
test('safe defaults and disabled policy', async()=>{
  assert.equal(cachePolicy({}).bytes,209715200);assert.equal(cachePolicy({TTS_CACHE_MAX_BYTES:'-1'}).bytes,209715200);
  const f=fixture();await cachedSpeech(1,'x',f.synth,{...f.options,policy:{...f.options.policy,enabled:false}});assert.equal(f.blobs.size,0);f.db.close();
});

test('all output identity fields invalidate independently and credential changes during synthesis reject', async()=>{
  const f=fixture(); const base={provider:'azure',model:'default',voice:'Nanami',style:'',role:'',format:'mp3',region:'eastasia',version:1,revision:'generation-1',text:'日本語'};
  for(const field of Object.keys(base)) { await cachedSpeech(1,{...base,[field]:String(base[field])+'changed'},f.synth,f.options); }
  assert.equal(f.calls(),Object.keys(base).length);
  let valid=true;
  await assert.rejects(cachedSpeech(1,'revoked',async()=>{valid=false;return f.synth();},{...f.options,validate(){if(!valid){const e=Error('revoked');e.statusCode=409;throw e;}}}),/revoked/);
  f.db.close();
});

test('oversized audio bypasses storage, failed writes are collectable, unsafe metadata never deletes originals', async()=>{
  const f=fixture();
  await cachedSpeech(1,'large',async()=>({audio:Buffer.alloc(11),mimeType:'audio/mpeg'}),f.options);assert.equal(f.blobs.size,0);
  await cachedSpeech(1,'write-failure',f.synth,{...f.options,objects:{...f.objects,async put(k,v){await f.objects.put(k,v);throw Error('interrupted');}}});
  assert.equal(f.db.prepare('SELECT ready FROM tts_audio_cache').get().ready,0);
  await cleanupTtsCache({...f.options,now:1001});assert.equal(f.blobs.size,0);
  f.db.prepare(`INSERT INTO tts_audio_cache VALUES(?,?,?,?,?,?,?,?)`).run('bad',1,'listening-audio/original','audio/mpeg',1,0,0,0);
  const guarded=cacheObjects();await cleanupTtsCache({...f.options,objects:guarded,now:1001});
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM tts_audio_cache').get().n,1);f.db.close();
});

test('canonical HMAC is stable across object key ordering', async()=>{
  const f=fixture();await cachedSpeech(1,{a:1,b:{c:2,d:3}},f.synth,f.options);
  await cachedSpeech(1,{b:{d:3,c:2},a:1},f.synth,f.options);assert.equal(f.calls(),1);f.db.close();
});
test('persistent failed deletes cannot grow physical cache beyond capacity',async()=>{
  const f=fixture();await f.speak(1,'one');await f.speak(1,'two');
  const options={...f.options,objects:{...f.objects,remove(){throw Error('down');}}};
  for(let n=0;n<10;n++)await cachedSpeech(1,`new-${n}`,f.synth,options);
  assert.equal(f.blobs.size,2);
  const used=f.db.prepare('SELECT SUM(size) AS bytes, COUNT(*) AS n FROM tts_audio_cache').get();assert.equal(used.bytes,8);assert.equal(used.n,2);f.db.close();
});
test('revocation during object write rejects response',async()=>{
  const f=fixture();let valid=true;
  await assert.rejects(cachedSpeech(1,'write-revoke',f.synth,{...f.options,objects:{...f.objects,async put(k,v){await f.objects.put(k,v);valid=false;}},validate(){if(!valid){const error=Error('revoked');error.statusCode=409;throw error;}}}),/revoked/);f.db.close();
});
test('cleanup budget limits batch deletes and next run drains backlog',async()=>{
  const f=fixture();await f.speak(1);await f.speak(2);await f.speak(3);
  assert.equal(await cleanupTtsCache({...f.options,now:2000,budget:{remaining:1,deadline:Date.now()+5000}}),1);
  assert.equal(f.blobs.size,2);await cleanupTtsCache({...f.options,now:2000});assert.equal(f.blobs.size,0);f.db.close();
});
test('in-process maintenance waits for active object write',async()=>{
  const f=fixture();let release, started;
  const gate=new Promise(r=>release=r),entered=new Promise(r=>started=r);
  const active=cachedSpeech(1,'active',f.synth,{...f.options,objects:{...f.objects,async put(k,v){started();await gate;await f.objects.put(k,v);}}});
  await entered;const cleaning=cleanupTtsCache({...f.options,now:1001});release();await active;await cleaning;
  await cachedSpeech(1,'active',f.synth,f.options);assert.equal(f.calls(),1);f.db.close();
});

 test('failed first batch backs off so later users can be cleaned',async()=>{
  const f=fixture();for(let id=1;id<=21;id++)await f.speak(id);
  const protectedKeys=new Set(f.db.prepare('SELECT object_key FROM tts_audio_cache WHERE user_id <= 20').all().map(row=>row.object_key));
  const objects={...f.objects,async remove(k){if(protectedKeys.has(k))throw Error('unavailable');await f.objects.remove(k);}};
  const options={...f.options,objects,now:2000};
  await cleanupTtsCache({...options,budget:{remaining:20,deadline:Date.now()+5000}});assert.equal(f.blobs.size,21);
  await cleanupTtsCache({...options,now:62000,budget:{remaining:20,deadline:Date.now()+5000}});assert.equal(f.blobs.size,20);
  await cleanupTtsCache({...f.options,now:3602001});assert.equal(f.blobs.size,0);f.db.close();
});
