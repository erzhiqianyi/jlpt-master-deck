# 原生逐型视觉证据（兼容呈现范围）

本轮使用真实 `NativeQuizView`、`ReadingPracticeView`、`ListeningDetailView`，通过 DEBUG fixture 入口启动；并非替代页面或概念图。23个类型均列在原始 fixture 中，其中18个能进入现有文本兼容呈现，5个结构化功能缺失。**18类文本页面有截图，不等于18类完整正式payload验收通过，更不是23类通过。**

原创 QA 内容位于 `apple/Fixtures/native-question-visual.json`；长正文/解析使用重复段落做滚动压力测试，不能作为正式日语题目质量或跨段推理认证。两段音频使用本机 Kyoko 日语语音合成，PCM WAV 16kHz；实际由 AVAudioPlayer 播放。无生产题目、用户作答或生产网络参与。

原生尚未拥有与 Web/MCP 一致的共享 typed payload renderer；当前三套组件仍消费 legacy NativeQuestion/ReadingQuestion/ListeningItem。`questionTypeId` 能传递身份，不意味着类型策略已连接。

每张原始PNG的模拟器、XCTest方法、时间和来源bundle记录在 [evidence.json](evidence.json)。手机18类共130张；iPad宽屏仅grammar-form的5张新整屏截图已检查有效，其余17类待重新捕获。手机包含未答、作答与解析状态，听力包含播放中、正确/错误或自由回答结果。词汇/语法 QA canonical revision=1；阅读/听力使用未绑定canonical ID的独立legacy fixture。fixture文件schemaVersion=1及SHA256记录在evidence.json，均不对应生产发布版本。

## 已复现并修复

题卡及题目列表原来直接用 source question，判题却解析 canonical frozen revision。实际 UI 测试先冻结题目、再把源题prompt改为“当前源文本（不应显示）”：修复前断言失败，修复后必须看不到该源文本。现在题卡及列表都调用 `resolvedBankQuestion`，与答案/回顾使用同一版本。失败证据仅保存在 `.local/native-frozen-display-before.xcresult`，不会当作通过截图。

## 必须继续实现的正式呈现能力

- 文法句子组成：`assembly/correctOrder/starSlot` 尚未进入 NativeQuestion 和交互控件。
- 文章文法：`blankId` 多空位正文、每空对应选项尚无原生结构化消费。
- 综合阅读：虽有 materialRefs 身份字段，当前 ReadingQuestion 仍是单 passage，缺两个独立 A/B 素材呈现。
- 信息检索：ReadingQuestion 没有 taskConditions 或表格行列模型，不能以单段文本声称通过。
- 发话表达：ListeningItem 的 choices 是字符串，没有图片选项消费。
- 听力概要：当前页面总是立即显示 question，未消费“先听后问题”时序策略。
- 词汇目标：当前使用 promptTarget 字符串匹配下划线，未消费统一payload的精确span偏移；重复同词的定位仍须专项实现。
- 综合听力：本轮该型是一题文本兼容fixture；既有分组流程可多问，但本轮不认证正式跨题条件/多素材语义。

因此后续原生工作首先应连接统一类型payload策略，再对以上结构做真实截图复验。权限拒绝、所有型暂停恢复、图片、Dynamic Type和真机均不在本轮逐型截图覆盖内。已有代表性暂停恢复/权限测试仍有效，但不能扩大到所有型。

Web/MCP像素验证仍缺浏览器控制工具；未安装或换环境绕过。其DOM/契约测试通过仅说明结构和行为，不能替代像素验收。原生上述缺口是功能问题，与Web工具阻塞分开记录。

## 类型与图片

|类型|原生当前证据|iPhone|iPad宽屏|
|---|---|---|---|
|vocabulary-kanji-reading|真实文本兼容页面，正式策略仍有限|[PNG](iphone-vocabulary-kanji-reading-unanswered.png)|旧捕获异常，待重拍|
|vocabulary-orthography|真实文本兼容页面，正式策略仍有限|[PNG](iphone-vocabulary-orthography-unanswered.png)|旧捕获异常，待重拍|
|vocabulary-word-formation|真实文本兼容页面，正式策略仍有限|[PNG](iphone-vocabulary-word-formation-unanswered.png)|旧捕获异常，待重拍|
|vocabulary-context|真实文本兼容页面，正式策略仍有限|[PNG](iphone-vocabulary-context-unanswered.png)|旧捕获异常，待重拍|
|vocabulary-paraphrase|真实文本兼容页面，正式策略仍有限|[PNG](iphone-vocabulary-paraphrase-unanswered.png)|旧捕获异常，待重拍|
|vocabulary-usage|真实文本兼容页面，正式策略仍有限|[PNG](iphone-vocabulary-usage-unanswered.png)|旧捕获异常，待重拍|
|grammar-form|真实文本兼容页面，正式策略仍有限|[PNG](iphone-grammar-form-unanswered.png)|[PNG](ipad-wide-grammar-form-unanswered.png)|
|reading-short|真实文本兼容页面，正式策略仍有限|[PNG](iphone-reading-short-article-unanswered.png)|旧捕获异常，待重拍|
|reading-mid|真实文本兼容页面，正式策略仍有限|[PNG](iphone-reading-mid-article-unanswered.png)|旧捕获异常，待重拍|
|reading-long|真实文本兼容页面，正式策略仍有限|[PNG](iphone-reading-long-article-unanswered.png)|旧捕获异常，待重拍|
|reading-thematic|真实文本兼容页面，正式策略仍有限|[PNG](iphone-reading-thematic-article-unanswered.png)|旧捕获异常，待重拍|
|reading-basic-training|真实文本兼容页面，正式策略仍有限|[PNG](iphone-reading-basic-training-article-unanswered.png)|旧捕获异常，待重拍|
|listening-task|真实文本兼容页面，正式策略仍有限|[PNG](iphone-listening-task-unanswered.png)|旧捕获异常，待重拍|
|listening-points|真实文本兼容页面，正式策略仍有限|[PNG](iphone-listening-points-unanswered.png)|旧捕获异常，待重拍|
|listening-outline|真实文本兼容页面，正式策略仍有限|[PNG](iphone-listening-outline-unanswered.png)|旧捕获异常，待重拍|
|listening-quick|真实文本兼容页面，正式策略仍有限|[PNG](iphone-listening-quick-unanswered.png)|旧捕获异常，待重拍|
|listening-integrated|真实文本兼容页面，正式策略仍有限|[PNG](iphone-listening-integrated-unanswered.png)|旧捕获异常，待重拍|
|listening-basic-training|真实文本兼容页面，正式策略仍有限|[PNG](iphone-listening-basic-training-unanswered.png)|旧捕获异常，待重拍|
|grammar-composition|功能缺口：assembly/correctOrder/starSlot未进入NativeQuestion|无通过截图|无通过截图|
|grammar-text|功能缺口：blankId和多空位文章无原生结构化呈现|无通过截图|无通过截图|
|reading-integrated|功能缺口：两个独立article refs未提供A/B原生呈现|无通过截图|无通过截图|
|reading-information|功能缺口：taskConditions/表格在ReadingQuestion中缺失|无通过截图|无通过截图|
|listening-expression|功能缺口：图片选项没有原生渲染字段/消费|无通过截图|无通过截图|

## 本地音频校验

- `native-visual-quick.wav`：78304 bytes，SHA256 `3502193b60856dab38742694b81c89a923acd3f675555fed529838dadda1b000`。
- `native-visual-narrative.wav`：355588 bytes，SHA256 `06d30b08b2e4fb55e34f62fe102835583b8ce366084147099fb1617ea53526f8`。

## 复验方式

在已配置的本地 Xcode 工程执行 `xcodebuild test`，scheme `JLPTMasterDeck`，仅选择 `JLPTMasterDeckUITests/NativeQuestionVisualTests`；分别指定专用 iPhone 与 iPad destination。全部原生单元测试选择 `JLPTMasterDeckTests`。通过后用 `xcrun xcresulttool export attachments --path <bundle> --output-path <folder>` 导出原始截图；不得把失败方法中的附件归为通过证据。DEBUG入口为 `--demo --visual-type=<registry ID>`；Release不启用。

## 本次安全里程碑结果

135张原始PNG入库：手机18类130张、宽屏grammar-form 5张。目视检查了手机汉字目标/长句用法/语法反馈/阅读长文与解析/即时应答/自由回答结果/听力回顾，以及宽屏语法未答和长解析。未逐张目视所有附件；自动交互通过不等于逐张视觉通过。

旧宽屏18型交互4方法通过，但 `app.screenshot()` 导出图有异常方向/黑边裁切；130张旧宽屏图仅留`.local/native-visual-ipad-export`作诊断，未计入repo通过证据。已将iPad捕获改为 `XCUIScreen.main.screenshot()`，单类复验及两张目视正常；其余17型需要重新跑整屏捕获和目视。不要复用旧宽屏图作为验收。

最新验证：Node 494/494，原生单元71/71；手机视觉4方法、原有流程3方法、旧宽屏交互4方法、新宽屏整屏单类1方法全部通过。tsc/lint、Web+三MCP及Cloud API构建通过。截图辅助改动已由单类Xcode编译/UI验证；未再次运行其余17类新捕获流程。本地结果bundle及日志在`.local/domain-final/native-visual/`及`.local/native-*.xcresult`。
