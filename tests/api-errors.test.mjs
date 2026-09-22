import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: ['src/lib/api.ts'], bundle: true, format: 'esm', write: false });
const { apiRequest, ApiError } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

test('API failures retain status so data errors do not masquerade as expired sessions', async (t) => {
  for (const status of [400, 401, 503]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Request rejected' }, { status }));
    await assert.rejects(apiRequest('/api/study-plan'), error => error instanceof ApiError && error.status === status && error.message === 'Request rejected');
    t.mock.restoreAll();
  }
  t.mock.method(globalThis, 'fetch', async () => new Response('Offline', { status: 502 }));
  await assert.rejects(apiRequest('/api/me'), error => error.status === 502 && error.message === 'Request failed: 502');
});
