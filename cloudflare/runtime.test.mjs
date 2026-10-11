import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { buildCloudApi } from '../scripts/build-cloud-api.mjs';

const origin='https://jlpt.erzhiqian.cc';
test('Workers SQLite, authenticated REST, R2, OAuth and MCP survive restart', async () => {
  const dir=mkdtempSync(join(tmpdir(),'jlpt-cloud-test-'));
  const scriptPath='.local/cloud-api-build/runtime-test.mjs';
  await buildCloudApi('cloudflare/fixtures/runtime.mjs',scriptPath);
  const config=JSON.parse(readFileSync('cloudflare/wrangler.api.json'));
  const options=convertV4MiniflareOptions({modules:true,scriptPath,compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,durableObjects:{JLPT_DATABASE:{className:'JlptDatabase',useSQLite:true}},r2Buckets:['MEDIA'],bindings:config.vars,durableObjectsPersist:join(dir,'db'),r2Persist:join(dir,'r2')});
  options.resourcePersistencePath=join(dir,'state');
  let mf=new Miniflare(options);
  const request=(path,method='GET',body,token='test-1')=>mf.dispatchFetch(origin+path,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const json=async (...args)=>{const r=await request(...args);const text=await r.text();assert.ok(r.ok,`${r.status} ${text}`);return JSON.parse(text);};
  try {
    assert.equal((await json('/api/health')).database,'durable-object-sqlite');
    assert.equal((await request('/api/me','GET',undefined,'')).status,401);
    assert.equal((await request('/api/auth/firebase','POST',{idToken:'forged'},'')).status,401);
    assert.equal((await json('/api/auth/config')).market,'database');
    await request('/__seed');
    assert.equal((await json('/api/me')).user.username,'test-1');
    assert.deepEqual(await json('/__tts-cache'), { generated: true, audio: 'fixture-audio' });
    assert.deepEqual(await json('/__tts-cache'), { generated: false, audio: 'fixture-audio' });

    // 設定・単語帳・知識点（v3 は Durable Object の SQLite に入る）
    assert.equal((await json('/api/v3/settings','PATCH',{uiLanguage:'ja',speech:{rate:0.8}})).settings.speech.rate,0.8);
    assert.equal((await json('/api/v3/settings','GET',undefined,'test-2')).settings.uiLanguage,'zh-CN');
    const book=(await json('/api/v3/wordbooks','POST',{title:'Cloud book'})).wordbook;
    assert.equal(book.code,'WB1');
    const item=(await json('/api/v3/knowledge','POST',{kind:'word',wordbook:'WB1',expression:'共有',reading:'きょうゆう',pos:'noun',meaning:'共享'})).item;
    assert.equal(item.code,'W1');
    assert.equal((await json('/api/v3/knowledge/lookup?q=きょうゆう')).items[0].code,'W1');
    assert.equal((await json('/api/v3/wordbooks','GET',undefined,'test-2')).wordbooks.length,0);
    assert.equal((await request('/api/v3/knowledge/W1','GET',undefined,'test-2')).status,404);

    // 収集箱：件数とカーソルでのページ読み
    for (let i=0;i<6;i+=1) await json('/api/v3/inbox','POST',{body:`語${i}`,category:'word'});
    assert.equal((await json('/api/v3/inbox/count?status=inbox')).total,6);
    const first=await json('/api/v3/inbox?status=inbox&limit=4');
    assert.equal(first.items.length,4);
    for (const c of first.items) await json('/api/v3/inbox/'+c.code,'PATCH',{status:'processed'});
    const rest=await json('/api/v3/inbox?limit=4&cursor='+encodeURIComponent(first.page.nextCursor));
    assert.deepEqual(rest.items.map((c)=>c.body),['語1','語0']);

    // 画像・音声は R2：アップロードが失敗したら SQL も戻る
    const audio=Buffer.from('test-audio-bytes').toString('base64');
    const failed=await mf.dispatchFetch(origin+'/api/v3/media',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test-1','x-test-fail-upload':'1'},body:JSON.stringify({base64:audio,mime:'audio/wav'})});
    assert.equal(failed.status,503);
    const media=(await json('/api/v3/media','POST',{base64:audio,mime:'audio/wav'})).media;
    assert.equal(await (await request(media.url)).text(),'test-audio-bytes');
    assert.equal((await request(media.url,'GET',undefined,'test-2')).status,404);
    const bucket=await mf.getR2Bucket('MEDIA');
    assert.ok((await bucket.list()).objects.some((o)=>o.key.startsWith('v3-media/1/')));
    const recording=(await json('/api/v3/recordings','POST',{audioBase64:Buffer.from('learner-audio').toString('base64'),mime:'audio/webm'})).recording;
    assert.equal(recording.status,'pending');

    // 市場：公開・他人の取り込み（ファイルは参照のまま共有）
    const share=(await json('/api/v3/market','POST',{kind:'wordbook',source:'WB1',title:'Shared book'})).share;
    assert.ok((await json('/api/v3/market','GET',undefined,'test-2')).shares.some((s)=>s.id===share.id));
    const imported=await json('/api/v3/market/'+share.id+'/import','POST',{},'test-2');
    assert.ok(imported.wordbook);
    assert.equal((await request('/api/v3/market/'+share.id,'DELETE',undefined,'test-2')).status,404);

    // OAuth と MCP：v3 のツールが Cloudflare からも公開される
    const doc=await json('/.well-known/oauth-protected-resource');
    assert.equal(doc.resource,origin+'/api/jlpt/mcp');
    const client=await json('/api/jlpt/oauth/register','POST',{client_name:'Runtime test',redirect_uris:['http://localhost:9999/callback'],token_endpoint_auth_method:'none'});
    const verifier='a'.repeat(64);
    const params={client_id:client.client_id,redirect_uri:'http://localhost:9999/callback',response_type:'code',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',state:'test',scope:'study library:write audio:read',resource:origin+'/api/jlpt/mcp'};
    const grant=async(scopes)=>{
      const approved=await json('/api/jlpt/oauth/approve','POST',{...params,decision:'approve',scopes});
      const r=await mf.dispatchFetch(origin+'/api/jlpt/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:new URL(approved.redirect).searchParams.get('code'),code_verifier:verifier,client_id:client.client_id,redirect_uri:params.redirect_uri,resource:params.resource}).toString()});
      assert.equal(r.status,200,await r.clone().text());
      return (await r.json()).access_token;
    };
    const issued=await grant(['study','library:write','audio:read']);
    const studyOnly=await grant(['study']);
    assert.equal(await (await request(media.url,'GET',undefined,issued)).text(),'test-audio-bytes');
    assert.equal((await request(media.url,'GET',undefined,studyOnly)).status,403);
    assert.equal((await request(media.url,'GET',undefined,'agt_invalid')).status,401);
    const rpc=async(method,body={})=>{
      const r=await mf.dispatchFetch(origin+'/api/jlpt/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',authorization:`Bearer ${issued}`},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:body})});
      assert.equal(r.status,200,await r.clone().text());
      const raw=await r.text(),line=raw.split('\n').find(x=>x.startsWith('data:'));
      const parsed=JSON.parse(line?line.slice(5):raw); assert.ok(!parsed.error,JSON.stringify(parsed));return parsed.result;
    };
    const catalogue=(await rpc('tools/list')).tools;
    for (const name of ['list_local_official_samples','list_local_mock_exams','get_local_mock_exam']) assert.ok(!catalogue.some((t)=>t.name===name),`${name} must not be published from Cloudflare`);
    for (const name of ['get_connection_info','list_knowledge_points','start_practice','count_learning_captures','list_learning_captures','get_media']) assert.ok(catalogue.some((t)=>t.name===name),name);
    for (const tool of catalogue) for (const hint of ['readOnlyHint','destructiveHint','openWorldHint']) assert.equal(typeof tool.annotations?.[hint],'boolean',`${tool.name}.${hint}`);
    const listed=await rpc('tools/call',{name:'list_knowledge_points',arguments:{}});
    assert.equal(listed.structuredContent.total,1);
    const heard=await rpc('tools/call',{name:'get_media',arguments:{mediaId:media.id}});
    assert.equal(Buffer.from(heard.content[0].data,'base64').toString(),'test-audio-bytes');
    const homeView=await rpc('resources/read',{uri:'ui://jlpt/ai-learning-home.html'});
    assert.match(homeView.contents[0].text,/get_ai_learning_home/);

    // 再起動しても残る
    await mf.dispose(); mf=new Miniflare(options);
    assert.deepEqual(await json('/__tts-cache'), { generated: false, audio: 'fixture-audio' });
    assert.equal((await json('/api/v3/knowledge/W1')).item.expression,'共有');
    assert.equal((await json('/api/v3/settings')).settings.uiLanguage,'ja');
    assert.equal(await (await request(media.url)).text(),'test-audio-bytes');
    assert.equal((await json('/api/v3/wordbooks','GET',undefined,'test-2')).wordbooks.length,1);
    assert.deepEqual(await json('/__tts-cache-alarm-recovery'), { failed: true, retrySoon: true });
    assert.deepEqual(await json('/__tts-cache-batches'), { first: 6, remaining: 0 });
    assert.deepEqual(await json('/__tts-cache-expire'), { remaining: 0, alarm: true });

    // 旧形式のデータしかない Durable Object は書き換えずに待つ（移行は別の手順）
    assert.equal((await request('/__legacy-database')).status,200);
    await mf.dispose(); mf=new Miniflare(options);
    assert.equal((await request('/api/v3/settings')).status,503);
    assert.equal((await request('/api/health')).status,503);
  } finally {await mf.dispose();rmSync(dir,{recursive:true,force:true});}
});
