# 最终有限验收矩阵

2026-10-07；以当前代码为准。本轮有限清单：部分排列跨退出恢复；原生现有45张手机图和最终iPad修复图逐张检查；精确目标词；旧17类现成宽屏原图逐张检查。用户已明确取消新闻练习且不需要其专用记录，本轮退休相关入口/接口/兼容分支，保留通用题库、素材、作答历史。不读写生产数据库，不删除外部新闻文件。

## 23类实现 / 测试 / 视觉

共享React TypedQuestionContent和Swift NativeTypedQuestionRenderer按canonical payload消费，以下“实现”不代表像素认证。测试fixture覆盖全23类；专项交互与旧兼容UI覆盖分别记录。尚待的视觉明确列出，不借历史图声称新渲染器通过。

|稳定kind|实现|自动测试|原生视觉|
|---|---|---|---|
|vocabulary-kanji-reading|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张原图已逐张检查归档；手机历史基线|
|vocabulary-orthography|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张原图已逐张检查归档；手机历史基线|
|vocabulary-word-formation|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张原图已逐张检查归档；手机历史基线|
|vocabulary-context|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张原图已逐张检查归档；手机历史基线|
|vocabulary-paraphrase|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张原图已逐张检查归档；手机历史基线|
|vocabulary-usage|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张原图已逐张检查归档；手机历史基线|
|grammar-form|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张原图已逐张检查归档；手机历史基线|
|reading-short|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张原图已逐张检查归档；手机历史基线|
|reading-mid|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张原图已逐张检查归档；手机历史基线|
|reading-long|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张原图已逐张检查归档；手机历史基线|
|reading-thematic|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张原图已逐张检查归档；手机历史基线|
|reading-basic-training|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张原图已逐张检查归档；手机历史基线|
|listening-task|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张原图已逐张检查归档；手机历史基线|
|listening-points|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张原图已逐张检查归档；手机历史基线|
|listening-outline|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|手机与iPad已逐张检查并归档|
|listening-quick|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张原图已逐张检查归档；手机历史基线|
|listening-integrated|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张原图已逐张检查归档；手机历史基线|
|listening-basic-training|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|旧17类iPad五个UI方法通过，115张原图已逐张检查归档；手机历史基线|
|grammar-composition|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|手机与iPad已逐张检查并归档|
|grammar-text|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|手机与最终iPad已逐张检查并归档|
|reading-integrated|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|手机与iPad已逐张检查并归档|
|reading-information|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|手机与最终iPad已逐张检查并归档|
|listening-expression|Web/MCP/原生已接payload|结构契约+原生fixture；UI见证据|手机与最终iPad已逐张检查并归档|

## 入口审计（一次完整引用检查）

|入口|实施状态|测试证据|视觉状态/边界|
|---|---|---|---|
|Web PracticePanel/PracticeReviewPanel|canonical+排序提交/回看，部分排列本轮已补本浏览器恢复|React点击+冻结快照/MCP存储；最终全仓503/503通过|无浏览器工具，阻塞|
|Web ReadingPanel|canonical A/B/表格/空位+原容器判分|共享DOM/服务契约|浏览器阻塞；共享正文点词查询未接入，legacy/选项查询不能替代|
|Web ListeningPanel练习/库|canonical图片、完成音频才显示概要选项；freeResponse|DOM时序/文本框，服务兼容|浏览器阻塞，真实网络/媒体失败状态未认证|
|Web DesignedExamPanel|canonical+冻结revision+完整排序；部分排列本轮已补本浏览器恢复|考试状态/共享DOM|浏览器阻塞|
|MCP App practice|canonical/redacted DTO；真实get_material_audio/submit_practice_answer|实际MCP handler+完整顺序恢复/非法提交无写入|宿主像素工具阻塞；已提交顺序服务恢复；未提交MCP跨退出草稿不在Web专项范围|
|原生NativePractice/阅读详情/听力组/解析|同一NativeTypedQuestionRenderer，完整/部分排序checkpoint；现有素材/ID|原生78单测、真实手机与iPad交互|逐图证据区分旧/新/修复版本|
|题型指南/预览、官方sample、普通本地MockExamPanel|说明/legacy展示入口，不是新canonical bank的通用消费入口|现有兼容测试保留|不新增scope，不认证其23类任意payload|
|新闻周期练习/专用记录兼容|用户指示退休；不再作为未完成项|入口/接口/引用移除检查与回归|无生产或外部文件删除|

## 功能差异的有限剩余清单

1. Web/MCP浏览器像素、真实浏览器网络音频/图片失败加载体验：缺工具，保持阻塞。
2. 共享阅读正文逐词查词是明确的功能缺口，见下表；不是工具阻塞，不能标记通过。本轮按有限收尾范围记录，不新增产品代码。
3. 部分排列恢复采用用户/attempt或会话命名空间、题目版本/选项签名校验；它是UI草稿，不生成作答事件或正确率，跨设备同步不在本轮。
4. 原生现成115张宽屏原图检查已完成，无新缺陷；全部23类已有iPad原图验收证据，旧17类手机仅历史基线。

## 最后代码状态的回归（2026-10-07）

新闻专用路由、local HTTP/MCP工具、hosted排除名单和对应记录兼容分支已移除；普通本地mock、自定义试卷、通用practice/attempt保留。自定义试卷沿用的样式更名exam-focus，未删除通用布局。

最后运行：node --test 503/503（0 skipped）；TypeScript、ESLint、Web/MCP三bundle和Cloud API构建通过。原生78单测通过；手机精确目标词/最终表格/图片三个UI方法通过，表格横向滚动另一个方法通过；旧17类iPad加精确目标词共五个UI方法通过。测试数据和音频均为本地QA fixture，无生产操作。

210张已逐张目视接受的原始PNG在native-typed-visual/evidence.json；20张修复前诊断图单独记录。现成115张旧17类/精确目标词宽屏原图已检查归档，见native-typed-visual/wide-inspection.json；0张待检查，全部210张SHA256核对通过。本次仅文档和证据变更，沿用3828763最终代码的完整回归结果；未重新运行或声称新的503/78运行。

## 共享正文查词：平台现状（引用审计）

|平台/入口|实际调用|结论|
|---|---|---|
|Web ReadingPanel|App已包WordLookupProvider；ReadingText选项/旧阅读支持查询；TypedQuestionContent.article实际使用components/JapaneseText，只有分词/ruby/目标span，无lookup回调|共享正文未接入；有provider不等于可点词；未逐屏认证|
|MCP App practice|共享TypedQuestionContent同样无正文lookup回调；review-cards另有lookup_word入口|共享正文未接入；复习卡片入口不能替代|
|原生阅读详情/共享article|NativeTypedQuestionRenderer使用JapaneseText及textSelection；japaneseLookupEnabled默认false，仅StudyViews复习卡片开启|共享正文未启用；系统文本选择不算App查询；本轮无该交互通过证据|

证据位置：src/components/TypedQuestionContent.tsx、src/components/JapaneseText.tsx、src/features/reading/ReadingPanel.tsx、src/App.tsx；apple/Sources/QuestionPresentation.swift、apple/Sources/JapaneseText.swift、apple/Sources/StudyViews.swift。

## 工具阻塞的最小解锁入口

- 在同一Mac提供可操作localhost并截屏的浏览器工具，使用隔离QA账号/本地fixture服务；经实际学习→练习、阅读、听力、自定义试卷入口逐屏检查未答/正误/长解析/退出恢复。默认开发服务是否连接真实后端须先核对，不能直接用生产账号替代。
- MCP提供可连接本地隔离MCP服务的App测试宿主及截屏入口，验证practice渲染和工具调用；不连接生产MCP。
- 在这些隔离入口提供允许访问的测试音频/图片成功、延迟及失败URL，实际浏览器测试媒体加载和失败提示。现有本地fixture播放/UI或DOM测试不足以证明真实网络体验。

以上只说明后续解锁条件；本次没有启动这些受阻验收，没有更换执行环境，也没有测试在后台继续运行。本地实现及当前环境可完成的测试/原图收尾已完成；产品共享正文查词缺口与外部工具验收阻塞均明确保留，不能称为三端全部验收。
