# 日语分词、词性与假名标注

日语内容与显示偏好分开保存。AI 应在生成内容时同时生成标注；旧内容的标注可选，原生客户端使用系统 `NLTokenizer` 离线回退，不需要下载词典。上下文标注优先于词条读音和本机分析。

## 内容数据契约

词汇、语法条目及 `practice_questions` 种子使用 `japanese_annotations`；正式练习题、阅读题和听力题使用 `japaneseAnnotations`。数组中每条记录对应一段未经修改的原文：

```json
{
  "text": "美しい景色を見た。",
  "tokens": [
    { "surface": "美しい", "reading": "うつくしい", "pos": "adjective" },
    { "surface": "景色", "reading": "けしき", "pos": "noun" },
    { "surface": "を", "pos": "particle" },
    { "surface": "見た", "reading": "みた", "pos": "verb" },
    { "surface": "。", "pos": "other" }
  ]
}
```

规则：

- 所有 `surface` 拼接必须与 `text` 完全一致，包括标点、空格、换行和表情。分词结果不插入展示空格、不改写原文，不使用跨语言有歧义的字符下标。
- `reading` 可选，使用当前语境的假名读音。原生使用 Core Text ruby 将假名放在汉字上方，字面一致的前后假名保留在正文行。
- `pos` 可选，枚举为 `noun`、`verb`、`particle`、`adjective`、`adverb`、`other`。不确定时留空或用 `other`，不猜测。
- 新生成的原词、日文释义、例句、接续、题干、选项、听力文本和日语引用都应同时标注。混合中文笔记可只提供其中日语片段的记录。
- 原文不内嵌 HTML、颜色、显示间距或自动添加的括号读音。颜色与样式来自用户设置。
- 无效输入会在保存前被拒绝。阅读、听力和词条更新省略字段时保留原标注；明确传 `[]` 清除。客户端忽略不能与当前文字匹配的旧记录，避免编辑后错位。

`server/japanese-annotations.mjs` 是公共校验入口。MCP 创建/更新阅读、听力的字段 schema，以及词条工具的说明均提供此契约。`get_draft_processing_context` 也返回结构示例与生成规则。正式练习发布保留题目/条目标注，分享导入保留同样的数据。

## 数据库存储

- 词汇、语法：现有按账户存储的 `item_json` 内保存 `japanese_annotations`，题目种子的标注在种子对象内。
- 练习：现有练习 JSON 内每题保存 `japaneseAnnotations`；草稿原文 JSON 可以保存同样字段，发布时传播到正式题目。
- 阅读、听力：分别新增 `japanese_annotations_json TEXT NOT NULL DEFAULT '[]'`，由 `ensureColumn` 加法迁移，不重建或删除旧表。
- 模拟卷：用户试卷 JSON 的题目也可保存 `japaneseAnnotations`，内嵌网页使用同一设置渲染，作答前隐藏 ruby。
- 原生下载快照：Codable 模型保留标注，离线仍可使用。
- 未迁移真实生产数据库、未发布客户端/Worker。数据库迁移将在新后端启动时执行。

## 用户设置

`user_settings.settings_json.japaneseDisplay` 保存 `segmented` 和四类 `styles`。各类 `{ mode: "none" | "underline" | "text", color: "#RRGGBB" }` 独立配置。分词默认关闭。显示与阅读设置提供开关、颜色选择和即时预览，保存时与其他设置合并，并检查后端确实保留了新设置。

开启分词后只在词元间插入显示用的细空格；复制、朗读和答案判断始终使用原文。卡片、详情、练习/解析、阅读、听力、学习内容预览及历史内容使用统一原生组件。读音/表记题确认前禁用 ruby 提示。源内容中的未知词性保持中性色；系统支持日语 `lexicalClass` 才使用它，否则只标记可靠的助词及词库明确标出的词性。

## 检查

```sh
node --test server/japanese-annotations.test.mjs server/reading-questions.test.mjs server/item-schema.test.mjs server/market.test.mjs
npm run build:native-questions
node --test scripts/native/questions-bundle.test.mjs
```

原生测试覆盖 Unicode 原文完整性、上下文优先、回退、ruby 属性、词性样式、开关关闭还原原文，以及作答前隐藏读音。界面测试使用独立演示数据，检查详情、例句、设置预览和保存后恢复。
