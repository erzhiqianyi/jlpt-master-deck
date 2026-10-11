# 线上迁移到 v3（阶段 6）操作手册

本文为中文版；英文版 [cloud-v3-migration.en.md](cloud-v3-migration.en.md)、日文版 [cloud-v3-migration.ja.md](cloud-v3-migration.ja.md) 内容相同。

**每一步对线上都有影响，执行前需要另行授权。** 本手册只描述做法；工具已在本地用 Miniflare 演练（`cloudflare/migration.test.mjs`），并用线上数据的本地副本跑通了迁移与对账。

## 思路

- 旧数据在 Durable Object `primary-v1`（旧结构）。新数据写进**新的** Durable Object `primary-v3`；旧的 `primary-v1` 只读不写，留作切回的去处。
- Worker 用环境变量选择：`DATABASE_NAME`（用哪个 DO，默认 `primary-v1`）、`MIGRATION_MODE`（`export` / `import`，迁移期间才设）、`MIGRATION_TOKEN`（32 位以上的一次性密钥，只在迁移期间存在）。
- 迁移模式下普通 API、MCP、定时任务全部停止（停机窗口从第 2 步到第 6 步）。
- 图片与音频在 R2，迁移不复制：v3 的 `media_files.storage_path` 保留原路径，新上传的文件放在 `v3-media/`。
- 账户、会话、Firebase 绑定、OAuth 授权、加密的朗读密钥原样带过去，用户不需要重新登录；`TTS_SECRETS_KEY` 必须保持不变。

## 步骤

1. **准备**：在本地对当前分支跑全部测试（`node --test …`、`npm run test:cloudflare`、iOS 测试）。生成一次性密钥，只放在本机环境变量 `JLPT_MIGRATION_TOKEN` 和 Worker 的 secret 里。
2. **停写并导出**：以 `MIGRATION_MODE=export`、`DATABASE_NAME=primary-v1` 部署 Worker（secret `MIGRATION_TOKEN`）。然后：

   ```bash
   node scripts/v3/cloud-migration.mjs export --origin https://jlpt.erzhiqian.cc --out .local/v3-cutover/dump
   ```

   每张表导出的行数与 DO 里的计数不一致就失败。导出目录就是备份，保存好（含账户数据，不要提交、不要上传）。另外按现有方式备份 R2。
3. **本地迁移与对账**：

   ```bash
   node scripts/v3/cloud-migration.mjs build --dump .local/v3-cutover/dump --out .local/v3-cutover/v3.sqlite
   ```

   先从导出重建旧库并核对行数，再迁移到 v3，外键必须完整，然后运行 `scripts/v3/verify-migration.mjs` 做数量对账与 30 个知识点的全字段抽查。任何一项不一致都停止，修好后从这一步重来（线上仍在只读的导出模式）。
4. **写入新 DO**：以 `MIGRATION_MODE=import`、`DATABASE_NAME=primary-v3` 部署。然后：

   ```bash
   node scripts/v3/cloud-migration.mjs import --origin https://jlpt.erzhiqian.cc --db .local/v3-cutover/v3.sqlite
   ```

   新 DO 不是空的就拒绝写入；要重来就换一个新的 `DATABASE_NAME`。
5. **线上对账**：

   ```bash
   node scripts/v3/cloud-migration.mjs check --origin https://jlpt.erzhiqian.cc --db .local/v3-cutover/v3.sqlite
   ```

   每张表行数一致、外键无违例才继续（**对账一致才切换**）。
6. **切换**：以普通模式、`DATABASE_NAME=primary-v3` 部署，删除 Worker 的 `MIGRATION_MODE` 和 `MIGRATION_TOKEN`。用网页和 iOS 登录检查：词库、练习、卡片、设置、上传文件、MCP 连接。之后再发布新的网页和 iOS。

## 切回

在第 6 步之前任何时候：用上一个版本的代码（旧结构的 Worker）以 `DATABASE_NAME=primary-v1` 部署即可，旧 DO 没有被写过。第 6 步之后切回会丢掉切换后的新记录，需要另行评估。

## 注意

- 当前代码以普通模式访问还没迁移的旧 DO 时返回 503（不会自动改写旧数据），所以不要在第 6 步之前以普通模式部署到 `primary-v1`。
- 自增编号（`AUTOINCREMENT`）在写入后按已有的最大值继续；迁移前被删除的最大编号可能被重新使用。
- 导出目录和 `v3.sqlite` 含账户数据，迁移结束后按备份规定保存或删除。
