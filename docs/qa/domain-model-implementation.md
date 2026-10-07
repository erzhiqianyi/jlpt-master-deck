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
