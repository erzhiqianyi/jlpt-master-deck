# Web/MCP结构化题目实施

2026-10-07。接续原生第一阶段，并非浏览器像素验收报告。

## 原来的精确差异与实际修改

|能力|原有Web/MCP组件|本轮实际调用|
|---|---|---|
|canonical渲染快照|只有类型与引用，通用文本选项|服务归属校验后投影payload及material revisions，阅读/听力/练习/自定义考试/MCP真实入口传入共享QuestionRenderer|
|句子组成|四选一，没有完整排列|片段排列、★、移除、完整排列才能提交；提交canonical ★ option，完整顺序另存历史/本地考试|
|文章文法|字符串猜空位|明确blankId与共享article，多题各自答案；不重复旧单段原文|
|综合阅读/信息检索|单passage，没有表格结构|独立A/B正文，条件、矩形表格和单位；窄屏横向访问|
|发话表达|纯字符串选项|optionMaterials绑定图片material revision，alt及HTTP(S)/PNG数据URL|
|听力概要|问题和选项立即显示|共享播放器ended事件解锁；pause不解锁；Web共享AU组复用完成状态，MCP通过既有get_material_audio读取冻结revision，权限仍需audio:read|
|目标词|第一个字符串命中|UTF-16精确span及安全边界；JapaneseText保留配置的日语分词/红色样式|

REST原有答案字段行为不变。MCP未答DTO删去canonical answer、correctOrder、答案解析、转写与翻译；提交后才返回完整冻结内容。服务对排序要求完整无重复排列，所选文本必须对应★槽；仍按原canonical答案判分，不按排列重新定义答案。已有attempt snapshot优先于当前源题。材料projection带schemaVersion=1以兼容原生BankCachedVersion；不会把派生presentation递归写入canonical legacy。

测试真实React点击排序控件；测试MCP handler完整提交、非法排列无写入、完整顺序恢复、后续题答案未泄漏、源题修改后冻结历史保留。全仓503/503通过；新增DOM测试是结构/交互测试，不代表浏览器布局截图。type/lint、Web/MCP三个bundle与Cloud API构建通过，未部署。在部分排列恢复、新闻退休与最后引用清理完成后，全仓再次503/503通过，TypeScript、ESLint和上述所有构建再次通过。

## 尚未闭环的差异

- Web/MCP像素、真实浏览器音频和网络图片错误/加载状态尚未验收，当前工具缺失。
- Web未提交部分排列已加入按账户/attempt与题目版本隔离的本浏览器恢复；不写作答事件。完整提交顺序继续保存。MCP未提交部分排列跨退出恢复不在本次Web专项范围，已提交顺序由服务恢复。
- 用户已取消新闻练习及其专用记录，相关入口、接口、类型与兼容路由本轮退休。普通本地MockExamPanel仍保留原有local mock考试功能，不能把它误称为新闻专用模块。
- Web阅读既有答后解析/朗读等仍由容器管理；共享素材内容的逐词查词交互尚未逐屏认证。不能将共享数据契约声称为三端完全相同的像素体验。

审批、内容ready/needs_review、客观作答和SRS自评没有改动。没有真实学习数据/生产MCP/自动化操作，没有push、PR、merge或deploy。
