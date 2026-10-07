import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

async function loadSource(file) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const { code } = await transform(source, { loader: 'ts', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const navigation = await loadSource('../src/domain/appNavigation.ts');
const replay = await loadSource('../src/domain/attemptReplay.ts');

test('primary navigation has a shared order and classifies by task', () => {
  assert.deepEqual(navigation.primaryNavigationViews, ['home', 'market', 'history', 'study']);
  for (const view of ['vocabulary', 'grammar', 'listening', 'reading']) {
    for (const page of ['questions', 'review']) assert.equal(navigation.primaryNavigationView({ view, page }), 'home');
    for (const page of ['words', 'tips', 'bank']) assert.equal(navigation.primaryNavigationView({ view, page }), 'study');
  }
  assert.equal(navigation.primaryNavigationView({ view: 'drafts', page: 'questions' }), 'home');
  assert.equal(navigation.primaryNavigationView({ view: 'market', page: 'questions', itemId: 'share-1' }), 'market');
});

test('browsing retains global navigation; practice and authoring are immersive', () => {
  for (const route of [
    { view: 'history', page: 'questions', itemId: 'history' },
    { view: 'market', page: 'questions', itemId: 'share-1' },
    { view: 'settings', page: 'questions', itemId: 'display' },
    { view: 'vocabulary', page: 'words', itemId: 'word-1' },
    { view: 'mixed', page: 'tips', itemId: 'topics' },
  ]) assert.equal(navigation.isImmersiveRoute(route), false, JSON.stringify(route));
  for (const route of [
    { view: 'vocabulary', page: 'questions' }, { view: 'mixed', page: 'review' },
    { view: 'reading', page: 'words', itemId: 'passage-1' },
    { view: 'listening', page: 'words', itemId: 'audio-1' },
    { view: 'daily-practice', page: 'questions', itemId: 'today' },
    { view: 'memory-review', page: 'questions' }, { view: 'capture', page: 'questions' },
  ]) assert.equal(navigation.isImmersiveRoute(route), true, JSON.stringify(route));
});

test('previous/next entry resolves the URL identity and does not substitute missing entries', () => {
  const items = [{ id: 'word/a' }, { id: 'word/b' }, { id: 'word/c' }];
  assert.equal(navigation.adjacentEntryId(items, 'word/a', -1), 'word/c');
  assert.equal(navigation.adjacentEntryId(items, 'word/a', 1), 'word/b');
  assert.equal(navigation.adjacentEntryId(items, 'missing', 1), undefined);
  assert.equal(navigation.adjacentEntryId([], 'word/a', 1), undefined);
});

const source = { id: 'old', practiceId: 'daily-1', title: 'Original set', view: 'daily-practice', deck: 'all', startedAt: '2026-10-01', completedAt: '2026-10-01', analysisStatus: 'completed', questionIds: ['b', 'a'], answers: [{ questionId: 'a', selected: 'A', correct: true, elapsedMs: 2 }], summary: { total: 2, correct: 1 } };
const originals = [{ id: 'a', choices: ['A', 'B'], answer: 'A' }, { id: 'b', choices: ['C', 'D'], answer: 'D' }];
source.questionManifest=source.questionIds.map(id=>({instanceId:id,status:'frozen',snapshot:originals.find(q=>q.id===id)}));
test('history redo preserves exact original order and attribution in a fresh independent attempt', () => {
  assert.deepEqual(replay.questionsForAttempt(source, originals).map((question) => question.id), ['b', 'a']);
  const fresh = replay.createReplayAttempt(source, 'new', '2026-10-03');
  assert.deepEqual(fresh, { id: 'new', practiceId: 'daily-1', title: 'Original set', view: 'daily-practice', deck: 'all', startedAt: '2026-10-03', analysisStatus: 'idle', questionIds: ['b', 'a'], questionManifest:source.questionManifest, answers: [] });
  assert.equal(source.answers.length, 1);
  assert.equal(source.completedAt, '2026-10-01');
  assert.notEqual(fresh.questionIds, source.questionIds);
});

test('redo is unavailable for missing or unsupported questions rather than falling back to random content', () => {
  assert.equal(replay.canReplayAttempt(source, originals), true);
  assert.equal(replay.canReplayAttempt({...source,questionManifest:source.questionManifest.slice(1)}, originals.slice(1)), false);
  assert.equal(replay.canReplayAttempt({...source,questionManifest:undefined}, originals), false);
  assert.equal(replay.canReplayAttempt({ ...source, questionIds: [] }, originals), false);
});

test('replay routes and answers remain tied to their own attempt', () => {
  assert.equal(replay.replayRouteAttemptId('replay:attempt-1'), 'attempt-1');
  assert.equal(replay.replayRouteAttemptId('topics'), undefined);
  assert.equal(replay.answersForAttempt(source).a.attemptId, 'old');
  assert.deepEqual(replay.answersForAttempt(replay.createReplayAttempt(source, 'new', 'now')), {});
});

test('hash routing round-trips replay IDs, daily references and entry identities', async () => {
  const { build } = await import('esbuild');
  const built = await build({ entryPoints: [new URL('../src/domain/appRoutes.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', write: false });
  const { routeHash, routeFromHash } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
  for (const route of [
    { view: 'mixed', page: 'questions', itemId: 'replay:attempt-1' },
    { view: 'mixed', page: 'review', itemId: 'replay:attempt-1' },
    { view: 'daily-practice', page: 'review', itemId: 'DP-42' },
    { view: 'vocabulary', page: 'words', itemId: 'word/with space' },
    { view: 'reading', page: 'review', itemId: undefined },
    { view: 'listening', page: 'review', itemId: undefined },
  ]) assert.deepEqual(routeFromHash(routeHash(route.view, route.page, route.itemId)), route);
  assert.equal(routeFromHash('#/mixed/questions/replay:attempt-1').itemId, 'replay:attempt-1');
});

test('practice save queue preserves request order and recovers after a failed request', async () => {
  const started = [], settled = [];
  let releaseFirst;
  const first = replay.enqueuePracticeSave(Promise.resolve(), async () => {
    started.push(1);
    await new Promise((resolve) => { releaseFirst = resolve; });
    settled.push(1);
    throw new Error('temporary failure');
  });
  const second = replay.enqueuePracticeSave(first, async () => { started.push(2); settled.push(2); return 'both answers'; });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(started, [1]);
  releaseFirst();
  assert.equal(await second, 'both answers');
  assert.deepEqual(started, [1, 2]);
  assert.deepEqual(settled, [1, 2]);
});

test('replay persistence leaves the shared answers and active session untouched', () => {
  const fresh = replay.createReplayAttempt(source, 'new', 'now');
  const body = replay.replayPracticeSaveBody([fresh, source], { item: { correct: 1, wrong: 0, status: 'learning' } });
  assert.deepEqual(Object.keys(body).sort(), ['attemptHistory', 'progress']);
  assert.equal('answers' in body, false);
  assert.equal('activeAttempt' in body, false);
  assert.equal(body.attemptHistory[1], source);
  assert.deepEqual(replay.replayPracticeSaveBody([fresh, source]), { attemptHistory: [fresh, source] }, 'in-progress saves cannot overwrite progress');
});

test('desktop and mobile replay Back return to history, never unrelated mixed questions', async () => {
  const { build } = await import('esbuild');
  const built = await build({ entryPoints: [new URL('../src/domain/appRoutes.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', write: false });
  const { desktopBackRoute, mobileBackRoute } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
  for (const page of ['questions', 'review']) {
    const route = { view: 'mixed', page, itemId: 'replay:attempt-1' };
    assert.deepEqual(desktopBackRoute(route), { view: 'history', page: 'questions', itemId: 'history' });
    assert.deepEqual(mobileBackRoute(route), desktopBackRoute(route));
  }
});
