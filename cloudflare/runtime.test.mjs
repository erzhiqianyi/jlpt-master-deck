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
    await request('/__seed');
    const empty=await json('/api/review-data');
    assert.equal(JSON.stringify(empty).includes('面目躍如'),false);
    const book=(await json('/api/wordbooks','POST',{title:'Cloud isolation',deck:'n1_vocab'})).wordbook;
    assert.ok(book.id);
    assert.ok(!(await json('/api/wordbooks','GET',undefined,'test-2')).wordbooks.some(x=>x.id===book.id));
    assert.equal((await request('/api/wordbooks/'+book.id,'PATCH',{title:'stolen'},'test-2')).status,404);
    const audioBody={question:'何をしますか。',choices:['読む','書く','聞く','話す'],answerIndex:2,audioMime:'audio/wav',audioBase64:Buffer.from('test-audio-bytes').toString('base64')};
    const failed=await mf.dispatchFetch(origin+'/api/listening-questions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test-1','x-test-fail-upload':'1'},body:JSON.stringify(audioBody)});
    assert.equal(failed.status,503);
    assert.equal((await json('/api/listening-questions')).questions.length,0,'failed R2 upload rolls back SQL');
    const question=(await json('/api/listening-questions','POST',audioBody)).question;
    const audioPath='/api/listening-questions/'+question.id+'/audio';
    assert.equal(await (await request(audioPath)).text(),'test-audio-bytes');
    assert.equal((await request(audioPath,'GET',undefined,'test-2')).status,404);
    const doc=await json('/.well-known/oauth-protected-resource');
    assert.equal(doc.resource,origin+'/api/jlpt/mcp');
    const client=await json('/api/jlpt/oauth/register','POST',{client_name:'Runtime test',redirect_uris:['http://localhost:9999/callback'],token_endpoint_auth_method:'none'});
    const verifier='a'.repeat(64);
    const params={client_id:client.client_id,redirect_uri:'http://localhost:9999/callback',response_type:'code',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',state:'test',scope:'study',resource:origin+'/api/jlpt/mcp'};
    const approved=await json('/api/jlpt/oauth/approve','POST',{...params,decision:'approve',scopes:['study']});
    const tokenResponse=await mf.dispatchFetch(origin+'/api/jlpt/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:new URL(approved.redirect).searchParams.get('code'),code_verifier:verifier,client_id:client.client_id,redirect_uri:params.redirect_uri,resource:params.resource}).toString()});
    assert.equal(tokenResponse.status,200,await tokenResponse.clone().text());
    const issued=await tokenResponse.json();
    const rpc=async(method,params={})=>{
      const r=await mf.dispatchFetch(origin+'/api/jlpt/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',authorization:`Bearer ${issued.access_token}`},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
      assert.equal(r.status,200,await r.clone().text());
      const raw=await r.text(),line=raw.split('\n').find(x=>x.startsWith('data:'));
      const body=JSON.parse(line?line.slice(5):raw); assert.ok(!body.error,JSON.stringify(body));return body.result;
    };
    assert.ok((await rpc('tools/list')).tools.some(x=>x.name==='get_review_data'));
    assert.ok(!(await rpc('tools/call',{name:'get_review_data',arguments:{}})).isError);
    for (const name of ['jlpt_query','jlpt_aggregate']) {
      const result=await rpc('tools/call',{name,arguments:{entity:'item',time:{mode:'all'}}});
      assert.ok(!result.isError,JSON.stringify(result));
    }
    const resources=(await rpc('resources/list')).resources;
    assert.match((await rpc('resources/read',{uri:resources[0].uri})).contents[0].text,/<div id="app"><\/div>/);
    await mf.dispose(); mf=new Miniflare(options);
    assert.ok((await json('/api/wordbooks')).wordbooks.some(x=>x.id===book.id));
    assert.equal(await (await request(audioPath)).text(),'test-audio-bytes');
    await json('/api/listening-questions/'+question.id,'DELETE');
    assert.equal((await request(audioPath)).status,404);
    assert.equal((await (await mf.getR2Bucket('MEDIA')).list()).objects.length,0);
  } finally {await mf.dispose();rmSync(dir,{recursive:true,force:true});}
});
