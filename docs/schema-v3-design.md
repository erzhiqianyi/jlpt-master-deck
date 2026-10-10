# 数据库结构 v3：去掉兼容层的关系模型

状态：**已确认，实施中**（2026-10-09）。本文为中文版；英文版 [schema-v3-design.en.md](schema-v3-design.en.md)、日文版 [schema-v3-design.ja.md](schema-v3-design.ja.md) 内容相同，三份同步维护，附录由脚本从同一份 SQL 生成。

**完整字段以 [server/v3/schema.sql](../server/v3/schema.sql) 为准**：每张表、每一列（含 `rid`、`user_id`、`position`、时间列、外键、约束、索引）都在其中列出并带中文注释，已在 SQLite 上实际建库验证。本文档侧重每列的含义、取值和旧数据来源。示例库：`.local/v3-work/sample.sqlite`（只含知识点 W5 一条，用于对照查看）。

表格里“旧数据来源”指迁移时从哪里取值：`表.列` 是旧表的列；`item_json.xxx`、`settings_json.xxx` 等是旧表 JSON 列里的键。示例数据来自线上数据副本（2026-10-07，496 个知识点、3,048 行题目）。

## 1. 为什么要 v3

v2 用一套“映射规格”把旧 JSON 拆进关系表，再用兼容视图拼回旧 JSON，旧代码不用改。代价是表结构由旧 JSON 决定，而不是由业务决定：

- `*_count`、`*_present` 列：只为区分“缺省 / 空数组 / 有内容”，以便逐字节还原旧 JSON。
- `deck` 与 `wordbook_id` 并存：内置词库是推断出来的，不是真实的单词本。
- 同一概念多种写法各占一列：`prompt` / `question_text`、`item_id` / `item_ref`、`tested` / `tested_expression`、`source_draft_id` / `source_draft_ref`。
- 同一道题在知识点、草稿、练习、快照里各存一份（3,048 行题目里大部分是副本）。
- `*_extra` 表存放未建模字段，`item_json_id` 等列只为还原。

v3 的决定（2026-10-09 确认）：**不兼容旧接口**。服务端、MCP、REST 直接读写新表，接口返回新结构，Web 与 iOS 的数据模型一起改。旧数据从原始表（`legacy_v1_*`，或尚未迁移的库里的原表）直接迁移，不经过 v2 的中间结构。

## 2. 设计原则

1. **表按业务建，手写 DDL**。每列都有业务含义，不为还原旧格式而存在。
2. **一个概念一列**。旧数据里的多种写法在迁移时合并。
3. **数组 = 子表的行**，顺序用 `position`（从 0 开始）。长度就是行数，不另存。缺省与空数组不区分。
4. **说明性文字一律进 `content_translations`**，按语言一行；日语原文（例句、题干、选项）是普通列。下文各表的“译文字段”不是该表的列，而是 `content_translations` 里 `owner_table` = 该表、`owner_rid` = 该行 `rid`、`field` = 字段名的行。例如知识点 W5（rid 347）的释义：

   | owner_table | owner_rid | field | language | text |
   |---|---|---|---|---|
   | knowledge_points | 347 | meaning | ja | 物事の全体を、大まかに見渡すこと。 |
   | knowledge_points | 347 | meaning | zh-Hans | 概观、概览 |
   | knowledge_points | 347 | meaning | en | overview, general survey |
5. **内部主键 `rid`（整数自增）**，对外用业务编号 `code`（W12、QV15 …，按用户、按前缀自增）。旧字符串 ID 和旧编号（IT-000919 等）都不进新库：迁移脚本用临时对照表把旧引用接到新 `rid` 上，迁移结束即删除；对照结果写进迁移报告文件供核对。旧编号和旧链接从此失效。
6. **外键真实存在**：子表 `ON DELETE CASCADE`；跨实体引用（题目 ↔ 知识点、练习 ↔ 题目）按删除语义决定 `SET NULL` 或禁止删除。
7. **题目只存一份，直接修改，不分版本**：练习、草稿、知识点通过关联表引用题目。选项有固定编号（`question_options.rid`），正确答案标在选项上；前端出题时可以随机排列选项，作答只记选中的选项编号，并保存当时所选和正确选项的文字与对错。题目以后被修改，历史作答的对错和正确率不变。
8. **时间**一律 ISO 8601 文本（UTC，带 `Z`）；**日期**为 `YYYY-MM-DD`；**布尔**为 0 / 1。

正文只说明设计；每张表的全部列（含 `rid`、`user_id`、`created_at`、`updated_at`、`position`、外键与约束）见文末附录。属于用户的表（标题后注“按用户”）都有 `user_id`（所属用户，FK → `users`），业务编号 `code` 按用户各自编号；子表通过父表间接属于用户，不重复存 `user_id`。

## 3. 公共表

### `languages`：支持的语言

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`languages`](#languages)。

### 多语言是怎么对应的：`languages`、`translatable_fields`、`content_translations`

三张表的关系：

```
languages (code)                       12 种语言
    ▲
    │ language
content_translations ──(owner_table, field)──▶ translatable_fields   哪张表的哪个字段可以翻译（66 个）
    │ (owner_table, owner_rid)
    ▼
任意业务表的某一行（knowledge_points.rid = 347 …）
```

- **`translatable_fields`** 登记所有可翻译字段：`knowledge_points.meaning`、`knowledge_examples.translation`、`question_options.analysis` …… 共 66 个，完整清单在 schema.sql 第 11 节。各表下文的“译文字段”就是这张表里的行。
- **`content_translations`** 存文字本身：一个字段的每种语言一行。`(owner_table, field)` 必须在 `translatable_fields` 里登记过，`language` 必须在 `languages` 里，否则写入被数据库拒绝。
- **`owner_table` + `owner_rid`** 指向业务表的某一行。它不能用外键（同一列要指向几十张不同的表），所以每张业务表有一个删除触发器：删除业务行时，它的译文和注音一并删除。
- **读取时的语言回退**：按用户的说明语言取；没有就按 `languages.fallback_code` 往下找（如 ko → en），最后找 zh-Hans。返回结果会标明实际用了哪种语言、是否是回退。

例：知识点 W5（`knowledge_points.rid` = 347）和它的第一条例句（`knowledge_examples.rid` = 758）在 `content_translations` 里的行：

| owner_table | owner_rid | field | language | text | origin | verified |
|---|---|---|---|---|---|---|
| knowledge_points | 347 | meaning | ja | 物事の全体を、大まかに見渡すこと。 | migrated | 1 |
| knowledge_points | 347 | meaning | zh-Hans | 概观、概览 | migrated | 1 |
| knowledge_points | 347 | meaning | en | overview, general survey | ai | 0 |
| knowledge_points | 347 | explanation | zh-Hans | 从整体上把握事物的全貌。 | migrated | 1 |
| knowledge_examples | 758 | translation | zh-Hans | 概览日本经济的历史。 | migrated | 1 |
| knowledge_examples | 758 | translation | en | Survey the history of the Japanese economy. | ai | 0 |

用户的说明语言设为 English 时，W5 显示 meaning 的 en 行、explanation 的 zh-Hans 行（英文缺失，回退并标注“暂无该语言译文”）。

#### `translatable_fields` 的列

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`translatable_fields`](#translatable_fields)。

#### `content_translations` 的列

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`content_translations`](#content_translations)。

主键 `(owner_table, owner_rid, field, language)`。

### `ruby_annotations`：按需注音

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`ruby_annotations`](#ruby_annotations)。

去掉 `[读音]` 后必须与当前原文完全一致；原文改动后旧注音自动不再显示。

### `id_sequences`：业务编号计数

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`id_sequences`](#id_sequences)。

编号前缀：W 单词类、G 语法类、N 名字类、WB 单词本、QS 题组、QV / QG / QR / QL 词汇 / 语法 / 阅读 / 听力题、MT 素材、DP / TP / MX 每日 / 专项 / 模拟练习、AT 练习记录、DR 草稿、DC 草稿批注、TK 计划任务、RC 录音、IN 收集箱。

### `media_files`：图片与音频文件（按用户）

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`media_files`](#media_files)。

音频的日语原文与译文在素材表 `materials`（见 §6）。

## 4. 设置

### `user_preferences`：显示与练习设置（一行一用户）（按用户）

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`user_preferences`](#user_preferences)。

### 设置子表

完整字段见附录：[`user_card_templates`](#user_card_templates)、[`user_question_kinds`](#user_question_kinds)、[`user_daily_source_ratings`](#user_daily_source_ratings)、[`user_pos_styles`](#user_pos_styles)、[`user_question_type_tips`](#user_question_type_tips)、[`user_custom_tips`](#user_custom_tips)。

### 朗读设置（独立的表）

`user_speech_settings`（一行一用户）（按用户）

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`user_speech_settings`](#user_speech_settings)。

`user_speech_voices`：主键 `(user_id, provider)`

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`user_speech_voices`](#user_speech_voices)。

旧数据每个服务都存了一组、未选过的是空字符串，只迁移实际选过的。语音服务的 API 凭据仍在现有的 `user_tts_credentials(user_id, provider, credential_encrypted)`，不变。

不迁移：`memoryCardFieldsVersion`（卡片字段格式版本，迁移时一次性换算后不再需要）、`requireJlptVocabularyQuestions`（等价于 `user_question_kinds` 非空）。

## 5. 单词本与知识点

### `wordbooks`：单词本（按用户）

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`wordbooks`](#wordbooks)。

唯一约束：`(user_id, code)`、`(user_id, title)`。删除单词本前必须先移走或删除其中的知识点（`knowledge_points.wordbook_rid` 必填，不级联删除）。

- 没有内置词库，也不限定类别：一本可以同时放单词、语法、名字，用知识点的 `kind`（word / grammar / name）区分。
- 旧的内置词库（`n1_vocab`、`grammar_expression`、`name_reading`）迁移为该用户的普通单词本，名称沿用界面原来的叫法或用户改过的名字。只有确实挂了条目的才建。
- 旧 `wordbooks.deck`（限定类别）删除。

#### `wordbook_stats`：单词本统计（只读视图，实时计算）

不存计数列：知识点的新增、删除、移动和每次复习都会改变统计，存成列容易与实际不一致。视图按需计算，依赖索引 `knowledge_points(wordbook_rid, kind)`、`review_schedules(user_id, point_rid)`；每个用户几百到几千条知识点，查询在毫秒级。以后数据量大到变慢时，再改为触发器维护的计数表，接口不变。

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`wordbook_stats`](#wordbook_stats)。

### `knowledge_points`：知识点（单词、语法、表达、名字等）（按用户）

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`knowledge_points`](#knowledge_points)。

译文字段（存于 `content_translations`，`owner_table` 为本表）：

| 字段 | 含义 | 语言（`language` 列） | 旧数据来源 |
|---|---|---|---|
| `meaning` | 释义 | ja：日语释义（国语辞典式）；其他 11 种语言：翻译释义。每种语言一行 | `meaning_zh` → zh-Hans 行；`meaning_ja` → ja 行；无后缀的 `meaning` 与 `meaning_zh` 合并 |
| `explanation` | 详细讲解 | 12 种语言中任意几种，每种一行；旧数据只有 zh-Hans | `explanation_zh` → zh-Hans 行 |

其他需要翻译的文字挂在子表上，见本节末尾“知识点的全部译文字段”。

不迁移：`deck`（已由单词本和 `kind` 取代）、`level_confidence`（无数据）、`content_origin` / `verification_status`（知识点上全为空）、`reference` / `reference_note`（旧编号）、`ruby_terms` / `japanese_annotations`（旧注音，见 §9）。

### 词性

日语词性有两套常用分法：学校文法（日本国语教育，10 品词；动词分五段、上下一段、カ变、サ变）和日本語教育（外国人教材，形容词分い／な形容詞，动词分Ⅰ／Ⅱ／Ⅲグループ），两者一一对应。JLPT 自 2010 年起未公开带词性的词汇表，题目与备考教材普遍使用日本語教育的说法，因此采用后者。

名字（地名、人名等）由 `kind = name` 区分，词性里不再单独设“固有名詞”；名字的类别（地名、駅名、人名、作品名……）记为标签。语法类知识点没有词性。

| `pos` | 显示 | 学校文法 | 例子 |
|---|---|---|---|
| `verb_1` | 動詞Ⅰグループ（五段） | 五段動詞 | 書く、飲む、帰る |
| `verb_2` | 動詞Ⅱグループ（一段） | 上一段・下一段動詞 | 食べる、見る |
| `verb_3_suru` | 動詞Ⅲグループ（する） | サ変動詞 | する、勉強する |
| `verb_3_kuru` | 動詞Ⅲグループ（来る） | カ変動詞 | 来る |
| `i_adjective` | い形容詞 | 形容詞 | 高い |
| `na_adjective` | な形容詞 | 形容動詞 | 静か |
| `noun` | 名詞 | 名詞（含代名詞） | 規制、概観 |
| `adverb` | 副詞 | 副詞 | かつて |
| `conjunction` | 接続詞 | 接続詞 | しかし |
| `adnominal` | 連体詞 | 連体詞 | あらゆる |
| `interjection` | 感動詞 | 感動詞 | ああ |
| `prefix` / `suffix` | 接頭辞 / 接尾辞 | 接頭語 / 接尾語 | 再～ / ～的 |
| `phrase` | 連語・句 | 連語 | 髪を切る |
| `idiom` | 慣用表現 | 慣用句 | 感銘を受ける |

### 变形与日语活用规则库

变形（ます形、て形、可能形……）不再逐条存储，由“辞书形 + 读音 + 词性”查**日语活用规则库**生成。规则库是全局共用的两张表，不属于任何用户（字段见附录 [`conjugation_forms`](#conjugation_forms)、[`conjugation_rules`](#conjugation_rules)）：

- `conjugation_forms`：变形种类。动词 dictionary、polite（ます形）、negative（ない形）、past（た形）、te（て形）、potential、passive、causative、causative_passive、volitional、conditional_ba、conditional_tara、imperative、prohibitive；形容词 adverbial（副词形）、attributive（连体形）等。
- `conjugation_rules`：一条规则 = 词性 + 辞书形词尾 + 变形种类 → 去掉词尾后接上的部分，并附步骤说明（译文字段 `step`，可按说明语言显示）。

| 词性 | 词尾 | 变形 | 接上 | 例子 | 步骤说明 |
|---|---|---|---|---|---|
| verb_1 | く | te | いて | 書く → 書いて | 词尾く变为い，再接て |
| verb_1 | む | te | んで | 読む → 読んで | 词尾む变为ん，再接で |
| verb_1 | む | polite | みます | 読む → 読みます | 词尾む变为み，再接ます |
| verb_2 | る | negative | ない | 食べる → 食べない | 去掉る，接ない |
| verb_3_suru | する | potential | できる | 勉強する → 勉強できる | する变为できる |
| i_adjective | い | past | かった | 高い → 高かった | 去掉い，接かった |
| verb_1 | 行く | te | 行って | 行く → 行って | 例外：行く的て形是行って |
| verb_1 | ある | negative | ない | ある → ない | 例外：ある的否定是ない |
| i_adjective | いい | past | よかった | いい → よかった | 例外：いい变形时用よ |

生成时取**最长匹配的词尾**：「行く」比「く」长，所以 行く 用例外规则，書く 用普通规则。例外动词（行く、ある、いらっしゃる・おっしゃる・なさる・くださる・ござる、問う・請う、いい／よい、ずる动词等）因此只是词尾更长的规则，不需要额外代码，也不需要在知识点上另存分类。词尾同时与写法和读音比对（「行く」与「いく」各一条）。

规则库数据在阶段 1 按日本語教育的活用表整理录入，并用测试覆盖每种词性、每种变形。

旧数据里 AI 写的变形和步骤（`item_json.conjugations`，线上 38 个词，名称混用 polite / ます形、te / て形 / te_form 等）不迁移；迁移时与规则生成的结果逐个比对，不一致的写进迁移报告，用来发现词性或分组标错的词（例如把五段的「帰る」标成一段）。旧 `knowledge_forms`、`knowledge_form_steps` 不再建表。

### 词性换算

旧 `part_of_speech` 是 AI 录入时写的自由文字，线上副本 496 条里有约 110 种写法（你的本地库另有 30 多种），混合了四类信息。迁移时按规则拆开：

| 旧写法里的信息 | 例子 | 去向 |
|---|---|---|
| 主词性 | 名詞、動詞、ナ形容詞、形容動詞（ナ形容詞）、副詞、他动词（一段动词） | `pos`（中日文、繁简写法统一） |
| 自他、サ变 | 動詞・他動詞、名詞・サ変動詞（自動詞） | `transitivity`、`is_suru_noun` |
| 活用分组 | （ワ行五段）、下一段活用、一段；以及旧 `inflection_class`（godan / ichidan / suru / kuru / i_adjective / na_adjective） | 并入 `pos`（godan → verb_1，ichidan → verb_2，suru → verb_3_suru 或 noun + `is_suru_noun`，kuru → verb_3_kuru）；文字与 `inflection_class` 矛盾的写进迁移报告 |
| 其他说明 | 外来語、略語、四字熟語、時間名詞、副詞的用法；地名、駅名、人名、作品名；文法・様態等语法功能；口語縮約・進行状態等口语现象 | 标签（`knowledge_tags`） |

规则换算不了的写法列入迁移报告，人工确认后再迁。录入接口（REST、MCP）只接受枚举值，不再接受自由文字。

### 知识点子表

都带 `point_rid`（所属知识点，删除知识点时一并删除）和 `position`（原数组中的顺序）。

完整字段见附录：[`knowledge_examples`](#knowledge_examples)、[`knowledge_memory_points`](#knowledge_memory_points)、[`knowledge_patterns`](#knowledge_patterns)、[`knowledge_notes`](#knowledge_notes)、[`knowledge_comparisons`](#knowledge_comparisons)、[`knowledge_alternate_forms`](#knowledge_alternate_forms)、[`knowledge_related_words`](#knowledge_related_words)、[`knowledge_sources`](#knowledge_sources)。

### `knowledge_memory_images`：记忆图片（每个知识点每种语言一行）

记忆图片里画有释义和例句译文（见 [记忆图片规范](memory-image-standard.md)），所以按语言分别生成。提示词、生成状态和图片文件属于同一组，放在同一行，不拆进 `content_translations`。

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`knowledge_memory_images`](#knowledge_memory_images)。

主键 `(point_rid, language)`。显示时按用户的说明语言取图；该语言没有时按语言回退顺序取其他语言的图，并标注“暂无该语言图片”。线上副本有 4 个知识点带提示词，各有 1 张图。

无顺序的集合：

完整字段见附录：[`knowledge_tags`](#knowledge_tags)、[`knowledge_question_kinds`](#knowledge_question_kinds)、[`knowledge_distractors`](#knowledge_distractors)、[`knowledge_source_drafts`](#knowledge_source_drafts)、[`knowledge_point_questions`](#knowledge_point_questions)。

### 知识点的全部译文字段

都存于 `content_translations`，同一字段每种语言一行（`language` 列）；旧数据迁移来的文字只有 zh-Hans（`meaning` 另有 ja），其他语言由用户的 AI 通过 MCP 补齐。

| `owner_table` | `field` | 内容 |
|---|---|---|
| `knowledge_points` | `meaning` | 释义 |
| `knowledge_points` | `explanation` | 详细讲解 |
| `knowledge_examples` | `translation`、`spoken_translation`、`analysis`、`form_analysis` | 例句译文、口语说法译文、例句分析、形态分析 |
| `knowledge_memory_points` | `content` | 记忆要点 |
| `knowledge_patterns` | `connection`、`meaning`、`example_translation` | 接续说明、句型含义、句型例句译文 |
| `knowledge_notes` | `title`、`body` | 补充说明的标题、内容（语体、考试提示、要点） |
| `knowledge_comparisons` | `difference` | 近义辨析的区别说明 |

不进译文表的日语原文是各表的普通列：`expression`、`reading`、`paraphrase`、例句 `sentence`、句型 `pattern` 等。记忆图片按语言分行，存在 `knowledge_memory_images` 自己的 `language` 列里。

### 记忆卡模板

记忆卡只用来复习知识点本身：看正面，回想背面。按类别提供几个固定模板，用户为单词、语法、名字各选一个（`user_card_templates`），不再逐个字段配置。模板是全局数据（`card_templates`、`card_template_fields`），名称和说明可按说明语言显示。

| 类别 | 模板 | 正面 | 背面 | 适合 |
|---|---|---|---|---|
| 单词 | 标准（默认） | 写法 | 读音、罗马音、释义、1 条例句（含译文）、1 条记忆要点、记忆图片 | 日常复习 |
| 单词 | 简洁 | 写法 | 读音、释义 | 快速过一遍大量单词 |
| 单词 | 例句 | 1 条例句（不含译文） | 写法、读音、释义、例句译文 | 在语境中回忆词义 |
| 单词 | 日语释义 | 写法 | 读音、日语释义、换说、1 条例句（不含译文） | 用日语理解日语，适合 N2 以上 |
| 语法 | 标准（默认） | 句型 | 接续、含义、1 条例句（含译文）、1 条记忆要点 | 日常复习 |
| 语法 | 例句 | 1 条例句（不含译文） | 句型、含义、例句译文、1 条补充说明 | 在语境中判断语法 |
| 语法 | 辨析 | 句型 | 含义、最多 2 条近义辨析、1 条例句 | 容易混淆的语法 |
| 名字 | 标准（默认） | 写法 | 读音、罗马音、说明 | |

- 背面只放回想所需的内容，例句、记忆要点等最多显示 1–2 条；详细讲解、出处等在“查看详情”里。
- 释义按用户的说明语言显示；罗马音受 `show_romaji` 设置控制。
- 旧的逐字段设置（`memoryCardFrontFields` / `memoryCardBackFields`）不迁移，迁移后使用默认模板。
- 一个知识点只有一张卡，复习进度仍按知识点记录（`review_schedules`）。

**其他练习方式放在题目练习里**，不做成卡片：看汉字选读音、看假名选汉字、看意思选词等，都是题库里对应题型（漢字読み、表記、言い換え类義……）的题目。题目练习有两种方式：

- **随机练习**：按单词本、题型、等级、是否到期等条件从题库随机抽题（`practice_sets.kind` = mixed，抽题条件在 `practice_set_filters`）。
- **AI 定制练习**：通过 MCP 让自己的 AI 按要求出一组题（`practice_sets.kind` = topic；先生成草稿 `ai_drafts`，审查后发布）。

完整字段见附录：[`card_templates`](#card_templates)、[`card_template_fields`](#card_template_fields)、[`user_card_templates`](#user_card_templates)。

## 6. 题库

### 统一数据模型：题组 → 小题 → 选项

JLPT 23 种题型（见 [题型规格](question-type-specifications.md)）的差别集中在四点：一组几道题、共用什么素材；题干里怎么标出考点；选项是什么形式；能否拆开抽题。v3 把所有题型统一为三层，差别由全局题型表 `question_types` 描述，不为每种题型单独建表：

```
question_types（题型规则，全局）
      │ type_id
question_groups（题组 / 大問）──< question_group_materials >── materials（文章、公告、图片、音频）
      │                                                              └─< material_sentences（逐句与关键句）
      └─< questions（小题）
                    ├─< question_marks（标记：考查对象、空位、★，可标在题干或素材正文）
                    ├─< question_options（选项，固定编号）
                    ├─< question_explanation_sections（解析段落：正确依据、步骤、完整答案、技巧、学习目标）
                    ├─< question_evidence（证据：题干 / 素材正文 / 听力原文中的位置，可针对某个选项）
                    ├─< question_tags
                    └─< knowledge_point_questions >── knowledge_points（考查对象 / 前置 / 对比）
```

- **题组（`question_groups`）**：同一题型、共用作答说明与素材的一组小题。词汇、语法单题就是只有一道小题的题组。题型、状态、等级、作答说明、场景说明、是否打乱选项都在题组上。
- **素材（`materials`）**：文章、公告或表格、图片、音频。一个题组可以用多份素材，用 `role` 区分（主文、文章 A / B、公告、场景图、音频）。音频可以只取一段（`clip_start_ms`、`clip_end_ms`）。
- **小题（`questions`）**：题干、小题自己的音频或图片。所有题型的小题字段相同，没有题型专用列。
- **选项（`question_options`）**：固定编号，正确答案标在选项上；可以是文字、图片或音频。

#### 题目定义：所有题型用同一组表

| 内容 | 存放 | 各题型的用法 |
|---|---|---|
| 作答说明、场景 | `question_groups.instruction`、`context` | 所有题型 |
| 素材 | `question_group_materials` → `materials` | 阅读：文章 / A、B 两篇 / 公告；听力：音频、场景图；词汇、语法单题：无 |
| 题干 | `questions.prompt`、`prompt_media_rid` | 即時応答等只有音频时，题干为音频 |
| 标记 | `question_marks`：`kind` + 起止位置 + 编号，可标在题干或素材正文 | 漢字読み、表記、言い換え：target（下划线）；語形成、文脈規定、文法形式：blank；文の組み立て：每个空位一条 slot，★空位为 star_slot；文章の文法：blank，标在文章正文里；阅读、听力、用法：没有标记 |
| 选项 | `question_options`：文字或媒体、`is_correct` | 所有题型；文の組み立て的四个片段就是选项，正确答案是★空位上的片段 |

题型表 `question_types.target_marking` 规定每种题型应有哪种标记，录入时据此校验。

#### 各题型对应的结构

| 题型 | 每组小题 | 素材 | 选项 | 整组抽取 |
|---|---|---|---|---|
| 漢字読み、表記、語形成、文脈規定、言い換え類義、用法 | 1 | 无 | 文字 | — |
| 文法形式の判断、文の組み立て | 1 | 无 | 文字 | — |
| 文章の文法 | 多 | 一篇文章（含编号空位） | 文字 | 是 |
| 内容理解（短文 / 中文 / 長文）、主張理解 | 1–多 | 一篇文章 | 文字 | 是 |
| 統合理解（阅读） | 多 | 文章 A、文章 B | 文字 | 是 |
| 情報検索 | 多 | 公告或表格 | 文字 | 是 |
| 課題理解 | 1 | 音频 | 文字或图片 | 是 |
| ポイント理解 | 1 | 音频 | 文字 | 是 |
| 概要理解、即時応答 | 1 | 音频 | 只有音频 | 是 |
| 発話表現 | 1 | 音频、场景图 | 只有音频 | 是 |
| 統合理解（听力） | 多 | 音频 | 前两问音频、第三问文字 | 是 |
| 阅读基础训练、辨音 | 1–多 | 文章或音频 | 文字 | 是 |
| 听写 | 1 | 音频 | 无（输入文字） | 是 |
| 跟读、自由回答 | 1 | 音频 | 无 | 是 |

适用等级在 `question_type_levels`（与 `src/domain/questionContract.mjs` 一致）。题型的任务说明和答题技巧是 `question_types` 的译文字段 `task`、`tip`，可按说明语言显示。

完整字段见附录：[`question_types`](#question_types)、[`question_type_levels`](#question_type_levels)、[`question_groups`](#question_groups)、[`question_group_materials`](#question_group_materials)、[`materials`](#materials)、[`material_sentences`](#material_sentences)、[`questions`](#questions)、[`question_options`](#question_options)、[`question_marks`](#question_marks)、[`question_explanation_sections`](#question_explanation_sections)、[`question_evidence`](#question_evidence)、[`question_tags`](#question_tags)。

旧 `kind`（练习分类）与 `type_id` 是同一件事的两种叫法，且中英文混用（grammar 721 与 文法 568、kanji_to_kana 289 与 漢字読み 105 等）。迁移时统一换算为 `type_id`，存在题组上。`content_origin`、`verification_status` 在题目上全为空，不迁移。

### 解析：所有题型用同一种结构

按 [题型规格](question-type-specifications.md) 的共通契约，解析由“正确依据、每个选项的理由、证据位置、知识关联、技巧”组成。所有题型都用下面同一组表：

| 内容 | 存放 | 说明 | 旧数据来源（线上副本条数） |
|---|---|---|---|
| 解析段落 | `question_explanation_sections`：有序列表，每段 `kind` + 译文字段 `title`、`body`；前端按数组逐条渲染 | `basis` 正确依据：为什么选这个答案 | `explanation`（1,610 题）、`correctReason`（1,337 题），两者是同一内容的两种叫法 |
| | | `step` 解题步骤 | 阅读题 `explanation_nodes`（205 步） |
| | | `full_answer` 完整答案：如排列题的完整句子 | `full_order` |
| | | `tip` 技巧：考试时怎么快速判断 | `memoryPoint`（1,337 题） |
| | | `objective` 学习目标：这道题练什么 | 草稿题 `learningObjective`（371 题） |
| 选项理由 | `question_options` 的译文字段 `analysis` | 每个选项为什么对或错 | `choiceAnalysis[].explanation`（9,156）、听力 `choice_details[].explanation`（178）、阅读 `choice_explanations[].analysis`（108） |
| 干扰类型 | `question_options.distractor_type` | 错误选项为什么容易被选：与原文不符、语义相近、形式相近 … | 阅读题 `errorType`（108） |
| 证据 | `question_evidence`：题干 / 素材正文 / 听力原文中的一段，可针对整道题或某个选项 | 答案依据在原文哪里 | 阅读题 `choice_explanations[].evidence`（108） |
| 知识关联 | `knowledge_point_questions`：`relation` = target / prerequisite / contrast | 这道题考查、依赖或对比哪些知识点 | 题目的 `itemId` |
| 翻译 | `questions` 的译文字段 `translation`；选项的译文字段 `translation`；素材的译文字段与逐句译文 | 题干、选项、文章、听力原文的译文 | `translationZh`（50）、选项译文（286）、阅读全文与逐句译文（27 篇） |

题目的 `form_analysis_zh`（接续判断，本地数据 71 题，线上副本没有）作为解题步骤 `step`（标题“接续判断”）迁入；正确依据里已经包含同样文字的不重复。旧 `explanation` 中未标语言的原文按内容判断语言后写入；没有假名和汉字的文字（ES 等缩写）按简体中文，因为旧数据的说明都是写给中文学习者的。

### 选项与作答

完整字段见附录：[`question_marks`](#question_marks)、[`question_options`](#question_options)、[`question_explanation_sections`](#question_explanation_sections)、[`question_evidence`](#question_evidence)、[`question_tags`](#question_tags)。

- **选项有固定编号**：每个选项的 `rid` 就是它的编号，不随显示顺序变化。`position` 是标准顺序（官方题目里的 1–4）。
- **正确答案标在选项上**：`is_correct` = 1，每道题只能有一个（唯一索引保证）。不用“第几个选项”表示答案。
- **前端随机排列**：题组的 `shuffle_options` = 1 时，前端打乱选项顺序显示；选项互相引用（「1と2の両方」等）的题和官方原题设为 0，按 `position` 显示。
- **作答只记选项编号**：`attempt_answers.selected_option_rid`。判分看所选选项的 `is_correct`，与显示位置无关。同时保存作答时所选选项和正确选项的文字（`selected_text`、`correct_text`）及对错（`correct`）：题目以后修改，历史记录的对错和正确率不变；选项被删除时仍能看到当时选了什么。
- **文の組み立て（排列题）**：四个片段就是四个选项，正确答案是★空位上的片段（`is_correct`）；空位和★空位是题干上的标记（`question_marks`），完整句子写在解析段落 `full_answer` 里。
- **选项在音频里读出的题**（即時応答、概要理解、発話表現，以及听力統合理解的前两问）：选项既没有文字也没有文件，只按编号显示；需要时可以把读出的内容写在 `text` 里作为原文。
- **位置**：标记与证据的 `start_offset`、`end_offset` 是 UTF-16 位置，与 JavaScript 字符串下标相同（`text.slice(start, end)`）。

题目和素材都直接修改，不保存历史版本。回看历史练习时，题干和解析显示修改后的最新内容；作答的对错以作答时保存的为准。以后如需严格冻结试卷（正式模拟考试），再引入版本表。

听力题号 `library_number` 不迁移，听力题按新编号 QL 排序。

### 校验规则：按题型定义，各端共用一份

不同题型的要求不同：选择题要有正确选项和解析；听写没有选项，答案是一段参考文字；跟读只录音，没有答案和解析；正式听力题的解析可以省略。所以校验规则按题型定义，存成数据而不是写死在代码里。

**作答方式**（`question_types.answer_mode`）

| 作答方式 | 含义 | 题型 |
|---|---|---|
| `choice` | 选择，有一个正确选项 | 全部正式题型、阅读基础训练、辨音 |
| `text_input` | 输入文字，与参考答案（`questions.expected_text`）比对；作答记录存 `attempt_answers.answer_text` | 听写 |
| `recording` | 录音，不判对错；作答记录关联 `attempt_answers.recording_rid` | 跟读 |
| `none` | 不作答或自由回答，不计分 | 自由回答 |

原来的“听力基础训练”拆成 4 个题型：辨音 `listening-basic-discrimination`、听写 `listening-basic-dictation`、跟读 `listening-basic-shadowing`、自由回答 `listening-basic-free`。

**校验规则**（`question_type_rules`：题型 × 规则 → 必填 / 可选 / 禁止 / 只警告）

| 规则 | 词汇、语法 | 阅读（正式） | 听力（正式） | 辨音 | 听写 | 跟读、自由回答 |
|---|---|---|---|---|---|---|
| 题干 `prompt` | 必填 | 必填 | 可选（可以只有音频） | 可选 | 可选 | 可选 |
| 选项 `options` | 必填 4 个 | 必填 4 个 | 必填 4 个（即時応答、発話表現 3 个） | 必填，至少 2 个 | 禁止 | 禁止 |
| 正确选项 `correct_option` | 必填 | 必填 | 必填 | 必填 | 禁止 | 禁止 |
| 参考答案 `expected_text` | 禁止 | 禁止 | 禁止 | 禁止 | 必填 | 禁止 |
| 标记 `marks` | 按题型（下划线、空位、★） | 禁止（文章の文法 除外） | 禁止 | 禁止 | 禁止 | 禁止 |
| 素材 `materials` | 禁止（文章の文法 必填） | 必填 | 必填 | 必填 | 必填 | 必填 |
| 正确依据 `basis` | 必填 | 必填 | 可选 | 可选 | 可选 | 禁止 |
| 选项理由 `option_analysis` | 必填 | 必填 | 可选 | 可选 | 禁止 | 禁止 |
| 证据 `evidence` | — | 只警告（建议有） | — | — | — | — |
| 自动检查项 | 干扰项在知识点里、选项重复、选项长短、考查对象不唯一；漢字読み 另查干扰项是另一读音、读音题选项形式 | 选项长短 | 选项长短 | 选项长短 | — | — |

每个题型的完整规则以 `question_type_rules` 数据为准（26 个题型、261 条）。

**各端共用同一个校验程序**

- 校验程序只写一份，放在 `src/domain/`（JS），由 `question_type_rules` 数据驱动。
- 服务器：REST、MCP 写入题目时执行，必填 / 禁止不满足就拒绝写入，只警告的写入审查发现。服务器是最终判断。
- Web：添加 / 编辑题目的表单直接引用同一个模块，边填边提示，提交前就能看到同样的错误。
- iOS：不另写一份，调用服务器的只校验接口 `POST /api/questions/validate`（不保存）。
- AI：提交前可以用 MCP 工具 `validate_question` 先检查。
- 规则通过 `GET /api/question-types` 下发给客户端，表单按题型显示或隐藏对应的输入项（例如跟读题不显示选项和解析输入框）。

### 题目审查：由 AI agent 判断

结构校验只能保证题目“格式正确”，不能保证干扰项质量（干扰项其实也对、太离谱、选项长短明显不均等）。每个题组创建或修改后都走下面的流程，审查结论由 AI agent 自己判断：**AI 审查通过即变为可用，不需要学习者确认。**

```
AI 出题 ──▶ ① 硬校验 ──不通过──▶ 拒绝写入，错误清单返回给出题的 AI
              │通过
              ▼
           ② 自动检查（只出警告）──▶ 状态 needs_review
              ▼
           ③ AI 审查（get_question_review_context → submit_question_review）
              ├─ pass   ──▶ ready（可用）
              ├─ revise ──▶ needs_revision ──▶ 出题的 AI 按意见修改 ──▶ 回到 ①
              └─ reject ──▶ retired（停用）
           ④ 上线后：作答统计或学习者“报告问题” ──▶ 回到 needs_review
```

**① 硬校验**（写入时，不通过就拒绝）：按题型执行 `question_type_rules` 中“必填”和“禁止”的规则（见上一节），另外所有题型都检查：选项文字互不相同、证据位置在原文范围内且摘录一致、等级在题型的适用等级内。

**② 自动检查**（服务器执行，只对规则为“只警告”的题型执行，写进 `question_review_findings`，reviewer = system）

| 检查项 | 内容 |
|---|---|
| `distractor_in_knowledge` | 干扰项出现在相关知识点的其他写法、相关词、近义辨析里，可能也是正确答案 |
| `distractor_also_reading` | 读音题：干扰项是目标词的另一个有效读音 |
| `reading_options_form` | 读音题选项都是假名；表記题选项都含汉字 |
| `option_length_skew` | 正确选项明显比其他选项长或短 |
| `duplicate_options` | 与同一知识点其他题目的选项完全相同 |
| `target_not_unique` | 标记的考查对象在题干中出现多次 |

**③ AI 审查**（通过 MCP）

- `get_question_review_context(group)`：返回题组、素材、小题、选项、解析，②的警告，以及该题型的审查清单（来自 [题型规格](question-type-specifications.md) 的“结构硬校验与内容审查”和“解析模板”）。
- AI 逐道小题、逐个选项判断：答案是否唯一、每个干扰项是否合理（有迷惑性但确实错）、解析是否说明了每个选项、题干是否自然。
- `submit_question_review(group, verdict, summary, findings[])`：写入 `question_reviews` 与 `question_review_findings`，并按结论改变题组状态。
- 建议由另一个会话或另一个 agent 审查，不让出题的 AI 审自己的题；`agent_label` 记录审查方，同一 agent 出题又审题时在审查记录里可见。
- 需修改时，出题的 AI 用 `list_questions_needing_revision` 取到题目和审查意见，修改后重新提交；修改后的发现项标为 `resolved`。

**④ 上线后的反馈**

- 作答统计：某个干扰项从来没人选（太弱），或选它的比选正确答案还多（可能有歧义），自动生成 warning 并把题组改回 needs_review。
- 学习者在练习中“报告题目问题”：记为 reviewer = user 的审查记录，题组回到 needs_review。

迁移来的旧题：练习中用过的题先为 ready，迁移后由 AI 对全部题组补做一次审查；草稿里的题为 draft。

### 去重

迁移时按**题型 + 题干**去重：

1. 把旧数据里每一份题目（知识点自带题、草稿题、练习题、快照、阅读题、听力题）换算出官方题型 `type_id`，题干做规范化（去掉首尾空白、统一全角半角与换行）。
2. 题型与规范化题干都相同的，视为同一道题，只建一条小题（及其题组）。
3. 同一道题的各份副本里，选项、答案、解析不同的，取最近修改的一份作为这道题的内容；其他副本的差异写进迁移报告，人工确认。
4. 阅读、听力题的题干相同但素材（文章、音频）不同的，不合并。迁移时阅读、听力题按文章 / 音频建题组，同一篇文章的小题归入同一题组；其他题一题一组。
5. 迁移时的临时对照表记录每份旧题对应的新题目，旧作答记录、练习、草稿据此接到新题目上。旧作答记录里的答案是文字，按文字匹配到新题目的选项编号；匹配不上的（来自内容不同的副本）`selected_option_rid` 为空，保留当时的文字和对错。合并情况写进迁移报告。

## 7. 练习、作答、复习

### `practice_sets`：练习（每日练习、专项、综合、模拟考试）（按用户）

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`practice_sets`](#practice_sets)。

译文字段（存于 `content_translations`，`owner_table` 为本表）：`title` 标题、`description` 说明、`disclaimer` 免责说明（如“AI 生成，未经核对”）、`source_summary` 出题依据摘要。

完整字段见附录：[`practice_sections`](#practice_sections)、[`practice_set_entries`](#practice_set_entries)、[`practice_set_filters`](#practice_set_filters)、[`practice_set_filter_types`](#practice_set_filter_types)、[`practice_set_filter_statuses`](#practice_set_filter_statuses)。

### 作答

`practice_attempts`：一次练习记录。（按用户）

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`practice_attempts`](#practice_attempts)。

译文字段（存于 `content_translations`，`owner_table` 为本表）：`title`。旧 `summary`（总题数、正确数、正确率、用时）不再存，由作答行计算。

`attempt_answers`：练习中每道题的作答。

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`attempt_answers`](#attempt_answers)。

`question_answer_states`：每个用户每道题的最新一次作答，用于错题本和“已答”状态。（按用户）

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`question_answer_states`](#question_answer_states)。

`learning_events`：学习事件日志，用于多端同步去重（同一事件只计一次）。（按用户）

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`learning_events`](#learning_events)。

### 复习

`review_schedules`：每个知识点的复习进度（间隔重复）。（按用户）

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`review_schedules`](#review_schedules)。

`review_schedule_baselines`：列同上。iOS 离线修改复习进度后同步时，用它判断服务器上的进度是否被别的设备改过（三方合并的“共同基准”）。

`memory_ratings`：卡片自评记录。（按用户）

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`memory_ratings`](#memory_ratings)。

**复习间隔的规则**（`src/domain/reviewSchedule.mjs`，服务器、Web、iOS 共用）：不再保存答对、答错次数，状态由间隔和复习次数决定——间隔 ≥ 21 天且复习 ≥ 4 次为已掌握，间隔 ≥ 1 天为复习中，其余为学习中。

- 作答（只对考查对象 `relation = target` 的知识点）：答对时间隔增长（0 → 1 → 3 → 前一次 × 难度系数），难度系数 +0.15；答错时间隔回到 1 天，系数 −0.2；还没到期就答对的不推进计划（提前练习不会让间隔过长）。不计分的作答（跟读、自由回答）不改变计划。
- 卡片自评：第一次为 忘记 10 分钟、困难 1 天、记得 3 天、简单 7 天（与旧版相同）；之后从上次的间隔增长（困难 ×1.2、记得 ×系数、简单 ×系数×1.3）。旧版每次都用固定间隔，间隔不会增长。
- 同一个事件编号（`event_id`）只计一次；编号相同而内容不同的提交被拒绝。

## 8. AI 草稿、计划、日报、收集箱、录音

### `ai_drafts`：AI 生成、等待确认的练习草稿（按用户）

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`ai_drafts`](#ai_drafts)。

译文字段（存于 `content_translations`，`owner_table` 为本表）：`title` 标题、`description` 说明、`next_step` 下一步建议。

完整字段见附录：[`ai_draft_objectives`](#ai_draft_objectives)、[`ai_draft_sections`](#ai_draft_sections)、[`ai_draft_questions`](#ai_draft_questions)、[`ai_draft_comments`](#ai_draft_comments)。

### `learning_plans`：学习计划（一用户一份）（按用户）

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`learning_plans`](#learning_plans)。

译文字段（存于 `content_translations`，`owner_table` 为本表）：`fixed_schedule` 固定日程说明、`supplemental_needs` 补充需求、`phase_strategy` 分阶段策略、`post_material_strategy` 教材学完后的策略、`goal` 目标。

完整字段见附录：[`learning_plan_materials`](#learning_plan_materials)、[`learning_plan_tasks`](#learning_plan_tasks)、[`learning_plan_phases`](#learning_plan_phases)、[`learning_plan_phase_points`](#learning_plan_phase_points)。

### `daily_reports`：每日学习总结（按用户）

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`daily_reports`](#daily_reports)。

译文字段（存于 `content_translations`，`owner_table` 为本表）：`summary` 总结正文。

完整字段见附录：[`daily_report_points`](#daily_report_points)、[`daily_report_confusions`](#daily_report_confusions)、[`daily_report_confusion_points`](#daily_report_confusion_points)、[`daily_report_confusion_questions`](#daily_report_confusion_questions)、[`daily_report_recommendations`](#daily_report_recommendations)、[`daily_report_wrong_answers`](#daily_report_wrong_answers)。

### `inbox_captures`：收集箱（学习中随手记下、待整理的内容）（按用户）

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`inbox_captures`](#inbox_captures)。

### `speaking_recordings`：跟读录音（按用户）

完整字段（含 `rid`、`user_id`、时间列、外键与约束）见附录 [`speaking_recordings`](#speaking_recordings)。

译文字段（存于 `content_translations`，`owner_table` 为本表）：`summary` 分析总结、`next_practice` 下一步练习建议。子表 `speaking_recording_notes`：`kind`（strength 做得好的地方 / improvement 需改进的地方），译文字段 `note`；来自 `analysis_json.strengths[]`、`improvements[]`。

### 市场：`market_shares`、`market_share_versions`、`market_imports`

完整字段见附录：[`market_shares`](#market_shares)、[`market_share_versions`](#market_share_versions)、[`market_imports`](#market_imports)。

- **分享包（v2）**：某一时刻的完整快照，整份存为 JSON。结构与 v3 写入接口相同——`knowledge`（知识点输入，不含单词本和编号）、`groups`（题组输入；小题的知识关联用包内知识点的位置 `index` 表示）、`media`（文件清单）。分享者的文件编号另存，导入时在服务器上复制成导入者自己的文件。
- **发布**：从自己的单词本（WB1）或练习（DP3）生成；“更新”从同一来源重新生成新版本，旧版本保留。撤回后不能再导入。
- **导入**：新建导入者自己的单词本（重名时加序号）、知识点（`market_share_id` 记录来源）、题组，练习分享另建一份专项练习。别人的题目一律先进入审查：符合题型规则的为 `needs_review`；不符合的仍然导入，状态 `needs_revision`，违反的规则写成审查发现（严重程度 error），由 AI 修改。同一版本重复导入返回上次的结果（`market_imports`）。
- **迁移**：旧分享包（v1：旧条目 JSON、旧练习题 JSON）在迁移时转换为 v2；来源编号按对照表换成 WB / DP 编号。旧的听力分享（带音频）不是 v1 格式，记入迁移报告，不迁移；旧导入记录是旧格式结果，不迁移。

## 9. 不再保留

| 旧内容 | 处理 |
|---|---|
| 兼容视图、`compat_pending`、INSTEAD OF 触发器、`json_*` 视图 | 删除 |
| `*_count`、`*_present`、`*_key`、`item_json_id`、`json_*` 重复列、`text_language` | 删除 |
| `*_extra` 表（未建模字段） | 迁移时列出所有出现过的键和次数；有业务意义的补建列，其余写入迁移报告后丢弃 |
| `deck`、内置词库 | 删除，见 §5 |
| `level_confidence`（无数据）、`romaji_custom`（未使用，助词 wa / e 写法由搜索键兼容）、`inflection_class`（并入 `pos`）、`practice_question_count` / `practice_mode`（代码未使用；题目数量由 `knowledge_point_questions` 实时统计）、上下级关系 `parent_reference` / `sub_items`（17 条，不保留） | 删除 |
| 题目的旧 `kind` | 换算为 `type_id` 后删除 |
| 复习进度的 `correct` / `wrong` 旧计数（含自评）、自评的 `count_semantics`（全为 legacy_mixed） | 丢弃；正确率由作答记录计算 |
| `content_translations.legacy` | 删除；迁移来的文字 `origin = 'migrated'` |
| `review_items`（user_id = 0 的全局示例数据） | 不迁移，也不再提供演示数据 |
| `ruby_terms`、`japanese_annotations`（旧的逐词注音与分词） | 丢弃；迁移报告列出原来带注音的文字，之后由 AI 检查并按需用 `ruby_annotations` 重新标注。iOS 分词着色改用离线分词 |
| 映射规格引擎（`engine.mjs`、`specs.mjs`、`compat.mjs`） | 迁移完成后删除 |

## 10. 接口与客户端

- REST、MCP、iOS 同步都改为新结构；对外以 `code` 标识记录（W12、QV15），不再暴露内部字符串 ID。
- 题目接口返回“题目 + 选项（带固定编号）”的组合结构；练习接口返回分区与条目。作答接口提交选中的选项编号。
- 多语言字段统一返回所选说明语言的文字及回退信息（`{ text, language, isFallback, origin, verified }`），不再返回 `*_zh` 字段。
- iOS 同步协议的 collection 改为新实体；客户端本地缓存在升级后清空重拉。
- MCP 工具的参数和返回同步改名（例如 `item_id` → `code`），工具说明一起更新。
- 新增题目审查工具：`get_question_review_context`、`submit_question_review`、`list_questions_needing_revision`（见 §6“题目审查”）。
- 新增校验：MCP `validate_question`、REST `POST /api/questions/validate`（只校验不保存）；`GET /api/question-types` 下发题型与校验规则（见 §6“校验规则”）。

## 10a. 查询方式与 Cloudflare 限制

Cloudflare Workers（Durable Object SQLite）的限制：单条语句最多 100 个绑定参数、表达式嵌套深度不超过 100、单条语句不超过 100KB、复合 SELECT 条数有上限。数据层统一按以下规则写：

1. **ID 或多组定位条件只传一个 JSON 参数**，SQL 内用 `json_each(?)` 展开，不写 `IN (?, ?, …)`。参数个数与行数无关。
2. **按表批量查，不逐行查**：详情页 = 主表 1 条 + 每张子表 1 条 + 全部译文 1 条；列表页 = 1 条 SQL（译文用窗口函数按语言回退链挑选）。
3. **SQL 只返回平铺的行，JSON 在 JS 里组装**，不在 SQL 里用嵌套的 `json_object` 拼整条记录（v2 曾因此超过表达式深度限制）。
4. **不用 UNION 拼数据**；需要合并的来源各查一次。
5. **批量写入用 `INSERT … SELECT … FROM json_each(?)`**，一条语句一个 JSON 参数。

实测（线上数据副本，本机 SQLite）：

| 场景 | 参数 | 耗时 |
|---|---|---|
| 单词列表：496 条 + 按语言回退挑释义，一条 SQL | 2 | 2.6 ms |
| 知识点详情：W5 及 10 个子表行的全部译文，一条 SQL | 2 | 0.03 ms |
| 全量同步：全部 24,306 条译文 | 0 | 29 ms |

按 `(owner_table, owner_rid)` 查译文走主键索引。Durable Object 的 SQLite 与代码在同一进程内，没有网络往返，详情页约 8 条小查询合计不到 1 ms。

## 11. 实施阶段

每个阶段结束时：本地全部测试通过、Web 与 iOS 该部分可用、迁移后数据逐项核对。

| 阶段 | 内容 | 核对 |
|---|---|---|
| 0 | 新 DDL；从原始数据直接迁移的脚本（只读旧表，写新库）；迁移报告（每类记录数量、旧 ID → 新编号对照、合并的题目、丢弃的字段、找不到的引用） | 线上副本、你的本地库各迁移一次；数量对账、外键完整、报告里每条旧记录都有去向（迁入或注明丢弃原因） |
| 1 | 设置、单词本、知识点：服务端、REST、MCP、Web；iOS 的设置 | 抽查 30 个知识点全部字段与旧数据一致 |
| 2 | 题库、素材、阅读、听力 | 每种题型抽查；按题型 + 题干的去重结果人工确认 |
| 3 | 练习、作答、复习、学习事件、统计 | 历史成绩、正确率、复习到期数与旧数据一致 |
| 4 | 草稿、计划、日报、收集箱、录音、市场导入 | 各功能走一遍 |
| 5 | iOS（词条、练习、复习、同步协议）、Cloudflare Worker、删除 v2 引擎与兼容代码 | Cloudflare 测试、iOS 全量测试 |
| 6 | 线上迁移（需另行授权）：备份 → 迁移 → 对账 → 切换 | 对账一致才切换 |

阶段 1–4 期间应用处于“部分模块可用”状态，只在本地分支开发，不部署。

实施状态（2026-10-10）：

| 阶段 | 状态 |
|---|---|
| 0–4 | 完成。服务端、REST、MCP、Web、浏览器扩展、MCP App 视图都只用 v3；旧引擎（`storage.mjs` 等）、旧查询层、旧接口和旧演示数据已删除。迁移脚本与 `scripts/v3/verify-*.mjs` 可用 |
| 5 | Cloudflare 完成：Worker 使用 v3（逐条建表、具名参数适配、R2 写入、OAuth 表），集成测试覆盖。离线同步接口 `GET /api/v3/sync` 已就绪。iOS 数据层已改为 v3（`apple/Sources/V3Bridge.swift`，见 [apple-v3-port.md](apple-v3-port.md)），适配层已用 Swift 5.10 编译并通过测试和本地服务器联调，**界面层尚需在 Xcode 中编译、测试** |
| 6 | 工具就绪、未执行：维护接口与 `scripts/v3/cloud-migrate.mjs`（备份 → 迁移 → 对账 → 导入新实例 → 用 `DATABASE_NAME` 切换），步骤见 [cloudflare-pages-deploy.md](cloudflare-pages-deploy.md)。线上执行需另行授权 |

部署 v3 后，仍保存旧数据的线上实例只读等待迁移（请求返回 503）。iOS 需要先在 Xcode 中编译、测试并发布新版本。

## 12. 已确认的决定（2026-10-09）

1. **旧注音数据**（`ruby_terms`、`japanese_annotations`）：丢弃。迁移报告列出原来带注音的文字，之后由 AI 检查一遍，需要的再用按需注音（`ruby_annotations`）标注。目前只有一个用户的数据。
2. **全局示例数据 `review_items`**：不迁移，也不再提供演示数据。
3. **复习表的旧计数**（`correct` / `wrong`、`count_semantics`）：丢弃。
4. **题目去重**：按题型 + 题干去重，规则见 §6“去重”。
5. **“N2関連”“N3関連”**：直接标为对应等级（N2関連 → `jlpt_level_min` = `jlpt_level_max` = N2）。“非JLPT核心词”“生活词汇”仍转为标签。
6. **知识点类别 `kind`**：只分三个大类：word 单词类（含词组、惯用表达、表达集合）、grammar 语法类（含口语音变规则）、name 名字。编号前缀 W / G / N。旧 `type` 的细分（phrase、listening_rule 等）转为标签。
7. **名字的类别**（地名、駅名、人名、作品名……）：用标签；词性里不设“固有名詞”。
8. **变形步骤说明**：按词性和词尾统一成规则，放进全局共用的日语活用规则库（§5“变形与日语活用规则库”）。
9. **题目不分版本**：题目和素材直接修改；选项有固定编号，正确答案标在选项上，前端可随机排列，作答只记选项编号并保存当时的文字与对错（§6“选项与作答”）。
10. **统一数据模型**：所有题型用“题组 → 小题 → 选项”与同一套标记、解析结构（§6）。
11. **记忆卡改为模板**：按类别提供固定模板，用户只选模板；其他练习方式放在题目练习（随机练习、AI 定制练习）（§5“记忆卡模板”）。
12. **校验规则按题型定义**：规则存成数据（`question_type_rules`），服务器、MCP、Web、iOS 共用同一个校验程序（§6“校验规则”）。
13. **题目审查由 AI agent 判断**：AI 审查通过即可用，不需要学习者确认（§6“题目审查”）。
<!-- schema-doc:begin（以下由 scripts/v3/schema-doc.mjs 从 server/v3/schema.sql 生成，请勿手改） -->

## 附录：全部表字段

每张表的全部列，含内部主键、所属用户、时间列与外键。“必填”为空表示可以为空；“约束 / 引用”中的 → 表示外键。“译文字段”不是表的列，存在 `content_translations`（见 §3）。

### 1. 多语言

#### `languages`

支持的语言

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `code` | TEXT | 是 |  | 主键 | 语言代码（BCP 47）：ja、zh-Hans、en、zh-Hant、ko、vi、id、th、my、ne、es、fr | ja、zh-Hans、en、zh-Hant、ko、vi、id、th、my、ne、es、fr | 新生成 |
| `native_name` | TEXT | 是 |  |  | 用该语言自己写的名称：简体中文、English | 简体中文、English |  |
| `fallback_code` | TEXT |  |  | → `languages.code`，被引用时不能删除 | 缺少该语言文字时先找哪种语言；为空则直接回退到 zh-Hans | zh-Hant → zh-Hans；ko → en |  |
| `enabled` | INTEGER | 是 | 1 | 取值：0 / 1 | 是否在设置里提供 | 1 |  |
| `sort_order` | INTEGER | 是 |  |  | 设置页中的排列顺序 |  |  |

#### `translatable_fields`

可翻译字段登记表：哪张表的哪个字段的文字按语言存放在 content_translations

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `owner_table` | TEXT | 是 |  |  | 文字所属的业务表：knowledge_points | knowledge_points、meaning |  |
| `field` | TEXT | 是 |  |  | 字段名：meaning | knowledge_points、meaning |  |
| `description` | TEXT | 是 |  |  | 字段含义：释义 | 释义（ja 为日语释义） |  |
| `allows_ja` | INTEGER | 是 | 0 | 取值：0 / 1 | 是否允许日语行（如日语释义）；说明性文字一般不需要日语 | 1 |  |
| `learner_visible` | INTEGER | 是 | 1 | 取值：0 / 1 | 是否显示给学习者；为 0 的不列入 AI 待翻译清单 | 1 |  |

表级约束：`PRIMARY KEY (owner_table, field)`

#### `content_translations`

所有说明性文字：一个字段的每种语言一行

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `owner_table` | TEXT | 是 |  |  | 文字属于哪张表 | knowledge_points、347 |  |
| `owner_rid` | INTEGER | 是 |  |  | 文字属于该表的哪一行（rid） | knowledge_points、347 |  |
| `field` | TEXT | 是 |  |  | 属于该行的哪个字段（须在 `translatable_fields` 登记） | meaning |  |
| `language` | TEXT | 是 |  | → `languages.code`，被引用时不能删除 | 这一行文字的语言（FK → `languages.code`） | zh-Hans、en、ja |  |
| `text` | TEXT | 是 |  |  | 文字内容，不能为空 | 概观、概览 |  |
| `origin` | TEXT | 是 |  | 取值：migrated / manual / ai | 来源：从旧数据迁移 / 用户编辑 / AI 写入 | migrated 从旧数据迁移 / manual 用户编辑 / ai AI 写入 |  |
| `verified` | INTEGER | 是 | 0 | 取值：0 / 1 | 是否已核对；AI 写入的默认未核对 | AI 写入的默认 0 |  |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`PRIMARY KEY (owner_table, owner_rid, field, language)`；`FOREIGN KEY (owner_table, field) REFERENCES translatable_fields(owner_table, field)`

索引 `content_translations_language`：(language, owner_table, field)

#### `ruby_annotations`

按需注音（Anki 写法：漢字[かな]）。定位方式与译文相同；日语原文列用 language = 'ja'

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `owner_table` | TEXT | 是 |  |  | 注音加在哪张表 | knowledge_examples、758、sentence、ja |  |
| `owner_rid` | INTEGER | 是 |  |  | 哪一行 | knowledge_examples、758、sentence、ja |  |
| `field` | TEXT | 是 |  |  | 哪个字段（日语原文列，或可翻译字段） | knowledge_examples、758、sentence、ja |  |
| `language` | TEXT | 是 |  | → `languages.code`，被引用时不能删除 | 该段文字的语言 | knowledge_examples、758、sentence、ja |  |
| `annotated_text` | TEXT | 是 |  |  | 带注音的文字，Anki 写法：汉字后跟 [读音]，汉字前紧接其他字符时用空格划定范围 | 日本経済[にほんけいざい]の 歴史[れきし]を… |  |
| `created_by` | TEXT | 是 |  | 取值：ai / user | 谁加的注音 | ai / user |  |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`PRIMARY KEY (owner_table, owner_rid, field, language)`

### 2. 编号与文件

#### `id_sequences`

业务编号计数：每个用户每种前缀各自递增，删除后编号不复用

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 | 1、W | 旧表的 `user_id` |
| `prefix` | TEXT | 是 |  |  | W、G、N、WB、QV、QG、QR、QL、MT、DP、TP、MX、AT、DR、DC、TK、RC、IN | 1、W |  |
| `next_no` | INTEGER | 是 | 1 |  | 下一个可用序号；编号删除后不复用 | 331 |  |

表级约束：`PRIMARY KEY (user_id, prefix)`

#### `media_files`

图片与音频文件

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `kind` | TEXT | 是 |  | 取值：image / audio | 文件类别 | image / audio | 来自哪张旧表 |
| `file_name` | TEXT |  |  |  | 上传时的原始文件名 | lesson3.mp3 | `listening_audio_assets.file_name` |
| `mime` | TEXT | 是 |  |  | 文件类型：audio/mpeg、image/png | audio/mpeg、image/png | `mime` |
| `size` | INTEGER | 是 |  |  | 字节数 |  | `size` |
| `sha256` | TEXT | 是 |  |  | 内容哈希，用于去重和校验 |  |  |
| `storage_path` | TEXT | 是 |  |  | 文件在存储里的路径（本地目录或 R2 键） |  | `item_images.image_path`、`listening_audio_assets.audio_path` |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

### 3. 设置

#### `user_preferences`

显示与练习设置（一用户一行）

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 是 |  | 主键；→ `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `ui_language` | TEXT | 是 | zh-CN | 取值：zh-CN / ja / en | 界面语言 | zh-CN / ja / en | `settings_json.locale` |
| `explanation_language` | TEXT | 是 | zh-Hans | → `languages.code`，被引用时不能删除 | 释义与解析的语言 | 12 种语言之一；未设时按界面语言推断后写入 | `settings_json.explanationLanguage` |
| `font_scale` | REAL | 是 | 1 | 范围 0.8–2.0 | 字体缩放倍数 | 0.8–2.0（1） | `settings_json.fontScale`；只有旧档位 `fontSize` 时换算 |
| `feedback_mode` | TEXT | 是 | immediate | 取值：immediate / batch | 每题显示对错 / 整组做完再显示 | immediate 每题答完显示 / batch 整组做完再显示（immediate） | `settings_json.feedbackMode` |
| `practice_navigation` | TEXT | 是 | auto | 取值：auto / manual | 答完自动 / 手动进入下一题 | auto 自动 / manual 手动（auto） | `settings_json.practiceNavigation` |
| `auto_advance_seconds` | REAL | 是 | 0.5 | 范围 0–10 | 自动跳转前等待的秒数 | 0–10，一位小数 | `settings_json.practiceAutoAdvanceSeconds` |
| `show_review_ruby` | INTEGER | 是 | 1 | 取值：0 / 1 | 复习卡片上显示假名注音 | 是 / 否（是） | `settings_json.showReviewRuby` |
| `show_explanation_ruby` | INTEGER | 是 | 1 | 取值：0 / 1 | 解析文字里显示假名注音 | 是 / 否（是） | `settings_json.showExplanationRuby` |
| `show_romaji` | INTEGER | 是 | 1 | 取值：0 / 1 | 读音旁显示罗马音 | 是 / 否（是） | `settings_json.showRomaji` |
| `card_word_spacing` | INTEGER | 是 | 1 | 取值：0 / 1 | 记忆卡上日语按词加间隔 | 是 / 否（是） | `settings_json.memoryCardWordSpacing` |
| `segmented_display` | INTEGER | 是 | 0 | 取值：0 / 1 | 日语分词与词性着色 | 是 / 否 | `settings_json.japaneseDisplay.segmented` |
| `daily_source_answers` | INTEGER | 是 | 1 | 取值：0 / 1 | 每日练习是否取材于最近的作答错题 | 是 / 否 | `settings_json.dailyPracticeSources.answers` |
| `daily_source_card_reviews` | INTEGER | 是 | 1 | 取值：0 / 1 | 每日练习是否取材于最近的卡片自评 | 是 / 否 | `settings_json.dailyPracticeSources.cardReviews` |
| `daily_source_window` | TEXT |  |  |  | 取材的时间范围方式（实现阶段核对取值） | 实现阶段核对取值 | `settings_json.dailyPracticeSources.window` |
| `daily_source_hours` | INTEGER |  |  |  | 按小时取材时的小时数 |  | `settings_json.dailyPracticeSources.hours` |
| `daily_source_time_zone` | TEXT |  |  |  | 判断“今天”用的时区：Asia/Tokyo | Asia/Tokyo | `settings_json.dailyPracticeSources.timeZone` |
| `daily_source_run_at` | TEXT |  |  |  | 每天自动生成练习的时间：07:00 | 07:00 | `settings_json.dailyPracticeSources.runAt` |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

#### `user_card_templates`

用户为每个类别选用的记忆卡模板（没有选时用该类别的默认模板）

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `kind` | TEXT | 是 |  | 取值：word / grammar / name | 知识点大类 |  |  |
| `template_rid` | INTEGER | 是 |  | → `card_templates.rid`，被引用时不能删除 | 选用的模板 |  | 旧 `memoryCardFrontFields` / `memoryCardBackFields`（逐字段设置）不迁移；迁移后各类别使用默认模板 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`PRIMARY KEY (user_id, kind)`

#### `user_question_kinds`

录入单词时必须附带的题型；为空表示不要求

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `type_id` | TEXT | 是 |  | → `question_types.type_id`，被引用时不能删除 | 官方题型 ID：vocabulary-kanji-reading … |  | `settings_json.jlptVocabularyQuestionKinds[]` 换算为官方题型 |

表级约束：`PRIMARY KEY (user_id, type_id)`

#### `user_daily_source_ratings`

卡片自评中哪些评分会被选进每日练习

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `rating` | TEXT | 是 |  | 取值：forgot / hard / remembered / easy |  |  | `settings_json.dailyPracticeSources.ratings[]` |

表级约束：`PRIMARY KEY (user_id, rating)`

#### `user_pos_styles`

分词显示时各词性的标记方式

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `pos` | TEXT | 是 |  | 取值：noun / verb / particle / adjective | 着色的词性大类 |  | `settings_json.japaneseDisplay.styles` 的键 |
| `mode` | TEXT | 是 |  | 取值：none / underline / text | 不标记 / 彩色下划线 / 文字颜色 |  | `settings_json.japaneseDisplay.styles.<词性>.mode` |
| `color` | TEXT | 是 |  |  | 颜色：#326B9C |  | `settings_json.japaneseDisplay.styles.<词性>.color` |

表级约束：`PRIMARY KEY (user_id, pos)`

#### `user_question_type_tips`

用户对官方题型写的答题提示

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `type_id` | TEXT | 是 |  | → `question_types.type_id`，被引用时不能删除 | 官方题型 ID |  | `settings_json.questionTypeTips` 的键 |
| `tip` | TEXT | 是 |  |  | 提示内容 |  | `settings_json.questionTypeTips` 的值 |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`PRIMARY KEY (user_id, type_id)`

#### `user_custom_tips`

用户自建的题型提示

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `section` | TEXT | 是 |  |  | 所属模块：vocabulary / grammar / reading / listening |  | `settings_json.customQuestionTypeTips[]`.section |
| `title` | TEXT | 是 |  |  | 提示标题 |  | `settings_json.customQuestionTypeTips[]`.title |
| `description` | TEXT |  |  |  | 适用场景说明 |  | `settings_json.customQuestionTypeTips[]`.description |
| `tip` | TEXT | 是 |  |  | 提示内容 |  | `settings_json.customQuestionTypeTips[]`.tip |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

#### `user_speech_settings`

朗读设置（一用户一行）

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 是 |  | 主键；→ `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `provider` | TEXT | 是 | browser |  | 语音服务：browser（浏览器 / 系统语音）或已注册的服务 ID | browser（浏览器 / 系统自带语音）或已注册的服务 ID（browser） | `settings_json.ttsProvider` |
| `rate` | REAL | 是 | 1 | 范围 0.5–1.5 | 语速 | 0.5–1.5（1） | `settings_json.speech.rate` |
| `card_auto` | TEXT | 是 | off | 取值：off / front / back | 记忆卡自动朗读：不读 / 显示正面时 / 翻到背面时 | off 不朗读 / front 显示正面时 / back 翻到背面时（off） | `settings_json.speech.cardAuto` |
| `grammar_auto` | INTEGER | 是 | 0 | 取值：0 / 1 | 打开语法详情时自动朗读 | 是 / 否（否） | `settings_json.speech.grammarAuto` |
| `include_example` | INTEGER | 是 | 0 | 取值：0 / 1 | 自动朗读时连同例句一起读 | 是 / 否（否） | `settings_json.speech.includeExample` |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

#### `user_speech_voices`

每个语音服务选用的声音

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `provider` | TEXT | 是 |  |  | 语音服务 ID |  | `settings_json.speech.voices` 的键 |
| `voice` | TEXT | 是 |  |  | 选用的声音 |  | `speech.voices.<provider>.voice` |
| `style` | TEXT |  |  |  | 说话风格（服务支持时） |  | `speech.voices.<provider>.style` |
| `role` | TEXT |  |  |  | 角色（服务支持时） |  | `speech.voices.<provider>.role` |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`PRIMARY KEY (user_id, provider)`

### 4. 单词本与知识点

#### `wordbooks`

单词本：只属于一个用户；一本里可以同时放单词、语法、名字

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） | 1 | 新生成 |
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户（FK → `users`）；单词本只属于一个用户，其他用户看不到 | 1 | `wordbooks.user_id`；内置词库迁移出的单词本属于挂了条目的那个用户 |
| `code` | TEXT | 是 |  |  | 单词本编号，按用户各自从 WB1 开始编 | WB1 | 新生成 |
| `title` | TEXT | 是 |  |  | 单词本名称：N1 文法、IT词汇 | N1 文法、IT词汇 | `wordbooks.title`；用户改过名的取 `wordbook_title_overrides.title` |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | `wordbooks.created_at`、`updated_at` |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | `wordbooks.created_at`、`updated_at` |

表级约束：`UNIQUE (user_id, code)`；`UNIQUE (user_id, title)`

#### `knowledge_points`

知识点：单词、词组、表达、语法、口语音变规则、专有名词

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `code` | TEXT | 是 |  |  | 编号：word → W、grammar → G、name → N | W5、G3、N1 | 新生成 |
| `wordbook_rid` | INTEGER | 是 |  | → `wordbooks.rid`，被引用时不能删除 | 所属单词本（必填；单词本有知识点时不能删除） |  | `item_json.wordbook_id`；为空时归入按旧 `deck` 迁移出的单词本 |
| `kind` | TEXT | 是 |  | 取值：word / grammar / name | 大类：单词类（含词组、惯用表达）/ 语法类（含口语音变规则）/ 名字（地名、人名等专有名词） | word 单词类 / grammar 语法类 / name 名字 | `item_json.type`：vocabulary、phrase、expression、phrase_set → word；grammar、listening_rule → grammar；proper_name → name（与旧 `deck` 无关：“生活日语”里借用 name_reading 词库的普通词汇归为 word）。细分类型转为标签 |
| `expression` | TEXT | 是 |  |  | 知识点本身的日语写法：单词的汉字或假名写法、语法的句型 | 概観、～を皮切りに | `item_json.original` |
| `reading` | TEXT |  |  |  | 假名读音：がいかん | がいかん | `item_json.reading` |
| `romaji` | TEXT |  |  |  | 由读音自动生成的罗马音（修订赫本式，长音按输入法写法）；读音含汉字时为空 | gaikan、toukyou | 迁移时生成 |
| `romaji_key` | TEXT |  |  |  | 罗马音搜索键：小写、去空格、合并长音，tokyo / toukyou / tōkyō 都能匹配 | gaikan、tokyo | 迁移时生成 |
| `pos` | TEXT |  |  | 取值：verb_1 / verb_2 / verb_3_suru / verb_3_kuru / i_adjective / na_adjective noun / adverb / conjunction / adnominal / interjection / prefix / suffix phrase / idiom | 词性，固定枚举，按日本語教育的分法；动词的活用分组直接包含在词性里。语法条目和口语音变规则为空 | verb_1、verb_2、verb_3_suru、verb_3_kuru、i_adjective、na_adjective、noun …，完整列表见下方“词性” | 从 `item_json.part_of_speech` 与 `item_json.inflection_class` 换算，见“词性换算” |
| `transitivity` | TEXT |  |  | 取值：transitive / intransitive / both | 动词的自他，固定枚举；非动词为空 | transitive 他動詞 / intransitive 自動詞 / both 自他両用 | 从 `part_of_speech` 中的 他動詞 / 自動詞 |
| `is_suru_noun` | INTEGER | 是 | 0 | 取值：0 / 1 | 名词能否加する作动词（「規制」→「規制する」）。词条按名詞记录，变形按Ⅲグループ（する）生成 | 是 / 否 | `part_of_speech` 含 サ変，或 `inflection_class` 为 suru 且原文不以する结尾 |
| `base_form` | TEXT |  |  |  | 辞书形：規制する | 規制 → 規制する | `item_json.base_form` |
| `jlpt_level_min` | TEXT |  |  | 取值：N5 / N4 / N3 / N2 / N1 | 等级范围的起点（较低的等级） | N2-N1 → min N2、max N1 | 拆分 `item_json.jlpt_level`：N1 → N1/N1，N2-N1 → N2/N1，“N2関連”→ N2/N2；“非JLPT核心词”“生活词汇”转为标签 |
| `jlpt_level_max` | TEXT |  |  | 取值：N5 / N4 / N3 / N2 / N1 | 等级范围的终点（较高的等级）；单一等级时与起点相同 | N2-N1 → min N2、max N1 | 拆分 `item_json.jlpt_level`：N1 → N1/N1，N2-N1 → N2/N1，“N2関連”→ N2/N2；“非JLPT核心词”“生活词汇”转为标签 |
| `register_level` | TEXT |  |  | 取值：written / spoken / formal / both | 语体，固定枚举，用于筛选；语体的文字说明在 `knowledge_notes` | written 书面 / spoken 口语 / formal 正式 / both 通用 | `item_json.register.level` |
| `paraphrase` | TEXT |  |  |  | 简短的日语换说，一两个词；出「言い換え類義」题时作为正确选项，必须与日语释义不同。日语原文，不翻译 | ～するとすぐに | `item_json.paraphrase_ja` |
| `source_sentence` | TEXT |  |  |  | 学习者遇到这个词的日语原句（读过的文章、听到的句子） | しかし東京では、岸壁という形で海に近づけるのは… | `item_json.source.sentence` 中真正是句子的值；书名章节类的值改存 `knowledge_sources`，见下 |
| `compile_note` | TEXT |  |  |  | 内部记录：这个知识点由什么资料、哪次对话整理而来。不翻译，不在学习页面显示 | ユーザー提供の教材写真から例文と練習問題を整理 | `item_json.source.chat_summary` |
| `source_capture_rid` | INTEGER |  |  | → `inbox_captures.rid`，删除后置空 | 由收集箱的哪条记录整理而来 |  | `item_json.source.capture_id` |
| `market_share_id` | TEXT |  |  |  | 从市场导入的知识点所对应的分享；自己录入的为空 |  | 来自 `user_review_items` 的条目 |
| `captured_at` | TEXT | 是 |  |  | 录入时间 | 2026-09-21T00:00:00+09:00 | `item_json.input_at`；没有时用 `captured_on` 日期 |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`UNIQUE (user_id, code)`；`CHECK ((jlpt_level_min IS NULL) = (jlpt_level_max IS NULL))`

索引 `knowledge_points_wordbook`：(wordbook_rid, kind)；索引 `knowledge_points_romaji`：(user_id, romaji_key)；索引 `knowledge_points_expression`：(user_id, expression)

译文字段（`content_translations.owner_table` = `knowledge_points`）：`meaning` 释义（ja 为日语释义）（含 ja）、`explanation` 详细讲解

#### `knowledge_examples`

例句

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `point_rid` | INTEGER | 是 |  | → `knowledge_points.rid`，随之删除 |  |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `sentence` | TEXT | 是 |  |  | 日语例句 | 日本経済の歴史を概観する。 | `item_json.examples[]`.ja |
| `sentence_reading` | TEXT |  |  |  | 整句读音 |  | `item_json.examples[]`.reading |
| `spoken_sentence` | TEXT |  |  |  | 口语说法 |  | `item_json.examples[]`.spoken_ja |
| `target_reading` | TEXT |  |  |  | 句中目标词的读音（活用后读音可能不同） |  | `item_json.examples[]`.target_reading |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`UNIQUE (point_rid, position)`

译文字段（`content_translations.owner_table` = `knowledge_examples`）：`translation` 例句译文、`spoken_translation` 口语说法译文、`analysis` 例句分析、`form_analysis` 例句形态分析

#### `knowledge_memory_points`

记忆要点

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `point_rid` | INTEGER | 是 |  | → `knowledge_points.rid`，随之删除 |  |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`UNIQUE (point_rid, position)`

译文字段（`content_translations.owner_table` = `knowledge_memory_points`）：`content` 记忆要点

#### `knowledge_patterns`

句型与搭配

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `point_rid` | INTEGER | 是 |  | → `knowledge_points.rid`，随之删除 |  |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `pattern` | TEXT | 是 |  |  | 句型或搭配（日语）：Vた＋とたん | Vた＋とたん | `item_json.patterns[]`.pattern |
| `example` | TEXT |  |  |  | 例句（日语） |  | `item_json.patterns[]`.example |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`UNIQUE (point_rid, position)`

译文字段（`content_translations.owner_table` = `knowledge_patterns`）：`connection` 句型接续说明、`meaning` 句型含义、`example_translation` 句型例句译文

#### `knowledge_notes`

补充说明：标题 + 内容的列表（语体、考试提示、要点等），前端按数组逐条渲染

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `point_rid` | INTEGER | 是 |  | → `knowledge_points.rid`，随之删除 |  |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `kind` | TEXT | 是 |  | 取值：register / exam_tip / key_point / other | 语体 / 考试提示 / 要点 / 其他 |  | `points[]` → key_point；`register.note_zh` → register；`register.exam_tip_zh` → exam_tip |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`UNIQUE (point_rid, position)`

译文字段（`content_translations.owner_table` = `knowledge_notes`）：`title` 补充说明标题、`body` 补充说明内容

#### `knowledge_comparisons`

近义辨析

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `point_rid` | INTEGER | 是 |  | → `knowledge_points.rid`，随之删除 |  |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `target` | TEXT | 是 |  |  | 比较对象（日语）：開講 | 開講 | `item_json.comparisons[]`.target |
| `kind` | TEXT | 是 | synonym | 取值：synonym / everyday | 一般近义词 / 日常说法替换 |  | `item_json.comparisons[]`.kind（空 → synonym） |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`UNIQUE (point_rid, position)`

译文字段（`content_translations.owner_table` = `knowledge_comparisons`）：`difference` 近义辨析的区别说明

#### `knowledge_alternate_forms`

其他写法

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `point_rid` | INTEGER | 是 |  | → `knowledge_points.rid`，随之删除 |  |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `form` | TEXT | 是 |  |  | 其他写法：捕える |  | `item_json.alternate_forms[]` |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |

表级约束：`UNIQUE (point_rid, position)`

#### `knowledge_related_words`

相关词

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `point_rid` | INTEGER | 是 |  | → `knowledge_points.rid`，随之删除 |  |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `word` | TEXT | 是 |  |  | 相关词 |  | `item_json.related_words[]` |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |

表级约束：`UNIQUE (point_rid, position)`

#### `knowledge_sources`

出处：辞典词条、官方网页、教材章节

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `point_rid` | INTEGER | 是 |  | → `knowledge_points.rid`，随之删除 |  |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `title` | TEXT | 是 |  |  | 出处名称：小学館 デジタル大辞泉、実力養成編 第1部 第2課 |  | `item_json.reference_sources[]`.title；`source.sentence` 中书名章节类的值 |
| `url` | TEXT |  |  |  | 链接；教材没有链接时为空 |  | `item_json.reference_sources[]`.url |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |

表级约束：`UNIQUE (point_rid, position)`

#### `knowledge_memory_images`

记忆图片：每个知识点每种语言一行（图片里画有该语言的释义与例句译文）

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `point_rid` | INTEGER | 是 |  | → `knowledge_points.rid`，随之删除 | 所属知识点 |  |  |
| `language` | TEXT | 是 |  | → `languages.code`，被引用时不能删除 | 图片里文字（释义、例句译文）的语言 | zh-Hans、en | 旧数据都是中文，记为 zh-Hans |
| `concept` | TEXT |  |  |  | 画面构思：用什么场景帮助记忆 |  | `item_json.mnemonic_image.concept` |
| `prompt` | TEXT |  |  |  | 生成图片用的提示词（按该语言写） | Japanese vocabulary mnemonic illustration for 規制… | `item_json.mnemonic_image.prompt` |
| `status` | TEXT | 是 |  | 取值：pending / prompt_ready / generated / approved | 待生成 / 提示词就绪 / 已生成 / 已核对可用 | pending 待生成 / prompt_ready 提示词已就绪 / generated 已生成 / approved 已核对可用 | `mnemonic_image.status`（prompt_synced → prompt_ready；只有图片没有提示词的记为 approved） |
| `media_rid` | INTEGER |  |  | → `media_files.rid`，删除后置空 | 上传的图片文件 |  | `item_json.images[].id` |
| `url` | TEXT |  |  |  | 外部图片地址（没有上传文件时） |  | `item_json.images[].url` |
| `caption` | TEXT |  |  |  | 图片说明（与图片同语言） |  | `item_json.images[].caption` |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`PRIMARY KEY (point_rid, language)`

#### `knowledge_tags`

标签

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `point_rid` | INTEGER | 是 |  | → `knowledge_points.rid`，随之删除 |  |  |  |
| `tag` | TEXT | 是 |  |  | 标签：外来語、地名、生活词汇 |  | `item_json.tags[]`；`jlpt_level` 中的非等级值；`part_of_speech` 中的补充说明 |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |

表级约束：`PRIMARY KEY (point_rid, tag)`

#### `knowledge_question_kinds`

适合出的题型

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `point_rid` | INTEGER | 是 |  | → `knowledge_points.rid`，随之删除 |  |  |  |
| `type_id` | TEXT | 是 |  | → `question_types.type_id`，被引用时不能删除 | 官方题型 ID |  | `item_json.question_kinds[]` 换算为官方题型 |

表级约束：`PRIMARY KEY (point_rid, type_id)`

#### `knowledge_distractors`

各题型的干扰选项

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `point_rid` | INTEGER | 是 |  | → `knowledge_points.rid`，随之删除 |  |  |  |
| `type_id` | TEXT | 是 |  | → `question_types.type_id`，被引用时不能删除 | 官方题型 ID |  | `item_json.question_distractors` 的键（题型）换算为官方题型 |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | `item_json.question_distractors{题型: [选项]}` |
| `choice` | TEXT | 是 |  |  | 干扰选项文字 |  | `item_json.question_distractors{题型: [选项]}` 的选项 |

表级约束：`PRIMARY KEY (point_rid, type_id, position)`

#### `knowledge_source_drafts`

来源草稿

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `point_rid` | INTEGER | 是 |  | → `knowledge_points.rid`，随之删除 |  |  |  |
| `draft_rid` | INTEGER | 是 |  | → `ai_drafts.rid`，随之删除 |  |  | `item_json.source.draft_ids[]` |

表级约束：`PRIMARY KEY (point_rid, draft_rid)`

#### `knowledge_point_questions`

知识点与题目的关联（多对多；删除知识点不删除题目）

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `point_rid` | INTEGER | 是 |  | → `knowledge_points.rid`，随之删除 |  |  |  |
| `question_rid` | INTEGER | 是 |  | → `questions.rid`，随之删除 |  |  | `item_json.practice_questions[]` 迁入题库后的题目；题目的 `itemId` |
| `relation` | TEXT | 是 | target | 取值：target / prerequisite / contrast | 考查对象 / 前置知识 / 对比项 |  | 旧数据只有 `itemId` 一种关联，迁移时都记为 target |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | `item_json.practice_questions[]` 迁入题库后建立关联；题目的 `itemId` |

表级约束：`PRIMARY KEY (point_rid, question_rid)`

#### `wordbook_stats`（视图）

单词本统计（实时计算，不存计数）

| 列 | 含义 |
|---|---|
| `wordbook_rid` |  |
| `total` | 知识点总数 |
| `word_count` | 单词类 |
| `grammar_count` | 语法类 |
| `name_count` | 名字 |
| `due_count` | 到期待复习 |
| `new_count` | 还没开始学 |
| `mastered_count` | 已掌握 |

### 4a. 记忆卡模板（全局共用；用户只选模板，不逐个配置字段）

#### `card_templates`

记忆卡模板

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `code` | TEXT | 是 |  |  | 模板编号：word_standard、grammar_example … |  | 新生成 |
| `kind` | TEXT | 是 |  | 取值：word / grammar / name | 适用的知识点大类 |  |  |
| `is_default` | INTEGER | 是 | 0 | 取值：0 / 1 | 是否该类别的默认模板 |  |  |
| `sort_order` | INTEGER | 是 |  |  | 显示顺序 |  |  |

唯一索引 `card_templates_one_default`：(kind) WHERE is_default = 1

译文字段（`content_translations.owner_table` = `card_templates`）：`name` 记忆卡模板名称、`description` 记忆卡模板说明

#### `card_template_fields`

模板在正面、背面显示的内容

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `template_rid` | INTEGER | 是 |  | → `card_templates.rid`，随之删除 |  |  |  |
| `side` | TEXT | 是 |  | 取值：front / back | 正面 / 背面 |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `field` | TEXT | 是 |  | 取值：expression / reading / romaji / meaning / meaning_ja / paraphrase example / pattern / memory_point / note / comparison / conjugation image / level / pos / tags | 显示的内容：写法 / 读音 / 罗马音 / 释义（说明语言）/ 日语释义 / 换说 / 例句 / 句型 / 记忆要点 / 补充说明 / 近义辨析 / 变形 / 记忆图片 / 等级 / 词性 / 标签 |  |  |
| `max_items` | INTEGER |  |  |  | 列表类内容最多显示几条（例句、记忆要点等）；为空表示全部 |  |  |
| `with_translation` | INTEGER | 是 | 1 | 取值：0 / 1 | 例句、句型是否同时显示译文 |  |  |

表级约束：`PRIMARY KEY (template_rid, side, position)`

### 4b. 日语活用规则库（全局共用，不属于任何用户）

#### `conjugation_forms`

变形种类

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `code` | TEXT | 是 |  |  | dictionary、polite、negative、past、te、potential、passive、causative、 causative_passive、volitional、conditional_ba、conditional_tara、imperative、prohibitive、 adverbial、attributive |  | 新生成 |
| `label_ja` | TEXT | 是 |  |  | 日本語教育里的名称：ます形、ない形、て形、た形、可能形 … |  |  |
| `applies_to` | TEXT | 是 |  | 取值：verb / adjective / both | 适用于动词 / 形容词 / 两者 |  |  |
| `sort_order` | INTEGER | 是 |  |  | 显示顺序 |  |  |

译文字段（`content_translations.owner_table` = `conjugation_forms`）：`description` 变形的用法说明

#### `conjugation_rules`

变形规则：按“词性 + 辞书形词尾 + 变形种类”查出替换方式。 生成时取匹配到的最长词尾，例外动词因此只是词尾更长的规则：   verb_1 + く + te → いて（書く → 書いて）；verb_1 + 行く + te → 行って；verb_1 + いく + te → いって   verb_1 + ある + negative → ない；verb_1 + いらっしゃる + polite → いらっしゃいます；i_adjective + いい + past → よかった

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `pos` | TEXT | 是 |  | 取值：verb_1 / verb_2 / verb_3_suru / verb_3_kuru / i_adjective / na_adjective | 适用的词性 |  |  |
| `ending` | TEXT | 是 |  |  | 辞书形词尾（与写法和读音的结尾比对）：く、ぐ、る、する、くる、い、行く、ある … |  |  |
| `form_code` | TEXT | 是 |  | → `conjugation_forms.code`，被引用时不能删除 | 变形种类 |  |  |
| `replacement` | TEXT | 是 |  |  | 去掉词尾后接上的部分：いて、って、ない、よかった |  |  |
| `is_exception` | INTEGER | 是 | 0 | 取值：0 / 1 | 是否例外（行く、ある、敬语动词、問う、いい …） |  |  |

表级约束：`UNIQUE (pos, ending, form_code)`

译文字段（`content_translations.owner_table` = `conjugation_rules`）：`step` 变形步骤说明

### 5. 题库

#### `question_types`

题型（全局，与 src/domain/questionContract.mjs 一致）

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `type_id` | TEXT | 是 |  |  | 题型 ID：vocabulary-kanji-reading、grammar-composition、reading-integrated … |  |  |
| `module` | TEXT | 是 |  | 取值：vocabulary / grammar / reading / listening | 所属模块 |  |  |
| `label_ja` | TEXT | 是 |  |  | 日语名称：漢字読み、文の組み立て、統合理解 |  |  |
| `official` | INTEGER | 是 |  | 取值：0 / 1 | 1 = JLPT 正式题型；0 = 基础训练（不计入正式卷覆盖） |  |  |
| `target_marking` | TEXT | 是 |  | 取值：underline / blank / star / passage_blank / none | 这类题用哪种标记（question_marks）：下划线 / 括号空位 / ★空位排列 / 文章中的编号空位 / 不标；用于录入校验 |  |  |
| `option_media` | TEXT | 是 |  | 取值：text / text_or_image / audio / mixed / none | 选项形式：文字 / 文字或图片 / 只有音频 / 同组内混合（統合理解：前两问音频、第三问文字）/ 没有选项 |  |  |
| `material_kinds` | TEXT | 是 |  | 取值：none / passage / passage_pair / notice / audio / audio_image | 题组需要的素材：无 / 一篇文章 / A、B 两篇 / 公告或表格 / 音频 / 音频加场景图 |  |  |
| `draw_whole_group` | INTEGER | 是 |  | 取值：0 / 1 | 抽题时是否必须整组抽取（一篇多问、统合理解等为 1） |  |  |
| `answer_mode` | TEXT | 是 |  | 取值：choice / text_input / recording / none | 作答方式：选择（有正确选项）/ 输入文字（听写，与参考答案比对）/ 录音（跟读，不判对错）/ 不作答或自由回答（不计分） |  |  |
| `sort_order` | INTEGER | 是 |  |  | 显示顺序（按 JLPT 试卷顺序） |  |  |

译文字段（`content_translations.owner_table` = `question_types`）：`task` 题型任务说明：这类题问什么、`tip` 题型答题技巧

#### `question_type_levels`

题型适用的等级

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `type_id` | TEXT | 是 |  | → `question_types.type_id`，随之删除 |  |  |  |
| `level` | TEXT | 是 |  | 取值：N5 / N4 / N3 / N2 / N1 |  |  |  |

表级约束：`PRIMARY KEY (type_id, level)`

#### `question_type_rules`

题型的校验规则（每个题型每条规则一行）。服务器写入、MCP、Web 表单、iOS（经服务器校验接口）都用这一份规则， 由 src/domain 中同一个校验程序执行。

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `type_id` | TEXT | 是 |  | → `question_types.type_id`，随之删除 |  |  |  |
| `rule` | TEXT | 是 |  | 取值： prompt / options / correct_option / expected_text / marks / materials basis / option_analysis / evidence distractor_also_reading / reading_options_form / distractor_in_knowledge option_length_skew / duplicate_options / target_not_unique | 规则：题干 / 选项 / 正确选项 / 参考答案 / 标记 / 素材 / 正确依据 / 选项理由 / 证据 / 以及自动检查项（干扰项是另一读音、读音题选项形式、干扰项在知识点里、选项长短不均、选项重复、考查对象不唯一） |  |  |
| `requirement` | TEXT | 是 |  | 取值：required / optional / forbidden / warn | 必填（不满足则拒绝写入）/ 可选 / 禁止 / 只警告（写入审查发现） |  |  |
| `value` | INTEGER |  |  |  | 数量类规则的数值：选项必须正好这么多个；为空表示至少 2 个 |  |  |

表级约束：`PRIMARY KEY (type_id, rule)`

#### `materials`

素材：文章、公告或表格、图片、音频；可被多个题组共用（直接修改，不分版本）

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `code` | TEXT | 是 |  |  | 素材编号：MT3 | MT3 | 新生成 |
| `kind` | TEXT | 是 |  | 取值：passage / notice / image / audio | 文章 / 公告或表格 / 图片 / 音频 | passage 文章 / notice 公告或表格 / image 图片 / audio 音频 |  |
| `body` | TEXT |  |  |  | 文章、公告的日语原文（公告里的表格用 Markdown 表格书写）；文章の文法 的空位写作（１）（２）… |  | 阅读题 `passage` |
| `media_rid` | INTEGER |  |  | → `media_files.rid`，被引用时不能删除 | 图片或音频文件 |  | 听力题 `audio_asset_id`；图片题的图片 |
| `clip_start_ms` | INTEGER |  |  |  | 音频片段起点（毫秒）；整段为空 |  |  |
| `clip_end_ms` | INTEGER |  |  |  | 音频片段终点（毫秒）；整段为空 |  |  |
| `transcript` | TEXT |  |  |  | 听力原文（日语） |  | 听力音频 `transcript` |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`UNIQUE (user_id, code)`；`CHECK ((kind IN ('passage', 'notice') AND body IS NOT NULL) OR (kind IN ('image', 'audio') AND media_rid IS NOT NULL))`

译文字段（`content_translations.owner_table` = `materials`）：`title` 素材标题（阅读文章、听力音频的标题）、`body_translation` 文章或公告全文译文、`transcript_translation` 听力原文译文、`summary` 文章概要、`structure` 文章结构分析

#### `material_sentences`

素材逐句（逐句对照译文）

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `material_rid` | INTEGER | 是 |  | → `materials.rid`，随之删除 |  |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `sentence` | TEXT | 是 |  |  | 原文一句 |  | 阅读题 `translation_lines_json[]`.ja |
| `is_key` | INTEGER | 是 | 0 | 取值：0 / 1 | 是否解题关键句 |  | 句子出现在阅读题 `reading_analysis.keySentences[]` 中 |

表级约束：`UNIQUE (material_rid, position)`

译文字段（`content_translations.owner_table` = `material_sentences`）：`translation` 逐句译文

#### `question_groups`

题组（大問）：同一题型、共用作答说明与素材的一组小题

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `code` | TEXT | 是 |  |  | 题组编号：QS12 |  | 新生成 |
| `type_id` | TEXT | 是 |  | → `question_types.type_id`，被引用时不能删除 | 题型（决定模块、考点标法、选项形式） | vocabulary-kanji-reading、grammar-form、reading-short | 题目的 `questionTypeId`；缺失时由旧 `kind`（grammar、文法、kanji_to_kana、漢字読み …）换算 |
| `status` | TEXT | 是 |  | 取值：draft / needs_review / needs_revision / ready / retired | 草稿 / 待审查 / 需修改 / 可用 / 停用；AI 审查通过即为可用 | draft / needs_review / needs_revision / ready / retired | 草稿里的题为 draft；练习中用过的为 ready（迁移后由 AI 补做一次审查，见迁移报告） |
| `official` | INTEGER | 是 | 0 | 取值：0 / 1 | 是否官方原题 | 是 / 否 | `official_jlpt_question` |
| `level` | TEXT |  |  | 取值：N5 / N4 / N3 / N2 / N1 | JLPT 等级，只允许核对过的值 | N1、空 | 旧数据大多为空 |
| `instruction` | TEXT |  |  |  | 作答说明（日语）：＿＿＿の言葉の読み方として最もよいものを… | （　）に入る最もよいものを… | `instruction` |
| `context` | TEXT |  |  |  | 场景、角色、任务条件（日语）：男の人と女の人が話しています。… |  | `context` |
| `shuffle_options` | INTEGER | 是 | 1 | 取值：0 / 1 | 出题时是否打乱选项；选项互相引用、官方原题为 0 |  | 新设：选项文字引用其他选项（「1と2の両方」等）或官方原题为 0，其余为 1 |
| `source_reference` | TEXT |  |  |  | 出处（书名、章节、网址等） |  | `source_reference` / `source` |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`UNIQUE (user_id, code)`

译文字段（`content_translations.owner_table` = `question_groups`）：`instruction_translation` 作答说明译文、`context_translation` 场景说明译文

#### `question_group_materials`

题组使用的素材

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `group_rid` | INTEGER | 是 |  | → `question_groups.rid`，随之删除 |  |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `material_rid` | INTEGER | 是 |  | → `materials.rid`，被引用时不能删除 | 素材（被题组使用时不能删除） |  |  |
| `role` | TEXT | 是 |  | 取值：main / passage_a / passage_b / notice / scene_image / audio | 在题组中的角色：主文 / 文章 A / 文章 B / 公告或表格 / 场景图 / 音频 |  |  |

表级约束：`PRIMARY KEY (group_rid, position)`

#### `questions`

小题

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `code` | TEXT | 是 |  |  | 题目编号：QV / QG / QR / QL + 序号（按题型所属模块） | QV15 | 新生成 |
| `group_rid` | INTEGER | 是 |  | → `question_groups.rid`，随之删除 | 所属题组 |  | 迁移时按来源建题组：阅读、听力题按文章 / 音频分组，其他题一题一组 |
| `position` | INTEGER | 是 |  |  | 在题组中的顺序（問1、問2 …） |  | 旧数组中的顺序 |
| `prompt` | TEXT |  |  |  | 题干（日语）；即時応答等只有音频的题为空 |  | `prompt`、`question`（旧写法） |
| `prompt_media_rid` | INTEGER |  |  | → `media_files.rid`，被引用时不能删除 | 小题自己的音频或图片（如听力每题的提问音频） |  |  |
| `expected_text` | TEXT |  |  |  | 输入文字类题目（听写）的参考答案（日语）；其他作答方式为空 |  | 旧数据没有听写题，迁移时为空 |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`UNIQUE (user_id, code)`；`UNIQUE (group_rid, position)`；`CHECK (prompt IS NOT NULL OR prompt_media_rid IS NOT NULL)`

译文字段（`content_translations.owner_table` = `questions`）：`translation` 题干译文

#### `question_marks`

标记：题干或素材正文中需要标出的位置（所有题型统一）   漢字読み、表記、言い換え：target（下划线）；語形成、文脈規定、文法形式：blank（括号空位）；   文の組み立て：每个空位一条 slot，★空位为 star_slot；文章の文法：blank，标在素材正文里（material_rid 不为空）

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `question_rid` | INTEGER | 是 |  | → `questions.rid`，随之删除 |  |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `kind` | TEXT | 是 |  | 取值：target / blank / slot / star_slot | 考查对象 / 括号空位 / 排列空位 / ★空位 |  | 按题型换算：漢字読み、表記、言い換え → target；語形成、文脈規定、文法形式 → blank；文の組み立て → slot / star_slot；文章の文法 → blank（标在素材正文） |
| `material_rid` | INTEGER |  |  | → `materials.rid`，随之删除 | 标记在哪份素材的正文里；为空表示在题干中 |  | 文章の文法：题组的文章 |
| `start_offset` | INTEGER | 是 |  |  | 起点（UTF-16 位置，与 JavaScript 字符串下标相同，从 0 开始） |  | 迁移时在题干（或素材正文）中查找 `promptTarget` / 空位（　）/ ＿＿ 的位置；找不到或出现多次的写进迁移报告 |
| `end_offset` | INTEGER | 是 |  |  | 终点（不含） |  | 同上 |
| `label` | TEXT |  |  |  | 显示的编号：（１）、★ |  | ★、（１）等题干中的编号 |

表级约束：`UNIQUE (question_rid, position)`；`CHECK (end_offset >= start_offset)`

#### `question_options`

选项：rid 是固定编号，正确答案标在选项上；前端可随机排列，作答只记选中的选项编号

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `question_rid` | INTEGER | 是 |  | → `questions.rid`，随之删除 |  |  |  |
| `position` | INTEGER | 是 |  |  | 标准顺序（官方题目里的 1–4）；不打乱时按此显示 |  | `choices[]` 中的顺序 |
| `text` | TEXT |  |  |  | 选项文字（日语）；图片、音频选项可为空；即時応答等选项在题组音频里读出的，文字和文件都可为空 |  | `choices[]` |
| `media_rid` | INTEGER |  |  | → `media_files.rid`，被引用时不能删除 | 图片或音频选项的文件 |  | 旧数据没有图片、音频选项，迁移时为空 |
| `is_correct` | INTEGER | 是 | 0 | 取值：0 / 1 | 是否正确答案 |  | `answerIndex` 指向的选项；只有 `answer` 文字时按选项文字匹配；并べ替え题为★位置上的片段 |
| `distractor_type` | TEXT |  |  |  | 干扰类型（错误选项为什么容易被选）：与原文不符、语义相近、形式相近 … |  | 阅读题 `choice_explanations[].errorType`；其他题型旧数据没有，为空 |

表级约束：`UNIQUE (question_rid, position)`

唯一索引 `question_options_one_correct`：(question_rid) WHERE is_correct = 1

译文字段（`content_translations.owner_table` = `question_options`）：`analysis` 选项分析：这个选项为什么对或错、`translation` 选项译文

#### `question_explanation_sections`

解析段落：每道题一个有序列表（所有题型统一），前端按数组逐条渲染

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `question_rid` | INTEGER | 是 |  | → `questions.rid`，随之删除 |  |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `kind` | TEXT | 是 |  | 取值：basis / step / full_answer / tip / objective | 正确依据 / 解题步骤 / 完整答案（如排列题的完整句子）/ 技巧 / 学习目标 |  | `explanation` / `correctReason` → basis；`memoryPoint` → tip；`learningObjective` → objective；阅读 `explanation_nodes[]` → step；`full_order` → full_answer（正文为完整句子） |

表级约束：`UNIQUE (question_rid, position)`

译文字段（`content_translations.owner_table` = `question_explanation_sections`）：`title` 解析段落标题、`body` 解析段落内容

#### `question_evidence`

证据：答案依据在原文的哪里（所有题型统一）；可属于整道题，也可属于某个选项

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `question_rid` | INTEGER | 是 |  | → `questions.rid`，随之删除 |  |  |  |
| `option_rid` | INTEGER |  |  | → `question_options.rid`，随之删除 | 针对哪个选项；为空表示针对整道题 |  | 阅读题 `choice_explanations[]` 对应的选项 |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `material_rid` | INTEGER |  |  | → `materials.rid`，随之删除 | 依据在哪份素材；为空表示在题干中 |  |  |
| `source` | TEXT | 是 |  | 取值：prompt / body / transcript | 题干 / 素材正文 / 听力原文 |  | 阅读题为 body；听力题为 transcript |
| `start_offset` | INTEGER |  |  |  | 起点（UTF-16 位置，与 JavaScript 字符串下标相同）；只有摘录、未定位时为空 |  | 迁移时在素材正文中查找摘录的位置；找不到时为空 |
| `end_offset` | INTEGER |  |  |  | 终点（不含） |  |  |
| `quote` | TEXT | 是 |  |  | 原文摘录（日语） |  | 阅读题 `choice_explanations[].evidence` |

表级约束：`UNIQUE (question_rid, position)`

#### `question_tags`

题目标签

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `question_rid` | INTEGER | 是 |  | → `questions.rid`，随之删除 |  |  |  |
| `tag` | TEXT | 是 |  |  |  |  | 阅读题 `tags_json[]` |

表级约束：`PRIMARY KEY (question_rid, tag)`

#### `question_reviews`

题目审查记录：一次审查一行（自动检查、AI 审查、学习者报告问题都记在这里）

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `group_rid` | INTEGER | 是 |  | → `question_groups.rid`，随之删除 | 审查的题组（一篇文章的几道题一起审） |  |  |
| `reviewer` | TEXT | 是 |  | 取值：system / ai / user | 自动检查 / AI agent / 学习者 |  | 新设；旧数据没有审查记录 |
| `verdict` | TEXT | 是 |  | 取值：pass / revise / reject | 通过（题组变为可用）/ 需修改 / 不可用（停用） |  |  |
| `agent_label` | TEXT |  |  |  | 审查的 AI 是谁（MCP 客户端名称等），用于区分出题和审题的 agent |  |  |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |

索引 `question_reviews_group`：(group_rid, created_at)

译文字段（`content_translations.owner_table` = `question_reviews`）：`summary` 审查结论说明

#### `question_review_findings`

审查发现的问题：可针对整个题组、某道小题或某个选项

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `review_rid` | INTEGER | 是 |  | → `question_reviews.rid`，随之删除 |  |  |  |
| `question_rid` | INTEGER |  |  | → `questions.rid`，随之删除 | 针对哪道小题；为空表示整个题组 |  |  |
| `option_rid` | INTEGER |  |  | → `question_options.rid`，随之删除 | 针对哪个选项 |  |  |
| `check_code` | TEXT | 是 |  |  | 检查项：distractor_also_correct、distractor_too_weak、option_length_skew …（见设计文档） |  |  |
| `severity` | TEXT | 是 |  | 取值：error / warning / info | 必须修改 / 建议修改 / 提示 |  |  |
| `resolved` | INTEGER | 是 | 0 | 取值：0 / 1 | 修改后是否已解决 |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |

表级约束：`UNIQUE (review_rid, position)`

译文字段（`content_translations.owner_table` = `question_review_findings`）：`message` 审查发现的问题与修改建议

### 6. 练习、作答、复习

#### `practice_sets`

练习：每日练习、专项、综合、模拟考试

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `code` | TEXT | 是 |  |  | 练习编号：DP3、TP2、MX1 | DP3、MX1 | 新生成 |
| `kind` | TEXT | 是 |  | 取值：daily / topic / mixed / mock | 每日 / 专项 / 综合 / 模拟考试 | daily 每日练习 / topic 专项 / mixed 综合 / mock 模拟考试 | `daily_practices` 按来源区分；`mock_exams` 为 mock |
| `practice_date` | TEXT |  |  |  | 练习日期 | 2026-09-24 | `daily_practices.practice_date` |
| `version` | INTEGER | 是 | 1 |  | 同一天的第几版 | 1 | `daily_practices.version` |
| `minutes` | INTEGER |  |  |  | 建议用时（分钟） | 10 | `daily_practices.minutes` |
| `strategy` | TEXT |  |  | 取值：approved_draft_full_set / agent_topic / targeted_by_history | 出题方式：由确认的草稿整份发布 / AI 按主题出题 / 按作答历史针对性出题 | approved_draft_full_set 由确认的草稿整份发布 / agent_topic AI 按主题出题 / targeted_by_history 按作答历史针对性出题 | `practice_json.strategy` |
| `level` | TEXT |  |  | 取值：N5 / N4 / N3 / N2 / N1 | 模拟考试的等级 | N1 | `mock_exams.content_json.level` |
| `source_draft_rid` | INTEGER |  |  | → `ai_drafts.rid`，删除后置空 | 由哪份 AI 草稿发布而来 |  | `practice_json.sourceDraftId` |
| `generated_at` | TEXT |  |  |  | AI 生成的时间 |  | `practice_json.generated_at` |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`UNIQUE (user_id, code)`

译文字段（`content_translations.owner_table` = `practice_sets`）：`title` 练习标题、`description` 练习说明、`disclaimer` 免责说明、`source_summary` 出题依据摘要

#### `practice_sections`

练习分区（模拟考试的每一场也是一个分区）

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `set_rid` | INTEGER | 是 |  | → `practice_sets.rid`，随之删除 |  |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `instruction` | TEXT |  |  |  | 分区作答说明（日语） |  | `practice_json.sections[]`.instruction |
| `scheduled_date` | TEXT |  |  |  | 模拟考试该场的计划日期 |  | `mock_exams.content_json.sessions[]`.scheduledDate |
| `duration_minutes` | INTEGER |  |  |  | 该场时限（分钟） |  | `mock_exams.content_json.sessions[]`.durationMinutes |

表级约束：`UNIQUE (set_rid, position)`

译文字段（`content_translations.owner_table` = `practice_sections`）：`title` 分区标题、`description` 分区说明

#### `practice_set_entries`

练习中的题目条目

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `set_rid` | INTEGER | 是 |  | → `practice_sets.rid`，随之删除 |  |  |  |
| `section_rid` | INTEGER |  |  | → `practice_sections.rid`，随之删除 | 所在分区；不分区的练习为空 |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `question_rid` | INTEGER | 是 |  | → `questions.rid`，被引用时不能删除 | 题目（题目被练习引用时不能删除） |  | `practice_json.questions[]`、`sessions[].questions[]` 迁入题库后的题目 |

表级约束：`UNIQUE (set_rid, position)`

#### `practice_set_filters`

专项练习的抽题条件

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `set_rid` | INTEGER | 是 |  | 主键；→ `practice_sets.rid`，随之删除 |  |  |  |
| `wordbook_rid` | INTEGER |  |  | → `wordbooks.rid`，删除后置空 | 限定单词本 |  | `practice_json.filters.wordbookId` |
| `jlpt_level` | TEXT |  |  | 取值：N5 / N4 / N3 / N2 / N1 | 限定等级 |  | `practice_json.filters.jlptLevel` |
| `only_due` | INTEGER | 是 | 0 | 取值：0 / 1 | 只抽到期复习的 |  | `practice_json.filters.onlyDue` |
| `question_count` | INTEGER |  |  |  | 抽多少题 |  | `practice_json.filters.count` |

#### `practice_set_filter_types`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `set_rid` | INTEGER | 是 |  | → `practice_sets.rid`，随之删除 |  |  |  |
| `type_id` | TEXT | 是 |  | → `question_types.type_id`，被引用时不能删除 | 限定的官方题型 |  | `practice_json.filters.kinds[]` 换算为官方题型 |

表级约束：`PRIMARY KEY (set_rid, type_id)`

#### `practice_set_filter_statuses`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `set_rid` | INTEGER | 是 |  | → `practice_sets.rid`，随之删除 |  |  |  |
| `status` | TEXT | 是 |  | 取值：new / learning / review / mastered | 限定的记忆状态 |  | `practice_json.filters.statuses[]` |

表级约束：`PRIMARY KEY (set_rid, status)`

#### `practice_attempts`

练习记录（一次作答过程）

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `code` | TEXT | 是 |  |  | 练习记录编号：AT12 | AT12 | 新生成 |
| `set_rid` | INTEGER |  |  | → `practice_sets.rid`，删除后置空 | 做的是哪份练习；临时组卷的为空 |  | `attempt.practiceId` |
| `kind` | TEXT | 是 |  | 取值：daily / vocabulary / grammar / reading / listening / mixed / mock | 练习入口 | daily-practice / vocabulary / grammar / mixed | `attempt.view` |
| `is_active` | INTEGER | 是 | 0 | 取值：0 / 1 | 是否是进行中的练习（每用户最多一条） | 每用户最多一条 | `practice_state.active_attempt_json` |
| `started_at` | TEXT | 是 |  |  |  |  | `startedAt`、`completedAt` |
| `completed_at` | TEXT |  |  |  |  |  | `startedAt`、`completedAt` |
| `analysis_status` | TEXT | 是 | idle | 取值：idle / running / completed / failed | AI 练习分析的状态 | idle 未分析 / running / completed | `analysisStatus` |
| `analysis_started_at` | TEXT |  |  |  |  |  |  |
| `analysis_completed_at` | TEXT |  |  |  |  |  |  |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`UNIQUE (user_id, code)`

唯一索引 `practice_attempts_one_active`：(user_id) WHERE is_active = 1

译文字段（`content_translations.owner_table` = `practice_attempts`）：`title` 练习记录标题

#### `attempt_answers`

练习中每道题的作答

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `attempt_rid` | INTEGER | 是 |  | → `practice_attempts.rid`，随之删除 | 所属练习记录 |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | `questionIds[]` 的顺序 |
| `entry_rid` | INTEGER |  |  | → `practice_set_entries.rid`，删除后置空 | 对应练习里的哪个条目 |  |  |
| `question_rid` | INTEGER |  |  | → `questions.rid`，删除后置空 | 题目；原题已删除或找不到时为空 |  | `questionManifest[]`、`questionIds[]` 经去重对照表换算 |
| `status` | TEXT | 是 |  | 取值：answered / presented / missing_original | 已作答 / 出示未答 / 原题已找不到 | answered 已作答 / presented 出示未答 / missing_original 原题已找不到 | `questionManifest[].status`（线上 1,910 条为 missingOriginal） |
| `selected_option_rid` | INTEGER |  |  | → `question_options.rid`，删除后置空 | 选中的选项（固定编号，与显示顺序无关） |  | `answers[].selected`（文字）按当时题目的选项文字匹配 |
| `selected_text` | TEXT |  |  |  | 作答时所选选项的文字（选项以后被修改或删除也能看到当时选了什么） |  | `answers[].selected` |
| `correct_text` | TEXT |  |  |  | 作答时正确选项的文字 |  | 迁移时题目的正确选项文字 |
| `correct` | INTEGER |  |  | 取值：0 / 1 | 是否答对 |  | `answers[].correct`（保留当时的判定，不重算） |
| `answer_text` | TEXT |  |  |  | 输入文字类题目（听写）用户输入的文字 |  | 旧数据没有输入文字类作答 |
| `recording_rid` | INTEGER |  |  | → `speaking_recordings.rid`，删除后置空 | 录音类题目（跟读）提交的录音 |  | 旧数据的跟读录音与作答记录没有关联，迁移时为空 |
| `started_at` | TEXT |  |  |  | 开始看题时间 |  | `answers[]` 同名字段 |
| `answered_at` | TEXT |  |  |  | 作答时间 |  | `answers[]` 同名字段 |
| `elapsed_ms` | INTEGER |  |  |  | 用时（毫秒） |  | `answers[]` 同名字段 |

表级约束：`UNIQUE (attempt_rid, position)`

#### `question_answer_states`

每个用户每道题的最新一次作答（错题本、“已答”状态）

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `question_rid` | INTEGER | 是 |  | → `questions.rid`，随之删除 | 题目 |  | `answers.question_id` 经对照表换算 |
| `selected_option_rid` | INTEGER |  |  | → `question_options.rid`，删除后置空 | 最新一次选中的选项 |  | `answers.selected` 按题目选项文字匹配 |
| `selected_text` | TEXT |  |  |  | 最新一次所选选项的文字 |  | `answers.selected` |
| `correct` | INTEGER |  |  | 取值：0 / 1 | 是否答对 |  | `answers.selected`、`correct` |
| `answered_at` | TEXT | 是 |  |  | 作答时间 |  | `answers.answered_at` |
| `submission_state` | TEXT | 是 |  | 取值：submitted / draft | 已提交 / 未提交 | submitted 已提交 / draft 未提交（旧数据的 legacy_submitted 记为 submitted） | `answers.submission_state` |
| `event_id` | TEXT |  |  |  | 对应的作答事件 |  | `answers.answer_event_id` |

表级约束：`PRIMARY KEY (user_id, question_rid)`

#### `learning_events`

学习事件日志（多端同步去重：同一事件只计一次）

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `event_id` | TEXT | 是 |  |  | 客户端生成的事件 ID |  |  |
| `event_type` | TEXT | 是 |  | 取值：AnswerSubmitted / MemoryRated | 作答 / 卡片自评 | AnswerSubmitted 作答 / MemoryRated 卡片自评 |  |
| `occurred_at` | TEXT | 是 |  |  | 发生时间 |  |  |
| `received_at` | TEXT | 是 |  |  | 服务器收到时间 |  |  |
| `payload_hash` | TEXT | 是 |  |  | 事件内容哈希，用于识别重复提交 |  |  |
| `question_rid` | INTEGER |  |  | → `questions.rid`，删除后置空 | 涉及的题目 |  |  |
| `point_rid` | INTEGER |  |  | → `knowledge_points.rid`，删除后置空 | 涉及的知识点 |  |  |
| `selected_option_rid` | INTEGER |  |  | → `question_options.rid`，删除后置空 | 选中的选项（作答事件） |  | `payload_json.selected` 按题目选项文字匹配 |
| `selected_text` | TEXT |  |  |  | 所选选项的文字 |  | `payload_json.selected` |
| `correct` | INTEGER |  |  | 取值：0 / 1 |  |  |  |
| `type_id` | TEXT |  |  | → `question_types.type_id`，被引用时不能删除 | 题型 |  |  |
| `rating` | TEXT |  |  | 取值：forgot / hard / remembered / easy | 自评结果（自评事件） | forgot / hard / remembered / easy |  |
| `source` | TEXT |  |  | 取值：ios / web / app / mcp | 来自哪一端 | ios / web / app |  |
| `count_outcome` | TEXT |  |  |  | 是否计入统计（实现阶段核对取值） |  |  |

表级约束：`PRIMARY KEY (user_id, event_id)`

#### `review_schedules`

每个知识点的复习进度（间隔重复）

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `point_rid` | INTEGER | 是 |  | → `knowledge_points.rid`，随之删除 | 知识点 |  | `progress.item_id` |
| `status` | TEXT | 是 |  | 取值：learning / review / mastered | 学习中 / 复习中 / 已掌握 | learning 学习中 283 / review 复习中 199 / mastered 已掌握 56 | `progress_json.status` |
| `review_count` | INTEGER | 是 | 0 |  | 已复习次数 |  | `progress_json.reviewCount` |
| `ease` | REAL | 是 | 2.5 | 范围 1.3–3.0 | 难度系数，越大间隔增长越快 | 1.3–3.0 | `progress_json.ease` |
| `interval_days` | INTEGER | 是 | 0 |  | 当前复习间隔（天） |  | `progress_json.intervalDays` |
| `due_at` | TEXT |  |  |  | 下次复习时间 |  | `progress_json.nextReviewAt` |
| `first_seen_at` | TEXT |  |  |  | 第一次学习时间 |  | 同名字段 |
| `last_reviewed_at` | TEXT |  |  |  | 最近一次复习时间 |  | 同名字段 |
| `last_attempt_rid` | INTEGER |  |  | → `practice_attempts.rid`，删除后置空 | 最近一次练到它的练习记录 |  | `progress_json.lastPracticeSessionId` |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`PRIMARY KEY (user_id, point_rid)`

索引 `review_schedules_due`：(user_id, due_at)

#### `review_schedule_baselines`

iOS 离线同步的共同基准（三方合并时判断服务器进度是否被别的设备改过）

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `point_rid` | INTEGER | 是 |  | → `knowledge_points.rid`，随之删除 |  |  |  |
| `status` | TEXT | 是 |  | 取值：learning / review / mastered |  |  |  |
| `review_count` | INTEGER | 是 |  |  |  |  |  |
| `ease` | REAL | 是 |  |  |  |  |  |
| `interval_days` | INTEGER | 是 |  |  |  |  |  |
| `due_at` | TEXT |  |  |  |  |  |  |
| `first_seen_at` | TEXT |  |  |  |  |  |  |
| `last_reviewed_at` | TEXT |  |  |  |  |  |  |
| `last_attempt_rid` | INTEGER |  |  | → `practice_attempts.rid`，删除后置空 |  |  |  |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`PRIMARY KEY (user_id, point_rid)`

#### `memory_ratings`

卡片自评记录

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `event_id` | TEXT | 是 |  |  | 客户端事件 ID，防止重复提交 |  | `card_reviews.event_id` |
| `point_rid` | INTEGER | 是 |  | → `knowledge_points.rid`，随之删除 | 知识点 |  | `card_reviews.item_id` |
| `rating` | TEXT | 是 |  | 取值：forgot / hard / remembered / easy | 忘记 / 困难 / 记得 / 简单 | forgot 忘记 / hard 困难 / remembered 记得 / easy 简单 | `card_reviews.rating` |
| `reviewed_at` | TEXT | 是 |  |  | 自评时间 |  | `card_reviews.reviewed_at` |
| `source` | TEXT | 是 |  | 取值：ios / web / app / mcp | 来自哪一端 | ios 129 / app 66 / web 1 | `card_reviews.source` |

表级约束：`PRIMARY KEY (user_id, event_id)`

### 7. AI 草稿

#### `ai_drafts`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `code` | TEXT | 是 |  |  | 草稿编号：DR7 | DR7 | 新生成 |
| `status` | TEXT | 是 |  | 取值：draft / needs_revision / approved / archived | 待确认 / 需修改 / 已确认 / 已归档 | draft 待确认 / needs_revision 需修改 / approved 已确认 / archived 已归档 | `review_pack_drafts.status` |
| `kind` | TEXT |  |  | 取值：daily_review_pack / grammar_practice | 草稿类型：每日复习包 / 语法练习 | daily_review_pack 每日复习包 / grammar_practice 语法练习 | `content_json.kind` |
| `strategy` | TEXT |  |  | 取值：targeted_by_history / agent_topic | 出题方式 | targeted_by_history 按作答历史 | `content_json.strategy` |
| `target_level` | TEXT |  |  | 取值：N5 / N4 / N3 / N2 / N1 | 目标等级 | N1 | `content_json.target_level` |
| `practice_date` | TEXT |  |  |  | 计划练习日期 |  | `content_json.practice_date` |
| `minutes` | INTEGER |  |  |  | 预计用时（分钟） |  | `content_json.estimated_minutes` / `minutes` 合并 |
| `generated_at` | TEXT |  |  |  | 生成时间 |  | `content_json.generated_at` |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`UNIQUE (user_id, code)`

译文字段（`content_translations.owner_table` = `ai_drafts`）：`title` 草稿标题、`description` 草稿说明、`next_step` 下一步建议

#### `ai_draft_objectives`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `draft_rid` | INTEGER | 是 |  | → `ai_drafts.rid`，随之删除 |  |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |

表级约束：`UNIQUE (draft_rid, position)`

译文字段（`content_translations.owner_table` = `ai_draft_objectives`）：`objective` 学习目标

#### `ai_draft_sections`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `draft_rid` | INTEGER | 是 |  | → `ai_drafts.rid`，随之删除 |  |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `instruction` | TEXT |  |  |  | 分区作答说明（日语） |  | `content_json.sections[]`.instruction |

表级约束：`UNIQUE (draft_rid, position)`

译文字段（`content_translations.owner_table` = `ai_draft_sections`）：`title` 草稿分区标题、`body` 草稿分区正文

#### `ai_draft_questions`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `draft_rid` | INTEGER | 是 |  | → `ai_drafts.rid`，随之删除 |  |  |  |
| `section_rid` | INTEGER |  |  | → `ai_draft_sections.rid`，随之删除 | 所在分区；不属于分区的为空 |  |  |
| `role` | TEXT | 是 |  | 取值：section / quiz / generated | 分区题 / 小测 / 生成的练习题 |  | `sections[].questions[]` → section；`quiz[]` → quiz；`generated_practice[]` → generated |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `question_rid` | INTEGER | 是 |  | → `questions.rid`，被引用时不能删除 | 题目（草稿删除时题目保留） |  | 草稿中的题目迁入题库后的题目 |

表级约束：`UNIQUE (draft_rid, role, section_rid, position)`

#### `ai_draft_comments`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `draft_rid` | INTEGER | 是 |  | → `ai_drafts.rid`，随之删除 |  |  |  |
| `code` | TEXT | 是 |  |  | 批注编号：DC3（按用户编号） |  | 新生成 |
| `body` | TEXT | 是 |  |  | 批注内容（用户或 AI 写的原文，不翻译） |  | `review_pack_drafts.annotations_json[]`.body |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

### 8. 学习计划

#### `learning_plans`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 是 |  | 主键；→ `users.id`，随之删除 | 一用户一份 |  | 旧表的 `user_id` |
| `exam_name` | TEXT |  |  |  | 目标考试：JLPT 2026年12月 | JLPT 2026年12月 | `plan_json.profile.examName` |
| `level` | TEXT |  |  | 取值：N5 / N4 / N3 / N2 / N1 | 目标等级 | N1 | `profile.level` |
| `start_date` | TEXT |  |  |  | 计划开始日期 |  | `profile.startDate`、`examDate` |
| `exam_date` | TEXT |  |  |  | 考试日期 |  | `profile.startDate`、`examDate` |
| `study_days_per_week` | INTEGER |  |  | 范围 1–7 | 每周学习天数 |  | `profile.studyDaysPerWeek` |
| `daily_minutes` | INTEGER |  |  |  | 每天学习分钟数 |  | `profile.dailyMinutes` |
| `material_start_status` | TEXT |  |  |  | 教材从哪里开始学（实现阶段核对取值） |  | `profile.materialStartStatus` |
| `status` | TEXT | 是 |  | 取值：profile_only / ready / needs_refresh | 只有基本信息 / 已生成 / 需重新生成 | profile_only 只有基本信息 / ready 已生成 / needs_refresh 需重新生成 | `plan_json.status` |
| `generated_at` | TEXT |  |  |  | 计划生成时间 |  | `plan_json.generatedAt` |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

译文字段（`content_translations.owner_table` = `learning_plans`）：`fixed_schedule` 固定日程说明、`supplemental_needs` 补充需求、`phase_strategy` 分阶段策略、`post_material_strategy` 教材学完后的策略、`goal` 学习目标

#### `learning_plan_materials`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `user_id` | INTEGER | 是 |  | → `learning_plans.user_id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `module` | TEXT |  |  | 取值：vocabulary / grammar / reading / listening / other | 教材所属模块 |  | `plan_json.profile.materials[]`.module |

表级约束：`UNIQUE (user_id, position)`

译文字段（`content_translations.owner_table` = `learning_plan_materials`）：`title` 教材名、`current_position` 教材当前进度

#### `learning_plan_tasks`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `user_id` | INTEGER | 是 |  | → `learning_plans.user_id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `code` | TEXT | 是 |  |  | 任务编号：TK12 |  | 新生成 |
| `scheduled_date` | TEXT | 是 |  |  | 日期 |  | `plan_json.tasks[]`.date |
| `module` | TEXT | 是 |  | 取值：vocabulary / grammar / reading / listening / other |  |  | `plan_json.tasks[]`.module |
| `minutes` | INTEGER |  |  |  | 用时（分钟） |  | `plan_json.tasks[]`.minutes |
| `material_rid` | INTEGER |  |  | → `learning_plan_materials.rid`，删除后置空 | 对应教材 |  | `plan_json.tasks[]`.materialId |
| `workload_kind` | TEXT |  |  |  | 工作量类型（旧数据全为空，实现阶段确认是否保留） |  | `plan_json.tasks[]`.workloadKind |
| `status` | TEXT | 是 |  | 取值：pending / completed / skipped / missed | 待做 / 完成 / 跳过 / 错过 |  | `plan_json.tasks[]`.status |
| `completed_at` | TEXT |  |  |  |  |  | `plan_json.tasks[]`.completedAt |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`UNIQUE (user_id, code)`

译文字段（`content_translations.owner_table` = `learning_plan_tasks`）：`title` 任务标题、`detail` 任务说明、`source_label` 任务出处

#### `learning_plan_phases`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `user_id` | INTEGER | 是 |  | → `learning_plans.user_id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `start_date` | TEXT | 是 |  |  |  |  | `plan_json.phases[]`.startDate |
| `end_date` | TEXT | 是 |  |  |  |  | `plan_json.phases[]`.endDate |

表级约束：`UNIQUE (user_id, position)`

译文字段（`content_translations.owner_table` = `learning_plan_phases`）：`focus` 阶段重点、`goal` 阶段目标

#### `learning_plan_phase_points`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `phase_rid` | INTEGER | 是 |  | → `learning_plan_phases.rid`，随之删除 |  |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |

表级约束：`UNIQUE (phase_rid, position)`

译文字段（`content_translations.owner_table` = `learning_plan_phase_points`）：`point` 阶段要点

### 9. 每日总结

#### `daily_reports`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `summary_date` | TEXT | 是 |  |  | 总结的日期 |  | `daily_summaries.date` |
| `time_zone` | TEXT | 是 |  |  | 按哪个时区划分这一天 |  | `time_zone` |
| `total_questions` | INTEGER | 是 |  |  | 当天作答题数 |  | 同名列 |
| `correct_count` | INTEGER | 是 |  |  | 答对数 |  | 同名列 |
| `incorrect_count` | INTEGER | 是 |  |  | 答错数 |  | 同名列 |
| `accuracy` | REAL |  |  |  | 正确率 |  | 同名列 |
| `unique_items` | INTEGER |  |  |  | 当天涉及的知识点数 |  | `stats_json.uniqueItems` |
| `generated_at` | TEXT |  |  |  | 生成时间 |  | `generated_at` |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`UNIQUE (user_id, summary_date)`

译文字段（`content_translations.owner_table` = `daily_reports`）：`summary` 每日总结正文

#### `daily_report_type_stats`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `report_rid` | INTEGER | 是 |  | → `daily_reports.rid`，随之删除 |  |  |  |
| `type_id` | TEXT | 是 |  | → `question_types.type_id`，被引用时不能删除 | 题型 |  | `stats_json.byKind[]`.kind 换算为官方题型 |
| `total` | INTEGER | 是 |  |  |  |  | `stats_json.byKind[]`.total |
| `correct` | INTEGER | 是 |  |  |  |  | `stats_json.byKind[]`.correct |
| `incorrect` | INTEGER | 是 |  |  |  |  | `stats_json.byKind[]`.incorrect |
| `accuracy` | REAL |  |  |  |  |  | `stats_json.byKind[]`.accuracy |

表级约束：`PRIMARY KEY (report_rid, type_id)`

#### `daily_report_points`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `report_rid` | INTEGER | 是 |  | → `daily_reports.rid`，随之删除 |  |  |  |
| `kind` | TEXT | 是 |  | 取值：strength / weakness | 优势 / 弱点 |  | `strengths_json[]` → strength；`weaknesses_json[]` → weakness |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |

表级约束：`UNIQUE (report_rid, kind, position)`

译文字段（`content_translations.owner_table` = `daily_report_points`）：`label` 优势 / 弱点名称、`detail` 优势 / 弱点说明

#### `daily_report_confusions`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `report_rid` | INTEGER | 是 |  | → `daily_reports.rid`，随之删除 |  |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |

表级约束：`UNIQUE (report_rid, position)`

译文字段（`content_translations.owner_table` = `daily_report_confusions`）：`topic` 易混主题

#### `daily_report_confusion_points`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `confusion_rid` | INTEGER | 是 |  | → `daily_report_confusions.rid`，随之删除 |  |  |  |
| `point_rid` | INTEGER | 是 |  | → `knowledge_points.rid`，随之删除 | 涉及的知识点 |  | `confusion_groups_json[]`.items[] |

表级约束：`PRIMARY KEY (confusion_rid, point_rid)`

#### `daily_report_confusion_questions`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `confusion_rid` | INTEGER | 是 |  | → `daily_report_confusions.rid`，随之删除 |  |  |  |
| `question_rid` | INTEGER | 是 |  | → `questions.rid`，随之删除 | 作为证据的题目 |  | `confusion_groups_json[]`.evidenceQuestionIds[] |

表级约束：`PRIMARY KEY (confusion_rid, question_rid)`

#### `daily_report_recommendations`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `report_rid` | INTEGER | 是 |  | → `daily_reports.rid`，随之删除 |  |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `type` | TEXT | 是 |  | 取值：review / practice / quality / priority / card_review | 复习 / 练习 / 内容质量 / 优先级 / 卡片复习 |  | `recommendations_json[]`.type |

表级约束：`UNIQUE (report_rid, position)`

译文字段（`content_translations.owner_table` = `daily_report_recommendations`）：`title` 建议标题、`detail` 建议内容

#### `daily_report_wrong_answers`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `report_rid` | INTEGER | 是 |  | → `daily_reports.rid`，随之删除 |  |  |  |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |
| `question_rid` | INTEGER |  |  | → `questions.rid`，删除后置空 | 错题 |  | `wrong_questions_json[]`.questionId |
| `point_rid` | INTEGER |  |  | → `knowledge_points.rid`，删除后置空 | 相关知识点 |  | `wrong_questions_json[]`.itemId |
| `selected` | TEXT |  |  |  | 所选答案 |  | `wrong_questions_json[]`.selected |
| `correct_answer` | TEXT |  |  |  | 正确答案 |  | `wrong_questions_json[]`.correctAnswer |

表级约束：`UNIQUE (report_rid, position)`

### 10. 收集箱、跟读录音

#### `inbox_captures`

收集箱：学习中随手记下、待整理的内容

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `code` | TEXT | 是 |  |  | 编号：IN12 | IN12 | 新生成 |
| `body` | TEXT | 是 |  |  | 记下的内容：開校 | 開校 | `learning_captures.body` |
| `category` | TEXT | 是 |  | 取值：word / grammar / sentence / listening / reading / unsure | 内容类别 | word 单词 286 / grammar 语法 28 / sentence / listening / reading / unsure | `category` |
| `context` | TEXT |  |  |  | 出处或上下文 | 点词查询\n原文：… | `context` |
| `target_wordbook_rid` | INTEGER |  |  | → `wordbooks.rid`，删除后置空 | 整理后要放进哪个单词本 |  | `target_wordbook_id`（旧 `target_deck` 换算为迁移出的单词本） |
| `status` | TEXT | 是 |  | 取值：inbox / processed / archived | 待处理 / 已整理 / 已归档 | inbox 待处理 185 / processed 已整理 128 / archived 已归档 1 | `status` |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`UNIQUE (user_id, code)`

#### `speaking_recordings`

跟读录音

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `code` | TEXT | 是 |  |  | 编号：RC1 | RC1 | 新生成 |
| `question_rid` | INTEGER |  |  | → `questions.rid`，删除后置空 | 跟读的听力题 |  | `listening_question_id` |
| `audio_media_rid` | INTEGER | 是 |  | → `media_files.rid`，被引用时不能删除 | 录音文件 |  | `audio_mime`、`audio_size`、`audio_path` 迁入 `media_files` |
| `status` | TEXT | 是 |  | 取值：pending / analyzing / completed / failed | 待分析 / 分析中 / 完成 / 失败 | pending 待分析 / analyzing 分析中 / completed 完成 / failed 失败 | `status` |
| `transcript` | TEXT |  |  |  | 识别出的日语 |  | `analysis_json.transcript` |
| `reference_transcript` | TEXT |  |  |  | 参考原文 |  | `analysis_json.referenceTranscript` |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `updated_at` | TEXT | 是 |  |  | 最后修改时间 |  | 旧表的 `updated_at`；旧数据没有时取迁移时间 |

表级约束：`UNIQUE (user_id, code)`

译文字段（`content_translations.owner_table` = `speaking_recordings`）：`summary` 录音分析总结、`next_practice` 下一步练习建议

#### `speaking_recording_notes`

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 是 |  | 主键 | 内部主键（整数自增） |  | 新生成 |
| `recording_rid` | INTEGER | 是 |  | → `speaking_recordings.rid`，随之删除 |  |  |  |
| `kind` | TEXT | 是 |  | 取值：strength / improvement | 做得好的地方 / 需改进的地方 |  | `analysis_json.strengths[]` → strength；`improvements[]` → improvement |
| `position` | INTEGER | 是 |  |  | 在列表中的顺序，从 0 开始 |  | 旧数组中的顺序 |

表级约束：`UNIQUE (recording_rid, kind, position)`

译文字段（`content_translations.owner_table` = `speaking_recording_notes`）：`note` 录音反馈

### 10b. 市场（分享与导入）

#### `market_shares`

分享

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `id` | TEXT | 是 |  | 主键 | 分享编号（UUID，对外链接用） |  |  |
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `source_id` | TEXT | 是 |  |  | 来源：单词本编号（WB1）或练习编号（DP3） |  |  |
| `kind` | TEXT | 是 |  | 取值：wordbook / practice | 分享单词本 / 分享练习 |  |  |
| `package_json` | TEXT | 是 |  |  | 当前版本的分享包（v2 格式）及分享者文件编号 |  |  |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |
| `withdrawn` | INTEGER | 是 | 0 | 取值：0 / 1 | 是否已撤回（撤回后不能再导入） |  |  |

#### `market_share_versions`

分享的各个版本

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `share_id` | TEXT | 是 |  | → `market_shares.id`，随之删除 |  |  |  |
| `revision` | INTEGER | 是 |  |  | 版本号，从 1 开始 |  |  |
| `package_json` | TEXT | 是 |  |  | 该版本的分享包 |  |  |
| `fingerprint` | TEXT | 是 |  |  | 分享包内容的哈希，识别重复导入 |  |  |
| `created_at` | TEXT | 是 |  |  | 创建时间 |  | 旧表的 `created_at`；旧数据没有时取迁移时间 |

表级约束：`PRIMARY KEY (share_id, revision)`

#### `market_imports`

导入记录（同一版本只导入一次）

| 列 | 类型 | 必填 | 默认 | 约束 / 引用 | 含义 | 取值 / 示例 | 旧数据来源 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 是 |  | → `users.id`，随之删除 | 所属用户 |  | 旧表的 `user_id` |
| `digest` | TEXT | 是 |  |  | 分享编号 + 内容哈希 |  |  |
| `result_json` | TEXT | 是 |  |  | 导入结果：新建的单词本、知识点、题组、练习编号和跳过的题 |  |  |

表级约束：`PRIMARY KEY (user_id, digest)`

### 11. 可翻译字段登记（与上面各表注释里的“译文字段”一一对应）

### 12. 删除业务行时清理它的译文与注音（译文按“表名 + rid”挂载，无法用外键级联）

<!-- schema-doc:end -->
