import type { AiCapabilityId } from '../../data/aiCapabilities';
import type { Locale } from '../../types';

type Translation = [string, string, string];
type Lesson = { steps: Translation[]; check: Translation; outcome: Translation };
const lessons: Record<AiCapabilityId, Lesson> = {
  capture: {
    steps: [
      ['把原句和不懂的地方一起交给 AI。来不及整理时，先要求保存为「输入记录」，保留上下文。', '原文と疑問点を一緒に渡します。時間がなければ、まず入力記録として保存します。', 'Share the original sentence and your question. Save a capture first if you are short on time.'],
      ['指定目标单词本或语法本，再要求补充读音、接续、释义、例句和易混点。让 AI 先查已有词条，避免重复收录。', '保存先の帳を指定し、読み・接続・意味・例文を補足。既存項目も先に確認します。', 'Name the destination book and request readings, usage, meanings and examples. Check existing entries first.'],
      ['要求实际保存，并返回词条名称和所在本子。只有聊天中的解释，还不算保存完成。', '実際の保存と、項目名・保存先の報告を依頼します。チャットの説明だけでは保存されません。', 'Ask it to save and report the entry name and destination. A chat explanation alone is not a saved entry.'],
    ],
    check: ['检查日语例句、读音和归类；有不自然的地方，指出原句让 AI 修正同一条记录。', '例文・読み・分類を確認し、不自然な点は同じ項目の修正を依頼します。', 'Check examples, readings and filing. Ask for a correction to the same entry when needed.'],
    outcome: ['保存第一条可复习的学习记录', '復習できる学習メモを保存', 'Save your first reusable study note'],
  },
  wordbooks: {
    steps: [
      ['说清整理范围：哪个本子、哪些标签、移动还是复制。先让 AI 列出匹配词条及数量。', '対象の帳・タグ・操作を指定し、まず一致する項目と件数を確認します。', 'Specify the book, tags and operation. Ask for matching entries and the count first.'],
      ['核对清单后，再要求创建目标本子并移动词条；标签可以叠加，词条的所属本子只有一个。', '一覧を確認してから移動先を作成。タグは複数、所属する帳は一つです。', 'Review the list, then create the destination and move entries. Entries have one book and may have multiple tags.'],
      ['打开目标本子核对数量，并抽查几个词条的标签和原有释义是否保留。', '移動先の件数と、タグ・意味が保持されているか確認します。', 'Open the destination, check the count and sample a few entries for preserved tags and meanings.'],
    ],
    check: ['批量修改前先看清单；条件含糊时，先缩小到几条试做。', '一括変更の前に一覧を確認し、不明確なら少数で試します。', 'Review the list before a bulk edit; try a small batch if the rule is ambiguous.'],
    outcome: ['把零散词条整理成可用的本子', '散らばった項目を帳に整理', 'Organize scattered entries into useful books'],
  },
  analyze: {
    steps: [
      ['指定时间和范围，例如「最近两周的语法练习」，让 AI 先读取实际答题记录。', '「直近 2 週間の文法」のように期間と範囲を指定します。', 'Specify a period and scope, such as grammar practice over the last two weeks.'],
      ['要求同时列出题数、答对数和正确率，再按题型与知识点分组。样本太少的项目单独标注。', '問題数・正解数・正答率を並べ、種別で集計。少数の標本は区別します。', 'Request question counts, correct answers and accuracy by type. Flag small samples.'],
      ['选择最值得补的一类，让 AI 给出具体错因和下一次练习建议；要长期保留，就另行要求保存报告。', '優先する弱点を一つ選び、原因と次の練習を相談。残すなら保存も依頼します。', 'Choose one priority weakness and request causes and next practice. Ask separately to save the report.'],
    ],
    check: ['没有记录时应先练习；让 AI 区分数据结论与推测，不要凭空补正确率。', '履歴がなければ先に練習。データと推測を分けて確認します。', 'Practice first if there are no records. Separate measured findings from guesses.'],
    outcome: ['知道下一次先补什么', '次に補う弱点がわかる', 'Know what to work on next'],
  },
  practice: {
    steps: [
      ['确定来源、级别、题型和数量，例如「到期的 N1 单词，10 道汉字读音题」。', '対象・レベル・種別・問題数を指定します。', 'Specify the source, level, question type and count.'],
      ['让 AI 读取词条与已有题目后出题，并带上正确答案与解析。不足指定数量时，先报告缺口。', '既存項目を読んでから解答・解説付きで作問。不足分は先に報告します。', 'Generate questions with answers and explanations from existing entries. Report any source shortage first.'],
      ['明确说「发布成今日练习」，然后回到今天页开始答题；只在聊天里小测时，要另外要求记录结果。', '「今日の練習として公開」と指定してホームへ。チャット内の小テストは記録も依頼します。', 'Explicitly request publishing to today’s practice. For a chat quiz, separately request result logging.'],
    ],
    check: ['出题后抽查答案与解析；生成了题目不等于已经发布。', '解答と解説を確認。生成と公開は別の操作です。', 'Sample the answers and explanations. Generation and publication are separate actions.'],
    outcome: ['得到一组范围明确的练习', '範囲の決まった練習を作成', 'Create a focused practice set'],
  },
  plan: {
    steps: [
      ['提供考试日期、每周可学天数、每天时长，以及教材学到的位置。', '試験日・週の日数・一日の時間・教材の進み具合を伝えます。', 'Provide your exam date, days per week, daily time and textbook progress.'],
      ['让 AI 先读取现有计划和完成记录，再按基础、强化、冲刺安排任务；明确为模考留出时间。', '既存の計画と完了状況を読み、段階別に配分。模試の時間も確保します。', 'Read the existing plan and completions, then allocate phases and reserve mock-exam time.'],
      ['核对每天是否做得完，再保存计划。需要调整时，只重排未完成任务，保留已完成记录。', '一日の量を確認して保存。調整時は未完了分だけを変更します。', 'Check the daily workload before saving. Reschedule unfinished tasks while preserving completed work.'],
    ],
    check: ['计划的价值在于能执行；若连续几天做不完，先减量再重排。', '実行できる量が大切です。遅れが続く場合は量を減らします。', 'A plan must be doable. Reduce the workload if you repeatedly fall behind.'],
    outcome: ['把备考目标变成每天的任务', '目標を毎日の課題にする', 'Turn an exam goal into daily tasks'],
  },
  drafts: {
    steps: [
      ['指定主题或错题范围，同时说明要「讲解＋例句＋配套题」，先保存为草稿。', 'テーマと構成（解説・例文・問題）を指定し、まずドラフトに保存します。', 'Specify the topic and contents: explanation, examples and questions. Save a draft first.'],
      ['在练习草稿中预览，逐条批注不清楚、不自然或难度不合适的内容。', 'ドラフトをプレビューし、不明点や難易度についてコメントします。', 'Preview the draft and annotate unclear wording or unsuitable difficulty.'],
      ['让 AI 读取批注并生成下一版，核对修改后再发布为练习。', 'コメントを読んで次の版を作成し、確認後に公開します。', 'Ask it to read annotations, produce a revision and publish after review.'],
    ],
    check: ['明确区分「保存草稿」与「发布练习」，避免把未核对的材料当成正式题目。', 'ドラフト保存と練習公開を区別し、確認前の教材を使わないようにします。', 'Keep saving drafts separate from publishing reviewed practice.'],
    outcome: ['先审阅，再使用 AI 生成的材料', 'AI 教材を確認してから使う', 'Review generated material before using it'],
  },
  media: {
    steps: [
      ['听力先在网页上传录音并告知 AI 对应名称；阅读则提供完整文章和目标级别。', '聴解は音声をアップロードし名前を伝え、読解は全文とレベルを渡します。', 'Upload audio and identify it by name, or provide the full reading passage and level.'],
      ['听力先确认转写，听不清的片段标出时间；阅读先确认文章事实，再生成问题、选项和解析。', '音声は文字起こしと不明箇所の時間を確認。読解は内容を確認してから作問します。', 'Review the transcript and unclear timestamps, or verify passage facts before generating questions.'],
      ['要求把题目保存到对应题库并关联原文或录音；回到网页试听、预览，再实际做一次。', '原文・音声に紐付けて保存し、Web で試聴・プレビューします。', 'Save questions with their source passage or audio, then preview and try them on the website.'],
    ],
    check: ['音频能否被读取和转写取决于客户端能力；听不清的内容应保留待核对，不能猜成定稿。', '音声処理はクライアントによります。不明箇所は推測せず要確認のまま残します。', 'Audio access and transcription depend on the client. Leave unclear speech for review rather than guessing.'],
    outcome: ['把原始材料变成有解析的题目', '素材を解説付きの問題にする', 'Turn source material into explained questions'],
  },
  schedule: {
    steps: [
      ['先手动执行一次提示词，确认能读取数据并把结果保存到正确位置。', 'まず手動で一度実行し、読み取りと保存先を確認します。', 'Run the prompt manually once and verify reading and saving work.'],
      ['在支持定时运行的 AI 客户端中设置频率、时区、题量和输出位置。', '定期実行対応の AI で頻度・タイムゾーン・量・保存先を設定します。', 'Set frequency, timezone, count and destination in a client that supports scheduling.'],
      ['第一次运行后检查结果和执行记录；暂停任务在客户端操作，撤销授权在本站操作。', '初回の結果と実行履歴を確認。停止はクライアント、認可取り消しはこのサイトで行います。', 'Inspect the first result and run history. Pause in the client; revoke access on this site.'],
    ],
    check: ['本站提供 MCP 数据访问，不负责唤醒客户端；授权失效后任务可能仍触发，但无法继续访问本站。', 'このサイトは MCP を提供し、クライアントの起動は行いません。認可失効後はアクセスできません。', 'This site provides MCP access, not the scheduler. A job may still trigger after revocation but cannot access the site.'],
    outcome: ['把可靠的流程变成定时任务', '確認済みの手順を定期実行', 'Schedule a workflow that already works'],
  },
};
export function guideLesson(id: AiCapabilityId, locale: Locale) {
  const pick = (value: Translation) => value[locale === 'zh-CN' ? 0 : locale === 'ja' ? 1 : 2];
  const lesson = lessons[id];
  return { steps: lesson.steps.map(pick), check: pick(lesson.check), outcome: pick(lesson.outcome) };
}
