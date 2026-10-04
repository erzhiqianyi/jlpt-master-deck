import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transform } from 'esbuild';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function loadAnalytics(id = 'G-TEST123') {
  const source = await readFile(new URL('../src/lib/analytics.ts', import.meta.url), 'utf8');
  const { code } = await transform(source, {
    loader: 'ts', format: 'cjs',
    define: { 'import.meta.env.VITE_GOOGLE_ANALYTICS_ID': JSON.stringify(id) },
  });
  const scripts = [];
  const context = {
    module: { exports: {} },
    window: { location: { origin: 'https://example.com', pathname: '/', hash: '#/home' } },
    document: { title: 'JLPT', createElement: () => ({}), head: { appendChild: (script) => scripts.push(script) } },
  };
  vm.runInNewContext(code, context);
  return { ...context, scripts, api: context.module.exports };
}

test('GA commands use the Arguments envelope required by gtag.js', async () => {
  const { api, window, scripts } = await loadAnalytics();
  api.initializeAnalytics();
  api.trackPageView();
  api.trackPageView('/#/practice');
  api.initializeAnalytics();
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-TEST123');
  assert.deepEqual(Array.from(window.dataLayer, (command) => Object.prototype.toString.call(command)),
    ['[object Arguments]', '[object Arguments]', '[object Arguments]', '[object Arguments]']);
  assert.equal(window.dataLayer[0][0], 'js');
  assert.equal(window.dataLayer[1][0], 'config');
  assert.equal(window.dataLayer[1][1], 'G-TEST123');
  assert.equal(window.dataLayer[1][2].send_page_view, false);
  assert.equal(window.dataLayer[2][1], 'page_view');
  assert.equal(window.dataLayer[2][2].page_location, 'https://example.com/#/home');
  assert.equal(window.dataLayer[3][2].page_path, '/#/practice');
});

test('an unset measurement ID leaves analytics disabled', async () => {
  const { api, window, scripts } = await loadAnalytics('');
  api.initializeAnalytics();
  api.trackPageView();
  assert.equal(window.gtag, undefined);
  assert.equal(scripts.length, 0);
});
