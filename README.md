# JLPT Master Deck

你要的不只是“做题”，而是每天知道自己该复习什么。  
JLPT Master Deck 会把错题、不会的词、文法疑问、阅读和听力难点整理成可执行的今日任务，让复习从“凭感觉刷题”变成“看得见进步”。

![JLPT Master Deck 海报](public/promotions/jlpt-review-hero.png)

## 面向 JLPT 学习者的宣传文案

### 首页主标题

每天知道该复习什么，错题不再白做。

### 首页副标题

把不会的词、文法和阅读听力问题，变成今天能完成的复习任务。

### 首页三大功能

- **今日任务**：打开首页就知道今天先做什么。  
- **错题沉淀**：不会的题和句子不会散落在聊天记录、截图或笔记里。  
- **复盘进度**：做完不只看对错，还能看到薄弱项和下一步安排。

### CTA

开始今日复习。

## 项目特点

- 数据本地优先：公开题库资源可更新（JSON），个人账号、历史、进度、草稿、生成记录都保存在本机 SQLite（`.local/jlpt.sqlite`）。  
- 学习闭环清晰：`捕获` -> `任务生成` -> `复习` -> `复盘` -> `计划更新`。  
- 可解释反馈：每题可给出完整解释、错误原因分析和记忆点，支持日常复习迭代。  
- 支持多模式复习：按词汇/文法/听力/阅读模块练习，支持混合复习与问答日历。  
- 强化本地化：多语言界面与解释文案可独立配置，支持 JLPT 学习场景常见的日中双语表达。  
- 可扩展任务链：既支持直接在站内操作，也支持通过 MCP/Agent 生成草稿、修订题目并回写到本地库。  

## 项目能做到的事情

- 统一采集学习输入：词汇、句子、文法、听力文本、阅读片段都可入库，形成 `学习捕获`。  
- 自动生成复习材料：把待处理输入转成结构化题目/项，支持 JSONL 或 SQLite 库的导入策略。  
- 个性化安排：根据做题记录生成日历式任务与短期复习计划，支持偏差修正（错题强化、标记未知词等）。  
- 复习与纠错：模块内练习与混合练习都能即时给出判断，并记录复习间隔（简化 Anki/SM-2）。  
- 历史和数据面板：查看当日任务、完成率、正确率、耗时、题型分布和薄弱点。  
- 草稿驱动优化：生成复习草稿后可人工批注，再次提交让 Agent/Model 迭代为更贴合当前学习节奏的版本。  
- 多入口使用：可直接在网页操作，也可交给 Agent 自动化处理；适合作为个人学习知识库的主工作流。  

## MCP 技能与可直接使用的提示词

仓库内内置的 Agent 技能：

- `skills/jlpt-chat-review/`：从用户学习素材生成/修订 review items（词汇、文法、阅读、听力）以及题目草稿。
- `skills/jlpt-study-generator/`：无原始素材时生成阶段化学习计划和首周内容。

建议直接复制到自己的 Agent 使用：

```text
角色：你是 JLPT 学习助理，请严格按项目约定生成 review_items。
任务：读取我给的材料，把它转成 JLPT 复习用条目并标注 category / meaning_ja / reading / ruby_terms / options / explanation。
约束：
1) 保留我给出的原文，不要改写成“看起来像官方答案”的语气。
2) 给出日语解释+中文解释，保留错误选项的干扰点理由。
3) 标注 source 与 content_origin，并把不可确认内容设为 unverified。
4) 生成后输出可直接落库的 JSONL。
```

```text
角色：你是学习教练，基于用户当前学习记录和错题，输出 7 天复习计划。
任务：读取我的学习记录，输出可执行的每日任务（模块/题数/重点），并给出调整建议。
要求：
1) 覆盖目标日期范围内的计划与备选题量。
2) 指出薄弱题型与优先补救顺序。
3) 输出可直接提交给 jlpt_review MCP 的任务清单。
```

```text
如果你已连接本地 MCP，请直接调用以下能力完成数据流：
- 登录后调用 get_study_record 读取我近况
- 用 analyze_weak_points 生成薄弱分析
- 用 requestReview 生成复习草稿
- 用 reviewProcessingNotice 提示我异步生成结果位置
```

使用现有 Web + MCP 流程的主循环是：

1. 在网页里记录或导入内容 -> 形成学习捕获
2. 调 `jlpt_review` MCP 生成/更新草稿
3. 在草稿页确认后回写 SQLite 本地库
4. 继续按任务页和复习页完成练习
5. 每次练习后由 MCP 重新分析并优化下一阶段计划

## Features

- A focused capture inbox for unclear words, grammar, sentences, listening, and reading material.
- Direct navigation to Home, Vocabulary, Grammar, Listening, Reading, Mixed Practice, and Data Management for quick study access.
- A focused capture inbox reached from the home page, while metrics, captured-input management, and practice history share one Data Management workspace.
- Vocabulary decks for JLPT words, expressions, and Japanese name readings.
- Module navigation for vocabulary, grammar, listening, reading, and mixed practice.
- Personal listening practice with local audio uploads, four-choice questions, answer checking, and optional explanations.
- Shareable hash routes for each module, question page, word page, About page, and Settings page; browser back and forward navigation work on static hosting.
- A quiet review home with due-work status and a compact exam-date reminder.
- A per-account JLPT planning profile with Shin Kanzen Master N1 Grammar, Reading, and Listening as editable defaults. MCP agents turn the profile and recent study evidence into trackable daily calendar tasks.
- Automatic daily summaries combine calendar completion with practice attempts, accuracy, and elapsed study time; missed work marks the plan for agent revision.
- An N1 question-type guide based on the official JLPT categories, covering vocabulary, grammar, reading, and listening with editable personal solving tips.
- A compact home-page preview links to the question-type index; every type has an independent detail route where its full guidance and personal tip can be read or edited.
- Original N1-format samples for grammar, reading, and listening. Each module has a compact sample index and an independent exercise route; sample answers are deliberately excluded from personal progress.
- Level-appropriate, official-style practice for `文脈規定`, `言い換え類義`, `表記`, `漢字読み`, and `文の文法1`, with Japanese instructions and numbered choices.
- Immediate correct/incorrect judging.
- Structured explanations after each answer: full context, why the answer is correct, per-choice distractor analysis, and a memory point with useful comparisons.
- A focused reading page with an in-page furigana switch, Japanese definitions, learner-language definitions, exam quick notes, collocations, and analysis. Questions and answer choices stay unannotated.
- Multilingual UI and multilingual data support through `localizations`.
- Local username/password accounts backed by SQLite.
- Local-only progress stored in `.local/jlpt.sqlite`.
- Review-pack drafts with in-app preview, user annotations, and revision context for MCP/agent optimization.
- A second skill for generating a general study plan and original practice content without learner-provided notes.
- Visible `AI generated` and `unverified` notices for generated entries that require learner review.
- MCP tools for reading and creating learning captures, plus personalized analysis and review-pack generation.

## Local Setup

```bash
npm install
npm run dev
```

`npm run dev` starts both the local backend and the Vite app. Open:

```text
http://localhost:5193/
```

The backend runs on:

```text
http://localhost:8791/
```

Create any local username and password from the login screen. The account is local to this machine.

Build the frontend:

```bash
npm run build
```

The production output is written to `dist`.

## Project MCP Setup

Configure the local MCP server for this Codex project with one command:

```bash
npm run mcp:setup
```

The command verifies `server/mcp-server.mjs`, then writes the `jlpt_review` server configuration to the project-scoped `.codex/config.toml`. It derives `cwd` from the current checkout, preserves other project settings, and keeps the generated absolute path out of Git.

Restart Codex after setup, trust the project if prompted, and use `/mcp` to confirm that `jlpt_review` is available. The MCP tools use the same local account as the web app, so call `login` before tools that read personal study data.

## Frontend Structure

- `src/App.tsx` owns application routing, authenticated session state, and page composition.
- `src/features/` contains page-level modules for home, question types, planning, listening, practice, drafts, settings, and the About/MCP guide.
- `src/domain/` contains reusable JLPT item, question-generation, and calendar helpers.
- `src/i18n/` contains multilingual UI copy, while `src/data/` contains static supporting data.
- `src/lib/` contains infrastructure helpers such as the authenticated API client.
- `src/types.ts` defines the shared frontend domain contracts.

## UI Design Principles

Overview pages are for scanning and navigation. Cards and list rows should contain a title, compact status or count, a short summary, and a route to deeper content. Complete explanations, editing, annotations, history, and complex actions belong on an independent detail page or focused workflow.

Do not solve information density by adding more cards. Prefer page sections, dividers, typography, and row lists; do not nest cards or use a large decorative card to wrap an entire page. When a page has more than four similar information-heavy items, or more than three substantial content sections, review whether it should be split into an index and detail route.

See [docs/ui-design-guidelines.md](docs/ui-design-guidelines.md) for the complete page hierarchy, card usage, responsive behavior, routing, and review checklist.

Main pages have independent hash addresses, for example:

```text
/#/capture
/#/home
/#/history
/#/insights
/#/plan
/#/question-types
/#/vocabulary/questions
/#/vocabulary/words
/#/grammar/questions
/#/grammar/samples
/#/reading/samples/reading-short-01
/#/listening/samples/listening-quick-01
/#/about
/#/settings
```

## Start With Your Own Data

This repository includes an example deck. To use the included sample content, keep the monthly files under `public/data/review-data/` as-is and run:

```bash
npm install
npm run dev
```

To start from an empty deck without the sample content, run:

```bash
npm run data:blank
npm run dev
```

Then use Codex or Claude Code to add your own study items through the local backend or MCP. Vocabulary, grammar, and other text-based review items are stored in SQLite; monthly JSON files under `public/data/review-data/YYYY/MM.json` are export/import backups. Personal answers and progress are stored separately in SQLite.

## Local Tunnel Preview

For a fixed local port:

```bash
npm run dev
```

The app runs on:

```text
http://localhost:5193/
```

If you have Cloudflare Tunnel configured for this host, use:

```bash
npm run dev:tunnel
```

This starts the Vite dev server on port `5193` and runs:

```bash
cloudflared tunnel --config ~/.cloudflared/config.yml run satori-local
```

In this local setup, the tunnel hostname is:

```text
https://jlpt-local.erzhiqian.cc
```

## Data Model

The backend reads seed resource content from:

```text
public/data/review-data/YYYY/MM.json
```

User progress is not written back to this file. It stays in local SQLite:

```text
.local/jlpt.sqlite
```

The same database stores `learning_captures`, the learner's inbox of unclear material. Each record has a category, optional context, an `inbox` / `processed` / `archived` status, and timestamps. Authenticated clients can use `GET /api/captures`, `POST /api/captures`, and `PATCH /api/captures/:id`; MCP clients use `list_learning_captures` and `create_learning_capture`.

The exam-planning document also stays in SQLite. Its `profile` records the target, dates, availability, materials, current position, and constraints. MCP writes validated daily `tasks`; task completion and practice attempts are combined into `dailySummaries` whenever the plan is read.

Uploaded listening audio stays outside Git in a per-user directory:

```text
.local/listening-audio/<user-id>/
```

The question, choices, correct answer, explanation, and audio metadata are stored in SQLite. Authenticated HTTP requests stream the audio to the browser; MCP can read the question metadata without receiving the binary audio.

This means a new deployment can update the vocabulary data without deleting each user's local review progress.

Japanese text that contains kanji should include kana support through `reading` and `ruby_terms`. Each item should also include `meaning_ja` for its Japanese dictionary-style definition. The reading page has a direct furigana switch, while answer explanations keep their separate setting.

For multilingual decks, keep Japanese source fields stable and add learner-facing translations under `localizations`, for example `en.meaning`, `ja.core_memory`, or `ko.analysis`.

Each item should include an input timestamp:

```json
{
  "id": "2026-08-27-001",
  "date": "2026-08-27",
  "input_at": "2026-08-27T20:20:00+09:00"
}
```

Per-user review scheduling is stored in SQLite, not in the public seed data. For each item, the app records:

```json
{
  "firstSeenAt": "2026-08-27T20:20:00.000Z",
  "lastReviewedAt": "2026-08-27T20:25:00.000Z",
  "reviewCount": 2,
  "ease": 2.8,
  "intervalDays": 3,
  "nextReviewAt": "2026-08-30T20:25:00.000Z"
}
```

The review interval follows a simplified Anki/SM-2 style schedule:

- First correct review: next day.
- Second correct review: after 3 days.
- Later correct reviews: previous interval multiplied by the item's ease factor.
- Wrong review: next day again, with a lower ease factor.

This keeps the repository data shareable while each learner's forgetting-curve schedule stays private on their own machine.

See [docs/local-backend-mcp.md](docs/local-backend-mcp.md) for the backend and MCP design.

## Question-Type Guide

The home page contains only a compact preview of the official N1 categories. The question-type index uses concise rows for scanning; each row opens an independent detail route containing the full format description and app-provided solving tip. These tips are study suggestions, not official JLPT guidance.

You can replace any default tip with your own notes. Personal overrides are stored in the current account's `user_settings.settings_json` record in `.local/jlpt.sqlite`; clearing an override restores the app default.

## Draft Review Packs

Open `草稿` / `Drafts` to preview review packs generated by the backend or MCP. A draft can collect user annotations such as "reduce question count", "make explanations more detailed", or "replace unnatural examples". After a draft looks right, confirm it and optionally mark unknown words; the app copies a Codex/MCP instruction instead of calling AI from the browser.

The revision context endpoint combines the draft, annotations, study record, and an optimization prompt:

```text
GET /api/drafts/:id/revision-context
```

MCP clients can use `get_draft_revision_context` to read the same context and generate the next draft revision without directly changing the monthly resource files.

Confirmed drafts use a separate processing context:

```text
POST /api/drafts/:id/confirm
GET /api/drafts/:id/processing-context
```

The copied instruction tells the agent to call `get_draft_processing_context`, reread the approved draft, pending captures, study record, unknown-word marks, and routing rules, then place the result into the matching library. Vocabulary, grammar, kanji-reading, and other text-based practice seeds go into SQLite `review_items` through MCP; reading and listening questions go into the local question banks. Audio bytes stay as local files. If the new material changes the study load, the agent should update future plan tasks through `save_generated_study_plan`.

## Using Codex

Install or copy the two included skills from:

```text
skills/jlpt-chat-review/
skills/jlpt-study-generator/
```

If you use Codex with local skills, copy it into your Codex skills directory:

```bash
mkdir -p ~/.codex/skills
cp -R skills/jlpt-chat-review ~/.codex/skills/
cp -R skills/jlpt-study-generator ~/.codex/skills/
```

Then chat naturally with Codex:

```text
$jlpt-chat-review
整理下面这些 JLPT 学习内容，生成适合本项目 SQLite review_items 结构的复习项目。
输出语言：zh-CN, ja, en。
```

Paste your notes, vocabulary explanations, sentences, or JLPT-style questions. Ask Codex to update the local SQLite library through MCP or the backend, then run:

```bash
npm run build
```

After practicing in the app, connect the local MCP server and ask Codex to read the authenticated study record directly:

```text
请使用 jlpt_review MCP 登录我的本地账号，调用 get_study_record 分析弱点，
安排未来 7 天复习计划，并把基于错题生成的内容保存为复习草稿。
```

See [docs/local-backend-mcp.md](docs/local-backend-mcp.md) for authentication, tool details, and a Codex configuration example.

## Generate A Plan Without Your Own Notes

Use `jlpt-study-generator` when you want AI to create a general curriculum and study material from scratch. Provide:

- Target level, such as `N1`.
- Approximate number of study days.
- Daily available time.
- Focus modules: vocabulary, grammar, listening, reading, or mixed.
- Output languages.

Example:

```text
$jlpt-study-generator
目标 N1，距离考试还有 100 天，每天 45 分钟。
重点练习单词和阅读，输出简体中文和英语。
请生成完整阶段计划和前 7 天的学习内容，并把可用的单词、语法条目合并到网站数据。
```

The skill creates a full-duration outline and generates only the first seven days of detailed content by default. This keeps later batches adjustable instead of locking the whole course before any progress data exists.

AI-generated material is deliberately marked with:

```json
{
  "content_origin": "ai_generated",
  "verification_status": "unverified",
  "level_confidence": "medium"
}
```

It is not official JLPT material. The learner must verify readings, meanings, answer keys, distractors, and JLPT-level assignments. The website displays a warning on generated entries until they are explicitly verified.

## Using Claude Code

Claude Code does not need the Codex skill system. Use the same instructions manually:

1. Open this repository in Claude Code.
2. For your own notes, tell Claude Code to read `skills/jlpt-chat-review/SKILL.md`.
3. For a general plan without notes, tell it to read `skills/jlpt-study-generator/SKILL.md`.
4. Give it the relevant notes, or just your target level, days, daily time, and focus modules.
5. Ask it to update the local SQLite library when you want generated vocabulary or grammar imported. Use JSON only when you explicitly want an export or backup file.
6. Run `npm run build`.

Example prompt:

```text
Read skills/jlpt-chat-review/SKILL.md and use it as the data extraction guide.
Convert the following JLPT vocabulary notes into review items and write them to the local SQLite library. Keep monthly JSON as an export or backup format only.
Do not include raw private chat transcripts. Keep only structured study records and explanations.
```

## Cloudflare Pages

Use Cloudflare Pages with GitHub integration:

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: leave empty or use `/`
- Node version: `22.13.0` or newer

Cloudflare Pages will rebuild automatically after each push to the configured branch.

See [docs/cloudflare-pages-deploy.md](docs/cloudflare-pages-deploy.md) for the step-by-step deployment notes.

## Repository Name

The repository name is:

```text
jlpt-master-deck
```

It describes the project more clearly than `JLPT`: this is a JLPT-focused deck and review tool, not a general JLPT repository.

## Copyright

Copyright © 2026 Itsuki. All rights reserved.

This repository is public so others can inspect the approach and build their own personal learning tool. No open-source license has been granted yet. Add a `LICENSE` file if you want to allow reuse, modification, or redistribution under a specific license.

Contact:

- X: [@itsuki_maer](https://x.com/itsuki_maer)
- Email: [jlpt@erzhiqian.cc](mailto:jlpt@erzhiqian.cc)
