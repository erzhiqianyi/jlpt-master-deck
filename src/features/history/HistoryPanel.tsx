import { buildMistakeEntries } from '../../domain/mistakes';
import { StudyText } from '../../components/StudyText';
import { DailySummaryPanel } from './DailySummaryPanel';
import './RecordHome.css';
import { LearningList, LearningListFrame, LearningListHeader, LearningListSearch, LearningListPagination, LearningListRow, LearningListSelect } from '../../components/LearningList';
import { useMobileList } from '../../hooks/useMobileList';
import { BatchActionBar, BatchManageButton, useListBatch, type BatchAction, type ListSelection } from '../../components/ListBatch';
import { BarChart3, Clock3, Archive, ArrowLeft, ArrowRight, CircleAlert, CheckCircle2, ChevronLeft, ChevronRight, Circle, History, Inbox, ListChecks, NotebookPen } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppView, LearningCapture, LearningCaptureStatus, Locale, PracticeAttempt, Question } from '../../types';

type AttemptFilter = {
  module: AppView | 'all';
  result: 'all' | 'wrong' | 'perfect';
  range: 'all' | 'today' | 'week' | 'month';
};

export function HistoryPanel({ labels, locale, captures, attempts, questions = [], onCaptureStatus, summaryToken, embedded = false, mode = 'both', recordSection: controlledRecordSection, selectedCaptureId: controlledCaptureId, onSelectedCaptureChange, selectedAttemptId: controlledAttemptId, onSelectedAttemptChange, attemptQuestionDetailOpen, onAttemptQuestionDetailChange, draftCount }: {
  labels: Record<string, string>;
  locale: Locale;
  captures: LearningCapture[];
  attempts: PracticeAttempt[];
  questions?: Question[];
  onCaptureStatus: (id: string, status: LearningCaptureStatus) => Promise<void>;
  summaryToken?: string;
  draftCount?: number;
  embedded?: boolean;
  mode?: 'both' | 'captures' | 'practice';
  recordSection?: 'home' | 'today' | 'history';
  selectedCaptureId?: string | null;
  onSelectedCaptureChange?: (id: string | null) => void;
  selectedAttemptId?: string | null;
  onSelectedAttemptChange?: (id: string | null) => void;
  attemptQuestionDetailOpen?: boolean;
  onAttemptQuestionDetailChange?: (open: boolean) => void;
}) {
  const [page, setPage] = useState(0);
  const [statisticsDate, setStatisticsDate] = useState(() => tokyoDateKey(new Date().toISOString()));
  const [captureSearch, setCaptureSearch] = useState('');
  const [captureFilter, setCaptureFilter] = useState<LearningCaptureStatus | 'all'>('all');
  const [view, setView] = useState<'captures' | 'practice'>('captures');
  const [uncontrolledAttemptId, setUncontrolledAttemptId] = useState<string | null>(null);
  const [attemptFilter, setAttemptFilter] = useState<AttemptFilter>({ module: 'all', result: 'all', range: 'all' });
  const [uncontrolledCaptureId, setUncontrolledCaptureId] = useState<string | null>(null);
  const [uncontrolledRecordSection, setUncontrolledRecordSection] = useState<'home' | 'today' | 'history'>(mode === 'both' ? 'history' : 'home');
  const activeView = mode === 'both' ? view : mode;
  const recordSection = controlledRecordSection ?? uncontrolledRecordSection;
  const selectedCaptureId = controlledCaptureId !== undefined ? controlledCaptureId : uncontrolledCaptureId;
  const selectedAttemptId = controlledAttemptId !== undefined ? controlledAttemptId : uncontrolledAttemptId;
  const setSelectedAttemptId = onSelectedAttemptChange ?? setUncontrolledAttemptId;
  const sortedAttempts = useMemo(() => attempts.filter((attempt) => Boolean(attempt.completedAt)).sort((first, second) => dateValue(second.completedAt ?? second.startedAt) - dateValue(first.completedAt ?? first.startedAt)), [attempts]);
  const statisticsAttempts = useMemo(() => sortedAttempts.filter(attempt => tokyoDateKey(attempt.completedAt ?? attempt.startedAt) === statisticsDate), [sortedAttempts, statisticsDate]);
  const todayAttempts = useMemo(() => sortedAttempts.filter((attempt) => isTodayAttempt(attempt)), [sortedAttempts]);
  const filteredAttempts = useMemo(() => sortedAttempts.filter((attempt) => attemptMatchesFilter(attempt, attemptFilter)), [attemptFilter, sortedAttempts]);
  const selectedAttempt = sortedAttempts.find((attempt) => attempt.id === selectedAttemptId);
  const selectedCapture = captures.find((capture) => capture.id === selectedCaptureId) ?? null;
  const setSelectedCaptureId = onSelectedCaptureChange ?? setUncontrolledCaptureId;
  const sortedCaptures = useMemo(() => captures.filter((capture) => (captureFilter === 'all' || capture.status === captureFilter) && (!captureSearch.trim() || `${capture.body} ${capture.context ?? ''}`.toLocaleLowerCase().includes(captureSearch.trim().toLocaleLowerCase()))).sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt)), [captures, captureFilter, captureSearch]);
  const captureBatch = useListBatch(useMemo(() => sortedCaptures.map((capture) => capture.id), [sortedCaptures]));
  const captureStatusOf = (id: string) => captures.find((capture) => capture.id === id)?.status;
  const captureBatchActions: BatchAction[] = ([['processed', CheckCircle2], ['inbox', Inbox], ['archived', Archive]] as const).map(([status, Icon]) => ({
    key: status, icon: <Icon size={16} aria-hidden="true" />,
    label: `${locale === 'ja' ? '一括で' : locale === 'en' ? 'Mark ' : '标为'}${captureStatusLabel(labels, status)}`,
    appliesTo: (id: string) => captureStatusOf(id) !== status,
    run: (id: string) => onCaptureStatus(id, status),
  }));

  useEffect(() => {
    setSelectedAttemptId(null);
    setSelectedCaptureId(null);
  }, [activeView, setSelectedCaptureId]);

  const showAttemptHistory = activeView === 'practice' && (mode === 'both' || recordSection === 'history');
  const count = activeView === 'captures' ? sortedCaptures.length : showAttemptHistory ? filteredAttempts.length : 0;
  const mobileList = useMobileList(count, JSON.stringify([activeView, attemptFilter, captureSearch, captureFilter]), 6);
  const pageCount = Math.max(1, Math.ceil(count / 6));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * 6;
  // Same footer for both record lists: infinite scroll on phones, shared pagination on desktop.
  const listFooter = count > 0 && mobileList.mobile
    ? <div ref={mobileList.setSentinel} className="catalog-notice" role="status">{mobileList.visible < count ? null : (locale === 'zh-CN' ? '已经到底了' : locale === 'ja' ? 'すべて表示しました' : 'End of list')}</div>
    : count > 0 && pageCount > 1
      ? <LearningListPagination page={currentPage} pages={pageCount} onChange={setPage} summary={`${start + 1}-${Math.min(start + 6, count)} / ${count}`} previous={locale === 'zh-CN' ? '上一页' : locale === 'ja' ? '前へ' : 'Previous'} next={locale === 'zh-CN' ? '下一页' : locale === 'ja' ? '次へ' : 'Next'} />
      : null;
  const detailOpen = activeView === 'captures' ? Boolean(selectedCapture) : Boolean(selectedAttempt);
  const openRecordSection = (section: 'today' | 'history') => {
    if (mode === 'practice' && typeof window !== 'undefined') {
      window.location.hash = `#/history/${section}`;
      return;
    }
    setUncontrolledRecordSection(section);
  };

  return (
    <section className={`${embedded ? 'py-0' : 'mx-auto w-full max-w-4xl py-2 md:py-5'} history-panel`}>
      {!embedded ? <h1 className="history-page-title">{labels.historyPageTitle}</h1> : null}

      {mode === 'both' ? <div className="mt-5 flex border-b border-[#d7dfd6]" role="tablist">
        <HistoryTab active={view === 'captures'} label={`${labels.historyCaptureTab} ${captures.length}`} onClick={() => setView('captures')} />
        <HistoryTab active={view === 'practice'} label={`${labels.historyPracticeTab} ${sortedAttempts.length}`} onClick={() => setView('practice')} />
      </div> : null}

      {detailOpen && !embedded ? <button type="button" className="gentle-back" onClick={() => { setSelectedCaptureId(null); setSelectedAttemptId(null); }}><ArrowLeft size={18} />{activeView === 'captures' ? labels.historyBackToCaptures : labels.historyBackToAttempts}</button> : null}
      {activeView === 'captures' ? (
        selectedCapture ? (
          <CaptureDetail
            labels={labels}
            locale={locale}
            capture={selectedCapture}
            onToggleStatus={() => onCaptureStatus(selectedCapture.id, selectedCapture.status === 'processed' ? 'inbox' : 'processed')}
          />
        ) : (
          <LearningListFrame locale={locale} className="learning-catalog mt-4" label={labels.historyCaptureTab}>
            <LearningListHeader title={labels.historyCaptureTab} appliedSummary={captureSearch || captureFilter !== 'all' ? [captureSearch, captureFilter !== 'all' ? captureStatusLabel(labels, captureFilter) : ''].filter(Boolean).join(' · ') : undefined} onReset={() => { setCaptureSearch(''); setCaptureFilter('all'); setPage(0); }} count={`${captures.length} ${locale === 'zh-CN' ? '项' : locale === 'ja' ? '件' : 'items'}`}><div className="list-tools"><LearningListSearch value={captureSearch} onChange={(value) => { setCaptureSearch(value); setPage(0); }} placeholder={locale === 'zh-CN' ? '搜索输入记录' : locale === 'ja' ? '記録を検索' : 'Search captures'} /><LearningListSelect value={captureFilter} onChange={(value) => { setCaptureFilter(value as LearningCaptureStatus | 'all'); setPage(0); }} hideLabel label={locale === 'zh-CN' ? '记录状态' : locale === 'ja' ? '状態' : 'Capture status'}>{(['all', 'inbox', 'processed', 'archived'] as const).map(status => <option key={status} value={status}>{status === 'all' ? (locale === 'zh-CN' ? '全部状态' : locale === 'ja' ? 'すべての状態' : 'All statuses') : captureStatusLabel(labels, status)}</option>)}</LearningListSelect><BatchManageButton batch={captureBatch} locale={locale} /></div></LearningListHeader>
            <BatchActionBar batch={captureBatch} actions={captureBatchActions} locale={locale} />
            <CaptureTable labels={labels} locale={locale} captures={sortedCaptures.slice(mobileList.mobile ? 0 : start, mobileList.mobile ? mobileList.visible : start + 6)} onSelect={setSelectedCaptureId} selection={captureBatch.selection} />
            {listFooter}
          </LearningListFrame>
        )
      ) : selectedAttempt ? (
        <PracticeAttemptDetail labels={labels} locale={locale} attempt={selectedAttempt} questions={questions} onBack={() => setSelectedAttemptId(null)} showBack={!embedded} questionDetailOpen={attemptQuestionDetailOpen} onQuestionDetailChange={onAttemptQuestionDetailChange} />
      ) : (
        <>

          {recordSection === 'home' ? (
            <RecordHome labels={labels} locale={locale} todayAttempts={todayAttempts} attempts={sortedAttempts} captures={captures} draftCount={draftCount} mistakeCount={buildMistakeEntries(sortedAttempts, questions, []).length} onSelectAttempt={setSelectedAttemptId} onOpenToday={() => openRecordSection('today')} onOpenHistory={() => { openRecordSection('history'); setPage(0); }} />
          ) : null}
          {recordSection === 'today' ? (
            <><label className="record-statistics-date"><span className="sr-only">{locale === 'zh-CN' ? '统计日期' : locale === 'ja' ? '集計日' : 'Statistics date'}</span><input type="date" aria-label={locale === 'zh-CN' ? '统计日期' : locale === 'ja' ? '集計日' : 'Statistics date'} value={statisticsDate} onChange={event => { if (event.target.value) setStatisticsDate(event.target.value); }} /></label><TodayPracticeSummary labels={labels} locale={locale} attempts={statisticsAttempts} onSelect={setSelectedAttemptId} />{summaryToken ? <details className="record-summary-disclosure"><summary>{locale === 'zh-CN' ? '学习总结' : locale === 'ja' ? '学習まとめ' : 'Learning summary'}</summary><DailySummaryPanel token={summaryToken} locale={locale} date={statisticsDate} hideDatePicker /></details> : null}</>
          ) : null}
          {showAttemptHistory ? (
            <>
              <LearningListFrame locale={locale} className="learning-catalog mt-4" label={labels.historyPracticeTab}>
                <LearningListHeader title={labels.historyPracticeTab} appliedSummary={attemptFilter.module !== 'all' || attemptFilter.result !== 'all' || attemptFilter.range !== 'all' ? [attemptFilter.module !== 'all' ? moduleLabel(labels, attemptFilter.module) : '', attemptFilter.result !== 'all' ? (attemptFilter.result === 'wrong' ? labels.historyFilterHasWrong : labels.historyFilterPerfect) : '', attemptFilter.range !== 'all' ? ({ today: labels.historyFilterToday, week: labels.historyFilterWeek, month: labels.historyFilterMonth }[attemptFilter.range]) : ''].filter(Boolean).join(' · ') : undefined} onReset={() => { setAttemptFilter({ module: 'all', result: 'all', range: 'all' }); setPage(0); }} count={`${filteredAttempts.length} / ${sortedAttempts.length}${locale === 'zh-CN' ? ' 次练习' : locale === 'ja' ? ' 回' : ' practices'} · ${sortedAttempts.reduce((sum, attempt) => sum + attempt.answers.length, 0)}${locale === 'zh-CN' ? ' 次作答' : locale === 'ja' ? ' 解答' : ' answers'}`}>
                  <PracticeAttemptFilters labels={labels} value={attemptFilter} attempts={sortedAttempts} onChange={(filter) => { setAttemptFilter(filter); setPage(0); }} />
                </LearningListHeader>
                <PracticeAttemptTable labels={labels} locale={locale} attempts={filteredAttempts.slice(mobileList.mobile ? 0 : start, mobileList.mobile ? mobileList.visible : start + 6)} startIndex={mobileList.mobile ? 0 : start} onSelect={setSelectedAttemptId} />
                {listFooter}
              </LearningListFrame>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

function RecordHome({ labels, locale, todayAttempts, attempts, captures, draftCount, mistakeCount, onOpenToday, onOpenHistory, onSelectAttempt }: {
  labels: Record<string, string>;
  locale: Locale;
  todayAttempts: PracticeAttempt[];
  draftCount?: number;
  mistakeCount: number;
  attempts: PracticeAttempt[];
  captures: LearningCapture[];
  onOpenToday: () => void;
  onOpenHistory: () => void;
  onSelectAttempt: (id: string) => void;
}) {
  const todayTotal = todayAttempts.reduce((sum, attempt) => sum + (attempt.summary?.total ?? attempt.answers.length), 0);
  const todayCorrect = todayAttempts.reduce((sum, attempt) => sum + (attempt.summary?.correct ?? attempt.answers.filter((answer) => answer.correct).length), 0);
  const todayAccuracy = todayTotal ? Math.round(todayCorrect / todayTotal * 100) : 0;
  const copy = locale === 'zh-CN'
    ? { today: '今天的积累', detail: '查看统计', practices: '完成练习', questions: '作答题数', accuracy: '正确率', review: '回顾与巩固', history: '练习历史', historySub: '回看每次练习与解析', mistakes: '错题集', mistakesSub: '找到需要再练的知识点', saved: '学习资料', captures: '输入记录', drafts: '练习草稿', draftsSub: '查看准备好的题目', empty: '今天还没有完成练习', practice: '去练习', total: '次练习', answers: '次作答', entries: '条记录' }
    : locale === 'ja'
      ? { today: '今日の積み重ね', detail: '統計を見る', practices: '完了した練習', questions: '解答数', accuracy: '正答率', review: '振り返りと復習', history: '練習履歴', historySub: '練習結果と解説を振り返る', mistakes: '間違いノート', mistakesSub: 'もう一度練習したい項目を確認', saved: '学習資料', captures: '入力履歴', drafts: '練習の下書き', draftsSub: '準備された問題を確認', empty: '今日はまだ練習していません', practice: '練習する', total: '回の練習', answers: '解答', entries: '件' }
      : { today: 'Today’s progress', detail: 'View statistics', practices: 'Practices', questions: 'Answers', accuracy: 'Accuracy', review: 'Review and improve', history: 'Practice history', historySub: 'Revisit results and explanations', mistakes: 'Mistake notebook', mistakesSub: 'Find learning points to practice again', saved: 'Study materials', captures: 'Input records', drafts: 'Practice drafts', draftsSub: 'Check prepared questions', empty: 'No completed practice today', practice: 'Practice', total: 'practices', answers: 'answers', entries: 'records' };

  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${tokyoDateKey(new Date().toISOString())}T12:00:00+09:00`);
    date.setUTCDate(date.getUTCDate() - (6 - index));
    const key = tokyoDateKey(date.toISOString());
    const total = attempts.filter(attempt => tokyoDateKey(attempt.completedAt ?? attempt.startedAt) === key)
      .reduce((sum, attempt) => sum + (attempt.summary?.total ?? attempt.answers.length), 0);
    return { key, total };
  });
  const weekMax = Math.max(1, ...week.map(day => day.total));
  const weekTitle = locale === 'zh-CN' ? '近七天作答' : locale === 'ja' ? '直近7日間の解答' : 'Answers over the last 7 days';

  const t = (zh: string, ja: string, en: string) => locale === 'zh-CN' ? zh : locale === 'ja' ? ja : en;
  const totalAnswers = attempts.reduce((sum, attempt) => sum + (attempt.summary?.total ?? attempt.answers.length), 0);
  const totalCorrect = attempts.reduce((sum, attempt) => sum + (attempt.summary?.correct ?? attempt.answers.filter(answer => answer.correct).length), 0);
  const moduleViews = [...new Set<AppView>(['vocabulary', 'grammar', 'reading', 'listening', ...attempts.map(attempt => attempt.view)])];
  const modules = moduleViews.map(view => {
    const records = attempts.filter(attempt => attempt.view === view);
    const total = records.reduce((sum, attempt) => sum + (attempt.summary?.total ?? attempt.answers.length), 0);
    const correct = records.reduce((sum, attempt) => sum + (attempt.summary?.correct ?? attempt.answers.filter(answer => answer.correct).length), 0);
    return { view, total, accuracy: total ? Math.round(correct / total * 100) : null };
  });

  return (
    <div className="record-home" aria-label={labels.navStatsHome}>
      <div className="record-mobile-summary"><Clock3 size={24} aria-hidden="true" /><strong>{todayAttempts.length ? `${copy.practices} ${todayAttempts.length} · ${todayTotal} ${copy.answers}` : copy.empty}</strong><a href="#/mixed/tips">{copy.practice}<ArrowRight size={16} aria-hidden="true" /></a></div>
      <section className="record-home-today" aria-labelledby="record-today-title">
        <header><div><span>{formatTodayLabel(locale)}</span><h2 id="record-today-title">{copy.today}</h2></div><button type="button" onClick={onOpenToday}>{copy.detail}<ArrowRight size={16} aria-hidden="true" /></button></header>
        <dl className="record-home-stats">
          <div><dt>{copy.practices}</dt><dd>{todayAttempts.length}</dd></div>
          <div><dt>{copy.questions}</dt><dd>{todayTotal}</dd></div>
          <div><dt>{copy.accuracy}</dt><dd>{todayTotal ? `${todayAccuracy}%` : '—'}</dd></div>
        </dl>
        {!todayAttempts.length ? <p className="record-home-empty-note">{copy.empty} · <a href="#/mixed/tips">{copy.practice}<ArrowRight size={14} aria-hidden="true" /></a></p> : null}
      </section>
      <section className="record-home-trend" aria-labelledby="record-trend-title">
        <header><h2 id="record-trend-title">{weekTitle}</h2><span>{week.reduce((sum, day) => sum + day.total, 0)} {copy.answers}</span></header>
        <div className="record-week-chart">
          {week.map(day => <div key={day.key} className="record-week-day" aria-label={`${day.key}: ${day.total} ${copy.answers}`}>
            <strong>{day.total}</strong><div className="record-week-track"><span style={{ height: `${day.total / weekMax * 100}%` }} /></div><time dateTime={day.key}>{day.key.slice(5).replace('-', '/')}</time>
          </div>)}
        </div>
      </section>
      <section className="record-dashboard-total" aria-labelledby="record-total-title">
        <h2 id="record-total-title">{t('累计概况', '累計', 'Overall progress')}</h2>
        <p className="record-dashboard-note">{t('基于当前保留的已完成练习', '保存されている完了済み練習の集計', 'Based on retained completed practices')}</p>
        <dl className="record-home-stats">
          <div><dt>{copy.questions}</dt><dd>{totalAnswers}</dd></div>
          <div><dt>{copy.accuracy}</dt><dd>{totalAnswers ? `${Math.round(totalCorrect / totalAnswers * 100)}%` : '—'}</dd></div>
          <div><dt>{t('七天活跃', '7日間の活動日', 'Active days / 7')}</dt><dd>{week.filter(day => day.total > 0).length}<small> / 7</small></dd></div>
        </dl>
      </section>
      <section className="record-dashboard-modules" aria-labelledby="record-modules-title">
        <h2 id="record-modules-title">{t('模块表现', '分野別の成績', 'Module performance')}</h2>
        <p className="record-dashboard-note">{t('累计作答 · 正确率', '累計解答数・正答率', 'Total answers · accuracy')}</p>
        <div className="record-module-metrics">{modules.map(module => <div key={module.view}>
          <div><strong>{moduleLabel(labels, module.view)}</strong><span>{module.total} {copy.answers} · {module.accuracy === null ? '—' : `${module.accuracy}%`}</span></div>
          <div className="record-module-track" aria-hidden="true"><span style={{ width: `${module.accuracy ?? 0}%` }} /></div>
        </div>)}</div>
      </section>
      <section className="record-dashboard-recent" aria-labelledby="record-recent-title">
        <header><h2 id="record-recent-title">{t('最近练习', '最近の練習', 'Recent practices')}</h2><button type="button" onClick={onOpenHistory}>{t('查看全部', 'すべて見る', 'View all')}<ArrowRight size={16} aria-hidden="true" /></button></header>
        {attempts.length ? <ul>{attempts.slice(0, 4).map(attempt => <li key={attempt.id}><button type="button" onClick={() => onSelectAttempt(attempt.id)}>
          <span><strong>{attempt.title?.trim() || moduleLabel(labels, attempt.view)}</strong><small>{tokyoDateKey(attempt.completedAt ?? attempt.startedAt)} · {attempt.summary?.total ?? attempt.answers.length} {copy.answers}</small></span><ChevronRight size={18} aria-hidden="true" />
        </button></li>)}</ul> : <div className="record-dashboard-empty"><History size={28} aria-hidden="true" /><p>{t('完成一次练习后，在这里回顾结果。', '練習を完了すると、ここで結果を確認できます。', 'Complete a practice to review its results here.')}</p><a href="#/mixed/tips">{copy.practice}<ArrowRight size={16} aria-hidden="true" /></a></div>}
      </section>
      <section className="record-home-review" aria-labelledby="record-review-title">
        <h2 id="record-review-title">{copy.review}</h2>
        <div className="record-home-primary-links record-home-links">
          <button type="button" onClick={onOpenHistory}><History size={25} aria-hidden="true" /><span><strong>{copy.history}</strong><small>{attempts.length} {copy.total} · {attempts.reduce((sum, attempt) => sum + attempt.answers.length, 0)} {copy.answers}</small></span><ChevronRight size={18} aria-hidden="true" /></button>
          <a href="#/mistakes"><CircleAlert size={25} aria-hidden="true" /><span><strong>{copy.mistakes}</strong><small>{mistakeCount} {locale === 'zh-CN' ? '个知识点' : locale === 'ja' ? '項目' : 'learning points'}</small></span><ChevronRight size={18} aria-hidden="true" /></a>
        </div>
      </section>
      <section className="record-home-materials" aria-labelledby="record-materials-title">
        <h2 id="record-materials-title">{copy.saved}</h2>
        <div className="record-home-links">
          <a href="#/captures"><NotebookPen size={21} aria-hidden="true" /><span><strong>{copy.captures}</strong><small>{captures.length} {copy.entries}</small></span><ChevronRight size={18} aria-hidden="true" /></a>
          <a href="#/drafts"><ListChecks size={21} aria-hidden="true" /><span><strong>{copy.drafts}</strong><small>{draftCount === undefined ? copy.draftsSub : `${draftCount} ${copy.entries}`}</small></span><ChevronRight size={18} aria-hidden="true" /></a>
          <button type="button" className="record-mobile-statistics" onClick={onOpenToday}><BarChart3 size={21} aria-hidden="true" /><span><strong>{t('学习统计', '学習統計', 'Study statistics')}</strong></span><ChevronRight size={18} aria-hidden="true" /></button>

        </div>
      </section>
    </div>
  );
}

function TodayPracticeSummary({ labels, locale, attempts, onSelect }: {
  labels: Record<string, string>;
  locale: Locale;
  attempts: PracticeAttempt[];
  onSelect: (id: string) => void;
}) {
  const totals = attempts.reduce((summary, attempt) => {
    const total = attempt.summary?.total ?? attempt.answers.length;
    const correct = attempt.summary?.correct ?? attempt.answers.filter((answer) => answer.correct).length;
    return {
      total: summary.total + total,
      correct: summary.correct + correct,
      elapsedMs: summary.elapsedMs + (attempt.summary?.elapsedMs ?? 0),
    };
  }, { total: 0, correct: 0, elapsedMs: 0 });
  const accuracy = totals.total ? Math.round((totals.correct / totals.total) * 100) : 0;
  const latestAttempts = attempts;
  const title = locale === 'zh-CN' ? '练习记录' : locale === 'ja' ? '練習記録' : 'Practice records';

  const unit = locale === 'zh-CN' ? '次练习' : locale === 'ja' ? '回' : 'practices';
  return (
    <LearningListFrame locale={locale} className="learning-catalog mt-4" label={title}>

      {attempts.length ? (
        <>
          <dl className="list-stats">
            <div><dt>{locale === 'zh-CN' ? '练习' : locale === 'ja' ? '練習' : 'Practices'}</dt><dd>{attempts.length}</dd></div>
            <div><dt>{locale === 'zh-CN' ? '作答' : locale === 'ja' ? '解答' : 'Answers'}</dt><dd>{totals.total}</dd></div>
            <div><dt>{locale === 'zh-CN' ? '正确率' : locale === 'ja' ? '正答率' : 'Accuracy'}</dt><dd>{accuracy}%</dd></div>
            <div><dt>{locale === 'zh-CN' ? '用时' : locale === 'ja' ? '時間' : 'Time'}</dt><dd>{formatDuration(totals.elapsedMs)}</dd></div>
          </dl>
          <LearningList locale={locale} columnLabels={[title, locale === "ja" ? "時間・問題数" : locale === "en" ? "Time / questions" : "时间与题数", locale === "ja" ? "結果" : locale === "en" ? "Result" : "结果"]}>{latestAttempts.map((attempt) => <LearningListRow key={attempt.id} title={attempt.title?.trim() || moduleLabel(labels, attempt.view)} description={`${new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }).format(new Date(attempt.completedAt ?? attempt.startedAt))} · ${attempt.summary?.total ?? attempt.answers.length} ${locale === 'zh-CN' ? '题' : locale === 'ja' ? '問' : 'questions'}`} status={summaryText(attempt)} locale={locale} onOpen={() => onSelect(attempt.id)}/>)}</LearningList>
        </>
      ) : <LearningList locale={locale} columnLabels={[title, locale === "ja" ? "時間・問題数" : locale === "en" ? "Time / questions" : "时间与题数", locale === "ja" ? "結果" : locale === "en" ? "Result" : "结果"]}/>}
    </LearningListFrame>
  );
}

function CaptureTable({ labels, locale, captures, onSelect, selection }: {
  labels: Record<string, string>;
  locale: Locale;
  captures: LearningCapture[];
  onSelect: (id: string) => void;
  selection?: ListSelection;
}) {
  return <LearningList locale={locale} selection={selection} columnLabels={[labels.historyCaptureTab, locale === "ja" ? "種類" : locale === "en" ? "Category" : "分类", locale === "ja" ? "状態" : locale === "en" ? "Status" : "状态"]}>{captures.map((capture) => <LearningListRow key={capture.id} selectId={capture.id} title={captureSummary(capture).title} description={`${labels[`captureCategory_${capture.category}`]} · ${formatDate(capture.createdAt, locale)}`} statusKind={capture.status} status={captureStatusLabel(labels, capture.status)} locale={locale} onOpen={() => onSelect(capture.id)}/>)}</LearningList>;

}

function CaptureDetail({ labels, locale, capture, onToggleStatus }: {
  labels: Record<string, string>;
  locale: Locale;
  capture: LearningCapture;
  onToggleStatus: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  async function toggleStatus() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await onToggleStatus(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : labels.planSaveFailed); }
    finally { pending.current = false; setBusy(false); }
  }
  const parsed = parseCaptureBody(capture.body);
  const summary = captureSummary(capture);

  return (
    <div className="capture-record-detail">
      <article className="rounded-lg border border-[#d7dfd6] bg-white p-4 md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="text-[#7d6032]">{labels[`captureCategory_${capture.category}`]}</span>
            {capture.targetDeck ? <span className="text-[#31564c]">{captureTargetDeckLabel(labels, capture)}</span> : null}
            <span className="text-[#727c75]">{formatDate(capture.createdAt, locale)}</span>
          </div>
          <h2 className="mt-2 text-lg font-semibold leading-7 text-[#27312c]">{summary.title}</h2>
          {summary.subtitle ? <p className="mt-1 text-sm leading-6 text-[#657069]">{summary.subtitle}</p> : null}
        </div>

      </div>

      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      {capture.context ? <InfoBlock title={labels.captureContextLabel ?? 'Context'}>{capture.context}</InfoBlock> : null}
      <div className="mt-5">
        <h3 className="text-sm font-semibold text-[#27312c]">{labels.captureDetailTitle ?? labels.historyCaptureTab}</h3>
        <div className="mt-3 space-y-4">
          <StructuredCaptureContent value={parsed ?? capture.body} labels={labels} />
        </div>
      </div>
        <button type="button" onClick={() => void toggleStatus()} disabled={busy} aria-busy={busy} className="capture-record-save">
          {busy ? labels.processing : capture.status === 'processed' ? labels.captureMarkInbox : labels.captureMarkProcessed}
        </button>
      </article>
    </div>
  );
}

function StructuredCaptureContent({ value, labels }: { value: unknown; labels: Record<string, string> }) {
  if (typeof value === 'string') {
    return <p className="whitespace-pre-wrap text-sm leading-7 text-[#34413b]">{value}</p>;
  }
  if (!value || typeof value !== 'object') {
    return <p className="text-sm leading-7 text-[#34413b]">{String(value ?? '')}</p>;
  }

  const record = value as Record<string, unknown>;
  const grammarItems = Array.isArray(record.grammar_items) ? record.grammar_items : [];
  const remainingEntries = Object.entries(record).filter(([key]) => key !== 'grammar_items' && hasDisplayValue(record[key]));

  return (
    <>
      {remainingEntries.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {remainingEntries.map(([key, item]) => <DetailRow key={key} label={captureFieldLabel(labels, key)} value={item} />)}
        </div>
      ) : null}

      {grammarItems.length ? (
        <section>
          <h4 className="text-xs font-bold uppercase tracking-wide text-[#6f7a73]">{labels.captureGrammarItems ?? 'Grammar items'}</h4>
          <div className="mt-2 space-y-3">
            {grammarItems.map((item, index) => (
              <GrammarItem key={captureItemKey(item, index)} item={item} index={index} labels={labels} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function GrammarItem({ item, index, labels }: { item: unknown; index: number; labels: Record<string, string> }) {
  const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
  const expression = stringValue(record.expression) || `#${index + 1}`;
  const rows = [
    [labels.captureField_meaning_zh ?? 'Meaning', record.meaning_zh ?? record.meaning],
    [labels.captureField_connection ?? 'Connection', record.connection],
    [labels.captureField_usage ?? 'Usage', record.usage],
    [labels.captureField_example_ja ?? 'Example', record.example_ja],
    [labels.captureField_example_zh ?? 'Translation', record.example_zh],
    [labels.captureField_core_memory ?? 'Memory', record.core_memory],
  ].filter(([, value]) => hasDisplayValue(value));

  return (
    <div className="rounded-md border border-[#e2e7e1] bg-[#fbfcfa] p-3">
      <h5 className="text-base font-semibold text-[#27312c]">{expression}</h5>
      <div className="mt-2 grid gap-2">
        {rows.map(([label, value]) => <DetailRow key={label as string} label={label as string} value={value} />)}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: unknown }) {
  if (!hasDisplayValue(value)) return null;
  return (
    <div className="rounded-md bg-[#f6f8f5] px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#6f7a73]">{label}</p>
      <div className="mt-1 text-sm leading-6 text-[#34413b]">{renderValue(value)}</div>
    </div>
  );
}

function InfoBlock({ title, children }: { title: string; children: string }) {
  return (
    <div className="mt-4 rounded-md bg-[#f6f8f5] px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#6f7a73]">{title}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#34413b]">{children}</p>
    </div>
  );
}

function HistoryTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`min-h-11 border-b-2 px-4 text-sm font-semibold ${active ? 'border-[#31564c] text-[#31564c]' : 'border-transparent text-[#707a74]'}`}>{label}</button>;
}

function PracticeAttemptFilters({ labels, value, attempts, onChange }: {
  labels: Record<string, string>;
  value: AttemptFilter;
  attempts: PracticeAttempt[];
  onChange: (value: AttemptFilter) => void;
}) {
  const modules = unique(attempts.map((attempt) => attempt.view));
  return (
    <>
      <LearningListSelect label={labels.historyFilterModule} value={value.module} onChange={(module) => onChange({ ...value, module: module as AttemptFilter['module'] })}>
        <option value="all">{labels.historyFilterAllModules}</option>
        {modules.map((module) => <option key={module} value={module}>{moduleLabel(labels, module)}</option>)}
      </LearningListSelect>
      <LearningListSelect label={labels.historyFilterResult} value={value.result} onChange={(result) => onChange({ ...value, result: result as AttemptFilter['result'] })}>
        <option value="all">{labels.historyFilterAllResults}</option>
        <option value="wrong">{labels.historyFilterHasWrong}</option>
        <option value="perfect">{labels.historyFilterPerfect}</option>
      </LearningListSelect>
      <LearningListSelect label={labels.historyFilterRange} value={value.range} onChange={(range) => onChange({ ...value, range: range as AttemptFilter['range'] })}>
        <option value="all">{labels.historyFilterAllTime}</option>
        <option value="today">{labels.historyFilterToday}</option>
        <option value="week">{labels.historyFilterWeek}</option>
        <option value="month">{labels.historyFilterMonth}</option>
      </LearningListSelect>
    </>
  );
}

function PracticeAttemptTable({ labels, locale, attempts, onSelect }: {
  labels: Record<string, string>;
  locale: Locale;
  attempts: PracticeAttempt[];
  startIndex: number;
  onSelect: (id: string) => void;
}) {
  // One flat list; the date moves into each row instead of splitting the list into day sections.
  const attemptDate = (attempt: PracticeAttempt) => new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Tokyo', month: 'short', day: 'numeric' }).format(new Date(attempt.completedAt ?? attempt.startedAt));
  return <div className="learning-history-list">
    <LearningList locale={locale} columnLabels={[locale === "ja" ? "練習" : locale === "en" ? "Practice" : "练习", locale === "ja" ? "日時・問題数・時間" : locale === "en" ? "Date / questions / duration" : "日期、题数与用时", locale === "ja" ? "結果" : locale === "en" ? "Result" : "结果"]}>{attempts.map((attempt) => <LearningListRow key={attempt.id} title={attempt.title?.trim() || moduleLabel(labels, attempt.view)} description={`${attemptDate(attempt)} · ${attempt.answers.length} ${locale === 'zh-CN' ? '题' : locale === 'ja' ? '問' : 'questions'} · ${formatDuration(attempt.summary?.elapsedMs)}`} status={summaryText(attempt)} locale={locale} onOpen={() => onSelect(attempt.id)}/>)}</LearningList>
  </div>;
}

function PracticeAttemptDetail({ labels, locale, attempt, questions, onBack, showBack = true, questionDetailOpen = false, onQuestionDetailChange }: {
  labels: Record<string, string>;
  locale: Locale;
  attempt: PracticeAttempt;
  questions: Question[];
  onBack: () => void;
  showBack?: boolean;
  questionDetailOpen?: boolean;
  onQuestionDetailChange?: (open: boolean) => void;
}) {
  const [resultFilter, setResultFilter] = useState<'all' | 'wrong' | 'correct'>('all');
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null);
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const answers = attempt.answers.length
    ? attempt.answers
    : attempt.questionIds.map((questionId) => {
      const question = questionMap.get(questionId);
      return {
        questionId,
        itemId: question?.itemId ?? '',
        kind: question?.kind ?? 'meaning',
        selected: '',
        correct: false,
        answeredAt: '',
        elapsedMs: 0,
      };
    });
  const filteredAnswers = answers
    .map((answer, index) => ({ answer, index }))
    .filter(({ answer }) => resultFilter === 'all' || (resultFilter === 'correct' ? answer.correct : !answer.correct));
  const selectedPosition = filteredAnswers.findIndex(({ index }) => index === selectedAnswerIndex);
  const selectedEntry = selectedPosition >= 0 ? filteredAnswers[selectedPosition] : null;

  useEffect(() => {
    setSelectedAnswerIndex(null);
    onQuestionDetailChange?.(false);
  }, [attempt.id, onQuestionDetailChange]);

  function openQuestion(index: number) {
    setSelectedAnswerIndex(index);
    onQuestionDetailChange?.(true);
  }

  if (questionDetailOpen && selectedEntry) {
    return (
      <AttemptQuestionDetail
        labels={labels}
        locale={locale}
        entry={selectedEntry}
        position={selectedPosition}
        total={filteredAnswers.length}
        question={questionMap.get(selectedEntry.answer.questionId)}
        onBack={() => onQuestionDetailChange?.(false)}
        onPrevious={() => setSelectedAnswerIndex(filteredAnswers[selectedPosition - 1]?.index ?? selectedEntry.index)}
        onNext={() => setSelectedAnswerIndex(filteredAnswers[selectedPosition + 1]?.index ?? selectedEntry.index)}
      />
    );
  }

  return (
    <div className="mt-5">
      {showBack ? <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#31564c] hover:underline">
        <ArrowLeft size={17} /> {labels.historyBackToAttempts}
      </button> : null}
      <div className="mt-4 rounded-lg border border-[#d7dfd6] bg-white p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#27312c]">{attempt.title?.trim() || labels.historyAttemptDetail}</h2>
            <p className="mt-1 text-sm text-[#68716b]">{moduleLabel(labels, attempt.view)} · {formatDate(attempt.completedAt ?? attempt.startedAt, locale)}</p>
          </div>
          <p className="text-sm font-semibold text-[#31564c]">{summaryText(attempt)}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-y border-[#e3e8e2] py-4 sm:grid-cols-4">
          <DetailMetric label={labels.correct} value={`${attempt.summary?.correct ?? answers.filter((answer) => answer.correct).length} / ${attempt.summary?.total ?? answers.length}`} />
          <DetailMetric label={labels.accuracy} value={`${Math.round((attempt.summary?.accuracy ?? accuracyFor(answers)) * 100)}%`} />
          <DetailMetric label={labels.wrongQuestions} value={String(attempt.summary?.wrong ?? answers.filter((answer) => !answer.correct).length)} />
          <DetailMetric label={labels.elapsed} value={formatDuration(attempt.summary?.elapsedMs)} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label={labels.historyFilterResult}>
          {([
            ['all', labels.historyFilterAllResults],
            ['wrong', labels.wrong],
            ['correct', labels.correct],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={resultFilter === value}
              onClick={() => setResultFilter(value)}
              className={`min-h-9 rounded-full border px-3 text-sm font-semibold ${resultFilter === value ? 'border-[#31564c] bg-[#edf4ef] text-[#31564c]' : 'border-[#d7dfd6] bg-white text-[#68716b]'}`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto text-xs font-semibold text-[#68716b]">
            {labels.historyFilterCount.replace('{shown}', String(filteredAnswers.length)).replace('{total}', String(answers.length))}
          </span>
        </div>
        {filteredAnswers.length ? <>
        <LearningList locale={locale} columnLabels={locale === "ja" ? ["問題", "内容", "結果"] : locale === "en" ? ["Question", "Content", "Result"] : ["题目", "内容", "结果"]}>{filteredAnswers.map(({ answer, index }) => <LearningListRow key={`${answer.questionId}-${index}`} title={questionKeyText(questionMap.get(answer.questionId), answer)} description={questionMap.get(answer.questionId)?.prompt} statusKind={answer.correct ? 'correct' : 'incorrect'} status={answer.correct ? labels.correct : labels.wrong} locale={locale} onOpen={() => openQuestion(index)}/>)}</LearningList>
        </> : <p className="py-10 text-center text-sm text-[#7a807b]">{labels.historyNoFilteredAnswers}</p>}
      </div>
    </div>
  );
}

export function AttemptQuestionDetail({ labels, locale, entry, position, total, question, onBack, onPrevious, onNext }: {
  labels: Record<string, string>;
  locale: Locale;
  entry: { answer: PracticeAttempt['answers'][number]; index: number };
  position: number;
  total: number;
  question?: Question;
  onBack: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { answer, index } = entry;
  return (
    <div className="mt-3">
      <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#31564c] hover:underline">
        <ArrowLeft size={17} /> {labels.historyBackToAttemptQuestions}
      </button>
      <article className="mt-3 rounded-lg border border-[#d7dfd6] bg-white p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#7a807b]">#{index + 1} · {position + 1} / {total}</p>
            <h2 className="mt-1 break-words text-xl font-semibold leading-8 text-[#27312c]">{questionKeyText(question, answer)}</h2>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${answer.correct ? 'bg-[#edf4ef] text-[#356146]' : 'bg-[#fff0f5] text-[#a84269]'}`}>
            {answer.correct ? labels.correct : labels.wrong}
          </span>
        </div>

        {question?.prompt ? <p className="mt-4 whitespace-pre-wrap break-words rounded-md bg-[#f6f8f5] p-4 text-base leading-8 text-[#34413b]">{question.prompt}</p> : null}
        {question?.translationZh ? <QuestionExplanation title={labels.fullChineseTranslation ?? '完整中文翻译'} body={question.translationZh} /> : null}

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuestionDetailValue label={labels.yourAnswer} value={answer.selected || '-'} tone={answer.correct ? 'correct' : 'wrong'} />
          <QuestionDetailValue label={labels.rightAnswer} value={question?.answer ?? '-'} tone="correct" />
          <QuestionDetailValue label={labels.elapsed} value={formatDuration(answer.elapsedMs)} />
          <QuestionDetailValue label={locale === 'zh-CN' ? '开始时间' : locale === 'ja' ? '開始時刻' : 'Started'} value={formatClock(answer.startedAt, locale)} />
          <QuestionDetailValue label={locale === 'zh-CN' ? '作答时间' : locale === 'ja' ? '回答時刻' : 'Answered'} value={formatClock(answer.answeredAt, locale)} />
        </dl>

        {question?.correctReason ? <QuestionExplanation title={labels.correctReasonLabel} body={question.correctReason} /> : null}
        {question?.choiceAnalysis?.length ? (
          <section className="mt-5 border-t border-[#e3e8e2] pt-4">
            <h3 className="text-sm font-semibold text-[#27312c]">{labels.choiceAnalysisLabel}</h3>
            <div className="mt-3 space-y-2">
              {question.choiceAnalysis.map((choice) => (
                <div key={choice.choice} className={`rounded-md border p-3 ${choice.correct ? 'border-[#bdd2c4] bg-[#f2f7f3]' : choice.choice === answer.selected ? 'border-[#ebc4d1] bg-[#fff5f8]' : 'border-[#e3e8e2] bg-white'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <strong className="break-words text-sm text-[#27312c]">{choice.choice}</strong>
                    <span className="shrink-0 text-xs font-semibold text-[#68716b]">{choice.correct ? labels.correct : choice.choice === answer.selected ? labels.yourAnswer : ''}</span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-[#68716b]">{choice.explanation}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {question?.memoryPoint ? <QuestionExplanation title={labels.memoryPointLabel} body={question.memoryPoint} /> : null}

        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-[#e3e8e2] pt-4">
          <button type="button" onClick={onPrevious} disabled={position <= 0} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#cfd8cf] px-3 text-sm font-semibold text-[#31564c] disabled:cursor-not-allowed disabled:opacity-35">
            <ChevronLeft size={18} /> {labels.prev}
          </button>
          <button type="button" onClick={onNext} disabled={position >= total - 1} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#cfd8cf] px-3 text-sm font-semibold text-[#31564c] disabled:cursor-not-allowed disabled:opacity-35">
            {labels.next} <ChevronRight size={18} />
          </button>
        </div>
      </article>
    </div>
  );
}

function QuestionDetailValue({ label, value, tone }: { label: string; value: string; tone?: 'correct' | 'wrong' }) {
  const color = tone === 'correct' ? 'text-[#31564c]' : tone === 'wrong' ? 'text-[#a84269]' : 'text-[#4f5b55]';
  return <div className="min-w-0 rounded-md bg-[#f6f8f5] p-3"><dt className="text-xs text-[#707a74]">{label}</dt><dd className={`mt-1 break-words text-base font-semibold ${color}`}>{value}</dd></div>;
}

function QuestionExplanation({ title, body }: { title: string; body: string }) {
  return <section className="mt-5 border-t border-[#e3e8e2] pt-4"><h3 className="text-sm font-semibold text-[#27312c]">{title}</h3><StudyText className="mt-2 text-sm text-[#4f5b55]" text={body} /></section>;
}

function questionKeyText(question: Question | undefined, answer: PracticeAttempt['answers'][number]) {
  if (!question) return answer.itemId || answer.questionId;
  if (question.kind === 'kana_to_kanji' || question.kind === 'grammar' || question.kind === 'moji_goi') {
    return question.answer || question.promptTarget || question.itemId;
  }
  return question.promptTarget || question.answer || question.itemId;
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-[#707a74]">{label}</p><p className="mt-1 text-lg font-semibold text-[#27312c]">{value}</p></div>;
}

function parseCaptureBody(body: string) {
  const trimmed = body.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function captureSummary(capture: LearningCapture) {
  const parsed = parseCaptureBody(capture.body);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    const grammarItems = Array.isArray(record.grammar_items) ? record.grammar_items : [];
    const firstGrammar = grammarItems[0] && typeof grammarItems[0] === 'object' ? grammarItems[0] as Record<string, unknown> : null;
    const title = stringValue(firstGrammar?.expression) || stringValue(record.title) || stringValue(record.source) || compactText(capture.body);
    const fallbackSubtitle = grammarItems.length ? `${grammarItems.length} grammar item${grammarItems.length > 1 ? 's' : ''}` : compactText(capture.body);
    const subtitle = stringValue(firstGrammar?.meaning_zh) || stringValue(firstGrammar?.usage) || fallbackSubtitle;
    return { title: compactText(title), subtitle: compactText(subtitle) };
  }
  return { title: compactText(capture.body), subtitle: capture.context ? compactText(capture.context) : '' };
}

function renderValue(value: unknown): ReactNode {
  if (Array.isArray(value)) {
    return (
      <ul className="list-disc space-y-1 pl-5">
        {value.map((item, index) => <li key={captureItemKey(item, index)}>{renderInlineValue(item)}</li>)}
      </ul>
    );
  }
  if (value && typeof value === 'object') {
    return (
      <div className="space-y-1">
        {Object.entries(value as Record<string, unknown>)
          .filter(([, item]) => hasDisplayValue(item))
          .map(([key, item]) => (
            <p key={key}><span className="font-semibold text-[#27312c]">{humanizeKey(key)}:</span> {renderInlineValue(item)}</p>
          ))}
      </div>
    );
  }
  return <span className="whitespace-pre-wrap">{String(value)}</span>;
}

function renderInlineValue(value: unknown): ReactNode {
  if (Array.isArray(value)) return value.map((item) => inlineText(item)).join(', ');
  return inlineText(value);
}

function inlineText(value: unknown) {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return stringValue(record.expression) || stringValue(record.title) || Object.entries(record).map(([key, item]) => `${humanizeKey(key)}: ${String(item)}`).join('; ');
  }
  return String(value);
}

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatTodayLabel(locale: Locale) {
  return new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
}

function tokyoDateKey(value: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

function isTodayAttempt(attempt: PracticeAttempt) {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
  return formatter.format(new Date(attempt.completedAt ?? attempt.startedAt)) === formatter.format(new Date());
}

function formatDuration(ms: number | undefined) {
  const totalSeconds = Math.max(0, Math.round((ms ?? 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatClock(value: string | undefined, locale: Locale) {
  if (!value || !dateValue(value)) return '-';
  return new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Tokyo', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
}

function dateValue(value: string) {
  return new Date(value).getTime() || 0;
}

function hasDisplayValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return String(value).trim().length > 0;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function compactText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function humanizeKey(key: string) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function captureFieldLabel(labels: Record<string, string>, key: string) {
  return labels[`captureField_${key}`] ?? humanizeKey(key);
}

function captureStatusLabel(labels: Record<string, string>, status: LearningCaptureStatus) {
  return labels[`captureStatus_${status}`] ?? status;
}

function captureTargetDeckLabel(labels: Record<string, string>, capture: LearningCapture) {
  if (capture.targetWordbookTitle) return capture.targetWordbookTitle;
  const deck = capture.targetDeck;
  if (deck === 'name_reading') return labels.deckName;
  if (deck === 'grammar_expression') return labels.deckExpression;
  return labels.deckN1;
}

function captureItemKey(item: unknown, index: number) {
  if (item && typeof item === 'object' && 'id' in item && typeof (item as { id?: unknown }).id === 'string') return (item as { id: string }).id;
  return String(index);
}

function moduleLabel(labels: Record<string, string>, view: PracticeAttempt['view']) {
  if (view === 'daily-practice') return labels.dailyPracticeTitle;
  return labels[`nav${viewName(view)}`] ?? view;
}

function summaryText(attempt: PracticeAttempt) {
  return `${attempt.summary?.correct ?? attempt.answers.filter((answer) => answer.correct).length} / ${attempt.summary?.total ?? attempt.answers.length} · ${Math.round((attempt.summary?.accuracy ?? accuracyFor(attempt.answers)) * 100)}%`;
}

function accuracyFor(answers: { correct: boolean }[]) {
  return answers.length ? answers.filter((answer) => answer.correct).length / answers.length : 0;
}

function viewName(view: PracticeAttempt['view']) {
  return view.charAt(0).toUpperCase() + view.slice(1);
}

function attemptMatchesFilter(attempt: PracticeAttempt, filter: AttemptFilter) {
  if (filter.module !== 'all' && attempt.view !== filter.module) return false;
  const wrong = attempt.summary?.wrong ?? attempt.answers.filter((answer) => !answer.correct).length;
  if (filter.result === 'wrong' && wrong <= 0) return false;
  if (filter.result === 'perfect' && wrong > 0) return false;
  if (filter.range === 'all') return true;
  const attemptTime = dateValue(attempt.completedAt ?? attempt.startedAt);
  if (!attemptTime) return false;
  const now = new Date();
  const start = new Date(now);
  if (filter.range === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (filter.range === 'week') {
    start.setDate(now.getDate() - 7);
  } else {
    start.setMonth(now.getMonth() - 1);
  }
  return attemptTime >= start.getTime();
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}
