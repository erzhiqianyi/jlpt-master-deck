# 四项收尾清单与验收标准

2026-10-07。每项独立核对，不能用“基础层已完成”替代整项验收。全部工作限本地副本/合成fixture；真实学习库迁移、发布和删除旧数据不执行。

|项|明确缺口及当前状态|可验证完成标准|
|---|---|---|
|通用作者用例|本轮补齐原缺失的独立词汇六类/语法三类作者流程。`save_question_draft`/`get_question_draft`及REST已接真实草稿→用户批准→发布，阅读/听力沿用已有专用作者工具。不是另建自动批准通道。|九型严格payload保存；可零知识关联或多个可访问知识ID；不upsert词条、不强制六题；owned素材复用；每选项解析；requestId重试、expectedRevision冲突；编辑重置审批；未批准不得发布；修改后新练习与旧快照同canonical ID不同revision。MCP/REST及Web/iOS契约测试。本项这些用例已通过，视觉覆盖不由这些测试代替。|
|完整历史冻结/映射兼容|题/材料revision、alias、事件和旧分数已保留；attempt仍缺统一的冻结题manifest，历史页有“当前版本”兼容路径。已增加全旧行ID/hash及alias/material/attempt分类报告；具体剩余边界见本轮增量。|新Web/MCP/iOS attempt保存题序、实例ID、canonical revision和当时呈现/答案快照；改题/删源后回看原题且不重算旧分数。已有完整旧快照保持；无法证明原版本则明确missingOriginal，不拿当前题冒充。合成旧item/question/AU/LS/DR/PR/attempt/SRS清单输出映射率、拒绝项、旧表/答案hash；涵盖DR947数字base、重复stem不同来源、旧草稿审批、跨owner。本轮核心已实施，剩余边界见下方收尾二。|
|旧AU离线读取|已有AU复用和历史保留bytes；本轮已接材料revision授权入口、Web/原生离线消费者，删LS后原AU可读。|本机及R2按owned音频material revision取原AU；MCP强制audio:read，REST owner隔离；删LS仍能读冻结材料，外owner拒绝；native离线manifest按AU去重下载、从新入口继续旧练习，无重复上传；缺真实bytes明确missingMaterial，不伪造成功。用本机合成音频与Cloudflare模拟验证，真实旧AU不读取。本轮已实施并通过本机/Miniflare/native fixture验收。|
|全题型跨端视觉验收|已有138概念SVG、23型共用框架测试、4条原生真实UI流程和22张截图；尚非23型实际内容/状态的完整覆盖。|为23型建立真实字段fixture：目标span、★全排列、篇章空位、短/长/A-B/检索条件、不同音频任务、3/4选项、图片选项/长解析；覆盖作答/未答提交/正确错误/解析权限/暂停恢复。Web/MCP/iOS消费同题内容且控制状态等价；截图与DOM/接口证据分别标记，不把概念图当运行截图。原生XCTest可继续执行；Web实际浏览器截图目前存在明确工具阻塞，见下文。|

## 本轮作者实施证据

`server/question-authoring.mjs`将一道词汇或语法题保存成普通可预览草稿，再写同source identity的canonical scored needs_review版本。审批沿用`/api/drafts/:id/confirm`，发布沿用现有用例；新工具不能提供ready。编辑同DR保持ID但恢复draft，旧版本不可变。作者内容修改后重新批准可发布新PR；未改内容重复发布返回同PR。独立题无知识关联时使用canonical作用域的`question-bank:`进度ID，避免所有`author-q1`碰撞；知识ID列表完整保存，第一项为兼容进度的主关联。

已有文章materialRefs优先复用，发布不凭passage再次创建素材。组句assembly、目标span、篇章blankId、level、条件和knowledgeIds穿过发布；Web/MCP作答及回看显示正文/条件，iOS保留context并显示结构化条件。只校验结构，语义正确仍由用户审核；合成A/B选项测试不当作日语内容审查。

真实MCP handler与本机REST临时账号已测试保存/读取/审批拒绝/发布；九型unit覆盖、外国知识/材料拒绝、知识JSON不变、纯片假名漢字読み拒绝、numeric answer显式base、编辑旧实践不改变。全量/构建/native最终数记入[实施记录](domain-model-implementation.md)。这些测试没有操作生产MCP。

## 视觉工具路径与阻塞

本轮工具目录未提供browser/IAB调用；仓库现有脚本和package中没有Playwright、Puppeteer、WebDriver或官方Web截图执行器。现有React+jsdom/esbuild可检验DOM/交互，不能产出真实浏览器像素截图；SVG概念图也不能。没有通过系统浏览器自动化、外部环境或新安装工具绕过IAB unavailable。

可用的真实像素路径是用户Mac上的Xcode→独立Simulator→XCTest→xcresulttool附件，已验证65项unit和4条代表流程，截图[在此](native-question-experience/README.md)。这条路径仅证明原生对应场景；iPad/实体设备与23型完整覆盖未执行。Web实际截图需可用且获准的浏览器工具或项目正式截图工具后才能关闭验收阻塞，其余可逆本地fixture/契约实现不依赖该工具。

## 历史/AU 本轮增量（收尾二）

- **历史冻结/映射：核心实现与fixture核对已接入，整项仍有下列边界。** Web/iOS/MCP manifest、快照回看、owned revision/题序保护、旧分数保留、missingOriginal不回放、影子identityReport已实施。DR947合成20题、重复stem、owner、旧SRS/attempt ID与hash测试通过。无法恢复的历史不猜测；分页词汇未呈现/未作答题和MCP首次取题→首次答题窗口未完全冻结，阅读/听力专用响应仍未统一到attempt模型。这些不能算全部历史形态已经关闭。
- **旧AU授权离线读取：实现及本地fixture验收完成。** Node/Cloudflare R2的新素材revision入口、MCP audio:read、owner隔离、删最后LS仍读AU、真实缺字节失败、Web消费、原生账户/AU缓存去重/旧缓存/历史素材下载/暂停LS快照恢复已接入。Miniflare走真实REST/OAuth/MCP路径验证，并非仅mock函数。原生unit验证离线快照与账户隔离；真实旧AU、生产回填未操作。
- **视觉：仍未关闭。** 新增两条真实原生UI回归通过，不代替23型验收。已有浏览器工具缺失阻塞保持。

证据与实现边界见[实施记录](domain-model-implementation.md#收尾二历史冻结与-au-授权离线读取)。最终日志`.local/domain-closeout/`；原生UI结果`.local/domain-closeout-ui.xcresult`。

最终代码全量检查：Node **486/486**；原生 **67/67**；UI **2/2**；tsc、lint、Web/MCP与Cloud API构建、diff check通过。无skip，无生产操作。
