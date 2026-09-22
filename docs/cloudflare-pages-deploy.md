# Cloudflare 发布与数据迁移

核查日期：2026-09-21。正式入口为 https://jlpt.erzhiqian.cc。

## 当前架构

- Pages 项目 `jlpt-master-deck` 提供前端，通过 `API` Service Binding 调用独立 Worker `jlpt-api`。生产请求不再经过本机 Tunnel。
- API 使用 SQLite Durable Object（`JlptDatabase`，实例 `primary-v1`）保存业务数据。现有代码大量依赖同步 SQLite 和多步事务，因此采用此方案保留语义；本次未创建或使用 D1。
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

集成测试覆盖鉴权拒绝、用户隔离、音频上传/读取/删除、OAuth 授权和 MCP 调用、嵌入式练习页面、重启后的 SQLite/R2 持久化。Google 登录的浏览器交互仍应在正式域名验证。

MCP 查询使用平台执行限制和执行前后截止时间检查；Workers SQLite 不支持本地版本的 JavaScript 标量函数，因此不提供本地逐行截止时间中断。单个 Durable Object 串行处理应用请求，适合当前规模；扩大并发前应规划分片。

`cloudflare/migrations/0001.sql` 由全新空库生成，只含结构和修订计数初值。未来结构变更应新增有序迁移及版本检查，不能修改已应用的迁移来更新生产。`scripts/generate-cloud-schema.mjs` 仅用于初始结构生成。

## 后续本地数据迁移

现有准备工具保留：

```sh
python3 scripts/prepare-cloudflare-data.py
```

输出在 `.local/cloudflare-preparation/<UTC时间>/`：一致性 SQLite 快照、清除会话的迁移副本、媒体副本、哈希和逐表校验清单。不会修改原库，也不会自动上传。

其中 `d1-candidate.sql` 是早期 D1 方案的候选文件，**不能直接用于当前 Durable Object 导入**。旧快照有 14 条 SQL 超过 D1 的 100,000 字节限制，最大 620,938 字节；当前架构仍需单独实现绑定参数、分批和可恢复的迁移入口，不要直接拼接执行这些大 SQL。

迁移前必须：

1. 清点本地 SQLite 全部业务表、Firebase UID 关联、R2 音频及外部新闻素材。
2. 将已登录的云端用户与本地用户按 Firebase 项目和 UID 合并，不能按自增 ID 或用户名直接覆盖。
3. 暂停写入后制作最终快照，在隔离实例演练，核对行数、内容及媒体哈希，再导入生产。
4. 会话和 MCP 授权重新签发；切换 MCP 和定时任务为云端写入，避免继续产生两个独立数据源。
5. 保留原始备份。云端产生新记录后，回退或重导入之前必须合并新增记录。

当前没有双向同步或自动冲突合并。先部署空库不妨碍之后迁移，但不能用本地全量快照覆盖云端新记录。

## 官方依据

- [Pages Service Bindings](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings)
- [Durable Objects SQLite](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [D1 限制](https://developers.cloudflare.com/d1/platform/limits/)

## 分享数据边界

- Firebase 仅负责 Google 登录。忽略旧配置中的 `market: firestore`，前端不再加载 Firestore SDK。
- 私有单词本及专项练习是发布源。客户端只提交 `kind`、`sourceId` 和可选标题/说明；后端检查归属，从数据库读取内容，剔除学习进度、个人备注和私有来源信息。
- `market_shares.package_json` 是发布时生成的完整公共副本（`jlpt-share` v1），与源内容保存在同一个 Cloudflare Durable Object SQLite 数据库。`source_id`、`kind`、`user_id`、`created_at` 记录来源、发布者和发布时间；来源 ID 仅向发布者返回。
- 发现页和详情页均从 `/api/market` 读取公共副本。发布后原始内容的修改或删除不改变此副本；再次发布产生新分享和新时间。部署静态网站或 Worker 不会重建数据库或清空分享。
- 添加分享只提交 `shareId`，后端重新读取仍在发布的副本，然后创建当前用户的独立内容；不会相信客户端传来的预览数据。已有 JSON 文件导入接口保留，但不承担发布职责。
- 撤回仅将 `withdrawn` 设为 1，公共列表/详情/按 ID 导入立即不可用；数据库保留副本，其他用户已经导入的私有内容不受影响。
- “公共”表示已登录用户可访问的分享内容，不包含作者身份凭据或学习记录，也不开放匿名数据库读取。
- 该公共副本保证源内容与分享内容独立，并非异地灾备。灾备仍应覆盖整个 Cloudflare 数据库。

### 旧 Firestore 内容

此变更不自动迁入旧 Firestore 内容，也不删除远端文档。切换后旧 Firestore 分享不再出现在发现页，旧链接返回找不到分享。需要保留的内容应先核验归属和内容，导入个人数据库后重新发布；不要将旧 Firestore 的 owner UID 当成 SQLite user ID。已要求移除的“汉字练习5-8”无需迁回新市场。
