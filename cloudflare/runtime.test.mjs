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
    assert.deepEqual(await json('/__tts-cache'), { generated: true, audio: 'fixture-audio' });
    assert.deepEqual(await json('/__tts-cache'), { generated: false, audio: 'fixture-audio' });
    assert.ok((await json('/api/study-plan')).plan.profile);
    const mock = (await json('/api/mock-exams', 'POST', { title: '自由な試験', sessions: [{ id: 'part', title: '自由なパート', questions: [{ id: 'q', prompt: '選んでください', choices: ['A', 'B'], answerIndex: 1, explanation: 'Bです' }] }] })).exam;
    assert.equal((await json('/api/mock-exams')).exams[0].id, mock.id);
    assert.equal((await request('/api/mock-exams/' + mock.id, 'GET', undefined, 'test-2')).status, 404);
    assert.equal((await json('/api/mock-exams/' + mock.id, 'PATCH', { expectedRevision: 1, title: '変更' })).exam.revision, 2);
    assert.equal((await request('/api/mock-exams/' + mock.id, 'PATCH', { expectedRevision: 1, title: '古い更新' })).status, 409);

    assert.deepEqual((await json('/api/daily-summaries/2026-09-27')).summary, null);
    assert.deepEqual((await json('/api/daily-summaries')).summaries, []);
    assert.equal((await request('/api/daily-summaries/invalid')).status, 400);
    const empty=await json('/api/review-data');
    assert.equal(JSON.stringify(empty).includes('面目躍如'),false);
    const book=(await json('/api/wordbooks','POST',{title:'Cloud isolation',deck:'n1_vocab'})).wordbook;
    assert.ok(book.id);
    assert.equal((await json('/api/auth/config')).market,'database');
    const source = await json('/api/market/import','POST',{format:'jlpt-share',version:1,kind:'wordbook',title:'Cloud public snapshot',items:[{deck:'n1_vocab',original:'共有',reading:'きょうゆう',meaning_zh:'共享'}]});
    const share = await json('/api/market','POST',{kind:'wordbook',sourceId:source.id});
    // Practice import invokes draft creation inside an existing transaction.
    const importedPractice = await json('/api/market/import', 'POST', {
      format: 'jlpt-share', version: 1, kind: 'practice', title: 'Nested draft archival',
      questions: [{ id: 'source-q', kind: 'grammar', prompt: '猫（　）いる。', choices: ['が', 'を'], answer: 'が', correctReason: '主语用が。' }],
    });
    assert.ok(importedPractice.id);

    const reviewItem = (await json('/api/review-data')).items.find(item => item.original === '共有');
    assert.ok(reviewItem);
    const reviewInput = { questionId: `memory-card:${reviewItem.id}`, itemId: reviewItem.id, selected: 'hard', correct: true,
      reviewEventId: 'cloud-review-1', reviewedAt: '2026-10-04T01:00:00Z', source: 'ios',
      progressEntry: { correct: 1, wrong: 0, status: 'review', reviewCount: 1, lastReviewedAt: '2026-10-04T01:00:00Z', nextReviewAt: '2026-10-05T01:00:00Z' } };
    await json('/api/answers', 'POST', reviewInput);
    await json('/api/answers', 'POST', reviewInput);
    assert.equal((await json('/api/daily-summaries/2026-10-04')).cardReviews.totalReviews, 1);
    assert.equal((await json('/api/daily-summaries/2026-10-04','GET',undefined,'test-2')).cardReviews.totalReviews, 0);
    assert.ok(!(reviewInput.questionId in (await json('/api/study-state')).answers));

    assert.ok((await json('/api/market','GET',undefined,'test-2')).shares.some(s=>s.id===share.id&&!s.mine));
    assert.equal((await request(`/api/market/${share.id}`, 'PATCH', {title:'stolen'}, 'test-2')).status, 404);
    const editedShare = await json(`/api/market/${share.id}`, 'PATCH', {title:'Updated shared book', description:'Edited intro', refreshSource:true});
    assert.equal(editedShare.id, share.id);
    assert.equal(editedShare.package.title, 'Updated shared book');
    assert.equal((await json('/api/market?mine=1')).shares.every(row => row.mine), true);
    const coverPayload = { mime: 'image/png', imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' };
    assert.equal((await request(`/api/market/${share.id}/cover`, 'PUT', coverPayload, 'test-2')).status, 404);
    const coverResult = await json(`/api/market/${share.id}/cover`, 'PUT', coverPayload);
    const coverResponse = await mf.dispatchFetch(origin + coverResult.coverUrl);
    assert.equal(coverResponse.status, 200);
    assert.deepEqual(Buffer.from(await coverResponse.arrayBuffer()), Buffer.from(coverPayload.imageBase64, 'base64'));
    const failedCover = await mf.dispatchFetch(origin + `/api/market/${share.id}/cover`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer test-1', 'x-test-fail-upload': '1' }, body: JSON.stringify(coverPayload) });
    assert.equal(failedCover.status, 503);
    assert.equal((await json('/api/market')).shares.find(s => s.id === share.id).coverUrl, coverResult.coverUrl);


    assert.ok(!(await json('/api/wordbooks','GET',undefined,'test-2')).wordbooks.some(x=>x.id===book.id));
    assert.equal((await request('/api/wordbooks/'+book.id,'PATCH',{title:'stolen'},'test-2')).status,404);
    const reading = (await json('/api/reading-questions', 'POST', { passage: '素材が変わった。', question: '何が変わったか。', choices: ['素材', '場所', '人', '時間'], answerIndex: 0, explanation: '総解説', passageTranslation: '食材变了。', choiceExplanations: ['素材', '場所', '人', '時間'].map((text, i) => ({ text, translation: text, analysis: '分析', evidence: '素材が変わった。', errorType: i ? '无中生有' : '' })), readingAnalysis: { summary: '变化', structure: '说明', keySentences: ['素材が変わった。'] } })).question;
    assert.equal((await json('/api/reading-questions/' + reading.id)).question.passageTranslation, '食材变了。');
    const revisedReading = (await json('/api/reading-questions/' + reading.id, 'PATCH', { explanation: '更新总解析' })).question;
    assert.equal(revisedReading.choiceExplanations.length, 4);
    assert.equal(revisedReading.explanation, '更新总解析');
    assert.equal((await request('/api/reading-questions/' + reading.id, 'PATCH', { explanation: 'stolen' }, 'test-2')).status, 404);
    assert.equal((await request('/api/reading-questions/' + reading.id, 'GET', undefined, 'test-2')).status, 404);
    const replay = {eventId:'cloud-answer-replay',legacy:false,before:{correct:0,wrong:0,status:'new'},
      input:{questionId:'memory-card:'+reading.id,itemId:reading.id,selected:'0',correct:true,
        progressEntry:{correct:1,wrong:0,status:'learning',lastReviewedAt:'2026-10-05T01:00:00Z'}}};
    assert.equal((await json('/api/answers/replay','POST',replay)).outcome,'accepted');
    assert.equal((await json('/api/answers/replay','POST',replay)).outcome,'duplicate');
    assert.equal((await request('/api/answers/replay','POST',replay,'test-2')).status,400);
    const audioBody={question:'何をしますか。',choices:['読む','書く','聞く','話す'],choiceDetails:['読む','書く','聞く','話す'].map((choice)=>({translation:choice,explanation:`${choice} の理由`})),answerIndex:2,transcript:'男：音声の原文。',transcriptTranslation:'男：音频原文。',audioMime:'audio/wav',audioBase64:Buffer.from('test-audio-bytes').toString('base64')};
    // Model an existing database missing the later audio and completion-statistics tables.
    assert.equal((await request('/__legacy-audio-schema')).status, 200);
    await mf.dispose(); mf=new Miniflare(options);
    assert.equal((await json('/api/answers/replay','POST',replay)).outcome,'duplicate');
    assert.equal((await json('/api/study-state')).progress[reading.id].correct,1);
    assert.deepEqual(await json('/__tts-cache'), { generated: false, audio: 'fixture-audio' });
    assert.equal((await json('/api/health')).databaseReady, true);
    assert.equal((await json('/api/mock-exams/' + mock.id)).exam.title, '変更');
    assert.equal((await json('/api/daily-summaries/2026-10-04')).cardReviews.ratings.hard, 1);
    assert.equal((await json('/api/reading-questions/' + reading.id)).question.explanation, '更新总解析');
    const failed=await mf.dispatchFetch(origin+'/api/listening-questions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test-1','x-test-fail-upload':'1'},body:JSON.stringify(audioBody)});
    assert.equal(failed.status,503);
    assert.equal((await json('/api/listening-questions')).questions.length,0,'failed R2 upload rolls back SQL');
    const question=(await json('/api/listening-questions','POST',audioBody)).question;
    const recording=(await json('/api/listening-questions/'+question.id+'/recordings','POST',{audioMime:'audio/wav',audioBase64:Buffer.from('learner-audio-bytes').toString('base64')})).recording;
    const audioPath='/api/listening-questions/'+question.id+'/audio';
    assert.equal(await (await request(audioPath)).text(),'test-audio-bytes');
    assert.equal((await request(audioPath,'GET',undefined,'test-2')).status,404);
    const doc=await json('/.well-known/oauth-protected-resource');
    assert.equal(doc.resource,origin+'/api/jlpt/mcp');
    const client=await json('/api/jlpt/oauth/register','POST',{client_name:'Runtime test',redirect_uris:['http://localhost:9999/callback'],token_endpoint_auth_method:'none'});
    const verifier='a'.repeat(64);
    const params={client_id:client.client_id,redirect_uri:'http://localhost:9999/callback',response_type:'code',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',state:'test',scope:'study library:write audio:read',resource:origin+'/api/jlpt/mcp'};
    const approved=await json('/api/jlpt/oauth/approve','POST',{...params,decision:'approve',scopes:['study','library:write','audio:read']});
    const tokenResponse=await mf.dispatchFetch(origin+'/api/jlpt/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:new URL(approved.redirect).searchParams.get('code'),code_verifier:verifier,client_id:client.client_id,redirect_uri:params.redirect_uri,resource:params.resource}).toString()});
    assert.equal(tokenResponse.status,200,await tokenResponse.clone().text());
    const issued=await tokenResponse.json();
    const recordingAudioPath='/api/listening-recordings/'+recording.id+'/audio';
    assert.equal(await (await request(audioPath,'GET',undefined,issued.access_token)).text(),'test-audio-bytes');
    assert.equal(await (await request(recordingAudioPath,'GET',undefined,issued.access_token)).text(),'learner-audio-bytes');
    assert.equal((await request(recordingAudioPath,'GET',undefined,'test-2')).status,404);
    assert.equal((await request(recordingAudioPath,'GET',undefined,'agt_invalid')).status,401);
    assert.equal((await request(recordingAudioPath,'GET',undefined,'')).status,401);
    const studyOnlyApproval=await json('/api/jlpt/oauth/approve','POST',{...params,decision:'approve',scopes:['study']});
    const studyOnlyResponse=await mf.dispatchFetch(origin+'/api/jlpt/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:new URL(studyOnlyApproval.redirect).searchParams.get('code'),code_verifier:verifier,client_id:client.client_id,redirect_uri:params.redirect_uri,resource:params.resource}).toString()});
    assert.equal(studyOnlyResponse.status,200);
    const studyOnly=await studyOnlyResponse.json();
    assert.equal((await request(recordingAudioPath,'GET',undefined,studyOnly.access_token)).status,403);
    const rpc=async(method,params={})=>{
      const r=await mf.dispatchFetch(origin+'/api/jlpt/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',authorization:`Bearer ${issued.access_token}`},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
      assert.equal(r.status,200,await r.clone().text());
      const raw=await r.text(),line=raw.split('\n').find(x=>x.startsWith('data:'));
      const body=JSON.parse(line?line.slice(5):raw); assert.ok(!body.error,JSON.stringify(body));return body.result;
    };
    const catalogue = (await rpc('tools/list')).tools;
    for (const name of ['list_local_official_samples', 'list_local_mock_exams', 'get_local_mock_exam', 'export_review_data_backup', 'get_listening_recording_analysis_context']) {
      assert.ok(!catalogue.some((tool) => tool.name === name), `${name} must not be published from Cloudflare`);
    }
    for (const tool of catalogue) {
      for (const hint of ['readOnlyHint', 'destructiveHint', 'openWorldHint']) assert.equal(typeof tool.annotations?.[hint], 'boolean', `${tool.name}.${hint}`);
    }
    assert.ok(catalogue.some(x=>x.name==='get_review_data'));
    assert.ok(catalogue.some(x=>x.name==='get_ai_learning_home'));
    assert.ok(catalogue.some(x=>x.name==='rate_review_card'));
    assert.ok(catalogue.some(x=>x.name==='get_listening_audio'));
    assert.ok(catalogue.some(x=>x.name==='get_listening_recording_audio'));
    assert.ok(catalogue.some(x=>x.name==='get_listening_audio_download'));
    assert.ok(catalogue.some(x=>x.name==='get_listening_recording_download'));
    assert.ok(catalogue.some(x=>x.name==='list_pending_listening_recordings'));
    assert.ok(catalogue.some(x=>x.name==='save_listening_recording_analysis'));
    const home = await rpc('tools/call', { name: 'get_ai_learning_home', arguments: {} });
    assert.ok(!home.isError, JSON.stringify(home));
    assert.equal(typeof home.structuredContent.due.total, 'number');
    const homeView = await rpc('resources/read', { uri: 'ui://jlpt/ai-learning-home.html' });
    assert.match(homeView.contents[0].text, /get_ai_learning_home/);
    const mcpAudio = await rpc('tools/call', { name:'get_listening_audio', arguments:{question_id:question.id} });
    assert.equal(mcpAudio.content[0].type, 'audio');
    assert.equal(mcpAudio.content[0].mimeType, 'audio/wav');
    assert.equal(Buffer.from(mcpAudio.content[0].data, 'base64').toString(), 'test-audio-bytes');
    const learnerAudio = await rpc('tools/call', { name:'get_listening_recording_audio', arguments:{recording_id:recording.id} });
    assert.equal(Buffer.from(learnerAudio.content[0].data, 'base64').toString(), 'learner-audio-bytes');
    const recordingDownload = await rpc('tools/call', { name:'get_listening_recording_download', arguments:{recording_id:recording.id} });
    const downloadInfo = JSON.parse(recordingDownload.content[0].text);
    assert.equal(downloadInfo.url,origin+recordingAudioPath);
    assert.equal(downloadInfo.mimeType,'audio/wav');
    assert.equal(downloadInfo.size,19);
    assert.ok(!recordingDownload.content[0].text.includes(issued.access_token));
    const referenceDownload = await rpc('tools/call', { name:'get_listening_audio_download', arguments:{question_id:question.id} });
    assert.equal(JSON.parse(referenceDownload.content[0].text).url,origin+audioPath);
    const pendingRecordings = await rpc('tools/call', { name:'list_pending_listening_recordings', arguments:{} });
    assert.ok(JSON.parse(pendingRecordings.content[0].text).some(x=>x.id===recording.id));
    await rpc('tools/call', { name:'save_listening_recording_analysis', arguments:{recording_id:recording.id,status:'completed',analysis:{summary:'発音を比較した。',transcript:'学習者の発話',referenceTranscript:'男：音声の原文。',nextPractice:'もう一度聞く。'}} });
    assert.equal((await json('/api/listening-questions/'+question.id+'/recordings')).recordings[0].analysis.transcript, '学習者の発話');
    assert.equal((await request('/api/listening-recordings/'+recording.id,'DELETE')).status, 200);
    assert.equal((await request('/api/listening-recordings/'+recording.id+'/audio')).status, 404);
    assert.equal(await (await request(audioPath)).text(), 'test-audio-bytes');
    for (const name of ['get_daily_summary', 'generate_daily_summary_context', 'upsert_daily_summary']) assert.ok(catalogue.some(x=>x.name===name), name);
    const emptySummary = await rpc('tools/call', { name: 'get_daily_summary', arguments: { date: '2026-09-27' } });
    assert.equal(JSON.parse(emptySummary.content[0].text).status, 'not_found');
    const summaryInput = { date:'2026-09-27', total_questions:1, correct_count:1, incorrect_count:0, accuracy:1,
      stats:{byKind:[{kind:'grammar',total:1,correct:1,incorrect:0,accuracy:1}],uniqueItems:1},
      strengths:[{label:'基础意义',detail:'一次正确'}], weaknesses:[], confusion_groups:[],
      recommendations:[{type:'review',title:'复习',detail:'保持练习'}], wrong_questions:[], summary_zh:'基础意义稳定。' };
    const savedSummary = await rpc('tools/call', { name:'upsert_daily_summary', arguments:summaryInput });
    assert.ok(!savedSummary.isError, JSON.stringify(savedSummary));
    assert.equal((await json('/api/daily-summaries/2026-09-27')).summary.summaryZh, summaryInput.summary_zh);
    assert.equal((await json('/api/daily-summaries')).summaries.length, 1);
    const readingCreateSchema = catalogue.find(x=>x.name==='create_reading_question').inputSchema;
    for (const field of ['explanation', 'passageTranslation', 'choiceExplanations', 'readingAnalysis', 'explanationNodes']) {
      assert.ok(readingCreateSchema.required.includes(field), field);
    }
    assert.ok(!(await rpc('tools/call',{name:'get_review_data',arguments:{}})).isError);
    for (const name of ['jlpt_query','jlpt_aggregate']) {
      const result=await rpc('tools/call',{name,arguments:{entity:'item',time:{mode:'all'}}});
      assert.ok(!result.isError,JSON.stringify(result));
    }
    const readingToolResult = await rpc('tools/call', { name: 'get_reading_question', arguments: { id: reading.id } });
    assert.ok(!readingToolResult.isError, JSON.stringify(readingToolResult));
    assert.equal(JSON.parse(readingToolResult.content[0].text).choiceExplanations.length, 4);
    const incompleteReadingUpdate = await rpc('tools/call', { name: 'update_reading_question', arguments: { id: reading.id, passageTranslation: '不应保存' } });
    assert.ok(incompleteReadingUpdate.isError, JSON.stringify(incompleteReadingUpdate));
    assert.equal((await json('/api/reading-questions/' + reading.id)).question.passageTranslation, '食材变了。');
    const explanationNodes = [{ title: '解题思路与排除技巧', body: '定位主语素材，再排除地点、人物和时间。' }];
    const readingUpdateResult = await rpc('tools/call', { name: 'update_reading_question', arguments: { id: reading.id, passageTranslation: '云端 MCP 更新译文', explanationNodes } });
    assert.ok(!readingUpdateResult.isError, JSON.stringify(readingUpdateResult));
    const rubyTerms = [{ text: '素材', reading: 'そざい' }];
    const readingsUpdate = await rpc('tools/call', { name: 'update_reading_question', arguments: { id: reading.id, rubyTerms } });
    assert.ok(!readingsUpdate.isError, JSON.stringify(readingsUpdate));
    assert.deepEqual((await json('/api/reading-questions/' + reading.id)).question.rubyTerms, rubyTerms);
    const readingMetadata = await rpc('tools/call', { name: 'jlpt_get', arguments: { entity: 'reading_question', id: reading.id, sections: ['metadata'] } });
    assert.deepEqual(JSON.parse(readingMetadata.content[0].text).data.metadata.rubyTerms, rubyTerms);
    const inventedEvidence = await rpc('tools/call', { name: 'update_reading_question', arguments: { id: reading.id, readingAnalysis: { ...reading.readingAnalysis, keySentences: ['本文にはない。'] } } });
    assert.ok(inventedEvidence.isError, JSON.stringify(inventedEvidence));
    const privateItem = { id:'cloud-private-item', deck:'grammar_expression', type:'grammar', original:'〜にほかならない', meaning_zh:'正是' };
    const saved = await rpc('tools/call',{name:'upsert_review_item',arguments:{item:privateItem}});
    assert.ok(!saved.isError,JSON.stringify(saved));
    assert.ok((await json('/api/review-data')).items.some(item=>item.id===privateItem.id));
    assert.ok(!(await json('/api/review-data','GET',undefined,'test-2')).items.some(item=>item.id===privateItem.id));
    assert.equal((await request('/api/review-items/'+privateItem.id,'PATCH',{tags:['stolen']},'test-2')).status,404);
    const resources=(await rpc('resources/list')).resources;
    assert.match((await rpc('resources/read',{uri:resources[0].uri})).contents[0].text,/<div id="app"><\/div>/);
    await mf.dispose(); mf=new Miniflare(options);
    assert.deepEqual(await json('/__tts-cache'), { generated: false, audio: 'fixture-audio' });
    const persistedReading = (await json('/api/reading-questions/' + reading.id)).question;
    assert.equal(persistedReading.passageTranslation, '云端 MCP 更新译文');
    assert.equal(persistedReading.explanation, '更新总解析');
    assert.deepEqual(persistedReading.readingAnalysis, reading.readingAnalysis);
    assert.deepEqual(persistedReading.explanationNodes, explanationNodes);
    assert.deepEqual(persistedReading.rubyTerms, rubyTerms);
    assert.ok((await json('/api/wordbooks')).wordbooks.some(x=>x.id===book.id));
    const persistedShare = await json('/api/market/'+share.id,'GET',undefined,'test-2');
    assert.equal(persistedShare.createdAt,share.createdAt);
    assert.equal(persistedShare.package.items[0].original,'共有');
    const copy = await json('/api/market/import','POST',{shareId:share.id},'test-2');
    assert.notEqual(copy.id,source.id);
    assert.equal((await request('/api/market/'+share.id,'DELETE',undefined,'test-2')).status,404);
    await json('/api/market/'+share.id,'DELETE');
    assert.equal((await request('/api/market/import','POST',{shareId:share.id},'test-2')).status,404);

    assert.ok((await json('/api/review-data')).items.some(item=>item.id===privateItem.id));
    assert.deepEqual((await json('/api/review-data','GET',undefined,'test-2')).items.map(item=>item.original),['共有']);
    assert.equal(await (await request(audioPath)).text(),'test-audio-bytes');
    assert.deepEqual(await json('/__tts-cache-alarm-recovery'), { failed: true, retrySoon: true });
    assert.deepEqual(await json('/__tts-cache-batches'), { first: 6, remaining: 0 });
    assert.deepEqual(await json('/__tts-cache-expire'), { remaining: 0, alarm: true });
    assert.equal(await (await request(audioPath)).text(), 'test-audio-bytes');
    await json('/api/listening-questions/'+question.id,'DELETE');
    assert.equal((await request(audioPath)).status,404);
    const frozenAudioRef=question.materialRefs[0];
    const frozenAudioPath=`/api/materials/${encodeURIComponent(frozenAudioRef.id)}/versions/${frozenAudioRef.revision}/audio`;
    assert.equal(await (await request(frozenAudioPath)).text(),'test-audio-bytes');
    assert.equal((await request(frozenAudioPath,'GET',undefined,'test-2')).status,404);
    assert.equal((await request(frozenAudioPath,'GET',undefined,'')).status,401);
    assert.equal((await request(frozenAudioPath,'GET',undefined,studyOnly.access_token)).status,403);
    assert.equal(await (await request(frozenAudioPath,'GET',undefined,issued.access_token)).text(),'test-audio-bytes');
    const frozenMcpAudio=await rpc('tools/call',{name:'get_material_audio',arguments:{material_id:frozenAudioRef.id,revision:frozenAudioRef.revision}});
    assert.ok(!frozenMcpAudio.isError,JSON.stringify(frozenMcpAudio));assert.equal(Buffer.from(frozenMcpAudio.content[0].data,'base64').toString(),'test-audio-bytes');
    // Active question route is gone, but immutable material history still owns bytes.
    const media=await mf.getR2Bucket('MEDIA');
    const retained=(await media.list()).objects;
    assert.equal(retained.length,1);
    assert.equal(await (await media.get(retained[0].key)).text(),'test-audio-bytes');
    await media.delete(retained[0].key);
    assert.equal((await request(frozenAudioPath)).status,404);
    const missingAudio=await rpc('tools/call',{name:'get_material_audio',arguments:{material_id:frozenAudioRef.id,revision:frozenAudioRef.revision}});assert.equal(missingAudio.isError,true);
  } finally {await mf.dispose();rmSync(dir,{recursive:true,force:true});}
});
