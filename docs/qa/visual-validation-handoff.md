# 23 型视觉验收移交矩阵

2026-10-07。本文件列出逐型验收内容与证据要求。新增18型真实原生文本兼容页面证据，仍不声明完整23型payload像素验收。

目标状态（不是本轮全覆盖声明）：首次呈现/未答提交/选对/选错/答后解析/未获解析权限/暂停恢复。尺寸：小屏Web、PC、MCP窄嵌入、iPhone；iPad宽屏另测。每张图须记录fixture ID、内容revision、入口、平台、状态和截图来源。

|registry ID|必须使用的真实字段/任务fixture|Web/MCP像素|iOS逐型像素|
|---|---|---|---|
|vocabulary-kanji-reading|句中目标漢字span；读音选项；不提前显示ruby|blocked|[文本兼容截图，非完整策略验收](native-type-visual/README.md)|
|vocabulary-orthography|假名目标span；四个汉字表记|blocked|[文本兼容截图，非完整策略验收](native-type-visual/README.md)|
|vocabulary-word-formation|N2派生/复合成分、目标空位|blocked|[文本兼容截图，非完整策略验收](native-type-visual/README.md)|
|vocabulary-context|具体语境、空位、四个语义选项|blocked|[文本兼容截图，非完整策略验收](native-type-visual/README.md)|
|vocabulary-paraphrase|被替换的表达span、同义选项|blocked|[文本兼容截图，非完整策略验收](native-type-visual/README.md)|
|vocabulary-usage|目标词、四个完整使用句|blocked|[文本兼容截图，非完整策略验收](native-type-visual/README.md)|
|grammar-form|接续上下文、空位、形式选项|blocked|[文本兼容截图，非完整策略验收](native-type-visual/README.md)|
|grammar-composition|★、四段文本、完整correctOrder及starSlot|blocked|原生结构功能缺失|
|grammar-text|长篇正文、blankId、多空位及对应选项|blocked|原生结构功能缺失|
|reading-short|短文、任务、四选项及依据|blocked|[文本兼容截图，非完整策略验收](native-type-visual/README.md)|
|reading-mid|中篇多段、滚动与长解析|blocked|[文本兼容截图，非完整策略验收](native-type-visual/README.md)|
|reading-long|N1/N3长篇、跨段依据、查词|blocked|[文本兼容截图，非完整策略验收](native-type-visual/README.md)|
|reading-integrated|两个独立material refs、A/B共同任务|blocked|原生结构功能缺失|
|reading-thematic|长文主张、主旨与干扰证据|blocked|[文本兼容截图，非完整策略验收](native-type-visual/README.md)|
|reading-information|时间/预算等taskConditions、表格与检索任务|blocked|原生结构功能缺失|
|reading-basic-training|基础素材、兼容未定正式类型|blocked|[文本兼容截图，非完整策略验收](native-type-visual/README.md)|
|listening-task|共享AU、任务指示、具体行动选项|blocked|[文本兼容截图，非完整策略验收](native-type-visual/README.md)|
|listening-points|共享AU、限定问题、关键条件|blocked|[文本兼容截图，非完整策略验收](native-type-visual/README.md)|
|listening-outline|先听后问题、概要选项|blocked|[文本兼容截图，非完整策略验收](native-type-visual/README.md)|
|listening-expression|N3–5発話表現场景；图片选项能力须单独核验|blocked|原生结构功能缺失|
|listening-quick|即时应答、三选项、音频任务保留|blocked|[文本兼容截图，非完整策略验收](native-type-visual/README.md)|
|listening-integrated|整段共享音频、多问、综合条件|blocked|[文本兼容截图，非完整策略验收](native-type-visual/README.md)|
|listening-basic-training|自由回答、无标准答案、不计正确率|blocked|[文本兼容截图，非完整策略验收](native-type-visual/README.md)|

## 现有证据与工具边界

- `tests/question-renderer.test.mjs`：23型共用框架、权限、暂停、自由回答DOM契约；使用简单结构fixture，不是上述全部长内容语义fixture或像素截图。
- `tests/reading-review-controls.test.mjs`、`tests/dedicated-attempts.test.mjs`、`tests/attempt-presentation.test.mjs`：实际组件/呈现与选项契约，包括先呈现后改源题。均非像素证据。
- 原生已有四条代表流程、22张历史截图；本轮真实XCTest新增复验阅读后台恢复与听力暂停/恢复/结果，结果 `.local/domain-first-presentation-ui.xcresult`。这些证明对应代表流程，不能将一条阅读流程算成七种阅读全部通过。
- 当前工具目录再次核对未提供IAB/browser控制或实际Web截屏工具；仓库没有正式Playwright/Puppeteer/WebDriver执行器。没有换环境、安装新浏览器自动化或用概念SVG替代截图。

Web/MCP像素项目前因工具缺失blocked。iOS工具可用，已支持的代表流程已实测；本轮18类长文本兼容流程已有真实截图；A/B、★、多空位、表格、图片选项已确认实现缺口，不能归咎于Web工具缺失。取得合适fixture与浏览器工具后，按此矩阵逐格留证，失败项应修复后复验；不必继续扩展数据领域范围。生产数据与生产MCP不作为fixture。

本轮详情、原始PNG、fixture及功能缺口见 [原生逐型证据](native-type-visual/README.md)。另外概要听力时序、精确span和正式多问语义尚不能从通用文本页面推断通过。

当前有效原始图135张：手机18类130张、宽屏grammar-form 5张。旧宽屏截图异常已剔除，另外17类待重新整屏捕获与目视，不能称宽屏视觉已完成。
