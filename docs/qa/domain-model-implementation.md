# 领域模型与统一题库实施切片核验

2026-10-07。独立任务工作区 jlpt-master-deck；分支 domain/unified-question-bank；基线 main=e416bedcf8236638adf8c37c989f62e4200cd327。未 push、PR、merge、deploy；未调用生产 MCP、改真实学习数据或自动化。

## 本轮实际实现

1. 知识点 upsert 不受六种题型偏好强制；纯片假名/独立活用可保存。明确提交的词汇 seeds 仍严格校验。省略 seeds 保留旧内容；旧不完整 seeds 不阻塞知识点独立更新。
2. 统一题型与旧 kind 别名纯契约；数字答案要求来源显式基数，answerIndex 固定0基，文本答案重复或字段冲突拒绝。
3. 追加题目、不可变版本、来源 alias 存储，Node/Cloudflare 初始化一致；DR 创建/修改/删除事务归档 raw unreviewed/unscored 内容。批准发布保留原 PR实例ID、顺序/答案/快照并写 canonical ID/revision 与DR/PR映射。省略ID使用相同flattened来源路径，不按stem自动合并。
4. 草稿删除保留原题；旧草稿删除前归档原内容。已发布后再归档旧版本不降级最新 ready；历史冻结引用不变。
5. Web/MCP/native 模型保留 canonical 引用，MCP 未答 session 不泄答案；native 已映射候选按canonical去重。旧候选还按旧ID，未进行全库迁移。
6. 两种 Web考试入口实际共用 QuestionOptions；容器控制提交与 reveal。其余内容/解析 renderer 未统一。
7. 显式 JSON 清单 dry-run 审计 CLI：没有 DB 默认路径，不联网；逐条接受/拒绝与重复候选，不能自动合并同stem。
8. 嵌套SQLite事务使用savepoint；支持市场导入的外层事务，内层失败可回滚、外层失败仍整体回滚；Cloudflare原生事务回归通过。

## 最终冻结源码检查

- `node --test`：448 tests，448 pass，0 fail/skip。
- `npx tsc --noEmit`：通过。
- `npm run lint`：通过。
- `npm run build`：Web及三个MCP app模式通过；保留原项目大bundle提示。
- `swiftc -frontend -parse apple/Sources/NativePractice.swift`：通过；不是Xcode设备构建或UI验收。
- `git diff --check`：通过。
- 日志保存在本工作区 `.local/domain-final/`。

首次437/440的3失败是构建前置与沙箱listen限制。构建后仍listen EPERM，获同机本地检查许可后完整通过。新增草稿事务曾导致5项市场导入回归，已修复并在最终448全量中覆盖；不把该回归归类为环境失败。

## 图与视觉证据

- 3领域 SVG + JSON 源和 PNG：标题/图例/实体/引用基数与事件虚线逐张目视；QuickLook方形输出曾裁切，现PNG保留完整图并修正交叉标签。详图表达目标模型，已/未实施见领域文档阶段表。
- 23题型×2布局×3状态的138 SVG为**概念图**；HTML索引可切换并列浏览。没有全型实际截图/长正文/长解析/音频时序验收；普通阅读类型仍共用短占位正文，不能凭图数量认定覆盖。
- IAB返回 unavailable，未宣称真实UI已打开。open_in_codex总图请求queued。
- Library已发现prepared保存能力，官方helper完整取得，但本机Python3.9不支持helper注解，启动即失败，**没有上传**。未改官方helper、未强装运行时、未降级绕过prepared路线。本地可读PNG/HTML仍可交付；原生附件待环境支持。

## 剩余实施（整体目标尚未完成）

全 owner 原始清单和全库兼容迁移/对账；item seeds、reading、LS、mock全部写入口；素材版本/组/知识点关联；后台候选与冻结manifest；新增增量同步/offline媒体依赖；AnswerSubmitted/MemoryRated分离与日期统计投影；分享版本授权；全部Web/MCP/native题型renderer与完整fixture/实际截图；原生Xcode构建与iPhone/iPad真实练习回看。

旧删除练习行为仍会按现有逻辑删除部分作答记录，未改为完整事件历史保留；新独立题目版本不随组合删除。独立库目前是追加切片，尚不能成为全库唯一权威。ready表示批准可练习，不代表严格JLPT eligibility核验。不要部署或生产迁移此未完成架构。

## 第二阶段：材料与消费写入口（2026-10-07）

本地追加bank_materials/material_versions/material_groups/group_versions。文章、音频按显式身份与owner保存不可变版本；题组保存有序题引用；不按相同stem合并。reading支持显式article引用、正文变化拆分、删除退役保留版本；LS共享AU，不重传音频，转录更新生成新材料/题版本，历史媒体引用阻止删bytes。草稿归档保留全部section上下文。

item seeds、daily/topic、mock创建/更新、市场词条与练习导入接canonical核心；旧练习第一次局部patch前保存旧版本。相邻题、旧答案及旧history保持。Web/native题生成携带canonical元数据，index与完整题生成保持一致；语法组句/篇章能在题型选项区分。MCP与Web/iOS接listening-expression（N3–N5），不修改N1正式清单。普通practice解释刷新、旧库全量反填及所有复制修复入口仍待接。

新增知识点/23题型/MCP/整体架构文档并相互链接；整体架构JSON/SVG/PNG使用本机QuickLook渲染，发现领域小框字号溢出后调整；没有把架构PNG当产品UI截图。

- 最终 `node --test`：454/454通过，0 fail/skip（包含Cloudflare runtime、MCP/REST、真实材料共享、跨owner拒绝/回滚、历史冻结、原生bundle一致性）。
- `npx tsc --noEmit`、`npm run lint`、`npm run build`（Web+3 MCP模式）、`npm run build:native-questions`、`swiftc -frontend -parse apple/Sources/*.swift`及`git diff --check`通过。
- 日志归档在 `.local/domain-stage2/`，只验证本机和本地Cloudflare模拟。没有Xcode签名构建或真实跨端UI运行。
- 首次全回归450/453：索引新增字段揭示一处真实qtype元数据不一致，已修；两项索引断言扩大到全部元数据一致性；Cloudflare R2删除断言改为历史保留bytes且旧题路由404。最终全量覆盖修正。

剩余范围按architecture与MCP契约标记继续：完整历史反填、所有剩余写入口；canonical增量同步与Apple离线消费；全QuestionRenderer/全型真实fixture与各入口状态；客观作答与自评事件/统计日期投影；分享版本和权限恢复；全并发/幂等/结构化错误。整体目标尚未完成，不能作为生产迁移发布。

## 第三阶段进行中：真实呈现、同步、事件与影子迁移

最新origin/main `56be34f`已本地合并为`1905174`，保留其iOS反馈与活用解码修复。Web词汇练习/回看、阅读、听力、模拟卷及MCP practice现使用同一QuestionRenderer/QuestionOptions；录音播放、模拟卷音频使用QuestionAudioPlayer（按钮与可拖动进度）。权限、计时、提交和导航仍由容器负责。23种结构/状态测试覆盖共用框架，尚不等于完整语义fixture或真实浏览器截图，也不等于原生UI全部统一。

23型specifications已接真实get_question_registry；严格作者模式验证目标span、组句排列/★、检索条件、文章空位、不同材料revision、选项数和解析。旧档案读取保持兼容，不自动提升正式试卷资格。

同步分页加入不可变question/material/group revisions和questionStates，owner隔离；iOS校验key/schema、保存版本缓存，AppStore同步/恢复/保存/登出均接这些字段。原生练习与回看按冻结revision读取已有缓存，原生待提交事件携带canonical/revision/type。旧payload或缺版本仍走兼容快照；离线素材/历史AU读取尚不完整。

AnswerSubmitted与MemoryRated追加事件ledger；Web单题/MCP/native replay/新批量snapshot接入稳定事件ID、冲突拒绝、冻结版本校验。新SRS自评不再增加客观correct/wrong，历史legacy_mixed贡献保留。日总结实际消费事件、同题重答计数、旧快照只补缺事件历史；未选不算错；按账号或已保存总结的IANA时区计算自然日，DST 23/25小时已测。旧全量progress快照协议仍存在，不能声称所有旧客户端并发写已迁移。

影子迁移CLI默认只读，显式源/新目标SQLite backup；逐批checkpoint和逐行savepoint、旧表内容hash核对。已覆盖owned/user seeds、草稿、日练、mock、reading、AU/LS；全局无owner词条和孤立LS报告拒绝，数字answer歧义不猜。源码和旧学习表不改；只在合成测试库执行，未运行真实用户迁移。完整生产灰度/回滚、媒体恢复与全历史映射仍待实施。

阶段中验证：全量469/469通过，包含冻结版本作答、旧题改答案后原答案保持、稳定ID重试、多个陈旧计数客户端合并、外owner拒绝及日总结事件投影；tsc、lint、Web+3 MCP构建、Cloud API bundle通过。最新本机Xcode单元65/65通过，含原生冻结版本实际消费、版本作答payload和旧缓存兼容。正在运行四条已有demo UI验收；尚不能宣称UI完成。本机新建独立iPhone17/iOS26.5模拟器，测试使用ignored非生产配置，未配置真实Firebase。

## 第四阶段：消费与权限闭环

Web syncCollection真实解析冻结题目/文章revision，保留PR题实例和item ID，不跟latest改历史；完整分页才保存cursor，非法版本key拒绝推进。缺旧缓存revision仍兼容原snapshot，素材不全不截断替换正文。iOS已接冻结消费和待提交引用。离线历史AU独立下载与所有材料呈现尚未完成。

分享写入追加market_share_versions，源修改不重写旧包；get_market_share/REST可读取指定revision，词条/练习导入能指定版本；expectedRevision防止陈旧编辑。readonly详情不回填版本，旧包先作为兼容revision 1，下一次真实更新先归档旧包。撤回后当前/历史版本及封面都拒绝访问；封面历史bytes不清理，指定内容版本返回对应封面URL。旧已导入副本保留；历史听力导入暂拒绝，不用当前音频冒充旧版。现有公开/撤回模式保留，新私有分享产品模型未添加。

Web新批量协议eventMode=merge，选择暂存为draft，保留可续作的稳定eventId/引用；改选不产出AnswerSubmitted。最终提交才写事件，合并服务器客观计数；重试不增分，不删除另一设备的新答题。旧无eventMode快照协议保持兼容。新增答案metadata列默认legacy_submitted，旧correct与selected不改；draft不进入日总结或学习记录客观计数。答题事件+progress+attempt同SQLite事务；旧全量progress写协议仍有兼容边界，不能声称旧客户端并发全面解决。

原生65项unit通过；四条真实demo UI流程通过，22张PNG与来源记录见[截图验收](native-question-experience/README.md)。首轮UI旧主导航失败/阻塞保留证据，修正定位后复验通过，不能拿概念图或失败bundle当成功。Web/IAB截图工具当前未提供，因此没有声称Web真实浏览器或iPad/实体设备视觉验证。

最终全量474/474通过；tsc、lint、Web+3 MCP构建及Cloud API bundle通过。新增真实迁移CLI进程测试：默认不建目标、只读source、显式新target backup、拒绝覆盖、checkpoint resume、源文件bytes不变。阶段初全回归3项失败：两项测试用INSERT VALUES依赖旧列数，改为显式列并保留历史保护断言；REST封面旧断言补为冻结内容revision URL，真实接口复验通过。日志归档`.local/domain-stage4/`。所有运行限本机合成库/demo，没有用户真实迁移、生产MCP或自动化操作。

## 本地交付边界与剩余项

本地已交付：六领域/23型/知识/媒体/答案/审批/版本/事件/日期/分享契约文档；canonical与材料增量核心及主写入口；真实Web/MCP共享渲染、Web/iOS冻结消费；客观/主观事件与日总结；可续跑影子回填和旧表哈希报告；本机集成/unit/build/native/UI证据及可回退提交。整个独立库尚不能作为全库唯一权威，不宣称原方案全部完成。

以下为阶段四当时缺口，后续完成情况以“收尾一/收尾二”为准：通用独立词汇/语法作者写用例及完整知识多对多编辑；全attempt manifest冻结和历史题缺失恢复；题型真实长内容/图片/多材料的完整跨平台视觉fixture与统一原生UI；历史AU按材料revision授权离线读取；全库owner/分享/事件映射核对和灰度/回滚演练；旧客户端全量progress并发替代。生产切换、真实数据回填及删除旧库不在本任务执行授权内，仅保留预演与手册；这些边界不是继续扩大工程或触碰生产的理由。

## 收尾一：独立作者用例

新增真实`save_question_draft`/`get_question_draft` MCP与`/api/question-drafts` REST。独立词汇六类/语法三类保存为现有普通草稿，strict校验、每选项解释、可零或多知识关联、owned素材引用。稳定requestId返回接受过的同ID/revision；编辑必须expectedRevision且重置审批。用户批准后走已有发布；不能通过question.reviewStatus伪造ready。纯片假名漢字読み和错level拒绝，数字答案要求显式base；不改旧DR947或用户数据。阅读/听力继续现有专用作者入口，不增空壳通用工具。

修复作者发布的三处真实消费缺口：保留组句assembly/目标span/篇章blankId/level/条件/知识关联；有owned文章引用时复用而非根据passage再造一份；作者修改后重新批准可创建新PR，但保留旧PR和同canonical不同revision。无知识关联的作者题使用canonical作用域的进度ID，不把所有author-q1合并进同一进度。Web/MCP呈现正文和条件；iOS条件解码与冻结消费已接并测，不声称新增九型视觉截图已完成。

最终本地全回归479/479（包含九型作者、知识JSON不变、多对多、numeric base、真实MCP及临时账号REST审批/发布、旧实践冻结）；tsc/lint/Web+3 MCP/Cloud API bundle通过；原生65/65复验通过，新增结构化条件冻结消费断言。日志`.local/domain-authoring/`。先前4UI/22截图仍是先前代表场景证据，本轮没有将其算作九型全视觉验收。

四项具体缺口、逐项完成标准及工具路径见[收尾清单](four-items-closeout.md)。独立作者用例这一缺口已补；完整attempt历史/映射、旧AU离线入口和全23型跨端视觉仍按该清单继续。原方案尚未全部完成。

## 收尾二：历史冻结与 AU 授权离线读取

本轮使用合成数据库、独立 Simulator、Miniflare SQLite/R2，不回填真实学习库。

`questionManifest`记录有序实例ID、canonical revision和完整呈现/答案快照。Web普通练习在创建attempt时冻结完整题；分页词汇仅有轻量索引时标记missingOriginal，在实际作答时冻结具体题。iOS练习保存可离线JSON往返的同一manifest。MCP首次作答冻结整套，后续读取和评分消费原快照，即使来源内容被修改。服务端校验owned revision、固定题序，已完成attempt保留原答案与summary；旧记录没有原始快照时不查询当前题冒充，Web禁用回放，iOS只展示原作答/分数与缺失提示。不是从当前canonical revision猜历史原题。

影子迁移增加`identityReport`：source aliases、素材versions、全部可识别旧行ID与hash、attempt原始分数hash、missingOriginal清单及分类计数。`legacyRetained`明确不等于canonical已映射。覆盖DR947合成20题0-based、同stem不同来源、SRS旧ID/计数、旧attempt分数；旧表hash不变。报告没有写回旧历史，没有将未知版本自动提升为可重放。

新增`GET /api/materials/:id/versions/:revision/audio`、`get_material_audio`、`get_material_audio_download`，owner与audio:read保护，并接Node和Cloudflare R2。按revision取原AU，验证asset hash；最后LS删除后仍可读，真正没有字节返回404/missingMaterial。Web听力播放器使用此入口；iOS优先此入口，下载包含已同步历史音频素材版本，缓存按账户/AU去重并读取旧缓存。暂停的原生听力题与素材引用冻结到账户作用域draft，即使源LS消失，列表保留恢复入口。无需重复上传。

验证：最终Node全量486/486（0 fail/skip）；原生67项unit、2条UI回归通过（听力暂停/恢复/结果，练习反馈），`.local/domain-closeout-ui.xcresult`。新增真实HTTP OAuth scope/owner检查、实际MCP handler、本机Miniflare REST/OAuth/MCP/R2删源读原音频与缺字节检查；迁移6项及MCP原题修改后的冻结评分检查。tsc/lint、Web+三MCP、Cloud API bundle通过。首轮native缓存旧断言期望不同LS大小产生不同AU缓存；按不可变AU去重契约修正后全量复验通过。日志归档`.local/domain-closeout/`。

剩余边界：没有可靠原始快照的历史无法恢复，明确quarantine/legacy可读；Web分页未呈现/未作答题不假称已冻结；MCP首次取题到首次作答之间尚无单独持久化start事件。听力/阅读专用local-study-responses保留原记录，但尚未统一成NativeAttempt。全类型长内容/图片/多素材的23型跨端视觉验收仍未闭环，浏览器像素工具缺失。未做真实生产迁移、源库删除、灰度切换或发布。

## 收尾三：首次呈现与专用响应统一

已识别的三个数据边界已接实际消费者：

1. Web分页词汇保留`notPresented`索引状态，在题目首次显示时复制完整快照并保存checkpoint，后续渲染优先该快照。尚未显示不是missingOriginal；旧历史确实缺原版本才是missingOriginal。关闭练习只统计有实际选择的答案，未答不算错。
2. MCP `get_practice_session`现在是真实呈现用例（write annotation），保存无答案的有序manifest后才返回题；`start_topic_practice`也调用该入口。后续修改来源不会改变首次呈现/评分。旧answered missingOriginal记录只能读，不用当前题升级，需另开新练习。未答输出继续隐藏答案/解析；开始不会生成作答或MemoryRated事件。
3. Web和iOS阅读/听力专用页面首次呈现保存统一attempt；实际选项文本形成客观作答，原始文章/共享AU引用随快照保留。自由回答写`unscoredResponses`，保留文本、不生成假答对、不计正确率。iOS原`LocalStudyResponse`及旧SRS进度不清除/重评分；新响应同时保留兼容记录。音频练习次数由新completed attempt加旧基线投影，无伪造整组答对事件。原生路由已消费owned暂停LS快照，删源恢复入口不再只查当前listening集合。

迟到checkpoint与并发保护：保留已提交答案；已完成attempt保持完成时间、原summary与原主观自由回答；merge写不会删除另一个设备的attempt。旧answered missingOriginal不允许由当前快照自动升级。新增精确回归覆盖这些不变量、分页首次显示、MCP首次取题后修改、Web阅读真实组件先呈现后选项、原生reading/listening离线JSON、混合有答案/自由回答和纯自由回答（historyOnly）。

最终验证数字/日志见收尾清单。原生69项unit通过，阅读和听力两条真实UI回归通过，bundle `.local/domain-first-presentation-ui.xcresult`。浏览器像素工具再次核对确实缺失，23型移交矩阵见[视觉验收移交](visual-validation-handoff.md)；DOM测试、概念SVG与代表UI均未冒充全型像素验收。

本轮不继续扩展领域范围。剩余的是：未知历史原题/真实旧媒体的实际恢复能力（不猜、不生产回填）、23型长内容/图片等逐型视觉验收与设备覆盖、生产灰度/切换/回滚。整个独立库成为唯一权威仍需要获授权的切换工作，不声称已经发布。

收尾三最终复验：Node **494/494**（0 fail/skip）、原生 **69/69**、真实UI **2/2**；tsc/lint、Web/MCP/Cloud API构建通过。为防未答被算错，Web关闭attempt的summary仅统计实际有选择的答案，未呈现索引保持notPresented；精确回归通过。最后一轮代码及测试之后仅更新交付文档。日志归档 `.local/domain-final/`。

## 原生视觉补验（独立于数据核心完成状态）

新增23型能力清单与18型文本兼容fixture、真实本地日语音频、手机/宽屏XCTest流程及原始PNG，详情见 [原生逐型证据](native-type-visual/README.md)。进入的是现有三个真实组件，DEBUG入口不取生产数据。复现并修正题卡/题目列表显示源题而判题取冻结revision的呈现错误。

原生没有共享typed payload renderer，18型文本页面留证不代表正式策略全部实现。5型结构功能缺失，以及概要听力呈现时序、精确目标span和多问语义等限制均显式记录。Web/MCP像素工具阻塞仍保留；不以普通选择题截图代替缺失类型。

安全里程碑：手机18型130图+宽屏语法5图有效；旧宽屏18型交互通过但截图异常，17型待整屏重拍。最终Node494/494、原生71/71，真实UI结果与局限见上面证据文档。
