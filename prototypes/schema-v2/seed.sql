-- 最小样例数据：每张表至少一行，足够跑通 demo.mjs 的完整流程。
-- 时间统一为 UTC；“今天”是 2026-10-08（Asia/Tokyo）。
BEGIN;

-- 编号前缀
-- 支持的语言：按 JLPT 主要考生来源选取；繁体缺译回退简体，其余回退英语
-- 译文由用户自己的 AI 通过 MCP（list_missing_translations / set_translation）补齐
INSERT INTO languages (code, native_name, fallback_code, enabled) VALUES
  ('ja','日本語',NULL,1),
  ('zh-Hans','简体中文',NULL,1),
  ('en','English',NULL,1),
  ('zh-Hant','繁體中文','zh-Hans',1),
  ('ko','한국어','en',1),
  ('vi','Tiếng Việt','en',1),
  ('id','Bahasa Indonesia','en',1),
  ('th','ไทย','en',1),
  ('my','မြန်မာ','en',1),
  ('ne','नेपाली','en',1),
  ('es','Español','en',1),
  ('fr','Français','en',1);

-- 编号前缀；显示名由应用 i18n 按 label_key 提供
INSERT INTO business_types (prefix, table_name, label_key) VALUES
  ('WB','wordbooks','type.wordbook'),
  ('W','knowledge_points','type.word'), ('G','knowledge_points','type.grammar'), ('N','knowledge_points','type.name'),
  ('AU','media_files','type.audio'), ('IM','media_files','type.image'), ('RF','media_files','type.recordingFile'),
  ('M','question_materials','type.material'),
  ('QV','questions','type.vocabularyQuestion'), ('QG','questions','type.grammarQuestion'), ('QR','questions','type.readingQuestion'), ('QL','questions','type.listeningQuestion'),
  ('DP','practice_sets','type.dailyPractice'), ('MX','practice_sets','type.mockExam'), ('TP','practice_sets','type.topicPractice'), ('MP','practice_sets','type.manualPractice'),
  ('AT','practice_attempts','type.attempt'), ('AN','question_answers','type.answer'), ('MR','memory_ratings','type.memoryRating'),
  ('PL','study_plans','type.plan'), ('TK','study_plan_tasks','type.task'),
  ('CP','learning_captures','type.capture'), ('DR','ai_draft_batches','type.draftBatch'), ('DC','ai_draft_comments','type.draftComment'),
  ('RC','speaking_recordings','type.recording'), ('SH','market_shares','type.share'), ('MI','market_imports','type.import');

INSERT INTO users (id, display_name, created_at) VALUES
  (0, '系统（全局编号）', '2026-01-01T00:00:00Z'),
  (1, '学习者', '2026-09-01T00:00:00Z'),
  (2, '分享者', '2026-09-15T00:00:00Z');

-- 计数器 = 各前缀当前已用的最大序号
INSERT INTO id_sequences (user_id, prefix, last_no) VALUES
  (1,'WB',2),(1,'DR',1),(1,'W',4),(1,'G',1),(1,'N',1),(1,'IM',1),(1,'AU',1),(1,'RF',1),(1,'M',1),
  (1,'QV',2),(1,'QG',2),(1,'QL',1),(1,'DP',1),(1,'MX',1),(1,'AT',1),(1,'AN',1),(1,'MR',2),
  (1,'PL',1),(1,'TK',3),(1,'CP',1),(1,'DC',1),(1,'RC',1),
  (2,'WB',1),(2,'W',1),
  (0,'SH',1);

INSERT INTO legacy_references (user_id, legacy_code, new_code) VALUES
  (1,'IT101','W1'), (1,'QU45','QV1'), (1,'DR947','DR1');

INSERT INTO user_settings (user_id, time_zone, ui_language, explanation_language, target_level, show_ruby, show_romaji, daily_review_limit, updated_at) VALUES
  (1,'Asia/Tokyo','zh-Hans','zh-Hans',2,1,1,50,'2026-09-01T00:00:00Z'),
  (2,'America/Los_Angeles','en','en',4,0,1,30,'2026-09-15T00:00:00Z');

-- 单词本
INSERT INTO wordbooks (user_id, id, no, title, is_default, created_at, updated_at) VALUES
  (1,'WB1',1,'N2 核心词汇',1,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
  (1,'WB2',2,'语法・句型',0,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
  (2,'WB1',1,'共享词汇',1,'2026-09-15T00:00:00Z','2026-09-15T00:00:00Z');

INSERT INTO ai_draft_batches (user_id, id, no, title, status, requested_via, created_at) VALUES
  (1,'DR1',1,'AI 生成：頑張る 词条与练习题','reviewing','mcp','2026-10-07T13:00:00Z');

-- 知识点：romaji 由读音生成；G1 是经校验的自定义写法（助词 は 读 wa）
INSERT INTO knowledge_points (user_id,id,no,kind,wordbook_id,expression,reading,romaji,romaji_key,romaji_custom,jlpt_level,status,origin,verified,ai_draft_batch_id,created_at,updated_at) VALUES
  (1,'W1',1,'word','WB1','食べる','たべる','taberu','taberu',0,5,'active','manual',1,NULL,'2026-09-02T00:00:00Z','2026-09-02T00:00:00Z'),
  (1,'W2',2,'word','WB1','学校','がっこう','gakkou','gakko',0,5,'active','manual',1,NULL,'2026-09-02T00:00:00Z','2026-09-02T00:00:00Z'),
  (1,'W3',3,'word','WB1','ファイル','ファイル','fairu','fairu',0,4,'active','seed',1,NULL,'2026-09-03T00:00:00Z','2026-09-03T00:00:00Z'),
  (1,'N1',1,'name','WB1','東京','とうきょう','toukyou','tokyo',0,5,'active','seed',1,NULL,'2026-09-03T00:00:00Z','2026-09-03T00:00:00Z'),
  (1,'G1',1,'grammar','WB2','～とはいえ','～とはいえ','~to wa ie','towaie',1,2,'active','manual',1,NULL,'2026-09-05T00:00:00Z','2026-09-05T00:00:00Z'),
  (1,'W4',4,'word','WB1','頑張る','がんばる','ganbaru','ganbaru',0,4,'draft','ai',0,'DR1','2026-10-07T13:00:00Z','2026-10-07T13:00:00Z'),
  (2,'W1',1,'word','WB1','猫','ねこ','neko','neko',0,5,'active','manual',1,NULL,'2026-09-15T00:00:00Z','2026-09-15T00:00:00Z');

INSERT INTO knowledge_point_translations (user_id, knowledge_point_id, language, origin, verified, updated_at, explanation, usage_note, exam_tip) VALUES
  (1,'W1','zh-Hans','manual',1,'2026-09-02T00:00:00Z','一段动词，表示吃。',NULL,NULL),
  (1,'W1','en','ai',0,'2026-09-02T00:00:00Z','Ichidan verb meaning "to eat".',NULL,NULL),
  (1,'W2','zh-Hans','manual',1,'2026-09-02T00:00:00Z','学校。',NULL,'读音题常考促音。'),
  (1,'G1','zh-Hans','manual',1,'2026-09-05T00:00:00Z','虽说……但是。',NULL,'常见于语法形式判断题。'),
  (1,'W4','zh-Hans','ai',0,'2026-10-07T13:00:00Z','努力、坚持。',NULL,NULL),
  (2,'W1','en','manual',1,'2026-09-15T00:00:00Z','Cat.',NULL,NULL);

INSERT INTO knowledge_meanings (user_id, knowledge_point_id, meaning_no, part_of_speech) VALUES
  (1,'W1',1,'verb'), (1,'W2',1,'noun'), (1,'W3',1,'noun'), (1,'N1',1,'noun'),
  (1,'G1',1,'expression'), (1,'W4',1,'verb'), (2,'W1',1,'noun');

-- 释义：同一义项可以有中文、英文、日语（国语辞典式）释义
INSERT INTO knowledge_meaning_translations (user_id, knowledge_point_id, meaning_no, language, origin, verified, updated_at, meaning) VALUES
  (1,'W1',1,'zh-Hans','manual',1,'2026-09-02T00:00:00Z','吃'),
  (1,'W1',1,'en','manual',1,'2026-09-02T00:00:00Z','to eat'),
  (1,'W1',1,'ja','ai',0,'2026-09-02T00:00:00Z','食べ物を口に入れ、かんで飲み込む。'),
  (1,'W2',1,'zh-Hans','manual',1,'2026-09-02T00:00:00Z','学校'),
  (1,'W2',1,'en','manual',1,'2026-09-02T00:00:00Z','school'),
  (1,'W3',1,'zh-Hans','import',1,'2026-09-03T00:00:00Z','文件'),
  (1,'N1',1,'zh-Hans','import',1,'2026-09-03T00:00:00Z','东京（地名）'),
  (1,'G1',1,'zh-Hans','manual',1,'2026-09-05T00:00:00Z','虽说……但是'),
  (1,'G1',1,'en','ai',0,'2026-09-05T00:00:00Z','although; that said'),
  (1,'W4',1,'zh-Hans','ai',0,'2026-10-07T13:00:00Z','努力；加油'),
  (2,'W1',1,'en','manual',1,'2026-09-15T00:00:00Z','cat');

INSERT INTO knowledge_examples (user_id, knowledge_point_id, example_no, meaning_no, sentence, source) VALUES
  (1,'W1',1,1,'毎朝パンを食べます。','manual'),
  (1,'G1',1,1,'春とはいえ、まだ寒い。','exam'),
  (1,'W4',1,1,'試験まで頑張ります。','ai');

INSERT INTO knowledge_example_translations (user_id, knowledge_point_id, example_no, language, origin, verified, updated_at, translation) VALUES
  (1,'W1',1,'zh-Hans','manual',1,'2026-09-02T00:00:00Z','每天早上吃面包。'),
  (1,'W1',1,'en','ai',0,'2026-09-02T00:00:00Z','I eat bread every morning.'),
  (1,'G1',1,'zh-Hans','manual',1,'2026-09-05T00:00:00Z','虽说是春天，但还是很冷。'),
  (1,'W4',1,'zh-Hans','ai',0,'2026-10-07T13:00:00Z','考试前我会努力。');

INSERT INTO knowledge_forms (user_id, knowledge_point_id, form_code, expression, reading, romaji) VALUES
  (1,'W1','polite','食べます','たべます','tabemasu'),
  (1,'W1','negative','食べない','たべない','tabenai'),
  (1,'W1','te','食べて','たべて','tabete');

INSERT INTO knowledge_notes (user_id, knowledge_point_id, note_no, kind, label, related_knowledge_point_id) VALUES
  (1,'G1',1,'pattern','名詞／普通形＋とはいえ',NULL),
  (1,'W1',1,'comparison','召し上がる',NULL),
  (1,'W2',1,'memory',NULL,NULL);

INSERT INTO knowledge_note_translations (user_id, knowledge_point_id, note_no, language, origin, verified, updated_at, body) VALUES
  (1,'G1',1,'zh-Hans','manual',1,'2026-09-05T00:00:00Z','表示让步：承认前项，但后项与预期不同。偏书面语。'),
  (1,'W1',1,'zh-Hans','manual',1,'2026-09-02T00:00:00Z','「召し上がる」是「食べる」的尊敬语。'),
  (1,'W1',1,'en','ai',0,'2026-09-02T00:00:00Z','"Meshiagaru" is the honorific form of "taberu".'),
  (1,'W2',1,'zh-Hans','manual',1,'2026-09-02T00:00:00Z','注意促音：がっこう，不是がこう。');

INSERT INTO knowledge_tags (user_id, knowledge_point_id, tag) VALUES
  (1,'W1','动词'), (1,'W1','N5'), (1,'W2','N5'), (1,'G1','让步');

-- 媒体
INSERT INTO media_files (user_id, id, no, kind, mime, byte_size, sha256, storage_key, duration_ms, created_at) VALUES
  (1,'IM1',1,'image','image/png',20480,'aa11','users/1/images/IM1.png',NULL,'2026-09-02T00:00:00Z'),
  (1,'AU1',1,'audio','audio/mpeg',96000,'bb22','users/1/audio/AU1.mp3',6000,'2026-09-10T00:00:00Z'),
  (1,'RF1',1,'recording','audio/m4a',32000,'cc33','users/1/recordings/RF1.m4a',2500,'2026-10-07T12:00:00Z');

INSERT INTO knowledge_images (user_id, knowledge_point_id, media_id, ordinal, show_on_card) VALUES
  (1,'W1','IM1',1,1);

-- 题目素材
INSERT INTO question_materials (user_id, id, no, revision, kind, title, body, audio_media_id, created_at) VALUES
  (1,'M1',1,1,'listening_script','聴解・会話','男：明日、何時に学校へ行きますか。
女：八時です。','AU1','2026-09-10T00:00:00Z');

INSERT INTO question_material_translations (user_id, material_id, revision, language, origin, verified, updated_at, title, translation) VALUES
  (1,'M1',1,'zh-Hans','manual',1,'2026-09-10T00:00:00Z','听力・对话','男：明天几点去学校？女：八点。'),
  (1,'M1',1,'en','ai',0,'2026-09-10T00:00:00Z','Listening: conversation','M: What time are you going to school tomorrow? F: Eight o''clock.');

-- 题目（questions → question_revisions 的外键延迟到提交时检查）
INSERT INTO questions (user_id, id, no, type_id, current_revision, status, origin, verified, ai_draft_batch_id, created_at, updated_at) VALUES
  (1,'QV1',1,'vocabulary-kanji-reading',1,'active','manual',1,NULL,'2026-09-05T00:00:00Z','2026-09-05T00:00:00Z'),
  (1,'QG1',1,'grammar-form',1,'active','manual',1,NULL,'2026-09-05T00:00:00Z','2026-09-05T00:00:00Z'),
  (1,'QG2',2,'grammar-composition',1,'active','manual',1,NULL,'2026-09-06T00:00:00Z','2026-09-06T00:00:00Z'),
  (1,'QL1',1,'listening-points',1,'active','manual',1,NULL,'2026-09-10T00:00:00Z','2026-09-10T00:00:00Z'),
  (1,'QV2',2,'vocabulary-context',1,'draft','ai',0,'DR1','2026-10-07T13:00:00Z','2026-10-07T13:00:00Z');

INSERT INTO question_revisions (user_id, question_id, revision, jlpt_level, answer_mode, instruction, prompt, prompt_target, star_position, material_id, material_revision, created_at) VALUES
  (1,'QV1',1,5,'single','＿＿の言葉の読み方として最もよいものを選びなさい。','明日、学校へ行きます。','学校',NULL,NULL,NULL,'2026-09-05T00:00:00Z'),
  (1,'QG1',1,2,'single','（　　）に入れるのに最もよいものを選びなさい。','春（　　）、まだ寒い日が続いている。',NULL,NULL,NULL,NULL,'2026-09-05T00:00:00Z'),
  (1,'QG2',1,3,'arrangement','★に入る最もよいものを選びなさい。','彼は ＿＿ ＿＿ ★ ＿＿ 人だ。',NULL,3,NULL,NULL,'2026-09-06T00:00:00Z'),
  (1,'QL1',1,5,'single',NULL,'女の人は何時に学校へ行きますか。',NULL,NULL,'M1',1,'2026-09-10T00:00:00Z'),
  (1,'QV2',1,4,'single','（　　）に入れるのに最もよいものを選びなさい。','試験に合格するために毎日（　　）います。',NULL,NULL,NULL,NULL,'2026-10-07T13:00:00Z');

INSERT INTO question_revision_translations (user_id, question_id, revision, language, origin, verified, updated_at, explanation, memory_point) VALUES
  (1,'QV1',1,'zh-Hans','manual',1,'2026-09-05T00:00:00Z','「学校」读作がっこう，注意促音。','促音っ 不能漏。'),
  (1,'QV1',1,'en','ai',0,'2026-09-05T00:00:00Z','学校 is read がっこう; note the small っ.',NULL),
  (1,'QG1',1,'zh-Hans','manual',1,'2026-09-05T00:00:00Z','「とはいえ」表示让步：虽说是春天，但仍然很冷。',NULL),
  (1,'QG2',1,'zh-Hans','manual',1,'2026-09-06T00:00:00Z','正确语序：彼はいつも約束を必ず守る人だ。★处是「必ず」。',NULL),
  (1,'QL1',1,'zh-Hans','manual',1,'2026-09-10T00:00:00Z','女性回答「八時です」。',NULL),
  (1,'QV2',1,'zh-Hans','ai',0,'2026-10-07T13:00:00Z','「頑張っています」表示一直在努力。',NULL);

INSERT INTO question_options (user_id, question_id, revision, option_no, option_text, is_correct, correct_position) VALUES
  (1,'QV1',1,1,'がっこう',1,NULL),
  (1,'QV1',1,2,'がこう',0,NULL),
  (1,'QV1',1,3,'がっこ',0,NULL),
  (1,'QV1',1,4,'ごっこう',0,NULL),
  (1,'QG1',1,1,'とはいえ',1,NULL),
  (1,'QG1',1,2,'からこそ',0,NULL),
  (1,'QG1',1,3,'ばかりか',0,NULL),
  (1,'QG1',1,4,'にしては',0,NULL),
  (1,'QG2',1,1,'必ず',0,3),
  (1,'QG2',1,2,'約束を',0,2),
  (1,'QG2',1,3,'守る',0,4),
  (1,'QG2',1,4,'いつも',0,1),
  (1,'QL1',1,1,'七時',0,NULL),
  (1,'QL1',1,2,'八時',1,NULL),
  (1,'QL1',1,3,'九時',0,NULL),
  (1,'QL1',1,4,'十時',0,NULL),
  (1,'QV2',1,1,'頑張って',1,NULL),
  (1,'QV2',1,2,'食べて',0,NULL),
  (1,'QV2',1,3,'休んで',0,NULL),
  (1,'QV2',1,4,'遊んで',0,NULL);

INSERT INTO question_option_translations (user_id, question_id, revision, option_no, language, origin, verified, updated_at, analysis) VALUES
  (1,'QV1',1,2,'zh-Hans','manual',1,'2026-09-05T00:00:00Z','漏掉了促音っ。'),
  (1,'QV1',1,3,'zh-Hans','manual',1,'2026-09-05T00:00:00Z','漏掉了长音う。'),
  (1,'QV1',1,4,'zh-Hans','manual',1,'2026-09-05T00:00:00Z','元音错误。'),
  (1,'QG1',1,2,'zh-Hans','manual',1,'2026-09-05T00:00:00Z','表示强调原因，不表示让步。'),
  (1,'QG1',1,3,'zh-Hans','manual',1,'2026-09-05T00:00:00Z','表示递进“不仅……而且”。'),
  (1,'QG1',1,4,'zh-Hans','manual',1,'2026-09-05T00:00:00Z','表示与标准不符“作为……来说”。'),
  (1,'QV1',1,2,'en','ai',0,'2026-09-05T00:00:00Z','Missing the small っ.');

INSERT INTO question_knowledge_points (user_id, question_id, revision, knowledge_point_id, role) VALUES
  (1,'QV1',1,'W2','target'),
  (1,'QG1',1,'G1','target'),
  (1,'QL1',1,'W2','related'),
  (1,'QV2',1,'W4','target');

-- 练习
INSERT INTO practice_sets (user_id, id, no, kind, title, practice_date, time_limit_minutes, status, origin, note, note_language, created_at, updated_at) VALUES
  (1,'DP1',1,'daily','10月8日 每日练习','2026-10-08',NULL,'ready','ai','根据昨天的错题和到期复习生成。','zh-Hans','2026-10-07T22:00:00Z','2026-10-07T22:00:00Z'),
  (1,'MX1',1,'mock','聴解小测','2026-10-08',10,'ready','manual',NULL,NULL,'2026-10-01T00:00:00Z','2026-10-01T00:00:00Z');

INSERT INTO practice_set_questions (user_id, practice_set_id, ordinal, section_title, question_id, question_revision, selection_reason) VALUES
  (1,'DP1',1,NULL,'QV1',1,'history_wrong'),
  (1,'DP1',2,NULL,'QG1',1,'weakness'),
  (1,'DP1',3,NULL,'QG2',1,'coverage'),
  (1,'MX1',1,'聴解','QL1',1,'manual');

-- 昨天的一次复习：QV1 答错（QV1 r1 因此已冻结）
INSERT INTO practice_attempts (user_id, id, no, practice_set_id, mode, status, started_at, deadline_at, completed_at, question_count, answered_count, correct_count, source) VALUES
  (1,'AT1',1,NULL,'review','completed','2026-10-07T12:00:00Z',NULL,'2026-10-07T12:01:00Z',1,1,0,'ios');

INSERT INTO practice_attempt_questions (user_id, attempt_id, ordinal, question_id, question_revision, option_order) VALUES
  (1,'AT1',1,'QV1',1,'2,4,1,3');

INSERT INTO question_answers (user_id, id, no, client_event_id, attempt_id, attempt_ordinal, question_id, question_revision, selected_option_no, is_correct, elapsed_ms, answered_at, source) VALUES
  (1,'AN1',1,'ios-7f3c-0001','AT1',1,'QV1',1,2,0,8200,'2026-10-07T12:00:30Z','ios');

INSERT INTO question_answer_selections (user_id, answer_id, position, option_no) VALUES
  (1,'AN1',1,2);   -- 单选题通常不需要；这里只为让每张表都有样例

-- 记忆复习
INSERT INTO memory_ratings (user_id, id, no, client_event_id, knowledge_point_id, rating, reviewed_at, source) VALUES
  (1,'MR1',1,'ios-7f3c-0002','W1','remembered','2026-10-07T11:00:00Z','ios'),
  (1,'MR2',2,'ios-7f3c-0003','W2','forgot','2026-10-07T11:01:00Z','ios');

INSERT INTO review_schedules (user_id, knowledge_point_id, algorithm, state, due_at, interval_days, ease, review_count, lapses, last_reviewed_at, legacy_correct, legacy_wrong) VALUES
  (1,'W1','sm2-v1','review','2026-10-08T00:00:00Z',3,2.5,4,0,'2026-10-07T11:00:00Z',NULL,NULL),
  (1,'W2','sm2-v1','learning','2026-10-07T11:11:00Z',0,2.3,2,1,'2026-10-07T11:01:00Z',3,2),
  (1,'G1','sm2-v1','review','2026-10-10T00:00:00Z',5,2.6,6,0,'2026-10-05T00:00:00Z',NULL,NULL),
  (1,'N1','sm2-v1','new',NULL,0,2.5,0,0,NULL,NULL,NULL);

-- 计划
INSERT INTO study_plans (user_id, id, no, title, target_level, exam_date, daily_minutes, status, created_at, updated_at) VALUES
  (1,'PL1',1,'N2 备考计划',2,'2026-12-06',60,'active','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z');

INSERT INTO study_plan_tasks (user_id, id, no, plan_id, scheduled_date, kind, title, target_count, completed_count, status, practice_set_id, wordbook_id, completed_at) VALUES
  (1,'TK1',1,'PL1','2026-10-07','memory_review','复习到期卡片',2,2,'completed',NULL,'WB1','2026-10-07T11:01:00Z'),
  (1,'TK2',2,'PL1','2026-10-08','memory_review','复习到期卡片',2,0,'planned',NULL,'WB1',NULL),
  (1,'TK3',3,'PL1','2026-10-08','practice','完成每日练习 DP1',3,0,'planned','DP1',NULL,NULL);

INSERT INTO daily_summaries (user_id, summary_date, time_zone, answered_count, correct_count, memory_review_count, language, summary, generated_at) VALUES
  (1,'2026-10-07','Asia/Tokyo',1,0,2,'zh-Hans','昨天答题 1 道，读音题漏了促音；复习卡片 2 张。','2026-10-07T15:00:00Z');

INSERT INTO daily_summary_points (user_id, summary_date, point_no, kind, content, knowledge_point_id, question_type_id) VALUES
  (1,'2026-10-07',1,'weakness','「学校」的促音容易漏掉','W2','vocabulary-kanji-reading'),
  (1,'2026-10-07',2,'recommendation','今天做一组含促音的读音题',NULL,'vocabulary-kanji-reading');

-- 收集箱、草稿批注
INSERT INTO learning_captures (user_id, id, no, category, body, context, target_wordbook_id, status, created_at, updated_at) VALUES
  (1,'CP1',1,'grammar','今日は暑いとはいえ、風は涼しい。','NHK 新闻里看到的句子','WB2','inbox','2026-10-07T09:00:00Z','2026-10-07T09:00:00Z');

INSERT INTO ai_draft_comments (user_id, id, no, batch_id, knowledge_point_id, question_id, body, author, created_at) VALUES
  (1,'DC1',1,'DR1','W4',NULL,'例句再加一个口语用法。','user','2026-10-07T14:00:00Z');

-- 用户让 AI 加的注音（Anki 写法）
INSERT INTO ruby_annotations (user_id, target_code, field, language, annotated_text, created_by, created_at) VALUES
  (1,'G1.ex1','sentence','ja','春[はる]とはいえ、まだ 寒[さむ]い。','ai','2026-10-07T14:30:00Z'),
  (1,'QV1r1','explanation','zh-Hans','「 学校[がっこう]」读作がっこう，注意促音。','ai','2026-10-07T14:31:00Z');

-- 跟读
INSERT INTO speaking_recordings (user_id, id, no, question_id, question_revision, media_id, status, score, transcript, feedback, feedback_language, created_at) VALUES
  (1,'RC1',1,'QL1',1,'RF1','analyzed',82,'八時です。','「八時」发音清楚，「です」的尾音可以更轻。','zh-Hans','2026-10-07T12:00:00Z');

-- 市场：用户 2 分享了一个单词本
INSERT INTO market_shares (id, no, publisher_user_id, kind, title, jlpt_level, item_count, package_json, created_at) VALUES
  ('SH1',1,2,'wordbook','日常动物词',5,1,
   '{"schemaVersion":2,"items":[{"key":"cat","kind":"word","expression":"猫","reading":"ねこ","meanings":[{"translations":{"en":"cat","zh-Hans":"猫"}}]}]}',
   '2026-09-20T00:00:00Z');

-- 同步
INSERT INTO sync_devices (user_id, device_name, last_synced_seq, last_seen_at) VALUES
  (1,'iPhone',2,'2026-10-07T12:01:00Z');

INSERT INTO sync_changes (user_id, seq, table_name, record_code, operation, changed_at) VALUES
  (1,1,'question_answers','AN1','upsert','2026-10-07T12:00:30Z'),
  (1,2,'practice_attempts','AT1','upsert','2026-10-07T12:01:00Z'),
  (1,3,'knowledge_points','W4','upsert','2026-10-07T13:00:00Z');

COMMIT;
