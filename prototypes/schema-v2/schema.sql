-- JLPT Master Deck 表结构 v2（原型）
-- 原则：
--   1. 会被筛选、统计、单独修改或被引用的数据用列/子表；只有市场分享的冻结导出包保留 JSON。
--   2. 用户可见记录的编号 = 业务前缀 + 每个用户内按业务类型自增的序号（W12、QV15、DP3），不用随机 ID。
--      编号由 id_sequences 在写入事务中分配，只增不减，删除后不复用。
--   3. 子记录（义项、例句、选项等）用“父编号 + 序号”定位，例如 W12 的第 2 个例句、QV15 r1 的选项 3。
--   4. 多语言：日语学习内容（词、例句、题干、选项、文章）是原文列，不带语言后缀；
--      释义、翻译、解析等说明性内容放在各自的 *_translations 表，一种语言一行，增加语言不改表结构；
--      个人一次性生成的文本（每日总结、录音反馈）一列正文 + 一列 language。
--   5. 不预存注音：单词只存假名读音和罗马音；其他地方的注音由用户让 AI 按需添加（Anki 写法），存在 ruby_annotations。
--   6. 所有业务表带 user_id；删除用户时按 user_id 级联删除，业务表之间的外键默认 NO ACTION。

PRAGMA foreign_keys = ON;

-- ============================================================
-- 编号
-- ============================================================

-- 业务类型与编号前缀（参考数据，所有用户共用）
CREATE TABLE business_types (
  prefix TEXT PRIMARY KEY CHECK (prefix GLOB '[A-Z]*' AND length(prefix) BETWEEN 1 AND 3),
  table_name TEXT NOT NULL,
  label_key TEXT NOT NULL                 -- 应用 i18n 文案的 key，显示名不存库
) STRICT;

-- 支持的语言（BCP 47），fallback_code 是缺译时的回退语言
CREATE TABLE languages (
  code TEXT PRIMARY KEY,                  -- ja / zh-Hans / zh-Hant / en / ko / vi
  native_name TEXT NOT NULL,              -- 语言自称：日本語、简体中文、English
  fallback_code TEXT REFERENCES languages(code),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  CHECK (fallback_code IS NULL OR fallback_code <> code)
) STRICT;

CREATE TABLE users (
  id INTEGER PRIMARY KEY,                 -- 0 保留给全局记录（市场分享）
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

-- 每个用户、每种业务类型一个计数器
CREATE TABLE id_sequences (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL REFERENCES business_types(prefix),
  last_no INTEGER NOT NULL DEFAULT 0 CHECK (last_no >= 0),
  PRIMARY KEY (user_id, prefix)
) STRICT;

-- 旧系统编号（IT123、QU45 等）到新编号的对照，迁移后用户仍可用旧编号查找
CREATE TABLE legacy_references (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  legacy_code TEXT NOT NULL,              -- IT123
  new_code TEXT NOT NULL,                 -- W12
  PRIMARY KEY (user_id, legacy_code)
) STRICT;

-- ============================================================
-- 用户设置
-- ============================================================

CREATE TABLE user_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  time_zone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  ui_language TEXT NOT NULL DEFAULT 'zh-Hans' REFERENCES languages(code),        -- 界面语言
  explanation_language TEXT NOT NULL DEFAULT 'zh-Hans' REFERENCES languages(code), -- 释义、解析使用的语言
  target_level INTEGER CHECK (target_level BETWEEN 1 AND 5),
  show_ruby INTEGER NOT NULL DEFAULT 1 CHECK (show_ruby IN (0,1)),       -- 是否显示已有注音
  show_romaji INTEGER NOT NULL DEFAULT 1 CHECK (show_romaji IN (0,1)),
  daily_review_limit INTEGER NOT NULL DEFAULT 50 CHECK (daily_review_limit >= 0),
  updated_at TEXT NOT NULL
) STRICT;

-- ============================================================
-- 单词本与知识点
-- ============================================================

CREATE TABLE wordbooks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,                       -- WB1
  no INTEGER NOT NULL CHECK (no > 0),
  title TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, title),
  CHECK (id = 'WB' || no)
) STRICT;
CREATE UNIQUE INDEX wordbooks_one_default ON wordbooks(user_id) WHERE is_default = 1;

-- AI 生成、等待用户审核的一批内容
CREATE TABLE ai_draft_batches (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,                       -- DR1
  no INTEGER NOT NULL CHECK (no > 0),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reviewing','approved','rejected')),
  requested_via TEXT NOT NULL CHECK (requested_via IN ('mcp','web','ios')),
  created_at TEXT NOT NULL,
  decided_at TEXT,
  PRIMARY KEY (user_id, id),
  CHECK (id = 'DR' || no),
  CHECK ((status = 'reviewing') = (decided_at IS NULL))
) STRICT;

-- 知识点：单词(W)、语法(G)、人名读法(N)，类型创建后不可改
CREATE TABLE knowledge_points (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,                       -- W12 / G3 / N1
  no INTEGER NOT NULL CHECK (no > 0),
  kind TEXT NOT NULL CHECK (kind IN ('word','grammar','name')),
  wordbook_id TEXT NOT NULL,
  expression TEXT NOT NULL,               -- 食べる / ～とはいえ
  reading TEXT,                           -- たべる（只含假名，服务端校验）
  romaji TEXT,                            -- taberu（服务端由 reading 生成，或经校验的自定义写法）
  romaji_key TEXT,                        -- 搜索用宽松键：去空格/撇号、合并长音
  romaji_custom INTEGER NOT NULL DEFAULT 0 CHECK (romaji_custom IN (0,1)),
  jlpt_level INTEGER CHECK (jlpt_level BETWEEN 1 AND 5),
  status TEXT NOT NULL CHECK (status IN ('draft','active','archived')),
  origin TEXT NOT NULL CHECK (origin IN ('manual','ai','seed','import','market')),
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  ai_draft_batch_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, wordbook_id) REFERENCES wordbooks(user_id, id),
  FOREIGN KEY (user_id, ai_draft_batch_id) REFERENCES ai_draft_batches(user_id, id),
  CHECK (id = CASE kind WHEN 'word' THEN 'W' WHEN 'grammar' THEN 'G' ELSE 'N' END || no),
  CHECK ((reading IS NULL) = (romaji IS NULL) AND (romaji IS NULL) = (romaji_key IS NULL))
) STRICT;
CREATE INDEX knowledge_points_book ON knowledge_points(user_id, wordbook_id, status);
CREATE INDEX knowledge_points_level ON knowledge_points(user_id, kind, jlpt_level);
CREATE INDEX knowledge_points_expression ON knowledge_points(user_id, expression);
CREATE INDEX knowledge_points_romaji ON knowledge_points(user_id, romaji_key);

-- 义项（W12 的第 1、2 个意思）；释义文字在 knowledge_meaning_translations
CREATE TABLE knowledge_meanings (
  user_id INTEGER NOT NULL,
  knowledge_point_id TEXT NOT NULL,
  meaning_no INTEGER NOT NULL CHECK (meaning_no > 0),
  part_of_speech TEXT CHECK (part_of_speech IN ('noun','verb','i_adjective','na_adjective','adverb','particle','expression','other')),
  PRIMARY KEY (user_id, knowledge_point_id, meaning_no),
  FOREIGN KEY (user_id, knowledge_point_id) REFERENCES knowledge_points(user_id, id) ON DELETE CASCADE
) STRICT;

-- 例句
CREATE TABLE knowledge_examples (
  user_id INTEGER NOT NULL,
  knowledge_point_id TEXT NOT NULL,
  example_no INTEGER NOT NULL CHECK (example_no > 0),
  meaning_no INTEGER,                     -- 对应哪个义项，可空
  sentence TEXT NOT NULL,                 -- 日语例句原文
  source TEXT NOT NULL CHECK (source IN ('manual','ai','exam','import')),
  PRIMARY KEY (user_id, knowledge_point_id, example_no),
  FOREIGN KEY (user_id, knowledge_point_id) REFERENCES knowledge_points(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, knowledge_point_id, meaning_no) REFERENCES knowledge_meanings(user_id, knowledge_point_id, meaning_no)
) STRICT;

-- 活用形（只用于单词），每个形式也有读音和罗马音
CREATE TABLE knowledge_forms (
  user_id INTEGER NOT NULL,
  knowledge_point_id TEXT NOT NULL,
  form_code TEXT NOT NULL CHECK (form_code IN ('polite','negative','past','te','potential','passive','causative','causative_passive','conditional','volitional','imperative')),
  expression TEXT NOT NULL,               -- 食べます
  reading TEXT NOT NULL,                  -- たべます
  romaji TEXT NOT NULL,                   -- tabemasu
  PRIMARY KEY (user_id, knowledge_point_id, form_code),
  FOREIGN KEY (user_id, knowledge_point_id) REFERENCES knowledge_points(user_id, id) ON DELETE CASCADE
) STRICT;

-- 句型、要点、近义比较、记忆点
CREATE TABLE knowledge_notes (
  user_id INTEGER NOT NULL,
  knowledge_point_id TEXT NOT NULL,
  note_no INTEGER NOT NULL CHECK (note_no > 0),
  kind TEXT NOT NULL CHECK (kind IN ('pattern','point','comparison','memory')),
  label TEXT,                             -- 日语：句型「名詞＋とはいえ」/ 比较对象「召し上がる」；说明文字在翻译表
  related_knowledge_point_id TEXT,        -- 比较对象也是知识点时
  PRIMARY KEY (user_id, knowledge_point_id, note_no),
  FOREIGN KEY (user_id, knowledge_point_id) REFERENCES knowledge_points(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, related_knowledge_point_id) REFERENCES knowledge_points(user_id, id)
) STRICT;

CREATE TABLE knowledge_tags (
  user_id INTEGER NOT NULL,
  knowledge_point_id TEXT NOT NULL,
  tag TEXT NOT NULL CHECK (length(trim(tag)) > 0),
  PRIMARY KEY (user_id, knowledge_point_id, tag),
  FOREIGN KEY (user_id, knowledge_point_id) REFERENCES knowledge_points(user_id, id) ON DELETE CASCADE
) STRICT;
CREATE INDEX knowledge_tags_by_tag ON knowledge_tags(user_id, tag);

-- ------------------------------------------------------------
-- 知识点的多语言说明：一种语言一行
-- ------------------------------------------------------------

CREATE TABLE knowledge_point_translations (
  user_id INTEGER NOT NULL,
  knowledge_point_id TEXT NOT NULL,
  language TEXT NOT NULL REFERENCES languages(code),
  origin TEXT NOT NULL CHECK (origin IN ('manual','ai','import')),   -- AI 译文未核对前界面标注
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  updated_at TEXT NOT NULL,
  explanation TEXT,                       -- 总体说明
  usage_note TEXT,                        -- 用法注意
  exam_tip TEXT,                          -- 考试提示
  PRIMARY KEY (user_id, knowledge_point_id, language),
  FOREIGN KEY (user_id, knowledge_point_id) REFERENCES knowledge_points(user_id, id) ON DELETE CASCADE,
  CHECK (coalesce(explanation, usage_note, exam_tip) IS NOT NULL)
) STRICT;

CREATE TABLE knowledge_meaning_translations (
  user_id INTEGER NOT NULL,
  knowledge_point_id TEXT NOT NULL,
  meaning_no INTEGER NOT NULL,
  language TEXT NOT NULL REFERENCES languages(code),
  origin TEXT NOT NULL CHECK (origin IN ('manual','ai','import')),   -- AI 译文未核对前界面标注
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  updated_at TEXT NOT NULL,
  meaning TEXT NOT NULL,                  -- 吃 / to eat / 食べ物を口に入れる（ja = 日语释义）
  PRIMARY KEY (user_id, knowledge_point_id, meaning_no, language),
  FOREIGN KEY (user_id, knowledge_point_id, meaning_no) REFERENCES knowledge_meanings(user_id, knowledge_point_id, meaning_no) ON DELETE CASCADE
) STRICT;

CREATE TABLE knowledge_example_translations (
  user_id INTEGER NOT NULL,
  knowledge_point_id TEXT NOT NULL,
  example_no INTEGER NOT NULL,
  language TEXT NOT NULL REFERENCES languages(code),
  origin TEXT NOT NULL CHECK (origin IN ('manual','ai','import')),   -- AI 译文未核对前界面标注
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  updated_at TEXT NOT NULL,
  translation TEXT NOT NULL,
  PRIMARY KEY (user_id, knowledge_point_id, example_no, language),
  FOREIGN KEY (user_id, knowledge_point_id, example_no) REFERENCES knowledge_examples(user_id, knowledge_point_id, example_no) ON DELETE CASCADE,
  CHECK (language <> 'ja')                -- 例句原文就是日语
) STRICT;

CREATE TABLE knowledge_note_translations (
  user_id INTEGER NOT NULL,
  knowledge_point_id TEXT NOT NULL,
  note_no INTEGER NOT NULL,
  language TEXT NOT NULL REFERENCES languages(code),
  origin TEXT NOT NULL CHECK (origin IN ('manual','ai','import')),   -- AI 译文未核对前界面标注
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  updated_at TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (user_id, knowledge_point_id, note_no, language),
  FOREIGN KEY (user_id, knowledge_point_id, note_no) REFERENCES knowledge_notes(user_id, knowledge_point_id, note_no) ON DELETE CASCADE
) STRICT;

-- ============================================================
-- 媒体文件
-- ============================================================

CREATE TABLE media_files (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,                       -- AU1 音频 / IM1 图片 / RF1 录音文件
  no INTEGER NOT NULL CHECK (no > 0),
  kind TEXT NOT NULL CHECK (kind IN ('audio','image','recording')),
  mime TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  sha256 TEXT NOT NULL,
  storage_key TEXT NOT NULL,              -- R2 或本地路径
  duration_ms INTEGER CHECK (duration_ms >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, storage_key),
  CHECK (id = CASE kind WHEN 'audio' THEN 'AU' WHEN 'image' THEN 'IM' ELSE 'RF' END || no)
) STRICT;

-- 图片说明如需多语言，按需再加 knowledge_image_translations（同上模式）
CREATE TABLE knowledge_images (
  user_id INTEGER NOT NULL,
  knowledge_point_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  show_on_card INTEGER NOT NULL DEFAULT 1 CHECK (show_on_card IN (0,1)),
  PRIMARY KEY (user_id, knowledge_point_id, media_id),
  FOREIGN KEY (user_id, knowledge_point_id) REFERENCES knowledge_points(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, media_id) REFERENCES media_files(user_id, id)
) STRICT;

-- ============================================================
-- 题目
-- ============================================================

-- 阅读文章 / 听力脚本，按修订冻结（多道题可共用）
CREATE TABLE question_materials (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,                       -- M1
  no INTEGER NOT NULL CHECK (no > 0),
  revision INTEGER NOT NULL CHECK (revision > 0),
  kind TEXT NOT NULL CHECK (kind IN ('reading_passage','listening_script')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,                     -- 日语原文；译文在 question_material_translations
  audio_media_id TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id, revision),
  FOREIGN KEY (user_id, audio_media_id) REFERENCES media_files(user_id, id),
  CHECK (id = 'M' || no)
) STRICT;

-- 题目身份与状态；前缀按模块：QV 词汇、QG 语法、QR 阅读、QL 听力
CREATE TABLE questions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,                       -- QV15
  no INTEGER NOT NULL CHECK (no > 0),
  type_id TEXT NOT NULL CHECK (type_id IN (
    'vocabulary-kanji-reading','vocabulary-orthography','vocabulary-word-formation','vocabulary-context','vocabulary-paraphrase','vocabulary-usage',
    'grammar-form','grammar-composition','grammar-text',
    'reading-short','reading-mid','reading-long','reading-integrated','reading-thematic','reading-information','reading-basic-training',
    'listening-task','listening-points','listening-outline','listening-expression','listening-quick','listening-integrated','listening-basic-training')),
  current_revision INTEGER NOT NULL CHECK (current_revision > 0),
  status TEXT NOT NULL CHECK (status IN ('draft','active','archived')),
  origin TEXT NOT NULL CHECK (origin IN ('manual','ai','official_sample','import','market')),
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  ai_draft_batch_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, id, current_revision) REFERENCES question_revisions(user_id, question_id, revision) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (user_id, ai_draft_batch_id) REFERENCES ai_draft_batches(user_id, id),
  CHECK (id = CASE substr(type_id, 1, instr(type_id, '-') - 1)
    WHEN 'vocabulary' THEN 'QV' WHEN 'grammar' THEN 'QG' WHEN 'reading' THEN 'QR' ELSE 'QL' END || no)
) STRICT;
CREATE INDEX questions_type ON questions(user_id, type_id, status);

-- 题面；一旦出现在任何练习记录中即冻结，再改要新建修订
CREATE TABLE question_revisions (
  user_id INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  jlpt_level INTEGER CHECK (jlpt_level BETWEEN 1 AND 5),
  answer_mode TEXT NOT NULL CHECK (answer_mode IN ('single','arrangement','unscored')),
  instruction TEXT,
  prompt TEXT NOT NULL,
  prompt_target TEXT,                     -- 题干中被考查的部分（如画线词）
  star_position INTEGER CHECK (star_position > 0),   -- 排列题：★ 是第几个空，只按该位置评分
  material_id TEXT,
  material_revision INTEGER,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, question_id, revision),
  FOREIGN KEY (user_id, question_id) REFERENCES questions(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, material_id, material_revision) REFERENCES question_materials(user_id, id, revision),
  CHECK ((material_id IS NULL) = (material_revision IS NULL)),
  CHECK ((answer_mode = 'arrangement') = (star_position IS NOT NULL))
) STRICT;
CREATE INDEX question_revisions_level ON question_revisions(user_id, jlpt_level);

-- 选项：option_no 是作者录入顺序（稳定），显示时可以打乱
CREATE TABLE question_options (
  user_id INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  option_no INTEGER NOT NULL CHECK (option_no > 0),
  option_text TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0,1)),   -- 单选
  correct_position INTEGER CHECK (correct_position > 0),               -- 排列题：正确位置
  PRIMARY KEY (user_id, question_id, revision, option_no),
  FOREIGN KEY (user_id, question_id, revision) REFERENCES question_revisions(user_id, question_id, revision) ON DELETE CASCADE
) STRICT;

-- ------------------------------------------------------------
-- 题目的多语言说明；已被练习使用的修订：已有译文不可改，可新增其他语言
-- ------------------------------------------------------------

CREATE TABLE question_material_translations (
  user_id INTEGER NOT NULL,
  material_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  language TEXT NOT NULL REFERENCES languages(code),
  origin TEXT NOT NULL CHECK (origin IN ('manual','ai','import')),   -- AI 译文未核对前界面标注
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  updated_at TEXT NOT NULL,
  title TEXT,
  translation TEXT,                       -- 全文译文
  PRIMARY KEY (user_id, material_id, revision, language),
  FOREIGN KEY (user_id, material_id, revision) REFERENCES question_materials(user_id, id, revision) ON DELETE CASCADE,
  CHECK (language <> 'ja')
) STRICT;

CREATE TABLE question_revision_translations (
  user_id INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  language TEXT NOT NULL REFERENCES languages(code),
  origin TEXT NOT NULL CHECK (origin IN ('manual','ai','import')),   -- AI 译文未核对前界面标注
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  updated_at TEXT NOT NULL,
  explanation TEXT,                       -- 解析
  memory_point TEXT,                      -- 记忆点
  PRIMARY KEY (user_id, question_id, revision, language),
  FOREIGN KEY (user_id, question_id, revision) REFERENCES question_revisions(user_id, question_id, revision) ON DELETE CASCADE,
  CHECK (coalesce(explanation, memory_point) IS NOT NULL)
) STRICT;

CREATE TABLE question_option_translations (
  user_id INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  option_no INTEGER NOT NULL,
  language TEXT NOT NULL REFERENCES languages(code),
  origin TEXT NOT NULL CHECK (origin IN ('manual','ai','import')),   -- AI 译文未核对前界面标注
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  updated_at TEXT NOT NULL,
  analysis TEXT NOT NULL,                 -- 干扰项分析
  PRIMARY KEY (user_id, question_id, revision, option_no, language),
  FOREIGN KEY (user_id, question_id, revision, option_no) REFERENCES question_options(user_id, question_id, revision, option_no) ON DELETE CASCADE
) STRICT;

-- 题目考查哪些知识点
CREATE TABLE question_knowledge_points (
  user_id INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  knowledge_point_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('target','related')),
  PRIMARY KEY (user_id, question_id, revision, knowledge_point_id),
  FOREIGN KEY (user_id, question_id, revision) REFERENCES question_revisions(user_id, question_id, revision) ON DELETE CASCADE,
  FOREIGN KEY (user_id, knowledge_point_id) REFERENCES knowledge_points(user_id, id)
) STRICT;
CREATE INDEX question_knowledge_points_reverse ON question_knowledge_points(user_id, knowledge_point_id);

-- ============================================================
-- 练习与作答
-- ============================================================

-- 前缀按类型：DP 每日练习、MX 模拟考试、TP 专项练习、MP 自建练习
CREATE TABLE practice_sets (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  no INTEGER NOT NULL CHECK (no > 0),
  kind TEXT NOT NULL CHECK (kind IN ('daily','mock','topic','manual')),
  title TEXT NOT NULL,
  practice_date TEXT,
  time_limit_minutes INTEGER CHECK (time_limit_minutes > 0),
  status TEXT NOT NULL CHECK (status IN ('draft','ready','archived')),
  origin TEXT NOT NULL CHECK (origin IN ('manual','ai','import','market')),
  ai_draft_batch_id TEXT,
  note TEXT,                              -- 出题说明、诊断摘要（个人文本）
  note_language TEXT REFERENCES languages(code),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, ai_draft_batch_id) REFERENCES ai_draft_batches(user_id, id),
  CHECK ((note IS NULL) = (note_language IS NULL)),
  CHECK (id = CASE kind WHEN 'daily' THEN 'DP' WHEN 'mock' THEN 'MX' WHEN 'topic' THEN 'TP' ELSE 'MP' END || no)
) STRICT;

CREATE TABLE practice_set_questions (
  user_id INTEGER NOT NULL,
  practice_set_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  section_title TEXT,                     -- 模拟考分区：文字・語彙 / 文法 / 読解 / 聴解
  question_id TEXT NOT NULL,
  question_revision INTEGER NOT NULL,
  selection_reason TEXT CHECK (selection_reason IN ('manual','weakness','due_review','history_wrong','coverage')),
  PRIMARY KEY (user_id, practice_set_id, ordinal),
  FOREIGN KEY (user_id, practice_set_id) REFERENCES practice_sets(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, question_id, question_revision) REFERENCES question_revisions(user_id, question_id, revision)
) STRICT;

-- 一次练习或考试（AT）
CREATE TABLE practice_attempts (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  no INTEGER NOT NULL CHECK (no > 0),
  practice_set_id TEXT,                   -- 临时复习可以不属于任何练习
  mode TEXT NOT NULL CHECK (mode IN ('practice','mock','review')),
  status TEXT NOT NULL CHECK (status IN ('active','completed','abandoned')),
  started_at TEXT NOT NULL,
  deadline_at TEXT,
  completed_at TEXT,
  question_count INTEGER NOT NULL CHECK (question_count >= 0),
  answered_count INTEGER NOT NULL DEFAULT 0 CHECK (answered_count >= 0),
  correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  source TEXT NOT NULL CHECK (source IN ('web','ios','mcp')),
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, practice_set_id) REFERENCES practice_sets(user_id, id),
  CHECK (id = 'AT' || no),
  CHECK (correct_count <= answered_count AND answered_count <= question_count),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
) STRICT;
CREATE INDEX practice_attempts_recent ON practice_attempts(user_id, status, started_at);

-- 本次练习实际出现的题目、修订和选项显示顺序（冻结）
CREATE TABLE practice_attempt_questions (
  user_id INTEGER NOT NULL,
  attempt_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  question_id TEXT NOT NULL,
  question_revision INTEGER NOT NULL,
  option_order TEXT NOT NULL,             -- 显示顺序，如 '3,1,4,2'（option_no 列表，仅用于复现显示）
  PRIMARY KEY (user_id, attempt_id, ordinal),
  FOREIGN KEY (user_id, attempt_id) REFERENCES practice_attempts(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, question_id, question_revision) REFERENCES question_revisions(user_id, question_id, revision)
) STRICT;
CREATE INDEX practice_attempt_questions_rev ON practice_attempt_questions(user_id, question_id, question_revision);

-- 单题作答（AN）；client_event_id 只用于离线重传去重，不对用户展示
CREATE TABLE question_answers (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  no INTEGER NOT NULL CHECK (no > 0),
  client_event_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  attempt_ordinal INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  question_revision INTEGER NOT NULL,
  selected_option_no INTEGER,             -- 单选题的选项；排列题为 ★ 位置上的选项
  is_correct INTEGER CHECK (is_correct IN (0,1)),   -- unscored 为 NULL
  elapsed_ms INTEGER CHECK (elapsed_ms >= 0),
  answered_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('web','ios','mcp')),
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, client_event_id),
  UNIQUE (user_id, attempt_id, attempt_ordinal),
  FOREIGN KEY (user_id, attempt_id, attempt_ordinal) REFERENCES practice_attempt_questions(user_id, attempt_id, ordinal) ON DELETE CASCADE,
  FOREIGN KEY (user_id, question_id, question_revision, selected_option_no) REFERENCES question_options(user_id, question_id, revision, option_no),
  CHECK (id = 'AN' || no)
) STRICT;
CREATE INDEX question_answers_by_question ON question_answers(user_id, question_id, answered_at);
CREATE INDEX question_answers_by_time ON question_answers(user_id, answered_at);

-- 排列题的完整排列（每个空填了哪个选项）
CREATE TABLE question_answer_selections (
  user_id INTEGER NOT NULL,
  answer_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position > 0),
  option_no INTEGER NOT NULL,
  PRIMARY KEY (user_id, answer_id, position),
  FOREIGN KEY (user_id, answer_id) REFERENCES question_answers(user_id, id) ON DELETE CASCADE
) STRICT;

-- ============================================================
-- 记忆复习
-- ============================================================

-- 卡片自评（MR）
CREATE TABLE memory_ratings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  no INTEGER NOT NULL CHECK (no > 0),
  client_event_id TEXT NOT NULL,
  knowledge_point_id TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('forgot','hard','remembered','easy')),
  reviewed_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('web','ios','mcp')),
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, client_event_id),
  FOREIGN KEY (user_id, knowledge_point_id) REFERENCES knowledge_points(user_id, id) ON DELETE CASCADE,
  CHECK (id = 'MR' || no)
) STRICT;
CREATE INDEX memory_ratings_by_time ON memory_ratings(user_id, reviewed_at);

-- 复习排程（替代 progress_json），每个知识点一行
CREATE TABLE review_schedules (
  user_id INTEGER NOT NULL,
  knowledge_point_id TEXT NOT NULL,
  algorithm TEXT NOT NULL CHECK (algorithm IN ('sm2-v1')),
  state TEXT NOT NULL CHECK (state IN ('new','learning','review')),
  due_at TEXT,
  interval_days REAL NOT NULL DEFAULT 0 CHECK (interval_days >= 0),
  ease REAL NOT NULL DEFAULT 2.5 CHECK (ease >= 1.3),
  review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  lapses INTEGER NOT NULL DEFAULT 0 CHECK (lapses >= 0),
  last_reviewed_at TEXT,
  legacy_correct INTEGER,                 -- 旧 progress 的混合计数，仅保留
  legacy_wrong INTEGER,
  PRIMARY KEY (user_id, knowledge_point_id),
  FOREIGN KEY (user_id, knowledge_point_id) REFERENCES knowledge_points(user_id, id) ON DELETE CASCADE
) STRICT;
CREATE INDEX review_schedules_due ON review_schedules(user_id, due_at);

-- ============================================================
-- 计划与总结
-- ============================================================

CREATE TABLE study_plans (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,                       -- PL1
  no INTEGER NOT NULL CHECK (no > 0),
  title TEXT NOT NULL,
  target_level INTEGER CHECK (target_level BETWEEN 1 AND 5),
  exam_date TEXT,
  daily_minutes INTEGER NOT NULL CHECK (daily_minutes >= 0),
  status TEXT NOT NULL CHECK (status IN ('draft','active','completed','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id),
  CHECK (id = 'PL' || no)
) STRICT;

CREATE TABLE study_plan_tasks (
  user_id INTEGER NOT NULL,
  id TEXT NOT NULL,                       -- TK1
  no INTEGER NOT NULL CHECK (no > 0),
  plan_id TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('memory_review','practice','reading','listening','manual')),
  title TEXT NOT NULL,
  target_count INTEGER NOT NULL CHECK (target_count >= 0),
  completed_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  status TEXT NOT NULL CHECK (status IN ('planned','completed','skipped')),
  practice_set_id TEXT,
  wordbook_id TEXT,
  completed_at TEXT,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, plan_id) REFERENCES study_plans(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, practice_set_id) REFERENCES practice_sets(user_id, id),
  FOREIGN KEY (user_id, wordbook_id) REFERENCES wordbooks(user_id, id),
  CHECK (id = 'TK' || no),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
) STRICT;
CREATE INDEX study_plan_tasks_today ON study_plan_tasks(user_id, scheduled_date, status);

-- 每日总结：日期就是自然编号
CREATE TABLE daily_summaries (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary_date TEXT NOT NULL,             -- 用户时区的自然日
  time_zone TEXT NOT NULL,
  answered_count INTEGER NOT NULL CHECK (answered_count >= 0),
  correct_count INTEGER NOT NULL CHECK (correct_count >= 0),
  memory_review_count INTEGER NOT NULL CHECK (memory_review_count >= 0),
  language TEXT NOT NULL REFERENCES languages(code),   -- 总结文字的语言
  summary TEXT,
  generated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, summary_date),
  CHECK (correct_count <= answered_count)
) STRICT;

CREATE TABLE daily_summary_points (
  user_id INTEGER NOT NULL,
  summary_date TEXT NOT NULL,
  point_no INTEGER NOT NULL CHECK (point_no > 0),
  kind TEXT NOT NULL CHECK (kind IN ('strength','weakness','recommendation','confusion')),
  content TEXT NOT NULL,                  -- 与所属总结同一语言
  knowledge_point_id TEXT,
  question_type_id TEXT,
  PRIMARY KEY (user_id, summary_date, point_no),
  FOREIGN KEY (user_id, summary_date) REFERENCES daily_summaries(user_id, summary_date) ON DELETE CASCADE,
  FOREIGN KEY (user_id, knowledge_point_id) REFERENCES knowledge_points(user_id, id)
) STRICT;

-- ============================================================
-- 收集箱、AI 草稿批注、按需注音
-- ============================================================

CREATE TABLE learning_captures (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,                       -- CP1
  no INTEGER NOT NULL CHECK (no > 0),
  category TEXT NOT NULL CHECK (category IN ('word','grammar','sentence','listening','other')),
  body TEXT NOT NULL,
  context TEXT,
  target_wordbook_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('inbox','processed','dismissed')),
  result_knowledge_point_id TEXT,
  result_question_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, target_wordbook_id) REFERENCES wordbooks(user_id, id),
  FOREIGN KEY (user_id, result_knowledge_point_id) REFERENCES knowledge_points(user_id, id),
  FOREIGN KEY (user_id, result_question_id) REFERENCES questions(user_id, id),
  CHECK (id = 'CP' || no)
) STRICT;
CREATE INDEX learning_captures_inbox ON learning_captures(user_id, status, created_at);

CREATE TABLE ai_draft_comments (
  user_id INTEGER NOT NULL,
  id TEXT NOT NULL,                       -- DC1
  no INTEGER NOT NULL CHECK (no > 0),
  batch_id TEXT NOT NULL,
  knowledge_point_id TEXT,
  question_id TEXT,
  body TEXT NOT NULL,                     -- 用户或 AI 写的批注，原样保存
  author TEXT NOT NULL CHECK (author IN ('user','ai')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, batch_id) REFERENCES ai_draft_batches(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, knowledge_point_id) REFERENCES knowledge_points(user_id, id),
  FOREIGN KEY (user_id, question_id) REFERENCES questions(user_id, id),
  CHECK (id = 'DC' || no),
  CHECK (knowledge_point_id IS NULL OR question_id IS NULL)
) STRICT;

-- 用户让 AI 按需添加的注音，Anki 写法：まだ 寒[さむ]い
-- 有效条件：去掉标记后 == 目标字段当前原文；不一致即过期，界面显示原文
CREATE TABLE ruby_annotations (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_code TEXT NOT NULL,              -- W12.ex2 / QV15r1 / QV15r1.opt3 / M1r1 / G3.note1
  field TEXT NOT NULL,                    -- sentence / prompt / explanation / option_text ...
  language TEXT NOT NULL REFERENCES languages(code),   -- 被注音文本的语言：原文为 ja，解析译文为 zh-Hans 等
  annotated_text TEXT NOT NULL,
  created_by TEXT NOT NULL CHECK (created_by IN ('ai','user')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, target_code, field, language)
) STRICT;

-- ============================================================
-- 跟读、市场、同步
-- ============================================================

CREATE TABLE speaking_recordings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,                       -- RC1
  no INTEGER NOT NULL CHECK (no > 0),
  question_id TEXT NOT NULL,
  question_revision INTEGER NOT NULL,
  media_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','analyzed','failed')),
  score REAL CHECK (score BETWEEN 0 AND 100),
  transcript TEXT,                        -- 识别出的日语
  feedback TEXT,                          -- AI 反馈（个人文本）
  feedback_language TEXT REFERENCES languages(code),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, question_id, question_revision) REFERENCES question_revisions(user_id, question_id, revision),
  FOREIGN KEY (user_id, media_id) REFERENCES media_files(user_id, id),
  CHECK ((feedback IS NULL) = (feedback_language IS NULL)),
  CHECK (id = 'RC' || no)
) STRICT;

-- 市场分享是全局记录：编号由 user_id=0 的计数器分配（SH1）
CREATE TABLE market_shares (
  id TEXT PRIMARY KEY,
  no INTEGER NOT NULL UNIQUE CHECK (no > 0),
  publisher_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('wordbook','practice_set')),
  title TEXT NOT NULL,
  jlpt_level INTEGER CHECK (jlpt_level BETWEEN 1 AND 5),
  item_count INTEGER NOT NULL CHECK (item_count >= 0),
  package_json TEXT NOT NULL CHECK (json_valid(package_json)),   -- 冻结导出包，唯一保留的业务 JSON
  withdrawn_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (id = 'SH' || no)
) STRICT;

CREATE TABLE market_imports (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,                       -- MI1
  no INTEGER NOT NULL CHECK (no > 0),
  share_id TEXT REFERENCES market_shares(id) ON DELETE SET NULL,   -- 分享删除后导入记录仍保留
  share_title TEXT NOT NULL,              -- 导入当时的标题快照
  target_wordbook_id TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, target_wordbook_id) REFERENCES wordbooks(user_id, id),
  CHECK (id = 'MI' || no)
) STRICT;
CREATE UNIQUE INDEX market_imports_once ON market_imports(user_id, share_id) WHERE share_id IS NOT NULL;

-- 导入包里每一项对应到本地哪条记录，重复导入时据此去重
CREATE TABLE market_import_items (
  user_id INTEGER NOT NULL,
  import_id TEXT NOT NULL,
  package_key TEXT NOT NULL,              -- 包内局部 key
  knowledge_point_id TEXT,
  question_id TEXT,
  PRIMARY KEY (user_id, import_id, package_key),
  FOREIGN KEY (user_id, import_id) REFERENCES market_imports(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, knowledge_point_id) REFERENCES knowledge_points(user_id, id),
  FOREIGN KEY (user_id, question_id) REFERENCES questions(user_id, id),
  CHECK ((knowledge_point_id IS NULL) <> (question_id IS NULL))
) STRICT;

CREATE TABLE sync_devices (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  last_synced_seq INTEGER NOT NULL DEFAULT 0 CHECK (last_synced_seq >= 0),
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (user_id, device_name)
) STRICT;

-- 只追加的变更日志，设备按 seq 增量拉取；不加外键，删除也能记录
CREATE TABLE sync_changes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL CHECK (seq > 0),
  table_name TEXT NOT NULL,
  record_code TEXT NOT NULL,              -- W12 / QV15r2 / AN3
  operation TEXT NOT NULL CHECK (operation IN ('upsert','delete')),
  changed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, seq)
) STRICT;

-- ============================================================
-- 不变性规则
-- ============================================================

-- 知识点类型决定编号前缀，创建后不可改
CREATE TRIGGER knowledge_points_kind_fixed BEFORE UPDATE OF kind, id, no ON knowledge_points
WHEN NEW.kind <> OLD.kind OR NEW.id <> OLD.id OR NEW.no <> OLD.no
BEGIN SELECT RAISE(ABORT, '知识点的类型和编号创建后不可修改'); END;

-- 题目修订一旦出现在练习记录里就冻结
CREATE TRIGGER question_revisions_frozen BEFORE UPDATE ON question_revisions
WHEN EXISTS (SELECT 1 FROM practice_attempt_questions p
  WHERE p.user_id = OLD.user_id AND p.question_id = OLD.question_id AND p.question_revision = OLD.revision)
BEGIN SELECT RAISE(ABORT, '该题目修订已被练习使用，不能修改，请新建修订'); END;

CREATE TRIGGER question_options_frozen_update BEFORE UPDATE ON question_options
WHEN EXISTS (SELECT 1 FROM practice_attempt_questions p
  WHERE p.user_id = OLD.user_id AND p.question_id = OLD.question_id AND p.question_revision = OLD.revision)
BEGIN SELECT RAISE(ABORT, '该题目修订已被练习使用，选项不能修改'); END;

CREATE TRIGGER question_options_frozen_delete BEFORE DELETE ON question_options
WHEN EXISTS (SELECT 1 FROM users u WHERE u.id = OLD.user_id)   -- 删除账号时放行
 AND EXISTS (SELECT 1 FROM practice_attempt_questions p
  WHERE p.user_id = OLD.user_id AND p.question_id = OLD.question_id AND p.question_revision = OLD.revision)
BEGIN SELECT RAISE(ABORT, '该题目修订已被练习使用，选项不能删除'); END;

-- 已使用修订的译文：不能改、不能删，只能新增语言
CREATE TRIGGER question_revision_translations_frozen_update BEFORE UPDATE ON question_revision_translations
WHEN EXISTS (SELECT 1 FROM practice_attempt_questions p
  WHERE p.user_id = OLD.user_id AND p.question_id = OLD.question_id AND p.question_revision = OLD.revision)
BEGIN SELECT RAISE(ABORT, '该题目修订已被练习使用，已有译文不能修改，请新建修订'); END;

CREATE TRIGGER question_option_translations_frozen_update BEFORE UPDATE ON question_option_translations
WHEN EXISTS (SELECT 1 FROM practice_attempt_questions p
  WHERE p.user_id = OLD.user_id AND p.question_id = OLD.question_id AND p.question_revision = OLD.revision)
BEGIN SELECT RAISE(ABORT, '该题目修订已被练习使用，已有译文不能修改，请新建修订'); END;

CREATE TRIGGER question_revision_translations_frozen_delete BEFORE DELETE ON question_revision_translations
WHEN EXISTS (SELECT 1 FROM users u WHERE u.id = OLD.user_id)   -- 删除账号时放行
 AND EXISTS (SELECT 1 FROM practice_attempt_questions p
  WHERE p.user_id = OLD.user_id AND p.question_id = OLD.question_id AND p.question_revision = OLD.revision)
BEGIN SELECT RAISE(ABORT, '该题目修订已被练习使用，已有译文不能删除'); END;

CREATE TRIGGER question_option_translations_frozen_delete BEFORE DELETE ON question_option_translations
WHEN EXISTS (SELECT 1 FROM users u WHERE u.id = OLD.user_id)   -- 删除账号时放行
 AND EXISTS (SELECT 1 FROM practice_attempt_questions p
  WHERE p.user_id = OLD.user_id AND p.question_id = OLD.question_id AND p.question_revision = OLD.revision)
BEGIN SELECT RAISE(ABORT, '该题目修订已被练习使用，已有译文不能删除'); END;

-- 练习一旦有人做过，题目清单就冻结
CREATE TRIGGER practice_set_questions_frozen_update BEFORE UPDATE ON practice_set_questions
WHEN EXISTS (SELECT 1 FROM practice_attempts a WHERE a.user_id = OLD.user_id AND a.practice_set_id = OLD.practice_set_id)
BEGIN SELECT RAISE(ABORT, '该练习已有练习记录，题目清单不能修改，请复制为新练习'); END;

CREATE TRIGGER practice_set_questions_frozen_delete BEFORE DELETE ON practice_set_questions
WHEN EXISTS (SELECT 1 FROM users u WHERE u.id = OLD.user_id)   -- 删除账号时放行
 AND EXISTS (SELECT 1 FROM practice_attempts a WHERE a.user_id = OLD.user_id AND a.practice_set_id = OLD.practice_set_id)
BEGIN SELECT RAISE(ABORT, '该练习已有练习记录，题目清单不能修改，请复制为新练习'); END;
