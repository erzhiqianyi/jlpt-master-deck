# Learning capture queue protocol v1

HTTP MCP, local stdio and Cloudflare share the same tool catalogue and storage implementation. These additions require only the existing `study` read scope. The deployed tools are discovered through `tools/list`; `capture` is not a `jlpt_query` / `jlpt_aggregate` entity.

## Tools and inputs

| Tool | Inputs | Output |
| --- | --- | --- |
| `count_learning_captures` | `status?`, `category?` | `{total,filters}` |
| `list_learning_captures_page` | `status?`, `category?`, `limit?`, `cursor?`, `includeTotal?` | `{captures,page,total,filters}` |

Both are read-only and obtain the owner from authentication, never from client input. `status` is `inbox` (default), `processed`, `archived` or `all`. `category` is `word`, `grammar`, `sentence`, `listening`, `reading` or `unsure`; omission selects every category. Invalid values are rejected, not widened to all records.

The client selects `limit`: an integer from **1 to 50 inclusive**. Omission uses 5; five is a fallback, not a protocol restriction. Zero, negative, fractional, string, null and over-50 values are rejected. Clients can change the limit on continuation. `includeTotal` is a boolean, default false. `cursor` is an opaque string of at most 2048 characters returned as `page.nextCursor`.

```json
{"name":"count_learning_captures","arguments":{"status":"inbox","category":"word"}}
```

```json
{"total":12,"filters":{"status":"inbox","category":"word"}}
```

```json
{"name":"list_learning_captures_page","arguments":{"status":"inbox","category":"word","limit":5,"includeTotal":true}}
```

Illustrative response (the captures array may contain up to the requested limit):

```json
{
  "captures":[
    {"id":"owned-id","body":"裁量","category":"word","context":"source sentence","status":"inbox","createdAt":"2026-10-01T00:00:00.000Z","updatedAt":"2026-10-01T00:00:00.000Z","reference":"CP-000001"}
  ],
  "page":{"limit":5,"returned":1,"hasMore":false,"nextCursor":null},
  "total":1,
  "filters":{"status":"inbox","category":"word"}
}
```

The full capture shape is unchanged, including optional `targetDeck`, `targetWordbookId` and `targetWordbookTitle`, and existing public reference decoration. New tool results supply both `structuredContent` and the same serialized JSON in text `content`. `total` is null when not requested; otherwise it is the exact owner/filter count **before** the cursor predicate, not the number remaining after this page. Page rows and optional total are read in one database transaction. Counts can change between requests.

When more matches exist, `hasMore` is true and `nextCursor` is a string. Continue with that exact cursor:

```json
{"name":"list_learning_captures_page","arguments":{"cursor":"<previous page.nextCursor>","limit":20,"includeTotal":true}}
```

Omitted filters inherit the cursor's filters. Supplied status/category must match the first page; to change filters or remove a category, start without a cursor. Cursors are authenticated, owner-bound, valid for 24 hours from issuance, and can be retried. Tampering, cross-owner use, expired cursors or filter changes are rejected. Database-local signing state survives a Node/DO restart; it is internal auth state and is excluded from owner-data test-copy exports. Restoring a data-only copy creates a different signing key, so old cursors cannot cross databases.

## SQL and queue semantics

Storage executes parameterized `COUNT(*)` and a real `LIMIT limit+1` query; it never reads an entire queue then truncates it. The extra record detects `hasMore` and is never mapped or returned. Ordering is fixed to `created_at DESC,id DESC`; continuation uses `(created_at < lastTime OR (created_at = lastTime AND id < lastId))`. The cursor anchors the last **returned** row. Equal timestamps are deterministic, and updating earlier rows to processed cannot cause OFFSET-style omissions. The immutable anchor values live in the cursor, not a lookup requiring the anchor to remain inbox.

Only after successful persistence in the target library should clients call `update_learning_capture_status({id,status:"processed"})`. Leave failed/ambiguous entries inbox and continue the current traversal before retrying from a fresh first page. Reads do not claim work; concurrent workers still need duplicate checks. This is a live queue, not a frozen snapshot or exactly-once processor: newer entries and reopened entries ahead of the cursor appear on a new traversal. `hasMore` describes the query at response time. Empty/last pages return `hasMore:false,nextCursor:null`, including when remaining entries were processed between requests.

Local Node uses `node:sqlite`; Cloudflare uses native Durable Object SQLite via `cloudflare/sqlite-adapter.mjs`. Both execute the same SQL and owner checks. Startup idempotently adds indexes on `(user_id,status,created_at DESC,id DESC)`, `(user_id,status,category,created_at DESC,id DESC)` and `(user_id,created_at DESC,id DESC)` for status/all-status queues, including existing databases.

## REST and compatibility

`GET /api/captures/count?status=inbox&category=word` returns the count tool's shape. `GET /api/captures/page?status=inbox&category=word&limit=20&includeTotal=true` returns the page shape. URL-encode `cursor` on continuation. REST accepts `includeTotal=true|false`, decimal integer limits 1–50, and rejects malformed, duplicate or unknown query parameters with HTTP 400. MCP rejects malformed inputs through its tool input validation; direct storage calls also validate the same schemas.

Legacy `list_learning_captures` continues to return an array with the existing category filter and omitted-status all-status behavior. Legacy `GET /api/captures` continues to return `{captures:[...]}`. Existing export/sync callers of `listLearningCaptures` are unchanged. Use the new tools for bounded work; adding `limit` to the legacy interface does not enable pagination.

## Publishing and refreshing discovery

The source change alone does not update the currently connected remote MCP. A separately authorized release must deploy the Cloud API Worker (`npm run deploy:cloud-api`, which builds the MCP views and worker); a Pages-only deployment does not update the API tool catalogue. Local HTTP/stdio servers need a restart with the updated code. Startup installs the indexes and signing state without transforming capture records.

After release, refresh/reconnect the client's tool catalogue and inspect authenticated `tools/list` for both new names, `limit` type integer, minimum 1, maximum 50, and cursor/includeTotal fields. These tools add no OAuth scope; an existing `study` grant suffices. A client can separately verify count and a one-record page before using a larger client-selected batch. Do not infer deployment from local test results.

## Validation

`server/capture-pagination.test.mjs` covers owner/filter consistency, REST/MCP compatibility, equal-time traversal, per-entry processed updates, failed-item retry, empty/exact-size pages, count semantics, limit validation, cursor tampering/owner/filter/expiry, bounded SQL reads and indexed query plans. `server/mcp-app.test.mjs` verifies authenticated tool discovery and actual input validation. `cloudflare/capture-pagination.test.mjs` runs the production handlers in real Miniflare DO SQLite, including MCP discovery, owner isolation, processing, and cursor survival across restart. All use temporary databases and fixture authentication.
