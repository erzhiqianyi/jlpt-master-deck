# 页面查询与 MCP 对照

检查范围：`src/App.tsx`、各功能页的请求、`server/api-handler.mjs`、共享 MCP 工具目录与通用查询 schema。HTTP MCP 与 stdio 使用同一目录；Cloudflare 复用查询和存储实现。本表是源码对照，不表示线上服务已经部署或客户端已经刷新 schema。

## 阅读数据的入口

| 页面数据来源 | MCP 入口 | 内容 |
| --- | --- | --- |
| 独立阅读题库 | `list_reading_questions` / `get_reading_question` | 原文、4 个选项、答案、总解析、全文翻译、逐项解析、结构分析、逐句翻译、标签 |
| 独立阅读题库的搜索与统计 | `jlpt_query` / `jlpt_aggregate`，`entity: reading_question` | 可按标题、题目、原文、标签、创建时间筛选；分页及精确计数 |
| 长篇阅读内容 | `jlpt_get`，`entity: reading_question` | `metadata`、`passage`、`prompt`、`options`、`answer_key`、`translation`、`explanation`；跟随游标读取全文 |
| 每日练习内的阅读题 | `get_daily_practice` | 完整练习内的题目；不是独立阅读题库 |
| 草稿中的阅读题 | `get_review_pack_draft` | 完整草稿内容 |
| 新闻阅读题 | `get_local_news_cycle` | 所选周期所有模块的题目，包含阅读原文 |
| 本地模拟题／官方样题 | `get_local_mock_exam` / `list_local_official_samples` | 页面所用 JSON 数据；保留本机访问限制 |
| 历史答题 | `get_study_state` + `get_history_questions` | 完整 attemptHistory，以及历史页请求的错题／关联题详情 |

示例：

```json
{"entity":"reading_question","filters":[{"field":"passage","op":"contains","value":"環境"}],"include_total":"exact","limit":20}
```

```json
{"entity":"reading_question","id":"<从查询获得的 id>","sections":["metadata","passage","prompt","options","answer_key","translation","explanation"]}
```

独立阅读题库遵循网页题库管理的完整解析可读规则。生成练习的通用 `question` 实体继续保留答题后的答案／解析读取限制。分页查询的游标位于 `meta.page.next_cursor`；分段详情的游标位于 `data.next_cursor`，需检查 `content_complete`。

## 学习数据 API 逐项映射

省略下表路径的 `/api` 前缀。除标注 POST 的预览接口外均为 GET。

| API | MCP |
| --- | --- |
| `/references/resolve` | `resolve_reference` |
| `/review-data` | `get_review_data`；也可使用 `jlpt_query(entity: item)` |
| `/wordbooks` | `list_wordbooks` |
| `/study-state` | **新增** `get_study_state` |
| `/study-plan` | `get_study_plan` |
| `/study-record` | `get_study_record` |
| `/captures` | `list_learning_captures` |
| `/analysis/weak-points` | `analyze_weak_points` |
| `/listening-questions` | `list_listening_questions` |
| `/listening-audio-match?sha256=` | **新增** `find_listening_audio_questions` |
| `/listening-questions/:id/recordings` | **新增** `list_listening_recordings`（含已完成解析，读取不领取分析任务） |
| `/reading-questions` | `list_reading_questions` |
| `/reading-questions/:id` | `get_reading_question` |
| `/drafts` | `list_review_pack_drafts` |
| `/drafts/:id` | `get_review_pack_draft` |
| `/drafts/:id/revision-context` | `get_draft_revision_context` |
| `/drafts/:id/processing-context` | `get_draft_processing_context` |
| `/history-questions` | **新增** `get_history_questions` |
| `/daily-practices` | `list_daily_practices` |
| `/daily-practices/:id` | `get_daily_practice` |
| `/market/sources` | **新增** `list_market_sources` |
| `/market` | **新增** `list_market_shares` |
| `/market/:id` | **新增** `get_market_share` |
| POST `/market/preview` | **新增** `preview_market_source`（只读，不发布） |
| `/local-official-samples?module=` | **新增** `list_local_official_samples` |
| `/local-mock-exams` | **新增** `list_local_mock_exams` |
| `/local-mock-exams/:id` | **新增** `get_local_mock_exam` |
| `/local-news-cycles` | **新增** `list_local_news_cycles` |
| `/local-news-cycle?id=` | **新增** `get_local_news_cycle` |

## 环境与非学习接口边界

- 官方样题／模拟题仍需 localhost HTTP MCP 或本地 stdio；不能通过公开隧道读取工作站素材。新闻查询与原 API 一样可经已认证的本地服务读取。Cloudflare 没有本地素材，MCP 返回明确不可用错误，不假装数据为空。
- 音频／PDF 二进制传输仍走原文件接口：`/listening-questions/:id/audio`、`/listening-recordings/:id/audio`、`/local-news-audio/...`、`/local-mock-files/...`、`/local-official-jlpt/...`。MCP 数据中的资源地址及元数据可用于定位；本次没有增加二进制下载工具或将文件转成巨大的 Base64 文本。
- `/me` 对应 HTTP MCP 内置 `get_connection_info` 的授权账号信息。`/auth/config`、`/auth/firebase/status`、`/agents`、`/health` 是登录／连接管理和诊断接口，不是学习数据；本次未新增其 MCP 镜像。stdio 没有 HTTP 服务内置的 `get_connection_info`。
- 所有个人数据操作从授权上下文获取 userId；市场公开分享沿用网页可见性规则。本次不扩展写入／删除权限。

验证：`server/mcp-read-parity.test.mjs` 对照阅读详情及新增查询的 API/MCP 返回值，并覆盖阅读长文分段、账户隔离、修改后的游标失效和本地／云端环境边界；原有 MCP OAuth、schema 序列化和阅读 CRUD 回归测试继续适用。

当前验证结果：40 项本地回归通过，Cloudflare API 打包通过。Cloudflare 运行时回归在数据库初始化阶段因工作区编号注册 SQL 报 `too many terms in compound SELECT` 中断，因此尚未确认云端运行通过。未部署。
