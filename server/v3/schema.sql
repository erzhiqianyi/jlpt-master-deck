-- JLPT Master Deck 数据库结构 v3（设计稿，对应 docs/schema-v3-design.md）
-- 每张表、每一列都在此列出，不省略。约定：
--   rid        内部主键（整数自增）
--   user_id    所属用户（FK → users.id，删除用户时一并删除）
--   code       业务编号（W12、QV15 …），按用户、按前缀自增，见 id_sequences
--   position   在列表中的顺序，从 0 开始
--   *_at       ISO 8601 时间（UTC，带 Z）；*_date 为 YYYY-MM-DD
--   布尔值      0 / 1
-- 说明性文字不在业务表里，存在 content_translations；哪些字段可翻译登记在 translatable_fields。
-- users、sessions、oauth_*、user_tts_credentials、study_sync_* 等账户与同步表沿用现有结构，不在此列出。

PRAGMA foreign_keys = ON;

-- =====================================================================
-- 1. 多语言
-- =====================================================================

-- 支持的语言
CREATE TABLE languages (
  code          TEXT PRIMARY KEY,                       -- 语言代码（BCP 47）：ja、zh-Hans、en、zh-Hant、ko、vi、id、th、my、ne、es、fr
  native_name   TEXT NOT NULL,                          -- 用该语言自己写的名称：简体中文、English
  fallback_code TEXT REFERENCES languages(code),        -- 缺少该语言文字时先找哪种语言；为空则直接回退到 zh-Hans
  enabled       INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),  -- 是否在设置里提供
  sort_order    INTEGER NOT NULL                        -- 设置页中的排列顺序
);

-- 可翻译字段登记表：哪张表的哪个字段的文字按语言存放在 content_translations
CREATE TABLE translatable_fields (
  owner_table   TEXT NOT NULL,                          -- 文字所属的业务表：knowledge_points
  field         TEXT NOT NULL,                          -- 字段名：meaning
  description   TEXT NOT NULL,                          -- 字段含义：释义
  allows_ja     INTEGER NOT NULL DEFAULT 0 CHECK (allows_ja IN (0, 1)),  -- 是否允许日语行（如日语释义）；说明性文字一般不需要日语
  learner_visible INTEGER NOT NULL DEFAULT 1 CHECK (learner_visible IN (0, 1)),  -- 是否显示给学习者；为 0 的不列入 AI 待翻译清单
  PRIMARY KEY (owner_table, field)
);

-- 所有说明性文字：一个字段的每种语言一行
CREATE TABLE content_translations (
  owner_table   TEXT NOT NULL,                          -- 文字属于哪张表
  owner_rid     INTEGER NOT NULL,                       -- 文字属于该表的哪一行（rid）
  field         TEXT NOT NULL,                          -- 属于该行的哪个字段
  language      TEXT NOT NULL REFERENCES languages(code),  -- 这一行文字的语言
  text          TEXT NOT NULL CHECK (length(text) > 0), -- 文字内容
  origin        TEXT NOT NULL CHECK (origin IN ('migrated', 'manual', 'ai')),  -- 来源：从旧数据迁移 / 用户编辑 / AI 写入
  verified      INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),  -- 是否已核对；AI 写入的默认未核对
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (owner_table, owner_rid, field, language),
  FOREIGN KEY (owner_table, field) REFERENCES translatable_fields(owner_table, field)
);
CREATE INDEX content_translations_language ON content_translations (language, owner_table, field);

-- 按需注音（Anki 写法：漢字[かな]）。定位方式与译文相同；日语原文列用 language = 'ja'
CREATE TABLE ruby_annotations (
  owner_table    TEXT NOT NULL,                         -- 注音加在哪张表
  owner_rid      INTEGER NOT NULL,                      -- 哪一行
  field          TEXT NOT NULL,                         -- 哪个字段（日语原文列，或可翻译字段）
  language       TEXT NOT NULL REFERENCES languages(code),  -- 该段文字的语言
  annotated_text TEXT NOT NULL,                         -- 带注音的文字；去掉 [读音] 后必须与当前原文一致
  created_by     TEXT NOT NULL CHECK (created_by IN ('ai', 'user')),  -- 谁加的注音
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (owner_table, owner_rid, field, language)
);

-- =====================================================================
-- 2. 编号与文件
-- =====================================================================

-- 业务编号计数：每个用户每种前缀各自递增，删除后编号不复用
CREATE TABLE id_sequences (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prefix    TEXT NOT NULL,                              -- W、G、N、WB、QV、QG、QR、QL、MT、DP、TP、MX、AT、DR、DC、TK、RC、IN
  next_no   INTEGER NOT NULL DEFAULT 1,                 -- 下一个可用序号
  PRIMARY KEY (user_id, prefix)
);

-- 图片与音频文件
CREATE TABLE media_files (
  rid           INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('image', 'audio')),  -- 文件类别
  file_name     TEXT,                                   -- 上传时的原始文件名
  mime          TEXT NOT NULL,                          -- 文件类型：audio/mpeg、image/png
  size          INTEGER NOT NULL,                       -- 字节数
  sha256        TEXT NOT NULL,                          -- 内容哈希，用于去重和校验
  storage_path  TEXT NOT NULL,                          -- 存储路径（本地目录或 R2 键）
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
-- 译文字段：transcript_translation

-- =====================================================================
-- 3. 设置
-- =====================================================================

-- 显示与练习设置（一用户一行）
CREATE TABLE user_preferences (
  user_id                    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ui_language                TEXT NOT NULL DEFAULT 'zh-CN' CHECK (ui_language IN ('zh-CN', 'ja', 'en')),  -- 界面语言
  explanation_language       TEXT NOT NULL DEFAULT 'zh-Hans' REFERENCES languages(code),  -- 释义与解析的语言
  font_scale                 REAL NOT NULL DEFAULT 1 CHECK (font_scale BETWEEN 0.8 AND 2.0),  -- 字体缩放倍数
  feedback_mode              TEXT NOT NULL DEFAULT 'immediate' CHECK (feedback_mode IN ('immediate', 'batch')),  -- 每题显示对错 / 整组做完再显示
  practice_navigation        TEXT NOT NULL DEFAULT 'auto' CHECK (practice_navigation IN ('auto', 'manual')),  -- 答完自动 / 手动进入下一题
  auto_advance_seconds       REAL NOT NULL DEFAULT 0.5 CHECK (auto_advance_seconds BETWEEN 0 AND 10),  -- 自动跳转前等待秒数
  show_review_ruby           INTEGER NOT NULL DEFAULT 1 CHECK (show_review_ruby IN (0, 1)),       -- 复习卡片显示假名注音
  show_explanation_ruby      INTEGER NOT NULL DEFAULT 1 CHECK (show_explanation_ruby IN (0, 1)),  -- 解析文字显示假名注音
  show_romaji                INTEGER NOT NULL DEFAULT 1 CHECK (show_romaji IN (0, 1)),            -- 读音旁显示罗马音
  card_word_spacing          INTEGER NOT NULL DEFAULT 1 CHECK (card_word_spacing IN (0, 1)),      -- 记忆卡日语按词加间隔
  segmented_display          INTEGER NOT NULL DEFAULT 0 CHECK (segmented_display IN (0, 1)),      -- 日语分词与词性着色
  daily_source_answers       INTEGER NOT NULL DEFAULT 1 CHECK (daily_source_answers IN (0, 1)),   -- 每日练习取材于最近的作答错题
  daily_source_card_reviews  INTEGER NOT NULL DEFAULT 1 CHECK (daily_source_card_reviews IN (0, 1)),  -- 每日练习取材于最近的卡片自评
  daily_source_window        TEXT,                      -- 取材的时间范围方式（实现阶段核对取值）
  daily_source_hours         INTEGER,                   -- 按小时取材时的小时数
  daily_source_time_zone     TEXT,                      -- 判断“今天”用的时区：Asia/Tokyo
  daily_source_run_at        TEXT,                      -- 每天自动生成练习的时间：07:00
  created_at                 TEXT NOT NULL,
  updated_at                 TEXT NOT NULL
);

-- 用户为每个类别选用的记忆卡模板（没有选时用该类别的默认模板）
CREATE TABLE user_card_templates (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('word', 'grammar', 'name')),  -- 知识点大类
  template_rid  INTEGER NOT NULL REFERENCES card_templates(rid),             -- 选用的模板
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, kind)
);

-- 录入单词时必须附带的题型；为空表示不要求
CREATE TABLE user_question_kinds (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type_id  TEXT NOT NULL REFERENCES question_types(type_id),                               -- 官方题型 ID：vocabulary-kanji-reading …
  PRIMARY KEY (user_id, type_id)
);

-- 卡片自评中哪些评分会被选进每日练习
CREATE TABLE user_daily_source_ratings (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating   TEXT NOT NULL CHECK (rating IN ('forgot', 'hard', 'remembered', 'easy')),
  PRIMARY KEY (user_id, rating)
);

-- 分词显示时各词性的标记方式
CREATE TABLE user_pos_styles (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pos      TEXT NOT NULL CHECK (pos IN ('noun', 'verb', 'particle', 'adjective')),  -- 着色的词性大类
  mode     TEXT NOT NULL CHECK (mode IN ('none', 'underline', 'text')),            -- 不标记 / 彩色下划线 / 文字颜色
  color    TEXT NOT NULL,                               -- 颜色：#326B9C
  PRIMARY KEY (user_id, pos)
);

-- 用户对官方题型写的答题提示
CREATE TABLE user_question_type_tips (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type_id     TEXT NOT NULL REFERENCES question_types(type_id),                            -- 官方题型 ID
  tip         TEXT NOT NULL,                            -- 提示内容
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, type_id)
);

-- 用户自建的题型提示
CREATE TABLE user_custom_tips (
  rid          INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section      TEXT NOT NULL,                           -- 所属模块：vocabulary / grammar / reading / listening
  title        TEXT NOT NULL,                           -- 提示标题
  description  TEXT,                                    -- 适用场景说明
  tip          TEXT NOT NULL,                           -- 提示内容
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- 朗读设置（一用户一行）
CREATE TABLE user_speech_settings (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL DEFAULT 'browser',     -- 语音服务：browser（浏览器 / 系统语音）或已注册的服务 ID
  rate             REAL NOT NULL DEFAULT 1 CHECK (rate BETWEEN 0.5 AND 1.5),  -- 语速
  card_auto        TEXT NOT NULL DEFAULT 'off' CHECK (card_auto IN ('off', 'front', 'back')),  -- 记忆卡自动朗读：不读 / 显示正面时 / 翻到背面时
  grammar_auto     INTEGER NOT NULL DEFAULT 0 CHECK (grammar_auto IN (0, 1)),     -- 打开语法详情时自动朗读
  include_example  INTEGER NOT NULL DEFAULT 0 CHECK (include_example IN (0, 1)),  -- 自动朗读时连同例句
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

-- 每个语音服务选用的声音
CREATE TABLE user_speech_voices (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL,                            -- 语音服务 ID
  voice       TEXT NOT NULL,                            -- 选用的声音
  style       TEXT,                                     -- 说话风格（服务支持时）
  role        TEXT,                                     -- 角色（服务支持时）
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, provider)
);

-- =====================================================================
-- 4. 单词本与知识点
-- =====================================================================

-- 单词本：只属于一个用户；一本里可以同时放单词、语法、名字
CREATE TABLE wordbooks (
  rid         INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,                            -- 单词本编号：WB1
  title       TEXT NOT NULL,                            -- 单词本名称：N1 文法、IT词汇
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (user_id, code),
  UNIQUE (user_id, title)
);

-- 知识点：单词、词组、表达、语法、口语音变规则、专有名词
CREATE TABLE knowledge_points (
  rid                 INTEGER PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code                TEXT NOT NULL,                    -- 编号：word → W、grammar → G、name → N
  wordbook_rid        INTEGER NOT NULL REFERENCES wordbooks(rid),  -- 所属单词本（必填；单词本有知识点时不能删除）
  kind                TEXT NOT NULL CHECK (kind IN ('word', 'grammar', 'name')),  -- 大类：单词类（含词组、惯用表达）/ 语法类（含口语音变规则）/ 名字（地名、人名等专有名词）
  expression          TEXT NOT NULL,                    -- 知识点本身的日语写法：概観、～を皮切りに
  reading             TEXT,                             -- 假名读音：がいかん
  romaji              TEXT,                             -- 由读音生成的罗马音：gaikan；读音含汉字时为空
  romaji_key          TEXT,                             -- 罗马音搜索键：tokyo / toukyou / tōkyō 都能匹配
  pos                 TEXT CHECK (pos IN ('verb_1', 'verb_2', 'verb_3_suru', 'verb_3_kuru', 'i_adjective', 'na_adjective',
                                          'noun', 'adverb', 'conjunction', 'adnominal', 'interjection', 'prefix', 'suffix',
                                          'phrase', 'idiom')),
                                                        -- 词性（日本語教育分法，动词含活用分组）；语法类为空；名字的类别（地名、駅名…）用标签
  transitivity        TEXT CHECK (transitivity IN ('transitive', 'intransitive', 'both')),  -- 动词自他；非动词为空
  is_suru_noun        INTEGER NOT NULL DEFAULT 0 CHECK (is_suru_noun IN (0, 1)),  -- 名词能否加する作动词：規制 → 規制する
  base_form           TEXT,                             -- 辞书形：規制する
  jlpt_level_min      TEXT CHECK (jlpt_level_min IN ('N5', 'N4', 'N3', 'N2', 'N1')),  -- 等级范围的起点（较低的等级）
  jlpt_level_max      TEXT CHECK (jlpt_level_max IN ('N5', 'N4', 'N3', 'N2', 'N1')),  -- 等级范围的终点（较高的等级）；单一等级时与起点相同
  register_level      TEXT CHECK (register_level IN ('written', 'spoken', 'formal', 'both')),  -- 语体：书面 / 口语 / 正式 / 通用
  paraphrase          TEXT,                             -- 简短的日语换说，「言い換え類義」题的正确选项：～するとすぐに
  source_sentence     TEXT,                             -- 学习者遇到这个词的日语原句
  compile_note        TEXT,                             -- 内部记录：由什么资料、哪次对话整理而来（不翻译、不显示给学习者）
  source_capture_rid  INTEGER REFERENCES inbox_captures(rid) ON DELETE SET NULL,  -- 由收集箱的哪条记录整理而来
  market_share_id     TEXT,                             -- 从市场导入时对应的分享；自己录入的为空
  captured_at         TEXT NOT NULL,                    -- 录入时间
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  UNIQUE (user_id, code),
  CHECK ((jlpt_level_min IS NULL) = (jlpt_level_max IS NULL))
);
CREATE INDEX knowledge_points_wordbook ON knowledge_points (wordbook_rid, kind);
CREATE INDEX knowledge_points_romaji ON knowledge_points (user_id, romaji_key);
CREATE INDEX knowledge_points_expression ON knowledge_points (user_id, expression);
-- 译文字段：meaning（释义，含 ja 日语释义）、explanation（详细讲解）

-- 例句
CREATE TABLE knowledge_examples (
  rid               INTEGER PRIMARY KEY,
  point_rid         INTEGER NOT NULL REFERENCES knowledge_points(rid) ON DELETE CASCADE,
  position          INTEGER NOT NULL,
  sentence          TEXT NOT NULL,                      -- 日语例句
  sentence_reading  TEXT,                               -- 整句读音
  spoken_sentence   TEXT,                               -- 口语说法
  target_reading    TEXT,                               -- 句中目标词的读音（活用后读音可能不同）
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  UNIQUE (point_rid, position)
);
-- 译文字段：translation（译文）、spoken_translation（口语说法译文）、analysis（例句分析）、form_analysis（形态分析）

-- 记忆要点
CREATE TABLE knowledge_memory_points (
  rid         INTEGER PRIMARY KEY,
  point_rid   INTEGER NOT NULL REFERENCES knowledge_points(rid) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (point_rid, position)
);
-- 译文字段：content（要点内容）

-- 句型与搭配
CREATE TABLE knowledge_patterns (
  rid         INTEGER PRIMARY KEY,
  point_rid   INTEGER NOT NULL REFERENCES knowledge_points(rid) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  pattern     TEXT NOT NULL,                            -- 句型或搭配（日语）：Vた＋とたん
  example     TEXT,                                     -- 例句（日语）
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (point_rid, position)
);
-- 译文字段：connection（接续说明）、meaning（含义）、example_translation（例句译文）

-- 补充说明：标题 + 内容的列表（语体、考试提示、要点等），前端按数组逐条渲染
CREATE TABLE knowledge_notes (
  rid         INTEGER PRIMARY KEY,
  point_rid   INTEGER NOT NULL REFERENCES knowledge_points(rid) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('register', 'exam_tip', 'key_point', 'other')),  -- 语体 / 考试提示 / 要点 / 其他
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (point_rid, position)
);
-- 译文字段：title（标题）、body（内容）

-- 近义辨析
CREATE TABLE knowledge_comparisons (
  rid         INTEGER PRIMARY KEY,
  point_rid   INTEGER NOT NULL REFERENCES knowledge_points(rid) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  target      TEXT NOT NULL,                            -- 比较对象（日语）：開講
  kind        TEXT NOT NULL DEFAULT 'synonym' CHECK (kind IN ('synonym', 'everyday')),  -- 一般近义词 / 日常说法替换
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (point_rid, position)
);
-- 译文字段：difference（区别说明）

-- 其他写法
CREATE TABLE knowledge_alternate_forms (
  rid         INTEGER PRIMARY KEY,
  point_rid   INTEGER NOT NULL REFERENCES knowledge_points(rid) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  form        TEXT NOT NULL,                            -- 其他写法：捕える
  created_at  TEXT NOT NULL,
  UNIQUE (point_rid, position)
);

-- 相关词
CREATE TABLE knowledge_related_words (
  rid         INTEGER PRIMARY KEY,
  point_rid   INTEGER NOT NULL REFERENCES knowledge_points(rid) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  word        TEXT NOT NULL,                            -- 相关词
  created_at  TEXT NOT NULL,
  UNIQUE (point_rid, position)
);

-- 出处：辞典词条、官方网页、教材章节
CREATE TABLE knowledge_sources (
  rid         INTEGER PRIMARY KEY,
  point_rid   INTEGER NOT NULL REFERENCES knowledge_points(rid) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  title       TEXT NOT NULL,                            -- 出处名称：小学館 デジタル大辞泉、実力養成編 第1部 第2課
  url         TEXT,                                     -- 链接；教材没有链接时为空
  created_at  TEXT NOT NULL,
  UNIQUE (point_rid, position)
);

-- 记忆图片：每个知识点每种语言一行（图片里画有该语言的释义与例句译文）
CREATE TABLE knowledge_memory_images (
  point_rid   INTEGER NOT NULL REFERENCES knowledge_points(rid) ON DELETE CASCADE,
  language    TEXT NOT NULL REFERENCES languages(code), -- 图片里文字的语言
  concept     TEXT,                                     -- 画面构思
  prompt      TEXT,                                     -- 生成图片用的提示词（按该语言写）
  status      TEXT NOT NULL CHECK (status IN ('pending', 'prompt_ready', 'generated', 'approved')),  -- 待生成 / 提示词就绪 / 已生成 / 已核对可用
  media_rid   INTEGER REFERENCES media_files(rid) ON DELETE SET NULL,  -- 上传的图片文件
  url         TEXT,                                     -- 外部图片地址（没有上传文件时）
  caption     TEXT,                                     -- 图片说明（与图片同语言）
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (point_rid, language)
);

-- 标签
CREATE TABLE knowledge_tags (
  point_rid   INTEGER NOT NULL REFERENCES knowledge_points(rid) ON DELETE CASCADE,
  tag         TEXT NOT NULL,                            -- 标签：外来語、地名、生活词汇
  created_at  TEXT NOT NULL,
  PRIMARY KEY (point_rid, tag)
);

-- 适合出的题型
CREATE TABLE knowledge_question_kinds (
  point_rid   INTEGER NOT NULL REFERENCES knowledge_points(rid) ON DELETE CASCADE,
  type_id     TEXT NOT NULL REFERENCES question_types(type_id),                            -- 官方题型 ID
  PRIMARY KEY (point_rid, type_id)
);

-- 各题型的干扰选项
CREATE TABLE knowledge_distractors (
  point_rid   INTEGER NOT NULL REFERENCES knowledge_points(rid) ON DELETE CASCADE,
  type_id     TEXT NOT NULL REFERENCES question_types(type_id),                            -- 官方题型 ID
  position    INTEGER NOT NULL,
  choice      TEXT NOT NULL,                            -- 干扰选项文字
  PRIMARY KEY (point_rid, type_id, position)
);

-- 来源草稿
CREATE TABLE knowledge_source_drafts (
  point_rid   INTEGER NOT NULL REFERENCES knowledge_points(rid) ON DELETE CASCADE,
  draft_rid   INTEGER NOT NULL REFERENCES ai_drafts(rid) ON DELETE CASCADE,
  PRIMARY KEY (point_rid, draft_rid)
);

-- 知识点与题目的关联（多对多；删除知识点不删除题目）
CREATE TABLE knowledge_point_questions (
  point_rid     INTEGER NOT NULL REFERENCES knowledge_points(rid) ON DELETE CASCADE,
  question_rid  INTEGER NOT NULL REFERENCES questions(rid) ON DELETE CASCADE,
  relation      TEXT NOT NULL DEFAULT 'target' CHECK (relation IN ('target', 'prerequisite', 'contrast')),  -- 考查对象 / 前置知识 / 对比项
  position      INTEGER NOT NULL,                       -- 在知识点题目列表中的顺序
  PRIMARY KEY (point_rid, question_rid)
);

-- 单词本统计（实时计算，不存计数）
CREATE VIEW wordbook_stats AS
SELECT w.rid AS wordbook_rid,
       w.user_id,
       COUNT(k.rid) AS total,                                                                   -- 知识点总数
       COALESCE(SUM(k.kind = 'word'), 0) AS word_count,                                         -- 单词类
       COALESCE(SUM(k.kind = 'grammar'), 0) AS grammar_count,                                   -- 语法类
       COALESCE(SUM(k.kind = 'name'), 0) AS name_count,                                         -- 名字
       COALESCE(SUM(r.due_at IS NOT NULL AND r.due_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), 0) AS due_count,  -- 到期待复习
       COALESCE(SUM(k.rid IS NOT NULL AND r.point_rid IS NULL), 0) AS new_count,                            -- 还没开始学
       COALESCE(SUM(r.status = 'mastered'), 0) AS mastered_count                                            -- 已掌握
FROM wordbooks w
LEFT JOIN knowledge_points k ON k.wordbook_rid = w.rid
LEFT JOIN review_schedules r ON r.point_rid = k.rid
GROUP BY w.rid;

-- =====================================================================
-- 4a. 记忆卡模板（全局共用；用户只选模板，不逐个配置字段）
-- =====================================================================

-- 记忆卡模板
CREATE TABLE card_templates (
  rid         INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,                     -- 模板编号：word_standard、grammar_example …
  kind        TEXT NOT NULL CHECK (kind IN ('word', 'grammar', 'name')),  -- 适用的知识点大类
  is_default  INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),    -- 是否该类别的默认模板
  sort_order  INTEGER NOT NULL                          -- 显示顺序
);
CREATE UNIQUE INDEX card_templates_one_default ON card_templates (kind) WHERE is_default = 1;
-- 译文字段：name（模板名称）、description（模板说明：适合什么时候用）

-- 模板在正面、背面显示的内容
CREATE TABLE card_template_fields (
  template_rid      INTEGER NOT NULL REFERENCES card_templates(rid) ON DELETE CASCADE,
  side              TEXT NOT NULL CHECK (side IN ('front', 'back')),  -- 正面 / 背面
  position          INTEGER NOT NULL,                   -- 显示顺序
  field             TEXT NOT NULL CHECK (field IN ('expression', 'reading', 'romaji', 'meaning', 'meaning_ja', 'paraphrase',
                                                   'example', 'pattern', 'memory_point', 'note', 'comparison', 'conjugation',
                                                   'image', 'level', 'pos', 'tags')),
                                                        -- 显示的内容：写法 / 读音 / 罗马音 / 释义（说明语言）/ 日语释义 / 换说 /
                                                        -- 例句 / 句型 / 记忆要点 / 补充说明 / 近义辨析 / 变形 / 记忆图片 / 等级 / 词性 / 标签
  max_items         INTEGER,                            -- 列表类内容最多显示几条（例句、记忆要点等）；为空表示全部
  with_translation  INTEGER NOT NULL DEFAULT 1 CHECK (with_translation IN (0, 1)),  -- 例句、句型是否同时显示译文
  PRIMARY KEY (template_rid, side, position)
);

-- =====================================================================
-- 4b. 日语活用规则库（全局共用，不属于任何用户）
-- =====================================================================

-- 变形种类
CREATE TABLE conjugation_forms (
  rid         INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,                     -- dictionary、polite、negative、past、te、potential、passive、causative、
                                                        -- causative_passive、volitional、conditional_ba、conditional_tara、imperative、prohibitive、
                                                        -- adverbial、attributive
  label_ja    TEXT NOT NULL,                            -- 日本語教育里的名称：ます形、ない形、て形、た形、可能形 …
  applies_to  TEXT NOT NULL CHECK (applies_to IN ('verb', 'adjective', 'both')),  -- 适用于动词 / 形容词 / 两者
  sort_order  INTEGER NOT NULL                          -- 显示顺序
);
-- 译文字段：description（这种变形的用法说明）

-- 变形规则：按“词性 + 辞书形词尾 + 变形种类”查出替换方式。
-- 生成时取匹配到的最长词尾，例外动词因此只是词尾更长的规则：
--   verb_1 + く + te → いて（書く → 書いて）；verb_1 + 行く + te → 行って；verb_1 + いく + te → いって
--   verb_1 + ある + negative → ない；verb_1 + いらっしゃる + polite → いらっしゃいます；i_adjective + いい + past → よかった
CREATE TABLE conjugation_rules (
  rid          INTEGER PRIMARY KEY,
  pos          TEXT NOT NULL CHECK (pos IN ('verb_1', 'verb_2', 'verb_3_suru', 'verb_3_kuru', 'i_adjective', 'na_adjective')),  -- 适用的词性
  ending       TEXT NOT NULL,                           -- 辞书形词尾（与写法和读音的结尾比对）：く、ぐ、る、する、くる、い、行く、ある …
  form_code    TEXT NOT NULL REFERENCES conjugation_forms(code),  -- 变形种类
  replacement  TEXT NOT NULL,                           -- 去掉词尾后接上的部分：いて、って、ない、よかった
  is_exception INTEGER NOT NULL DEFAULT 0 CHECK (is_exception IN (0, 1)),  -- 是否例外（行く、ある、敬语动词、問う、いい …）
  UNIQUE (pos, ending, form_code)
);
-- 译文字段：step（变形步骤说明，如“词尾く变为い，再接て”）

-- =====================================================================
-- 5. 题库
-- =====================================================================
--
-- 所有题型统一为三层：题组（大問）→ 小题 → 选项。素材挂在题组上。
--   词汇、语法单题：一个题组只有一道小题，没有素材
--   阅读：一个题组 = 一篇（或 A/B 两篇）文章 + 若干小题
--   听力：一个题组 = 一段音频（可带场景图）+ 若干小题
-- 各题型的规则（考点怎么标、选项形式、能否拆开抽题、适用等级）在全局表 question_types。

-- 题型（全局，与 src/domain/questionContract.mjs 一致）
CREATE TABLE question_types (
  rid             INTEGER PRIMARY KEY,
  type_id         TEXT NOT NULL UNIQUE,                     -- 题型 ID：vocabulary-kanji-reading、grammar-composition、reading-integrated …
  module          TEXT NOT NULL CHECK (module IN ('vocabulary', 'grammar', 'reading', 'listening')),  -- 所属模块
  label_ja        TEXT NOT NULL,                        -- 日语名称：漢字読み、文の組み立て、統合理解
  official        INTEGER NOT NULL CHECK (official IN (0, 1)),  -- 1 = JLPT 正式题型；0 = 基础训练（不计入正式卷覆盖）
  target_marking  TEXT NOT NULL CHECK (target_marking IN ('underline', 'blank', 'star', 'passage_blank', 'none')),
                                                        -- 这类题用哪种标记（question_marks）：下划线 / 括号空位 / ★空位排列 / 文章中的编号空位 / 不标；用于录入校验
  option_media    TEXT NOT NULL CHECK (option_media IN ('text', 'text_or_image', 'audio', 'mixed', 'none')),
                                                        -- 选项形式：文字 / 文字或图片 / 只有音频 / 同组内混合（統合理解：前两问音频、第三问文字）/ 没有选项
  material_kinds  TEXT NOT NULL CHECK (material_kinds IN ('none', 'passage', 'passage_pair', 'notice', 'audio', 'audio_image')),
                                                        -- 题组需要的素材：无 / 一篇文章 / A、B 两篇 / 公告或表格 / 音频 / 音频加场景图
  draw_whole_group INTEGER NOT NULL CHECK (draw_whole_group IN (0, 1)),  -- 抽题时是否必须整组抽取（一篇多问、统合理解等为 1）
  answer_mode     TEXT NOT NULL CHECK (answer_mode IN ('choice', 'text_input', 'recording', 'none')),
                                                        -- 作答方式：选择（有正确选项）/ 输入文字（听写，与参考答案比对）/ 录音（跟读，不判对错）/ 不作答或自由回答（不计分）
  sort_order      INTEGER NOT NULL                      -- 显示顺序（按 JLPT 试卷顺序）
);
-- 译文字段：task（任务说明：这类题问什么）、tip（答题技巧）

-- 题型适用的等级
CREATE TABLE question_type_levels (
  type_id  TEXT NOT NULL REFERENCES question_types(type_id) ON DELETE CASCADE,
  level    TEXT NOT NULL CHECK (level IN ('N5', 'N4', 'N3', 'N2', 'N1')),
  PRIMARY KEY (type_id, level)
);

-- 题型的校验规则（每个题型每条规则一行）。服务器写入、MCP、Web 表单、iOS（经服务器校验接口）都用这一份规则，
-- 由 src/domain 中同一个校验程序执行。
CREATE TABLE question_type_rules (
  type_id      TEXT NOT NULL REFERENCES question_types(type_id) ON DELETE CASCADE,
  rule         TEXT NOT NULL CHECK (rule IN (
                 'prompt', 'options', 'correct_option', 'expected_text', 'marks', 'materials',
                 'basis', 'option_analysis', 'evidence',
                 'distractor_also_reading', 'reading_options_form', 'distractor_in_knowledge',
                 'option_length_skew', 'duplicate_options', 'target_not_unique')),
                                                        -- 规则：题干 / 选项 / 正确选项 / 参考答案 / 标记 / 素材 / 正确依据 / 选项理由 / 证据 /
                                                        -- 以及自动检查项（干扰项是另一读音、读音题选项形式、干扰项在知识点里、选项长短不均、选项重复、考查对象不唯一）
  requirement  TEXT NOT NULL CHECK (requirement IN ('required', 'optional', 'forbidden', 'warn')),
                                                        -- 必填（不满足则拒绝写入）/ 可选 / 禁止 / 只警告（写入审查发现）
  value        INTEGER,                                 -- 数量类规则的数值：选项必须正好这么多个；为空表示至少 2 个
  PRIMARY KEY (type_id, rule)
);

-- 素材：文章、公告或表格、图片、音频；可被多个题组共用（直接修改，不分版本）
CREATE TABLE materials (
  rid            INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code           TEXT NOT NULL,                         -- 素材编号：MT3
  kind           TEXT NOT NULL CHECK (kind IN ('passage', 'notice', 'image', 'audio')),  -- 文章 / 公告或表格 / 图片 / 音频
  body           TEXT,                                  -- 文章、公告的日语原文（公告里的表格用 Markdown 表格书写）；文章の文法 的空位写作（１）（２）…
  media_rid      INTEGER REFERENCES media_files(rid),   -- 图片或音频文件
  clip_start_ms  INTEGER,                               -- 音频片段起点（毫秒）；整段为空
  clip_end_ms    INTEGER,                               -- 音频片段终点（毫秒）；整段为空
  transcript     TEXT,                                  -- 听力原文（日语）
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE (user_id, code),
  CHECK ((kind IN ('passage', 'notice') AND body IS NOT NULL) OR (kind IN ('image', 'audio') AND media_rid IS NOT NULL))
);
-- 译文字段：title（标题）、body_translation（全文译文）、summary（概要）、structure（结构分析）、transcript_translation（听力原文译文）

-- 素材逐句（逐句对照译文）
CREATE TABLE material_sentences (
  rid           INTEGER PRIMARY KEY,
  material_rid  INTEGER NOT NULL REFERENCES materials(rid) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  sentence      TEXT NOT NULL,                          -- 原文一句
  is_key        INTEGER NOT NULL DEFAULT 0 CHECK (is_key IN (0, 1)),  -- 是否解题关键句
  UNIQUE (material_rid, position)
);
-- 译文字段：translation（该句译文）

-- 题组（大問）：同一题型、共用作答说明与素材的一组小题
CREATE TABLE question_groups (
  rid               INTEGER PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code              TEXT NOT NULL,                      -- 题组编号：QS12
  type_id           TEXT NOT NULL REFERENCES question_types(type_id),  -- 题型（决定模块、考点标法、选项形式）
  status            TEXT NOT NULL CHECK (status IN ('draft', 'needs_review', 'needs_revision', 'ready', 'retired')),
                                                        -- 草稿 / 待审查 / 需修改 / 可用 / 停用；AI 审查通过即为可用
  official          INTEGER NOT NULL DEFAULT 0 CHECK (official IN (0, 1)),  -- 是否官方原题
  level             TEXT CHECK (level IN ('N5', 'N4', 'N3', 'N2', 'N1')),   -- JLPT 等级（只填核对过的）
  instruction       TEXT,                               -- 作答说明（日语）：＿＿＿の言葉の読み方として最もよいものを…
  context           TEXT,                               -- 场景、角色、任务条件（日语）：男の人と女の人が話しています。…
  shuffle_options   INTEGER NOT NULL DEFAULT 1 CHECK (shuffle_options IN (0, 1)),  -- 出题时是否打乱选项；选项互相引用、官方原题为 0
  source_reference  TEXT,                               -- 出处：书名、章节、网址
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  UNIQUE (user_id, code)
);
-- 译文字段：instruction_translation（作答说明译文）、context_translation（场景说明译文）

-- 题组使用的素材
CREATE TABLE question_group_materials (
  group_rid     INTEGER NOT NULL REFERENCES question_groups(rid) ON DELETE CASCADE,
  position      INTEGER NOT NULL,                       -- 显示顺序
  material_rid  INTEGER NOT NULL REFERENCES materials(rid),  -- 素材（被题组使用时不能删除）
  role          TEXT NOT NULL CHECK (role IN ('main', 'passage_a', 'passage_b', 'notice', 'scene_image', 'audio')),
                                                        -- 在题组中的角色：主文 / 文章 A / 文章 B / 公告或表格 / 场景图 / 音频
  PRIMARY KEY (group_rid, position)
);

-- 小题
CREATE TABLE questions (
  rid                INTEGER PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code               TEXT NOT NULL,                     -- 题目编号：QV / QG / QR / QL + 序号（按题型所属模块）
  group_rid          INTEGER NOT NULL REFERENCES question_groups(rid) ON DELETE CASCADE,  -- 所属题组
  position           INTEGER NOT NULL,                  -- 在题组中的顺序（問1、問2 …）
  prompt             TEXT,                              -- 题干（日语）；即時応答等只有音频的题为空
  prompt_media_rid   INTEGER REFERENCES media_files(rid),  -- 小题自己的音频或图片（如听力每题的提问音频）
  expected_text      TEXT,                              -- 输入文字类题目（听写）的参考答案（日语）；其他作答方式为空
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  UNIQUE (user_id, code),
  UNIQUE (group_rid, position),
  CHECK (prompt IS NOT NULL OR prompt_media_rid IS NOT NULL)
);
-- 译文字段：translation（题干译文）

-- 标记：题干或素材正文中需要标出的位置（所有题型统一）
--   漢字読み、表記、言い換え：target（下划线）；語形成、文脈規定、文法形式：blank（括号空位）；
--   文の組み立て：每个空位一条 slot，★空位为 star_slot；文章の文法：blank，标在素材正文里（material_rid 不为空）
CREATE TABLE question_marks (
  rid           INTEGER PRIMARY KEY,
  question_rid  INTEGER NOT NULL REFERENCES questions(rid) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('target', 'blank', 'slot', 'star_slot')),  -- 考查对象 / 括号空位 / 排列空位 / ★空位
  material_rid  INTEGER REFERENCES materials(rid) ON DELETE CASCADE,  -- 标记在哪份素材的正文里；为空表示在题干中
  start_offset  INTEGER NOT NULL,                       -- 起点（UTF-16 位置，与 JavaScript 字符串下标相同，从 0 开始）
  end_offset    INTEGER NOT NULL,                       -- 终点（不含）
  label         TEXT,                                   -- 显示的编号：（１）、★
  UNIQUE (question_rid, position),
  CHECK (end_offset >= start_offset)
);

-- 选项：rid 是固定编号，正确答案标在选项上；前端可随机排列，作答只记选中的选项编号
CREATE TABLE question_options (
  rid              INTEGER PRIMARY KEY,                 -- 选项的固定编号
  question_rid     INTEGER NOT NULL REFERENCES questions(rid) ON DELETE CASCADE,
  position         INTEGER NOT NULL,                    -- 标准顺序（官方题目里的 1–4）；不打乱时按此显示
  text             TEXT,                                -- 选项文字（日语）；图片、音频选项可为空；即時応答等选项在题组音频里读出的，文字和文件都可为空
  media_rid        INTEGER REFERENCES media_files(rid), -- 图片或音频选项的文件
  is_correct       INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),  -- 是否正确答案
  distractor_type  TEXT,                                -- 干扰类型（错误选项为什么容易被选）：与原文不符、语义相近、形式相近 …
  UNIQUE (question_rid, position)
);
CREATE UNIQUE INDEX question_options_one_correct ON question_options (question_rid) WHERE is_correct = 1;
-- 译文字段：analysis（选项分析：这个选项为什么对或错）、translation（选项译文）

-- 解析段落：每道题一个有序列表（所有题型统一），前端按数组逐条渲染
CREATE TABLE question_explanation_sections (
  rid           INTEGER PRIMARY KEY,
  question_rid  INTEGER NOT NULL REFERENCES questions(rid) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('basis', 'step', 'full_answer', 'tip', 'objective')),
                                                        -- 正确依据 / 解题步骤 / 完整答案（如排列题的完整句子）/ 技巧 / 学习目标
  UNIQUE (question_rid, position)
);
-- 译文字段：title（段落标题）、body（段落内容）

-- 证据：答案依据在原文的哪里（所有题型统一）；可属于整道题，也可属于某个选项
CREATE TABLE question_evidence (
  rid           INTEGER PRIMARY KEY,
  question_rid  INTEGER NOT NULL REFERENCES questions(rid) ON DELETE CASCADE,
  option_rid    INTEGER REFERENCES question_options(rid) ON DELETE CASCADE,  -- 针对哪个选项；为空表示针对整道题
  position      INTEGER NOT NULL,
  material_rid  INTEGER REFERENCES materials(rid) ON DELETE CASCADE,  -- 依据在哪份素材；为空表示在题干中
  source        TEXT NOT NULL CHECK (source IN ('prompt', 'body', 'transcript')),  -- 题干 / 素材正文 / 听力原文
  start_offset  INTEGER,                                -- 起点（UTF-16 位置，与 JavaScript 字符串下标相同）；只有摘录、未定位时为空
  end_offset    INTEGER,                                -- 终点（不含）
  quote         TEXT NOT NULL,                          -- 原文摘录（日语）
  UNIQUE (question_rid, position)
);

-- 题目标签
CREATE TABLE question_tags (
  question_rid  INTEGER NOT NULL REFERENCES questions(rid) ON DELETE CASCADE,
  tag           TEXT NOT NULL,
  PRIMARY KEY (question_rid, tag)
);

-- 题目审查记录：一次审查一行（自动检查、AI 审查、学习者报告问题都记在这里）
CREATE TABLE question_reviews (
  rid          INTEGER PRIMARY KEY,
  group_rid    INTEGER NOT NULL REFERENCES question_groups(rid) ON DELETE CASCADE,  -- 审查的题组（一篇文章的几道题一起审）
  reviewer     TEXT NOT NULL CHECK (reviewer IN ('system', 'ai', 'user')),  -- 自动检查 / AI agent / 学习者
  verdict      TEXT NOT NULL CHECK (verdict IN ('pass', 'revise', 'reject')),  -- 通过（题组变为可用）/ 需修改 / 不可用（停用）
  agent_label  TEXT,                                    -- 审查的 AI 是谁（MCP 客户端名称等），用于区分出题和审题的 agent
  created_at   TEXT NOT NULL
);
CREATE INDEX question_reviews_group ON question_reviews (group_rid, created_at);
-- 译文字段：summary（审查结论说明）

-- 审查发现的问题：可针对整个题组、某道小题或某个选项
CREATE TABLE question_review_findings (
  rid           INTEGER PRIMARY KEY,
  review_rid    INTEGER NOT NULL REFERENCES question_reviews(rid) ON DELETE CASCADE,
  question_rid  INTEGER REFERENCES questions(rid) ON DELETE CASCADE,         -- 针对哪道小题；为空表示整个题组
  option_rid    INTEGER REFERENCES question_options(rid) ON DELETE CASCADE,  -- 针对哪个选项
  check_code    TEXT NOT NULL,                          -- 检查项：distractor_also_correct、distractor_too_weak、option_length_skew …（见设计文档）
  severity      TEXT NOT NULL CHECK (severity IN ('error', 'warning', 'info')),  -- 必须修改 / 建议修改 / 提示
  resolved      INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),  -- 修改后是否已解决
  position      INTEGER NOT NULL,
  UNIQUE (review_rid, position)
);
-- 译文字段：message（问题说明与修改建议）

-- =====================================================================
-- 6. 练习、作答、复习
-- =====================================================================

-- 练习：每日练习、专项、综合、模拟考试
CREATE TABLE practice_sets (
  rid               INTEGER PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code              TEXT NOT NULL,                      -- 练习编号：DP3、TP2、MX1
  kind              TEXT NOT NULL CHECK (kind IN ('daily', 'topic', 'mixed', 'mock')),  -- 每日 / 专项 / 综合 / 模拟考试
  practice_date     TEXT,                               -- 练习日期
  version           INTEGER NOT NULL DEFAULT 1,         -- 同一天的第几版
  minutes           INTEGER,                            -- 建议用时（分钟）
  strategy          TEXT CHECK (strategy IN ('approved_draft_full_set', 'agent_topic', 'targeted_by_history')),
                                                        -- 出题方式：由确认的草稿整份发布 / AI 按主题出题 / 按作答历史针对性出题
  level             TEXT CHECK (level IN ('N5', 'N4', 'N3', 'N2', 'N1')),  -- 模拟考试的等级
  source_draft_rid  INTEGER REFERENCES ai_drafts(rid) ON DELETE SET NULL,  -- 由哪份草稿发布
  generated_at      TEXT,                               -- AI 生成的时间
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  UNIQUE (user_id, code)
);
-- 译文字段：title（标题）、description（说明）、disclaimer（免责说明）、source_summary（出题依据摘要）

-- 练习分区（模拟考试的每一场也是一个分区）
CREATE TABLE practice_sections (
  rid               INTEGER PRIMARY KEY,
  set_rid           INTEGER NOT NULL REFERENCES practice_sets(rid) ON DELETE CASCADE,
  position          INTEGER NOT NULL,
  instruction       TEXT,                               -- 分区作答说明（日语）
  scheduled_date    TEXT,                               -- 模拟考试该场的计划日期
  duration_minutes  INTEGER,                            -- 该场时限（分钟）
  UNIQUE (set_rid, position)
);
-- 译文字段：title（分区标题）、description（分区说明）

-- 练习中的题目条目
CREATE TABLE practice_set_entries (
  rid                INTEGER PRIMARY KEY,
  set_rid            INTEGER NOT NULL REFERENCES practice_sets(rid) ON DELETE CASCADE,
  section_rid        INTEGER REFERENCES practice_sections(rid) ON DELETE CASCADE,  -- 所在分区；不分区的练习为空
  position           INTEGER NOT NULL,
  question_rid       INTEGER NOT NULL REFERENCES questions(rid),  -- 题目（题目被练习引用时不能删除）
  UNIQUE (set_rid, position)
);

-- 专项练习的抽题条件
CREATE TABLE practice_set_filters (
  set_rid       INTEGER PRIMARY KEY REFERENCES practice_sets(rid) ON DELETE CASCADE,
  wordbook_rid  INTEGER REFERENCES wordbooks(rid) ON DELETE SET NULL,  -- 限定单词本
  jlpt_level    TEXT CHECK (jlpt_level IN ('N5', 'N4', 'N3', 'N2', 'N1')),  -- 限定等级
  only_due      INTEGER NOT NULL DEFAULT 0 CHECK (only_due IN (0, 1)),  -- 只抽到期复习的
  question_count INTEGER                                -- 抽多少题
);

CREATE TABLE practice_set_filter_types (
  set_rid  INTEGER NOT NULL REFERENCES practice_sets(rid) ON DELETE CASCADE,
  type_id  TEXT NOT NULL REFERENCES question_types(type_id),                               -- 限定的官方题型
  PRIMARY KEY (set_rid, type_id)
);

CREATE TABLE practice_set_filter_statuses (
  set_rid  INTEGER NOT NULL REFERENCES practice_sets(rid) ON DELETE CASCADE,
  status   TEXT NOT NULL CHECK (status IN ('new', 'learning', 'review', 'mastered')),  -- 限定的记忆状态
  PRIMARY KEY (set_rid, status)
);

-- 练习记录（一次作答过程）
CREATE TABLE practice_attempts (
  rid                    INTEGER PRIMARY KEY,
  user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code                   TEXT NOT NULL,                 -- 练习记录编号：AT12
  set_rid                INTEGER REFERENCES practice_sets(rid) ON DELETE SET NULL,  -- 做的是哪份练习；临时组卷为空
  kind                   TEXT NOT NULL CHECK (kind IN ('daily', 'vocabulary', 'grammar', 'reading', 'listening', 'mixed', 'mock')),  -- 练习入口
  is_active              INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),  -- 是否是进行中的练习（每用户最多一条）
  started_at             TEXT NOT NULL,
  completed_at           TEXT,
  analysis_status        TEXT NOT NULL DEFAULT 'idle' CHECK (analysis_status IN ('idle', 'running', 'completed', 'failed')),  -- AI 练习分析状态
  analysis_started_at    TEXT,
  analysis_completed_at  TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  UNIQUE (user_id, code)
);
CREATE UNIQUE INDEX practice_attempts_one_active ON practice_attempts (user_id) WHERE is_active = 1;
-- 译文字段：title（标题）

-- 练习中每道题的作答
CREATE TABLE attempt_answers (
  rid                INTEGER PRIMARY KEY,
  attempt_rid        INTEGER NOT NULL REFERENCES practice_attempts(rid) ON DELETE CASCADE,
  position           INTEGER NOT NULL,                  -- 第几题
  entry_rid          INTEGER REFERENCES practice_set_entries(rid) ON DELETE SET NULL,  -- 对应练习里的哪个条目
  question_rid        INTEGER REFERENCES questions(rid) ON DELETE SET NULL,  -- 题目；原题已删除或找不到时为空
  status              TEXT NOT NULL CHECK (status IN ('answered', 'presented', 'missing_original')),  -- 已作答 / 出示未答 / 原题已找不到
  selected_option_rid INTEGER REFERENCES question_options(rid) ON DELETE SET NULL,  -- 选中的选项（固定编号，与显示顺序无关）
  selected_text       TEXT,                             -- 作答时所选选项的文字（选项以后被修改或删除也能看到当时选了什么）
  correct_text        TEXT,                             -- 作答时正确选项的文字
  correct             INTEGER CHECK (correct IN (0, 1)),-- 作答时是否答对；以后修改题目不重算；不计分的作答为空
  answer_text         TEXT,                             -- 输入文字类题目（听写）用户输入的文字
  recording_rid       INTEGER REFERENCES speaking_recordings(rid) ON DELETE SET NULL,  -- 录音类题目（跟读）提交的录音
  started_at         TEXT,                              -- 开始看题时间
  answered_at        TEXT,                              -- 作答时间
  elapsed_ms         INTEGER,                           -- 用时（毫秒）
  UNIQUE (attempt_rid, position)
);

-- 每个用户每道题的最新一次作答（错题本、“已答”状态）
CREATE TABLE question_answer_states (
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_rid      INTEGER NOT NULL REFERENCES questions(rid) ON DELETE CASCADE,
  selected_option_rid INTEGER REFERENCES question_options(rid) ON DELETE SET NULL,  -- 最新一次选中的选项
  selected_text     TEXT,                               -- 最新一次所选选项的文字
  correct           INTEGER CHECK (correct IN (0, 1)),  -- 是否答对
  answered_at       TEXT NOT NULL,
  submission_state  TEXT NOT NULL CHECK (submission_state IN ('submitted', 'draft')),  -- 已提交 / 未提交
  event_id          TEXT,                               -- 对应的作答事件
  PRIMARY KEY (user_id, question_rid)
);

-- 学习事件日志（多端同步去重：同一事件只计一次）
CREATE TABLE learning_events (
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id       TEXT NOT NULL,                         -- 客户端生成的事件 ID
  event_type     TEXT NOT NULL CHECK (event_type IN ('AnswerSubmitted', 'MemoryRated')),  -- 作答 / 卡片自评
  occurred_at    TEXT NOT NULL,                         -- 发生时间
  received_at    TEXT NOT NULL,                         -- 服务器收到时间
  payload_hash   TEXT NOT NULL,                         -- 事件内容哈希，识别重复提交
  question_rid   INTEGER REFERENCES questions(rid) ON DELETE SET NULL,  -- 涉及的题目
  point_rid      INTEGER REFERENCES knowledge_points(rid) ON DELETE SET NULL,  -- 涉及的知识点
  selected_option_rid INTEGER REFERENCES question_options(rid) ON DELETE SET NULL,  -- 选中的选项（作答事件）
  selected_text  TEXT,                                  -- 所选选项的文字
  correct        INTEGER CHECK (correct IN (0, 1)),
  type_id        TEXT REFERENCES question_types(type_id),  -- 题型
  rating         TEXT CHECK (rating IN ('forgot', 'hard', 'remembered', 'easy')),  -- 自评结果（自评事件）
  source         TEXT CHECK (source IN ('ios', 'web', 'app', 'mcp')),  -- 来自哪一端
  count_outcome  TEXT,                                  -- 是否计入统计（实现阶段核对取值）
  PRIMARY KEY (user_id, event_id)
);

-- 每个知识点的复习进度（间隔重复）
CREATE TABLE review_schedules (
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  point_rid         INTEGER NOT NULL REFERENCES knowledge_points(rid) ON DELETE CASCADE,
  status            TEXT NOT NULL CHECK (status IN ('learning', 'review', 'mastered')),  -- 学习中 / 复习中 / 已掌握
  review_count      INTEGER NOT NULL DEFAULT 0,         -- 已复习次数
  ease              REAL NOT NULL DEFAULT 2.5 CHECK (ease BETWEEN 1.3 AND 3.0),  -- 难度系数，越大间隔增长越快
  interval_days     INTEGER NOT NULL DEFAULT 0,         -- 当前复习间隔（天）
  due_at            TEXT,                               -- 下次复习时间
  first_seen_at     TEXT,                               -- 第一次学习时间
  last_reviewed_at  TEXT,                               -- 最近一次复习时间
  last_attempt_rid  INTEGER REFERENCES practice_attempts(rid) ON DELETE SET NULL,  -- 最近一次练到它的练习记录
  updated_at        TEXT NOT NULL,
  PRIMARY KEY (user_id, point_rid)
);
CREATE INDEX review_schedules_due ON review_schedules (user_id, due_at);

-- iOS 离线同步的共同基准（三方合并时判断服务器进度是否被别的设备改过）
CREATE TABLE review_schedule_baselines (
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  point_rid         INTEGER NOT NULL REFERENCES knowledge_points(rid) ON DELETE CASCADE,
  status            TEXT NOT NULL CHECK (status IN ('learning', 'review', 'mastered')),
  review_count      INTEGER NOT NULL,
  ease              REAL NOT NULL,
  interval_days     INTEGER NOT NULL,
  due_at            TEXT,
  first_seen_at     TEXT,
  last_reviewed_at  TEXT,
  last_attempt_rid  INTEGER REFERENCES practice_attempts(rid) ON DELETE SET NULL,
  updated_at        TEXT NOT NULL,
  PRIMARY KEY (user_id, point_rid)
);

-- 卡片自评记录
CREATE TABLE memory_ratings (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id     TEXT NOT NULL,                           -- 客户端事件 ID，防止重复提交
  point_rid    INTEGER NOT NULL REFERENCES knowledge_points(rid) ON DELETE CASCADE,
  rating       TEXT NOT NULL CHECK (rating IN ('forgot', 'hard', 'remembered', 'easy')),  -- 忘记 / 困难 / 记得 / 简单
  reviewed_at  TEXT NOT NULL,                           -- 自评时间
  source       TEXT NOT NULL CHECK (source IN ('ios', 'web', 'app', 'mcp')),  -- 来自哪一端
  PRIMARY KEY (user_id, event_id)
);

-- =====================================================================
-- 7. AI 草稿
-- =====================================================================

CREATE TABLE ai_drafts (
  rid            INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code           TEXT NOT NULL,                         -- 草稿编号：DR7
  status         TEXT NOT NULL CHECK (status IN ('draft', 'needs_revision', 'approved', 'archived')),  -- 待确认 / 需修改 / 已确认 / 已归档
  kind           TEXT CHECK (kind IN ('daily_review_pack', 'grammar_practice')),  -- 草稿类型：每日复习包 / 语法练习
  strategy       TEXT CHECK (strategy IN ('targeted_by_history', 'agent_topic')),  -- 出题方式
  target_level   TEXT CHECK (target_level IN ('N5', 'N4', 'N3', 'N2', 'N1')),     -- 目标等级
  practice_date  TEXT,                                  -- 计划练习日期
  minutes        INTEGER,                               -- 预计用时（分钟）
  generated_at   TEXT,                                  -- 生成时间
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE (user_id, code)
);
-- 译文字段：title（标题）、description（说明）、next_step（下一步建议）

CREATE TABLE ai_draft_objectives (
  rid         INTEGER PRIMARY KEY,
  draft_rid   INTEGER NOT NULL REFERENCES ai_drafts(rid) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  UNIQUE (draft_rid, position)
);
-- 译文字段：objective（学习目标）

CREATE TABLE ai_draft_sections (
  rid          INTEGER PRIMARY KEY,
  draft_rid    INTEGER NOT NULL REFERENCES ai_drafts(rid) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  instruction  TEXT,                                    -- 分区作答说明（日语）
  UNIQUE (draft_rid, position)
);
-- 译文字段：title（分区标题）、body（分区正文）

CREATE TABLE ai_draft_questions (
  rid           INTEGER PRIMARY KEY,
  draft_rid     INTEGER NOT NULL REFERENCES ai_drafts(rid) ON DELETE CASCADE,
  section_rid   INTEGER REFERENCES ai_draft_sections(rid) ON DELETE CASCADE,  -- 所在分区；不属于分区的为空
  role          TEXT NOT NULL CHECK (role IN ('section', 'quiz', 'generated')),  -- 分区题 / 小测 / 生成的练习题
  position      INTEGER NOT NULL,
  question_rid  INTEGER NOT NULL REFERENCES questions(rid),  -- 题目（草稿删除时题目保留）
  UNIQUE (draft_rid, role, section_rid, position)
);

CREATE TABLE ai_draft_comments (
  rid         INTEGER PRIMARY KEY,
  draft_rid   INTEGER NOT NULL REFERENCES ai_drafts(rid) ON DELETE CASCADE,
  code        TEXT NOT NULL,                            -- 批注编号：DC3（按用户编号）
  body        TEXT NOT NULL,                            -- 批注内容（用户或 AI 写的原文，不翻译）
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- =====================================================================
-- 8. 学习计划
-- =====================================================================

CREATE TABLE learning_plans (
  user_id                INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,  -- 一用户一份
  exam_name              TEXT,                          -- 目标考试：JLPT 2026年12月
  level                  TEXT CHECK (level IN ('N5', 'N4', 'N3', 'N2', 'N1')),  -- 目标等级
  start_date             TEXT,                          -- 计划开始日期
  exam_date              TEXT,                          -- 考试日期
  study_days_per_week    INTEGER CHECK (study_days_per_week BETWEEN 1 AND 7),   -- 每周学习天数
  daily_minutes          INTEGER,                       -- 每天学习分钟数
  material_start_status  TEXT,                          -- 教材从哪里开始学（实现阶段核对取值）
  status                 TEXT NOT NULL CHECK (status IN ('profile_only', 'ready', 'needs_refresh')),  -- 只有基本信息 / 已生成 / 需重新生成
  generated_at           TEXT,                          -- 计划生成时间
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);
-- 译文字段（owner_rid = user_id）：fixed_schedule（固定日程说明）、supplemental_needs（补充需求）、phase_strategy（分阶段策略）、
--          post_material_strategy（教材学完后的策略）、goal（目标）

CREATE TABLE learning_plan_materials (
  rid         INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES learning_plans(user_id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  module      TEXT CHECK (module IN ('vocabulary', 'grammar', 'reading', 'listening', 'other')),  -- 教材所属模块
  UNIQUE (user_id, position)
);
-- 译文字段：title（教材名）、current_position（当前进度）

CREATE TABLE learning_plan_tasks (
  rid             INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES learning_plans(user_id) ON DELETE CASCADE,
  code            TEXT NOT NULL,                        -- 任务编号：TK12
  scheduled_date  TEXT NOT NULL,                        -- 日期
  module          TEXT NOT NULL CHECK (module IN ('vocabulary', 'grammar', 'reading', 'listening', 'other')),
  minutes         INTEGER,                              -- 用时（分钟）
  material_rid    INTEGER REFERENCES learning_plan_materials(rid) ON DELETE SET NULL,  -- 对应教材
  workload_kind   TEXT,                                 -- 工作量类型（旧数据全为空，实现阶段确认是否保留）
  status          TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'skipped', 'missed')),  -- 待做 / 完成 / 跳过 / 错过
  completed_at    TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (user_id, code)
);
-- 译文字段：title（任务标题）、detail（任务说明）、source_label（出处）

CREATE TABLE learning_plan_phases (
  rid         INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES learning_plans(user_id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  UNIQUE (user_id, position)
);
-- 译文字段：focus（阶段重点）、goal（阶段目标）

CREATE TABLE learning_plan_phase_points (
  rid        INTEGER PRIMARY KEY,
  phase_rid  INTEGER NOT NULL REFERENCES learning_plan_phases(rid) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  UNIQUE (phase_rid, position)
);
-- 译文字段：point（阶段要点）

-- =====================================================================
-- 9. 每日总结
-- =====================================================================

CREATE TABLE daily_reports (
  rid              INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary_date     TEXT NOT NULL,                       -- 总结的日期
  time_zone        TEXT NOT NULL,                       -- 按哪个时区划分这一天
  total_questions  INTEGER NOT NULL,                    -- 当天作答题数
  correct_count    INTEGER NOT NULL,                    -- 答对数
  incorrect_count  INTEGER NOT NULL,                    -- 答错数
  accuracy         REAL,                                -- 正确率
  unique_items     INTEGER,                             -- 涉及的知识点数
  generated_at     TEXT,                                -- 生成时间
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  UNIQUE (user_id, summary_date)
);
-- 译文字段：summary（总结正文）

CREATE TABLE daily_report_type_stats (
  report_rid  INTEGER NOT NULL REFERENCES daily_reports(rid) ON DELETE CASCADE,
  type_id     TEXT NOT NULL REFERENCES question_types(type_id),                            -- 题型
  total       INTEGER NOT NULL,
  correct     INTEGER NOT NULL,
  incorrect   INTEGER NOT NULL,
  accuracy    REAL,
  PRIMARY KEY (report_rid, type_id)
);

CREATE TABLE daily_report_points (
  rid         INTEGER PRIMARY KEY,
  report_rid  INTEGER NOT NULL REFERENCES daily_reports(rid) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('strength', 'weakness')),  -- 优势 / 弱点
  position    INTEGER NOT NULL,
  UNIQUE (report_rid, kind, position)
);
-- 译文字段：label（要点名称）、detail（说明）

CREATE TABLE daily_report_confusions (
  rid         INTEGER PRIMARY KEY,
  report_rid  INTEGER NOT NULL REFERENCES daily_reports(rid) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  UNIQUE (report_rid, position)
);
-- 译文字段：topic（易混主题）

CREATE TABLE daily_report_confusion_points (
  confusion_rid  INTEGER NOT NULL REFERENCES daily_report_confusions(rid) ON DELETE CASCADE,
  point_rid      INTEGER NOT NULL REFERENCES knowledge_points(rid) ON DELETE CASCADE,  -- 涉及的知识点
  PRIMARY KEY (confusion_rid, point_rid)
);

CREATE TABLE daily_report_confusion_questions (
  confusion_rid  INTEGER NOT NULL REFERENCES daily_report_confusions(rid) ON DELETE CASCADE,
  question_rid   INTEGER NOT NULL REFERENCES questions(rid) ON DELETE CASCADE,  -- 作为证据的题目
  PRIMARY KEY (confusion_rid, question_rid)
);

CREATE TABLE daily_report_recommendations (
  rid         INTEGER PRIMARY KEY,
  report_rid  INTEGER NOT NULL REFERENCES daily_reports(rid) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('review', 'practice', 'quality', 'priority', 'card_review')),  -- 复习 / 练习 / 内容质量 / 优先级 / 卡片复习
  UNIQUE (report_rid, position)
);
-- 译文字段：title（建议标题）、detail（建议内容）

CREATE TABLE daily_report_wrong_answers (
  rid             INTEGER PRIMARY KEY,
  report_rid      INTEGER NOT NULL REFERENCES daily_reports(rid) ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  question_rid    INTEGER REFERENCES questions(rid) ON DELETE SET NULL,  -- 错题
  point_rid       INTEGER REFERENCES knowledge_points(rid) ON DELETE SET NULL,  -- 相关知识点
  selected        TEXT,                                 -- 所选答案
  correct_answer  TEXT,                                 -- 正确答案
  UNIQUE (report_rid, position)
);

-- =====================================================================
-- 10. 收集箱、跟读录音
-- =====================================================================

-- 收集箱：学习中随手记下、待整理的内容
CREATE TABLE inbox_captures (
  rid                  INTEGER PRIMARY KEY,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code                 TEXT NOT NULL,                   -- 编号：IN12
  body                 TEXT NOT NULL,                   -- 记下的内容：開校
  category             TEXT NOT NULL CHECK (category IN ('word', 'grammar', 'sentence', 'listening', 'reading', 'unsure')),  -- 内容类别
  context              TEXT,                            -- 出处或上下文
  target_wordbook_rid  INTEGER REFERENCES wordbooks(rid) ON DELETE SET NULL,  -- 整理后放进哪个单词本
  status               TEXT NOT NULL CHECK (status IN ('inbox', 'processed', 'archived')),  -- 待处理 / 已整理 / 已归档
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  UNIQUE (user_id, code)
);

-- 跟读录音
CREATE TABLE speaking_recordings (
  rid                   INTEGER PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code                  TEXT NOT NULL,                  -- 编号：RC1
  question_rid          INTEGER REFERENCES questions(rid) ON DELETE SET NULL,  -- 跟读的听力题
  audio_media_rid       INTEGER NOT NULL REFERENCES media_files(rid),  -- 录音文件
  status                TEXT NOT NULL CHECK (status IN ('pending', 'analyzing', 'completed', 'failed')),  -- 待分析 / 分析中 / 完成 / 失败
  transcript            TEXT,                           -- 识别出的日语
  reference_transcript  TEXT,                           -- 参考原文
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  UNIQUE (user_id, code)
);
-- 译文字段：summary（分析总结）、next_practice（下一步练习建议）

CREATE TABLE speaking_recording_notes (
  rid            INTEGER PRIMARY KEY,
  recording_rid  INTEGER NOT NULL REFERENCES speaking_recordings(rid) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('strength', 'improvement')),  -- 做得好的地方 / 需改进的地方
  position       INTEGER NOT NULL,
  UNIQUE (recording_rid, kind, position)
);
-- 译文字段：note（反馈内容）

-- =====================================================================
-- 10b. 市场（分享与导入）
-- =====================================================================
--
-- 分享包是某一时刻的完整快照，跨用户传递、按版本保存，所以整份存为 JSON（v2 格式：与 v3 写入接口相同的知识点、题组结构）。
-- 导入时按分享包新建导入者自己的单词本、知识点、题组，不引用分享者的数据。

-- 分享
CREATE TABLE market_shares (
  id            TEXT PRIMARY KEY,                       -- 分享编号（UUID，对外链接用）
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- 分享者
  source_id     TEXT NOT NULL,                          -- 来源：单词本编号（WB1）或练习编号（DP3）
  kind          TEXT NOT NULL CHECK (kind IN ('wordbook', 'practice')),  -- 分享单词本 / 分享练习
  package_json  TEXT NOT NULL,                          -- 当前版本的分享包（v2 格式）及分享者文件编号
  created_at    TEXT NOT NULL,
  withdrawn     INTEGER NOT NULL DEFAULT 0 CHECK (withdrawn IN (0, 1))  -- 是否已撤回（撤回后不能再导入）
);

-- 分享的各个版本
CREATE TABLE market_share_versions (
  share_id      TEXT NOT NULL REFERENCES market_shares(id) ON DELETE CASCADE,
  revision      INTEGER NOT NULL,                       -- 版本号，从 1 开始
  package_json  TEXT NOT NULL,                          -- 该版本的分享包
  fingerprint   TEXT NOT NULL,                          -- 分享包内容的哈希，识别重复导入
  created_at    TEXT NOT NULL,
  PRIMARY KEY (share_id, revision)
);

-- 导入记录（同一版本只导入一次）
CREATE TABLE market_imports (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- 导入者
  digest       TEXT NOT NULL,                           -- 分享编号 + 内容哈希
  result_json  TEXT NOT NULL,                           -- 导入结果：新建的单词本、知识点、题组、练习编号和跳过的题
  PRIMARY KEY (user_id, digest)
);

-- =====================================================================
-- 11. 可翻译字段登记（与上面各表注释里的“译文字段”一一对应）
-- =====================================================================

INSERT INTO translatable_fields (owner_table, field, description, allows_ja, learner_visible) VALUES
  ('conjugation_forms', 'description', '变形的用法说明', 0, 1),
  ('conjugation_rules', 'step', '变形步骤说明', 0, 1),
  ('card_templates', 'name', '记忆卡模板名称', 0, 1),
  ('card_templates', 'description', '记忆卡模板说明', 0, 1),
  ('knowledge_points', 'meaning', '释义（ja 为日语释义）', 1, 1),
  ('knowledge_points', 'explanation', '详细讲解', 0, 1),
  ('knowledge_examples', 'translation', '例句译文', 0, 1),
  ('knowledge_examples', 'spoken_translation', '口语说法译文', 0, 1),
  ('knowledge_examples', 'analysis', '例句分析', 0, 1),
  ('knowledge_examples', 'form_analysis', '例句形态分析', 0, 1),
  ('knowledge_memory_points', 'content', '记忆要点', 0, 1),
  ('knowledge_patterns', 'connection', '句型接续说明', 0, 1),
  ('knowledge_patterns', 'meaning', '句型含义', 0, 1),
  ('knowledge_patterns', 'example_translation', '句型例句译文', 0, 1),
  ('knowledge_notes', 'title', '补充说明标题', 0, 1),
  ('knowledge_notes', 'body', '补充说明内容', 0, 1),
  ('knowledge_comparisons', 'difference', '近义辨析的区别说明', 0, 1),
  ('question_types', 'task', '题型任务说明：这类题问什么', 0, 1),
  ('question_types', 'tip', '题型答题技巧', 0, 1),
  ('question_groups', 'instruction_translation', '作答说明译文', 0, 1),
  ('question_groups', 'context_translation', '场景说明译文', 0, 1),
  ('materials', 'title', '素材标题（阅读文章、听力音频的标题）', 0, 1),
  ('materials', 'body_translation', '文章或公告全文译文', 0, 1),
  ('materials', 'transcript_translation', '听力原文译文', 0, 1),
  ('materials', 'summary', '文章概要', 0, 1),
  ('materials', 'structure', '文章结构分析', 0, 1),
  ('material_sentences', 'translation', '逐句译文', 0, 1),
  ('questions', 'translation', '题干译文', 0, 1),
  ('question_options', 'analysis', '选项分析：这个选项为什么对或错', 0, 1),
  ('question_options', 'translation', '选项译文', 0, 1),
  ('question_reviews', 'summary', '审查结论说明', 0, 0),
  ('question_review_findings', 'message', '审查发现的问题与修改建议', 0, 0),
  ('question_explanation_sections', 'title', '解析段落标题', 0, 1),
  ('question_explanation_sections', 'body', '解析段落内容', 0, 1),
  ('practice_sets', 'title', '练习标题', 0, 1),
  ('practice_sets', 'description', '练习说明', 0, 1),
  ('practice_sets', 'disclaimer', '免责说明', 0, 1),
  ('practice_sets', 'source_summary', '出题依据摘要', 0, 1),
  ('practice_sections', 'title', '分区标题', 0, 1),
  ('practice_sections', 'description', '分区说明', 0, 1),
  ('practice_attempts', 'title', '练习记录标题', 0, 1),
  ('ai_drafts', 'title', '草稿标题', 0, 1),
  ('ai_drafts', 'description', '草稿说明', 0, 1),
  ('ai_drafts', 'next_step', '下一步建议', 0, 1),
  ('ai_draft_objectives', 'objective', '学习目标', 0, 1),
  ('ai_draft_sections', 'title', '草稿分区标题', 0, 1),
  ('ai_draft_sections', 'body', '草稿分区正文', 0, 1),
  ('learning_plans', 'fixed_schedule', '固定日程说明', 0, 1),
  ('learning_plans', 'supplemental_needs', '补充需求', 0, 1),
  ('learning_plans', 'phase_strategy', '分阶段策略', 0, 1),
  ('learning_plans', 'post_material_strategy', '教材学完后的策略', 0, 1),
  ('learning_plans', 'goal', '学习目标', 0, 1),
  ('learning_plan_materials', 'title', '教材名', 0, 1),
  ('learning_plan_materials', 'current_position', '教材当前进度', 0, 1),
  ('learning_plan_tasks', 'title', '任务标题', 0, 1),
  ('learning_plan_tasks', 'detail', '任务说明', 0, 1),
  ('learning_plan_tasks', 'source_label', '任务出处', 0, 1),
  ('learning_plan_phases', 'focus', '阶段重点', 0, 1),
  ('learning_plan_phases', 'goal', '阶段目标', 0, 1),
  ('learning_plan_phase_points', 'point', '阶段要点', 0, 1),
  ('daily_reports', 'summary', '每日总结正文', 0, 1),
  ('daily_report_points', 'label', '优势 / 弱点名称', 0, 1),
  ('daily_report_points', 'detail', '优势 / 弱点说明', 0, 1),
  ('daily_report_confusions', 'topic', '易混主题', 0, 1),
  ('daily_report_recommendations', 'title', '建议标题', 0, 1),
  ('daily_report_recommendations', 'detail', '建议内容', 0, 1),
  ('speaking_recordings', 'summary', '录音分析总结', 0, 1),
  ('speaking_recordings', 'next_practice', '下一步练习建议', 0, 1),
  ('speaking_recording_notes', 'note', '录音反馈', 0, 1);

INSERT INTO question_types (rid, type_id, module, label_ja, official, target_marking, option_media, material_kinds, draw_whole_group, sort_order, answer_mode) VALUES
  (1, 'vocabulary-kanji-reading', 'vocabulary', '漢字読み', 1, 'underline', 'text', 'none', 0, 1, 'choice'),
  (2, 'vocabulary-orthography', 'vocabulary', '表記', 1, 'underline', 'text', 'none', 0, 2, 'choice'),
  (3, 'vocabulary-word-formation', 'vocabulary', '語形成', 1, 'blank', 'text', 'none', 0, 3, 'choice'),
  (4, 'vocabulary-context', 'vocabulary', '文脈規定', 1, 'blank', 'text', 'none', 0, 4, 'choice'),
  (5, 'vocabulary-paraphrase', 'vocabulary', '言い換え類義', 1, 'underline', 'text', 'none', 0, 5, 'choice'),
  (6, 'vocabulary-usage', 'vocabulary', '用法', 1, 'none', 'text', 'none', 0, 6, 'choice'),
  (7, 'grammar-form', 'grammar', '文法形式の判断', 1, 'blank', 'text', 'none', 0, 7, 'choice'),
  (8, 'grammar-composition', 'grammar', '文の組み立て', 1, 'star', 'text', 'none', 0, 8, 'choice'),
  (9, 'grammar-text', 'grammar', '文章の文法', 1, 'passage_blank', 'text', 'passage', 1, 9, 'choice'),
  (10, 'reading-short', 'reading', '内容理解（短文）', 1, 'none', 'text', 'passage', 1, 10, 'choice'),
  (11, 'reading-mid', 'reading', '内容理解（中文）', 1, 'none', 'text', 'passage', 1, 11, 'choice'),
  (12, 'reading-long', 'reading', '内容理解（長文）', 1, 'none', 'text', 'passage', 1, 12, 'choice'),
  (13, 'reading-integrated', 'reading', '統合理解', 1, 'none', 'text', 'passage_pair', 1, 13, 'choice'),
  (14, 'reading-thematic', 'reading', '主張理解（長文）', 1, 'none', 'text', 'passage', 1, 14, 'choice'),
  (15, 'reading-information', 'reading', '情報検索', 1, 'none', 'text', 'notice', 1, 15, 'choice'),
  (16, 'reading-basic-training', 'reading', '阅读基础训练', 0, 'none', 'text', 'passage', 1, 16, 'choice'),
  (17, 'listening-task', 'listening', '課題理解', 1, 'none', 'text_or_image', 'audio', 1, 17, 'choice'),
  (18, 'listening-points', 'listening', 'ポイント理解', 1, 'none', 'text', 'audio', 1, 18, 'choice'),
  (19, 'listening-outline', 'listening', '概要理解', 1, 'none', 'audio', 'audio', 1, 19, 'choice'),
  (20, 'listening-expression', 'listening', '発話表現', 1, 'none', 'audio', 'audio_image', 1, 20, 'choice'),
  (21, 'listening-quick', 'listening', '即時応答', 1, 'none', 'audio', 'audio', 1, 21, 'choice'),
  (22, 'listening-integrated', 'listening', '統合理解', 1, 'none', 'mixed', 'audio', 1, 22, 'choice'),
  (23, 'listening-basic-discrimination', 'listening', '辨音', 0, 'none', 'text', 'audio', 1, 23, 'choice'),
  (24, 'listening-basic-dictation', 'listening', '听写', 0, 'none', 'none', 'audio', 1, 24, 'text_input'),
  (25, 'listening-basic-shadowing', 'listening', '跟读', 0, 'none', 'none', 'audio', 1, 25, 'recording'),
  (26, 'listening-basic-free', 'listening', '自由回答', 0, 'none', 'none', 'audio', 1, 26, 'none');

INSERT INTO question_type_levels (type_id, level) VALUES
  ('vocabulary-kanji-reading', 'N1'),
  ('vocabulary-kanji-reading', 'N2'),
  ('vocabulary-kanji-reading', 'N3'),
  ('vocabulary-kanji-reading', 'N4'),
  ('vocabulary-kanji-reading', 'N5'),
  ('vocabulary-orthography', 'N2'),
  ('vocabulary-orthography', 'N3'),
  ('vocabulary-orthography', 'N4'),
  ('vocabulary-orthography', 'N5'),
  ('vocabulary-word-formation', 'N2'),
  ('vocabulary-context', 'N1'),
  ('vocabulary-context', 'N2'),
  ('vocabulary-context', 'N3'),
  ('vocabulary-context', 'N4'),
  ('vocabulary-context', 'N5'),
  ('vocabulary-paraphrase', 'N1'),
  ('vocabulary-paraphrase', 'N2'),
  ('vocabulary-paraphrase', 'N3'),
  ('vocabulary-paraphrase', 'N4'),
  ('vocabulary-paraphrase', 'N5'),
  ('vocabulary-usage', 'N1'),
  ('vocabulary-usage', 'N2'),
  ('vocabulary-usage', 'N3'),
  ('grammar-form', 'N1'),
  ('grammar-form', 'N2'),
  ('grammar-form', 'N3'),
  ('grammar-form', 'N4'),
  ('grammar-form', 'N5'),
  ('grammar-composition', 'N1'),
  ('grammar-composition', 'N2'),
  ('grammar-composition', 'N3'),
  ('grammar-composition', 'N4'),
  ('grammar-composition', 'N5'),
  ('grammar-text', 'N1'),
  ('grammar-text', 'N2'),
  ('grammar-text', 'N3'),
  ('grammar-text', 'N4'),
  ('grammar-text', 'N5'),
  ('reading-short', 'N1'),
  ('reading-short', 'N2'),
  ('reading-short', 'N3'),
  ('reading-short', 'N4'),
  ('reading-short', 'N5'),
  ('reading-mid', 'N1'),
  ('reading-mid', 'N2'),
  ('reading-mid', 'N3'),
  ('reading-mid', 'N4'),
  ('reading-mid', 'N5'),
  ('reading-long', 'N1'),
  ('reading-long', 'N3'),
  ('reading-integrated', 'N1'),
  ('reading-integrated', 'N2'),
  ('reading-thematic', 'N1'),
  ('reading-thematic', 'N2'),
  ('reading-information', 'N1'),
  ('reading-information', 'N2'),
  ('reading-information', 'N3'),
  ('reading-information', 'N4'),
  ('reading-information', 'N5'),
  ('listening-task', 'N1'),
  ('listening-task', 'N2'),
  ('listening-task', 'N3'),
  ('listening-task', 'N4'),
  ('listening-task', 'N5'),
  ('listening-points', 'N1'),
  ('listening-points', 'N2'),
  ('listening-points', 'N3'),
  ('listening-points', 'N4'),
  ('listening-points', 'N5'),
  ('listening-outline', 'N1'),
  ('listening-outline', 'N2'),
  ('listening-outline', 'N3'),
  ('listening-expression', 'N3'),
  ('listening-expression', 'N4'),
  ('listening-expression', 'N5'),
  ('listening-quick', 'N1'),
  ('listening-quick', 'N2'),
  ('listening-quick', 'N3'),
  ('listening-quick', 'N4'),
  ('listening-quick', 'N5'),
  ('listening-integrated', 'N1'),
  ('listening-integrated', 'N2');

INSERT INTO question_type_rules (type_id, rule, requirement, value) VALUES
  ('vocabulary-kanji-reading', 'options', 'required', 4),
  ('vocabulary-kanji-reading', 'correct_option', 'required', NULL),
  ('vocabulary-kanji-reading', 'expected_text', 'forbidden', NULL),
  ('vocabulary-kanji-reading', 'prompt', 'required', NULL),
  ('vocabulary-kanji-reading', 'marks', 'required', NULL),
  ('vocabulary-kanji-reading', 'materials', 'forbidden', NULL),
  ('vocabulary-kanji-reading', 'basis', 'required', NULL),
  ('vocabulary-kanji-reading', 'option_analysis', 'required', NULL),
  ('vocabulary-kanji-reading', 'distractor_also_reading', 'warn', NULL),
  ('vocabulary-kanji-reading', 'reading_options_form', 'warn', NULL),
  ('vocabulary-kanji-reading', 'distractor_in_knowledge', 'warn', NULL),
  ('vocabulary-kanji-reading', 'duplicate_options', 'warn', NULL),
  ('vocabulary-kanji-reading', 'option_length_skew', 'warn', NULL),
  ('vocabulary-kanji-reading', 'target_not_unique', 'warn', NULL),
  ('vocabulary-orthography', 'options', 'required', 4),
  ('vocabulary-orthography', 'correct_option', 'required', NULL),
  ('vocabulary-orthography', 'expected_text', 'forbidden', NULL),
  ('vocabulary-orthography', 'prompt', 'required', NULL),
  ('vocabulary-orthography', 'marks', 'required', NULL),
  ('vocabulary-orthography', 'materials', 'forbidden', NULL),
  ('vocabulary-orthography', 'basis', 'required', NULL),
  ('vocabulary-orthography', 'option_analysis', 'required', NULL),
  ('vocabulary-orthography', 'reading_options_form', 'warn', NULL),
  ('vocabulary-orthography', 'distractor_in_knowledge', 'warn', NULL),
  ('vocabulary-orthography', 'duplicate_options', 'warn', NULL),
  ('vocabulary-orthography', 'option_length_skew', 'warn', NULL),
  ('vocabulary-orthography', 'target_not_unique', 'warn', NULL),
  ('vocabulary-word-formation', 'options', 'required', 4),
  ('vocabulary-word-formation', 'correct_option', 'required', NULL),
  ('vocabulary-word-formation', 'expected_text', 'forbidden', NULL),
  ('vocabulary-word-formation', 'prompt', 'required', NULL),
  ('vocabulary-word-formation', 'marks', 'required', NULL),
  ('vocabulary-word-formation', 'materials', 'forbidden', NULL),
  ('vocabulary-word-formation', 'basis', 'required', NULL),
  ('vocabulary-word-formation', 'option_analysis', 'required', NULL),
  ('vocabulary-word-formation', 'distractor_in_knowledge', 'warn', NULL),
  ('vocabulary-word-formation', 'duplicate_options', 'warn', NULL),
  ('vocabulary-word-formation', 'option_length_skew', 'warn', NULL),
  ('vocabulary-word-formation', 'target_not_unique', 'warn', NULL),
  ('vocabulary-context', 'options', 'required', 4),
  ('vocabulary-context', 'correct_option', 'required', NULL),
  ('vocabulary-context', 'expected_text', 'forbidden', NULL),
  ('vocabulary-context', 'prompt', 'required', NULL),
  ('vocabulary-context', 'marks', 'required', NULL),
  ('vocabulary-context', 'materials', 'forbidden', NULL),
  ('vocabulary-context', 'basis', 'required', NULL),
  ('vocabulary-context', 'option_analysis', 'required', NULL),
  ('vocabulary-context', 'distractor_in_knowledge', 'warn', NULL),
  ('vocabulary-context', 'duplicate_options', 'warn', NULL),
  ('vocabulary-context', 'option_length_skew', 'warn', NULL),
  ('vocabulary-context', 'target_not_unique', 'warn', NULL),
  ('vocabulary-paraphrase', 'options', 'required', 4),
  ('vocabulary-paraphrase', 'correct_option', 'required', NULL),
  ('vocabulary-paraphrase', 'expected_text', 'forbidden', NULL),
  ('vocabulary-paraphrase', 'prompt', 'required', NULL),
  ('vocabulary-paraphrase', 'marks', 'required', NULL),
  ('vocabulary-paraphrase', 'materials', 'forbidden', NULL),
  ('vocabulary-paraphrase', 'basis', 'required', NULL),
  ('vocabulary-paraphrase', 'option_analysis', 'required', NULL),
  ('vocabulary-paraphrase', 'distractor_in_knowledge', 'warn', NULL),
  ('vocabulary-paraphrase', 'duplicate_options', 'warn', NULL),
  ('vocabulary-paraphrase', 'option_length_skew', 'warn', NULL),
  ('vocabulary-paraphrase', 'target_not_unique', 'warn', NULL),
  ('vocabulary-usage', 'options', 'required', 4),
  ('vocabulary-usage', 'correct_option', 'required', NULL),
  ('vocabulary-usage', 'expected_text', 'forbidden', NULL),
  ('vocabulary-usage', 'prompt', 'required', NULL),
  ('vocabulary-usage', 'marks', 'forbidden', NULL),
  ('vocabulary-usage', 'materials', 'forbidden', NULL),
  ('vocabulary-usage', 'basis', 'required', NULL),
  ('vocabulary-usage', 'option_analysis', 'required', NULL),
  ('vocabulary-usage', 'distractor_in_knowledge', 'warn', NULL),
  ('vocabulary-usage', 'duplicate_options', 'warn', NULL),
  ('vocabulary-usage', 'option_length_skew', 'warn', NULL),
  ('grammar-form', 'options', 'required', 4),
  ('grammar-form', 'correct_option', 'required', NULL),
  ('grammar-form', 'expected_text', 'forbidden', NULL),
  ('grammar-form', 'prompt', 'required', NULL),
  ('grammar-form', 'marks', 'required', NULL),
  ('grammar-form', 'materials', 'forbidden', NULL),
  ('grammar-form', 'basis', 'required', NULL),
  ('grammar-form', 'option_analysis', 'required', NULL),
  ('grammar-form', 'distractor_in_knowledge', 'warn', NULL),
  ('grammar-form', 'duplicate_options', 'warn', NULL),
  ('grammar-form', 'option_length_skew', 'warn', NULL),
  ('grammar-form', 'target_not_unique', 'warn', NULL),
  ('grammar-composition', 'options', 'required', 4),
  ('grammar-composition', 'correct_option', 'required', NULL),
  ('grammar-composition', 'expected_text', 'forbidden', NULL),
  ('grammar-composition', 'prompt', 'required', NULL),
  ('grammar-composition', 'marks', 'required', NULL),
  ('grammar-composition', 'materials', 'forbidden', NULL),
  ('grammar-composition', 'basis', 'required', NULL),
  ('grammar-composition', 'option_analysis', 'required', NULL),
  ('grammar-composition', 'distractor_in_knowledge', 'warn', NULL),
  ('grammar-composition', 'duplicate_options', 'warn', NULL),
  ('grammar-composition', 'option_length_skew', 'warn', NULL),
  ('grammar-text', 'options', 'required', 4),
  ('grammar-text', 'correct_option', 'required', NULL),
  ('grammar-text', 'expected_text', 'forbidden', NULL),
  ('grammar-text', 'prompt', 'required', NULL),
  ('grammar-text', 'marks', 'required', NULL),
  ('grammar-text', 'materials', 'required', NULL),
  ('grammar-text', 'basis', 'required', NULL),
  ('grammar-text', 'option_analysis', 'required', NULL),
  ('grammar-text', 'distractor_in_knowledge', 'warn', NULL),
  ('grammar-text', 'duplicate_options', 'warn', NULL),
  ('grammar-text', 'option_length_skew', 'warn', NULL),
  ('reading-short', 'options', 'required', 4),
  ('reading-short', 'correct_option', 'required', NULL),
  ('reading-short', 'expected_text', 'forbidden', NULL),
  ('reading-short', 'prompt', 'required', NULL),
  ('reading-short', 'marks', 'forbidden', NULL),
  ('reading-short', 'materials', 'required', NULL),
  ('reading-short', 'basis', 'required', NULL),
  ('reading-short', 'option_analysis', 'required', NULL),
  ('reading-short', 'evidence', 'warn', NULL),
  ('reading-short', 'option_length_skew', 'warn', NULL),
  ('reading-mid', 'options', 'required', 4),
  ('reading-mid', 'correct_option', 'required', NULL),
  ('reading-mid', 'expected_text', 'forbidden', NULL),
  ('reading-mid', 'prompt', 'required', NULL),
  ('reading-mid', 'marks', 'forbidden', NULL),
  ('reading-mid', 'materials', 'required', NULL),
  ('reading-mid', 'basis', 'required', NULL),
  ('reading-mid', 'option_analysis', 'required', NULL),
  ('reading-mid', 'evidence', 'warn', NULL),
  ('reading-mid', 'option_length_skew', 'warn', NULL),
  ('reading-long', 'options', 'required', 4),
  ('reading-long', 'correct_option', 'required', NULL),
  ('reading-long', 'expected_text', 'forbidden', NULL),
  ('reading-long', 'prompt', 'required', NULL),
  ('reading-long', 'marks', 'forbidden', NULL),
  ('reading-long', 'materials', 'required', NULL),
  ('reading-long', 'basis', 'required', NULL),
  ('reading-long', 'option_analysis', 'required', NULL),
  ('reading-long', 'evidence', 'warn', NULL),
  ('reading-long', 'option_length_skew', 'warn', NULL),
  ('reading-integrated', 'options', 'required', 4),
  ('reading-integrated', 'correct_option', 'required', NULL),
  ('reading-integrated', 'expected_text', 'forbidden', NULL),
  ('reading-integrated', 'prompt', 'required', NULL),
  ('reading-integrated', 'marks', 'forbidden', NULL),
  ('reading-integrated', 'materials', 'required', NULL),
  ('reading-integrated', 'basis', 'required', NULL),
  ('reading-integrated', 'option_analysis', 'required', NULL),
  ('reading-integrated', 'evidence', 'warn', NULL),
  ('reading-integrated', 'option_length_skew', 'warn', NULL),
  ('reading-thematic', 'options', 'required', 4),
  ('reading-thematic', 'correct_option', 'required', NULL),
  ('reading-thematic', 'expected_text', 'forbidden', NULL),
  ('reading-thematic', 'prompt', 'required', NULL),
  ('reading-thematic', 'marks', 'forbidden', NULL),
  ('reading-thematic', 'materials', 'required', NULL),
  ('reading-thematic', 'basis', 'required', NULL),
  ('reading-thematic', 'option_analysis', 'required', NULL),
  ('reading-thematic', 'evidence', 'warn', NULL),
  ('reading-thematic', 'option_length_skew', 'warn', NULL),
  ('reading-information', 'options', 'required', 4),
  ('reading-information', 'correct_option', 'required', NULL),
  ('reading-information', 'expected_text', 'forbidden', NULL),
  ('reading-information', 'prompt', 'required', NULL),
  ('reading-information', 'marks', 'forbidden', NULL),
  ('reading-information', 'materials', 'required', NULL),
  ('reading-information', 'basis', 'required', NULL),
  ('reading-information', 'option_analysis', 'required', NULL),
  ('reading-information', 'evidence', 'warn', NULL),
  ('reading-information', 'option_length_skew', 'warn', NULL),
  ('reading-basic-training', 'options', 'required', 4),
  ('reading-basic-training', 'correct_option', 'required', NULL),
  ('reading-basic-training', 'expected_text', 'forbidden', NULL),
  ('reading-basic-training', 'prompt', 'required', NULL),
  ('reading-basic-training', 'marks', 'forbidden', NULL),
  ('reading-basic-training', 'materials', 'required', NULL),
  ('reading-basic-training', 'basis', 'required', NULL),
  ('reading-basic-training', 'option_analysis', 'required', NULL),
  ('reading-basic-training', 'option_length_skew', 'warn', NULL),
  ('listening-task', 'options', 'required', 4),
  ('listening-task', 'correct_option', 'required', NULL),
  ('listening-task', 'expected_text', 'forbidden', NULL),
  ('listening-task', 'prompt', 'optional', NULL),
  ('listening-task', 'marks', 'forbidden', NULL),
  ('listening-task', 'materials', 'required', NULL),
  ('listening-task', 'basis', 'optional', NULL),
  ('listening-task', 'option_analysis', 'optional', NULL),
  ('listening-task', 'option_length_skew', 'warn', NULL),
  ('listening-points', 'options', 'required', 4),
  ('listening-points', 'correct_option', 'required', NULL),
  ('listening-points', 'expected_text', 'forbidden', NULL),
  ('listening-points', 'prompt', 'optional', NULL),
  ('listening-points', 'marks', 'forbidden', NULL),
  ('listening-points', 'materials', 'required', NULL),
  ('listening-points', 'basis', 'optional', NULL),
  ('listening-points', 'option_analysis', 'optional', NULL),
  ('listening-points', 'option_length_skew', 'warn', NULL),
  ('listening-outline', 'options', 'required', 4),
  ('listening-outline', 'correct_option', 'required', NULL),
  ('listening-outline', 'expected_text', 'forbidden', NULL),
  ('listening-outline', 'prompt', 'optional', NULL),
  ('listening-outline', 'marks', 'forbidden', NULL),
  ('listening-outline', 'materials', 'required', NULL),
  ('listening-outline', 'basis', 'optional', NULL),
  ('listening-outline', 'option_analysis', 'optional', NULL),
  ('listening-expression', 'options', 'required', 3),
  ('listening-expression', 'correct_option', 'required', NULL),
  ('listening-expression', 'expected_text', 'forbidden', NULL),
  ('listening-expression', 'prompt', 'optional', NULL),
  ('listening-expression', 'marks', 'forbidden', NULL),
  ('listening-expression', 'materials', 'required', NULL),
  ('listening-expression', 'basis', 'optional', NULL),
  ('listening-expression', 'option_analysis', 'optional', NULL),
  ('listening-quick', 'options', 'required', 3),
  ('listening-quick', 'correct_option', 'required', NULL),
  ('listening-quick', 'expected_text', 'forbidden', NULL),
  ('listening-quick', 'prompt', 'optional', NULL),
  ('listening-quick', 'marks', 'forbidden', NULL),
  ('listening-quick', 'materials', 'required', NULL),
  ('listening-quick', 'basis', 'optional', NULL),
  ('listening-quick', 'option_analysis', 'optional', NULL),
  ('listening-integrated', 'options', 'required', 4),
  ('listening-integrated', 'correct_option', 'required', NULL),
  ('listening-integrated', 'expected_text', 'forbidden', NULL),
  ('listening-integrated', 'prompt', 'optional', NULL),
  ('listening-integrated', 'marks', 'forbidden', NULL),
  ('listening-integrated', 'materials', 'required', NULL),
  ('listening-integrated', 'basis', 'optional', NULL),
  ('listening-integrated', 'option_analysis', 'optional', NULL),
  ('listening-integrated', 'option_length_skew', 'warn', NULL),
  ('listening-basic-discrimination', 'options', 'required', NULL),
  ('listening-basic-discrimination', 'correct_option', 'required', NULL),
  ('listening-basic-discrimination', 'expected_text', 'forbidden', NULL),
  ('listening-basic-discrimination', 'prompt', 'optional', NULL),
  ('listening-basic-discrimination', 'marks', 'forbidden', NULL),
  ('listening-basic-discrimination', 'materials', 'required', NULL),
  ('listening-basic-discrimination', 'basis', 'optional', NULL),
  ('listening-basic-discrimination', 'option_analysis', 'optional', NULL),
  ('listening-basic-discrimination', 'option_length_skew', 'warn', NULL),
  ('listening-basic-dictation', 'options', 'forbidden', NULL),
  ('listening-basic-dictation', 'correct_option', 'forbidden', NULL),
  ('listening-basic-dictation', 'expected_text', 'required', NULL),
  ('listening-basic-dictation', 'prompt', 'optional', NULL),
  ('listening-basic-dictation', 'marks', 'forbidden', NULL),
  ('listening-basic-dictation', 'materials', 'required', NULL),
  ('listening-basic-dictation', 'basis', 'optional', NULL),
  ('listening-basic-dictation', 'option_analysis', 'forbidden', NULL),
  ('listening-basic-shadowing', 'options', 'forbidden', NULL),
  ('listening-basic-shadowing', 'correct_option', 'forbidden', NULL),
  ('listening-basic-shadowing', 'expected_text', 'forbidden', NULL),
  ('listening-basic-shadowing', 'prompt', 'optional', NULL),
  ('listening-basic-shadowing', 'marks', 'forbidden', NULL),
  ('listening-basic-shadowing', 'materials', 'required', NULL),
  ('listening-basic-shadowing', 'basis', 'forbidden', NULL),
  ('listening-basic-shadowing', 'option_analysis', 'forbidden', NULL),
  ('listening-basic-free', 'options', 'forbidden', NULL),
  ('listening-basic-free', 'correct_option', 'forbidden', NULL),
  ('listening-basic-free', 'expected_text', 'forbidden', NULL),
  ('listening-basic-free', 'prompt', 'optional', NULL),
  ('listening-basic-free', 'marks', 'forbidden', NULL),
  ('listening-basic-free', 'materials', 'required', NULL),
  ('listening-basic-free', 'basis', 'forbidden', NULL),
  ('listening-basic-free', 'option_analysis', 'forbidden', NULL);

INSERT INTO languages (code, native_name, fallback_code, enabled, sort_order) VALUES
  ('ja', '日本語', NULL, 1, 0),
  ('zh-Hans', '简体中文', NULL, 1, 1),
  ('en', 'English', NULL, 1, 2),
  ('zh-Hant', '繁體中文', 'zh-Hans', 1, 3),
  ('ko', '한국어', 'en', 1, 4),
  ('vi', 'Tiếng Việt', 'en', 1, 5),
  ('id', 'Bahasa Indonesia', 'en', 1, 6),
  ('th', 'ไทย', 'en', 1, 7),
  ('my', 'မြန်မာ', 'en', 1, 8),
  ('ne', 'नेपाली', 'en', 1, 9),
  ('es', 'Español', 'en', 1, 10),
  ('fr', 'Français', 'en', 1, 11);

-- =====================================================================
-- 12. 删除业务行时清理它的译文与注音（译文按“表名 + rid”挂载，无法用外键级联）
-- =====================================================================

CREATE TRIGGER ai_draft_objectives_drop_texts AFTER DELETE ON ai_draft_objectives BEGIN
  DELETE FROM content_translations WHERE owner_table = 'ai_draft_objectives' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'ai_draft_objectives' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER ai_draft_sections_drop_texts AFTER DELETE ON ai_draft_sections BEGIN
  DELETE FROM content_translations WHERE owner_table = 'ai_draft_sections' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'ai_draft_sections' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER ai_drafts_drop_texts AFTER DELETE ON ai_drafts BEGIN
  DELETE FROM content_translations WHERE owner_table = 'ai_drafts' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'ai_drafts' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER daily_report_confusions_drop_texts AFTER DELETE ON daily_report_confusions BEGIN
  DELETE FROM content_translations WHERE owner_table = 'daily_report_confusions' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'daily_report_confusions' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER daily_report_points_drop_texts AFTER DELETE ON daily_report_points BEGIN
  DELETE FROM content_translations WHERE owner_table = 'daily_report_points' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'daily_report_points' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER daily_report_recommendations_drop_texts AFTER DELETE ON daily_report_recommendations BEGIN
  DELETE FROM content_translations WHERE owner_table = 'daily_report_recommendations' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'daily_report_recommendations' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER daily_reports_drop_texts AFTER DELETE ON daily_reports BEGIN
  DELETE FROM content_translations WHERE owner_table = 'daily_reports' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'daily_reports' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER knowledge_alternate_forms_drop_texts AFTER DELETE ON knowledge_alternate_forms BEGIN
  DELETE FROM content_translations WHERE owner_table = 'knowledge_alternate_forms' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'knowledge_alternate_forms' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER knowledge_comparisons_drop_texts AFTER DELETE ON knowledge_comparisons BEGIN
  DELETE FROM content_translations WHERE owner_table = 'knowledge_comparisons' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'knowledge_comparisons' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER knowledge_examples_drop_texts AFTER DELETE ON knowledge_examples BEGIN
  DELETE FROM content_translations WHERE owner_table = 'knowledge_examples' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'knowledge_examples' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER knowledge_memory_points_drop_texts AFTER DELETE ON knowledge_memory_points BEGIN
  DELETE FROM content_translations WHERE owner_table = 'knowledge_memory_points' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'knowledge_memory_points' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER knowledge_notes_drop_texts AFTER DELETE ON knowledge_notes BEGIN
  DELETE FROM content_translations WHERE owner_table = 'knowledge_notes' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'knowledge_notes' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER knowledge_patterns_drop_texts AFTER DELETE ON knowledge_patterns BEGIN
  DELETE FROM content_translations WHERE owner_table = 'knowledge_patterns' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'knowledge_patterns' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER knowledge_points_drop_texts AFTER DELETE ON knowledge_points BEGIN
  DELETE FROM content_translations WHERE owner_table = 'knowledge_points' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'knowledge_points' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER knowledge_related_words_drop_texts AFTER DELETE ON knowledge_related_words BEGIN
  DELETE FROM content_translations WHERE owner_table = 'knowledge_related_words' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'knowledge_related_words' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER learning_plan_materials_drop_texts AFTER DELETE ON learning_plan_materials BEGIN
  DELETE FROM content_translations WHERE owner_table = 'learning_plan_materials' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'learning_plan_materials' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER learning_plan_phase_points_drop_texts AFTER DELETE ON learning_plan_phase_points BEGIN
  DELETE FROM content_translations WHERE owner_table = 'learning_plan_phase_points' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'learning_plan_phase_points' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER learning_plan_phases_drop_texts AFTER DELETE ON learning_plan_phases BEGIN
  DELETE FROM content_translations WHERE owner_table = 'learning_plan_phases' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'learning_plan_phases' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER learning_plan_tasks_drop_texts AFTER DELETE ON learning_plan_tasks BEGIN
  DELETE FROM content_translations WHERE owner_table = 'learning_plan_tasks' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'learning_plan_tasks' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER learning_plans_drop_texts AFTER DELETE ON learning_plans BEGIN
  -- 学习计划一用户一份，没有 rid，译文以 user_id 作为 owner_rid
  DELETE FROM content_translations WHERE owner_table = 'learning_plans' AND owner_rid = OLD.user_id;
  DELETE FROM ruby_annotations WHERE owner_table = 'learning_plans' AND owner_rid = OLD.user_id;
END;
CREATE TRIGGER material_sentences_drop_texts AFTER DELETE ON material_sentences BEGIN
  DELETE FROM content_translations WHERE owner_table = 'material_sentences' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'material_sentences' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER media_files_drop_texts AFTER DELETE ON media_files BEGIN
  DELETE FROM content_translations WHERE owner_table = 'media_files' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'media_files' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER practice_attempts_drop_texts AFTER DELETE ON practice_attempts BEGIN
  DELETE FROM content_translations WHERE owner_table = 'practice_attempts' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'practice_attempts' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER practice_sections_drop_texts AFTER DELETE ON practice_sections BEGIN
  DELETE FROM content_translations WHERE owner_table = 'practice_sections' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'practice_sections' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER practice_sets_drop_texts AFTER DELETE ON practice_sets BEGIN
  DELETE FROM content_translations WHERE owner_table = 'practice_sets' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'practice_sets' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER question_explanation_sections_drop_texts AFTER DELETE ON question_explanation_sections BEGIN
  DELETE FROM content_translations WHERE owner_table = 'question_explanation_sections' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'question_explanation_sections' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER question_options_drop_texts AFTER DELETE ON question_options BEGIN
  DELETE FROM content_translations WHERE owner_table = 'question_options' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'question_options' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER speaking_recording_notes_drop_texts AFTER DELETE ON speaking_recording_notes BEGIN
  DELETE FROM content_translations WHERE owner_table = 'speaking_recording_notes' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'speaking_recording_notes' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER speaking_recordings_drop_texts AFTER DELETE ON speaking_recordings BEGIN
  DELETE FROM content_translations WHERE owner_table = 'speaking_recordings' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'speaking_recordings' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER conjugation_rules_drop_texts AFTER DELETE ON conjugation_rules BEGIN
  DELETE FROM content_translations WHERE owner_table = 'conjugation_rules' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER conjugation_forms_drop_texts AFTER DELETE ON conjugation_forms BEGIN
  DELETE FROM content_translations WHERE owner_table = 'conjugation_forms' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER materials_drop_texts AFTER DELETE ON materials BEGIN
  DELETE FROM content_translations WHERE owner_table = 'materials' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'materials' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER questions_drop_texts AFTER DELETE ON questions BEGIN
  DELETE FROM content_translations WHERE owner_table = 'questions' AND owner_rid = OLD.rid;
  DELETE FROM ruby_annotations WHERE owner_table = 'questions' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER question_types_drop_texts AFTER DELETE ON question_types BEGIN
  DELETE FROM content_translations WHERE owner_table = 'question_types' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER question_groups_drop_texts AFTER DELETE ON question_groups BEGIN
  DELETE FROM content_translations WHERE owner_table = 'question_groups' AND owner_rid = OLD.rid;
END;

-- 记忆卡模板数据
INSERT INTO card_templates (rid, code, kind, is_default, sort_order) VALUES
  (1, 'word_standard', 'word', 1, 1),
  (2, 'word_simple', 'word', 0, 2),
  (3, 'word_example', 'word', 0, 3),
  (4, 'word_japanese', 'word', 0, 4),
  (5, 'grammar_standard', 'grammar', 1, 5),
  (6, 'grammar_example', 'grammar', 0, 6),
  (7, 'grammar_comparison', 'grammar', 0, 7),
  (8, 'name_standard', 'name', 1, 8);

INSERT INTO card_template_fields (template_rid, side, position, field, max_items, with_translation) VALUES
  (1, 'front', 0, 'expression', NULL, 1),
  (1, 'back', 0, 'reading', NULL, 1),
  (1, 'back', 1, 'romaji', NULL, 1),
  (1, 'back', 2, 'meaning', NULL, 1),
  (1, 'back', 3, 'example', 1, 1),
  (1, 'back', 4, 'memory_point', 1, 1),
  (1, 'back', 5, 'image', NULL, 1),
  (2, 'front', 0, 'expression', NULL, 1),
  (2, 'back', 0, 'reading', NULL, 1),
  (2, 'back', 1, 'meaning', NULL, 1),
  (3, 'front', 0, 'example', 1, 0),
  (3, 'back', 0, 'expression', NULL, 1),
  (3, 'back', 1, 'reading', NULL, 1),
  (3, 'back', 2, 'meaning', NULL, 1),
  (3, 'back', 3, 'example', 1, 1),
  (4, 'front', 0, 'expression', NULL, 1),
  (4, 'back', 0, 'reading', NULL, 1),
  (4, 'back', 1, 'meaning_ja', NULL, 1),
  (4, 'back', 2, 'paraphrase', NULL, 1),
  (4, 'back', 3, 'example', 1, 0),
  (5, 'front', 0, 'expression', NULL, 1),
  (5, 'back', 0, 'pattern', 1, 0),
  (5, 'back', 1, 'meaning', NULL, 1),
  (5, 'back', 2, 'example', 1, 1),
  (5, 'back', 3, 'memory_point', 1, 1),
  (6, 'front', 0, 'example', 1, 0),
  (6, 'back', 0, 'expression', NULL, 1),
  (6, 'back', 1, 'meaning', NULL, 1),
  (6, 'back', 2, 'example', 1, 1),
  (6, 'back', 3, 'note', 1, 1),
  (7, 'front', 0, 'expression', NULL, 1),
  (7, 'back', 0, 'meaning', NULL, 1),
  (7, 'back', 1, 'comparison', 2, 1),
  (7, 'back', 2, 'example', 1, 1),
  (8, 'front', 0, 'expression', NULL, 1),
  (8, 'back', 0, 'reading', NULL, 1),
  (8, 'back', 1, 'romaji', NULL, 1),
  (8, 'back', 2, 'meaning', NULL, 1);

INSERT INTO content_translations (owner_table, owner_rid, field, language, text, origin, verified, created_at, updated_at) VALUES
  ('card_templates', 1, 'name', 'zh-Hans', '标准', 'manual', 1, '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z'),
  ('card_templates', 1, 'description', 'zh-Hans', '写法 → 读音、释义、1 条例句、1 条记忆要点、记忆图片。适合日常复习。', 'manual', 1, '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z'),
  ('card_templates', 2, 'name', 'zh-Hans', '简洁', 'manual', 1, '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z'),
  ('card_templates', 2, 'description', 'zh-Hans', '写法 → 读音、释义。适合快速过一遍大量单词。', 'manual', 1, '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z'),
  ('card_templates', 3, 'name', 'zh-Hans', '例句', 'manual', 1, '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z'),
  ('card_templates', 3, 'description', 'zh-Hans', '例句（不带译文）→ 写法、读音、释义、例句译文。在语境中回忆词义。', 'manual', 1, '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z'),
  ('card_templates', 4, 'name', 'zh-Hans', '日语释义', 'manual', 1, '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z'),
  ('card_templates', 4, 'description', 'zh-Hans', '写法 → 读音、日语释义、换说、例句（不带译文）。用日语理解日语，适合 N2 以上。', 'manual', 1, '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z'),
  ('card_templates', 5, 'name', 'zh-Hans', '标准', 'manual', 1, '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z'),
  ('card_templates', 5, 'description', 'zh-Hans', '句型 → 接续、含义、1 条例句、1 条记忆要点。', 'manual', 1, '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z'),
  ('card_templates', 6, 'name', 'zh-Hans', '例句', 'manual', 1, '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z'),
  ('card_templates', 6, 'description', 'zh-Hans', '例句（不带译文）→ 句型、含义、例句译文、1 条补充说明。在语境中判断语法。', 'manual', 1, '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z'),
  ('card_templates', 7, 'name', 'zh-Hans', '辨析', 'manual', 1, '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z'),
  ('card_templates', 7, 'description', 'zh-Hans', '句型 → 含义、最多 2 条近义辨析、1 条例句。适合容易混淆的语法。', 'manual', 1, '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z'),
  ('card_templates', 8, 'name', 'zh-Hans', '标准', 'manual', 1, '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z'),
  ('card_templates', 8, 'description', 'zh-Hans', '写法 → 读音、罗马音、说明。', 'manual', 1, '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z');
CREATE TRIGGER card_templates_drop_texts AFTER DELETE ON card_templates BEGIN
  DELETE FROM content_translations WHERE owner_table = 'card_templates' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER question_reviews_drop_texts AFTER DELETE ON question_reviews BEGIN
  DELETE FROM content_translations WHERE owner_table = 'question_reviews' AND owner_rid = OLD.rid;
END;
CREATE TRIGGER question_review_findings_drop_texts AFTER DELETE ON question_review_findings BEGIN
  DELETE FROM content_translations WHERE owner_table = 'question_review_findings' AND owner_rid = OLD.rid;
END;
