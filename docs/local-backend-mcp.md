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
- `GET /api/tts/providers` — list supported pronunciation providers and the credential fields each needs
- `GET /api/tts/credentials` — whether the user has configured a key per provider (never the key itself)
- `PUT /api/tts/credentials/:provider` — save/rotate that provider's key, encrypted at rest (`server/tts/`)
- `DELETE /api/tts/credentials/:provider`
- `POST /api/tts/speak` — `{ text, provider, voice? }`, returns synthesized audio bytes using the caller's own key
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
- `upsert_review_item`: create or update vocabulary, grammar, kanji-reading, meaning, kana-to-kanji, or other text-based practice seeds in SQLite. Before saving vocabulary, read `get_study_state.settings.jlptVocabularyQuestionKinds` (configured with checkboxes in Settings → Practice, default `[]`). Each selected kind requires at least one complete authored question in `practice_questions`: non-empty prompt, four distinct choices including the answer, `explanation_zh`, and `distractor_notes` for each wrong choice. Supported kinds are `kanji_to_kana` (漢字読み), `kana_to_kanji` (表記), `word_formation` (語形成), `moji_goi` (文脈規定), `meaning` (言い換え類義), and `usage` (用法). Missing selected kinds or incomplete questions are rejected before writing. An empty selection skips vocabulary question validation. Legacy enabled boolean settings migrate to all six types; an explicit empty array overrides that boolean. The server uses the authenticated owner’s saved setting; item arguments cannot override it.
- `delete_review_item`: permanently delete one owned review item, along with its progress, answer history and now-unused images.
- `export_review_data_backup`: export SQLite review items into monthly JSON backup files.
- `get_study_record`: read the combined personal study record.
- `get_study_plan`: read the current profile, generated tasks, completion state, and automatic daily summaries.
- `get_plan_generation_context`: read the basic profile together with weak points, recent attempts, current tasks, and automatic daily summaries.
- `save_generated_study_plan`: write a validated daily calendar plan. Task dates must stay within the study period, IDs must be unique, and each day's total must stay within the saved time limit.
- `list_due_reviews`: find items that need review.
- `list_listening_questions`: read personal listening prompts, choices, answers, explanations, and audio metadata without returning audio bytes.
- `get_listening_audio({ question_id })`: return one owned listening question's uploaded audio as an MCP `audio` content block (`data` is Base64 with its `mimeType`). Requires the optional `audio:read` OAuth scope; the default `study` scope and `library:write` do not grant audio access. Audio is limited to 25 MB. Use a question ID from `list_listening_questions` or resolve an LS reference first. Local stdio grants this scope to its already authenticated local session.
- `list_listening_recordings({ question_id })`: list all saved learner recordings and their analysis status for one question; use a returned recording ID with `get_listening_recording_audio({ recording_id })` to read the actual learner audio as MCP `audio` content. The audio tool requires `audio:read` and limits transfers to 25 MB. It returns audio bytes, not a transcript.
- `get_listening_recording_analysis_context({ recording_id })`: local-only analysis context with paths to both audio files and the saved reference transcript, when present. The learner transcript must be derived from the learner audio; write it into `save_listening_recording_analysis` as `analysis.transcript`. Use `analysis.referenceTranscript` for the verified reference text. The context call claims a pending recording for analysis.
- Hosted MCP can use `list_pending_listening_recordings`, `get_listening_recording_audio`, `get_listening_audio`, and `get_listening_transcript` to gather evidence without workstation paths; `save_listening_recording_analysis` writes the result back in both environments. Neither path performs automatic speech transcription: the analyzing agent must listen or use an audio transcription tool and distinguish its transcription from the saved reference text.
- `delete_listening_recording({ recording_id })`: permanently delete only that owned learner recording and its analysis. The listening question, reference audio, and other recordings remain.
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

Reading analysis is required for MCP writes. Create rejects missing/blank analysis; update validates the merged saved record, so a legacy question must be fully backfilled when updated. Existing incomplete records remain readable, and manual HTTP authoring still supports incomplete drafts.

- `passageTranslation`: nonblank full Chinese passage translation, not a summary. Translate all supplied paragraphs; preserve source omissions and flag uncertain transcription.
- `choiceExplanations`: exactly four entries in `choices` order, each with nonblank `text`, `translation`, `analysis`, `evidence`. `text` must match its choice. `errorType` must be empty for the correct answer and nonblank for all distractors. Translate and analyze every choice in Chinese. Explain both supporting evidence and where distractors depart from it. When changing choices or the answer, update these entries together; clearing them is rejected.
- `readingAnalysis`: nonblank Chinese `summary` and `structure`, plus at least one `keySentences` entry. Each key sentence must occur in the passage (whitespace differences are ignored); fabricated quotes are rejected.
- `explanation`: nonblank overall explanation in Chinese, retained even when structured explanations are present.
- `explanationNodes`: at least one section with nonblank `title` and `body`, containing worked solving steps and concrete elimination techniques for this passage. Clearly title the reasoning/technique sections.
- Validation enforces presence, nonblank text, choice alignment, correct/distractor error types, and literal key-sentence provenance. It cannot automatically certify translation completeness, Chinese fluency, factual entailment, or pedagogical quality; the authoring agent must review these before saving. Failed writes leave the record unchanged.
- Existing `explanationNodes`, `translationLines` and `tags` remain supported.

Use `""`, `[]`, or `{ "summary": "", "structure": "", "keySentences": [] }` to clear the corresponding analysis field. Reading REST endpoints expose `GET /api/reading-questions`, `POST /api/reading-questions`, and owner-scoped `GET` / `PATCH /api/reading-questions/:id`. Local and Cloudflare SQLite schemas add these columns automatically without rewriting old questions.
- `analyze_weak_points`: summarize weak vocabulary, wrong-answer patterns, due items, and mastery.
- `generate_daily_review_pack`: create a personalized daily review-pack draft.
- `create_review_pack_draft`: save generated review-pack content as a draft for in-app preview.
- `list_review_pack_drafts`: list saved drafts.
- `get_review_pack_draft`: read a draft with user annotations.
- `update_review_pack_draft({ draft_id, title?, content? })`: update an owned draft in place. Supply at least one field. `content` is a complete replacement, so read the draft first and include all questions and fields to retain; omitted `title` or `content` is preserved. The draft ID, status, and annotations remain unchanged.
- `add_draft_annotation`: attach user feedback to a draft.
- `get_draft_revision_context`: read the draft, annotations, study record, and optimization prompt for the next agent revision.
- `get_draft_processing_context`: read an approved draft, unknown-word marks, pending captures, study record, and routing rules for agent-driven library updates.

The browser does not call an AI backend directly. Draft confirmation is the explicit user review step: it marks the draft as approved and copies an agent instruction. The agent must call `get_draft_processing_context`, route content by original question type, update the matching library, and report exactly what was changed. Vocabulary, grammar, kanji-reading, and other text-based practice seeds live in SQLite `review_items`; reading and listening questions live in their local question-bank tables. Audio bytes stay outside SQLite in local files.

### Reading word lookup and the AI queue

Reading passage detail and practice pages offer an opt-in segmentation switch. Click a token to query the loaded vocabulary (including saved conjugations); edit the query if a token boundary needs adjustment. Unknown words can be saved to the existing capture inbox with the reading reference/title and passage context. Enqueueing does not itself start an AI worker.

MCP consumers can process the same queue on HTTP and stdio:

1. Call `list_learning_captures` with `status: "inbox"`, optionally filtering `category` (`word`, `grammar`, `sentence`, `listening`, `reading`, `unsure`). Omitting status preserves the existing all-status listing.
2. Parse each entry with its context. For word/grammar, check existing items and use `upsert_review_item`, preserving the requested deck/wordbook and source. For reading, use the reading create/update tools. For listening, require genuine audio before creating a question. Classify sentence/unsure inputs before choosing a destination; leave ambiguous inputs pending.
3. After the result is successfully saved, call `update_learning_capture_status` with its `id` and `status: "processed"`. Failed writes stay in `inbox`; retry by checking for an already-saved result before writing again. `inbox` reopens an entry, and `archived` dismisses it. Both tools are scoped to the authenticated owner.

These are shared catalogue changes; hosted MCP receives them only after the cloud API is deployed.

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
# 修改已发布专项练习的解析

已确认并发布的专项练习保存在正式练习中。先通过 `list_daily_practices` 和
`get_daily_practice` 取得实际练习 ID、题目 ID，再调用
`update_practice_question_explanation`（需要 `library:write`）：

```json
{
  "practice_id": "<practice.id>",
  "question_id": "<practice.questions[n].id>",
  "patch": {
    "correctReason": "结合题干线索解释正确答案成立的原因。",
    "memoryPoint": "本题的记忆要点"
  }
}
```

可更新 `correctReason`、`memoryPoint`、`translationZh` 和 `choiceAnalysis`。
未提供的字段保留；`choiceAnalysis` 若提供，必须包含每个现有选项恰好一次，
每项为 `{ "choice": "原选项文本", "explanation": "具体解析" }`。
合并后的整题与所有选项解析必须完整；旧题缺失解析时，应在同次更新补齐。
题干、选项、正确答案、题目 ID、作答记录与来源草稿均保持不变。
返回更新后的完整练习。更新只作用于指定练习，不同步其他副本。

HTTP 使用 `PATCH /api/daily-practices/:practiceId/questions/:questionId/explanation`，
请求体直接为上述 `patch` 对象。尚未发布的已确认草稿仍使用
`update_review_pack_draft` 修改，再发布。

## User-designed mock exams

`模拟考试` is a neutral container for user-supplied content and schedules. It does not
collect news or choose a weekly plan. A user, assistant, or automation supplies the
questions and decides how to divide them into independently submitted `sessions`.
Dates and time limits are optional; there is no full-JLPT, seven-day, fixed topic,
question-count, or listening quota. This release supports choice questions with
2–10 options and optional reading passages, source links, audio, translations, and
per-choice explanations. It does not automatically grade free-text or spoken answers.

- `list_mock_exams`: owned catalogue, with session question counts.
- `get_mock_exam({ id })`: full owned content and `revision`.
- `create_mock_exam({ title, description?, level?, sessions })`: save a new exam.
- `update_mock_exam({ id, expectedRevision, title?, description?, level?, sessions? })`:
  preserve omitted fields; a supplied `sessions` array replaces the whole array.
  Read first and retain every part that should remain. Stale revisions fail.

Each session has `id`, `title`, `questions`, and optional `description`,
`scheduledDate` (`YYYY-MM-DD`), and `durationMinutes` (omit for untimed).
Each question has `id`, `prompt`, `choices`, `answerIndex` (zero-based), and
`explanation`; optional fields are `passage`, `choiceExplanations` (choice order),
`translation`, `sourceUrl`, `sourceLabel`, `type`, `audioUrl`, `transcript`, and
`scoringReady` (false excludes unfinished material from scoring).
IDs are stable within their containing exam/session. Saving is not human review.

The four MCP tools use shared local/Cloudflare storage and are not local-file tools.
Creation and updates require `library:write`. REST equivalents are authenticated
`GET/POST /api/mock-exams` and owner-scoped `GET/PATCH /api/mock-exams/:id`.
SQLite table `mock_exams` is created on first use, including on Durable Objects.
A cloud API deployment and client tool rediscovery are needed to expose new tools.

The old news UI is removed. Existing local news files are adapted into exam sessions
by date without modifying the personal knowledge corpus; old `#/news-cycle` bookmarks
redirect into `#/mock-exams`. File-based full mock exams remain available locally.
These compatibility sources are not silently copied into cloud storage.

Answers remain hidden until a session is submitted. Optional limits count elapsed
wall time and submit on expiry; untimed sessions do not impose a timer. Attempts are
stored per account/exam/session in the browser, not synced across devices. Question
edits invalidate that session's cached attempt rather than silently changing its score.


## Local UI with the hosted account

To preview local frontend changes against the hosted learning data, put
`JLPT_API_ORIGIN=https://jlpt.erzhiqian.cc` in the ignored `.env.local` file and run
`npm run dev:app`. Open `http://localhost:4220` and choose Google sign-in with the
same account used on the hosted site. Vite forwards `/api` and `/.well-known` to
that HTTPS origin; `/api/auth/config` supplies the existing Firebase configuration.
A local API process is not needed for this mode. Do not copy session tokens between sites.

Hosted and local API sessions use separate browser storage keys. A local dev token
is ignored in hosted API mode. This setting only affects the development server;
production builds continue to use their own same-origin API. Removing the setting
and restarting Vite restores the local API proxy. Requests that save answers or edit
content affect the real hosted account in this mode.

If Google reports `auth/unauthorized-domain`, the Firebase project's authorized
domains must include `localhost`; use that hostname instead of `127.0.0.1`.


### 每日练习来源与卡片复习事件

`settings.dailyPracticeSources` 保存 `answers`、`cardReviews`、`ratings`、`window`（`previous_day` / `last_hours`）、`hours`、`timeZone`、`runAt`。定时由用户自己的 AI 客户端执行；服务器不创建定时任务。

先读 `get_daily_practice_source_context`：窗口是 `[start,end)`，默认按用户时区的前一天或最近指定小时。可传 ISO 时间边界。卡片来源按窗口内任意符合评分的事件选中卡片，按卡片去重，只取其 `practice_questions`，没有现有题目则返回 `skippedCards`。调用 `generate_daily_practice` 时传同一 `start/end` 与 AI 准备的 `generated_questions`（纯卡片复习传空数组）；服务端附加原有卡片题目，以独立实例 ID 保存，不覆盖历史答案。

`card_reviews` 为独立事件表。Web/iOS 自评携带稳定 `reviewEventId` 与 `reviewedAt`；离线同步保留原时间。MCP `rate_review_card` 支持 `event_id`，重试请复用。事件与进度在同一事务保存。日报做题正确率只来自客观答案；卡片复习另报次数、去重卡片数与四种评分。旧累计进度不能回填独立事件。
