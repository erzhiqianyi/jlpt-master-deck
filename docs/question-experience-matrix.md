# 题型 × 入口 × 平台 × 状态体验契约

2026-10-07；概念图，不是实际 UI 截图。完整题型名/等级/别名见 domain-model.md。图与共享 fixture 索引在 ui-question-experience；正式实现逐入口替换，未完成项不得声称统一。

## 当前入口（源码核验）

|入口|当前 Web 消费|当前 Apple 消费|目标内容契约|状态|
|---|---|---|---|---|
|每日/综合/词书/题型专项|StudyPanels PracticePanel|NativePracticeScreen/NativeRound|同型同内容渲染|当前各自实现，尚未全统一|
|答后复盘/历史|PracticeReviewPanel、HistoryPanel|NativePracticeFeedback|冻结版本与已提交答案|不得读当前新答案|
|阅读自主/专项|ReadingPanel/ReadingChoiceGrid|StudyViews 阅读|文章 blocks + 本题任务|保留分词查词交互|
|听力自主/专项|ListeningPanel|ListeningViews|共享 AU + 当前 LS|基础自由回答单列|
|模拟卷|MockExamPanel|当前完整原生模拟能力需后续核验|冻结版本 + 考试容器|交卷前禁止解析|
|自组考试|DesignedExamPanel|原生入口待接入|同型同渲染|不把容器当题型|
|草稿预览/审批|DraftsPanel|NativePracticeDraft|作者模式|保留审核，不进入候选|
|发现预览|MarketPanel|DiscoveryView|获授权冻结版本|权限独立于练习模式|
|官方样题|OfficialModuleSamples|独立官方入口待核验|有许可内容/外链|不自动复制未授权正文|
|MCP嵌入练习|src/mcp-app/practice.ts|非原生窗口|同题型契约与答案权限|服务端未答隐藏仍必要|
|听力跟读/口语训练|ListeningReadAlongWorkspace|ListeningViews相关训练|素材学习模式|非客观单选，不伪造得分|

所有能承载同题型的入口必须渲染同一任务、选项顺序、材料依赖与解析。入口不支持某种材料时明确不可选，不降级丢文章/音频。阅读与听力组题不可随机拆组。所有平台覆盖待实现；表中明确缺口不代表已有功能。

## 平台与状态规格

|平台|布局|共同约束|
|---|---|---|
|小屏 Web/iPhone|单题一列，正文在题干前；答题卡抽屉；底部提交/下一题|44pt/px触区，砖红焦点，颜色+文字状态，长词换行|
|PC/iPad（宽>=768）|题序侧栏 + 内容；阅读正文与任务可并列，顺序仍正文->任务|内容最大阅读行宽约70字；选项纵向相同，不重排答案|
|MCP窄嵌入|采用小屏内容顺序|宿主鉴权控制答案读取；按钮键盘可达|

作答、已选择、提交等待、提交失败、正确/错误/自答结果、解析、暂停、续做、结束/历史、媒体缺失均需 fixture 验证。未提交状态不含答案/解析 DOM；模拟考试选择后仍不暴露正确与否。网络失败保留选项与 eventId；暂停封存计时/播放位置，续做复用原题清单。结果不把未答算错，自评与客观正确率分离。

听力导航显示原始文件名（不能用内部临时缓存名），播放器仅播放/暂停按钮+进度；多个 LS 引用同 AU，切题不触发重复上传。考试预览权限按题型策略控制选项出现，转写/翻译答后显示。阅读保留指示语和证据定位；句子组成显示完整空位和★，文章文法高亮本题 blankId。通用选项说明可由 instructionKey 翻译呈现，目标词及实际否定条件始终可见。

Web 与 SwiftUI 无法直接共用 React 代码。二者共用 JSON fixture、题型 ID、稳定 optionId、展示顺序、设计 tokens 与状态机；原生 Golden/Snapshot 与 Web DOM/视觉比对后才可声称一致。

## 每题型体验图索引

每行提供移动/大屏的作答、结果、解析六张概念图。fixtures.json 是展示数据，标记 design_fixture/strictExamEligible=false，禁止用于生产练习。

|题型|移动：作答 / 结果 / 解析|大屏：作答 / 结果 / 解析|
|---|---|---|
|漢字読み `vocabulary-kanji-reading`|[作答](ui-question-experience/vocabulary-kanji-reading-mobile-answering.svg) / [结果](ui-question-experience/vocabulary-kanji-reading-mobile-result.svg) / [解析](ui-question-experience/vocabulary-kanji-reading-mobile-explanation.svg)|[作答](ui-question-experience/vocabulary-kanji-reading-desktop-answering.svg) / [结果](ui-question-experience/vocabulary-kanji-reading-desktop-result.svg) / [解析](ui-question-experience/vocabulary-kanji-reading-desktop-explanation.svg)|
|表記 `vocabulary-orthography`|[作答](ui-question-experience/vocabulary-orthography-mobile-answering.svg) / [结果](ui-question-experience/vocabulary-orthography-mobile-result.svg) / [解析](ui-question-experience/vocabulary-orthography-mobile-explanation.svg)|[作答](ui-question-experience/vocabulary-orthography-desktop-answering.svg) / [结果](ui-question-experience/vocabulary-orthography-desktop-result.svg) / [解析](ui-question-experience/vocabulary-orthography-desktop-explanation.svg)|
|語形成 `vocabulary-word-formation`|[作答](ui-question-experience/vocabulary-word-formation-mobile-answering.svg) / [结果](ui-question-experience/vocabulary-word-formation-mobile-result.svg) / [解析](ui-question-experience/vocabulary-word-formation-mobile-explanation.svg)|[作答](ui-question-experience/vocabulary-word-formation-desktop-answering.svg) / [结果](ui-question-experience/vocabulary-word-formation-desktop-result.svg) / [解析](ui-question-experience/vocabulary-word-formation-desktop-explanation.svg)|
|文脈規定 `vocabulary-context`|[作答](ui-question-experience/vocabulary-context-mobile-answering.svg) / [结果](ui-question-experience/vocabulary-context-mobile-result.svg) / [解析](ui-question-experience/vocabulary-context-mobile-explanation.svg)|[作答](ui-question-experience/vocabulary-context-desktop-answering.svg) / [结果](ui-question-experience/vocabulary-context-desktop-result.svg) / [解析](ui-question-experience/vocabulary-context-desktop-explanation.svg)|
|言い換え類義 `vocabulary-paraphrase`|[作答](ui-question-experience/vocabulary-paraphrase-mobile-answering.svg) / [结果](ui-question-experience/vocabulary-paraphrase-mobile-result.svg) / [解析](ui-question-experience/vocabulary-paraphrase-mobile-explanation.svg)|[作答](ui-question-experience/vocabulary-paraphrase-desktop-answering.svg) / [结果](ui-question-experience/vocabulary-paraphrase-desktop-result.svg) / [解析](ui-question-experience/vocabulary-paraphrase-desktop-explanation.svg)|
|用法 `vocabulary-usage`|[作答](ui-question-experience/vocabulary-usage-mobile-answering.svg) / [结果](ui-question-experience/vocabulary-usage-mobile-result.svg) / [解析](ui-question-experience/vocabulary-usage-mobile-explanation.svg)|[作答](ui-question-experience/vocabulary-usage-desktop-answering.svg) / [结果](ui-question-experience/vocabulary-usage-desktop-result.svg) / [解析](ui-question-experience/vocabulary-usage-desktop-explanation.svg)|
|文法形式の判断 `grammar-form`|[作答](ui-question-experience/grammar-form-mobile-answering.svg) / [结果](ui-question-experience/grammar-form-mobile-result.svg) / [解析](ui-question-experience/grammar-form-mobile-explanation.svg)|[作答](ui-question-experience/grammar-form-desktop-answering.svg) / [结果](ui-question-experience/grammar-form-desktop-result.svg) / [解析](ui-question-experience/grammar-form-desktop-explanation.svg)|
|文の組み立て `grammar-composition`|[作答](ui-question-experience/grammar-composition-mobile-answering.svg) / [结果](ui-question-experience/grammar-composition-mobile-result.svg) / [解析](ui-question-experience/grammar-composition-mobile-explanation.svg)|[作答](ui-question-experience/grammar-composition-desktop-answering.svg) / [结果](ui-question-experience/grammar-composition-desktop-result.svg) / [解析](ui-question-experience/grammar-composition-desktop-explanation.svg)|
|文章の文法 `grammar-text`|[作答](ui-question-experience/grammar-text-mobile-answering.svg) / [结果](ui-question-experience/grammar-text-mobile-result.svg) / [解析](ui-question-experience/grammar-text-mobile-explanation.svg)|[作答](ui-question-experience/grammar-text-desktop-answering.svg) / [结果](ui-question-experience/grammar-text-desktop-result.svg) / [解析](ui-question-experience/grammar-text-desktop-explanation.svg)|
|内容理解（短文） `reading-short`|[作答](ui-question-experience/reading-short-mobile-answering.svg) / [结果](ui-question-experience/reading-short-mobile-result.svg) / [解析](ui-question-experience/reading-short-mobile-explanation.svg)|[作答](ui-question-experience/reading-short-desktop-answering.svg) / [结果](ui-question-experience/reading-short-desktop-result.svg) / [解析](ui-question-experience/reading-short-desktop-explanation.svg)|
|内容理解（中文） `reading-mid`|[作答](ui-question-experience/reading-mid-mobile-answering.svg) / [结果](ui-question-experience/reading-mid-mobile-result.svg) / [解析](ui-question-experience/reading-mid-mobile-explanation.svg)|[作答](ui-question-experience/reading-mid-desktop-answering.svg) / [结果](ui-question-experience/reading-mid-desktop-result.svg) / [解析](ui-question-experience/reading-mid-desktop-explanation.svg)|
|内容理解（長文） `reading-long`|[作答](ui-question-experience/reading-long-mobile-answering.svg) / [结果](ui-question-experience/reading-long-mobile-result.svg) / [解析](ui-question-experience/reading-long-mobile-explanation.svg)|[作答](ui-question-experience/reading-long-desktop-answering.svg) / [结果](ui-question-experience/reading-long-desktop-result.svg) / [解析](ui-question-experience/reading-long-desktop-explanation.svg)|
|統合理解 `reading-integrated`|[作答](ui-question-experience/reading-integrated-mobile-answering.svg) / [结果](ui-question-experience/reading-integrated-mobile-result.svg) / [解析](ui-question-experience/reading-integrated-mobile-explanation.svg)|[作答](ui-question-experience/reading-integrated-desktop-answering.svg) / [结果](ui-question-experience/reading-integrated-desktop-result.svg) / [解析](ui-question-experience/reading-integrated-desktop-explanation.svg)|
|主張理解（長文） `reading-thematic`|[作答](ui-question-experience/reading-thematic-mobile-answering.svg) / [结果](ui-question-experience/reading-thematic-mobile-result.svg) / [解析](ui-question-experience/reading-thematic-mobile-explanation.svg)|[作答](ui-question-experience/reading-thematic-desktop-answering.svg) / [结果](ui-question-experience/reading-thematic-desktop-result.svg) / [解析](ui-question-experience/reading-thematic-desktop-explanation.svg)|
|情報検索 `reading-information`|[作答](ui-question-experience/reading-information-mobile-answering.svg) / [结果](ui-question-experience/reading-information-mobile-result.svg) / [解析](ui-question-experience/reading-information-mobile-explanation.svg)|[作答](ui-question-experience/reading-information-desktop-answering.svg) / [结果](ui-question-experience/reading-information-desktop-result.svg) / [解析](ui-question-experience/reading-information-desktop-explanation.svg)|
|基础训练 `reading-basic-training`|[作答](ui-question-experience/reading-basic-training-mobile-answering.svg) / [结果](ui-question-experience/reading-basic-training-mobile-result.svg) / [解析](ui-question-experience/reading-basic-training-mobile-explanation.svg)|[作答](ui-question-experience/reading-basic-training-desktop-answering.svg) / [结果](ui-question-experience/reading-basic-training-desktop-result.svg) / [解析](ui-question-experience/reading-basic-training-desktop-explanation.svg)|
|課題理解 `listening-task`|[作答](ui-question-experience/listening-task-mobile-answering.svg) / [结果](ui-question-experience/listening-task-mobile-result.svg) / [解析](ui-question-experience/listening-task-mobile-explanation.svg)|[作答](ui-question-experience/listening-task-desktop-answering.svg) / [结果](ui-question-experience/listening-task-desktop-result.svg) / [解析](ui-question-experience/listening-task-desktop-explanation.svg)|
|ポイント理解 `listening-points`|[作答](ui-question-experience/listening-points-mobile-answering.svg) / [结果](ui-question-experience/listening-points-mobile-result.svg) / [解析](ui-question-experience/listening-points-mobile-explanation.svg)|[作答](ui-question-experience/listening-points-desktop-answering.svg) / [结果](ui-question-experience/listening-points-desktop-result.svg) / [解析](ui-question-experience/listening-points-desktop-explanation.svg)|
|概要理解 `listening-outline`|[作答](ui-question-experience/listening-outline-mobile-answering.svg) / [结果](ui-question-experience/listening-outline-mobile-result.svg) / [解析](ui-question-experience/listening-outline-mobile-explanation.svg)|[作答](ui-question-experience/listening-outline-desktop-answering.svg) / [结果](ui-question-experience/listening-outline-desktop-result.svg) / [解析](ui-question-experience/listening-outline-desktop-explanation.svg)|
|発話表現 `listening-expression`|[作答](ui-question-experience/listening-expression-mobile-answering.svg) / [结果](ui-question-experience/listening-expression-mobile-result.svg) / [解析](ui-question-experience/listening-expression-mobile-explanation.svg)|[作答](ui-question-experience/listening-expression-desktop-answering.svg) / [结果](ui-question-experience/listening-expression-desktop-result.svg) / [解析](ui-question-experience/listening-expression-desktop-explanation.svg)|
|即時応答 `listening-quick`|[作答](ui-question-experience/listening-quick-mobile-answering.svg) / [结果](ui-question-experience/listening-quick-mobile-result.svg) / [解析](ui-question-experience/listening-quick-mobile-explanation.svg)|[作答](ui-question-experience/listening-quick-desktop-answering.svg) / [结果](ui-question-experience/listening-quick-desktop-result.svg) / [解析](ui-question-experience/listening-quick-desktop-explanation.svg)|
|統合理解 `listening-integrated`|[作答](ui-question-experience/listening-integrated-mobile-answering.svg) / [结果](ui-question-experience/listening-integrated-mobile-result.svg) / [解析](ui-question-experience/listening-integrated-mobile-explanation.svg)|[作答](ui-question-experience/listening-integrated-desktop-answering.svg) / [结果](ui-question-experience/listening-integrated-desktop-result.svg) / [解析](ui-question-experience/listening-integrated-desktop-explanation.svg)|
|基础训练 `listening-basic-training`|[作答](ui-question-experience/listening-basic-training-mobile-answering.svg) / [结果](ui-question-experience/listening-basic-training-mobile-result.svg) / [解析](ui-question-experience/listening-basic-training-mobile-explanation.svg)|[作答](ui-question-experience/listening-basic-training-desktop-answering.svg) / [结果](ui-question-experience/listening-basic-training-desktop-result.svg) / [解析](ui-question-experience/listening-basic-training-desktop-explanation.svg)|

概念覆盖：23题型 × 2视口 × 3状态 = 138图。交互与所有失败状态未以截图核验；未完成原生截图或设备验收。下一阶段需实际渲染 fixture，替换各入口后逐状态回归。

## 已实现与 QA 边界

- `QuestionOptions` 真正接入 MockExamPanel、DesignedExamPanel；共享选项顺序、选中/正确/错误状态及权限 reveal 入参。两入口仍各自拥有材料与解析布局，不称为完整题目 renderer 已统一。
- 其余 StudyPanels、ReadingPanel、ListeningPanel、DraftsPanel、HistoryPanel、MCP 与 SwiftUI 内容 renderer 待接入；查词分词、音频选项预览、题组、★片段排列仍需独立组件实现。
- SVG 是概念图，fixture 是未审核占位内容。阅读七型目前不同 materials 的展示只区分普通正文/A+B/表格；短/中/长/主张的篇章差异尚未以真实长度呈现；听力各型时序及完整音频未模拟。不得据138图计数宣称23题型UI验收完成。
- 图没有完整长解析/失败状态目视验收，尚无所有平台实际截图。共享组件已有DOM回归，原生只有语法解析检查，设备构建/截图仍待完成。

[本地可交互概念图索引](ui-question-experience/index.html)：切换23题型/作答-结果-解析，移动与大屏并列。此页直接展示概念SVG，不能代替生产 renderer 或实际截图。
