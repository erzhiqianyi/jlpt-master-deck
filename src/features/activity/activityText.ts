// 収集箱・下書き・学習計画・日報・市場（v3）の表示文字。
import type { Locale } from '../../types';

const zh = {
  back: '返回', loading: '读取中…', loadError: '读取失败', empty: '还没有内容', save: '保存', cancel: '取消', delete: '删除', confirmDelete: '确定删除？',
  // 收集箱
  inbox: '收集箱', inboxHint: '学习中记下的单词、语法和问题。AI 整理后会标为已处理。', status: { inbox: '待处理', processed: '已处理', archived: '已归档' } as Record<string, string>,
  category: { word: '单词', grammar: '语法', sentence: '句子', listening: '听力', reading: '阅读', unsure: '未分类' } as Record<string, string>, archive: '归档', reopen: '放回待处理',
  // 草稿
  drafts: 'AI 草稿', draftsHint: 'AI 按你的情况编写的练习。确认后发布为每日练习；有意见可以留言让 AI 修改。', draftStatus: { draft: '待确认', needs_revision: '需修改', approved: '已确认', archived: '已归档' } as Record<string, string>,
  objectives: '学习目标', questions: (n: number) => `${n} 题`, comments: '留言', commentPlaceholder: '写下修改意见，AI 会按留言修改', send: '留言', approve: '确认', publish: '发布为每日练习',
  published: (code: string) => `已发布：${code}`, groupNotReady: '题目还在审查中，审查通过后才能发布', quiz: '小测', generated: '练习题', nextStep: '下一步',
  // 计划
  plan: '学习计划', exam: '考试', examName: '考试名称', level: '等级', startDate: '开始日期', examDate: '考试日期', days: '每周学习天数', minutes: '每天分钟数', materials: '教材',
  materialTitle: '教材名', currentPosition: '当前进度', addMaterial: '添加教材', removeMaterial: '删除', fixedSchedule: '固定日程', supplementalNeeds: '其他要求',
  planHint: '保存基本信息后，让 AI 根据你的情况生成每日任务（save_generated_study_plan）。', planStatus: { none: '还没有计划', profile_only: '只有基本信息，等待 AI 生成', ready: '已生成', needs_refresh: '基本信息改了，需要重新生成' } as Record<string, string>,
  phases: '阶段', tasks: '每日任务', today: '今天', upcoming: '接下来', taskStatus: { pending: '待做', completed: '完成', skipped: '跳过', missed: '错过' } as Record<string, string>, done: '完成', skip: '跳过', undo: '撤销',
  module: { vocabulary: '词汇', grammar: '语法', reading: '阅读', listening: '听力', other: '其他' } as Record<string, string>,
  // 日报
  reports: '每日总结', reportsHint: '每天的数字由答题记录统计，文字由 AI 撰写（get_daily_summary_context → save_daily_summary）。', total: '作答', accuracy: '正确率',
  strengths: '做得好的', weaknesses: '需要加强', confusions: '容易混淆', recommendations: '建议', wrongAnswers: '错题', chose: '选了', answer: '正确',
  // 市场
  market: '分享', marketHint: '分享你的单词本或练习，也可以导入别人分享的内容。导入的题目要先通过审查。', mine: '我的分享', all: '大家的分享', share: '分享', withdraw: '撤回',
  importShare: '导入', imported: (r: { knowledge: number; groups: number }) => `已导入：知识点 ${r.knowledge}，题组 ${r.groups}`, alreadyImported: '这个版本已经导入过', knowledgeCount: (n: number) => `知识点 ${n}`,
  groupCount: (n: number) => `题组 ${n}`, sources: '可以分享的内容', shareTitle: '分享标题', description: '说明', withdrawn: '已撤回', needsRevision: (n: number) => `${n} 组需要修改`,
};
type Text = typeof zh;
const ja: Text = {
  ...zh, back: '戻る', loading: '読み込み中…', loadError: '読み込みに失敗しました', empty: 'まだありません', save: '保存', cancel: 'キャンセル', delete: '削除', confirmDelete: '削除しますか？',
  inbox: '収集箱', inboxHint: '学習中に書き留めた単語・文法・疑問。AI が整理すると処理済みになります。', status: { inbox: '未処理', processed: '処理済み', archived: 'アーカイブ' },
  category: { word: '単語', grammar: '文法', sentence: '文', listening: '聴解', reading: '読解', unsure: '未分類' }, archive: 'アーカイブ', reopen: '未処理に戻す',
  drafts: 'AI の下書き', draftsHint: 'AI があなたに合わせて作った練習です。確認すると毎日の練習として公開できます。意見を書けば AI が直します。',
  draftStatus: { draft: '確認待ち', needs_revision: '要修正', approved: '確認済み', archived: 'アーカイブ' }, objectives: '学習目標', questions: (n) => `${n} 問`, comments: 'コメント',
  commentPlaceholder: '直してほしい点を書くと AI が修正します', send: '送る', approve: '確認する', publish: '毎日の練習として公開', published: (code) => `公開済み：${code}`,
  groupNotReady: '審査中の問題があります。審査を通ってから公開できます', quiz: '小テスト', generated: '練習問題', nextStep: '次にすること',
  plan: '学習計画', exam: '試験', examName: '試験名', level: 'レベル', startDate: '開始日', examDate: '試験日', days: '週の学習日数', minutes: '1 日の分数', materials: '教材', materialTitle: '教材名',
  currentPosition: '現在の進度', addMaterial: '教材を追加', removeMaterial: '削除', fixedSchedule: '決まった予定', supplementalNeeds: 'その他の希望',
  planHint: '基本情報を保存したら、AI に毎日の課題を作ってもらいます（save_generated_study_plan）。', planStatus: { none: '計画はまだありません', profile_only: '基本情報のみ。AI の作成待ち', ready: '作成済み', needs_refresh: '基本情報が変わりました。作り直しが必要です' },
  phases: '段階', tasks: '毎日の課題', today: '今日', upcoming: 'これから', taskStatus: { pending: '未完了', completed: '完了', skipped: '飛ばした', missed: '未実施' }, done: '完了', skip: '飛ばす', undo: '戻す',
  module: { vocabulary: '語彙', grammar: '文法', reading: '読解', listening: '聴解', other: 'その他' },
  reports: '毎日のまとめ', reportsHint: '数字は解答記録から集計し、文章は AI が書きます（get_daily_summary_context → save_daily_summary）。', total: '解答', accuracy: '正答率',
  strengths: 'よくできた点', weaknesses: '弱い点', confusions: '混同しやすい点', recommendations: '提案', wrongAnswers: '間違えた問題', chose: '選んだ答え', answer: '正解',
  market: '共有', marketHint: '単語帳や練習を共有したり、他の人の共有を取り込んだりできます。取り込んだ問題は審査を通ってから使えます。', mine: '自分の共有', all: 'みんなの共有', share: '共有する',
  withdraw: '取り下げ', importShare: '取り込む', imported: (r) => `取り込み完了：項目 ${r.knowledge}、題組 ${r.groups}`, alreadyImported: 'この版は取り込み済みです', knowledgeCount: (n) => `項目 ${n}`,
  groupCount: (n) => `題組 ${n}`, sources: '共有できるもの', shareTitle: 'タイトル', description: '説明', withdrawn: '取り下げ済み', needsRevision: (n) => `${n} 組は要修正`,
};
const en: Text = {
  ...zh, back: 'Back', loading: 'Loading…', loadError: 'Could not load', empty: 'Nothing yet', save: 'Save', cancel: 'Cancel', delete: 'Delete', confirmDelete: 'Delete this?',
  inbox: 'Inbox', inboxHint: 'Words, grammar and questions you noted while studying. Your AI marks them processed once filed.', status: { inbox: 'To process', processed: 'Processed', archived: 'Archived' },
  category: { word: 'Word', grammar: 'Grammar', sentence: 'Sentence', listening: 'Listening', reading: 'Reading', unsure: 'Unsorted' }, archive: 'Archive', reopen: 'Back to inbox',
  drafts: 'AI drafts', draftsHint: 'Practices your AI wrote for you. Confirm one to publish it as a daily practice, or leave a comment for the AI to revise.',
  draftStatus: { draft: 'To confirm', needs_revision: 'Needs revision', approved: 'Confirmed', archived: 'Archived' }, objectives: 'Objectives', questions: (n) => `${n} questions`, comments: 'Comments',
  commentPlaceholder: 'Write what should change; your AI will revise', send: 'Comment', approve: 'Confirm', publish: 'Publish as daily practice', published: (code) => `Published: ${code}`,
  groupNotReady: 'Some questions are still in review; publish after they pass', quiz: 'Quiz', generated: 'Practice questions', nextStep: 'Next step',
  plan: 'Study plan', exam: 'Exam', examName: 'Exam', level: 'Level', startDate: 'Start', examDate: 'Exam date', days: 'Days per week', minutes: 'Minutes per day', materials: 'Materials',
  materialTitle: 'Title', currentPosition: 'Current position', addMaterial: 'Add material', removeMaterial: 'Remove', fixedSchedule: 'Fixed schedule', supplementalNeeds: 'Other needs',
  planHint: 'Save your profile, then ask your AI to generate daily tasks (save_generated_study_plan).', planStatus: { none: 'No plan yet', profile_only: 'Profile only; waiting for the AI', ready: 'Generated', needs_refresh: 'Profile changed; regenerate' },
  phases: 'Phases', tasks: 'Daily tasks', today: 'Today', upcoming: 'Upcoming', taskStatus: { pending: 'To do', completed: 'Done', skipped: 'Skipped', missed: 'Missed' }, done: 'Done', skip: 'Skip', undo: 'Undo',
  module: { vocabulary: 'Vocabulary', grammar: 'Grammar', reading: 'Reading', listening: 'Listening', other: 'Other' },
  reports: 'Daily summaries', reportsHint: 'Numbers come from your answers; the text is written by your AI (get_daily_summary_context → save_daily_summary).', total: 'Answered', accuracy: 'Accuracy',
  strengths: 'Strengths', weaknesses: 'Weaknesses', confusions: 'Confusions', recommendations: 'Recommendations', wrongAnswers: 'Mistakes', chose: 'Chose', answer: 'Answer',
  market: 'Sharing', marketHint: 'Share your wordbooks or practices and import others. Imported questions are used after they pass review.', mine: 'My shares', all: 'Everyone', share: 'Share',
  withdraw: 'Withdraw', importShare: 'Import', imported: (r) => `Imported: ${r.knowledge} items, ${r.groups} groups`, alreadyImported: 'This version was already imported', knowledgeCount: (n) => `${n} items`,
  groupCount: (n) => `${n} groups`, sources: 'What you can share', shareTitle: 'Title', description: 'Description', withdrawn: 'Withdrawn', needsRevision: (n) => `${n} groups need revision`,
};
export const activityText = (locale: Locale): Text => (locale === 'ja' ? ja : locale === 'en' ? en : zh);
