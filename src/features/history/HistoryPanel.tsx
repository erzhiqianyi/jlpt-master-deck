import { useMobileList } from '../../hooks/useMobileList';
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock3, History, ListChecks, NotebookPen, Percent } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppView, LearningCapture, LearningCaptureStatus, Locale, PracticeAttempt, Question } from '../../types';

type AttemptFilter = {
  module: AppView | 'all';
  result: 'all' | 'wrong' | 'perfect';
  range: 'all' | 'today' | 'week' | 'month';
};

export function HistoryPanel({ labels, locale, captures, attempts, questions = [], onCaptureStatus, embedded = false, mode = 'both', recordSection: controlledRecordSection, selectedCaptureId: controlledCaptureId, onSelectedCaptureChange, selectedAttemptId: controlledAttemptId, onSelectedAttemptChange, attemptQuestionDetailOpen, onAttemptQuestionDetailChange }: {
  labels: Record<string, string>;
  locale: Locale;
  captures: LearningCapture[];
  attempts: PracticeAttempt[];
  questions?: Question[];
  onCaptureStatus: (id: string, status: LearningCaptureStatus) => Promise<void>;
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
  const todayAttempts = useMemo(() => sortedAttempts.filter((attempt) => isTodayAttempt(attempt)), [sortedAttempts]);
  const filteredAttempts = useMemo(() => sortedAttempts.filter((attempt) => attemptMatchesFilter(attempt, attemptFilter)), [attemptFilter, sortedAttempts]);
  const selectedAttempt = sortedAttempts.find((attempt) => attempt.id === selectedAttemptId);
  const selectedCapture = captures.find((capture) => capture.id === selectedCaptureId) ?? null;
  const setSelectedCaptureId = onSelectedCaptureChange ?? setUncontrolledCaptureId;

  useEffect(() => {
    setSelectedAttemptId(null);
    setSelectedCaptureId(null);
  }, [activeView, setSelectedCaptureId]);

  const showAttemptHistory = activeView === 'practice' && (mode === 'both' || recordSection === 'history');
  const count = activeView === 'captures' ? captures.length : showAttemptHistory ? filteredAttempts.length : 0;
  const mobileList = useMobileList(count, JSON.stringify([activeView, attemptFilter]), 6);
  const pageCount = Math.max(1, Math.ceil(count / 6));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * 6;
  const detailOpen = activeView === 'captures' ? Boolean(selectedCapture) : Boolean(selectedAttempt);
  const openRecordSection = (section: 'today' | 'history') => {
    if (mode === 'practice' && typeof window !== 'undefined') {
      window.location.hash = `#/history/${section}`;
      return;
    }
    setUncontrolledRecordSection(section);
  };

  return (
    <section className={`${embedded ? 'py-2' : 'mx-auto w-full max-w-4xl py-2 md:py-5'} history-panel`}>
      {!embedded ? <><p className="text-sm font-semibold text-[#7d6032]">{labels.historyEyebrow}</p><h1 className="mt-1 text-2xl font-semibold text-[#27312c]">{labels.historyPageTitle}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#68716b]">{labels.historyPageBody}</p></> : null}

      {mode === 'both' ? <div className="mt-5 flex border-b border-[#d7dfd6]" role="tablist">
        <HistoryTab active={view === 'captures'} label={`${labels.historyCaptureTab} ${captures.length}`} onClick={() => setView('captures')} />
        <HistoryTab active={view === 'practice'} label={`${labels.historyPracticeTab} ${sortedAttempts.length}`} onClick={() => setView('practice')} />
      </div> : null}

      {detailOpen ? <button type="button" className="gentle-back" onClick={() => { setSelectedCaptureId(null); setSelectedAttemptId(null); }}><ArrowLeft size={18} />{activeView === 'captures' ? labels.historyBackToCaptures : labels.historyBackToAttempts}</button> : null}
      {activeView === 'captures' ? (
        selectedCapture ? (
          <CaptureDetail
            labels={labels}
            locale={locale}
            capture={selectedCapture}
            onToggleStatus={() => onCaptureStatus(selectedCapture.id, selectedCapture.status === 'processed' ? 'inbox' : 'processed')}
          />
        ) : captures.length ? (
          <CaptureTable labels={labels} locale={locale} captures={[...captures].sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt)).slice(mobileList.mobile ? 0 : start, mobileList.mobile ? mobileList.visible : start + 6)} onSelect={setSelectedCaptureId} />
        ) : <Empty text={labels.historyNoCaptures} />
      ) : selectedAttempt ? (
        <PracticeAttemptDetail labels={labels} locale={locale} attempt={selectedAttempt} questions={questions} onBack={() => setSelectedAttemptId(null)} showBack={!embedded} questionDetailOpen={attemptQuestionDetailOpen} onQuestionDetailChange={onAttemptQuestionDetailChange} />
      ) : (
        <>
          {recordSection === 'home' ? (
            <RecordHome labels={labels} locale={locale} todayAttempts={todayAttempts} attempts={sortedAttempts} captures={captures} onOpenToday={() => openRecordSection('today')} onOpenHistory={() => { openRecordSection('history'); setPage(0); }} />
          ) : null}
          {recordSection === 'today' ? (
            <TodayPracticeSummary labels={labels} locale={locale} attempts={todayAttempts} onSelect={setSelectedAttemptId} />
          ) : null}
          {showAttemptHistory ? (
            <>
              <details className="study-log-filter-panel mt-4">
                <summary>{labels.filters}</summary>
                <div className="study-log-filters"><label><input type="checkbox" checked={attemptFilter.result === 'wrong'} onChange={(event) => { setAttemptFilter({ ...attemptFilter, result: event.target.checked ? 'wrong' : 'all' }); setPage(0); }} />{locale === 'zh-CN' ? '只看有错题的练习' : locale === 'ja' ? '誤答のある練習のみ' : 'Only practices with mistakes'}</label></div>
                <PracticeAttemptFilters labels={labels} value={attemptFilter} attempts={sortedAttempts} filteredCount={filteredAttempts.length} onChange={(filter) => { setAttemptFilter(filter); setPage(0); }} />
              </details>
              <p className="study-log-summary">{locale === 'zh-CN' ? '全部记录' : locale === 'ja' ? 'すべての記録' : 'All records'} · {sortedAttempts.length}{locale === 'zh-CN' ? ' 次练习' : locale === 'ja' ? ' 回' : ' practices'} · {sortedAttempts.reduce((sum, attempt) => sum + attempt.answers.length, 0)}{locale === 'zh-CN' ? ' 次作答' : locale === 'ja' ? ' 解答' : ' answers'}</p>
              {filteredAttempts.length ? (
                <PracticeAttemptTable labels={labels} locale={locale} attempts={filteredAttempts.slice(mobileList.mobile ? 0 : start, mobileList.mobile ? mobileList.visible : start + 6)} onSelect={setSelectedAttemptId} />
              ) : <Empty text={labels.historyNoFilteredPractice} />}
            </>
          ) : null}
        </>
      )}
      {!detailOpen && count > 0 && mobileList.mobile ? <div ref={mobileList.setSentinel} className="mobile-list-end" role="status">{mobileList.visible < count ? (locale === 'zh-CN' ? '上拉查看更多' : locale === 'ja' ? '続きを表示' : 'Scroll for more') : (locale === 'zh-CN' ? '已经到底了' : locale === 'ja' ? 'すべて表示しました' : 'End of list')}</div> : null}
      {!detailOpen && count > 0 && !mobileList.mobile ? <nav className="gentle-pagination" aria-label={labels.navStatsHome}>
        <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label={locale === 'zh-CN' ? '上一页' : locale === 'ja' ? '前のページ' : 'Previous page'}><ChevronLeft size={20} /></button>
        <span aria-live="polite">{currentPage + 1} / {pageCount}</span>
        <button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)} aria-label={locale === 'zh-CN' ? '下一页' : locale === 'ja' ? '次のページ' : 'Next page'}><ChevronRight size={20} /></button>
      </nav> : null}
    </section>
  );
}

function RecordHome({ labels, locale, todayAttempts, attempts, captures, onOpenToday, onOpenHistory }: {
  labels: Record<string, string>;
  locale: Locale;
  todayAttempts: PracticeAttempt[];
  attempts: PracticeAttempt[];
  captures: LearningCapture[];
  onOpenToday: () => void;
  onOpenHistory: () => void;
}) {
  const todayTotal = todayAttempts.reduce((sum, attempt) => sum + (attempt.summary?.total ?? attempt.answers.length), 0);
  const todayCorrect = todayAttempts.reduce((sum, attempt) => sum + (attempt.summary?.correct ?? attempt.answers.filter((answer) => answer.correct).length), 0);
  const todayAccuracy = todayTotal ? Math.round(todayCorrect / todayTotal * 100) : 0;
  const todayMeta = todayAttempts.length
    ? `${todayAttempts.length}${locale === 'zh-CN' ? ' 次练习' : locale === 'ja' ? ' 回' : ' practices'} · ${todayTotal}${locale === 'zh-CN' ? ' 题' : locale === 'ja' ? ' 問' : ' questions'} · ${todayAccuracy}%`
    : (locale === 'zh-CN' ? '今天还没有完成练习' : locale === 'ja' ? '今日はまだ練習がありません' : 'No completed practice today');
  const historyMeta = `${attempts.length}${locale === 'zh-CN' ? ' 次练习' : locale === 'ja' ? ' 回' : ' practices'} · ${attempts.reduce((sum, attempt) => sum + attempt.answers.length, 0)}${locale === 'zh-CN' ? ' 次作答' : locale === 'ja' ? ' 解答' : ' answers'}`;
  const capturesMeta = `${captures.length}${locale === 'zh-CN' ? ' 条输入记录' : locale === 'ja' ? ' 件の入力履歴' : ' captures'}`;

  return (
    <nav className="record-home-grid" aria-label={labels.navStatsHome}>
      <button type="button" className="record-home-card is-primary" onClick={onOpenToday}>
        <span className="record-home-icon"><ListChecks size={25} /></span>
        <span><strong>{locale === 'zh-CN' ? '今天统计' : locale === 'ja' ? '今日の統計' : 'Today'}</strong><small>{todayMeta}</small></span>
        <ChevronRight size={20} />
      </button>
      <button type="button" className="record-home-card" onClick={onOpenHistory}>
        <span className="record-home-icon"><History size={25} /></span>
        <span><strong>{locale === 'zh-CN' ? '历史练习记录' : locale === 'ja' ? '練習履歴' : 'Practice history'}</strong><small>{historyMeta}</small></span>
        <ChevronRight size={20} />
      </button>
      <a className="record-home-card" href="#/captures">
        <span className="record-home-icon"><NotebookPen size={25} /></span>
        <span><strong>{locale === 'zh-CN' ? '输入记录' : locale === 'ja' ? '入力履歴' : 'Input records'}</strong><small>{capturesMeta}</small></span>
        <ChevronRight size={20} />
      </a>
    </nav>
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
  const title = locale === 'zh-CN' ? '今天结果' : locale === 'ja' ? '今日の結果' : 'Today';
  const empty = locale === 'zh-CN' ? '今天还没有完成练习。' : locale === 'ja' ? '今日はまだ完了した練習がありません。' : 'No completed practice today.';

  return (
    <section className="today-practice-summary" aria-label={title}>
      <div className="today-practice-summary-heading">
        <h2>{title}</h2>
        <span>{formatTodayLabel(locale)}</span>
      </div>
      {attempts.length ? (
        <>
          <dl className="today-practice-stats">
            <div><dt><ListChecks size={15} />{locale === 'zh-CN' ? '练习' : locale === 'ja' ? '練習' : 'Practices'}</dt><dd>{attempts.length}</dd></div>
            <div><dt><Percent size={15} />{locale === 'zh-CN' ? '正确率' : locale === 'ja' ? '正答率' : 'Accuracy'}</dt><dd>{accuracy}%</dd></div>
            <div><dt><Clock3 size={15} />{locale === 'zh-CN' ? '用时' : locale === 'ja' ? '時間' : 'Time'}</dt><dd>{formatDuration(totals.elapsedMs)}</dd></div>
          </dl>
          <div className="today-practice-results" aria-label={locale === 'zh-CN' ? '今天最近结果' : locale === 'ja' ? '今日の最近の結果' : 'Recent results today'}>
            {latestAttempts.map((attempt) => (
              <button key={attempt.id} type="button" onClick={() => onSelect(attempt.id)}>
                <span>
                  <strong>{moduleLabel(labels, attempt.view)}</strong>
                  <small>{new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }).format(new Date(attempt.completedAt ?? attempt.startedAt))} · {attempt.summary?.total ?? attempt.answers.length}{locale === 'zh-CN' ? ' 题' : locale === 'ja' ? ' 問' : ' questions'}</small>
                </span>
                <b>{summaryText(attempt)}</b>
              </button>
            ))}
          </div>
        </>
      ) : <p>{empty}</p>}
    </section>
  );
}

function CaptureTable({ labels, locale, captures, onSelect }: {
  labels: Record<string, string>;
  locale: Locale;
  captures: LearningCapture[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="gentle-capture-list mt-4 overflow-hidden rounded-2xl border border-[#d7dfd6] bg-white divide-y divide-[#e3e8e2]">
      {captures.map((capture) => <button key={capture.id} type="button" onClick={() => onSelect(capture.id)} className="flex min-h-20 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#f8faf7]">
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-[#27312c]">{captureSummary(capture).title}</span>
          <span className="mt-1 block text-sm text-[#526960]">{labels[`captureCategory_${capture.category}`]} · {new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(capture.createdAt))}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-2 text-sm text-[#526960]">{captureStatusLabel(labels, capture.status)}<ChevronRight size={18} aria-hidden="true" /></span>
      </button>)}
    </div>
  );
}

function CaptureDetail({ labels, locale, capture, onToggleStatus }: {
  labels: Record<string, string>;
  locale: Locale;
  capture: LearningCapture;
  onToggleStatus: () => Promise<void>;
}) {
  const parsed = parseCaptureBody(capture.body);
  const summary = captureSummary(capture);

  return (
    <div className="mt-5">
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
        <button type="button" onClick={onToggleStatus} className="min-h-10 shrink-0 rounded-md border border-[#c8d1c8] bg-white px-3 text-xs font-semibold text-[#31564c]">
          {capture.status === 'processed' ? labels.captureMarkInbox : labels.captureMarkProcessed}
        </button>
      </div>

      {capture.context ? <InfoBlock title={labels.captureContextLabel ?? 'Context'}>{capture.context}</InfoBlock> : null}
      <div className="mt-5">
        <h3 className="text-sm font-semibold text-[#27312c]">{labels.captureDetailTitle ?? labels.historyCaptureTab}</h3>
        <div className="mt-3 space-y-4">
          <StructuredCaptureContent value={parsed ?? capture.body} labels={labels} />
        </div>
      </div>
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

function Empty({ text }: { text: string }) {
  return <p className="py-12 text-center text-sm text-[#7a807b]">{text}</p>;
}

function PracticeAttemptFilters({ labels, value, attempts, filteredCount, onChange }: {
  labels: Record<string, string>;
  value: AttemptFilter;
  attempts: PracticeAttempt[];
  filteredCount: number;
  onChange: (value: AttemptFilter) => void;
}) {
  const modules = unique(attempts.map((attempt) => attempt.view));
  return (
    <div className="history-attempt-filters mt-4 rounded-lg border border-[#d7dfd6] bg-white p-3">
      <div className="history-attempt-filter-grid flex flex-wrap items-end gap-3">
        <label className="history-attempt-filter grid gap-1 text-xs font-semibold text-[#68716b]">
          <span>{labels.historyFilterModule}</span>
          <select value={value.module} onChange={(event) => onChange({ ...value, module: event.target.value as AttemptFilter['module'] })} className="h-10 rounded-md border border-[#d7dfd6] bg-white px-3 text-sm text-[#27312c]">
            <option value="all">{labels.historyFilterAllModules}</option>
            {modules.map((module) => <option key={module} value={module}>{moduleLabel(labels, module)}</option>)}
          </select>
        </label>
        <label className="history-attempt-filter grid gap-1 text-xs font-semibold text-[#68716b]">
          <span>{labels.historyFilterResult}</span>
          <select value={value.result} onChange={(event) => onChange({ ...value, result: event.target.value as AttemptFilter['result'] })} className="h-10 rounded-md border border-[#d7dfd6] bg-white px-3 text-sm text-[#27312c]">
            <option value="all">{labels.historyFilterAllResults}</option>
            <option value="wrong">{labels.historyFilterHasWrong}</option>
            <option value="perfect">{labels.historyFilterPerfect}</option>
          </select>
        </label>
        <label className="history-attempt-filter grid gap-1 text-xs font-semibold text-[#68716b]">
          <span>{labels.historyFilterRange}</span>
          <select value={value.range} onChange={(event) => onChange({ ...value, range: event.target.value as AttemptFilter['range'] })} className="h-10 rounded-md border border-[#d7dfd6] bg-white px-3 text-sm text-[#27312c]">
            <option value="all">{labels.historyFilterAllTime}</option>
            <option value="today">{labels.historyFilterToday}</option>
            <option value="week">{labels.historyFilterWeek}</option>
            <option value="month">{labels.historyFilterMonth}</option>
          </select>
        </label>
        <p className="history-attempt-filter-count ml-auto pb-2 text-xs font-semibold text-[#68716b]">{labels.historyFilterCount.replace('{shown}', String(filteredCount)).replace('{total}', String(attempts.length))}</p>
      </div>
    </div>
  );
}

function PracticeAttemptTable({ labels, locale, attempts, onSelect }: {
  labels: Record<string, string>;
  locale: Locale;
  attempts: PracticeAttempt[];
  onSelect: (id: string) => void;
}) {
  const dateKey = (attempt: PracticeAttempt) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(attempt.completedAt ?? attempt.startedAt));
  return <div className="study-log-list">
    {attempts.map((attempt, index) => <div key={attempt.id}>
      {index === 0 || dateKey(attempts[index - 1]) !== dateKey(attempt) ? <h2>{new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(attempt.completedAt ?? attempt.startedAt))}</h2> : null}
      <button type="button" onClick={() => onSelect(attempt.id)}>
        <span><strong>{moduleLabel(labels, attempt.view)}</strong><small>{new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }).format(new Date(attempt.completedAt ?? attempt.startedAt))} · {attempt.summary?.total ?? attempt.answers.length}{locale === 'zh-CN' ? ' 题' : locale === 'ja' ? ' 問' : ' questions'} · {formatDuration(attempt.summary?.elapsedMs)}</small></span>
        <span className="study-log-result">{summaryText(attempt)}<ChevronRight size={18} /></span>
      </button>
    </div>)}
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
            <h2 className="text-lg font-semibold text-[#27312c]">{labels.historyAttemptDetail}</h2>
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
        <div className="mt-3 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f8f5] text-xs font-semibold text-[#68716b]">
              <tr>
                <th className="w-12 px-3 py-3">#</th>
                <th className="px-3 py-3">{labels.historyAttemptQuestion}</th>
                <th className="px-3 py-3">{labels.yourAnswer}</th>
                <th className="px-3 py-3">{labels.rightAnswer}</th>
                <th className="px-3 py-3">{labels.historyAttemptResult}</th>
                <th className="px-3 py-3">{labels.elapsed}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3e8e2]">
              {filteredAnswers.map(({ answer, index }) => {
                const question = questionMap.get(answer.questionId);
                return (
                  <tr key={`${answer.questionId}-${index}`} className="cursor-pointer hover:bg-[#f8faf7]" tabIndex={0} onClick={() => openQuestion(index)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') openQuestion(index); }}>
                    <td className="px-3 py-3 text-[#7a807b]">{index + 1}</td>
                    <td className="max-w-[24rem] px-3 py-3">
                      <p className="font-semibold text-[#34413b]">{questionKeyText(question, answer)}</p>
                      {question?.prompt ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#68716b]">{question.prompt}</p> : null}
                    </td>
                    <td className="px-3 py-3 text-[#4f5b55]">{answer.selected || '-'}</td>
                    <td className="px-3 py-3 text-[#31564c]">{question?.answer ?? '-'}</td>
                    <td className={`px-3 py-3 font-semibold ${answer.correct ? 'text-[#356146]' : 'text-[#a84269]'}`}>{answer.correct ? labels.correct : labels.wrong}</td>
                    <td className="px-3 py-3 text-[#4f5b55]">{formatDuration(answer.elapsedMs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 divide-y divide-[#e3e8e2] overflow-hidden rounded-md border border-[#e3e8e2] md:hidden">
          {filteredAnswers.map(({ answer, index }) => {
            const question = questionMap.get(answer.questionId);
            return (
              <article key={`${answer.questionId}-${index}`} role="button" tabIndex={0} aria-label={`${labels.historyAttemptQuestion} ${index + 1}: ${questionKeyText(question, answer)}`} onClick={() => openQuestion(index)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') openQuestion(index); }} className="cursor-pointer bg-white px-3 py-3.5 transition-colors hover:bg-[#f8faf7] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#31564c]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-[#7a807b]">#{index + 1}</span>
                    <h3 className="mt-1 break-words text-base font-semibold leading-6 text-[#27312c]">{questionKeyText(question, answer)}</h3>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${answer.correct ? 'bg-[#edf4ef] text-[#356146]' : 'bg-[#fff0f5] text-[#a84269]'}`}>
                      {answer.correct ? labels.correct : labels.wrong}
                    </span>
                    <ChevronRight size={17} className="text-[#7a807b]" aria-hidden="true" />
                  </span>
                </div>
                {question?.prompt ? <p className="mt-2 break-words text-sm leading-6 text-[#68716b]">{question.prompt}</p> : null}
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-md bg-[#f6f8f5] p-3 text-sm">
                  <div className="min-w-0">
                    <dt className="text-xs text-[#707a74]">{labels.yourAnswer}</dt>
                    <dd className="mt-1 break-words font-semibold text-[#4f5b55]">{answer.selected || '-'}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-[#707a74]">{labels.rightAnswer}</dt>
                    <dd className="mt-1 break-words font-semibold text-[#31564c]">{question?.answer ?? '-'}</dd>
                  </div>
                  <div className="col-span-2 border-t border-[#dfe5de] pt-2">
                    <dt className="inline text-xs text-[#707a74]">{labels.elapsed}</dt>
                    <dd className="ml-2 inline font-semibold text-[#4f5b55]">{formatDuration(answer.elapsedMs)}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
        </> : <p className="py-10 text-center text-sm text-[#7a807b]">{labels.historyNoFilteredAnswers}</p>}
      </div>
    </div>
  );
}

export function AttemptQuestionDetail({ labels, entry, position, total, question, onBack, onPrevious, onNext }: {
  labels: Record<string, string>;
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

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuestionDetailValue label={labels.yourAnswer} value={answer.selected || '-'} tone={answer.correct ? 'correct' : 'wrong'} />
          <QuestionDetailValue label={labels.rightAnswer} value={question?.answer ?? '-'} tone="correct" />
          <QuestionDetailValue label={labels.elapsed} value={formatDuration(answer.elapsedMs)} />
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
  return <section className="mt-5 border-t border-[#e3e8e2] pt-4"><h3 className="text-sm font-semibold text-[#27312c]">{title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#4f5b55]">{body}</p></section>;
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
