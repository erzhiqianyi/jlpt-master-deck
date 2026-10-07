# Cloudflare 测试副本：设计与威胁边界

本工具针对 `JlptDatabase` 的 Durable Object SQLite (`primary-v1`) 和 R2 `jlpt-media`，不是 D1。只生成脱敏测试副本，不是完整灾备。当前开发与验证只使用本地 fixture/Miniflare；生产导出、临时部署、媒体下载均需另行授权，本次不会执行。

## 一致性与只读边界

普通 worker 构造器会 ensure schema；普通 GET 也可能写媒体删除队列和 alarm，不能作为只读导出。新增显式、默认关闭的 `COPY_EXPORT_MODE=read-only` 模式：构造器跳过所有迁移和服务初始化，fetch 只接受独立导出协议，alarm 不执行任何清理。需专用随机导出 token 与固定 owner allowlist，普通用户 session/MCP grant不能授权。它必须绑定既有同一个 DO 实例；新 DO/class 不会自动看到 primary-v1 的数据。未来启用会暂时阻断普通 API，须单独审批部署/维护窗口，绝不偷部署当前领域分支。

快照在一个同步 SQLite transaction 中读取明确列白名单、owner过滤和脱敏，再产生不可变内容哈希。期间没有 await，也没有R2读取。限制行数、字节和时间，超限整体失败；不把大库跨请求滚动查询称为单时点快照。分页只分页已经冻结的快照字节，带固定snapshot ID/chunk hash；过期/DO重启后旧checkpoint失效，需重新导出。客户端可离线保存/校验chunk断点，不能拼接不同snapshot。

## 数据与权限

保留源owner数值ID但创建禁用的测试身份；不导出真实用户名、password hash/salt、Firebase identities、sessions、OAuth/agent clients/codes/access/refresh grants、TTS credentials/cache、user_settings、全局无主review_items、运行清理队列/KV/alarm。表和列白名单未知变更失败关闭；遗漏与字段替换列入审计。学习正文/历史是私有数据，不能保证任意自由文本没有用户手写秘密；不是匿名化或可公开数据，离线文件必须私有保管。

还原不执行快照携带的SQL/DDL，只使用版本固定的结构白名单和绑定参数；只新建隔离目录，禁止覆盖，包括重复restore。先audit/dry-run，显式apply后在私有新目录完整事务写入、核对counts/canonical hashes/IDs/revisions/refs/attempt状态与score/order/SRS原记录，成功后才写COMPLETE标记。失败不得留下成功标记。不会恢复session/grant、alarm或删除队列，不自动启动普通worker，不连接生产绑定。

媒体仅按快照引用生成R2 key/path清单；SQLite快照与R2不构成跨存储原子事务。可从用户另外提供的离线媒体目录导入，禁止路径穿越、symlink及未在清单中的对象，验证大小/已有SHA；缺对象和未知hash须明确报告，不能伪称完整闭包。没有生产R2下载命令或默认云凭据。

迁移使用已有shadow迁移工具，先audit后显式apply到又一个新SQLite文件，保留源测试副本；历史缺冻结原题标 `missingOriginal`，不按最新题目重新判分。字段/IDs/hash对账与缺引用报告必须保留。

## 可运行的离线命令

Node >=22.13；必须明确路径，没有默认数据库。示例路径均为用户另行取得的本地文件，不会自动取得生产快照。

```sh
# 已有本地SQLite文件：只读导出单个/多个明确owner；out必须不存在
node scripts/cloud-copy.mjs export --source /tmp/isolated-source.sqlite --owners 1 --out /tmp/snapshot.json
node scripts/cloud-copy.mjs audit --snapshot /tmp/snapshot.json
# 审计和还原预览（默认不写入目标）
node scripts/cloud-copy.mjs restore --snapshot /tmp/snapshot.json --target /tmp/new-test-copy
# 明确应用；只写新目录；媒体根中使用清单的R2 key相对路径
node scripts/cloud-copy.mjs restore --snapshot /tmp/snapshot.json --target /tmp/new-test-copy --apply --media-root /tmp/offline-media --require-media
# 不提供媒体仍能还原SQLite，但report.mediaComplete=false，不能声称完整媒体副本
# 已离线保存的chunk文件名称为0、1、2…；manifest来自导出协议
node scripts/cloud-copy.mjs assemble --manifest /tmp/manifest.json --chunks /tmp/chunks --out /tmp/snapshot.json
# 中断后只允许同一个manifest及snapshot ID继续
node scripts/cloud-copy.mjs assemble --manifest /tmp/manifest.json --chunks /tmp/chunks --out /tmp/snapshot.json --resume
# 在副本上先审计，再迁移到另一个新的shadow文件，源测试副本保留
node scripts/migrate-bank-shadow.mjs --source /tmp/new-test-copy/study.sqlite
node scripts/migrate-bank-shadow.mjs --source /tmp/new-test-copy/study.sqlite --target /tmp/new-shadow.sqlite --execute
```

`restore`使用私有新目录、单个事务和`COMPLETE`成功标记；失败删除它创建的目录。审计产生引用缺口和`missingOriginal`列表，不改历史JSON、旧数字答案、SRS或排列顺序。报告的`complete`指SQLite还原事务完成；`mediaComplete`独立，原始媒体SHA未知时`sourceMediaHashesKnown=false`，仅校验离线复制字节一致，不声称与生产R2同一时点。

恢复结构是允许表/列/类型及主键，**不导入源SQL、触发器、索引、外键、views或运行配置**，用于离线迁移验证；不是可直接启动的生产实例。`users`只有禁用测试身份投影，缺密码字段，不能用于正常登录；后续App测试账户需在隔离环境单独配置。缺失/未知schema列拒绝导出，未知表排除并列入audit；全局无主`review_items`不猜owner，不宣称完整知识库。业务记录中的时间戳、源IDs/revisions和JSON字节原样保留；表hash使用排序后的canonical JSON，审计列出字段替换，不能把脱敏前后全库hash直接比较。

## 怎样取得DO快照（尚未执行的生产前置）

现有部署默认没有导出入口；不能对普通`/api/health`或现有MCP GET声称纯只读。后续用户授权后，管理员须审批维护窗口与最小补丁部署，核对仍绑定同一class/namespace的`primary-v1`；设置`COPY_EXPORT_MODE=read-only`、至少32字符专用随机`COPY_EXPORT_TOKEN`（Cloudflare secret）、JSON owner列表`COPY_EXPORT_OWNERS`。启用期间普通API统一拒绝；不沿用用户会话/OAuth权限，也不部署领域分支的其他改造。

协议是 `POST /__test-copy/snapshot`，Bearer专用token，body必须恰好`{"owners":[1]}`且与配置列表一致；返回snapshotId、字节数、10分钟到期时间及每chunk索引/长度/SHA。`GET /__test-copy/snapshots/<snapshotId>/chunks/<index>`只返回内存已冻结字节，仍需相同token。创建最多一分钟一次；最多50owners、100000行、32MiB、同步预算5秒（语句间检查，不能抢占执行中的SQLite语句；仍受Workers平台执行限额约束），chunk256KiB。超限拒绝，不提供不一致滚动导出降级；大库须另外设计/审批较大限额或单次捕获持久快照。失败创建不返回半快照；过期、重启、再次创建后旧ID返回404，应丢弃旧checkpoint重新捕获。

当前CLI没有网络下载或R2凭据参数。授权后由受控客户端把manifest和原始chunk离线保存，校验并assemble；关闭导出模式/撤销token的生产步骤也须纳入该次授权。媒体后续授权读取只使用manifest引用key，不能执行删除/清理、不下载导出/备份目录或TTS cache；本次支持的是**另行提供的离线媒体**。

## 当前本地验证

针对测试覆盖同步冻结、owner隔离、凭据/身份排除、未知schema/SQL注入拒绝、row/byte/time限额、SHA/count/历史/版本/顺序/SRS保真、新目标/重复还原拒绝、失败清理、媒体缺失/哈希错误/symlink、同snapshot chunk断点与错配拒绝、实际CLI及shadow迁移。Miniflare真实SQLite DO验证没有构造器ensure、普通路由、R2删除/KV队列或alarm副作用，且重启后旧快照失效。生产快照、真实R2下载和云端权限部署未验证、未执行。

固定表策略同时保留practice_completion_stats/receipts、bank_author_requests和study_sync记录；market_share_versions/listening_audio无直接owner列，严格通过同快照market_shares父记录进行owner过滤和还原审计。还原不加载increment_practice_completion触发器，避免receipt插入再次增加已经保存的完成数。媒体元数据仍属于来源时间戳状态，不自动消除网络存储缺口。

最终本地验证（2026-10-07）：`node --test` **514/514通过，0 skipped**，包含10项离线/CLI针对测试与1项真实Miniflare DO测试；`npx tsc --noEmit`、`npm run lint`、`npm run build`（Web与MCP三bundle）、`npm run build:cloud-api`、`git diff --check`均通过。没有修改原生代码，因此本次没有重新运行或声称新的原生78项测试结果。首次全量运行中的Node自动发现文件名冲突已经通过将实现文件改名cloud-copy/copy-export解决，最终运行无失败。
