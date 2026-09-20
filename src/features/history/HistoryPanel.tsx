import './RecordHome.css';
import { NavigationCard } from '../../components/NavigationCard';
import { LearningList, LearningListFrame, LearningListHeader, LearningListPagination, LearningListRow, LearningListSelect } from '../../components/LearningList';
import { useMobileList } from '../../hooks/useMobileList';
import { ArrowLeft, ArrowRight, CircleAlert, CheckCircle2, ChevronLeft, ChevronRight, Circle, History, ListChecks, NotebookPen } from 'lucide-react';
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
      {!embedded ? <><p className="text-sm font-semibold text-[#7d6032]">{labels.historyEyebrow}</p><h1 className="mt-1 text-2xl font-semibold text-[#27312c]">{labels.historyPageTitle}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#68716b]">{labels.historyPageBody}</p></> : null}

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
          <LearningListFrame className="learning-catalog mt-4" label={labels.historyCaptureTab}>
            <LearningListHeader title={labels.historyCaptureTab} count={`${captures.length} ${locale === 'zh-CN' ? '项' : locale === 'ja' ? '件' : 'items'}`} />
            {captures.length ? <CaptureTable labels={labels} locale={locale} captures={[...captures].sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt)).slice(mobileList.mobile ? 0 : start, mobileList.mobile ? mobileList.visible : start + 6)} onSelect={setSelectedCaptureId} /> : <p className="list-empty" role="status">{labels.historyNoCaptures}</p>}
            {listFooter}
          </LearningListFrame>
        )
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
              <LearningListFrame className="learning-catalog mt-4" label={labels.historyPracticeTab}>
                <LearningListHeader title={locale === 'zh-CN' ? '全部记录' : locale === 'ja' ? 'すべての記録' : 'All records'} count={`${filteredAttempts.length} / ${sortedAttempts.length}${locale === 'zh-CN' ? ' 次练习' : locale === 'ja' ? ' 回' : ' practices'} · ${sortedAttempts.reduce((sum, attempt) => sum + attempt.answers.length, 0)}${locale === 'zh-CN' ? ' 次作答' : locale === 'ja' ? ' 解答' : ' answers'}`}>
                  <PracticeAttemptFilters labels={labels} value={attemptFilter} attempts={sortedAttempts} onChange={(filter) => { setAttemptFilter(filter); setPage(0); }} />
                </LearningListHeader>
                {filteredAttempts.length ? (
                  <PracticeAttemptTable labels={labels} locale={locale} attempts={filteredAttempts.slice(mobileList.mobile ? 0 : start, mobileList.mobile ? mobileList.visible : start + 6)} onSelect={setSelectedAttemptId} />
                ) : <p className="list-empty" role="status">{labels.historyNoFilteredPractice}</p>}
                {listFooter}
              </LearningListFrame>
            </>
          ) : null}
        </>
      )}
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
  const copy = locale === 'zh-CN'
    ? { today: '今天的积累', detail: '查看统计', practices: '完成练习', questions: '作答题数', accuracy: '正确率', review: '回顾与巩固', history: '练习历史', historySub: '回看每次练习与解析', mistakes: '错题集', mistakesSub: '找到需要再练的知识点', saved: '学习资料', captures: '输入记录', drafts: '练习草稿', draftsSub: '查看准备好的题目', empty: '今天还没有完成练习，按自己的节奏开始。', total: '次练习', answers: '次作答', entries: '条记录' }
    : locale === 'ja'
      ? { today: '今日の積み重ね', detail: '統計を見る', practices: '完了した練習', questions: '解答数', accuracy: '正答率', review: '振り返りと復習', history: '練習履歴', historySub: '練習結果と解説を振り返る', mistakes: '間違いノート', mistakesSub: 'もう一度練習したい項目を確認', saved: '学習資料', captures: '入力履歴', drafts: '練習の下書き', draftsSub: '準備された問題を確認', empty: '今日はまだ練習がありません。自分のペースで始めましょう。', total: '回の練習', answers: '解答', entries: '件' }
      : { today: 'Today’s progress', detail: 'View statistics', practices: 'Practices', questions: 'Answers', accuracy: 'Accuracy', review: 'Review and improve', history: 'Practice history', historySub: 'Revisit results and explanations', mistakes: 'Mistake notebook', mistakesSub: 'Find learning points to practice again', saved: 'Study materials', captures: 'Input records', drafts: 'Practice drafts', draftsSub: 'Check prepared questions', empty: 'No completed practice today. Start at your own pace.', total: 'practices', answers: 'answers', entries: 'records' };

  return (
    <div className="record-home" aria-label={labels.navStatsHome}>
      <section className="record-home-today" aria-labelledby="record-today-title">
        <header><div><span>{formatTodayLabel(locale)}</span><h2 id="record-today-title">{copy.today}</h2></div><button type="button" onClick={onOpenToday}>{copy.detail}<ArrowRight size={16} aria-hidden="true" /></button></header>
        <dl className="record-home-stats">
          <div><dt>{copy.practices}</dt><dd>{todayAttempts.length}</dd></div>
          <div><dt>{copy.questions}</dt><dd>{todayTotal}</dd></div>
          <div><dt>{copy.accuracy}</dt><dd>{todayTotal ? `${todayAccuracy}%` : '—'}</dd></div>
        </dl>
        {!todayAttempts.length && <p className="record-home-empty">{copy.empty}</p>}
      </section>
      <section className="record-home-review" aria-labelledby="record-review-title">
        <h2 id="record-review-title">{copy.review}</h2>
        <div className="navigation-grid">
          <NavigationCard icon={<History size={23} />} title={copy.history} description={copy.historySub} onOpen={onOpenHistory} />
          <NavigationCard icon={<CircleAlert size={23} />} title={copy.mistakes} description={copy.mistakesSub} href="#/mistakes" />
        </div>
        <p className="record-home-total">{attempts.length} {copy.total}<span aria-hidden="true"> · </span>{attempts.reduce((sum, attempt) => sum + attempt.answers.length, 0)} {copy.answers}</p>
      </section>
      <section className="record-home-materials" aria-labelledby="record-materials-title">
        <h2 id="record-materials-title">{copy.saved}</h2>
        <div className="record-home-links">
          <a href="#/captures"><NotebookPen size={21} aria-hidden="true" /><span><strong>{copy.captures}</strong><small>{captures.length} {copy.entries}</small></span><ChevronRight size={18} aria-hidden="true" /></a>
          <a href="#/drafts"><ListChecks size={21} aria-hidden="true" /><span><strong>{copy.drafts}</strong><small>{copy.draftsSub}</small></span><ChevronRight size={18} aria-hidden="true" /></a>
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
  const title = locale === 'zh-CN' ? '今天结果' : locale === 'ja' ? '今日の結果' : 'Today';
  const empty = locale === 'zh-CN' ? '今天还没有完成练习。' : locale === 'ja' ? '今日はまだ完了した練習がありません。' : 'No completed practice today.';

  const unit = locale === 'zh-CN' ? '次练习' : locale === 'ja' ? '回' : 'practices';
  return (
    <LearningListFrame className="learning-catalog mt-4" label={title}>
      <LearningListHeader title={title} count={`${formatTodayLabel(locale)} · ${attempts.length} ${unit}`} />
      {attempts.length ? (
        <>
          <dl className="list-stats">
            <div><dt>{locale === 'zh-CN' ? '练习' : locale === 'ja' ? '練習' : 'Practices'}</dt><dd>{attempts.length}</dd></div>
            <div><dt>{locale === 'zh-CN' ? '作答' : locale === 'ja' ? '解答' : 'Answers'}</dt><dd>{totals.total}</dd></div>
            <div><dt>{locale === 'zh-CN' ? '正确率' : locale === 'ja' ? '正答率' : 'Accuracy'}</dt><dd>{accuracy}%</dd></div>
            <div><dt>{locale === 'zh-CN' ? '用时' : locale === 'ja' ? '時間' : 'Time'}</dt><dd>{formatDuration(totals.elapsedMs)}</dd></div>
          </dl>
          <LearningList>{latestAttempts.map((attempt) => <LearningListRow key={attempt.id} title={attempt.title?.trim() || moduleLabel(labels, attempt.view)} description={`${new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }).format(new Date(attempt.completedAt ?? attempt.startedAt))} · ${attempt.summary?.total ?? attempt.answers.length} ${locale === 'zh-CN' ? '题' : locale === 'ja' ? '問' : 'questions'}`} status={summaryText(attempt)} locale={locale} onOpen={() => onSelect(attempt.id)}/>)}</LearningList>
        </>
      ) : <p className="list-empty" role="status">{empty}</p>}
    </LearningListFrame>
  );
}

function CaptureTable({ labels, locale, captures, onSelect }: {
  labels: Record<string, string>;
  locale: Locale;
  captures: LearningCapture[];
  onSelect: (id: string) => void;
}) {
  return <LearningList>{captures.map((capture) => <LearningListRow key={capture.id} title={captureSummary(capture).title} description={labels[`captureCategory_${capture.category}`]} statusKind={capture.status} status={captureStatusLabel(labels, capture.status)} locale={locale} onOpen={() => onSelect(capture.id)}/>)}</LearningList>;

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
  onSelect: (id: string) => void;
}) {
  // One flat list; the date moves into each row instead of splitting the list into day sections.
  const attemptDate = (attempt: PracticeAttempt) => new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Tokyo', month: 'short', day: 'numeric' }).format(new Date(attempt.completedAt ?? attempt.startedAt));
  return <div className="learning-history-list">
    <LearningList>{attempts.map((attempt) => <LearningListRow key={attempt.id} title={attempt.title?.trim() || moduleLabel(labels, attempt.view)} description={`${attemptDate(attempt)} · ${attempt.answers.length} ${locale === 'zh-CN' ? '题' : locale === 'ja' ? '問' : 'questions'} · ${formatDuration(attempt.summary?.elapsedMs)}`} status={summaryText(attempt)} locale={locale} onOpen={() => onSelect(attempt.id)}/>)}</LearningList>
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
        <LearningList>{filteredAnswers.map(({ answer, index }) => <LearningListRow key={`${answer.questionId}-${index}`} title={questionKeyText(questionMap.get(answer.questionId), answer)} description={questionMap.get(answer.questionId)?.prompt} statusKind={answer.correct ? 'correct' : 'incorrect'} status={answer.correct ? labels.correct : labels.wrong} locale={locale} onOpen={() => openQuestion(index)}/>)}</LearningList>
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
