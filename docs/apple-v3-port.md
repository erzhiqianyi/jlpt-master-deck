# iOS 客户端迁移到 v3（第 5 段阶的待办）

服务端、Web、MCP、浏览器扩展、Cloudflare 都已改为 v3。iOS 客户端（`apple/`）还在调用旧接口，**这些接口在 v3 服务端已经删除**，部署 v3 后 iOS 的同步、练习、复习、收集箱、计划、发现都会失败（只有登录、AI 连接、朗读还可用）。

这份文档逐项列出要改的地方。Swift 代码需要在有 Xcode 的环境里修改和编译；本仓库的 CI 与云端开发环境不能编译 iOS。

## 已就绪的服务端能力

| 用途 | v3 接口 | 说明 |
|---|---|---|
| 离线缓存（全量） | `GET /api/v3/sync?limit=100&cursor=…&language=…` | 记录依次为 `settings`、`wordbooks`、`plan`、`inbox`（各一条）和 `knowledge`、`questionGroups`、`practiceSets`（每条一个编号）。从不带 cursor 开始，读到 `nextCursor` 为 null；**读完后用这次的内容整体替换本地缓存**（删掉的记录随之消失）。分页按 rid 前进，期间新增的记录不会让前面的页错位。测试：`tests/v3-sync.test.mjs`，Cloudflare 上的分页见 `cloudflare/runtime.test.mjs` |
| 设置 | `GET` / `PATCH /api/v3/settings` | 只改给出的键 |
| 记忆卡自评 | `POST /api/v3/cards/ratings` `{code, rating, eventId, source:"ios"}` | `rating`：forgot / hard / remembered / easy。同一 `eventId` 重复提交只算一次（返回 `duplicate: true`），可以放进离线队列重放 |
| 到期卡片 | `GET /api/v3/cards/due` | 离线时也可以用缓存里知识点的 `review.dueAt` 自己算 |
| 练习 | `POST /api/v3/attempts` → `POST /api/v3/attempts/{AT}/answers` `{question, selectedOptionId \| answerText, eventId, startedAt, elapsedMs, source:"ios"}` → `POST …/complete` | 作答按 `eventId` 去重；选择题提交**选项 id**（不是位置） |
| 练习记录、错题、统计 | `GET /api/v3/attempts`、`/api/v3/mistakes`、`/api/v3/stats`、`/api/v3/reports/{date}` | |
| 计划 | `GET /api/v3/plan`、`PUT /api/v3/plan/profile`、`POST /api/v3/plan/tasks/{TK}` | |
| 收集箱 | `GET /api/v3/inbox?status=inbox&limit=…&cursor=…`、`GET /api/v3/inbox/count`、`POST /api/v3/inbox` | |
| 草稿 | `GET /api/v3/drafts`、`/api/v3/drafts/{DR}`、`…/comments`、`…/status`、`…/publish` | |
| 发现（分享） | `GET /api/v3/market[?mine=1]`、`GET /api/v3/market/{id}`、`POST /api/v3/market/{id}/import`、`POST /api/v3/market`、`DELETE /api/v3/market/{id}` | 撤回的分享导入返回 409 |
| 图片、音频 | `GET /api/v3/media/{mediaId}` | 知识点记忆图、题目音频、素材都用 `mediaId` |
| 不变 | `/api/auth/*`、`/api/me`、`/api/agents`、`/api/tts/*`、`/api/jlpt/mcp` | |

## 逐个替换

| 现在的调用 | 位置 | 改为 |
|---|---|---|
| `POST api/sync`（分页同步） | `LocalStudyData.swift:318`、`DatabaseCheckView.swift:249` | `GET /api/v3/sync`。`StudySyncChange`/`StudySyncPage` 改为 `{collection, code, value}` / `{records, nextCursor, startedAt}` |
| `GET api/sync/status` | `DatabaseCheckView.swift:138` | 删除；数据库检查改为比较 `sync` 读到的各类记录数与本地缓存 |
| `GET/PUT api/study-state/settings` | `AppStore.swift:264,271`、`SupportingViews.swift:1019,1426` | `GET` / `PATCH /api/v3/settings`（字段名见 `src/v3/types.ts` 的 `V3Settings`） |
| `PUT api/study-state/practice` | `AppStore.swift:414` | 删除。练习记录由服务器按作答保存 |
| `GET api/answers?compact=1` | `AppStore.swift:420` | `GET /api/v3/attempts`、`/api/v3/mistakes` |
| `POST api/answers/replay` | `AppStore.swift:437` | 记忆卡 → `POST /api/v3/cards/ratings`；题目 → `POST /api/v3/attempts/{AT}/answers`。旧的“与云端进度比对后再上传”逻辑不再需要：两个接口都按 `eventId` 去重 |
| `GET api/study-plan`、`PUT api/study-plan/profile` | `AppStore.swift:239,243` | `GET /api/v3/plan`、`PUT /api/v3/plan/profile` |
| `GET api/listening-questions`、`GET api/materials` | `AppStore.swift:579,698` | 改用 `sync` 里的 `questionGroups`（`module` 为 listening / reading），音频 `GET /api/v3/media/{id}` |
| `GET/POST api/captures` | `AppStore.swift:715` | `/api/v3/inbox`（编号 `IN12`，字段 `body/category/context/wordbook/status`） |
| `GET api/drafts/…` | `NativePractice.swift:1128` | `/api/v3/drafts/{DR}` |
| `GET api/item-images/…` | `APIClient.swift:15` | `/api/v3/media/{mediaId}` |
| `api/market…` | `DiscoveryView.swift:235,250,264,276,556,601` | `/api/v3/market…`（分享包格式 `jlpt-share` v2：`knowledge`、`groups`） |
| `GET api/wordbooks` | `DatabaseCheckView.swift:268` | `/api/v3/wordbooks`（编号 `WB1`，一个单词本可以包含单词、语法、名字） |

## 模型

| 现在 | v3 |
|---|---|
| `StudyItem`（`deck`、`original`、`meaning_zh`、`examples[].ja/zh`、`ruby_terms`、`inflection_class`、`conjugations`…） | 知识点 `KnowledgeDetail`（`code` W/G/N、`kind`、`expression`、`reading`、`pos`、`meaning {text, language, isFallback}`、`examples[].sentence/translation`、`conjugations` 由服务器生成、`review`）。没有 deck；注音改为按需 `ruby_annotations` |
| `ProgressEntry`、`StudyState.progress` | 知识点的 `review`（`status`、`dueAt`、`reviewCount`、`ease`、`intervalDays`），由服务器根据作答和自评计算，客户端不再写进度 |
| `ReadingQuestion`、`ListeningItem`、`NativeQuestion`、`NativeQuestionPayload` | 题组 `QuestionGroup` → `questions[]` → `options[]`（固定 `id`，`correct` 标在选项上）、`marks`（UTF-16 偏移）、`explanation` 分段、`materials` |
| `NativePack`、`PracticeDraft` | 练习 `PracticeSet`（`DP`/`TP`/`MX`，分区与条目）、草稿 `Draft`（`DR`） |
| `Capture` | 收集箱条目（`IN`） |
| `NativeWordbook`（带 deck） | 单词本（`WB`），统计 `stats` |
| `CardReview`、`AnswerInput`、`PendingAnswer` | 离线队列只放两类事件：自评 `{code, rating, eventId, reviewedAt}`、作答 `{attempt, question, selectedOptionId/answerText, eventId}` |

字段的完整定义见 `src/v3/types.ts`（Web 用的就是同一份），表结构见 `docs/schema-v3-design.md`。

## 题目从哪里来

现在的 iOS 用 `Resources/ItemQuestions.js` 在本机从词条生成题目（`NativeItemQuestions`）。v3 不再从词条生成题目：题目都在题库里，经过审查（`ready`）才能用于练习。改为：

- 练习用 `sync` 缓存的 `questionGroups`（只用 `status == "ready"` 的）和 `practiceSets`；
- 专项/综合练习由服务器抽题：`POST /api/v3/attempts {filters: {module, typeIds, level, wordbook, onlyDue, statuses, count}}`（字段见 `src/v3/types.ts` 的 `PracticeFilters`）；
- 删除 `ItemQuestions.js` 和 `NativeItemQuestions`。

## 需要先决定的事

1. **完全离线的练习**：作答接口需要一个练习记录编号，而开始练习（`POST /api/v3/attempts`）目前没有幂等键，且每个用户同时只能有一个进行中的练习。离线开始的练习要么在联网时才建立（离线只能复习记忆卡），要么给服务器加一个带 `eventId`、一次提交整份离线练习的接口（需要改表：`practice_attempts` 加客户端事件 ID）。建议先做前者。
2. **本地缓存清空**：升级后旧的离线 JSON（`LocalStudyFiles`）不再兼容，按设计第 10 节清空后从 `sync` 重新下载。旧版本里还没上传的作答（pending）在升级前需要先上传，或者告知用户会丢失。

## 验证

- 服务端：`node --test tests/v3-sync.test.mjs`、`npm run test:cloudflare`。
- iOS：在 Xcode 中编译 `JLPTMasterDeck` scheme，跑 `apple/Tests/StudyTests.swift`（其中针对旧同步协议的测试需要一起改写），再用真机登录比对 Web 上同一账号的单词本、到期卡片和练习记录。
