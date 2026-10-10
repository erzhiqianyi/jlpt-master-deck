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

test('replay route IDs are recognised only with the replay: prefix', () => {
  assert.equal(replay.replayRouteAttemptId('replay:attempt-1'), 'attempt-1');
  assert.equal(replay.replayRouteAttemptId('topics'), undefined);
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
