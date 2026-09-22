# Stable references for chat

Keep the existing `id` as the storage/link/answer key. The new, server-owned
`reference` is for people to copy from the page and mention in MCP chat.

| Prefix | Record |
| --- | --- |
| IT | Vocabulary / grammar item |
| PR | Saved daily or topic practice |
| QU | Saved practice question or immutable browser drill snapshot |
| RD / LS | Reading / listening question |
| AU / RC | Audio asset / learner recording |
| DR / CP / WB | Draft / capture / custom wordbook |

## Allocation and lifecycle

`record_references.number` is SQLite `INTEGER PRIMARY KEY AUTOINCREMENT`.
The whole database shares one sequence (numbers within a type may have gaps).
The public reference is `prefix + '-' + number padded to at least 6 digits`.
`UNIQUE(user_id, entity, internal_id)` makes concurrent/idempotent allocation safe.
Browsers and MCP callers cannot choose or overwrite the number.

Startup backfills existing rows, then INSERT/UPDATE triggers allocate references
with the source write. Content edits and sorting keep the same reference. Registry
rows survive source deletion; a deleted source cannot resolve and its number is
never assigned to a different internal identity. Restoring the same identity can
restore its original reference. Replacing a formal question must use a new ID;
reordering an existing question must preserve its existing ID.

Browser-generated drills have no saved practice row. On first display the server
checks the source item owner, stores an immutable question snapshot keyed by the
SHA-256 of its canonical field projection, and assigns a QU reference. Identical
snapshots reuse the reference; changed content/choices receives a new one. They
are separate from daily-practice counts. This registration does not record an
answer or affect progress. Never make up a reference when registration fails.

Local and Cloudflare SQLite run the same migration and triggers. References are
unique within one authoritative database, not globally across independent installs.
Full database backups/migrations must preserve `record_references`,
`question_reference_snapshots` and SQLite sequence state. Monthly item JSON exports
include the source reference for traceability, but do not restore the allocation
registry; importing/sharing into another database receives destination references.

## Where the learner sees it

- Lists: word/grammar rows show IT; listening audio groups show AU (legacy fallback LS); reading groups show all RD question references; topic practice rows show PR or pending DR. These lists support reference search. Draft and custom wordbook lists also show their references.
- Word / grammar detail: below the detail heading, above display controls.
- Practice: above the question heading, with PR for saved practice and QU for question.
- Review: the same references when available from saved question metadata.
- Reading: each question; listening: question heading; draft: detail heading.
- MCP inline practice card: practice and question references.

Web references have an accessible copy button and success/failure feedback.
List navigation numbers such as `3 / 20` remain positional, never public references.
Built-in samples, local file-based mock exams, and static dialogue/opinion content
continue to use their existing resource IDs; they are not owned SQLite records.

## MCP and REST

`resolve_reference({reference: 'QU-000123'})` returns entity, internal ID, parent
practice ID (where applicable), and the next lookup tool/arguments. Owner isolation
is enforced before resolution, including snapshots. An inaccessible/deleted record
is reported as not found.

`jlpt_query` includes `reference` by default for items, questions and practices, and
supports exact filtering on it. `jlpt_get` metadata also includes it. Existing write
tools still use internal IDs: resolve first, then call the existing tool.

`get_reference_question` reads browser drill snapshots and hides answer/explanation
until an answer exists for that user's original question ID.
`get_reference_metadata` reads explicitly projected supporting-record metadata.

REST: `GET /api/references/resolve?reference=...`, authenticated;
`POST /api/references/question`, authenticated, validates and registers a browser
question snapshot. Normal JSON responses receive additive reference metadata.
