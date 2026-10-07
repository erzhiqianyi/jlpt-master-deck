# MCP领域写入契约与迁移状态

2026-10-07。本文件与server/mcp-tools.mjs、item-schema.mjs、reading-schema.mjs、question-bank.mjs及bank-materials.mjs对齐。implemented=已接现有调用；proposal=尚未提供工具或未完成校验。不能将目标契约当成已发布API。

|规则|状态与真实入口|
|---|---|
|知识点独立保存，不要求六类题齐全|implemented：upsert_review_item。未提供practice_questions保留；[]清空；显式题严格校验。纯片假名/专名仅出适用题，不改变生成偏好为保存要求。|
|按题型创建题、关联知识/材料|implemented独立词汇/语法作者：save_question_draft/get_question_draft，九型严格payload、可零或多个可访问知识关联、owned材料refs；真实普通草稿→用户批准→发布。已有阅读、听力专用作者及种子/日练/mock继续接核心。不伪称存在通用create_question或完整关系编辑UI。|
|已有音频无需重传|implemented：create_listening_question接受owner的audioReference与真实bytes二选一。AU保持旧ID，可挂多LS；材料版本引用AU，不复制上传。|
|已有文章引用|implemented in stage 2：create/update_reading_question可传materialRef{id,revision}，必须owner匹配且全文一致；不按文本相似度自动合并。图片通用引用proposal。|
|局部patch省略不删|implemented：reading/listening/practice各已有patch；数组按旧入口整体替换。upsert_review_item仍是旧条目整体输入兼容契约，不能伪称全字段partial patch。|
|ID+expectedRevision并发控制|partial：模拟卷与独立词汇/语法作者、分享已有expectedRevision；普通阅读/听力/知识/练习patch尚无统一版本冲突控制，proposal。|
|题目新版本与旧快照|implemented canonical不可变版本；源题更新保留旧练习快照。用户显式update_practice_question修改该练习显示版本，历史answers不改；旧未适配练习在首次patch前归档旧版本。|
|稳定答案optionID、旧数字显式base|partial：canonical答案是冻结版本作用域option-ID；旧answerIndex保持0-based；发布draft拒绝未声明base的numeric answer。日练生成器旧兼容路径仍需统一，不能声称全入口一致。|
|批量预校验与幂等|proposal：不添加未接工具空壳。目标requestId+每项sourceIdentity，返回每项accepted/rejected/unchanged及真实ID/revision/state。数据库内一个明确batch事务；音频外部上传与数据库不能承诺跨服务原子性。|
|删除关系与资产独立|partial：删除reading/listening旧库条目时canonical退役且保留版本；历史音频引用阻止清理bytes。旧delete_reading_question对现库删除仍不可恢复，不能承诺恢复功能。通用unlink/restore及资产回收工具proposal。|
|练习draft/approved/published独立|implemented：publish_draft_as_daily_practice保持已有approved/archived门禁；保存未审草稿只归档unscored，不自动ready。普通generate_daily_practice是既有独立直接生成入口，不伪装成走草稿审批。|
|返回真实ID/version/state|partial：原库ID保留，接入入口追加canonicalQuestionId/questionRevision/materialRefs；所有入口统一state封装proposal。|
|结构硬校验与内容审查|partial：23型validateQuestionPayload校验目标span、组句全排列/★、文章空位、检索条件、不同材料引用及选项数；canonical新作者validationMode=strict才启用，旧档案兼容读取不自动升级。strictExamEligible同时要求approved，结构通过不代替语义审查。统一审核写事件proposal。|
|错误fieldpath+code+可恢复建议|partial：现有Zod校验提供path；现有错误/HTTP状态兼容保留。统一required/not_applicable/revision_conflict/duplicate/permission及建议封装proposal。|
|registry schema版本发现/刷新|implemented发现：get_question_registry返回schemaVersion=1、23型level/alias/字段审查/解析步骤/技巧/知识关联指导，真实MCP入口已测。客户端版本协商仍proposal。|
|分享内容版本和当前访问门禁|implemented：get_market_share可选revision；REST GET/PATCH/导入接内容版本、expectedRevision冲突、旧版词条/练习导入。撤回时所有版本及封面拒绝访问；封面版本保留原bytes。沿用现有公开/撤回权限，没有增加未经确认的新私有分享产品模型。历史听力导入因媒体版本支持未完整明确拒绝。|

## 目标返回与错误契约（proposal）

写入返回旧实例ID、canonical ID、revision、state、changed，以及材料引用。幂等重试返回同ID/revision，不增加重复版本。partial outcome逐项说明是否已提交；不能只返回一个true掩盖失败。

错误示例：{code:'revision_conflict',fieldPath:['expectedRevision'],currentRevision:3,recover:'重新读取并基于revision 3合并补丁'}。缺字段建议补真实内容；not_applicable建议改为适用类型或只保存知识；duplicate仅针对显式source identity，不能按stem删除；permission不暴露其他owner资产。过旧schema建议刷新工具schema；语义待审不是技术成功ready。

## 测试证据与后续步骤

server/vocab-seeds.test.mjs覆盖独立保存、显式题与省略/清空；server/question-bank.test.mjs覆盖答案base、版本与alias；server/reading-questions.test.mjs和listening-questions.test.mjs覆盖现有MCP/REST权限与patch；server/mock-exams.test.mjs覆盖expectedRevision；server/practice-explanation-update.test.mjs覆盖答案、相邻题、history不变；新bank-materials.test.mjs覆盖共享、版本冻结、owner引用与原子回滚。

后续先补真实入口的材料/版本和迁移，随后接统一呈现、作答事件与统计，再分步加通用写工具、并发/幂等/结构化错误；每步提供集成测试，禁止一次暴露大量未接工具。全部改造仅本地，不操作生产MCP/学习数据/自动化。

四项收尾的逐项缺口、完成标准、作者实测与浏览器工具阻塞见[清单](qa/four-items-closeout.md)。

### 已实施素材音频读取

`get_material_audio(material_id,revision)`返回owned冻结音频的MCP audio块；`get_material_audio_download`返回无token的授权URL `/api/materials/:id/versions/:revision/audio`。两工具与OAuth下载要求audio:read，保留LS删除后的AU读取；无实际字节报missingMaterial，不返回虚假音频或猜测转写。Node与Cloudflare R2兼容契约测试覆盖owner、scope、LS删除、R2丢失对象。

### 首次呈现契约（已实施）

`get_practice_session`是保存初始presentation checkpoint的写用例，annotation已改为write。在返回第一道题之前冻结整套有序manifest；开始不记答题/SRS事件，未答仍不返回答案或解析。`start_topic_practice`复用此用例。`submit_practice_answer`消费该快照，源题在首次取题后变化也不改评分。answered missingOriginal历史只读，不能用当前题补版本；旧原始记录与分数保留。
