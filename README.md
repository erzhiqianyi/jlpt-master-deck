# JLPT Master Deck

JLPT Master Deck is a local-first study workspace for turning JLPT questions, mistakes, unclear words, grammar notes, reading passages, and listening difficulties into a review loop that can actually be followed.

The default documentation language is English. See the [Japanese README](README.ja.md) for the Japanese version.

![JLPT Master Deck](public/promotions/jlpt-review-hero.png)

## What it does

- Captures vocabulary, grammar, sentences, reading passages, and listening material in one inbox.
- Builds daily review tasks from a learner's plan, attempts, accuracy, and weak points.
- Supports vocabulary, grammar, reading, listening, mixed practice, dialogue, opinion, and mock-exam workflows.
- Gives immediate answer checking with context, explanations, distractor analysis, memory points, and optional furigana.
- Tracks mistakes, history, completion, accuracy, elapsed study time, and review intervals.
- Provides an editable JLPT question-type guide based on the official N1 categories.
- Supports local listening audio, personal notes, draft review packs, and multilingual learner-facing content.
- Integrates with MCP/agent workflows for capturing study material, generating drafts, analyzing weak points, and revising study plans.

## Design principles

- **Local first:** personal accounts, progress, captures, drafts, plans, and review scheduling live in local SQLite.
- **Review before automation:** AI-generated material is visibly marked as generated and unverified until the learner checks it.
- **Progressive disclosure:** overview pages stay compact; explanations, editing, history, and complex actions live in focused detail views.
- **Portable content:** public seed data can be updated without overwriting a learner's private progress.

## Quick start

Requirements: Node.js `22.13.0` or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:5193/>. The local API runs at <http://localhost:8791/>. Create a local username and password on the login screen; the account is stored on this machine.

Useful commands:

```bash
npm run build       # Build the frontend and MCP app
npm run lint        # Run ESLint
npm run data:blank  # Replace the example deck with an empty local data set
npm run dev:tunnel  # Optional Cloudflare Tunnel preview
```

## Main routes

The app uses hash routing, so these routes also work on static hosting:

```text
/#/home
/#/capture
/#/plan
/#/vocabulary/questions
/#/grammar/questions
/#/reading/samples/reading-short-01
/#/listening/samples/listening-quick-01
/#/history
/#/insights
/#/about
/#/settings
```

## MCP and agent workflows

The repository includes two skills:

- `skills/jlpt-chat-review/` converts learner-provided notes into structured review items and draft packs.
- `skills/jlpt-study-generator/` creates a general study plan and initial practice content when no personal notes are available.

Configure the project-scoped MCP server with:

```bash
npm run mcp:setup
```

Restart Codex after setup and confirm that `jlpt_review` is available. MCP tools use the same local account as the web app, so authenticate before reading or writing personal study data.

A typical workflow is:

1. Capture a word, question, sentence, or difficulty in the web app.
2. Ask an agent to analyze the study record or generate a review draft through MCP.
3. Inspect and annotate the draft in the app.
4. Confirm the draft and let the agent write approved items to the appropriate library.
5. Practice, review the results, and update the next study tasks.

Generated content is marked with `content_origin: "ai_generated"` and `verification_status: "unverified"`. It is not official JLPT material and should be checked before relying on it.

## Data and privacy boundaries

Example or public seed content is stored under:

```text
public/data/review-data/YYYY/MM.json
```

Personal data is stored locally under:

```text
.local/jlpt.sqlite
.local/listening-audio/<user-id>/
```

SQLite stores accounts, captures, review items, attempts, plans, drafts, settings, and scheduling. Monthly JSON is an import/export backup format; it is not the source of personal progress. Listening audio remains outside Git, while question metadata is stored in SQLite.

Review scheduling follows a simplified Anki/SM-2-style interval: correct answers lengthen the interval, while incorrect answers return an item to near-term review and reduce its ease factor.

See [docs/local-backend-mcp.md](docs/local-backend-mcp.md) for the API, authentication, storage, and MCP details.

## Cloudflare Pages

For a static deployment:

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- Node.js: `22.13.0` or newer

The repository also contains Cloudflare Worker/API configuration and deployment scripts. See [docs/cloudflare-pages-deploy.md](docs/cloudflare-pages-deploy.md) before deploying. Do not treat a local build, a tunnel preview, and a production deployment as the same verification boundary.

## Project structure

- `src/features/` — learner-facing pages and workflows.
- `src/domain/` — review, question, memory, and study-plan logic.
- `src/i18n/` — UI translations and localized copy.
- `server/` — local API, storage, MCP server, and MCP app integration.
- `cloudflare/` — Cloudflare Worker/API implementation and tests.
- `skills/` — Codex-compatible study workflows.
- `docs/` — design, backend, MCP, and deployment notes.

See [docs/ui-design-guidelines.md](docs/ui-design-guidelines.md) for the interface hierarchy and review checklist.

## License

Copyright © 2026 Itsuki. All rights reserved.

This repository is public for inspection and personal use. No open-source license has been granted yet.

Contact: [@itsuki_maer](https://x.com/itsuki_maer) · [jlpt@erzhiqian.cc](mailto:jlpt@erzhiqian.cc)
