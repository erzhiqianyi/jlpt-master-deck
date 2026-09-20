# Cloudflare 发布准备与数据迁移

核查日期：2026-09-21。当前发布采用 Pages 前端 + 现有 Node API 的过渡架构，数据库仍在本机。

## 当前发布与自动化

- Pages 项目：`jlpt-master-deck`，生产入口 `https://jlpt.erzhiqian.cc`（Pages 默认地址 `https://jlpt-master-deck.pages.dev`）。
- Pages Worker 把 `/api/*` 和 `/.well-known/*` 同源代理到 `https://jlpt-local.erzhiqian.cc`；OAuth 使用访问者实际站点域名。代理不缓存账号数据。
- `npm run build:cloudflare` 构建应用并从产物剔除 `data/`；Worker 也拒绝匿名静态数据路径。源 JSON 和 SQLite 不会被修改或上传。
- `.github/workflows/cloudflare.yml`：PR 检查；推送 `main` 或在 main 上手动运行时，经安装、lint、测试、构建后部署。其他分支不会发布生产站。
- GitHub 仓库变量 `CLOUDFLARE_ACCOUNT_ID` 为目标账号 ID；仓库 Secret `CLOUDFLARE_API_TOKEN` 需使用该账户的 Pages:Edit Token。不要使用短期 Wrangler OAuth Token 作为长期 CI 凭据。
- `@ninomae/mcp-app-server` 固定为仓库内 0.2.0 包，来源提交及重建方法见 `vendor/README.md`。
- 本机需要 API（4221）、Web/代理（4220）和现有共享 Tunnel 均在线。前端更新由 Actions 自动发布，本机 Node 后端的更新仍需要更新本机代码后单独重启，Actions 不会远程更新此服务。
- `/api/deployment` 只证明 Pages Worker 在线；`/api/health` 才检查上游服务。不能把前端部署成功等同于数据库已迁移或后端永远在线。
- Firebase 项目已将 `jlpt.erzhiqian.cc` 加入 Authentication 的 Authorized domains；线上使用这个正式域登录。

手动发布：`npm run deploy:cloudflare`。若当前工作区存在旧框架生成的 `.wrangler/deploy/config.json`，请在干净检出中构建和发布，避免它重定向到不存在的旧配置。

## 当前架构与目标

项目已不是纯静态站点。Vite 负责前端，`server/api.mjs` 提供账号、学习数据、音频与 MCP；`server/storage.mjs` 使用 Node `DatabaseSync` 和本地文件系统。Vite 的开发代理不会随 `dist` 发布，直接上传 Pages 后 `/api/*` 不会正常工作。

建议完全云端部署目标：Pages/Workers 静态资源 + Workers API + D1 业务数据 + 私有 R2 音频。Firebase 继续用于已有登录和可选的 Firestore 市场；它目前不负责同步 SQLite 学习记录。

另一条过渡路线是 Pages 前端 + 同源代理到常驻 Node API（持久磁盘 SQLite）。这能少改后端，但仍依赖那台服务器；若通过本机 Tunnel，则电脑必须保持在线。此路线不等于数据已经迁到 Cloudflare。

## 数据如何过去

| 数据 | 当前来源 | 迁移处理 |
| --- | --- | --- |
| 账号、Firebase 身份关联 | SQLite users/firebase_identities | 保留原 ID 和关联，避免重新登录产生另一个账号 |
| 词条、单词本、练习、计划、草稿、答题、进度 | SQLite 全部业务表 | 首次全量迁移，核对所有行；月度 JSON 不包含这些完整数据 |
| Web 会话、MCP 授权 | sessions/agent_* | 原始备份保留，迁移副本清空，云端重新登录和授权 |
| 听力题和录音 | 数据库 audio_path 指向本机文件 | 上传私有 R2，按用户鉴权读取；改造路径映射与上传/删除逻辑 |
| 官方样题、模拟卷 | .local/official-jlpt、.local/mock-exams | 当前只允许本地请求，需要单独制定迁移范围和授权访问方案 |
| 新闻资料 | 知识库 sources/jlpt-news 或 JLPT_NEWS_SOURCE_DIR | 独立于仓库，需要清点引用并转为云端对象存储；本次没有复制 |
| 月度 JSON、public 图片 | public/ | 构建时会公开发布，发布前核对聊天来源摘要及个人内容是否适合公开 |
| Firebase/运行配置 | .local/firebase.json、环境变量 | 单独配置；迁移工具不复制密钥或环境文件 |

采用一次性切换、云端为唯一写入源。切换后本地 MCP、定时练习任务也要写云端 API，不能继续写本地库再覆盖远端。双向同步需要额外实现版本、冲突处理和删除记录，目前没有。

## 已提供的本地准备工具

```sh
python3 scripts/prepare-cloudflare-data.py
# 自定义来源：python3 scripts/prepare-cloudflare-data.py --db /absolute/path/jlpt.sqlite
```

需要 Python 3 标准库。也接受 `JLPT_DB_PATH`；工具不自动加载 `.env`，使用其他配置文件时须显式指定数据库。

输出位于被 Git 忽略的 `.local/cloudflare-preparation/<UTC时间>/`，包含：

- `snapshot.sqlite`：SQLite 在线 backup API 生成的一致快照，包含 WAL 中已提交的数据；不直接复制正在运行的数据库文件。
- `migration.sqlite`：清除会话和 MCP 客户端/令牌的迁移副本，原库不变。
- `d1-candidate.sql`：先建所有表再写数据，去除显式事务和 sqlite_sequence 写入的候选 SQL。
- `media/`：数据库引用的听力文件副本。
- `manifest.json`：表行数、文件 SHA-256、媒体映射、缺失文件、大 SQL 计数和未包含的外部资源。

工具对快照执行 integrity_check/foreign_key_check，并将候选 SQL 恢复到独立 SQLite，逐表比较每一行。文件和目录使用仅当前用户可访问的权限；备份包含账号及私人学习数据，不要放进 public/ 或提交 Git。

这不是 D1 实测通过的导入包。当前快照有 **14 条 SQL 超过 D1 的 100,000 字节限制，最大 620,938 字节**。这些是单行大 JSON，不能靠把多行 INSERT 拆成单行解决。后续需使用参数绑定迁移（仍需检查 2 MB 行限制）、拆分业务记录或将大文档放入 R2，再做真实 D1 演练。当前候选 SQL 不应直接远端执行。

## 发布前仍须完成

1. 将同步 SQLite 存储适配到异步 D1，处理事务、迁移、账号密码验证、Firebase 验证和 MCP OAuth 存储；确认 Workers 运行时兼容性。
2. 已将 MCP 依赖固定到仓库内构建包；后续升级时维持固定版本和干净检出验证。
3. 实现 R2 读写与授权，完成新闻和本地素材范围核对。
4. 添加真实 Worker 入口与 Wrangler D1/R2 绑定；配置预发布域名、Firebase 授权域、OAuth public origin 和回调。不能仅添加一个 wrangler 配置就视为后端已适配。
5. 审核静态公开数据、公开注册策略、API 错误/health 中本机路径暴露及代理信任边界；普通构建包含 public/data；Cloudflare 专用构建已剔除 data/。
6. 在独立预发布 D1/R2 上导入，验证登录后看到原账号数据、答题/进度保存、听力播放、MCP 读写和重新授权；再核对行数、内容及对象校验和。

## 正式切换与回退

1. 暂停所有写入端（网页、API、MCP、定时任务），重新运行准备工具得到最终快照。在线准备快照与文件复制不是跨资源原子快照。
2. 导入空的预发布/生产数据库，上传对应文件，校验后才切换域名和客户端配置。不要反复用全量导入覆盖正在使用的数据库。
3. 切换后只写云端，保留本地只读备份。部署静态前端不会自动同步后续数据。
4. 若云端尚未产生新写入，可切回原服务；若已产生新记录，先暂停写入并导出云端增量，完成合并后再回退，避免丢失学习记录。

## 官方依据

- [D1 导入与导出](https://developers.cloudflare.com/d1/best-practices/import-export-data/)：SQL 导入、事务处理及外键注意事项。
- [D1 限制](https://developers.cloudflare.com/d1/platform/limits/)：SQL 100,000 字节、行/字符串/BLOB 2,000,000 字节。
- [Pages Functions 路由](https://developers.cloudflare.com/pages/functions/routing/)：生产 API 路由需要 Functions/Worker 或代理实现。
