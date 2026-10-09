// 練習（v3）画面の表示文字。
import type { Locale } from '../../types';
import type { QuestionModule } from '../../v3/types';

const zh = {
  module: { vocabulary: '词汇', grammar: '语法', reading: '阅读', listening: '听力' } as Record<QuestionModule, string>,
  practiceTitle: (m: string | null) => (m ? `${m}练习` : '综合练习'), start: '开始练习', starting: '准备题目…', resume: '继续上次的练习', count: '题数', type: '题型', allTypes: '全部题型',
  level: '等级', anyLevel: '不限等级', onlyDue: '只练到期复习的知识点', excludeCorrect: '跳过已经答对的题', wordbook: '单词本', anyWordbook: '全部单词本',
  noQuestions: '没有符合条件的可用题目。题目要先通过审查才会出现在练习里。', practiceSets: '练习', daily: '每日练习', topic: '专项练习', mock: '模拟考试', mixed: '综合',
  noSets: '还没有练习。可以让 AI 按你的情况出题（create_practice_set）。', recent: '最近的练习', history: '练习记录', mistakes: '错题', stats: '学习统计', cards: '记忆卡片',
  questionOf: (i: number, n: number) => `第 ${i} 题 / 共 ${n} 题`, previous: '上一题', next: '下一题', finish: '结束练习', finishConfirm: '还有没答的题，确定结束吗？',
  submit: '提交', answerPlaceholder: '输入你听到的内容', correct: '回答正确', wrong: '回答错误', notScored: '已记录（不计分）', yourAnswer: '你的答案', rightAnswer: '正确答案',
  expected: '参考答案', explanation: '解析', evidence: '依据', translation: '译文', transcript: '听力原文', recordingLater: '这个浏览器不能录音，可以在 iOS 上跟读；这里先跳过。', skip: '跳过', recordStart: '开始录音', uploadingRecording: '正在上传录音…',
  summary: '练习结果', score: (c: number, n: number) => `答对 ${c} / ${n}`, backToHub: '返回', review: '查看解析', retryWrong: '再练错题', resultHidden: '结束后显示答案和解析',
  answeredAt: '作答时间', elapsed: '用时', empty: '没有记录', loading: '读取中…', loadError: '读取失败', minutes: (n: number) => `${n} 分钟`,
  sectionCount: (n: number) => `${n} 个部分`, questions: (n: number) => `${n} 题`, completed: (n: number) => `完成 ${n} 次`, inProgress: '进行中', done: '已完成',
  reports: '学习日报', inbox: '收集箱', mistakeChosen: '当时选', mistakeCorrect: '正确', practiceAgain: '练这些错题', open: '打开',
  // 卡片
  cardsTitle: '记忆卡片', dueCount: (d: number, n: number) => `待复习 ${d} · 新卡 ${n}`, show: '显示答案', forgot: '忘记了', hard: '有点难', remembered: '记得', easy: '很简单',
  cardsDone: '今天的卡片都复习完了', nextReview: '下次复习', exit: '退出',
  // 统计
  accuracy: '正确率', answered: '作答', ratings: '卡片自评', streak: (n: number) => `连续 ${n} 天`, today: '今天', byType: '各题型', knowledgeStates: '知识点状态',
  states: { new: '未学', learning: '学习中', review: '复习中', mastered: '已掌握', due: '待复习' } as Record<string, string>, last30: '最近 30 天',
};
type Text = typeof zh;
const ja: Text = {
  ...zh,
  module: { vocabulary: '語彙', grammar: '文法', reading: '読解', listening: '聴解' }, practiceTitle: (m) => (m ? `${m}の練習` : '総合練習'), start: '練習を始める', starting: '問題を準備中…',
  resume: '前回の練習を続ける', count: '問題数', type: '問題形式', allTypes: 'すべての形式', level: 'レベル', anyLevel: 'レベル指定なし', onlyDue: '復習期限の来た項目だけ', excludeCorrect: '正解した問題は除く',
  wordbook: '単語帳', anyWordbook: 'すべての単語帳', noQuestions: '条件に合う使用可の問題がありません。審査を通った問題だけが練習に出ます。', practiceSets: '練習', daily: '毎日の練習',
  topic: 'テーマ別練習', mock: '模擬試験', mixed: '総合', noSets: 'まだ練習がありません。AI に状況に合わせた問題を作ってもらえます（create_practice_set）。', recent: '最近の練習',
  history: '練習の記録', mistakes: '間違えた問題', stats: '学習の統計', cards: '記憶カード', questionOf: (i, n) => `第 ${i} 問 / 全 ${n} 問`, previous: '前の問題', next: '次の問題',
  finish: '練習を終える', finishConfirm: 'まだ答えていない問題があります。終了しますか？', submit: '送信', answerPlaceholder: '聞こえた内容を入力', correct: '正解', wrong: '不正解',
  notScored: '記録しました（採点なし）', yourAnswer: 'あなたの答え', rightAnswer: '正解', expected: '模範解答', explanation: '解説', evidence: '根拠', translation: '訳', transcript: 'スクリプト',
  recordingLater: 'このブラウザでは録音できません。iOS で練習できます。ここでは飛ばします。', skip: '飛ばす', recordStart: '録音開始', uploadingRecording: '録音をアップロード中…', summary: '練習の結果', score: (c, n) => `${n} 問中 ${c} 問正解`,
  backToHub: '戻る', review: '解説を見る', retryWrong: '間違えた問題をもう一度', resultHidden: '終了後に正解と解説を表示します', answeredAt: '解答日時', elapsed: '時間', empty: '記録がありません',
  loading: '読み込み中…', loadError: '読み込みに失敗しました', minutes: (n) => `${n} 分`, sectionCount: (n) => `${n} 部`, questions: (n) => `${n} 問`, completed: (n) => `${n} 回完了`,
  inProgress: '進行中', done: '完了', reports: '学習日報', inbox: '受信箱', mistakeChosen: '選んだ答え', mistakeCorrect: '正解', practiceAgain: 'この問題を練習', open: '開く',
  cardsTitle: '記憶カード', dueCount: (d, n) => `復習 ${d} · 新規 ${n}`, show: '答えを見る', forgot: '忘れた', hard: '難しい', remembered: '覚えている', easy: '簡単',
  cardsDone: '今日のカードはすべて終わりました', nextReview: '次の復習', exit: '終了',
  accuracy: '正答率', answered: '解答', ratings: 'カード評価', streak: (n) => `${n} 日連続`, today: '今日', byType: '形式別', knowledgeStates: '項目の状態',
  states: { new: '未学習', learning: '学習中', review: '復習中', mastered: '習得済み', due: '復習待ち' }, last30: '最近 30 日',
};
const en: Text = {
  ...zh,
  module: { vocabulary: 'Vocabulary', grammar: 'Grammar', reading: 'Reading', listening: 'Listening' }, practiceTitle: (m) => (m ? `${m} practice` : 'Mixed practice'), start: 'Start practice',
  starting: 'Preparing questions…', resume: 'Continue your last practice', count: 'Questions', type: 'Type', allTypes: 'All types', level: 'Level', anyLevel: 'Any level',
  onlyDue: 'Only items due for review', excludeCorrect: 'Skip questions already answered correctly', wordbook: 'Wordbook', anyWordbook: 'All wordbooks',
  noQuestions: 'No usable questions match. Questions appear in practice only after they pass review.', practiceSets: 'Practices', daily: 'Daily practice', topic: 'Topic practice',
  mock: 'Mock exams', mixed: 'Mixed', noSets: 'No practices yet. Your AI can write one for you (create_practice_set).', recent: 'Recent practice', history: 'Practice history',
  mistakes: 'Mistakes', stats: 'Statistics', cards: 'Memory cards', questionOf: (i, n) => `Question ${i} of ${n}`, previous: 'Previous', next: 'Next', finish: 'Finish',
  finishConfirm: 'Some questions are unanswered. Finish anyway?', submit: 'Submit', answerPlaceholder: 'Type what you heard', correct: 'Correct', wrong: 'Incorrect',
  notScored: 'Recorded (not scored)', yourAnswer: 'Your answer', rightAnswer: 'Answer', expected: 'Reference answer', explanation: 'Explanation', evidence: 'Evidence', translation: 'Translation',
  transcript: 'Transcript', recordingLater: 'This browser cannot record; practice shadowing on iOS. Skipped here.', skip: 'Skip', recordStart: 'Record', uploadingRecording: 'Uploading recording…', summary: 'Results', score: (c, n) => `${c} of ${n} correct`,
  backToHub: 'Back', review: 'Review answers', retryWrong: 'Retry mistakes', resultHidden: 'Answers and explanations appear after you finish', answeredAt: 'Answered', elapsed: 'Time',
  empty: 'Nothing yet', loading: 'Loading…', loadError: 'Could not load', minutes: (n) => `${n} min`, sectionCount: (n) => `${n} sections`, questions: (n) => `${n} questions`,
  completed: (n) => `Completed ${n}×`, inProgress: 'In progress', done: 'Done', reports: 'Daily reports', inbox: 'Inbox', mistakeChosen: 'You chose', mistakeCorrect: 'Answer', practiceAgain: 'Practice these', open: 'Open',
  cardsTitle: 'Memory cards', dueCount: (d, n) => `${d} due · ${n} new`, show: 'Show answer', forgot: 'Forgot', hard: 'Hard', remembered: 'Remembered', easy: 'Easy',
  cardsDone: 'All cards for today are done', nextReview: 'Next review', exit: 'Exit',
  accuracy: 'Accuracy', answered: 'Answered', ratings: 'Card ratings', streak: (n) => `${n}-day streak`, today: 'Today', byType: 'By type', knowledgeStates: 'Item states',
  states: { new: 'New', learning: 'Learning', review: 'Reviewing', mastered: 'Mastered', due: 'Due' }, last30: 'Last 30 days',
};
export const practiceText = (locale: Locale): Text => (locale === 'ja' ? ja : locale === 'en' ? en : zh);
