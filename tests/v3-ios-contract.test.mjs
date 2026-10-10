// The requests the iOS client sends (apple/Sources/V3Bridge.swift, AppStore.swift, DiscoveryView.swift,
// NativePractice.swift), with the bodies its encoders produce, against the real REST handler.
// Swift's JSONEncoder leaves nil optionals out, so the bodies below omit them too.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const dir = mkdtempSync(join(tmpdir(), 'v3-ios-'));
process.env.JLPT_DB_PATH = join(dir, 'legacy.sqlite');
process.env.JLPT_V3_DB_PATH = join(dir, 'v3.sqlite');
const { createUser, loginUser } = await import('../server/accounts.mjs');
const { createJlptMcp } = await import('../server/mcp-app.mjs');
const { createApiHandler } = await import('../server/api-handler.mjs');
const { v3Tools } = await import('../server/v3/mcp-tools.mjs');
const { resetV3Db } = await import('../server/v3/database.mjs');

const mcp = createJlptMcp({ onEvent() {} });
await mcp.ensureSchema();
const server = createServer(createApiHandler({ mcp }));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
after(() => { server.close(); resetV3Db(); rmSync(dir, { recursive: true, force: true }); });

const owner = createUser('ios-learner', 'password-one');
const other = createUser('ios-other', 'password-two');
const token = loginUser('ios-learner', 'password-one').token;
const otherToken = loginUser('ios-other', 'password-two').token;
const byName = Object.fromEntries(v3Tools.map((t) => [t.name, t]));
const tool = async (name, args, user = owner) => (await byName[name].handler(z.object(byName[name].inputSchema).parse(args), { ownerId: String(user.id) })).structuredContent;
const send = async (path, { method = 'GET', body, auth = token } = {}) => {
  const response = await fetch(origin + '/' + path, { method, headers: { accept: 'application/json', authorization: `Bearer ${auth}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null };
};
const ok = async (path, options) => { const r = await send(path, options); assert.ok(r.status >= 200 && r.status < 300, `${options?.method ?? 'GET'} ${path} → ${r.status} ${JSON.stringify(r.json)}`); return r.json; };

test('the iOS client contract against the v3 REST API', async () => {
  // Library prepared by an agent.
  await tool('create_wordbook', { title: '词汇' });
  await tool('create_knowledge_point', { kind: 'word', wordbook: 'WB1', expression: '捉える', reading: 'とらえる', pos: 'verb_2', meaning: '抓住' });
  const group = await tool('create_question_group', { typeId: 'vocabulary-kanji-reading', questions: [{ prompt: '要点を捉える。', marks: [{ kind: 'target', start: 3, end: 5 }],
    options: [{ text: 'とらえる', correct: true, analysis: 'a' }, { text: 'おさえる', correct: false, distractorType: 'x', analysis: 'b' }, { text: 'かかえる', correct: false, distractorType: 'x', analysis: 'c' }, { text: 'つかまえる', correct: false, distractorType: 'x', analysis: 'd' }],
    explanation: [{ kind: 'basis', body: 'b' }], knowledge: [{ code: 'W1', relation: 'target' }] }] });
  const questionCode = group.questions[0].code;
  await tool('submit_question_review', { code: questionCode, verdict: 'pass', summary: 'ok' });
  await tool('create_practice_set', { kind: 'daily', title: '今日', sections: [{ title: '語彙', questions: [questionCode] }] });
  const draft = await tool('create_practice_draft', { title: '复习包', sections: [{ title: '词汇', questions: [questionCode] }] });

  // V3Bridge.download: pages of api/v3/sync, then the two market lists.
  const records = [];
  for (let cursor = null; ;) {
    const page = await ok('api/v3/sync?limit=100' + (cursor ? `&cursor=${cursor}` : ''));
    assert.equal(page.format, 'jlpt-v3-sync');
    records.push(...page.records);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  assert.ok(records.some((r) => r.collection === 'questionGroups' && r.value.questions[0].options[0].id));
  await ok('api/v3/market'); await ok('api/v3/market?mine=1');

  // AppStore.saveSettings: PATCH with V3Bridge.settingsPatch output; latestSettings reads it back.
  const patch = { uiLanguage: 'ja', autoAdvanceSeconds: 1, questionKinds: ['vocabulary-kanji-reading'], segmentedDisplay: true, posStyles: { noun: { mode: 'text', color: '#326B9C' } },
    speech: { provider: 'browser', rate: 1 }, dailySource: { answers: true, cardReviews: true, ratings: ['forgot', 'hard'], window: 'previous_day', hours: 24, timeZone: 'Asia/Tokyo', runAt: '07:00' } };
  const saved = (await ok('api/v3/settings', { method: 'PATCH', body: patch })).settings;
  assert.equal(saved.uiLanguage, 'ja');
  assert.deepEqual(saved.questionKinds, ['vocabulary-kanji-reading']);
  assert.equal(saved.dailySource.runAt, '07:00');
  assert.equal((await ok('api/v3/settings')).settings.segmentedDisplay, true);

  // AppStore.saveExamGoal
  const plan = (await ok('api/v3/plan/profile', { method: 'PUT', body: { examName: 'JLPT', level: 'N2', examDate: '2026-12-06' } })).plan;
  assert.equal(plan.profile.examDate, '2026-12-06');

  // AppStore.capture
  assert.equal((await ok('api/v3/inbox', { method: 'POST', body: { body: '面目躍如', category: 'word', context: '' } })).capture.code, 'IN1');

  // flushPending: a rating, then one native round = attempt + answers (by option id) + complete.
  const rating = { code: 'W1', rating: 'hard', eventId: 'ios-rating-1', reviewedAt: '2026-10-10T01:00:00Z', source: 'ios' };
  assert.equal((await ok('api/v3/cards/ratings', { method: 'POST', body: rating })).duplicate, false);
  assert.equal((await ok('api/v3/cards/ratings', { method: 'POST', body: rating })).duplicate, true);
  assert.equal((await send('api/v3/cards/ratings', { method: 'POST', body: { ...rating, code: 'W99', eventId: 'gone' } })).status, 404, 'held for review on the device');
  const attempt = (await ok('api/v3/attempts', { method: 'POST', body: { questions: [questionCode] } })).attempt.code;
  const optionId = records.find((r) => r.collection === 'questionGroups').value.questions[0].options.find((o) => o.text === 'とらえる').id;
  const answer = { question: questionCode, selectedOptionId: optionId, eventId: 'ios-answer-1', answeredAt: '2026-10-10T01:01:00Z', source: 'ios' };
  assert.equal((await ok(`api/v3/attempts/${attempt}/answers`, { method: 'POST', body: answer })).duplicate, false);
  assert.equal((await ok(`api/v3/attempts/${attempt}/answers`, { method: 'POST', body: answer })).duplicate, true);
  const reused = await send(`api/v3/attempts/AT99/answers`, { method: 'POST', body: answer });
  assert.equal(reused.status, 404);
  await ok(`api/v3/attempts/${attempt}/complete`, { method: 'POST', body: '{}' });
  await ok(`api/v3/attempts/${attempt}/complete`, { method: 'POST', body: '{}' }); // completing again is harmless, so retries are safe
  assert.equal((await ok('api/v3/attempts')).items[0].summary.correct, 1);
  // A retry of the same event in another practice record: the 409 message the client treats as already stored.
  const second = (await ok('api/v3/attempts', { method: 'POST', body: { questions: [questionCode] } })).attempt.code;
  const conflict = await send(`api/v3/attempts/${second}/answers`, { method: 'POST', body: answer });
  assert.equal(conflict.status, 409);
  assert.match(conflict.json.error, /已用于另一次作答/);

  // NativeTopicConfirmationView: draft, its questions by code, approve, publish, read the practice set.
  const detail = (await ok(`api/v3/drafts/${draft.code}`)).draft;
  const entry = detail.sections[0].questions[0];
  const resolved = (await ok(`api/v3/question-groups/${entry.group}`)).group;
  assert.ok(resolved.questions.some((q) => q.code === entry.question && q.options.length === 4));
  assert.equal((await ok(`api/v3/drafts/${draft.code}/status`, { method: 'POST', body: { status: 'approved' } })).draft.status, 'approved');
  const published = await ok(`api/v3/drafts/${draft.code}/publish`, { method: 'POST', body: { date: '2026-10-10', title: '复习包' } });
  assert.match(published.practice, /^DP\d+$/);
  const publishedEntry = (await ok(`api/v3/practice-sets/${published.practice}`)).practice.sections[0].entries[0];
  assert.equal(publishedEntry.question, questionCode);
  assert.equal((await ok(`api/v3/question-groups/${publishedEntry.group}`)).group.questions[0].code, questionCode);

  // Discover: publish (web/MCP), list, detail, refresh, import by another account, withdraw.
  const posted = await ok('api/v3/market', { method: 'POST', body: { kind: 'wordbook', source: 'WB1', title: '词汇', description: '' } });
  const id = posted.share.id;
  assert.ok((await ok('api/v3/market?mine=1')).shares.some((s) => s.id === id && s.mine));
  assert.equal((await ok(`api/v3/market/${id}`, { auth: otherToken })).share.package.knowledge[0].expression, '捉える');
  assert.equal((await ok(`api/v3/market/${id}/refresh`, { method: 'POST', body: { title: '新标题', description: '简介' } })).share.title, '新标题');
  assert.ok((await ok(`api/v3/market/${id}/import`, { method: 'POST', body: '{}', auth: otherToken })).wordbook);
  await ok(`api/v3/market/${id}`, { method: 'DELETE' });

  // Media for memory images and listening audio.
  const media = (await ok('api/v3/media', { method: 'POST', body: { base64: Buffer.from('ID3-audio').toString('base64'), mime: 'audio/mpeg' } })).media;
  const audio = await fetch(`${origin}/api/v3/media/${media.id}`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(audio.status, 200);
  assert.equal(Buffer.from(await audio.arrayBuffer()).toString(), 'ID3-audio');
  assert.equal((await fetch(`${origin}/api/v3/media/${media.id}`, { headers: { authorization: `Bearer ${otherToken}` } })).status, 404);
});
