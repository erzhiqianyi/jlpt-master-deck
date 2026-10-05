import { ArrowRight, BookOpen, CalendarDays, ChevronRight, NotebookPen, Layers3, History } from 'lucide-react';
import type { AnswerState, AppView, DailyPracticeSummary, DraftSummary, Locale, Question, StudyPage, StudyPlanDocument, VocabItem } from '../../types';
import './HomeDashboard.css';
import { usePageHeaderActions } from '../../components/PageChrome';

export function HomeDashboard({ locale, dueItems, plan, todayPractices, dailyAnswers = {}, latestDraft, onOpenDraft, onNavigate, onStartDailyPractice, onCreateDailyPractice, onStartMock, topicCount, topicRounds, mixedQuestionCount, mixedRounds, mockExamCount, mockRounds}: {
  topicCount?: number; topicRounds?: number; mixedQuestionCount?: number; mixedRounds?: number; mockExamCount?: number; mockRounds?: number;
  locale: Locale;
  dueItems: VocabItem[]; plan: StudyPlanDocument;
  todayPractices: Array<DailyPracticeSummary & { questions?: Question[] }>; dailyAnswers?: AnswerState;
  latestDraft?: DraftSummary; onOpenDraft: (id: string) => void;
  onNavigate: (view: AppView, page?: StudyPage, itemId?: string) => void; onStartDailyPractice: (id?: string) => void; onCreateDailyPractice: () => void;
  onStartMock: () => void;
}) {
  const examDate = plan.profile.examDate;
  const examName = plan.profile.examName?.trim() || (plan.profile.level ? 'JLPT' : '');
  const examLabel = [examName, examName === 'JLPT' ? plan.profile.level : ''].filter(Boolean).join(' · ');
  const tokyoToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const examDays = Math.round((Date.parse(`${examDate}T00:00:00+09:00`) - Date.parse(`${tokyoToday}T00:00:00+09:00`)) / 86400000);
  const countdown = locale === 'zh-CN'
    ? { title: 'JLPT 考试倒计时', remaining: '距离考试还有', days: '天', today: '今天考试', past: '考试日期已过，请更新计划', setup: '设置考试日期' }
    : locale === 'ja'
      ? { title: 'JLPT カウントダウン', remaining: '試験まであと', days: '日', today: '今日は試験日', past: '試験日を更新してください', setup: '試験日を設定' }
      : { title: 'JLPT countdown', remaining: 'Until the exam', days: 'days', today: 'Exam day', past: 'Update your past exam date', setup: 'Set exam date' };
  const practice = todayPractices[0];
  const fullTitle = practice?.title || latestDraft?.title || '';
  const strippedTitle = fullTitle.replace(/^(?:\d{4}-\d{2}-\d{2}|\d{1,2}月\d{1,2}日)[\s・｜|：:—-]*/u, '');
  const compactTitle = (strippedTitle.includes('｜') ? strippedTitle.split('｜').slice(1).join('｜').trim() || strippedTitle : strippedTitle)
    .replace('每日薄弱点强化练习', '弱点强化').replace('每日强化练习', '弱点强化');
  const answered = practice?.questions?.filter(question => Boolean(dailyAnswers[question.id])).length ?? 0;
  const total = practice?.questions?.length ?? practice?.questionCount ?? 0;
  const complete = total > 0 && answered === total;
  const text = locale === 'zh-CN' ? {
    title: '今日', plan: '今日计划', all: '查看计划', empty: '今天还没有准备好的练习', setup: '安排', minutes: '分钟', done: '已完成', mark: '标为已完成', undo: '恢复待完成', practice: '今日练习', start: '开始练习', resume: '继续练习', open: '查看练习', prepare: '准备今日练习', confirm: '确认今日题目', reviewDraft: '确认题目', review: '记忆复习', reviewCount: (count: number) => `${count} 项待复习`, reviewAction: '开始复习', reviewDone: '今天已完成', reviewUnit: '项', questions: '题', skipped: '已跳过'
  } : locale === 'ja' ? {
    title: '今日', plan: '今日の計画', all: '計画を見る', empty: '今日の練習はまだありません', setup: '予定を追加', minutes: '分', done: '完了', mark: '完了にする', undo: '未完了に戻す', practice: '今日の練習', start: '練習を始める', resume: '練習を続ける', open: '練習を見る', prepare: '今日の練習を準備', confirm: '今日の問題を確認', reviewDraft: '確認待ちの問題を見る', review: '記憶の復習', reviewCount: (count: number) => `復習待ち ${count} 件`, reviewAction: '復習を始める', reviewDone: '今日は完了', reviewUnit: '件', questions: '問', skipped: 'スキップ'
  } : {
    title: 'Today', plan: "Today's plan", all: 'View plan', empty: 'No practice prepared for today', setup: 'Plan', minutes: 'min', done: 'completed', mark: 'Mark done', undo: 'Mark pending', practice: "Today's practice", start: 'Start practice', resume: 'Continue practice', open: 'View practice', prepare: 'Prepare today’s practice', confirm: 'Confirm today’s questions', reviewDraft: 'Review pending questions', review: 'Memory review', reviewCount: (count: number) => `${count} items due`, reviewAction: 'Start review', reviewDone: 'Done for today', reviewUnit: 'items', questions: 'questions', skipped: 'Skipped'
  };

  const learning = locale === 'zh-CN' ? { title: '学习', independent: '自主练习', topics: '专项练习', mixed: '综合练习', mock: '模拟考试', due: '到期复习', ready: '待开始', ongoing: '进行中', finished: '已完成', sets: '套', rounds: '次' } : locale === 'ja' ? { title: '学習', independent: '自主練習', topics: '分野別練習', mixed: '総合練習', mock: '模擬試験', due: '期限の来た復習', ready: '未開始', ongoing: '練習中', finished: '完了', sets: 'セット', rounds: '回' } : { title: 'Learn', independent: 'Independent practice', topics: 'Topic practice', mixed: 'Mixed practice', mock: 'Mock exam', due: 'Due for review', ready: 'Not started', ongoing: 'In progress', finished: 'Completed', sets: 'sets', rounds: 'times' };
  usePageHeaderActions([{ key: 'plan', label: text.all, icon: <CalendarDays size={22} />, onClick: () => onNavigate('plan') }]);
  const entries = [
    { title: learning.topics, icon: BookOpen, count: topicCount, unit: learning.sets, rounds: topicRounds, action: () => onNavigate('mixed', 'tips', 'topics') },
    { title: learning.mixed, icon: Layers3, count: mixedQuestionCount, unit: text.questions, rounds: mixedRounds, action: () => onNavigate('mixed', 'questions') },
    { title: learning.mock, icon: NotebookPen, count: mockExamCount, unit: learning.sets, rounds: mockRounds, action: onStartMock },
  ];
  return <main className="primary-today" aria-label={learning.title}>
    <button type="button" className="home-exam-countdown" onClick={() => onNavigate('plan')} aria-label={`${examLabel || countdown.title} · ${Number.isFinite(examDays) && examDays > 0 ? `${examDays} ${countdown.days}` : examDays === 0 ? countdown.today : countdown.setup}`}>
      <CalendarDays size={24} aria-hidden="true" />
      <span className="home-exam-identity"><strong>{examLabel || (locale === 'zh-CN' ? '考试日期' : locale === 'ja' ? '試験日' : 'Exam date')}</strong>{Number.isFinite(examDays) ? <small>{examDate}</small> : null}</span>
      <span className="home-exam-days">{Number.isFinite(examDays) && examDays > 0 ? <><span><b>{examDays}</b> {countdown.days}</span></> : <strong>{examDays === 0 ? countdown.today : Number.isFinite(examDays) ? countdown.past : countdown.setup}</strong>}</span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>
    <div className="learning-today-grid">
    <section className="primary-daily-task" aria-labelledby="primary-daily-title">
      <div className="learning-card-heading"><h2 id="primary-daily-title">{text.practice}</h2><span className={`learning-status ${answered > 0 ? 'is-active' : ''}`}>{complete ? learning.finished : answered > 0 ? learning.ongoing : practice ? learning.ready : latestDraft ? (locale === 'zh-CN' ? latestDraft.status === 'approved' ? '已确认' : '待确认' : locale === 'ja' ? '確認待ち' : 'Pending confirmation') : (locale === 'zh-CN' ? '未准备' : locale === 'ja' ? '未準備' : 'Not ready')}</span></div>
      {compactTitle ? <h3 className="home-practice-title">{compactTitle}</h3> : null}
      {practice ? <>
        <p className="primary-daily-meta">{answered}/{total} {text.questions}{practice.minutes > 0 ? ` · ${practice.minutes} ${text.minutes}` : ''}</p>
        <progress className="learning-progress" value={answered} max={Math.max(1, total)} aria-label={`${answered} / ${total} ${text.done}`} />
      </> : latestDraft ? null : <p className="primary-daily-meta">{text.empty}</p>}
      <button type="button" className="primary-daily-action" onClick={() => practice ? onStartDailyPractice(practice.id) : latestDraft ? onOpenDraft(latestDraft.id) : onCreateDailyPractice()}>
        {practice ? complete ? text.open : answered > 0 ? text.resume : text.start : latestDraft ? text.reviewDraft : text.prepare}<ArrowRight size={21} aria-hidden="true" />
      </button>
    </section>
    <button type="button" className="primary-navigation-row learning-due" disabled={!dueItems.length} onClick={() => onNavigate('memory-review')}>
      <History size={32} className="primary-entry-icon" aria-hidden="true" /><span className="primary-entry-copy"><strong>{learning.due}</strong><small>{dueItems.length ? text.reviewAction : text.reviewDone}</small></span><span className="learning-due-count"><strong>{dueItems.length}</strong><small>{text.reviewUnit}</small></span><ChevronRight size={22} aria-hidden="true" />
    </button>
    </div>
    <section className="learning-independent" aria-labelledby="learning-independent-title">
      <h2 id="learning-independent-title">{learning.independent}</h2>
      <div className="learning-practice-grid">{entries.map(entry => <button type="button" key={entry.title} onClick={entry.action}>
        <entry.icon size={32} aria-hidden="true" /><strong>{entry.title}</strong>
        {entry.count !== undefined ? <small>{entry.count} {entry.unit}</small> : <small>—</small>}
        {entry.rounds !== undefined ? <small><History size={16} aria-hidden="true" />{entry.rounds} {learning.rounds}</small> : null}
      </button>)}</div>
    </section>

  </main>;
}
