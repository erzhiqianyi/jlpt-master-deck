# Learning capture queue

The inbox (`inbox_captures`) holds things the learner noted while studying. An AI client works through it page by page. HTTP MCP, local stdio and Cloudflare share the same tools and SQL; both tools need only the `study` scope, and the owner always comes from authentication.

## Tools

| Tool | Inputs | Output |
| --- | --- | --- |
| `count_learning_captures` | `status?`, `category?` | `{ total, filters }` |
| `list_learning_captures` | `status?`, `category?`, `limit?`, `cursor?` | `{ total, filters, items, page }` |
| `update_learning_capture_status` | `code`, `status` | the capture |

`status` is `inbox` (default), `processed`, `archived` or `all`. `category` is `word`, `grammar`, `sentence`, `listening`, `reading` or `unsure`; omitted means every category. `limit` is an integer from 1 to 50; omitted means 5.

```json
{"name":"list_learning_captures","arguments":{"category":"word","limit":20}}
```

```json
{
  "total": 12,
  "filters": { "status": "inbox", "category": "word" },
  "items": [{ "code": "IN31", "body": "裁量", "category": "word", "context": "source sentence", "wordbook": "WB1", "status": "inbox", "createdAt": "…", "updatedAt": "…" }],
  "page": { "limit": 20, "returned": 12, "hasMore": false, "nextCursor": null }
}
```

`total` counts the whole filter, not what remains after the cursor. When `hasMore` is true, continue with `{"cursor": "<page.nextCursor>"}`; omitted filters follow the cursor, supplied ones must match, and `limit` may change.

## Queue semantics

Pages are newest first (`rid` descending) and the cursor holds the last returned `rid`, so marking entries `processed` between pages skips nothing. The query reads `limit + 1` rows to detect `hasMore`; it never loads the whole queue. The cursor carries only the filters and that position and is not signed: every query is restricted to the authenticated learner, so an edited cursor can only reorder reads of the learner's own entries.

Mark an entry processed only after its knowledge point or question group is saved. Leave failed or ambiguous entries in `inbox` and continue the traversal; start a new traversal to retry them or to see entries added since. Reads do not claim work, so concurrent workers still need duplicate checks (`lookup_word`).

The index `inbox_captures_queue (user_id, status, category, rid)` serves the filters and the ordering.

## REST

`GET /api/v3/inbox?status=inbox&category=word&limit=20&cursor=…` returns the same shape (REST allows `limit` up to 500 and `offset` for the web list; `cursor` and `offset` cannot be combined). `GET /api/v3/inbox/count?status=inbox` returns the count shape.

## Tests

`tests/v3-activity.test.mjs` covers traversal while processing, counts, filter mismatch, malformed cursors and owner isolation; `tests/v3-mcp-tools.test.mjs` covers the tool limits and defaults.
