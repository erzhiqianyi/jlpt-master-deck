import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from './worker.mjs';

const origin = 'https://study.example.com';
const env = { ASSETS: { fetch: () => new Response('app') } };
test('proxies auth and POST bodies, overwrites untrusted forwarded origin, never caches', async () => {
  const request = new Request(origin + '/api/answers?x=1', { method: 'POST', body: '{"answer":2}', headers: { authorization: 'Bearer test-token', 'x-forwarded-host': 'attacker.example' } });
  const result = await handleRequest(request, {...env, API: {fetch: async (upstream) => {
    assert.equal(upstream.url, origin + '/api/answers?x=1');
    assert.equal(upstream.headers.get('authorization'), 'Bearer test-token');
    assert.equal(upstream.headers.get('x-forwarded-host'), 'study.example.com');
    assert.equal(upstream.headers.get('x-forwarded-proto'), 'https');
    assert.equal(await upstream.text(), '{"answer":2}');
    assert.equal(upstream.redirect, 'manual');
    return Response.json({ saved: true });
  }}});
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
});
test('blocks raw backups while serving the application', async () => {
  assert.equal((await handleRequest(new Request(origin + '/data/review-data/2026/09.json'), env)).status, 404);
  assert.equal(await (await handleRequest(new Request(origin + '/practice'), env)).text(), 'app');
});
test('reports backend downtime and missing configuration without HTML or internal errors', async () => {
  const req = new Request(origin + '/api/me');
  for (const fetcher of [async () => new Response('Tunnel error', {status:502}), async () => { throw new Error('private details'); }]) {
    const res = await handleRequest(req, {...env, API: {fetch: fetcher}});
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, '学习服务暂时离线，请稍后重试。');
  }
  assert.equal((await handleRequest(req, {})).status, 503);
});
test('OAuth discovery is forwarded with the public URL', async () => {
  const res = await handleRequest(new Request(origin + '/.well-known/oauth-authorization-server'), {...env, API: {fetch: async (req) => {
    assert.equal(new URL(req.url).origin, origin);
    assert.equal(req.headers.get('x-forwarded-host'), 'study.example.com');
    return Response.json({issuer:origin});
  }}});
  assert.equal((await res.json()).issuer, origin);
});
