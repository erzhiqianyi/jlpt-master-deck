# 原生统一题目呈现：第一阶段

日期：2026-10-07。此阶段实现代码、真实调用适配与测试；手机/iPad逐型像素验收是第二阶段，不能以编译、单测或旧截图替代。

后续进展：已接Web/MCP结构化消费，见 [实施记录](typed-web-mcp-implementation.md)；原生真实交互及视觉证据见 [第二阶段](native-typed-visual/README.md)。以下“未实施”范围为第一阶段交接当时的状态。

## 已实施的调用链

`apple/Sources/QuestionPresentation.swift` 解码现有 schemaVersion=1 canonical bank payload，复用 `legacy` 中的版本化题目字段、`options[].id`、`answer.type=single` 和 `answer.optionId`。原生练习、阅读、听力三个真实入口及练习结果复盘均调用共享 `NativeTypedQuestionRenderer`；没有建立第二套题目ID或改变既有数字答案基准。旧QA的 `option` 编码仅为读取兼容。

题目呈现与材料版本写入既有练习/作答快照。恢复时优先使用冻结 presentation；缓存刷新不替换历史题干、选项、答案或材料。阅读和听力保留原有 item/question/audio/attempt身份。排序题新增可选 `assemblyOrder` 与草稿排列状态，旧记录缺字段仍能解码。

## 结构化呈现与作答

- 句子组成：四个片段逐个排列，显示完整空位及★，必须完成无重复排列才能提交。客观答案仍是★位置对应的canonical option，完整排列另存；错误排列不会重新定义正确答案。
- 文章文法：两道独立题引用同一 article revision，正文保留全部空位，突出当前 `blankId`。每空仍拥有自己的题目ID、选项和答案，不复制文章来制造题目身份。
- 综合阅读：独立A/B材料顺序呈现。信息检索：实际条件与表格列标题、行、单位一起呈现，窄屏横向滚动表格。
- 发话表达：图片选项通过 `optionMaterials` 绑定已声明、归属当前用户的 image revision；支持材料内PNG数据URL及HTTPS图片，保留alt文字。QA有真实PNG和独立日语PCM音频。
- 概要听力：默认及显式 `afterAudio` 策略在音频成功播放结束后开放题目/选项。AVAudioPlayer delegate确认结束，暂停不会解锁；完成状态随听力草稿恢复。
- 精确目标词：UTF-16 `targetSpan` 校验原文切片，分词后仍精确标记第二次出现的同词；保留日语词性红色样式，不用全局字符串替换。
- 答后呈现正确答案、完整排列、总解析、选项解析、阅读结构/证据、翻译。reveal与容器权限相交；未答时不呈现这些解析。素材缺失或结构无效时禁用作答。容器继续负责审批、导航、音频、保存与SRS，自评没有被改成客观对错。

## 服务契约与兼容

JS `validatePresentationMaterials` 校验图片URL/alt、矩形表格、选项图片声明关系和听力显示时机；版本归属在实际持久化适配层再次校验。reading MCP/REST schema接收 `materialRefs` 与 `taskConditions`；listening schema接收图片引用与 `presentationPolicy`。创建、局部编辑、转写更新均保留这些字段；已有AU复用不上传新音频。

原有单文章编辑与转写共享回归保留。新增字段不要求不可逆数据库迁移；快照的可选字段兼容旧历史。未改变草稿审批状态或真实学习数据。回滚可撤销本地代码提交，结构化新增题目在旧客户端可能无法完整呈现，但现有题目/作答映射不会被重写。

## 验证与范围

- 全仓 `node --test`：499/499，通过，0跳过；含MCP真实创建/编辑/读取A/B、表格条件、共享AU图片、转写更新、跨owner拒绝及既有兼容回归。
- 原生单测：78/78，通过；含23类真实canonical解码、排序★映射、多空位共享、PNG解码、冻结JSON恢复、结束时机、精确span及红色样式。最终bundle路径为 `.local/native-typed-stage1-rich.xcresult`。
- TypeScript、lint、Web/MCP与Cloud API构建结果见阶段交接；构建不表示已部署。

历史135张PNG的SHA和fixture版本仍记录在 [原生视觉证据](native-type-visual/README.md)，属于提交 `7afecab` 的文本兼容基线，不认证当前renderer。第二阶段要增加五类真实交互、两道文章空位、概要播放前/暂停/结束和精确目标词截图，验证手机及iPad作答、结果与长解析，并逐张打开检查。旧iPad导出异常的17类仍待有效整屏重拍。

Web/MCP已共享数据契约和验证，并完成构建/适配测试；本阶段未把其React呈现升级为同一结构化交互，不能声称三端像素或交互一致。当前环境缺浏览器像素工具，Web/MCP像素验收仍阻塞，未绕过环境。没有生产MCP调用、真实数据写入、自动化修改、push、PR、merge或deploy。
