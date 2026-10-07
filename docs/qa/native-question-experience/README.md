# 原生运行截图与验收

2026-10-07，用户Mac上的独立iPhone 17 / iOS 26.5 Simulator，demo合成内容、未配置生产Firebase。以下PNG来自XCTest真实运行附件，未用概念图替代截图。原始1206×2622像素保留，`evidence.json`记录来源结果、测试、时间和设备。只验证这些场景，不代表23型全部内容状态、iPad或实体iPhone覆盖。

|流程|验证内容|截图|
|---|---|---|
|词汇/语法|选择后反馈、展开选项解析与中文说明、只显示总结、错题/全部回看切换|[词汇错误反馈](vocabulary-wrong-answer-feedback.png)、[语法正确反馈](grammar-correct-answer-feedback.png)、[完整解析](grammar-expanded-explanation-and-translation.png)、[回看](practice-review-all-swiped.png)|
|听力|文件名导航、按钮与进度、一题一屏、答题卡、暂停/继续、结果和错题回看|[单题](listening-single-question.png)、[答题卡](listening-answer-card.png)、[暂停](listening-paused.png)、[继续](listening-resume.png)、[结果](listening-results.png)|
|阅读|选择后不提前揭答案、背景切换保持选择和滚动位置、确认后解析/朗读解锁|[选择后恢复](reading-selected-after-background.png)、[正确反馈](reading-correct-feedback.png)|
|独立练习入口|当前学习页练习入口、后台恢复模态页、冷启动恢复学习页、没有浮动入口干扰|[入口](native-practice-without-floating-action.png)、[恢复](practice-modal-after-background.png)|

Xcode65项单元测试通过。四条UI流程最终全部通过：首轮听力/词汇语法/入口通过，阅读因测试残留main已移除的“练习”主导航失败；修正测试定位后，阅读独立复跑通过。第一次未修正导航的运行在UI快照阻塞并中止，保留在`.local/domain-stage3-ui.xcresult`；不能把该结果当通过。通过的三条流程来自`.local/domain-stage4-ui.xcresult`（该bundle还含旧阅读失败），通过的阅读来自`.local/domain-reading-ui.xcresult`。截图归档排除了失败流程。

概念矩阵位于`docs/ui-question-experience`，二者分别标记，不能互换。当前没有Web/IAB浏览器运行截图工具，Web/MCP以组件交互、集成及构建验证；完整跨平台视觉验收仍需后续补齐。
