# Cloudflare 发布与数据迁移

核查日期：2026-09-21；2026-10-10 按 schema v3 更新。正式入口为 https://jlpt.erzhiqian.cc。

## 当前架构

- Pages 项目 `jlpt-master-deck` 提供前端，通过 `API` Service Binding 调用独立 Worker `jlpt-api`。生产请求不再经过本机 Tunnel。
- API 使用 SQLite Durable Object（`JlptDatabase`）保存业务数据，结构为 v3（`server/v3/schema.sql`）。由哪个实例服务由 Worker 变量 `DATABASE_NAME` 决定，默认 `primary-v1`。空实例在第一次请求时按语句逐条建好 v3 表、参考数据和 OAuth/MCP 表；仍保存旧格式数据的实例不会被改写，所有请求返回 503“学习数据正在迁移”，直到按下文切换到迁移后的实例。本方案未使用 D1。
- 私有 R2 桶 `jlpt-media` 保存听力题、录音和 MCP 导出的备份。音频经 API 检查用户归属后读取，不公开桶。
- Firebase 继续负责 Google 登录；Workers 使用 Google 公钥验证签名、项目、有效期及身份声明。`FIREBASE_CONFIG` 只包含公开 Web 配置，不需要服务账号私钥。分享市场只使用 Cloudflare SQLite 中的公共快照，不连接 Firestore。
- 云端从空库开始，**没有迁移本地账号、学习记录或音频**。首次 Google 登录会创建云端账号；旧会话需要重新登录，MCP 需要重新授权。
- 本地新闻、官方样题和模拟卷文件未上传，相关云端接口返回空列表或未同步提示。静态构建移除 `public/data`，Worker 也拒绝 `/data/*`。

## 自动与手动发布

`.github/workflows/cloudflare.yml` 在 PR 中检查，在推送 `main` 或手动运行 main 时发布。流程：安装依赖、lint、本地业务测试、真实 Workers 运行时集成测试、构建；先发布 API，再发布 Pages，最后检查域名和 `/api/health`。

GitHub 配置：

- Secret `CLOUDFLARE_API_TOKEN`：目标账户的 Pages Edit、Workers Scripts Edit；绑定 R2 所需权限应覆盖 Workers R2 Storage。按 Wrangler 的实际错误补齐账户读取权限。
- Variable `CLOUDFLARE_ACCOUNT_ID`：目标 Cloudflare 账户。
- 不要把短期 Wrangler OAuth token 放入长期 CI Secret。
- Pages 前端公开变量统一维护在根目录 `wrangler.jsonc` 的 `vars` 中；不要再在 Cloudflare Pages 控制台单独维护同名变量。当前 GA4 配置为 `VITE_GOOGLE_ANALYTICS_ID`。

```sh
npm ci
npm run test:cloudflare
npm run deploy:cloudflare # API + 前端
# 只部署 API：npm run deploy:cloud-api
```

若工作区有旧框架的 `.wrangler/deploy/config.json`，在干净检出中发布，避免它重定向配置。生产入口固定在 `cloudflare/api-worker.mjs`；`cloudflare/fixtures/runtime.mjs` 仅用于本地测试，不能部署。

`/api/deployment` 标识前端绑定方案，`/api/health` 实际进入云端数据库执行查询。部署成功不等于本地数据已同步。

## 存储与验证边界

`server/platform.mjs` 将同步事务映射到 Durable Object `transactionSync`；请求级事务保证异常响应回滚。R2 上传成功后才提交 SQL 元数据；删除操作记录在持久队列中，失败后由 alarm 重试。极少数上传成功但数据库提交失败的情形可能留下未引用对象，后续可按数据库引用清理。

集成测试（`cloudflare/runtime.test.mjs`、`cloudflare/migration.test.mjs`，Miniflare 中真实的 Durable Object SQLite）覆盖鉴权拒绝、用户隔离、作答与自评按 eventId 去重、R2 上传失败回滚、分享、OAuth 权限范围与 MCP 工具目录、离线同步分页、重启后的 SQLite/R2 持久化、旧数据实例的迁移等待，以及下文的整套迁移流程。Google 登录的浏览器交互仍应在正式域名验证。

MCP 查询使用平台执行限制和执行前后截止时间检查；Workers SQLite 不支持本地版本的 JavaScript 标量函数，因此不提供本地逐行截止时间中断。单个 Durable Object 串行处理应用请求，适合当前规模；扩大并发前应规划分片。

Workers SQLite 与本地 node:sqlite 的差异由 `cloudflare/sqlite-adapter.mjs` 统一：单条语句不超过 100 KB（建表脚本逐条执行），最多 100 个绑定参数（`server/sql-limits.mjs` 在本地同样检查），只支持 `?` 占位符（具名参数 `:name` 在适配层换成位置参数，语义与 node:sqlite 一致）。今后改动 v3 表结构时，需要为已存在的实例另行编写有序的迁移步骤，`installV3Schema` 只负责空实例。

## 从旧数据切换到 v3（设计第 11 节第 6 段）

线上实例 `primary-v1` 保存的是 v3 之前的数据。部署 v3 代码后它进入迁移等待（只读、全部请求 503），**不会被改写，可作为备份**。迁移在本地完成，结果导入一个新实例，确认无误后用 `DATABASE_NAME` 切换。生产上执行需要另行批准维护窗口。

1. **开启维护接口**：`wrangler secret put MAINTENANCE_TOKEN --config cloudflare/wrangler.api.json`（至少 32 字符的随机值）。没有这个 secret 时 `/__maintenance/*` 一律 404。本地设置同一个值：`export JLPT_MAINTENANCE_TOKEN=…`。
2. **备份**：`node scripts/v3/cloud-migrate.mjs export --url https://jlpt.erzhiqian.cc --database primary-v1 --out legacy-dump.json`。在一个事务里读出全部表（含账户、Firebase 绑定、会话、OAuth 授权），分片下载并逐片校验哈希。文件权限 600，属于私人数据。
3. **迁移**：`… to-sqlite --dump legacy-dump.json --out legacy.sqlite`，然后 `node scripts/v3/migrate.mjs legacy.sqlite v3.sqlite`。
4. **对账**：`node scripts/v3/verify-migration.mjs legacy.sqlite v3.sqlite v3.report.json`，以及 `verify-knowledge-api.mjs`、`verify-practice.mjs`。报告中的每条旧记录都应有去向，外键违规为 0。
5. **导入**：`… package --db v3.sqlite --out v3-dump.json`，然后 `… import --url https://jlpt.erzhiqian.cc --database primary-v3 --dump v3-dump.json`。目标必须是没有账户的新实例；导入在一个事务里完成，逐表比对行数和哈希并检查外键，不一致就整体回滚，并报告不一致的表。`… status --database primary-v3` 可以随时复核。
6. **切换**：在 `cloudflare/wrangler.api.json` 的 `vars` 中设置 `"DATABASE_NAME": "primary-v3"` 并部署 API。会话和 MCP 授权随数据迁移，用户不需要重新登录。R2 中的音频和图片沿用原来的对象键，不需要复制。
7. **收尾**：删除 `MAINTENANCE_TOKEN`（`wrangler secret delete …`）。确认一段时间后再决定是否清理 `primary-v1`；在此之前回退只需把 `DATABASE_NAME` 改回去，并重新部署 v3 之前的 API 代码。

切换前云端新产生的记录不会自动合并：从第 2 步开始到切换完成，旧实例已处于只读状态，因此不会有新的写入。整套流程在 `cloudflare/migration.test.mjs` 中用 Miniflare 端到端验证。

## 官方依据

- [Pages Service Bindings](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings)
- [Durable Objects SQLite](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [D1 限制](https://developers.cloudflare.com/d1/platform/limits/)

## 分享数据边界

- Firebase 仅负责 Google 登录。忽略旧配置中的 `market: firestore`，前端不再加载 Firestore SDK。
- 私有单词本及练习是发布源。客户端只提交 `kind`、`source`（`WB1`、`DP3` 等编号）和可选标题/说明；后端检查归属，从数据库读取内容，剔除学习进度、个人备注和私有来源信息。
- `market_shares.package_json` 是发布时生成的完整公共副本（`jlpt-share` v2：知识点与题组），与源内容保存在同一个 Cloudflare Durable Object SQLite 数据库。`source_id`、`kind`、`user_id`、`created_at` 记录来源、发布者和发布时间；来源 ID 仅向发布者返回。
- 发现页和详情页均从 `/api/v3/market` 读取公共副本。发布后原始内容的修改或删除不改变此副本；再次发布产生新分享和新时间。部署静态网站或 Worker 不会重建数据库或清空分享。
- 导入调用 `POST /api/v3/market/{id}/import`，后端重新读取仍在发布的副本，然后创建当前用户的独立内容（新单词本，题组需重新审查）；不会相信客户端传来的预览数据。
- 撤回仅将 `withdrawn` 设为 1，公共列表/详情/按 ID 导入立即不可用；数据库保留副本，其他用户已经导入的私有内容不受影响。
- “公共”表示已登录用户可访问的分享内容，不包含作者身份凭据或学习记录，也不开放匿名数据库读取。
- 该公共副本保证源内容与分享内容独立，并非异地灾备。灾备仍应覆盖整个 Cloudflare 数据库。

### 旧 Firestore 内容

此变更不自动迁入旧 Firestore 内容，也不删除远端文档。切换后旧 Firestore 分享不再出现在发现页，旧链接返回找不到分享。需要保留的内容应先核验归属和内容，导入个人数据库后重新发布；不要将旧 Firestore 的 owner UID 当成 SQLite user ID。已要求移除的“汉字练习5-8”无需迁回新市场。
