# 旧数据迁移计划与真实实施状态

> **已被 schema v3 取代。** 本文描述 v3 之前的数据模型或接口，保留作历史参考。当前结构见 [schema-v3-design.md](schema-v3-design.md)，接口与 MCP 见 [local-backend-mcp.md](local-backend-mcp.md)。

2026-10-07。结论：需要影子迁移后才能将canonical作为唯一权威，但**没有执行用户真实数据库迁移**。已实现增量schema、主写入口适配、惰性归档、JSON审计，以及指定SQLite影子副本回填/检查点/旧表哈希对账；仍没有生产读切换、完整历史冻结恢复、媒体恢复演练或全领域迁移。

关联：[架构](architecture.md)、[领域模型](domain-model.md)、[MCP](mcp-domain-contracts.md)、[验证证据](qa/domain-model-implementation.md)。

## 已实现能力

新增bank_questions / bank_question_versions / bank_question_aliases、bank_materials / bank_material_versions、bank_material_groups / bank_material_group_versions。旧表与item、question、AU、LS、DR、PR、attempt、SRS IDs不替换。来源alias限定(owner,source_kind,source_id,source_question_id)。新写入逐步接核心，旧草稿编辑/删除前归档，旧practice第一次patch先保存原版本，不等同全库已回填。

审计CLI只接受显式JSON清单，不读取默认数据库、不联网；报告接受/拒绝、指纹和重复候选，不按stem合并。旧answerIndex固定0-based；numeric answer要求可信显式base，否则needs_review/不评分；字段冲突不静默覆盖。草稿原内容和section上下文保持unreviewed/unscored。旧材料/题版本不可变，练习引用冻结revision，不跟latest。

## 分阶段计划（未全实现）

|阶段|输入/产物|验收与限制|
|---|---|---|
|审计|只读指定数据库副本与owner范围；旧表/JSON源、ID、关系、答案base、媒体库存和冲突清单|文件/行count及hash前后不变；不输出token或媒体bytes|
|备份验证|一致性SQLite backup、媒体hash、schema及代码版本、恢复演练|有WAL时不能只cp主文件；integrity_check与媒体count/大小/hash一致|
|影子回填|先在隔离副本写追加版本/alias/材料组；旧表不覆盖|每batch事务；source hash、registry version、幂等key及checkpoint；拒绝项单列|
|对账|owner/source/type计数、映射、payload fingerprint、原选项/答案、引用闭包和媒体hash|可评分题答案全部一致；歧义隔离；旧ID可追踪；SRS/attempt/answers原hash不变|
|灰度读切换|受控owner/入口flag优先canonical，旧snapshot兼容fallback；确认客户端能力|MCP/Web/iOS等价；未审题不入池；分页离线/媒体依赖完整；统计去重一致|
|回滚演练|关canonical读flag回旧读路径；旧表/新表/媒体全部保留|新创建内容也能经适配读，不能单纯回退代码丢新题；不DROP新增版本|
|延后旧存储处理|观察和恢复演练后再评估旧库清理|须另外明确授权；本任务不删除真实数据|

`scripts/migrate-bank-shadow.mjs`现在默认只读审计，必须显式`--source`；`--execute --target`只接受全新目标，使用SQLite backup而不是复制主文件。`--resume`仅接受有检查点且旧表与源库哈希一致的影子目标。每批事务、每行savepoint，拒绝项保留来源/owner/原因；检查点限定整个旧库内容hash，重跑不增重复版本。处理owned/user item seeds、draft、daily practice、mock sessions、reading文章、AU及其LS题组。全局review_items没有owner不猜归属，孤立LS缺AU不猜资产，两者阻止报告complete。complete只表示这些来源回填无拒绝项，不代表生产切换或六领域完成。默认路径不读取真实学习库；本任务只运行合成测试。

灰度feature flag、全量历史映射核对、媒体bytes恢复、生产切换仍未实现，不能提供生产迁移命令。生产影子回填与不可逆清理需具体授权。

## 映射、歧义与历史不变量

PR实例不等于canonical题。DR原题路径/无ID扁平编号与sectionContext保留。seed ID跨词条重复时以item ID限定来源。相同stem但任务条件不同不能合并；已知同来源复制通过alias链接。市场导入是导入者独立owner，不复用发布者私有材料权限。

AU保留原asset ID与SHA-256，多个LS共享一个音频材料；文章副本文字相同仅列候选，无明确依据不自动去重；A/B独立材料有序引用。题答案/选项顺序逐项hash，新增optionID不重排序。通用说明可结构化，目标词、主体、★、篇章空位与检索条件必须保留。

缺可信numeric base：报告fieldPath/sourceIdentity/raw值/choices及原因，needs_review、不评分。不能按“多数1-based”修正DR947已经人工修复的20题。旧answerIndex与answer矛盾须隔离。SRS保rating/eventId/排程，wrong不推forgot；attempt保attemptId、题序、selected、correct、timestamps、elapsed与提交状态。缺原题标missingOriginal，不用新版本重新算成绩。未答不算错。

分享保owner/visibility/withdrawn和内容snapshot，导入映射独立；未授权关系拒绝。每个旧item/question/audio/practice/history ID均需完整映射报告。pending事件ID保留，重试不生成第二条学习行为。

## 幂等、对账和退路

计划的batch原子单位是一笔SQLite事务；外部音频上传不在跨服务原子承诺内。批次需source snapshot hash、schema/registry version、owner范围、行key、成功/拒绝计数和checkpoint；同batch重试不增加版本/事件。source并发变更停止重新审计，不追latest改历史。

对账至少含旧ID映射率、题/版本/alias计数、owner权限、答案相等、材料引用闭包、历史媒体保留、分享可导入、pending去重和历史表hash。只允许新增metadata差异，学习事实不变。回滚优先切读，保新旧表和媒体；备份恢复是最后手段，避免丢之后合法作答。当前已有兼容旧snapshot读，并非可验收的完整灰度/回滚开关。

已接Web/MCP共享renderer、canonical分页同步与iOS版本缓存、作答/自评事件和自然日统计消费。下一步补完整离线材料消费、历史媒体读取、原生共享呈现与分享版本授权，再扩展影子迁移核对和回滚演练。全部未完成前，不宣称生产迁移可用或题库已成为唯一权威。

### 历史身份对账报告（2026-10-07 增量）

本地shadow返回`identityReport.aliases/materials/retained/attempts/counts`。旧行identity与rowHash、旧attempt scoreHash用于对账；`legacyRetained`不是canonical映射成功。无当时完整manifest的历史标记missingOriginal，仅旧作答/分数可读，禁止用当前源题重放或重评分。DR947合成20题0-based与旧表hash已有保护测试。报告输出不会改写真实库；真实执行仍须显式新shadow目标。旧知识/进度/历史ID保持，尚未执行生产切换。
