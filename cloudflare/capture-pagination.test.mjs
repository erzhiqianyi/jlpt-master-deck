import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { buildCloudApi } from '../scripts/build-cloud-api.mjs';

test('real Durable Object SQLite capture count/pagination, MCP schema, processing and restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jlpt-cloud-capture-pages-'));
  const origin = 'https://jlpt.erzhiqian.cc';
  const scriptPath = '.local/cloud-api-build/capture-pagination-test.mjs';
  await buildCloudApi('cloudflare/fixtures/runtime.mjs', scriptPath);
  const config = JSON.parse(readFileSync('cloudflare/wrangler.api.json'));
  const options = convertV4MiniflareOptions({ modules: true, scriptPath, compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags, durableObjects: { JLPT_DATABASE: { className: 'JlptDatabase', useSQLite: true } },
    r2Buckets: ['MEDIA'], bindings: config.vars, durableObjectsPersist: join(dir, 'db'), r2Persist: join(dir, 'r2') });
  options.resourcePersistencePath = join(dir, 'state');
  let mf = new Miniflare(options);
  const request = (path, method = 'GET', body, token = 'test-1') => mf.dispatchFetch(origin + path, {
    method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = async (...args) => {
    const result = await request(...args);
    assert.equal(result.status < 400, true, await result.clone().text());
    return result.json();
  };
  try {
    await request('/__seed');
    const { ids } = await json('/__capture-seed');
    assert.equal((await json('/api/health')).database, 'durable-object-sqlite');
    for (const status of ['inbox', 'processed', 'archived', 'all']) {
      for (const category of ['', 'word', 'grammar', 'listening']) {
        const query = new URLSearchParams({ status, ...(category ? { category } : {}) });
        const count = await json(`/api/captures/count?${query}`);
        const page = await json(`/api/captures/page?${query}&limit=50&includeTotal=true`);
        assert.equal(page.total, count.total);
        assert.deepEqual(page.filters, count.filters);
        assert.equal(page.captures.length, count.total);
      }
    }
    assert.equal((await json('/api/captures/count')).total, 13);
    assert.equal((await json('/api/captures/count', 'GET', undefined, 'test-2')).total, 1);
    assert.equal((await json('/api/captures')).captures.length, 15, 'old API retains all-status array container');
    const client = await json('/api/jlpt/oauth/register', 'POST', { client_name: 'Capture pagination test', redirect_uris: ['http://localhost:9999/callback'], token_endpoint_auth_method: 'none' });
    const verifier = 'c'.repeat(64);
    const params = { client_id: client.client_id, redirect_uri: 'http://localhost:9999/callback', response_type: 'code',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state: 'capture-test', scope: 'study', resource: origin + '/api/jlpt/mcp' };
    const approved = await json('/api/jlpt/oauth/approve', 'POST', { ...params, decision: 'approve', scopes: ['study'] });
    const tokenResponse = await mf.dispatchFetch(origin + '/api/jlpt/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: new URL(approved.redirect).searchParams.get('code'), code_verifier: verifier, client_id: client.client_id, redirect_uri: params.redirect_uri, resource: params.resource }).toString() });
    assert.equal(tokenResponse.status, 200);
    const issued = await tokenResponse.json();
    const rpc = async (method, params = {}) => {
      const result = await mf.dispatchFetch(origin + '/api/jlpt/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${issued.access_token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      assert.equal(result.status, 200);
      const raw = await result.text();
      const line = raw.split('\n').find(value => value.startsWith('data:'));
      return JSON.parse(line ? line.slice(5) : raw);
    };
    const catalogue = (await rpc('tools/list')).result.tools;
    assert.ok(catalogue.some(tool => tool.name === 'count_learning_captures'));
    const pageTool = catalogue.find(tool => tool.name === 'list_learning_captures_page');
    assert.equal(pageTool.inputSchema.properties.limit.minimum, 1);
    assert.equal(pageTool.inputSchema.properties.limit.maximum, 50);
    assert.equal(pageTool.inputSchema.properties.limit.type, 'integer');
    assert.equal(pageTool.annotations.readOnlyHint, true);
    assert.equal((await rpc('tools/call', { name: 'count_learning_captures', arguments: { category: 'word' } })).result.structuredContent.total, 12);
    const old = (await rpc('tools/call', { name: 'list_learning_captures', arguments: {} })).result;
    assert.equal(JSON.parse(old.content[0].text).length, 15);
    const firstResult = (await rpc('tools/call', { name: 'list_learning_captures_page', arguments: { category: 'word', limit: 5, includeTotal: true } })).result;
    assert.deepEqual(firstResult.structuredContent, JSON.parse(firstResult.content[0].text));
    let page = firstResult.structuredContent;
    const cursor = page.page.nextCursor;
    assert.deepEqual(page.captures.map(c => c.id), ids.slice(0, 5));
    assert.equal(page.total, 12);
    assert.equal((await request(`/api/captures/page?cursor=${cursor}`, 'GET', undefined, 'test-2')).status, 400);
    assert.equal((await request(`/api/captures/page?cursor=${cursor}&category=grammar`)).status, 400);
    assert.equal((await request(`/api/captures/page?cursor=${cursor}&status=processed`)).status, 400);
    assert.equal((await request(`/api/captures/page?cursor=${cursor}x`)).status, 400);
    assert.equal((await request(`/api/captures/${ids[0]}`, 'PATCH', { status: 'processed' }, 'test-2')).status, 404);
    // The signed cursor must survive an actual workerd/DO restart, and processed anchors.
    for (const capture of page.captures) await json(`/api/captures/${capture.id}`, 'PATCH', { status: 'processed' });
    await mf.dispose(); mf = new Miniflare(options);
    page = await json(`/api/captures/page?cursor=${cursor}&limit=3&includeTotal=true`);
    assert.deepEqual(page.captures.map(c => c.id), ids.slice(5, 8));
    assert.equal(page.total, 7);
    const seen = ids.slice(0, 5);
    while (true) {
      seen.push(...page.captures.map(c => c.id));
      for (const capture of page.captures) await json(`/api/captures/${capture.id}`, 'PATCH', { status: 'processed' });
      if (!page.page.nextCursor) break;
      page = await json(`/api/captures/page?cursor=${page.page.nextCursor}&limit=3&includeTotal=true`);
      assert.equal(page.total, 12 - seen.length);
    }
    assert.deepEqual(seen, ids);
    assert.equal(new Set(seen).size, 12);
    const empty = await json('/api/captures/page?category=word&includeTotal=true');
    assert.deepEqual(empty.page, { limit: 5, returned: 0, hasMore: false, nextCursor: null });
    assert.equal(empty.total, 0);
    assert.deepEqual(empty.captures, []);
    assert.equal((await json(`/api/captures/page?cursor=${cursor}`)).captures.length, 0);
    for (const query of ['limit=0', 'limit=-1', 'limit=1.5', 'limit=51', 'limit=5junk', 'limit=', 'limit=1&limit=2', 'status=bad', 'category=bad', 'includeTotal=1']) {
      assert.equal((await request(`/api/captures/page?${query}`)).status, 400, query);
    }
    for (const limit of [0, -1, 1.5, 51, '5']) {
      const result = await rpc('tools/call', { name: 'list_learning_captures_page', arguments: { limit } });
      assert.ok(result.error || result.result?.isError);
    }
  } finally { await mf.dispose(); rmSync(dir, { recursive: true, force: true }); }
});
