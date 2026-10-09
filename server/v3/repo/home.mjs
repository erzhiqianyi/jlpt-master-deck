// AI 学習ホーム（MCP App）用の概要：期限の来たカード、今日の復習数、最近の練習、次にできること。
import { getSettings } from './settings.mjs';
import { listPracticeSets } from './practice.mjs';
import { nowIso } from './common.mjs';

export function learningHome(db, userId, now = new Date()) {
  const timeZone = getSettings(db, userId).dailySource.timeZone || 'Asia/Tokyo';
  const day = (value) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  const today = day(now);
  const due = db.prepare(`SELECT k.kind, count(*) AS n FROM review_schedules r JOIN knowledge_points k ON k.rid = r.point_rid
    WHERE r.user_id = ? AND r.due_at <= ? GROUP BY k.kind`).all(userId, now.toISOString());
  const count = (kinds) => due.filter((d) => kinds.includes(d.kind)).reduce((n, d) => n + d.n, 0);
  const since = new Date(now.getTime() - 2 * 86400000).toISOString();
  const reviewedToday = db.prepare('SELECT last_reviewed_at FROM review_schedules WHERE user_id = ? AND last_reviewed_at >= ?').all(userId, since)
    .filter((r) => day(r.last_reviewed_at) === today).length;
  return {
    title: 'AI 学习首页', date: today, generatedAt: nowIso(),
    due: { total: count(['word', 'grammar', 'name']), vocabulary: count(['word', 'name']), grammar: count(['grammar']) },
    reviewed_today: reviewedToday,
    recent_practices: listPracticeSets(db, userId, { limit: 3 }).items.map((s) => ({ id: s.code, title: s.title?.text ?? s.code, date: s.date ?? s.createdAt.slice(0, 10), questionCount: s.questionCount, minutes: s.minutes ?? 0 })),
    actions: [
      { id: 'cards', title: '复习到期卡片', prompt: '打开我的到期复习卡片（get_due_cards）。请逐张显示，让我翻面后自己评价记忆程度。' },
      { id: 'vocabulary', title: '词汇专项练习', prompt: '用 start_practice 从词汇题库开始五道练习，一次显示一题，等我选答案。' },
      { id: 'grammar', title: '语法专项练习', prompt: '用 start_practice 从语法题库开始五道练习，一次显示一题，等我选答案。' },
      { id: 'weaknesses', title: '看看薄弱点', prompt: '根据 get_study_overview 和 list_mistakes，分析我的薄弱点并用 create_practice_set 安排下一组练习。' },
    ],
  };
}
