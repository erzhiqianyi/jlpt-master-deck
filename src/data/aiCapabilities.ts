import type { Locale } from '../types';

export type AiCapabilityId = 'capture' | 'wordbooks' | 'analyze' | 'practice' | 'plan' | 'drafts' | 'media' | 'schedule';

export type AiCapability = {
  id: AiCapabilityId;
  title: string;
  /** What the AI does, step by step. */
  body: string;
  /** What it reads from the app before acting. */
  reads: string;
  /** Where the result shows up in the app. */
  result: string;
  /** Things you can say — the first one is the canonical example. */
  prompts: string[];
  /** In-app page the result lands on. */
  href: string;
};

type T = (zh: string, ja: string, en: string) => string;

/** Single source for "what a connected AI can do" — the AI page and the home tip both read it. */
export function aiCapabilities(locale: Locale): AiCapability[] {
  const t: T = (zh, ja, en) => locale === 'zh-CN' ? zh : locale === 'ja' ? ja : en;
  return [
    {
      id: 'capture',
      title: t('随手记录，交给它整理', '思いついたらメモ、整理は任せる', 'Capture now, let it organize'),
      body: t('聊天里刚讲过的单词、句型、听不懂的句子，先让它存成一条待整理记录；之后再让它把记录补成完整词条——读音、词性、中文释义、两三个例句、易混点和记忆提示，最后归进指定的单词本并打标签。', 'チャットで出た語彙・文型・聞き取れなかった文をまず未整理メモとして保存。あとで読み・品詞・意味・例文 2〜3 個・混同しやすい点・記憶のコツを補って完全な項目にし、指定の単語帳へ入れてタグを付けます。', 'Save the word, pattern or unclear sentence from the chat as a capture first; later have it expanded into a full entry — reading, part of speech, meaning, two or three examples, confusables and a memory hint — filed into a wordbook with tags.'),
      reads: t('已有词条（避免重复）、你的单词本和标签', '既存の項目（重複回避）、単語帳とタグ', 'Existing entries (to avoid duplicates), your wordbooks and tags'),
      result: t('记录 → 「输入记录」；词条 → 对应单词本', 'メモ →「入力記録」、項目 → 該当の単語帳', 'Captures → Captures; entries → the wordbook'),
      prompts: [
        t('把刚才讲的三个单词记到我的 JLPT 单词本，加上例句和中文释义。', '今説明した 3 語を例文と中国語の意味付きで JLPT 単語帳に登録して。', 'Add the three words we just discussed to my JLPT wordbook with examples and meanings.'),
        t('我输入记录里还没整理的条目，全部补成完整词条，标签按题型分。', '未整理のメモを全部完全な項目にして、種別ごとにタグを付けて。', 'Expand every unprocessed capture into a full entry, tagged by question kind.'),
        t('「〜ならでは」和「〜だけ」的区别帮我写成一条语法记录。', '「〜ならでは」と「〜だけ」の違いを文法メモにして。', 'Write the difference between ならでは and だけ as a grammar capture.'),
      ],
      href: '#/captures',
    },
    {
      id: 'wordbooks',
      title: t('管理单词本和语法本', '単語帳・文法帳の整理', 'Organize wordbooks and grammar books'),
      body: t('新建本子、改名、把一批词条从一个本子挪到另一个、按条件批量打标签或去掉标签。它会先列出会被改动的词条数量再动手，每个词条只属于一个本子，标签可以有多个。', '帳の作成・改名、項目の一括移動、条件付きのタグ付け・削除。変更対象の件数を先に示してから実行します。各項目は 1 冊にだけ属し、タグは複数可。', 'Create and rename books, move a batch of entries between books, add or remove tags by rule. It reports how many entries will change before acting; each entry lives in one book and can carry many tags.'),
      reads: t('全部单词本、每个本子的词条和标签', 'すべての単語帳と各項目のタグ', 'All wordbooks with their entries and tags'),
      result: t('「词汇 / 语法」页的单词本列表', '「語彙 / 文法」ページの単語帳一覧', 'The wordbook list under Vocabulary / Grammar'),
      prompts: [
        t('新建一个「小说生词」单词本，把标签含「小说」的词都挪进去。', '「小説の語彙」という単語帳を作って、タグに「小説」が付いた語をそこへ移して。', 'Create a "Novel vocabulary" wordbook and move every entry tagged "novel" into it.'),
        t('把「N1 核心」里正确率低于 60% 的词单独拆成一个「N1 易错」本。', '「N1 コア」で正答率 60% 未満の語を「N1 苦手」帳に分けて。', 'Split entries under 60% accuracy in "N1 core" into a new "N1 tricky" book.'),
      ],
      href: '#/vocabulary/wordbooks',
    },
    {
      id: 'analyze',
      title: t('分析弱点和错题', '弱点と誤答の分析', 'Analyze weak points'),
      body: t('读取答题记录，按题型、模块、单词本和时间段统计正确率，找出反复出错的词条和知识点，解释为什么错（同音、近义、接续），再给出下一步：先补哪一类、练多少题、哪些词该回炉。', '解答履歴を種別・モジュール・単語帳・期間で集計し、繰り返し間違える項目を特定。誤答の理由（同音・類義・接続）を説明し、次に補う分野・問題数・復習すべき語を提案します。', 'Read your answer history, break accuracy down by kind, module, wordbook and period, find what keeps going wrong and why (homophones, near-synonyms, conjunctions), then say what to fix first, how many questions, which words to redo.'),
      reads: t('练习记录、每题的作答、复习进度', '練習履歴・各問の解答・復習進捗', 'Practice history, per-question answers, review progress'),
      result: t('聊天里的报告；也可以让它存成一条记录', 'チャット内のレポート。メモとして保存も可', 'A report in the chat; it can also be saved as a capture'),
      prompts: [
        t('看看我最近两周语法题的正确率，哪类题错得最多？', 'この 2 週間の文法問題の正答率と、いちばん間違えている種類を教えて。', 'How accurate were my grammar answers in the last two weeks, and which kind do I miss most?'),
        t('列出我错过三次以上的单词，按原因分组，每组给一个记忆方法。', '3 回以上間違えた語を原因別に分けて、それぞれ覚え方を 1 つ教えて。', 'List words I have missed three or more times, grouped by cause, with one memory trick each.'),
        t('我这周和上周比进步了吗？用数字说。', '今週は先週より伸びた？数字で教えて。', 'Did I improve this week over last? Give me numbers.'),
      ],
      href: '#/history',
    },
    {
      id: 'practice',
      title: t('生成今日练习', '今日の練習を作成', 'Generate today’s practice'),
      body: t('根据到期复习、薄弱题型和你指定的范围出一套题（选择题、假名↔汉字、释义、语法接续），控制题量和难度，直接发布成今日练习；或者在聊天里就地开一组互动小测，答完把结果写回记录。', '復習期限・弱い種別・指定範囲から問題セット（選択・かな↔漢字・意味・文法接続）を作り、量と難易度を調整して今日の練習として公開。チャット内で小テストを開き、結果を記録に書き戻すこともできます。', 'Build a set (multiple choice, kana↔kanji, meaning, grammar) from due reviews, weak kinds and the scope you name, with count and difficulty under control, and publish it as today’s practice; or run an interactive quiz in the chat and write results back.'),
      reads: t('到期词条、薄弱题型、已出过的题（避免重复）', '期限の項目・弱い種別・出題済みの問題（重複回避）', 'Due entries, weak kinds, questions already used'),
      result: t('首页「今日练习」卡片', 'ホームの「今日の練習」カード', 'The Today’s practice card on the home page'),
      prompts: [
        t('用我到期的单词出 20 道题，发布成今天的练习。', '期限が来た単語で 20 問作って、今日の練習として公開して。', 'Make 20 questions from my due words and publish them as today’s practice.'),
        t('只出「小说生词」本里的词，10 题，全部是汉字→假名。', '「小説の語彙」帳だけから 10 問、すべて漢字→かなで。', 'Only from "Novel vocabulary", 10 questions, all kanji→kana.'),
        t('现在在聊天里给我来 5 道语法题，做完告诉我错在哪。', '今ここで文法 5 問出して、終わったら間違いを解説して。', 'Give me 5 grammar questions right here and explain my mistakes after.'),
      ],
      href: '#/home',
    },
    {
      id: 'plan',
      title: t('制定和调整备考计划', '学習計画の作成と調整', 'Plan and adjust your study'),
      body: t('读取目标级别、考试日期、每周可用时间、教材和最近练习，按阶段（基础→强化→冲刺→模考）排出到考前的日历式任务；进度变化、漏做太多或换了教材时，让它在保留已完成任务的前提下重排。', '目標レベル・試験日・週の学習時間・教材・最近の練習を読み、段階（基礎→強化→直前→模試）ごとに試験までのカレンダー形式のタスクを作成。進捗の変化・未完了の増加・教材変更時は、完了分を残して組み直します。', 'Read your target level, exam date, weekly time, materials and recent practice, and lay out calendar tasks by stage (foundation → intensive → final → mocks) through to the exam; when progress shifts, tasks pile up or materials change, re-plan while keeping what is done.'),
      reads: t('计划设置、现有任务和完成情况、最近练习', '計画設定・既存タスクと完了状況・最近の練習', 'Plan settings, existing tasks and completion, recent practice'),
      result: t('「计划」页的日历和备考安排', '「計画」ページのカレンダーと予定', 'The calendar and stages on the Plan page'),
      prompts: [
        t('12 月考 N1，每周能学 6 小时，帮我排到考前的计划。', '12 月に N1 を受けます。週 6 時間で試験までの計画を立てて。', 'I take N1 in December with 6 hours a week — plan me through to the exam.'),
        t('这两周只完成了一半，把没做的往后顺延，最后一个月留给模考。', 'この 2 週間は半分しか終わっていない。未完了を後ろにずらして、最後の 1 か月は模試に。', 'I only did half these two weeks — push the rest back and keep the last month for mocks.'),
      ],
      href: '#/plan',
    },
    {
      id: 'drafts',
      title: t('复习材料先看再用', '復習教材は確認してから使う', 'Review material: preview before use'),
      body: t('让它按主题或按你的错题生成复习包（要点讲解 + 例句 + 配套题）。生成的内容先进草稿页，你可以预览、逐条批注；再让它按批注改下一版；满意后一键发布成练习。题库不会被自动覆盖。', 'テーマや誤答から復習パック（要点解説＋例文＋確認問題）を生成。まずドラフトに入り、プレビューと項目ごとのコメントが可能。コメントに沿って次の版を作らせ、納得したら練習として公開。問題庫は自動では上書きされません。', 'Have it build a review pack (key points + examples + questions) by topic or from your mistakes. It lands in Drafts first: preview, annotate line by line, ask for the next revision, then publish as practice with one tap. The bank is never overwritten automatically.'),
      reads: t('错题、相关词条、草稿里的批注', '誤答・関連項目・ドラフトのコメント', 'Mistakes, related entries, annotations in the draft'),
      result: t('「练习草稿」页，发布后进今日练习', '「練習ドラフト」ページ、公開後は今日の練習へ', 'The Drafts page; after publishing, today’s practice'),
      prompts: [
        t('按我在草稿里的批注，重写这份复习包的语法部分。', 'ドラフトのコメントに沿って、この復習パックの文法パートを書き直して。', 'Rewrite the grammar section of this review pack based on my draft comments.'),
        t('围绕「敬语」做一份复习包：讲解 + 10 道题，先放草稿我看看。', '「敬語」の復習パックを作って。解説＋10 問、まずドラフトに。', 'Make a review pack on keigo: explanation + 10 questions, into Drafts first.'),
      ],
      href: '#/drafts',
    },
    {
      id: 'media',
      title: t('听力和阅读题', '聴解・読解の問題', 'Listening and reading'),
      body: t('把在网页里上传的听力录音交给它：转写、标出你没听清的片段、解释连读和省略、抽出生词，再写成听力题存进题库。给它一段文章，它能生成带选项和解析的阅读题。', 'Web でアップロードした聴解の録音を渡すと、書き起こし・聞き取れなかった箇所の指摘・連音や省略の解説・語彙抽出を行い、聴解問題として問題庫に保存。文章を渡せば選択肢と解説付きの読解問題を作ります。', 'Hand it a recording uploaded in the app: transcript, the parts you missed, notes on liaison and ellipsis, new words, then saved as a listening question. Give it a passage and it writes reading questions with options and explanations.'),
      reads: t('待分析的录音、已有的听力/阅读题', '未分析の録音・既存の聴解/読解問題', 'Pending recordings, existing listening/reading questions'),
      result: t('「听力」「阅读」页的题库', '「聴解」「読解」ページの問題庫', 'The Listening and Reading question banks'),
      prompts: [
        t('分析我刚上传的听力录音，标出没听清的地方并解释。', 'さっきアップした録音を分析して、聞き取れなかった箇所を説明して。', 'Analyze the recording I just uploaded and explain the parts I missed.'),
        t('用这段新闻做 3 道阅读题，每题带解析，存进阅读题库。', 'このニュースで読解 3 問、解説付きで読解の問題庫に保存して。', 'Make 3 reading questions with explanations from this news piece and save them.'),
      ],
      href: '#/listening',
    },
    {
      id: 'schedule',
      title: t('定时自动跑', '定期的に自動実行', 'Run on a schedule'),
      body: t('把上面任何一件事设成定时任务：每天早上自动出今日练习，每晚把当天的记录整理成词条，每周日写一份弱点报告并生成下周复习包草稿。到点自动执行，打开网页就能看到结果。', '上のどれでも定期タスクにできます。毎朝の練習作成、毎晩のメモ整理、毎週日曜の弱点レポートと翌週の復習パック作成。時間になると自動で実行され、Web を開けば結果が見られます。', 'Turn any of the above into a scheduled task: today’s practice every morning, captures tidied every night, a weak-point report and next week’s pack every Sunday. It runs on time and the result is waiting when you open the app.'),
      reads: t('和手动一样：同一个授权、同样的数据', '手動時と同じ認可・同じデータ', 'Same grant and same data as a manual request'),
      result: t('和手动一样的位置；见「定时任务与自动化」', '手動時と同じ場所。「定期タスクと自動化」を参照', 'Same places as manual runs; see Scheduled tasks'),
      prompts: [
        t('每天早上 7 点，用我到期的单词出 20 道题并发布成今日练习。', '毎朝 7 時に期限の単語で 20 問作り、今日の練習として公開して。', 'Every day at 7am, make 20 questions from my due words and publish them as today’s practice.'),
        t('每周日晚上 8 点，统计本周正确率，写弱点报告，生成下周复习包草稿。', '毎週日曜 20 時に今週の正答率を集計し、弱点レポートと翌週の復習パックをドラフトに。', 'Every Sunday at 8pm, summarize the week, write a weak-point report and draft next week’s pack.'),
      ],
      href: '#/about/automation',
    },
  ];
}
