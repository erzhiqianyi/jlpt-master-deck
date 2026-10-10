# Local backend and MCP (schema v3)

The web app, the MCP server and the Cloudflare Worker share one data layer: the relational v3 database described in [schema-v3-design.md](schema-v3-design.md) (`server/v3/schema.sql`, repositories in `server/v3/repo/`).

## Storage

- `.local/jlpt-v3.sqlite` (or `JLPT_V3_DB_PATH`) holds everything: accounts and sessions, settings, wordbooks, knowledge points, the question bank, practice records, review schedules, drafts, plans, reports, the inbox, recordings and market shares.
- On first start without a v3 file, the server migrates the legacy database (`.local/jlpt.sqlite`, or `JLPT_DB_PATH`) into a new v3 file. The legacy file is only read. A migration report is written next to the new file. The same migration runs by hand with `node scripts/v3/migrate.mjs <legacy.sqlite> <v3.sqlite>`, and `scripts/v3/verify-*.mjs` reconcile the result.
- Images and audio are content-addressed files under `.local/v3-media/<user-id>/` (R2 on Cloudflare). The database keeps their metadata in `media_files`.

## Running

```sh
npm run dev        # web http://localhost:4220, API 127.0.0.1:4221 (JLPT_WEB_PORT / JLPT_API_PORT)
npm run mcp        # stdio MCP server, for clients that launch a local process
npm run mcp:setup  # register the project-scoped HTTP MCP server with Codex
```

Local accounts use usernames and passwords (salted `scrypt`). Sessions are bearer tokens.

## HTTP API

Every study route is under `/api/v3` and requires `Authorization: Bearer <token>`. Records are addressed by business codes (`WB1`, `W12`, `G3`, `QS4`, `QV15`, `DP3`, `AT12`, `DR7`, `IN12`, `TK3`, `RC1`, `MT3`).

| Area | Routes |
|---|---|
| Settings | `GET/PATCH /settings`, `GET /languages`, `GET /card-templates` |
| Wordbooks, knowledge | `/wordbooks[/WB]`, `/knowledge[/W\|G\|N]`, `GET /knowledge/lookup?q=`, `PUT/DELETE /knowledge/{code}/memory-image` |
| Question bank | `GET /question-types`, `POST /questions/validate`, `/question-groups[/QS]`, `POST /question-groups/{QS}/status`, `GET …/review-context`, `POST …/reviews`, `GET /question-reviews`, `POST /questions/{Q}/report` |
| Materials, media | `/materials[/MT]`, `POST /media`, `GET /media/{id}` |
| Practice | `/practice-sets[/DP\|TP\|MX]`, `POST /attempts`, `GET /attempts[/active\|/AT]`, `POST /attempts/{AT}/answers`, `POST /attempts/{AT}/complete`, `GET /mistakes` |
| Memory cards | `GET /cards/due`, `GET /cards/{code}`, `POST/GET /cards/ratings` |
| Activity | `GET /stats`, `GET /home`, `GET /reports[/{date}[/context]]` |
| Plan | `GET /plan`, `PUT /plan/profile`, `POST /plan/tasks/{TK}` |
| Drafts | `/drafts[/DR]`, `POST /drafts/{DR}/comments\|status\|publish` |
| Inbox | `GET /inbox?status=&category=&limit=&cursor=`, `GET /inbox/count`, `POST /inbox`, `GET/PATCH/DELETE /inbox/{IN}` |
| Recordings | `/recordings[/RC]` |
| Market | `GET /market[?mine=1]`, `GET /market/sources`, `POST /market/preview`, `POST /market`, `GET/DELETE /market/{id}`, `POST /market/{id}/refresh\|import` |
| Offline sync | `GET /sync?cursor=&limit=` (see [apple-v3-port.md](apple-v3-port.md)) |

Outside `/api/v3`: `/api/auth/*`, `/api/me`, `/api/agents`, `/api/tts/*` (pronunciation with the user's own provider keys), `/api/health`, and the local-only `/api/local-*` routes for workstation sample files.

Answers (`POST /attempts/{AT}/answers`) and card ratings (`POST /cards/ratings`) carry a client `eventId`. A repeated event is stored once and returns `duplicate: true`, so clients can retry safely.

## MCP

`server/mcp-app.mjs` serves an OAuth 2.1-protected HTTP MCP server under `/api/jlpt` (discovery at `/.well-known/oauth-protected-resource`). `server/mcp-server.mjs` is the stdio server. Both use the same catalogue, `server/mcp-tools.mjs`: the v3 study tools from `server/v3/mcp-tools.mjs`, plus three tools that read workstation sample files. Those three are hidden on Cloudflare and refuse non-localhost callers. Tool inputs and outputs use business codes. `tools/list` is authoritative for parameters.

### Scopes

| Scope | Grants | Tools |
|---|---|---|
| `study` (required) | Reading the library and recording the learner's own study: settings, wordbooks, practice, answers, card ratings, plans, reports, drafts, inbox, recordings analysis, translations and furigana | 63 tools |
| `library:write` | Creating, changing and deleting knowledge points, question groups, practice sets, materials and media; question review; publishing drafts; importing shares | 21 tools, e.g. `create_knowledge_point`, `create_question_group`, `submit_question_review`, `publish_practice_draft` |
| `audio:read` | Reading uploaded audio and image bytes | `get_media` |

A grant without a scope hides that scope's tools from `tools/list`. Every handler takes the owner from the authenticated grant, never from tool input.

### MCP App views

`resources/list` offers three views (`text/html;profile=mcp-app`): `ui://jlpt/practice.html` (linked from `start_practice` and `get_practice`), `ui://jlpt/review-cards-v2.html` (`get_due_cards`) and `ui://jlpt/ai-learning-home.html` (`get_ai_learning_home`). They call `submit_answer`, `complete_practice`, `rate_card`, `lookup_word` and `create_learning_capture` through the host. Build them with `npm run build:mcp-app`. The Cloudflare bundle embeds them.

### Processing the inbox

1. `count_learning_captures { status: "inbox" }`, then `list_learning_captures { status: "inbox", limit }`. Follow `nextCursor` (the last inbox code) to read the next page. Marking entries processed does not make later pages skip any.
2. For each entry, use its `context` and target `wordbook`. Check for an existing record with `lookup_word` / `list_knowledge_points`, then write with `create_knowledge_point` / `update_knowledge_point` or `create_question_group`. A listening question needs real audio (`upload_media`). Leave ambiguous entries in the inbox.
3. Only after the write succeeded, call `update_learning_capture_status { code, status: "processed" }` (or `archived`).

The `jlpt-chat-review` skill (`skills/jlpt-chat-review/`) describes the whole authoring workflow, including review of new question groups.

## Local UI with the hosted account

To preview local frontend changes against the hosted learning data, put `JLPT_API_ORIGIN=https://jlpt.erzhiqian.cc` in the ignored `.env.local` file and run `npm run dev:app`. Open `http://localhost:4220` and choose Google sign-in with the same account used on the hosted site. Vite forwards `/api` and `/.well-known` to that HTTPS origin, and `/api/auth/config` supplies the existing Firebase configuration. A local API process is not needed for this mode. Do not copy session tokens between sites. Hosted and local API sessions use separate browser storage keys. Removing the setting and restarting Vite restores the local API proxy.
