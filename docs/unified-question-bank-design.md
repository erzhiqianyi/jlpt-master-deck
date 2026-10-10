# 统一题库、练习组合与模拟考试兼容设计

> **已被 schema v3 取代。** 本文描述 v3 之前的数据模型或接口，保留作历史参考。当前结构见 [schema-v3-design.md](schema-v3-design.md)，接口与 MCP 见 [local-backend-mcp.md](local-backend-mcp.md)。

日期：2026-10-07。状态：设计方案；未执行生产迁移、未导入官方样题正文、未修改运行逻辑。

## 目标

单词、语法、阅读、听力的题目独立于练习保存。专项、每日练习、综合练习和模拟考试共用候选题库，通过题目引用、材料分组和冻结版本组合。删除组合不删除原题。网页、iPhone、iPad 使用同一套分类、身份和抽题规则。

## 当前代码与数据证据

- `server/storage.mjs`：词汇和语法题嵌入条目的 `practice_questions`；DR 保存 `content.sections[].questions[]`；发布时将整套题复制到 PR 的 `practice_json`，保留 `sourceDraftId` / `sourceQuestionId`，为发布实例生成题目 ID。
- `server/reading-schema.mjs`：阅读记录内保存 passage、question、四选项、答案、翻译、选项解析、结构分析、注音；没有明确的官方题型、等级、独立材料或材料组字段。
- `server/storage.mjs`：听力已有独立 questions 和共享 audio assets，通过内容哈希复用音频；题目带 questionTypeId。基础训练允许不同于正式 JLPT 的答案形式。
- `server/mock-exams.mjs`：模拟卷完整内容保存在 JSON，题目内嵌 passage/audioUrl；尚无统一题库引用、材料依赖和完整抽题蓝图。
- `src/domain/typePractice.ts`：题型练习正在从条目、阅读、听力构建候选；阅读官方题型靠 tags 匹配。
- `src/data/questionTypes.ts`：已列出 N1 六种阅读题型，不能把“有分类定义”当成“有该类题目”。
- `server/study-sync.mjs`、`apple/Sources/DatabaseCheckView.swift`：已有增量同步；继续使用其游标和变更机制。
- 本次授权 API 完整查询阅读题库：27 条、无后续页；标签主要为教材、指示语、比喻、言换、疑问提示等技能或来源标签，没有标准 reading-* 分类。未逐篇审阅正文，所以六种题型的实际覆盖仍待分类审计。
- DR-001777 的 20 道题仍保存在草稿；对应条目未带这批 practice_questions。草稿也是迁移来源，不能只迁移正式 PR。

上述 native / web 文件存在此前未提交改动；实施时以当前工作区为准并保留这些改动。

## 数据模型

### 1. Question：独立原题

`bank_questions` 保存 owner、稳定内部 ID、现有展示编号映射、module、questionTypeId、level（可空）、status、origin、来源定位、技能标签、itemIds、materialGroupId、revision、创建和更新时间。

完整可作答内容在不可变 `bank_question_versions` 中，包含题干、指示、选项及稳定 option ID、正确答案、解析、选项翻译与分析、证据定位、注音。题型使用正式注册表；不再仅用 grammar / reading 等笼统字段。level 只允许核验值；旧记录未知等级保留 null。

词条和题目采用关联关系，允许一道题关联多个词条，不要求每题依附一个词条。词条删除不级联删除题目。

状态至少区分 draft / needs_review / ready / retired；答题是否可评分、来源是否核验、等级是否核验分别记录。草稿能迁移入库，但不能自动变成正式考试候选。

### 2. Material：文章、音频与图表

`bank_materials` / `bank_material_versions` 保存文章段落、A/B 多篇材料、表格、图像引用、音频 asset ID、时间片段、转写、翻译、材料分析及来源信息。沿用现有音频资产；不重复上传、不把可过期 URL 当作资产身份。

材料采用结构化 blocks（paragraph / heading / table / image），保留原始文本和旧显示版本。旧 passage 首先作为单个文本 block 导入，不凭换行或文章长度擅自重排。证据定位指向 material ID、block ID、文本区间或音频时间。

### 3. MaterialGroup：抽取单位

`bank_material_groups` 定义材料顺序、组内题目顺序、instruction、题型、等级和抽取规则。

- 普通词汇单题：单题抽取。
- 阅读一篇多问、篇章语法：模拟卷默认整组抽取。
- 统合理解：A/B 材料一起保存、一起抽取。
- 信息检索：通知、表格、注释及条件说明不可遗漏。
- 听力一段多问：共享音频与小题成组；支持切片起止时间、播放次数、预览阶段、题目/选项何时可见。
- 专项允许选组内部分小题，但必须带完整所需材料；模拟卷要求组内完整性。

### 4. PracticeSet：组合定义

专项、每日、综合及模拟卷统一以 `practice_sets` + `practice_set_entries` 表示。entry 保存 questionId、questionRevision、materialRevision、顺序、分区和计分规则；不再把独立副本作为题库唯一来源。

编辑草稿可跟随最新版；发布/开考时冻结具体题目和材料版本。修改原题产生新版本，不改变已答记录的答案和得分。旧内嵌内容保留为兼容快照；快照是历史证据，不是另一个待维护题库。

### 5. Attempt：作答身份

作答保存 practiceSetId、entryId、canonicalQuestionId、questionRevision、选择的 option ID、耗时、提交时间。兼容旧 questionId 和 answerIndex，不改写历史分数；旧选项顺序必须保留。

`question_aliases` 关联旧条目种子 ID、DR 题 ID、PR 实例题 ID、阅读/听力 ID 和模拟卷题 ID。展示用 IT/DR/PR/QU/AU/LS 编号与内部 ID 分开，调用接口需解析现有编号映射，避免把展示编号误当内部 ID。

## 阅读题型：全部纳入注册表

依据 JLPT 当前官方试题构成，六种类型如下。现有 reading-* ID 保留。

| questionTypeId | 官方名称 | 等级 | 材料要求 |
|---|---|---|---|
| reading-short | 内容理解（短文） | N1–N5 | 短篇材料及小题 |
| reading-mid | 内容理解（中文） | N1–N5 | 中篇材料及一题/多题 |
| reading-long | 内容理解（長文） | N1、N3 | 长篇材料及多题 |
| reading-integrated | 統合理解 | N1、N2 | 两篇或多篇可比较材料及问题 |
| reading-thematic | 主張理解（長文） | N1、N2 | 论述材料、作者整体主张问题 |
| reading-information | 情報検索 | N1–N5 | 通知、广告、指南、表格等实用信息 |

内容理解长文和主张理解长文是不同类型；不能凭“主旨理解”标签把短文判成主张理解长文。指示语、比喻、对比、言换、因果、观点等作为 skills[]；教材名称和页码作为 source；不与官方题型混在 tags 中。

新增 `questionTypeId`、level、materials/groupId 时旧字段继续可读。按用户确认，现有未分类阅读题迁为 `reading-basic-training`（基础训练），保持已有可练习状态；`officialQuestionTypeId` 暂为空、未知等级 null。基础训练不是第七种官方阅读题型，可用于日常、自主和专项练习；严格 JLPT 模拟卷不默认抽取。后续核验正式题型、等级及材料完整性后，可以同时保留基础训练用途并进入对应官方类型候选。字符数只做辅助特征，不能自动决定等级或官方大题归属。

## 词汇、语法和听力分类

统一注册表带 applicableLevels：词汇六种（汉字读音、表记、语形成、文脉规定、近义替换、用法）；语法三种（形式判断、排列、篇章语法）；听力六种（任务、要点、概要、发话表达、即时应答、综合理解）。

特别处理：N1 不出表记和语形成，N2 有语形成；发话表达适用于 N3–N5。旧 grammar 默认只能确认为形式判断，不能把未知题型强制当排列/篇章语法。听力基础训练、自填和缺可评分答案题作为 supplementary；严格模拟卷排除。听力选项支持官方三选/四选以及以音频呈现选项；考试阶段不提前显示转写、翻译、解析和注音。

## 现有数据迁移与去重

1. 只读盘点所有 owner 的授权数据：条目种子、DR（包括未发布）、PR、阅读、听力、现有模拟卷及历史快照。分别输出来源数、去重候选、分类缺失、材料缺失、解析/答案缺失，不能用单个列表页估算总数。
2. 建立版本化且可重复运行的迁移表 `(owner, sourceKind, sourceId, sourceQuestionId) -> canonicalId/revision`，新增表，不覆盖旧存储。
3. 阅读、听力优先复用现有题 ID；种子复用稳定种子 ID。仅缺 ID 的旧题生成基于 owner + 来源路径的确定性 ID，不在重复迁移时生成新 UUID。
4. 使用 sourceQuestionId/sourceDraftId 和来源映射识别复制关系，再核对完整内容。相同来源但内容不同保留多个版本；缺来源时只将内容指纹用作重复候选，不能仅凭 itemId、题型或同一句题干自动合并。
5. 从 DR 迁移的未审题保留原审核状态。PR 中已可练习题维持原可用性，但严格模拟卷 eligibility 另行审核。未核验来源不升级为官方原题。
6. 对旧阅读保存全文、翻译、注音、选项分析、结构分析；相同文章可形成材料共享候选，但明确来源和题目关系确认后才合并。听力沿用 audioAssetId/hash，保留 AU/LS 映射和本机资产缓存。
7. 原 PR/模拟卷内嵌内容冻结为历史版本，为组合建立引用；保留历史实例题 ID 的 aliases，不删除原 answers / attempts / completion stats。
8. 旧接口通过适配层返回原字段；过渡期单一写入口在事务内更新新库与旧格式投影，投影不是第二个权威来源。旧客户端请求和读到的修订号均兼容，禁止两边各自编辑。
9. 迁移先 dry-run，再数据库快照、事务执行、对账。部署按用户/版本切换；对账不一致保持旧读路径，暂停新写路径或回放变更后再回退，不能仅切旧读后丢失新库新增题。

## 删除语义

- 删除 DR / 专项 / 模拟卷：仅删除对应组合和编辑草稿；原题、材料、历史作答保留。
- 原题停用：不进入新抽题，历史冻结版本仍可查看。
- 原题永久删除：独立动作，检查所有组合、历史和材料引用；不得随组合级联删除。
- 音频/图像清理：仅在所有题目、版本、历史引用均不存在时回收，不因删一个 LS 而删除共享音频。
- DR-001777 这类只在草稿存在的题：必须先成功入独立库并对账，之后删除草稿才不会丢内容。

## 三端同步和抽题

后台统一候选查询、题型和蓝图规则。`/api/sync` 增量增加 questions、questionVersions、materials、groups、sets 和 tombstones；复用现有游标、分页、版本校验与账号隔离。同步结果先保存本机成功，再更新可见状态。

iOS/iPad 本地题库保存相同 canonical IDs 和 revision，不再只从 packs 拼出综合题库。在线模拟卷由后台生成并返回冻结清单；离线支持用已下载题库和同版本算法生成练习，恢复联网后上传清单及答题事件，不重新抽题。

文字可用不等于听力可离线播放；显示材料下载状态，未下载必需音频的题不进入离线候选。正文、答案、解释仍需权限和练习阶段控制，兼容现有 MCP 未答题答案访问限制。

## 从题库生成模拟考试

蓝图包含 level、分区、题型配额、材料组数量、总小题数、时间、来源/审核策略、技能覆盖、去重、最近作答排除和随机种子；生成结果保存蓝图版本、候选版本和具体题目/材料版本。整组抽取会影响小题数量，必须同时验证题组数和小题数。

等级模板来自当前官方构成和时间；旧官方样题不是题数配额依据。题数模板需独立版本和来源，不在本方案硬编码未经核验数字。N1 语言知识+阅读共 110 分钟、听力约 55 分钟。

严格模拟模式只抽 ready、目标等级/适用题型符合、可评分、材料完整且来源符合策略的题；不足时返回具体缺额，不重复凑数、不把其他级别题混入。练习卷模式可明确允许混级、补充题和部分材料小题。

评分先提供原始正确率和分区正确率；不得把题库自行配分当作官方尺度分数或官方合格判定。

## 官方样题与缺题补充

- 以官方六种类型作为所有类型覆盖要求，已有分类定义但题量为零也显示入口与缺额。
- 官方问题例集可检视短篇、多问长文、多文本比较、作者主张、图表/公告等呈现方式；登记官方 URL、等级、大题、PDF 页码、答案来源和材料结构。链接索引记录与可评分题库记录分开。
- 先将现有未分类阅读记录作为基础训练兼容，不阻断现有学习；再逐篇核验官方类型，分别统计基础训练题数和每级每型的 ready 题数、材料组数及待核验数。现在不能将未分类误报为“该类型没有原题”。
- 缺少可用题时按官方格式编写独立原创同型题，标 ai_generated；正文、四选项、正确答案、逐项证据、全文翻译及结构分析完整审核后入库。
- 官方明确说明问题例集部分 N1/N2 出处文章不可无授权转载；此类内容保留外部参考，不自动全文复制、发布或共享。已获适当授权的样题才作为 official_sample 原题导入。

官方依据（2026-10-07 核对）：

- https://www.jlpt.jp/guideline/testsections.html
- https://www.jlpt.jp/guideline/pdf/n1_revised.pdf
- https://www.jlpt.jp/guideline/pdf/n2.pdf
- https://www.jlpt.jp/guideline/pdf/n3.pdf
- https://www.jlpt.jp/samples/forlearners.html
- https://www.jlpt.jp/samples/sample09.html
- https://www.jlpt.jp/samples/pdf/N1-mondai.pdf
- https://www.jlpt.jp/samples/pdf/N2-mondai.pdf
- https://www.jlpt.jp/samples/pdf/N3-mondai.pdf

## 实施顺序与验收

1. 完成题型注册表与新库 schema、来源 aliases、版本/材料组模型；补齐阅读字段兼容。
2. dry-run 数据审计与迁移，逐篇完成阅读分类；确认 DR-only 题成功保存。
3. 网页与 native 同步同一库；综合/题型专项改为库查询，旧 PR 继续可练习。
4. 新专项编辑器支持按等级、模块、官方题型、词书、教材、技能、审核状态筛选，选择单题/整组并排序；正式发布冻结版本。
5. 模拟蓝图与组卷接口，材料/计时/评分规则跨端一致；缺额报告准确。

必要验证：迁移重跑 ID 不变；权限账号隔离；历史答案与分数不变；删除草稿/组合原题仍在；原题更新旧轮次不变；一文多问/A+B/信息表格不拆错；共享音频不误删；听力三选及音频选项阶段正确；离线缺媒体不抽到；增量同步删除和失败恢复；网页、iPhone、iPad 实际完成一轮与历史回看。

本轮只交付设计和证据；运行行为、生产数据迁移、六种题型实题补充、部署和设备验收均未执行。
