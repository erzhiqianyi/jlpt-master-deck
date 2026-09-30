import { getStudyState, listDailyPractices, listDueReviews } from './storage.mjs';

export function getAiLearningHome(userId, now = new Date()) {
  const due = listDueReviews(userId, now.toISOString());
  const progress = getStudyState(userId).progress;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const reviewedToday = Object.values(progress).filter((entry) => entry.lastReviewedAt && new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(entry.lastReviewedAt)) === today).length;
  return {
    title: 'AI 学习首页', date: today,
    due: { total: due.length, vocabulary: due.filter((item) => item.deck === 'n1_vocab').length, grammar: due.filter((item) => item.deck === 'grammar_expression').length },
    reviewed_today: reviewedToday,
    recent_practices: listDailyPractices(userId).slice(0, 3).map(({ id, title, date, questionCount, minutes }) => ({ id, title, date, questionCount, minutes })),
    actions: [
      { id: 'cards', title: '复习到期卡片', prompt: '打开我的到期复习卡片。请逐张显示，让我翻面后自己评价记忆程度。' },
      { id: 'vocabulary', title: '词汇专项练习', prompt: '从我的词库开始五道词汇专项练习，一次显示一题，等我选答案。' },
      { id: 'grammar', title: '语法专项练习', prompt: '从我的语法库开始五道专项练习，一次显示一题，等我选答案。' },
      { id: 'weaknesses', title: '看看薄弱点', prompt: '根据我最近保存的答题记录，分析薄弱点并建议下一组练习。' },
    ],
  };
}
