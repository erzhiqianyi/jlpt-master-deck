# 领域模型与统一题库实施切片核验

2026-10-07。独立任务工作区 jlpt-master-deck；分支 domain/unified-question-bank；基线 main=e416bedcf8236638adf8c37c989f62e4200cd327。未 push、PR、merge、deploy；未调用生产 MCP、改真实学习数据或自动化。

## 本轮实际实现

1. 知识点 upsert 不受六种题型偏好强制；纯片假名/独立活用可保存。明确提交的词汇 seeds 仍严格校验。省略 seeds 保留旧内容；旧不完整 seeds 不阻塞知识点独立更新。
2. 统一题型与旧 kind 别名纯契约；数字答案要求来源显式基数，answerIndex 固定0基，文本答案重复或字段冲突拒绝。
3. 追加题目、不可变版本、来源 alias 存储，Node/Cloudflare 初始化一致；DR 创建/修改/删除事务归档 raw unreviewed/unscored 内容。批准发布保留原 PR实例ID、顺序/答案/快照并写 canonical ID/revision 与DR/PR映射。省略ID使用相同flattened来源路径，不按stem自动合并。
4. 草稿删除保留原题；旧草稿删除前归档原内容。已发布后再归档旧版本不降级最新 ready；历史冻结引用不变。
5. Web/MCP/native 模型保留 canonical 引用，MCP 未答 session 不泄答案；native 已映射候选按canonical去重。旧候选还按旧ID，未进行全库迁移。
6. 两种 Web考试入口实际共用 QuestionOptions；容器控制提交与 reveal。其余内容/解析 renderer 未统一。
7. 显式 JSON 清单 dry-run 审计 CLI：没有 DB 默认路径，不联网；逐条接受/拒绝与重复候选，不能自动合并同stem。
8. 嵌套SQLite事务使用savepoint；支持市场导入的外层事务，内层失败可回滚、外层失败仍整体回滚；Cloudflare原生事务回归通过。

## 最终冻结源码检查

- `node --test`：448 tests，448 pass，0 fail/skip。
- `npx tsc --noEmit`：通过。
- `npm run lint`：通过。
- `npm run build`：Web及三个MCP app模式通过；保留原项目大bundle提示。
- `swiftc -frontend -parse apple/Sources/NativePractice.swift`：通过；不是Xcode设备构建或UI验收。
- `git diff --check`：通过。
- 日志保存在本工作区 `.local/domain-final/`。

首次437/440的3失败是构建前置与沙箱listen限制。构建后仍listen EPERM，获同机本地检查许可后完整通过。新增草稿事务曾导致5项市场导入回归，已修复并在最终448全量中覆盖；不把该回归归类为环境失败。

## 图与视觉证据

- 3领域 SVG + JSON 源和 PNG：标题/图例/实体/引用基数与事件虚线逐张目视；QuickLook方形输出曾裁切，现PNG保留完整图并修正交叉标签。详图表达目标模型，已/未实施见领域文档阶段表。
- 23题型×2布局×3状态的138 SVG为**概念图**；HTML索引可切换并列浏览。没有全型实际截图/长正文/长解析/音频时序验收；普通阅读类型仍共用短占位正文，不能凭图数量认定覆盖。
- IAB返回 unavailable，未宣称真实UI已打开。open_in_codex总图请求queued。
- Library已发现prepared保存能力，官方helper完整取得，但本机Python3.9不支持helper注解，启动即失败，**没有上传**。未改官方helper、未强装运行时、未降级绕过prepared路线。本地可读PNG/HTML仍可交付；原生附件待环境支持。

## 剩余实施（整体目标尚未完成）

全 owner 原始清单和全库兼容迁移/对账；item seeds、reading、LS、mock全部写入口；素材版本/组/知识点关联；后台候选与冻结manifest；新增增量同步/offline媒体依赖；AnswerSubmitted/MemoryRated分离与日期统计投影；分享版本授权；全部Web/MCP/native题型renderer与完整fixture/实际截图；原生Xcode构建与iPhone/iPad真实练习回看。

旧删除练习行为仍会按现有逻辑删除部分作答记录，未改为完整事件历史保留；新独立题目版本不随组合删除。独立库目前是追加切片，尚不能成为全库唯一权威。ready表示批准可练习，不代表严格JLPT eligibility核验。不要部署或生产迁移此未完成架构。

## 第二阶段：材料与消费写入口（2026-10-07）

本地追加bank_materials/material_versions/material_groups/group_versions。文章、音频按显式身份与owner保存不可变版本；题组保存有序题引用；不按相同stem合并。reading支持显式article引用、正文变化拆分、删除退役保留版本；LS共享AU，不重传音频，转录更新生成新材料/题版本，历史媒体引用阻止删bytes。草稿归档保留全部section上下文。

item seeds、daily/topic、mock创建/更新、市场词条与练习导入接canonical核心；旧练习第一次局部patch前保存旧版本。相邻题、旧答案及旧history保持。Web/native题生成携带canonical元数据，index与完整题生成保持一致；语法组句/篇章能在题型选项区分。MCP与Web/iOS接listening-expression（N3–N5），不修改N1正式清单。普通practice解释刷新、旧库全量反填及所有复制修复入口仍待接。

新增知识点/23题型/MCP/整体架构文档并相互链接；整体架构JSON/SVG/PNG使用本机QuickLook渲染，发现领域小框字号溢出后调整；没有把架构PNG当产品UI截图。

- 最终 `node --test`：454/454通过，0 fail/skip（包含Cloudflare runtime、MCP/REST、真实材料共享、跨owner拒绝/回滚、历史冻结、原生bundle一致性）。
- `npx tsc --noEmit`、`npm run lint`、`npm run build`（Web+3 MCP模式）、`npm run build:native-questions`、`swiftc -frontend -parse apple/Sources/*.swift`及`git diff --check`通过。
- 日志归档在 `.local/domain-stage2/`，只验证本机和本地Cloudflare模拟。没有Xcode签名构建或真实跨端UI运行。
- 首次全回归450/453：索引新增字段揭示一处真实qtype元数据不一致，已修；两项索引断言扩大到全部元数据一致性；Cloudflare R2删除断言改为历史保留bytes且旧题路由404。最终全量覆盖修正。

剩余范围按architecture与MCP契约标记继续：完整历史反填、所有剩余写入口；canonical增量同步与Apple离线消费；全QuestionRenderer/全型真实fixture与各入口状态；客观作答与自评事件/统计日期投影；分享版本和权限恢复；全并发/幂等/结构化错误。整体目标尚未完成，不能作为生产迁移发布。

## 第三阶段进行中：真实呈现、同步、事件与影子迁移

最新origin/main `56be34f`已本地合并为`1905174`，保留其iOS反馈与活用解码修复。Web词汇练习/回看、阅读、听力、模拟卷及MCP practice现使用同一QuestionRenderer/QuestionOptions；录音播放、模拟卷音频使用QuestionAudioPlayer（按钮与可拖动进度）。权限、计时、提交和导航仍由容器负责。23种结构/状态测试覆盖共用框架，尚不等于完整语义fixture或真实浏览器截图，也不等于原生UI全部统一。

23型specifications已接真实get_question_registry；严格作者模式验证目标span、组句排列/★、检索条件、文章空位、不同材料revision、选项数和解析。旧档案读取保持兼容，不自动提升正式试卷资格。

同步分页加入不可变question/material/group revisions和questionStates，owner隔离；iOS校验key/schema、保存版本缓存，AppStore同步/恢复/保存/登出均接这些字段。原生练习与回看按冻结revision读取已有缓存，原生待提交事件携带canonical/revision/type。旧payload或缺版本仍走兼容快照；离线素材/历史AU读取尚不完整。

AnswerSubmitted与MemoryRated追加事件ledger；Web单题/MCP/native replay/新批量snapshot接入稳定事件ID、冲突拒绝、冻结版本校验。新SRS自评不再增加客观correct/wrong，历史legacy_mixed贡献保留。日总结实际消费事件、同题重答计数、旧快照只补缺事件历史；未选不算错；按账号或已保存总结的IANA时区计算自然日，DST 23/25小时已测。旧全量progress快照协议仍存在，不能声称所有旧客户端并发写已迁移。

影子迁移CLI默认只读，显式源/新目标SQLite backup；逐批checkpoint和逐行savepoint、旧表内容hash核对。已覆盖owned/user seeds、草稿、日练、mock、reading、AU/LS；全局无owner词条和孤立LS报告拒绝，数字answer歧义不猜。源码和旧学习表不改；只在合成测试库执行，未运行真实用户迁移。完整生产灰度/回滚、媒体恢复与全历史映射仍待实施。

阶段中验证：全量469/469通过，包含冻结版本作答、旧题改答案后原答案保持、稳定ID重试、多个陈旧计数客户端合并、外owner拒绝及日总结事件投影；tsc、lint、Web+3 MCP构建、Cloud API bundle通过。最新本机Xcode单元65/65通过，含原生冻结版本实际消费、版本作答payload和旧缓存兼容。正在运行四条已有demo UI验收；尚不能宣称UI完成。本机新建独立iPhone17/iOS26.5模拟器，测试使用ignored非生产配置，未配置真实Firebase。
