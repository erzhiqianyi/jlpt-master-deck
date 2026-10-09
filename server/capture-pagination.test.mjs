import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { withPlatform } from './platform.mjs';
import { ensureCapturePaginationSchema, capturePaginationLimits } from './capture-pagination.mjs';

const dir = mkdtempSync(join(tmpdir(), 'jlpt-capture-pages-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const storage = await import('./storage.mjs');
const { tools, toolJsonSchema } = await import('./mcp-tools.mjs');
const { createApiHandler } = await import('./api-handler.mjs');
const db = storage.getDb();
after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
let sequence = 0;
function fixture() {
  const owner = storage.createUser(`pages-${sequence++}`, 'password-one');
  const other = storage.createUser(`pages-${sequence++}`, 'password-two');
  const token = storage.loginUser(owner.username, 'password-one').token;
  const ids = Array.from({ length: 12 }, (_, index) => `${owner.id}-capture-${String(index).padStart(2, '0')}`).reverse();
  const insert = db.prepare(`INSERT INTO learning_captures (id,user_id,body,category,context,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?)`);
  for (const id of ids) insert.run(id, owner.id, `body ${id}`, 'word', 'source context', 'inbox', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');
  for (const [id, user, category, status] of [
    ['grammar', owner.id, 'grammar', 'inbox'], ['done', owner.id, 'word', 'processed'],
    ['archived', owner.id, 'word', 'archived'], ['other', other.id, 'word', 'inbox'],
  ]) insert.run(`${owner.id}-${id}`, user, id, category, '', status, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z');
  return { owner, other, ids, token };
}
async function call(name, args, owner) {
  const entry = tools.find(tool => tool.name === name);
  const result = await entry.handler(z.object(entry.inputSchema).parse(args), { ownerId: String(owner.id) });
  if (result.structuredContent) assert.deepEqual(JSON.parse(JSON.stringify(result.structuredContent)), JSON.parse(result.content[0].text));
  return JSON.parse(result.content[0].text);
}
async function api(path, token) {
  let status, body;
  await createApiHandler({})({ method: 'GET', url: path, headers: { host: 'localhost', authorization: `Bearer ${token}` } }, {
    writeHead(value) { status = value; }, end(value) { body = JSON.parse(value); },
  });
  return { status, body };
}

test('capture count and page use identical owner/status/category filters, preserving old return contracts', async () => {
  const { owner, other, token } = fixture();
  for (const status of [undefined, 'inbox', 'processed', 'archived', 'all']) {
    for (const category of [undefined, 'word', 'grammar', 'listening']) {
      const args = { ...(status ? { status } : {}), ...(category ? { category } : {}) };
      const count = await call('count_learning_captures', args, owner);
      const page = await call('list_learning_captures_page', { ...args, limit: 50, includeTotal: true }, owner);
      assert.deepEqual(page.filters, count.filters);
      assert.equal(page.total, count.total);
      assert.equal(page.captures.length, count.total);
    }
  }
  assert.equal(storage.countLearningCaptures(owner.id).total, 13);
  assert.equal(storage.countLearningCaptures(other.id).total, 1);
  assert.equal(storage.listLearningCapturesPage(owner.id).total, null);
  const old = await call('list_learning_captures', {}, owner);
  assert.ok(Array.isArray(old));
  assert.equal(old.length, 15);
  assert.deepEqual((await api('/api/captures', token)).body, { captures: old });
  assert.equal((await api('/api/captures/count', token)).body.total, 13);
  assert.deepEqual(await call('count_learning_captures', { category: 'word' }, owner), (await api('/api/captures/count?category=word', token)).body);
  const restPage = await api('/api/captures/page?category=word&limit=50&includeTotal=true', token);
  assert.equal(restPage.status, 200);
  assert.deepEqual(restPage.body, await call('list_learning_captures_page', { category: 'word', limit: 50, includeTotal: true }, owner));
});

test('stable equal-timestamp cursors continue after each emitted capture is processed, with client-selected limits', () => {
  const { owner, ids } = fixture();
  let page = storage.listLearningCapturesPage(owner.id, { category: 'word', limit: 5, includeTotal: true });
  const seen = [];
  assert.equal(page.page.limit, 5);
  assert.equal(page.total, 12);
  while (true) {
    seen.push(...page.captures.map(c => c.id));
    for (const capture of page.captures) storage.updateLearningCaptureStatus(owner.id, capture.id, 'processed');
    if (!page.page.nextCursor) break;
    page = storage.listLearningCapturesPage(owner.id, { cursor: page.page.nextCursor, limit: 3, includeTotal: true });
    assert.equal(page.page.limit, 3);
    assert.equal(page.total, 12 - seen.length);
    assert.equal(page.filters.category, 'word');
  }
  assert.deepEqual(seen, ids);
  assert.equal(new Set(seen).size, 12);
  assert.equal(storage.countLearningCaptures(owner.id, { category: 'word' }).total, 0);
  const empty = storage.listLearningCapturesPage(owner.id, { category: 'word', includeTotal: true });
  assert.deepEqual(empty.page, { limit: 5, returned: 0, hasMore: false, nextCursor: null });
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.captures, []);
});

test('cursor anchor survives leaving inbox, permits retry, and rejects different owner/filters and tampering', () => {
  const { owner, other, ids } = fixture();
  const first = storage.listLearningCapturesPage(owner.id, { category: 'word', limit: 5 });
  const cursor = first.page.nextCursor;
  for (const capture of first.captures.slice(1)) storage.updateLearningCaptureStatus(owner.id, capture.id, 'processed');
  const args = { cursor, category: 'word', status: 'inbox' };
  const next = storage.listLearningCapturesPage(owner.id, args);
  assert.deepEqual(next.captures.map(c => c.id), ids.slice(5, 10));
  assert.deepEqual(storage.listLearningCapturesPage(owner.id, args).captures, next.captures, 'read cursors can be retried');
  assert.equal(storage.listLearningCapturesPage(owner.id, { category: 'word', limit: 1 }).captures[0].id, ids[0], 'failed entry is still pending next traversal');
  for (const input of [{ cursor, category: 'grammar' }, { cursor, status: 'processed' }, { cursor, status: 'all' }, { cursor: cursor.replace(/^./, cursor[0] === 'a' ? 'b' : 'a') }, { cursor: 'bad' }]) {
    assert.throws(() => storage.listLearningCapturesPage(owner.id, input), /cursor/i);
  }
  assert.throws(() => storage.listLearningCapturesPage(other.id, { cursor }), /cursor/i);
  assert.equal(storage.updateLearningCaptureStatus(other.id, ids[0], 'processed'), null);
});

test('empty continuation and exact page boundaries do not invent a next cursor; count excludes cursor predicate', () => {
  const { owner, ids } = fixture();
  const first = storage.listLearningCapturesPage(owner.id, { category: 'word', limit: 5 });
  const next = storage.listLearningCapturesPage(owner.id, { cursor: first.page.nextCursor, limit: 7, includeTotal: true });
  assert.equal(next.total, 12);
  assert.deepEqual(next.captures.map(c => c.id), ids.slice(5));
  assert.equal(next.page.hasMore, false);
  assert.equal(next.page.nextCursor, null);
  for (const id of ids.slice(5)) storage.updateLearningCaptureStatus(owner.id, id, 'processed');
  assert.deepEqual(storage.listLearningCapturesPage(owner.id, { cursor: first.page.nextCursor }).page, { limit: 5, returned: 0, hasMore: false, nextCursor: null });
});

test('expired cursors fail, and the database-local signing key is stable across schema initialization', () => {
  const { owner } = fixture();
  const cursor = storage.listLearningCapturesPage(owner.id, { limit: 1 }).page.nextCursor;
  ensureCapturePaginationSchema(db);
  assert.equal(storage.listLearningCapturesPage(owner.id, { cursor, limit: 1 }).captures.length, 1);
  const now = Date.now;
  Date.now = () => now() + capturePaginationLimits.cursorTtlSeconds * 1000 + 1000;
  try { assert.throws(() => storage.listLearningCapturesPage(owner.id, { cursor }), /expired/); }
  finally { Date.now = now; }
});

test('new pages validate limits in storage, MCP and REST instead of widening malformed requests', async () => {
  const { owner, token } = fixture();
  const schema = toolJsonSchema(tools.find(t => t.name === 'list_learning_captures_page'));
  assert.equal(schema.properties.limit.minimum, 1);
  assert.equal(schema.properties.limit.maximum, 50);
  assert.equal(schema.properties.limit.type, 'integer');
  for (const limit of [0, -1, 1.5, 51, '5', null, NaN, Infinity]) {
    assert.throws(() => storage.listLearningCapturesPage(owner.id, { limit }));
    await assert.rejects(call('list_learning_captures_page', { limit }, owner));
  }
  assert.equal(storage.listLearningCapturesPage(owner.id, { limit: 50 }).page.limit, 50);
  for (const query of ['limit=0', 'limit=-1', 'limit=1.5', 'limit=51', 'limit=5junk', 'limit=', 'limit=NaN', 'limit=Infinity', 'limit=1&limit=2', 'status=bad', 'category=bad', 'includeTotal=1', 'cursor=', 'user_id=2']) {
    assert.equal((await api(`/api/captures/page?${query}`, token)).status, 400, query);
  }
  for (const query of ['status=bad', 'category=bad', 'status=inbox&status=all', 'limit=5']) assert.equal((await api(`/api/captures/count?${query}`, token)).status, 400);
  assert.throws(() => storage.countLearningCaptures(owner.id, { status: 'bad' }));
  assert.throws(() => storage.countLearningCaptures(owner.id, { category: "word' OR 1=1" }));
});

test('database queries are bounded before mapping and counts select no capture bodies; indexes support queue sorting', () => {
  const { owner } = fixture();
  const reads = [];
  const traced = new Proxy(db, { get(target, key) {
    if (key === 'prepare') return sql => {
      const statement = target.prepare(sql);
      return new Proxy(statement, { get(entry, method) {
        const value = entry[method];
        if (['get', 'all'].includes(method)) return (...params) => {
          const rows = value.call(entry, ...params);
          reads.push({ sql, params, returned: Array.isArray(rows) ? rows.length : 1 });
          return rows;
        };
        return typeof value === 'function' ? value.bind(entry) : value;
      } });
    };
    const value = target[key];
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  withPlatform({ db: traced }, () => {
    storage.countLearningCaptures(owner.id, { category: 'word' });
    storage.listLearningCapturesPage(owner.id, { category: 'word', limit: 5 });
  });
  const captureReads = reads.filter(r => /FROM learning_captures/.test(r.sql));
  assert.equal(captureReads.length, 2);
  assert.match(captureReads[0].sql, /SELECT COUNT\(\*\)/);
  assert.match(captureReads[1].sql, /category = \?.*ORDER BY created_at DESC, id DESC LIMIT \?/);
  assert.equal(captureReads[1].params.at(-1), 6);
  assert.equal(captureReads[1].returned, 6);
  for (const [sql, values] of [
    ['WHERE user_id=? AND status=?', [owner.id, 'inbox']],
    ['WHERE user_id=? AND status=? AND category=?', [owner.id, 'inbox', 'word']],
    ['WHERE user_id=?', [owner.id]],
  ]) {
    const plan = db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM learning_captures ${sql} ORDER BY created_at DESC,id DESC LIMIT ?`).all(...values, 6);
    assert.ok(plan.some(row => /USING INDEX learning_captures_/.test(row.detail)));
    assert.ok(plan.every(row => !/TEMP B-TREE/.test(row.detail)));
  }
});
