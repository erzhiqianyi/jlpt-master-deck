# Local Backend And MCP Design

This branch moves the app from browser-only storage to a local backend.

## Storage Split

- SQLite is the primary store for vocabulary, grammar, question source material, examples, explanations, tags, and generated text practice content. `public/data/review-data/YYYY/MM.json` is kept as an export/import backup format.
- `.local/jlpt.sqlite` stores personal state: users, sessions, display settings, answers, review scheduling, mastery status, exam plans, and future private notes.
- `.local/listening-audio/<user-id>/` stores user-uploaded listening audio. Its question metadata and ownership stay in SQLite.
- Generated AI review packs should first be written as drafts. After the user confirms a draft, the app creates an MCP handoff context so an agent can route the material into the right library.
- Review-pack drafts, user annotations, unknown-word marks, revision context, and agent handoff context are stored in SQLite so a user can preview generated material, leave notes, and explicitly trigger the next agent pass.

This keeps public learning resources portable while private learning records remain local and ignored by Git.

## Local Auth

The first version uses local username/password accounts. A user can choose any username and password that match the local validation rules. Passwords are salted and hashed with `scrypt`; sessions use bearer tokens stored by the browser.

This is intended for localhost. The HTTP MCP surface uses OAuth 2.1 authorization and scoped access; local and Firebase-backed app sessions are used as the authenticated identity.

## HTTP API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me`
- `GET /api/review-data`
- `GET /api/study-state`
- `PUT /api/study-state/settings`
- `GET /api/study-plan`
- `PUT /api/study-plan/profile`
- `POST /api/study-plan/generated` — accepts `tasks` plus an optional structured `phases` array; omitting `phases` keeps the stored ones
- `PATCH /api/study-plan/tasks/:id`
- `POST /api/answers`
- `GET /api/study-record`
- `GET /api/analysis/weak-points`
- `GET /api/listening-questions`
- `POST /api/listening-questions`
- `GET /api/listening-questions/:id/audio`
- `DELETE /api/listening-questions/:id`
- `GET /api/drafts`
- `POST /api/drafts`
- `GET /api/drafts/:id`
- `POST /api/drafts/:id/annotations`
- `GET /api/drafts/:id/revision-context`
- `GET /api/drafts/:id/processing-context`
- `POST /api/drafts/:id/confirm`

All study data endpoints require `Authorization: Bearer <token>`.

Local development uses frontend port `5193` and backend port `8791` on this branch.

## MCP Tools

The HTTP MCP server is `server/mcp-app.mjs`. It uses the same JSON resources and SQLite state as the HTTP backend and exposes OAuth discovery, consent, and MCP routes under `/api/jlpt`.

Configure it as a project-scoped Codex MCP server with:

```bash
npm run mcp:setup
```

The setup script configures the project-scoped MCP connection. Restart Codex and use `/mcp` to confirm `jlpt_review` after setup, then complete the OAuth consent flow when the host requests access.

Implementation details:

- `server/mcp-app.mjs` is an OAuth 2.1-protected HTTP MCP server. It serves MCP, OAuth, and discovery routes and denies anonymous tool discovery.
- `server/storage.mjs` is shared by the HTTP API and MCP server, so both surfaces read the same SQLite libraries. Monthly JSON files are only used to seed or back up review items.
- Authentication is handled by the OAuth flow. The consent page uses the app's bearer session token, and both local and Firebase logins resolve to the same authenticated application identity.
- Generated review material is saved as a draft in SQLite. User annotations are attached to the draft, and `get_draft_revision_context` returns the draft, annotations, study record, and optimization prompt for the next agent pass.

Planned tool boundary:

- `get_review_data`: read review items from SQLite.
- `upsert_review_item`: create or update vocabulary, grammar, kanji-reading, meaning, kana-to-kanji, or other text-based practice seeds in SQLite.
- `delete_review_item`: permanently delete one owned review item, along with its progress, answer history and now-unused images.
- `export_review_data_backup`: export SQLite review items into monthly JSON backup files.
- `get_study_record`: read the combined personal study record.
- `get_study_plan`: read the current profile, generated tasks, completion state, and automatic daily summaries.
- `get_plan_generation_context`: read the basic profile together with weak points, recent attempts, current tasks, and automatic daily summaries.
- `save_generated_study_plan`: write a validated daily calendar plan. Task dates must stay within the study period, IDs must be unique, and each day's total must stay within the saved time limit.
- `list_due_reviews`: find items that need review.
- `list_listening_questions`: read personal listening prompts, choices, answers, explanations, and audio metadata without returning audio bytes.
- `create_listening_question`: write a local listening question only when real local audio bytes are available.
- `update_listening_question`: partially update an owned listening question's text fields (title, type, question, choices, answer, explanation) and/or move it to a new `libraryNumber` (题号) position, shifting intervening questions to keep numbers contiguous. Audio is unchanged.
- `edit_listening_question` / `patch_listening_question`: aliases of `update_listening_question`, with the same schema and ownership checks.
- `upsert_listening_question`: with `id`, partially update an existing owned question (missing/unowned IDs fail, never insert). Without `id`, create with required `question`, `choices`, `answerIndex`, `audioFileName`, `audioMime`, and real `audioBase64`. Audio fields are rejected on updates; `libraryNumber` requires an existing ID.
- `delete_listening_question`: permanently delete one owned listening question and its recordings; remove shared audio only after its last question is deleted.
- `list_reading_questions`: list the authenticated learner's reading questions, including saved analysis.
- `get_reading_question`: fetch a complete owned reading question by `id`.
- `create_reading_question`: create a reading question; accepts the structured explanation fields below.
- `update_reading_question`: partially update an owned question by `id`. Omitted fields are preserved; supplied arrays and `readingAnalysis` replace those fields completely.
- `delete_reading_question`: permanently delete one owned reading question.
- `delete_wordbook`: delete a custom wordbook. Refuses built-in wordbooks and any wordbook that still has items; move its items with `organize_review_item` first.

Reading analysis fields (optional; older questions continue to use `explanation`):

- `passageTranslation`: full passage translation, string.
- `choiceExplanations`: either `[]` or four entries in the same order as `choices`. Each entry contains string fields `text`, `translation`, `analysis`, `evidence`, `errorType`. `text` must match its choice; use an empty `errorType` for the correct choice. When changing choice text/order, also update or clear these explanations.
- `readingAnalysis`: `{ summary: string, structure: string, keySentences: string[] }`. Key sentences must quote the passage; explain the reasoning in `analysis`/`evidence`.
- `explanation`: the overall explanation, retained even when structured explanations are present.
- Existing `explanationNodes`, `translationLines` and `tags` remain supported.

Use `""`, `[]`, or `{ "summary": "", "structure": "", "keySentences": [] }` to clear the corresponding analysis field. Reading REST endpoints expose `GET /api/reading-questions`, `POST /api/reading-questions`, and owner-scoped `GET` / `PATCH /api/reading-questions/:id`. Local and Cloudflare SQLite schemas add these columns automatically without rewriting old questions.
- `analyze_weak_points`: summarize weak vocabulary, wrong-answer patterns, due items, and mastery.
- `generate_daily_review_pack`: create a personalized daily review-pack draft.
- `create_review_pack_draft`: save generated review-pack content as a draft for in-app preview.
- `list_review_pack_drafts`: list saved drafts.
- `get_review_pack_draft`: read a draft with user annotations.
- `add_draft_annotation`: attach user feedback to a draft.
- `get_draft_revision_context`: read the draft, annotations, study record, and optimization prompt for the next agent revision.
- `get_draft_processing_context`: read an approved draft, unknown-word marks, pending captures, study record, and routing rules for agent-driven library updates.

The browser does not call an AI backend directly. Draft confirmation is the explicit user review step: it marks the draft as approved and copies an agent instruction. The agent must call `get_draft_processing_context`, route content by original question type, update the matching library, and report exactly what was changed. Vocabulary, grammar, kanji-reading, and other text-based practice seeds live in SQLite `review_items`; reading and listening questions live in their local question-bank tables. Audio bytes stay outside SQLite in local files.

## MCP write and deletion permissions

Listening create/update/edit/patch/upsert and all seven deletion tools require OAuth `library:write`: `delete_review_item`, `delete_listening_question`, `delete_reading_question`, `delete_wordbook`, `delete_review_pack_draft`, `delete_listening_recording`, and `delete_daily_practice`. A `study`-only grant cannot discover or call these tools. Existing clients with only `study` must authorize `library:write` before using them. Local stdio already supplies both scopes.

Deletion is always restricted to the authenticated owner; an input cannot select another user. All deletion tools declare `destructiveHint: true`. Built-in wordbooks and non-empty custom wordbooks cannot be deleted. Review-item deletion also removes that user's item progress and answers, and unused images. Draft and reading deletion remove the owned record. There are no standalone MCP deletion tools for answer history, study plans, or learning captures.

Listening basic-training questions accept empty `choices` with `answerIndex: -1`; other choice/answer combinations remain subject to storage validation. Updates preserve audio.

### Independent recording and daily-practice deletion

- `delete_listening_recording({ recording_id })`: removes one owned recording, its stored audio and its analysis (including pending/analyzing recordings). Missing audio files do not prevent metadata cleanup. The listening question, reference audio and sibling recordings remain.
- `delete_daily_practice({ practice_id })`: removes one owned practice, its matching attempt history and active attempt, and answers for its questions unless another owned practice still uses those question IDs. These database changes are transactional. Source drafts, vocabulary items, cumulative mastery and other practices remain. Legacy daily-practice attempts without a practice ID are removed only if all their question IDs belong to the deleted practice.

Both return `{ "ok": true }` on success and report not found for unknown or unowned IDs. Both require `library:write` and carry `destructiveHint: true`. The independent entries are MCP tools; this change does not add browser buttons or REST routes.

### Review-card MCP App resource

`resources/list` now includes `ui://jlpt/review-cards.html` (`jlpt-review-cards`, `text/html;profile=mcp-app`) alongside the practice view. The read-only `get_review_cards` tool links to it with `_meta.ui.resourceUri` and returns owned cards in `structuredContent`.

Inputs: optional `deck`, `wordbook_id`, `only_due` (default true), `limit` (1–50, default 20), and `offset` (default 0). Results include `cards`, `total`, `next_offset`, `filters` and locale. Each card contains the saved front/back text fields. Never-reviewed items count as due. Private media paths and images are excluded; the widget requires no external network resources.

The vanilla MCP App supports reveal/hide, previous/next card and previous/next page. It can load due cards when opened directly by an MCP Apps host, or render the originating tool result. It does not record a memory rating or change mastery. Build both views with `npm run build:mcp-app`; the Cloudflare bundler embeds both HTML documents. Restart the backend and refresh client discovery to see newly registered resources.

Protocol reference: [OpenAI MCP Apps UI documentation](https://developers.openai.com/plugins/build/chatgpt-ui).
