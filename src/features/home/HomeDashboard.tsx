import { ArrowRight, BookOpen, CalendarDays, ChevronRight, NotebookPen, Layers3, History, Target } from 'lucide-react';
import type { AnswerState, CardReviewEvent, PracticeAttempt, AppView, DailyPracticeSummary, DraftSummary, Locale, Question, StudyPage, StudyPlanDocument, VocabItem } from '../../types';
import './HomeDashboard.css';
import { usePageHeaderActions } from '../../components/PageChrome';

export function HomeDashboard({ locale, dueItems, plan, todayPractices, dailyAnswers = {}, pendingDrafts = [], attempts = [], cardReviews = [], items = [], activeAttempt, onResumeAttempt, latestDraft, onOpenDraft, onNavigate, onStartDailyPractice, onCreateDailyPractice, onStartMock, topicCount, topicRounds, mixedQuestionCount, mixedRounds, mockExamCount, mockRounds}: {
  pendingDrafts?: DraftSummary[]; attempts?: PracticeAttempt[]; cardReviews?: CardReviewEvent[]; items?: VocabItem[]; activeAttempt?: PracticeAttempt | null; onResumeAttempt?: (attempt: PracticeAttempt) => void;
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
  const multiplePractices = todayPractices.length > 1;
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
    { title: locale === 'zh-CN' ? '题型练习' : locale === 'ja' ? '問題形式別練習' : 'Question type practice', icon: Target, count: undefined, unit: '', rounds: undefined, action: () => onNavigate('mixed', 'tips', 'types') },
    { title: learning.mixed, icon: Layers3, count: mixedQuestionCount, unit: text.questions, rounds: mixedRounds, action: () => onNavigate('mixed', 'questions') },
    { title: learning.mock, icon: NotebookPen, count: mockExamCount, unit: learning.sets, rounds: mockRounds, action: onStartMock },
  ];
  const support = locale === 'zh-CN' ? { week: '本周学习', range: '最近 7 天', days: '学习天数', questions: '答题量', reviews: '复习次数', focus: '待巩固重点', hint: '最近 7 天的错题与困难、忘记的复习卡片', empty: '完成练习或复习后，会在这里整理需要巩固的内容。', wrong: '答错', hard: '困难 / 忘记', resume: '继续上次练习', action: '继续练习', unnamed: '未完成练习', records: '查看记录' }
    : locale === 'ja' ? { week: '今週の学習', range: '直近7日間', days: '学習日数', questions: '回答数', reviews: '復習回数', focus: '復習したいポイント', hint: '直近7日間の誤答と難しい・忘れたカード', empty: '練習や復習をすると、ここに復習ポイントが表示されます。', wrong: '誤答', hard: '難しい / 忘れた', resume: '前回の練習を続ける', action: '続ける', unnamed: '未完了の練習', records: '履歴を見る' }
    : { week: 'This week', range: 'Last 7 days', days: 'Study days', questions: 'Answers', reviews: 'Card reviews', focus: 'Review priorities', hint: 'Mistakes and hard or forgotten cards from the last 7 days', empty: 'Practice and review to see your priorities here.', wrong: 'Incorrect', hard: 'Hard / forgotten', resume: 'Continue your practice', action: 'Continue', unnamed: 'Unfinished practice', records: 'View history' };
  const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const dayKey = (value: string) => Number.isFinite(Date.parse(value)) ? dayFormatter.format(new Date(value)) : '';
  const itemById = new Map(items.map(item => [item.id, item]));
  const questionItems = new Map(todayPractices.flatMap(pack => pack.questions ?? []).map(question => [question.id, question.itemId]));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.parse(`${tokyoToday}T00:00:00+09:00`) - (6 - index) * 86400000);
    return { date: dayKey(date.toISOString()), answers: 0, reviews: 0 };
  });
  const answerEvents = new Map<string, { questionId: string; itemId?: string; correct: boolean; answeredAt: string }>();
  for (const attempt of attempts) for (const answer of attempt.answers) answerEvents.set(`${answer.questionId}:${answer.answeredAt}`, answer);
  for (const [questionId, answer] of Object.entries(dailyAnswers)) if (answer.answeredAt) {
    const key = `${questionId}:${answer.answeredAt}`;
    if (!answerEvents.has(key)) answerEvents.set(key, { questionId, correct: answer.correct, answeredAt: answer.answeredAt, itemId: questionItems.get(questionId) });
  }
  const priorities = new Map<string, { item: VocabItem; wrong: number; hard: number }>();
  const addPriority = (itemId: string | undefined, kind: 'wrong' | 'hard') => {
    const item = itemId ? itemById.get(itemId) : undefined;
    if (!item) return;
    const entry = priorities.get(item.id) ?? { item, wrong: 0, hard: 0 };
    entry[kind]++; priorities.set(item.id, entry);
  };
  for (const answer of answerEvents.values()) {
    const date = dayKey(answer.answeredAt);
    const day = days.find(entry => entry.date === date);
    if (day) { day.answers++; if (!answer.correct) addPriority(answer.itemId, 'wrong'); }
  }
  for (const review of cardReviews) {
    const date = dayKey(review.reviewedAt);
    const day = days.find(entry => entry.date === date);
    if (day) { day.reviews++; if (review.rating === 'hard' || review.rating === 'forgot') addPriority(review.itemId, 'hard'); }
  }
  const focus = [...priorities.values()].sort((a, b) => (b.wrong + b.hard) - (a.wrong + a.hard)).slice(0, 3);
  const maxActivity = Math.max(1, ...days.map(day => day.answers + day.reviews));
  const resumable = activeAttempt && !activeAttempt.completedAt && activeAttempt.questionIds.length > activeAttempt.answers.length ? activeAttempt : null;
  return <main className="primary-today" aria-label={learning.title}>
    <div className="home-learning-layout"><div className="home-learning-main">
    <button type="button" className="home-exam-countdown" onClick={() => onNavigate('plan')} aria-label={`${examLabel || countdown.title} · ${Number.isFinite(examDays) && examDays > 0 ? `${examDays} ${countdown.days}` : examDays === 0 ? countdown.today : countdown.setup}`}>
      <CalendarDays size={24} aria-hidden="true" />
      <span className="home-exam-identity"><strong>{examLabel || (locale === 'zh-CN' ? '考试日期' : locale === 'ja' ? '試験日' : 'Exam date')}</strong>{Number.isFinite(examDays) ? <small>{examDate}</small> : null}</span>
      <span className="home-exam-days">{Number.isFinite(examDays) && examDays > 0 ? <><span><b>{examDays}</b> {countdown.days}</span></> : <strong>{examDays === 0 ? countdown.today : Number.isFinite(examDays) ? countdown.past : countdown.setup}</strong>}</span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>
    <div className="learning-today-grid">
    <section className="primary-daily-task" aria-labelledby="primary-daily-title">
      {multiplePractices ? <>
        <div className="learning-card-heading"><h2 id="primary-daily-title">{text.practice}</h2><span className="learning-status">{todayPractices.length} {learning.sets}</span></div>
        <ul className="home-daily-practice-list">
          {todayPractices.map(pack => {
            const count = pack.questions?.filter(question => Boolean(dailyAnswers[question.id])).length ?? 0;
            const size = pack.questions?.length ?? pack.questionCount ?? 0;
            const finished = size > 0 && count === size;
            const action = finished ? text.open : count > 0 ? text.resume : text.start;
            return <li key={pack.id}>
              <button type="button" onClick={() => onStartDailyPractice(pack.id)}>
                <span className="home-daily-practice-copy">
                  <strong>{pack.title}</strong>
                  <small>{count}/{size} {text.questions}{pack.minutes > 0 ? ` · ${pack.minutes} ${text.minutes}` : ''} · {finished ? learning.finished : count > 0 ? learning.ongoing : learning.ready}</small>
                  <progress className="learning-progress" value={count} max={Math.max(1, size)} aria-label={`${count} / ${size} ${text.done}`} />
                </span>
                <span className="home-daily-practice-action">{action}<ChevronRight size={18} aria-hidden="true" /></span>
              </button>
            </li>;
          })}
        </ul>
      </> : <>
      <div className="learning-card-heading"><h2 id="primary-daily-title">{text.practice}</h2><span className={`learning-status ${answered > 0 ? 'is-active' : ''}`}>{complete ? learning.finished : answered > 0 ? learning.ongoing : practice ? learning.ready : latestDraft ? (locale === 'zh-CN' ? latestDraft.status === 'approved' ? '已确认' : '待确认' : locale === 'ja' ? '確認待ち' : 'Pending confirmation') : (locale === 'zh-CN' ? '未准备' : locale === 'ja' ? '未準備' : 'Not ready')}</span></div>
      {compactTitle ? <h3 className="home-practice-title">{compactTitle}</h3> : null}
      {practice ? <>
        <p className="primary-daily-meta">{answered}/{total} {text.questions}{practice.minutes > 0 ? ` · ${practice.minutes} ${text.minutes}` : ''}</p>
        <progress className="learning-progress" value={answered} max={Math.max(1, total)} aria-label={`${answered} / ${total} ${text.done}`} />
      </> : latestDraft ? null : <p className="primary-daily-meta">{text.empty}</p>}
      <button type="button" className="primary-daily-action" onClick={() => practice ? onStartDailyPractice(practice.id) : latestDraft ? onOpenDraft(latestDraft.id) : onCreateDailyPractice()}>
        {practice ? complete ? text.open : answered > 0 ? text.resume : text.start : latestDraft ? text.reviewDraft : text.prepare}<ArrowRight size={21} aria-hidden="true" />
      </button>
      </>}
    </section>
    <button type="button" className="primary-navigation-row learning-due" disabled={!dueItems.length} onClick={() => onNavigate('memory-review')}>
      <History size={32} className="primary-entry-icon" aria-hidden="true" /><span className="primary-entry-copy"><strong>{learning.due}</strong><small>{dueItems.length ? text.reviewAction : text.reviewDone}</small></span><span className="learning-due-count"><strong>{dueItems.length}</strong><small>{text.reviewUnit}</small></span><ChevronRight size={22} aria-hidden="true" />
    </button>
    </div>
    {pendingDrafts.length ? <section className="home-pending-practices" aria-label={locale === 'zh-CN' ? '待确认练习' : locale === 'ja' ? '確認待ちの練習' : 'Pending practices'}>
      <div className="home-context-heading"><h2>{locale === 'zh-CN' ? '待确认练习' : locale === 'ja' ? '確認待ちの練習' : 'Pending practices'} · {pendingDrafts.length}</h2><button className="home-context-link" onClick={() => onNavigate('drafts')}>{locale === 'zh-CN' ? '查看全部' : locale === 'ja' ? 'すべて見る' : 'View all'}</button></div>
      <ul className="home-focus-list">{pendingDrafts.slice(0, 3).map(draft => <li key={draft.id}><button onClick={() => onOpenDraft(draft.id)}><span><strong>{draft.title}</strong><small>{draft.reference} · {draft.status === 'approved' ? (locale === 'zh-CN' ? '已确认，待发布' : locale === 'ja' ? '確認済み・公開待ち' : 'Approved, awaiting publication') : draft.status === 'needs_revision' ? (locale === 'zh-CN' ? '需要修改' : locale === 'ja' ? '修正待ち' : 'Needs revision') : (locale === 'zh-CN' ? '查看并确认' : locale === 'ja' ? '確認する' : 'Review and confirm')}</small></span><ChevronRight size={18} /></button></li>)}</ul>
    </section> : null}
    <section className="learning-independent" aria-labelledby="learning-independent-title">
      <h2 id="learning-independent-title">{learning.independent}</h2>
      <div className="learning-practice-grid">{entries.map(entry => <button type="button" key={entry.title} onClick={entry.action}>
        <entry.icon size={32} aria-hidden="true" /><strong>{entry.title}</strong>
        {entry.count !== undefined ? <small>{entry.count} {entry.unit}</small> : <small>{entry.icon === Target ? (locale === 'zh-CN' ? '随机抽题' : locale === 'ja' ? 'ランダム抽出' : 'Random set') : '—'}</small>}
        {entry.rounds !== undefined ? <small><History size={16} aria-hidden="true" />{entry.rounds} {learning.rounds}</small> : null}
      </button>)}</div>
    </section>

    </div><aside className="home-learning-support" aria-label={support.week}>
      <section className="home-context-card">
        <div className="home-context-heading"><h2>{support.week}</h2><span>{support.range}</span></div>
        <div className="home-activity-totals">
          <div><strong>{days.filter(day => day.answers + day.reviews > 0).length}<small>/ 7</small></strong><span>{support.days}</span></div>
          <div><strong>{days.reduce((sum, day) => sum + day.answers, 0)}</strong><span>{support.questions}</span></div>
          <div><strong>{days.reduce((sum, day) => sum + day.reviews, 0)}</strong><span>{support.reviews}</span></div>
        </div>
        <ol className="home-week-chart">{days.map(day => <li key={day.date}><div className="home-week-bar-track"><span className={day.date === tokyoToday ? 'is-today' : ''} style={{ height: `${(day.answers + day.reviews) / maxActivity * 100}%` }} /></div><time dateTime={day.date}>{day.date.slice(5).replace('-', '/')}</time><small>{day.answers + day.reviews}</small></li>)}</ol>
        <button className="home-context-link" onClick={() => onNavigate('history')}>{support.records}<ArrowRight size={16} /></button>
      </section>
      <section className="home-context-card"><div className="home-context-heading"><h2>{support.focus}</h2></div><p className="home-context-hint">{support.hint}</p>
        {focus.length ? <ul className="home-focus-list">{focus.map(entry => <li key={entry.item.id}><button onClick={() => onNavigate(entry.item.deck === 'grammar_expression' ? 'grammar' : 'vocabulary', 'words', entry.item.id)}><span><strong>{entry.item.original}</strong><small>{[entry.wrong ? `${support.wrong} ${entry.wrong}` : '', entry.hard ? `${support.hard} ${entry.hard}` : ''].filter(Boolean).join(' · ')}</small></span><ChevronRight size={18} /></button></li>)}</ul> : <p className="home-context-empty">{support.empty}</p>}
      </section>
      {resumable && onResumeAttempt ? <section className="home-context-card home-resume-card"><div className="home-context-heading"><h2>{support.resume}</h2></div><h3>{resumable.title || support.unnamed}</h3><p className="home-context-hint">{resumable.answers.length} / {resumable.questionIds.length} {text.questions}</p><progress className="learning-progress" value={resumable.answers.length} max={resumable.questionIds.length} /><button className="home-context-link" onClick={() => onResumeAttempt(resumable)}>{support.action}<ArrowRight size={16} /></button></section> : null}
    </aside></div>
  </main>;
}
