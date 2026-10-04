import { ArrowRight, BookOpen, CalendarDays, Check, ChevronRight, Clock3, NotebookPen, Captions } from 'lucide-react';
import { useState } from 'react';
import { localDateString, tasksForDate } from '../../domain/studyPlan';
import type { AnswerState, AppView, DailyPracticeSummary, DraftSummary, Locale, Question, ProgressState, ReadingQuestion, StudyPage, StudyPlanDocument, StudyPlanTaskStatus, VocabItem } from '../../types';
import './HomeDashboard.css';

export function HomeDashboard({ locale, dueItems, plan, todayPractices, dailyAnswers = {}, latestDraft, items = [], progress = {}, readingQuestions = [], onOpenReviewItem, onOpenPracticeHistory, onOpenDraft, onNavigate, onStartDailyPractice, onCreateDailyPractice, onTaskStatus }: {
  token: string; username: string;
  labels: Record<string, string>; locale: Locale;
  dueItems: VocabItem[]; onOpenReviewItem: (item: VocabItem) => void; plan: StudyPlanDocument;
  todayPractices: Array<DailyPracticeSummary & { questions?: Question[] }>; dailyAnswers?: AnswerState;
  items?: VocabItem[]; progress?: ProgressState; readingQuestions?: ReadingQuestion[];
  latestDraft?: DraftSummary; onOpenDraft: (id: string) => void;
  onNavigate: (view: AppView, page?: StudyPage, itemId?: string) => void; onStartDailyPractice: (id?: string) => void; onCreateDailyPractice: () => void;
  onOpenPracticeHistory: () => void;
  onStartMock: () => void; onTaskStatus: (id: string, status: StudyPlanTaskStatus) => void | Promise<void>;
}) {
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const today = localDateString(new Date());
  const examDate = plan.profile.examDate;
  const tokyoToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const examDays = Math.round((Date.parse(`${examDate}T00:00:00+09:00`) - Date.parse(`${tokyoToday}T00:00:00+09:00`)) / 86400000);
  const countdown = locale === 'zh-CN'
    ? { title: 'JLPT 考试倒计时', remaining: '距离考试还有', days: '天', today: '今天考试', past: '考试日期已过，请更新计划', setup: '设置考试日期' }
    : locale === 'ja'
      ? { title: 'JLPT カウントダウン', remaining: '試験まであと', days: '日', today: '今日は試験日', past: '試験日を更新してください', setup: '試験日を設定' }
      : { title: 'JLPT countdown', remaining: 'Until the exam', days: 'days', today: 'Exam day', past: 'Update your past exam date', setup: 'Set exam date' };
  const tasks = tasksForDate(plan.tasks, today);
  const completed = tasks.filter(task => task.status === 'completed').length;
  const practice = todayPractices[0];
  const answered = practice?.questions?.filter(question => Boolean(dailyAnswers[question.id])).length ?? 0;
  const total = practice?.questions?.length ?? practice?.questionCount ?? 0;
  const complete = total > 0 && answered === total;
  const text = locale === 'zh-CN' ? {
    title: '今日', plan: '今日计划', all: '查看计划', empty: '今天尚未安排任务', setup: '安排', minutes: '分钟', done: '已完成', mark: '标为已完成', undo: '恢复待完成', practice: '今日练习', start: '开始练习', resume: '继续练习', open: '查看练习', prepare: '准备今日练习', confirm: '确认今日题目', reviewDraft: '查看待确认题目', review: '记忆复习', reviewCount: (count: number) => `${count} 项待复习`, questions: '题', skipped: '已跳过'
  } : locale === 'ja' ? {
    title: '今日', plan: '今日の計画', all: '計画を見る', empty: '今日の予定はまだありません', setup: '予定を追加', minutes: '分', done: '完了', mark: '完了にする', undo: '未完了に戻す', practice: '今日の練習', start: '練習を始める', resume: '練習を続ける', open: '練習を見る', prepare: '今日の練習を準備', confirm: '今日の問題を確認', reviewDraft: '確認待ちの問題を見る', review: '記憶の復習', reviewCount: (count: number) => `復習待ち ${count} 件`, questions: '問', skipped: 'スキップ'
  } : {
    title: 'Today', plan: "Today's plan", all: 'View plan', empty: 'Nothing planned for today', setup: 'Plan', minutes: 'min', done: 'completed', mark: 'Mark done', undo: 'Mark pending', practice: "Today's practice", start: 'Start practice', resume: 'Continue practice', open: 'View practice', prepare: 'Prepare today’s practice', confirm: 'Confirm today’s questions', reviewDraft: 'Review pending questions', review: 'Memory review', reviewCount: (count: number) => `${count} items due`, questions: 'questions', skipped: 'Skipped'
  };

  const overview = locale === 'zh-CN' ? {
    due: '待复习', all: '查看全部', dueHint: '项可开始复习', noDue: '没有到期内容，可以浏览词条或安排新的学习。',
    reviewed: '今日已复习', week: '最近 7 天', days: '天有学习记录', noActivity: '最近 7 天暂无学习记录',
    continue: '继续学习', reading: '阅读理解', grammar: '语法表达', library: '打开题库', entries: '个学习词条',
    capture: '遇到不懂的日语？记下来。', planHint: '可以先复习到期词条，也可以为今天安排学习任务。',
    reviewStart: '开始记忆复习', reviewBrowse: '浏览记忆词条', reviewUnit: '项',
  } : locale === 'ja' ? {
    due: '復習待ち', all: 'すべて見る', dueHint: '件を復習できます', noDue: '期限の来た項目はありません。教材を見るか、次の学習を計画しましょう。',
    reviewed: '今日復習した項目', week: '最近7日間', days: '日間の学習記録', noActivity: '最近7日間の学習記録はありません',
    continue: '学習を続ける', reading: '読解', grammar: '文法表現', library: '問題集を開く', entries: '件の学習項目',
    capture: 'わからない日本語をメモしましょう。', planHint: '復習待ちの項目から始めるか、今日の学習を計画しましょう。',
    reviewStart: '記憶の復習を始める', reviewBrowse: '学習項目を見る', reviewUnit: '件',
  } : {
    due: 'Due for review', all: 'View all', dueHint: 'items ready to review', noDue: 'Nothing is due. Browse your library or plan your next session.',
    reviewed: 'Items reviewed today', week: 'Last 7 days', days: 'days with study records', noActivity: 'No study records in the last 7 days',
    continue: 'Continue learning', reading: 'Reading', grammar: 'Grammar', library: 'Open library', entries: 'learning items',
    capture: 'Found unfamiliar Japanese? Make a note.', planHint: 'Start with items due for review or plan today’s learning tasks.',
    reviewStart: 'Start memory review', reviewBrowse: 'Browse learning items', reviewUnit: 'items',
  };
  const reviewedToday = items.filter(item => {
    const timestamp = progress[item.id]?.lastReviewedAt;
    return timestamp && localDateString(new Date(timestamp)) === today;
  }).length;
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = localDateString(date);
    const summary = plan.dailySummaries?.find(entry => entry.date === key);
    const minutes = Number.isFinite(summary?.practiceMinutes) ? Math.max(0, summary!.practiceMinutes) : 0;
    return { key, date, minutes, active: minutes > 0 || (summary?.attempted ?? 0) > 0 || (summary?.completedTasks ?? 0) > 0 };
  });
  const maximum = Math.max(1, ...days.map(day => day.minutes));
  const activeDays = days.filter(day => day.active).length;
  const weekMinutes = days.reduce((sum, day) => sum + day.minutes, 0);
  const recentItems = items.filter(item => Boolean(progress[item.id]?.lastReviewedAt))
    .sort((a, b) => (progress[b.id]?.lastReviewedAt ?? '').localeCompare(progress[a.id]?.lastReviewedAt ?? '')).slice(0, 2);
  const grammarCount = items.filter(item => item.deck === 'grammar_expression').length;
  const openReview = () => onNavigate(dueItems.length ? 'memory-review' : 'memory');

  async function toggle(id: string, done: boolean) {
    setSaving(id);
    setError('');
    try { await onTaskStatus(id, done ? 'pending' : 'completed'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(''); }
  }

  return <main className="primary-today" aria-label={text.title}>
    <p className="primary-today-date"><time dateTime={today}>{new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</time></p>
    <button type="button" className="home-exam-countdown" onClick={() => onNavigate('plan')} aria-label={`${countdown.title} · JLPT ${plan.profile.level} · ${Number.isFinite(examDays) && examDays > 0 ? `${examDays} ${countdown.days}` : examDays === 0 ? countdown.today : countdown.setup}`}>
      <CalendarDays size={24} aria-hidden="true" />
      <span className="home-exam-identity"><strong>{countdown.title} · {plan.profile.level}</strong><small>{Number.isFinite(examDays) ? new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${examDate}T00:00:00+09:00`)) : countdown.setup}</small></span>
      <span className="home-exam-days">{Number.isFinite(examDays) && examDays > 0 ? <><small>{countdown.remaining}</small><span><b>{examDays}</b> {countdown.days}</span></> : <strong>{examDays === 0 ? countdown.today : Number.isFinite(examDays) ? countdown.past : countdown.setup}</strong>}</span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>
    <div className="home-dashboard-grid">
    <div className="home-main-column">
    <section className="primary-daily-task" aria-labelledby="primary-daily-title">
      <h2 id="primary-daily-title">{text.practice}</h2>
      <h3 className="home-practice-title">{practice?.title || (latestDraft ? text.confirm : text.prepare)}</h3>
      {practice ? <p className="primary-daily-meta">{total} {text.questions}{practice.minutes > 0 ? ` · ${practice.minutes} ${text.minutes}` : ''}{answered > 0 ? ` · ${answered} / ${total} ${text.done}` : ''}</p> : null}
      <button type="button" className="primary-daily-action" onClick={() => practice ? onStartDailyPractice(practice.id) : latestDraft ? onOpenDraft(latestDraft.id) : onCreateDailyPractice()}>
        {practice ? complete ? text.open : answered > 0 ? text.resume : text.start : latestDraft ? text.reviewDraft : text.prepare}<ArrowRight size={21} aria-hidden="true" />
      </button>
    </section>
    <button type="button" className="primary-navigation-row home-mobile-review" onClick={openReview}>
      <BookOpen size={29} className="primary-entry-icon" aria-hidden="true" /><span className="primary-entry-copy"><strong>{locale === 'zh-CN' ? '记忆复习' : locale === 'ja' ? '記憶復習' : 'Memory review'}</strong><small>{text.reviewCount(dueItems.length)}</small></span><ChevronRight size={20} aria-hidden="true" />
    </button>
    <section className="primary-plan-section" aria-labelledby="primary-plan-title">
      <button type="button" className="primary-navigation-row primary-plan-entry" onClick={() => onNavigate('plan')}>
        <CalendarDays className="primary-entry-icon" size={29} aria-hidden="true" />
        <span className="primary-entry-copy"><strong id="primary-plan-title">{text.plan}</strong><small>{tasks.length ? `${completed} / ${tasks.length} ${text.done}` : text.empty}</small></span>
        <span className="primary-plan-action">{tasks.length ? text.all : text.setup}<ChevronRight size={19} aria-hidden="true" /></span>
      </button>
      {tasks.length ? <ul className="primary-today-tasks">{tasks.slice(0, 4).map(task => <li key={task.id} className={task.status === 'completed' ? 'is-done' : undefined}>
        <button type="button" className="primary-task-check" disabled={Boolean(saving)} aria-label={`${task.status === 'completed' ? text.undo : text.mark}: ${task.title}`} aria-pressed={task.status === 'completed'} onClick={() => void toggle(task.id, task.status === 'completed')}>{task.status === 'completed' ? <Check size={17} aria-hidden="true" /> : <span />}</button>
        <div><strong>{task.title}</strong><small><Clock3 size={13} aria-hidden="true" />{task.minutes} {text.minutes}{task.status === 'skipped' ? ` · ${text.skipped}` : ''}</small></div>
      </li>)}</ul> : null}
      {error ? <p className="primary-task-error" role="alert">{error}</p> : null}
      {!tasks.length ? <p className="home-plan-hint">{overview.planHint}</p> : <progress className="home-plan-progress" value={completed} max={tasks.length} aria-label={`${completed} / ${tasks.length} ${text.done}`} />}
      <button type="button" className="primary-daily-action" onClick={openReview}><ArrowRight size={20} aria-hidden="true" />{dueItems.length ? overview.reviewStart : overview.reviewBrowse}</button>
      <p className="home-plan-summary">{text.reviewCount(dueItems.length)} · {overview.reviewed} {reviewedToday} {overview.reviewUnit}</p>
    </section>


    <section className="home-continue" aria-labelledby="home-continue-title">
      <h2 id="home-continue-title">{overview.continue}</h2>
      {recentItems.map(item => <button type="button" className="primary-navigation-row" key={item.id} onClick={() => onOpenReviewItem(item)}>
        <BookOpen size={24} className="primary-entry-icon" aria-hidden="true" /><span className="primary-entry-copy"><strong>{item.original}</strong><small>{item.reading || (item.deck === 'grammar_expression' ? overview.grammar : item.meaning_zh)}</small></span><ChevronRight size={19} aria-hidden="true" />
      </button>)}
      <button type="button" className="primary-navigation-row" onClick={() => onNavigate('reading', 'words')}>
        <BookOpen size={24} className="primary-entry-icon" aria-hidden="true" /><span className="primary-entry-copy"><strong>{overview.reading}</strong><small>{readingQuestions[0]?.title || overview.library}</small></span><ChevronRight size={19} aria-hidden="true" />
      </button>
      <button type="button" className="primary-navigation-row" onClick={() => onNavigate('grammar', 'words')}>
        <Captions size={24} className="primary-entry-icon" aria-hidden="true" /><span className="primary-entry-copy"><strong>{overview.grammar}</strong><small>{grammarCount} {overview.entries}</small></span><ChevronRight size={19} aria-hidden="true" />
      </button>
    </section>
    <button type="button" className="home-capture-entry" onClick={() => onNavigate('capture')}><NotebookPen size={21} aria-hidden="true" /><span>{overview.capture}</span><ChevronRight size={19} aria-hidden="true" /></button>
    </div>
    <aside className="home-support-column" aria-label={overview.due}>
      <section className="home-due-section" aria-labelledby="home-due-title">
        <div className="home-section-heading"><h2 id="home-due-title">{overview.due}</h2><button type="button" onClick={openReview}>{overview.all}</button></div>
        <button type="button" className="primary-review-entry home-due-total" onClick={openReview} aria-label={`${text.review} ${text.reviewCount(dueItems.length)}`}><strong>{dueItems.length}</strong><span>{overview.dueHint}</span></button>
        {dueItems.length ? <ul className="home-due-list">{dueItems.slice(0, 3).map(item => <li key={item.id}><button type="button" onClick={() => onOpenReviewItem(item)}><BookOpen size={20} aria-hidden="true" /><span><strong>{item.original}</strong><small>{item.reading || (item.deck === 'grammar_expression' ? overview.grammar : item.meaning_zh)}</small></span><ChevronRight size={17} aria-hidden="true" /></button></li>)}</ul> : <p className="home-empty-copy">{overview.noDue}</p>}
      </section>
      <section className="home-week-section" aria-labelledby="home-week-title">
        <div className="home-section-heading"><h2 id="home-week-title">{overview.week}</h2><button type="button" onClick={onOpenPracticeHistory}>{overview.all}</button></div>
        <ul className="home-week-chart" aria-label={overview.week}>{days.map(day => <li key={day.key} aria-label={`${day.key}: ${day.minutes} ${text.minutes}`}>
          <div className="home-week-bar-track" aria-hidden="true"><span className={day.key === today ? 'is-today' : undefined} style={{ height: day.minutes > 0 ? `${Math.max(4, day.minutes / maximum * 100)}%` : '2px' }} /></div>
          <time dateTime={day.key}>{new Intl.NumberFormat(locale).format(day.date.getDate())}</time>
        </li>)}</ul>
        <p className="home-week-summary">{activeDays ? `${activeDays} ${overview.days} · ${weekMinutes} ${text.minutes}` : overview.noActivity}</p>
      </section>
    </aside>
    </div>
  </main>;
}
