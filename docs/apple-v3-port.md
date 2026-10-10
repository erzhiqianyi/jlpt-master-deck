# iOS 客户端迁移到 v3（第 5 段阶）

iOS 客户端（`apple/`）的数据层已经改为 v3。改法是**在网络边界做转换**：v3 的数据转换成界面已经在用的模型（`StudyItem`、`NativeQuestion`、`ReadingQuestion`、`ListeningItem`、`NativePack` 等），界面代码基本不动。转换都在 `apple/Sources/V3Bridge.swift`。

> 本仓库的开发环境不能编译 iOS（没有 Xcode / Swift 工具链）。Swift 改动只做了语法解析检查（tree-sitter，与改动前一致），**需要在 Xcode 中编译并跑 `JLPTMasterDeck` 的测试后才能发布**。服务端对 iOS 请求的契约由 `tests/v3-ios-contract.test.mjs` 用真实的 REST 处理程序验证。

## 怎么对应

| 功能 | 现在 | 代码 |
|---|---|---|
| 离线下载 | `GET /api/v3/sync` 分页读完，整体替换本机缓存；另读 `/api/v3/market` 和 `?mine=1` | `V3Bridge.download`、`APIClient.fetchIncrementalStudy` |
| 知识点 | 编号（W12）作为 `StudyItem.id`；复习进度来自 `review`；单词本编号作为 `wordbook_id` | `V3Bridge.studyItem`、`progressEntry` |
| 练习题 | 审查通过（ready）的题组成为练习题库（`AppStore.bank`）；题目编号（QV15）作为题目 id；选项 id 另存（作答按选项 id 上传） | `V3Bridge.nativeQuestion`、`NativeItemQuestions` |
| 阅读、听力 | ready 的阅读/听力题组；音频 `GET /api/v3/media/{mediaId}` | `readingQuestion`、`listeningItem`、`AppStore.audioData` |
| 每日/专项练习 | 练习（DP/TP/MX）转成 `NativePack` | `V3Bridge.pack` |
| 设置 | `GET`/`PATCH /api/v3/settings`，在 v3 字段与界面用的旧键之间转换 | `legacySettings`、`settingsPatch` |
| 计划、考试目标 | `/api/v3/plan`、`PUT /api/v3/plan/profile` | `V3Bridge.plan`、`AppStore.saveExamGoal` |
| 收集箱 | `POST /api/v3/inbox` | `AppStore.capture` |
| 记忆卡自评上传 | `POST /api/v3/cards/ratings`（同一 eventId 只记一次） | `V3Bridge.uploadRating` |
| 练习作答上传 | 本机每一轮练习对应服务器上的一条练习记录：`POST /attempts` → 每题 `POST /attempts/{AT}/answers`（选项 id、eventId）→ 最后 `POST …/complete`。本轮与服务器记录的对应关系保存在本机，重试会用同一条记录，不会重复计数 | `AppStore.flushPending`、`PendingAnswer.nativeAttemptId` |
| 草稿 | `GET /api/v3/drafts/{DR}` + 按题组编号取题；确认 `POST …/status`；发布 `POST …/publish` | `V3Bridge.topicDraft`、`publishDraft` |
| 发现 | 列表、详情（`jlpt-share` v2）、导入、撤回、编辑（`POST …/refresh`） | `V3Bridge.share`、`package`、`DiscoveryView` |
| 数据库检查 | 云端数量来自一次新的 `sync` 下载（不写本机） | `DatabaseCheckView` |
| 记忆图片 | `GET /api/v3/media/{id}` | `APIClient.itemImageRequest` |

## 行为上的变化

- **本机缓存换目录**：`OfflineStudy-v1` → `OfflineStudy-v3`。升级后第一次同步重新下载（设计第 10 节）。旧目录留在设备上不删除；旧版本里还没上传的作答对应不到 v3 的题目，不会上传。
- **题目只来自题库**：不再在本机用 `ItemQuestions.js` 从词条生成题目，只用审查通过的题组。`Resources/ItemQuestions.js` 已不再使用，可以在 Xcode 中从工程里移除。
- **练习记录**：历史列表里的服务器记录只有总数和正确数（逐题内容在服务器上）。只展示、没作答的一轮不上传。
- **保存在本机的设置**：记忆卡正反面字段在 v3 改为模板（`cardTemplates`），iOS 的字段设置只保存在本机。
- **发现**：v3 的分享没有自定义封面，上传封面会提示不支持；编辑分享时内容总会按原单词本/练习的最新版本更新。
- **无法上传的记录**：题目或知识点在云端已删除（400/404），以及旧版本的记录，会留在“待核对”里并说明原因，不阻塞其他记录。标为“已计入”的记录直接丢弃。

## 验证

- 服务端：`node --test tests/v3-ios-contract.test.mjs tests/v3-sync.test.mjs`、`npm run test:cloudflare`。
- iOS：在 Xcode 中编译 `JLPTMasterDeck` scheme 并运行测试。`StudyTests.swift` 的 `V3BridgeTests` 用服务器真实输出（v3 仓库函数生成）检查转换。然后真机登录，对照 Web 上同一账号的单词本、到期卡片、练习记录和设置。

## 尚未决定

**完全离线开始的练习**：答题会先存在本机，联网后按上面的方式补建练习记录并上传。服务器的练习记录时间是上传时间，每题的作答时间按本机记录（`answeredAt`）保存。如果需要服务器记录也保留离线开始的时间，需要给 `POST /api/v3/attempts` 增加 `startedAt`。
