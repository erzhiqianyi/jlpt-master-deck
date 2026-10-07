# 最终有限验收矩阵

2026-10-07；以当前代码为准。本轮有限清单：部分排列跨退出恢复；原生现有45张手机图和最终iPad修复图逐张检查；精确目标词；旧17类宽屏重拍。用户已明确取消新闻练习且不需要其专用记录，本轮退休相关入口/接口/兼容分支，保留通用题库、素材、作答历史。不读写生产数据库，不删除外部新闻文件。

## 23类实现 / 测试 / 视觉

共享React TypedQuestionContent和Swift NativeTypedQuestionRenderer按canonical payload消费，以下“实现”不代表像素认证。测试fixture覆盖全23类；专项交互与旧兼容UI覆盖分别记录。尚待的视觉明确列出，不借历史图声称新渲染器通过。

|稳定kind|实现|自动测试|原生视觉|
|---|---|---|---|
|vocabulary-kanji-reading|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张新图待逐张检查；手机历史基线|
|vocabulary-orthography|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张新图待逐张检查；手机历史基线|
|vocabulary-word-formation|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张新图待逐张检查；手机历史基线|
|vocabulary-context|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张新图待逐张检查；手机历史基线|
|vocabulary-paraphrase|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张新图待逐张检查；手机历史基线|
|vocabulary-usage|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张新图待逐张检查；手机历史基线|
|grammar-form|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张新图待逐张检查；手机历史基线|
|reading-short|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张新图待逐张检查；手机历史基线|
|reading-mid|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张新图待逐张检查；手机历史基线|
|reading-long|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张新图待逐张检查；手机历史基线|
|reading-thematic|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张新图待逐张检查；手机历史基线|
|reading-basic-training|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张新图待逐张检查；手机历史基线|
|listening-task|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张新图待逐张检查；手机历史基线|
|listening-points|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张新图待逐张检查；手机历史基线|
|listening-outline|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|手机与iPad已逐张检查并归档|
|listening-quick|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张新图待逐张检查；手机历史基线|
|listening-integrated|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张新图待逐张检查；手机历史基线|
|listening-basic-training|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张新图待逐张检查；手机历史基线|
|grammar-composition|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|手机与iPad已逐张检查并归档|
|grammar-text|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|手机与最终iPad已逐张检查并归档|
|reading-integrated|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|手机与iPad已逐张检查并归档|
|reading-information|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|手机与最终iPad已逐张检查并归档|
|listening-expression|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|手机与最终iPad已逐张检查并归档|

## 入口审计（一次完整引用检查）

|入口|实施状态|测试证据|视觉状态/边界|
|---|---|---|---|
|Web PracticePanel/PracticeReviewPanel|canonical+排序提交/回看，部分排列本轮已补本浏览器恢复|React点击+冻结快照/MCP存储；最终全仓503/503通过|无浏览器工具，阻塞|
|Web ReadingPanel|canonical A/B/表格/空位+原容器判分|共享DOM/服务契约|浏览器阻塞；共享文章逐词查词尚未逐屏认证|
|Web ListeningPanel练习/库|canonical图片、完成音频才显示概要选项；freeResponse|DOM时序/文本框，服务兼容|浏览器阻塞，真实网络/媒体失败状态未认证|
|Web DesignedExamPanel|canonical+冻结revision+完整排序；部分排列本轮已补本浏览器恢复|考试状态/共享DOM|浏览器阻塞|
|MCP App practice|canonical/redacted DTO；真实get_material_audio/submit_practice_answer|实际MCP handler+完整顺序恢复/非法提交无写入|宿主像素工具阻塞；已提交顺序服务恢复；未提交MCP跨退出草稿不在Web专项范围|
|原生NativePractice/阅读详情/听力组/解析|同一NativeTypedQuestionRenderer，完整/部分排序checkpoint；现有素材/ID|原生78单测、真实手机与iPad交互|逐图证据区分旧/新/修复版本|
|题型指南/预览、官方sample、普通本地MockExamPanel|说明/legacy展示入口，不是新canonical bank的通用消费入口|现有兼容测试保留|不新增scope，不认证其23类任意payload|
|新闻周期练习/专用记录兼容|用户指示退休；不再作为未完成项|入口/接口/引用移除检查与回归|无生产或外部文件删除|

## 功能差异的有限剩余清单

1. Web/MCP浏览器像素、真实浏览器网络音频/图片失败加载体验：缺工具，保持阻塞。
2. 共享阅读素材的逐词查词未逐屏认证；不是A/B、表格或判分未实现。
3. 部分排列恢复采用用户/attempt或会话命名空间、题目版本/选项签名校验；它是UI草稿，不生成作答事件或正确率，跨设备同步不在本轮。
4. 原生原图检查和最终回归结果继续填入本矩阵对应行，不新增无关产品能力。

## 最后代码状态的回归（2026-10-07）

新闻专用路由、local HTTP/MCP工具、hosted排除名单和对应记录兼容分支已移除；普通本地mock、自定义试卷、通用practice/attempt保留。自定义试卷沿用的样式更名exam-focus，未删除通用布局。

最后运行：node --test 503/503（0 skipped）；TypeScript、ESLint、Web/MCP三bundle和Cloud API构建通过。原生78单测通过；手机精确目标词/最终表格/图片三个UI方法通过，表格横向滚动另一个方法通过；旧17类iPad加精确目标词共五个UI方法通过。测试数据和音频均为本地QA fixture，无生产操作。

95张已目视接受的原始PNG在native-typed-visual/evidence.json；20张修复前诊断图单独记录；新拍115张旧17类/精确目标词宽屏图尚未逐张检查，不记作像素通过。待检查原图已导出，见pending-wide-inspection.json，无需重拍。
