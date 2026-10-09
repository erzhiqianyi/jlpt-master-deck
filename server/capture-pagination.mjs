import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const capturePaginationLimits = { defaultLimit: 5, maxLimit: 50, cursorTtlSeconds: 86400 };
const status = z.enum(['inbox', 'processed', 'archived', 'all']);
const category = z.enum(['word', 'grammar', 'sentence', 'listening', 'reading', 'unsure']);
export const captureCountInput = {
  status: status.optional().describe('Default inbox. Use all explicitly to count every status.'),
  category: category.optional().describe('Omit for all input categories.'),
};
export const capturePageInput = {
  ...captureCountInput,
  limit: z.number().int().min(1).max(capturePaginationLimits.maxLimit).optional().describe('Client-selected page size, integer 1–50. Default 5 only when omitted; may change between pages.'),
  cursor: z.string().min(1).max(2048).optional().describe('Opaque nextCursor from the previous page. Omitted filters inherit the cursor; supplied filters must match. Valid for 24 hours.'),
  includeTotal: z.boolean().optional().describe('Include the exact owner/filter count before applying the cursor. Default false.'),
};
const countSchema = z.object(captureCountInput).strict();
const pageSchema = z.object(capturePageInput).strict();
const cursorSchema = z.object({
  version: z.literal(1),
  owner: z.number().int().positive().safe(),
  filters: z.object({ status, category: category.nullable() }).strict(),
  // created_at is immutable; accept legacy stored timestamp strings as well as ISO dates.
  createdAt: z.string().min(1).max(64),
  id: z.string().min(1).max(256),
  expiresAt: z.number().int().positive().safe(),
}).strict();

function invalid(message) { throw Object.assign(new Error(message), { statusCode: 400 }); }
export function captureOwner(userId) {
  if (!Number.isSafeInteger(userId) || userId < 1) invalid('Invalid capture owner');
  return userId;
}
export function parseCaptureCount(input = {}) { return countSchema.parse(input); }
export function parseCapturePage(input = {}) { return pageSchema.parse(input); }
export function captureFilters(input) { return { status: input.status ?? 'inbox', category: input.category ?? null }; }

// One database-local signing key survives Node / Durable Object restarts. It is internal
// auth state, deliberately not part of the owner-data test-copy export manifest.
export function ensureCapturePaginationSchema(db) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS learning_captures_queue_idx ON learning_captures(user_id, status, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS learning_captures_category_queue_idx ON learning_captures(user_id, status, category, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS learning_captures_owner_queue_idx ON learning_captures(user_id, created_at DESC, id DESC);
    CREATE TABLE IF NOT EXISTS capture_cursor_key (id INTEGER PRIMARY KEY CHECK(id = 1), secret TEXT NOT NULL);
  `);
  db.prepare('INSERT OR IGNORE INTO capture_cursor_key (id, secret) VALUES (1, ?)').run(randomBytes(32).toString('hex'));
}
function signature(db, payload) {
  const key = db.prepare('SELECT secret FROM capture_cursor_key WHERE id = 1').get();
  if (!key) throw new Error('Capture pagination schema is not initialized');
  return createHmac('sha256', key.secret).update(payload).digest();
}
export function issueCaptureCursor(db, owner, filters, lastRow) {
  const payload = Buffer.from(JSON.stringify({ version: 1, owner, filters, createdAt: lastRow.created_at, id: lastRow.id,
    expiresAt: Date.now() + capturePaginationLimits.cursorTtlSeconds * 1000 })).toString('base64url');
  return `${payload}.${signature(db, payload).toString('base64url')}`;
}
export function readCaptureCursor(db, token, owner, input) {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) invalid('Invalid capture cursor');
  const [payload, mac] = parts;
  const provided = Buffer.from(mac, 'base64url');
  const expected = signature(db, payload);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) invalid('Invalid capture cursor');
  let cursor;
  try { cursor = cursorSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))); }
  catch { invalid('Invalid capture cursor'); }
  if (cursor.owner !== owner) invalid('Invalid capture cursor');
  if (cursor.expiresAt <= Date.now()) invalid('Capture cursor expired; start a new page');
  if ((input.status !== undefined && input.status !== cursor.filters.status)
    || (input.category !== undefined && input.category !== cursor.filters.category)) invalid('Capture cursor filters must match the original page');
  return cursor;
}

export function captureWhere(owner, filters, cursor) {
  const conditions = ['user_id = ?'];
  const values = [owner];
  if (filters.status !== 'all') { conditions.push('status = ?'); values.push(filters.status); }
  if (filters.category !== null) { conditions.push('category = ?'); values.push(filters.category); }
  if (cursor) {
    conditions.push('(created_at < ? OR (created_at = ? AND id < ?))');
    values.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }
  return { sql: conditions.join(' AND '), values };
}

export function captureRestInput(searchParams, paging) {
  const allowed = paging ? Object.keys(capturePageInput) : Object.keys(captureCountInput);
  const input = {};
  for (const [key, value] of searchParams) {
    if (!allowed.includes(key) || Object.hasOwn(input, key)) invalid('Invalid or duplicate capture query parameter');
    if (key === 'limit') {
      if (!/^[1-9]\d*$/.test(value)) invalid('Capture limit must be an integer from 1 to 50');
      input[key] = Number(value);
    } else if (key === 'includeTotal') {
      if (!['true', 'false'].includes(value)) invalid('includeTotal must be true or false');
      input[key] = value === 'true';
    } else input[key] = value;
  }
  return paging ? parseCapturePage(input) : parseCaptureCount(input);
}
