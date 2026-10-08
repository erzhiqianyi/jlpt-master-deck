# 表结构 v2 原型

独立原型，不接入现有 Web / iOS / MCP，也不读写 `.local/` 里的真实数据。

```bash
node prototypes/schema-v2/demo.mjs                  # 内存库跑完整流程并打印
node prototypes/schema-v2/demo.mjs --db /tmp/v2.db  # 写到文件，可用 sqlite3 查看
node --test prototypes/schema-v2/demo.test.mjs
```

| 文件 | 内容 |
|---|---|
| `schema.sql` | 49 张表（含编号、语言两张参考表和 7 张翻译表），全部 STRICT，带中文注释 |
| `seed.sql` | 最小样例数据；除 `market_imports`、`market_import_items` 由 demo 生成外，每张表都有数据 |
| `romaji.mjs` | 假名 → 罗马音，搜索键，自定义写法校验 |
| `ruby.mjs` | Anki 写法注音：解析、去标记、校验 |
| `service.mjs` | 演示用服务层（事务、编号分配、各业务操作） |
| `mcp-tools.mjs` | 语言相关 MCP 工具：`list_languages`、`get/set_language_settings`、`list_missing_translations`、`set_translation`、`set_ruby_annotation` |
| `demo.mjs` / `demo.test.mjs` | 19 步完整流程及断言 |
| `data/*.sqlite` | 生成的样例库（`seed`）和跑完演示后的库（`demo`），不提交 |

## 设计规则

1. **编号**：业务前缀 + 每个用户内按业务类型自增（`W12`、`QV15`、`DP3`），在写入事务里由 `id_sequences` 分配，只增不减。子记录用“父编号 + 序号”定位（`QV15r1` 的选项 3、`W12` 的例句 2）。旧编号经 `legacy_references` 仍可查。
2. **少用 JSON**：只有市场分享的冻结导出包 `market_shares.package_json` 是 JSON。
3. **多语言**：列名不带语言后缀。
   - 日语学习内容（词、例句、题干、选项、文章）是原文列。
   - 释义、译文、解析、选项分析、句型说明放在 `*_translations` 表，一种语言一行；新增语言只加 `languages` 的一行。每条译文记录来源（手工 / AI / 导入）和是否核对。
   - 已启用：日本語、简体中文、繁體中文、English、한국어、Tiếng Việt、Bahasa Indonesia、ไทย、မြန်မာ、नेपाली、Español、Français。
   - 缺译时按 `languages.fallback_code` 回退（繁体 → 简体，其余 → 英语），界面标明“缺译，显示英语”。
   - 翻译交给用户自己的 AI：通过 MCP 切换语言 → `list_missing_translations` 取待译清单（含日语原文和其他语言参考）→ `set_translation` 逐条写回，标为 AI 未核对。
   - 已被练习使用的题目修订：已有译文冻结，但可以补新语言。例句原文改了，其译文自动改为待核对。
   - 每日总结、录音反馈、练习说明等个人一次性文本：一列正文 + 一列 `language`。
   - 界面文案（含编号类型名称）不进数据库，由应用 i18n 按 `label_key` 提供。
4. **读音**：只有知识点和活用形存假名读音和罗马音；罗马音由服务端生成，助词等例外可自定义但必须通过校验。
5. **注音**：不预存。用户让 AI 在指定字段、指定语言的文字上加注音（Anki 写法），存在 `ruby_annotations`；去掉标记后与原文不一致即自动失效。
6. **冻结**：题目修订一旦进入练习记录就不可修改（触发器），改题新建修订；练习一旦有人做过，题目清单不可修改。
7. **作答前**不下发答案、解析、听力原文和注音。
8. **删除账号**：删除 `users` 行即可级联清除该用户全部数据；他人从其分享导入的内容保留。

## 编号前缀

| 前缀 | 业务 | 前缀 | 业务 |
|---|---|---|---|
| WB | 单词本 | DP / MX / TP / MP | 每日练习 / 模拟考试 / 专项练习 / 自建练习 |
| W / G / N | 单词 / 语法 / 人名读法 | AT | 练习记录 |
| QV / QG / QR / QL | 词汇题 / 语法题 / 阅读题 / 听力题 | AN | 单题作答 |
| M | 文章、听力脚本 | MR | 记忆自评 |
| AU / IM / RF | 音频 / 图片 / 录音文件 | PL / TK | 学习计划 / 计划任务 |
| CP | 收集箱 | DR / DC | AI 草稿批次 / 草稿批注 |
| RC | 跟读录音 | SH / MI | 市场分享（全局编号）/ 市场导入 |

## 未覆盖

- 认证、会话、OAuth、Firebase 表保持现状，未放进原型。
- 旧数据迁移脚本。
- 离线新建记录：编号只能由服务端分配，离线时客户端用 `client_event_id` 暂存，同步后取得正式编号。
