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
- **One relational model:** every surface (web, MCP, Cloudflare) uses the same v3 schema, with readable record codes such as `W12` or `QV15`.

## Quick start

Requirements: Node.js `22.13.0` or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:4220/>. The local API runs at <http://127.0.0.1:4221/> (change with `JLPT_WEB_PORT` / `JLPT_API_PORT`). Create a local username and password on the login screen; the account is stored on this machine.

Useful commands:

```bash
npm run build       # Build the frontend and MCP app
npm run lint        # Run ESLint
node --test tests/*.test.mjs server/*.test.mjs   # Local tests
npm run test:cloudflare                          # Durable Object integration tests
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

## Native Apple client

The first SwiftUI iPad/iPhone client lives in [`apple/`](apple/README.md), with Mac Catalyst support. Open `apple/JLPTMasterDeck.xcodeproj` to build. It connects to the same cloud backend and Firebase project as the website. A clearly labeled demo mode works without provider configuration; real Google/Apple login requires the Firebase iOS configuration and signing capabilities described in the [Apple client guide](apple/README.md).

See [Apple client architecture](docs/apple-client-architecture.md) for identity linking, data boundaries, and the deferred web QR sign-in design.

> The Apple client still uses the API from before schema v3 and does not work against a v3 backend yet. [docs/apple-v3-port.md](docs/apple-v3-port.md) lists every call that has to change.

## MCP and agent workflows

The repository includes two skills:

- `skills/jlpt-chat-review/` turns learner-provided notes into knowledge points and reviewed question groups through the MCP tools.
- `skills/jlpt-study-generator/` saves a general study plan and initial practice drafts when no personal notes are available.

Configure the project-scoped MCP server with:

```bash
npm run mcp:setup
```

Restart Codex after setup and confirm that `jlpt_review` is available. The HTTP MCP endpoint is protected by OAuth 2.1: authenticate through the app's consent flow before granting an agent access to personal study data. The MCP server does not expose a separate `login` tool.

A typical workflow is:

1. Capture a word, question, sentence, or difficulty in the web app.
2. Ask an agent to analyze the study record or generate a review draft through MCP.
3. Inspect and annotate the draft in the app.
4. Confirm the draft; new question groups are reviewed before they can be published as practice.
5. Practice, review the results, and update the next study tasks.

Everything an agent writes is stored as AI-written and unverified. It is not official JLPT material and should be checked before relying on it.

## Data and privacy boundaries

Personal data is stored locally under:

```text
.local/jlpt-v3.sqlite
.local/v3-media/<user-id>/
```

The v3 database (design: [docs/schema-v3-design.en.md](docs/schema-v3-design.en.md)) holds accounts, settings, wordbooks, knowledge points, the question bank, practice records, review schedules, drafts, plans, reports and the inbox. Images and audio stay outside SQLite and outside Git. An existing pre-v3 database (`.local/jlpt.sqlite`) is migrated into a new v3 file on first start; the old file is only read.

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
- `src/v3/` — web client for the v3 API; `src/domain/` — routing and shared question logic.
- `src/i18n/` — UI translations and localized copy.
- `server/` — local API, MCP server and MCP app integration; `server/v3/` holds the schema, repositories, MCP tools and the legacy migration.
- `cloudflare/` — Cloudflare Worker/API implementation and tests.
- `skills/` — Codex-compatible study workflows.
- `docs/` — design, backend, MCP, and deployment notes.

See [docs/ui-design-guidelines.md](docs/ui-design-guidelines.md) for the interface hierarchy and review checklist.

## License

Copyright © 2026 Itsuki. All rights reserved.

This repository is public for inspection and personal use. No open-source license has been granted yet.

Contact: [@itsuki_maer](https://x.com/itsuki_maer) · [jlpt@erzhiqian.cc](mailto:jlpt@erzhiqian.cc)
