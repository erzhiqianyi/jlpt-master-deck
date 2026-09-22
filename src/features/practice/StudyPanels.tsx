import { LearningListMetadata, LearningListColumns } from '../../components/LearningListMetadata';
import type { QuestionReference } from '../../domain/questions';
import { ShareButton } from '../../components/ShareButton';
import { ModuleActionBar } from '../../components/ModuleActionBar';
import { normalizePracticeExplanations } from '../../domain/practiceExplanations.mjs';
import { LearningList, LearningListRow, LearningListHeader, LearningListSearch, LearningListPagination, LearningListFrame } from '../../components/LearningList';
import { useMobileList } from '../../hooks/useMobileList';
import { Pencil, ChevronLeft, ChevronRight, House, Lightbulb, LoaderCircle, Plus, RotateCcw, ScrollText, Settings, Target, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type TouchEvent as ReactTouchEvent } from 'react';
import { defaultRubyTerms } from '../../data/rubyTerms';
import { localized, itemMeaning } from '../../domain/items';
import { filterableTags, itemInWordbook, itemTagList, itemWordbookId, wordbookFamily, wordbooksForFamily, type WordbookFamily } from '../../domain/wordbooks';
import type { AnswerState, Deck, DisplaySettings, FeedbackMode, LearningCaptureCategory, Locale, PracticeAttempt, ProgressState, Question, QuestionKind, ReviewStatus, VocabItem, Wordbook } from '../../types';

function QuestionPrompt({ text, target, locale }: { text: string; target?: string; locale: Locale }) {
  // Legacy passage questions append the specific blank instruction to the passage.
  // Only split when that same numbered blank exists in the preceding text.
  const blankQuestion = text.match(/(【[0-9０-９]+】)\s*に入る(?:最もよい)?ものを選びなさい[。．.]?\s*$/u);
  const passage = blankQuestion ? text.slice(0, blankQuestion.index).trimEnd() : '';
  if (blankQuestion && passage.includes(blankQuestion[1])) {
    const marker = blankQuestion[1];
    const label = locale === 'zh-CN' ? `本题填写空格 ${marker}` : locale === 'ja' ? `解答する空欄 ${marker}` : `Choose an answer for blank ${marker}`;
    const parts = passage.split(marker);
    return <>
      <span className="whitespace-pre-line">{parts.map((part, index) => <span key={index}>
        {index > 0 ? <mark className="practice-active-blank" aria-label={label}>{marker}</mark> : null}
        <QuestionPrompt text={part} target={target} locale={locale} />
      </span>)}</span>
      <span className="practice-blank-instruction">{label}</span>
    </>;
  }
  if (!target) return text;
  const targetIndex = text.indexOf(target);
  if (targetIndex < 0) return text;
  return <>{text.slice(0, targetIndex)}<span className="font-semibold underline decoration-2 underline-offset-4">{target}</span>{text.slice(targetIndex + target.length)}</>;
}

function formatDateTime(value: string | undefined, locale: Locale) {
  return value ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '-';
}

function formatDuration(ms: number | undefined) {
  const totalSeconds = Math.max(0, Math.round((ms ?? 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function wordDetailHref(item: VocabItem) {
  const view = item.deck === 'grammar_expression' ? 'grammar' : 'vocabulary';
  return `#/${view}/words/${encodeURIComponent(item.id)}`;
}

const WORD_INDEX_PAGE_SIZE = 8;
type WordIndexSortKey = 'created-asc' | 'created-desc' | 'level-asc' | 'level-desc' | 'kana-asc' | 'kana-desc' | 'questions-desc' | 'progress-asc';
export type WordIndexPracticeFocus =
  | { kind: 'random' }
  | { kind: 'question-kind'; questionKind: QuestionKind }
  | { kind: 'tag'; tag: string };
function safeIndex(index: number, total: number) {
  return total ? ((index % total) + total) % total : 0;
}

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

function shouldAutoAdvanceAfterBatchAnswer() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 767px), (pointer: coarse)').matches;
}

/** Both libraries share the wordbook UI; the grammar library only swaps the wording. */
function bookLabels(labels: Record<string, string>, family: WordbookFamily) {
  if (family === 'vocabulary') return labels;
  return {
    ...labels,
    wordbookFilter: labels.grammarbookFilter,
    wordbookAll: labels.grammarbookAll,
    wordbookManage: labels.grammarbookManage,
    wordbookManageHint: labels.grammarbookManageHint,
    wordbookNewName: labels.grammarbookNewName,
    wordbookCreatePlaceholder: labels.grammarbookCreatePlaceholder,
    wordbookRenameTitle: labels.grammarbookRenameTitle,
    wordbookManageEmpty: labels.grammarbookManageEmpty,
  };
}

function reviewItemTime(item: VocabItem) {
  const value = Date.parse(item.input_at ?? item.date);
  return Number.isFinite(value) ? value : 0;
}

function readingSortValue(item: VocabItem) {
  return item.reading || item.original;
}

function levelSortValue(level: string | undefined) {
  const matches = [...String(level ?? '').matchAll(/N([1-5])/g)].map((match) => Number(match[1]));
  return matches.length ? Math.min(...matches) : 99;
}

function sortLabel(key: WordIndexSortKey, labels: Record<string, string>) {
  return labels[`entrySort_${key}`] ?? key;
}

function questionKindLabel(kind: QuestionKind, labels: Record<string, string>) {
  if (kind === 'grammar') return labels.grammar;
  if (kind === 'meaning') return labels.meaning;
  if (kind === 'moji_goi') return labels.mojiGoi;
  if (kind === 'kana_to_kanji') return labels.kanaToKanji;
  if (kind === 'kanji_to_kana') return labels.kanjiToKana;
  return kind;
}

export function PracticeReviewPanel({
  attempt,
  questions,
  answers,
  items,
  labels,
  practiceTitle,
  locale,
  showRuby,
  onRestart,
  onBackToPractice,
}: {
  attempt?: PracticeAttempt;
  questions: Question[];
  answers: AnswerState;
  items: VocabItem[];
  labels: Record<string, string>;
  practiceTitle?: string;
  locale: Locale;
  showRuby: boolean;
  onRestart: () => void;
  onBackToPractice: () => void;
}) {
  const [reviewIndex, setReviewIndex] = useState(0);
  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);
  const questionDialogRef = useRef<HTMLDialogElement>(null);
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const storedReviewAnswers = attempt?.answers.length
    ? attempt.answers
    : questions
      .filter((question) => answers[question.id])
      .map((question) => ({
        questionId: question.id,
        itemId: question.itemId,
        kind: question.kind,
        selected: answers[question.id].selected,
        correct: answers[question.id].correct,
        startedAt: answers[question.id].startedAt,
        answeredAt: answers[question.id].answeredAt ?? '',
        elapsedMs: answers[question.id].elapsedMs ?? 0,
      }));
  const reviewAnswers = storedReviewAnswers.map((answer) => {
    const question = questionMap.get(answer.questionId);
    return question ? { ...answer, correct: answer.selected === question.answer } : answer;
  });
  const reviewCorrectCount = reviewAnswers.filter((answer) => answer.correct).length;
  const summary = {
    total: attempt?.summary?.total ?? questions.length,
    correct: reviewCorrectCount,
    wrong: reviewAnswers.length - reviewCorrectCount,
    accuracy: reviewAnswers.length ? reviewCorrectCount / reviewAnswers.length : 0,
    elapsedMs: attempt?.summary?.elapsedMs ?? reviewAnswers.reduce((sum, answer) => sum + (answer.elapsedMs ?? 0), 0),
  };
  const orderedAnswers = questions.flatMap((question) => {
    const answer = reviewAnswers.find((entry) => entry.questionId === question.id);
    return answer ? [answer] : [];
  });
  const activeIndex = Math.min(reviewIndex, Math.max(0, orderedAnswers.length - 1));
  const activeAnswer = orderedAnswers[activeIndex];
  const activeQuestion = activeAnswer ? questionMap.get(activeAnswer.questionId) : undefined;
  const activeAnswerCorrect = activeQuestion && activeAnswer ? activeAnswer.selected === activeQuestion.answer : false;
  const genericPracticeTitle = !attempt?.title && practiceTitle
    ? /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}月\d{1,2}日)\s*(?:练习|練習|practice)?$/iu.test(practiceTitle.trim())
    : false;
  const reviewTitle = genericPracticeTitle
    ? activeQuestion?.title ?? practiceTitle ?? labels.reviewSummaryTitle
    : attempt?.title ?? practiceTitle ?? activeQuestion?.title ?? labels.reviewSummaryTitle;
  const showQuestionTitle = Boolean(activeQuestion?.title && activeQuestion.title !== reviewTitle);
  const answeredCount = orderedAnswers.length;
  const copy = locale === 'zh-CN'
    ? { list: '题目列表', previous: '上一题', next: '下一题', restart: '重新练习' }
    : locale === 'ja'
      ? { list: '問題一覧', previous: '前の問題', next: '次の問題', restart: 'もう一度練習' }
      : { list: 'Questions', previous: 'Previous', next: 'Next', restart: 'Restart practice' };

  function openQuestionDialog() {
    setQuestionDialogOpen(true);
    window.requestAnimationFrame(() => questionDialogRef.current?.showModal());
  }

  function closeQuestionDialog() {
    setQuestionDialogOpen(false);
    questionDialogRef.current?.close();
  }

  return (
    <section className="cute-practice-card practice-swipe-surface attempt-review-card min-w-0 border px-4 pb-6 pt-4 md:p-5">
      {activeQuestion && activeAnswer ? <>
        <div className="practice-question-section">
          <div className="practice-question-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-[#f0d4dd] pb-4">
            <p className="text-sm font-bold text-[#a84269]">{reviewTitle}</p>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              {orderedAnswers.length > 1 ? <ArrowButton label={copy.previous} direction="left" onClick={() => setReviewIndex(safeIndex(activeIndex - 1, orderedAnswers.length))} /> : null}
              <button
                type="button"
                onClick={openQuestionDialog}
                aria-haspopup="dialog"
                aria-expanded={questionDialogOpen}
                aria-label={`${copy.list}: ${activeIndex + 1} / ${orderedAnswers.length}`}
                className="attempt-review-progress practice-progress-button flex min-h-10 min-w-32 flex-col items-center justify-center rounded-2xl bg-[#fff0f5] px-3 py-1 text-[#a84269]"
              >
                <span className="journal-number text-sm font-black">{activeIndex + 1} / {orderedAnswers.length}</span>
              </button>
              <button type="button" onClick={onRestart} aria-label={copy.restart} title={copy.restart} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#f0c9d4] bg-white text-[#a84269] hover:bg-[#fff0f5]">
                <RotateCcw size={17} />
              </button>
              {orderedAnswers.length > 1 ? <ArrowButton label={copy.next} direction="right" onClick={() => setReviewIndex(safeIndex(activeIndex + 1, orderedAnswers.length))} /> : null}
            </div>
          </div>
          <article key={activeQuestion.id} className="attempt-review-question">
            {showQuestionTitle ? <h2 className="text-2xl font-black text-[#3d3036]">{activeQuestion.title}</h2> : null}
            {activeQuestion.instruction ? <p className="mt-3 text-sm leading-6 text-[#74646b]">{activeQuestion.instruction}</p> : null}
            <p className="mt-4 break-words text-lg leading-8 text-[#3d3036]"><QuestionPrompt text={activeQuestion.prompt} target={activeQuestion.promptTarget} locale={locale} /></p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {activeQuestion.choices.map((choice, index) => {
                const correct = choice === activeQuestion.answer;
                const selected = choice === activeAnswer.selected;
                return <div key={`${index}-${choice}`} data-answer-state={correct ? 'correct' : selected ? 'incorrect-selected' : 'answered-muted'} className={`cute-choice flex min-h-14 min-w-0 items-start gap-3 border px-4 py-3 text-left text-base font-bold break-words ${correct ? 'border-[#65a37c] bg-[#f0fff5]' : selected ? 'border-[#d95f8a] bg-[#fff0f5]' : 'border-[#f0d4dd] bg-white'}`}>
                  <span className="journal-number flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs">{index + 1}</span>
                  <span className="min-w-0 pt-0.5">{choice}</span>
                  {correct || selected ? <span className="review-choice-badges">
                    {correct ? <small>{activeAnswerCorrect ? labels.correct : labels.rightAnswer}</small> : null}
                    {selected && !activeAnswerCorrect ? <small>{labels.yourAnswer}</small> : null}
                  </span> : null}
                </div>;
              })}
            </div>
          </article>
        </div>
        <AnswerPanel
          question={activeQuestion}
          answer={activeAnswer}
          items={items}
          showRuby={showRuby}
          labels={labels}
          locale={locale}
        />
      </> : <p>{labels.noAttemptHistory}</p>}

      <dialog ref={questionDialogRef} className="attempt-question-dialog" aria-labelledby="attempt-question-dialog-title" onClose={() => setQuestionDialogOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) closeQuestionDialog(); }}>
        <div className="attempt-question-dialog-content">
          <header><h2 id="attempt-question-dialog-title">{copy.list}</h2><button type="button" autoFocus aria-label={locale === 'zh-CN' ? '关闭' : locale === 'ja' ? '閉じる' : 'Close'} onClick={closeQuestionDialog}><X size={20} /></button></header>
          <p className="attempt-question-legend"><span className="is-correct">✓ {labels.correct} {summary.correct}</span><span className="is-wrong">× {labels.wrong} {summary.wrong}</span><span>{labels.elapsed} {formatDuration(summary.elapsedMs)}</span></p>
          <nav aria-label={copy.list}>
            {orderedAnswers.map((answer, index) => <button type="button" key={answer.questionId} className={answer.correct ? 'is-correct' : 'is-wrong'} aria-current={index === activeIndex ? 'true' : undefined} aria-label={`${index + 1}: ${answer.correct ? labels.correct : labels.wrong}`} onClick={() => { setReviewIndex(index); closeQuestionDialog(); }}><span>{index + 1}</span><small>{answer.correct ? '✓' : '×'}</small></button>)}
          </nav>
          <p className="attempt-question-dialog-summary">{labels.completed} {answeredCount} / {summary.total}</p>
        </div>
      </dialog>

    </section>
  );
}

export function PracticePanel({
  activeQuestion,
  questions,
  questionsLength,
  activeIndex,
  answeredCount,
  complete,
  feedbackMode,
  answers,
  items,
  labels,
  questionTypeLabel,
  settings,
  onAnswer,
  onPrev,
  onNext,
  onJump,
  onRestart,
  onPracticeHome,
  onPrepareReview,
  onReview,
  analysisStatus,
  loading = false,
}: {
  activeQuestion?: Question;
  questions: QuestionReference[];
  questionsLength: number;
  activeIndex: number;
  answeredCount: number;
  complete: boolean;
  feedbackMode: FeedbackMode;
  answers: AnswerState;
  items: VocabItem[];
  labels: Record<string, string>;
  questionTypeLabel: string;
  settings: DisplaySettings;
  onAnswer: (question: Question, selected: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onJump: (index: number) => void;
  onRestart: () => void;
  onPracticeHome: () => void;
  onPrepareReview: () => Promise<void>;
  onReview: () => void;
  analysisStatus: PracticeAttempt['analysisStatus'];
  loading?: boolean;
}) {
  const [answerSheetOpen, setAnswerSheetOpen] = useState(false);
  const [answerSheetPage, setAnswerSheetPage] = useState(0);
  const [answerSheetFilter, setAnswerSheetFilter] = useState<'all' | 'current' | 'correct' | 'wrong' | 'unanswered'>('all');
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewPreparing, setReviewPreparing] = useState(false);
  const practiceCardRef = useRef<HTMLElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  function navigateFromSwipe(direction: 'prev' | 'next') {
    if (direction === 'prev') onPrev();
    else onNext();
    window.requestAnimationFrame(() => {
      practiceCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function handleTouchStart(event: ReactTouchEvent<HTMLElement>) {
    if (
      event.touches.length !== 1
      || questionsLength <= 1
      || !activeQuestion
      || !answers[activeQuestion.id]
      || window.matchMedia('(min-width: 768px)').matches
    ) {
      touchStartRef.current = null;
      return;
    }
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event: ReactTouchEvent<HTMLElement>) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || event.changedTouches.length !== 1) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 56 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;

    navigateFromSwipe(deltaX > 0 ? 'prev' : 'next');
  }

  async function requestReview() {
    if (reviewPreparing) return;
    setReviewDialogOpen(true);
    if (analysisStatus === 'completed') return;
    setReviewPreparing(true);
    try {
      await onPrepareReview();
    } finally {
      setReviewPreparing(false);
    }
  }

  function runReviewDialogAction(action: () => void) {
    setReviewDialogOpen(false);
    action();
  }

  function answerOnMobile(question: Question, choice: string) {
    const alreadyAnswered = Boolean(answers[question.id]);
    if (feedbackMode === 'immediate' && alreadyAnswered) return;

    onAnswer(question, choice);

    const nextAnsweredCount = answeredCount + (alreadyAnswered ? 0 : 1);
    const currentQuestionIndex = questions.findIndex((candidate) => candidate.id === question.id);
    const baseIndex = currentQuestionIndex >= 0 ? currentQuestionIndex : activeIndex;
    let nextUnansweredIndex = -1;
    for (let offset = 1; offset <= questions.length; offset += 1) {
      const candidateIndex = (baseIndex + offset) % questions.length;
      const candidate = questions[candidateIndex];
      if (candidate.id !== question.id && !answers[candidate.id]) {
        nextUnansweredIndex = candidateIndex;
        break;
      }
    }
    const shouldAutoAdvance = typeof window !== 'undefined'
      && feedbackMode === 'batch'
      && shouldAutoAdvanceAfterBatchAnswer()
      && questionsLength > 1
      && nextAnsweredCount < questionsLength
      && nextUnansweredIndex >= 0;

    if (shouldAutoAdvance) {
      window.setTimeout(() => {
        onJump(nextUnansweredIndex);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, feedbackMode === 'immediate' ? 550 : 180);
    }
  }

  const genericPracticeTitle = /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}月\d{1,2}日)\s*(?:练习|練習|practice)?$/iu.test(questionTypeLabel.trim());
  const displayPracticeTitle = genericPracticeTitle
    ? activeQuestion?.title ?? questionTypeLabel
    : questionTypeLabel;
  const showQuestionTitle = Boolean(activeQuestion?.title && activeQuestion.title !== displayPracticeTitle);
  const answerSheetShowsResults = feedbackMode === 'immediate' || (feedbackMode === 'batch' && complete && analysisStatus === 'completed');
  const answerSheetFilterOptions = [
    { key: 'all' as const, label: labels.all ?? '全部' },
    { key: 'current' as const, label: labels.practiceCurrent },
    ...(answerSheetShowsResults
      ? [
          { key: 'correct' as const, label: labels.correct },
          { key: 'wrong' as const, label: labels.wrong },
        ]
      : [{ key: 'correct' as const, label: labels.practiceAnswered }]),
    { key: 'unanswered' as const, label: labels.practiceUnanswered },
  ];
  const visibleAnswerSheetQuestions = (answerSheetOpen ? questions : [])
    .map((question, index) => ({ question, index, answer: answers[question.id] }))
    .filter(({ index, answer }) => {
      if (answerSheetFilter === 'all') return true;
      if (answerSheetFilter === 'current') return index === activeIndex;
      if (answerSheetFilter === 'unanswered') return !answer;
      if (answerSheetFilter === 'correct') return answerSheetShowsResults ? Boolean(answer?.correct) : Boolean(answer);
      if (answerSheetFilter === 'wrong') return answerSheetShowsResults ? Boolean(answer && !answer.correct) : false;
      return true;
    });

  useEffect(() => {
    if (!activeQuestion) return;
    const currentQuestion = activeQuestion;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isTextEntryTarget(event.target)) return;

      if (event.key === 'ArrowLeft' && questionsLength > 1) {
        event.preventDefault();
        onPrev();
        return;
      }

      if (event.key === 'ArrowRight' && questionsLength > 1) {
        event.preventDefault();
        onNext();
        return;
      }

      if (/^[1-4]$/.test(event.key)) {
        const choice = currentQuestion.choices[Number(event.key) - 1];
        const alreadyAnswered = Boolean(answers[currentQuestion.id]);
        if (!choice || (feedbackMode === 'immediate' && alreadyAnswered)) return;
        event.preventDefault();
        onAnswer(currentQuestion, choice);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeQuestion, answers, feedbackMode, onAnswer, onNext, onPrev, questionsLength]);

  useEffect(() => {
    if (!reviewDialogOpen) return;
    function handleDialogKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setReviewDialogOpen(false);
    }
    window.addEventListener('keydown', handleDialogKeyDown);
    return () => window.removeEventListener('keydown', handleDialogKeyDown);
  }, [reviewDialogOpen]);

  return (
    <section
      ref={practiceCardRef}
      className="cute-practice-card practice-swipe-surface min-w-0 border px-4 pb-6 pt-4 md:p-5"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { touchStartRef.current = null; }}
    >
      {loading ? <p role="status" className="py-6 text-center">正在加载题目…</p> : null}
      <div className="practice-question-section">
        <div className="practice-question-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-[#f0d4dd] pb-4">
          <p className="text-sm font-bold text-[#a84269]">{displayPracticeTitle}</p>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">


            {questionsLength > 1 ? <ArrowButton label={labels.prev} direction="left" shortcut="ArrowLeft" onClick={onPrev} /> : null}
            <button
              type="button"
              onClick={() => { setAnswerSheetFilter('all'); setAnswerSheetPage(Math.floor(activeIndex / 100)); setAnswerSheetOpen(true); }}
              aria-label={`${labels.practiceAnswerSheet}: ${questionsLength ? `${activeIndex + 1} / ${questionsLength}` : '0 / 0'}`}
              className="practice-progress-button flex min-h-10 min-w-24 flex-col items-center justify-center rounded-2xl bg-[#fff0f5] px-2 py-1 text-[#a84269] transition hover:bg-[#ffe6ef] md:min-w-32 md:px-3"
            >
              <span className="journal-number text-sm font-black">{questionsLength ? `${activeIndex + 1} / ${questionsLength}` : '0 / 0'}</span>
            </button>
            {questionsLength > 0 ? (
              <button type="button" onClick={onRestart} aria-label={labels.restartPractice} title={labels.restartPractice} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#f0c9d4] bg-white text-[#a84269] hover:bg-[#fff0f5]">
                <RotateCcw size={17} />
              </button>
            ) : null}
            {questionsLength > 1 ? (
              <ArrowButton label={labels.next} direction="right" shortcut="ArrowRight" onClick={onNext} />
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          {showQuestionTitle ? <h2 className="text-2xl font-black text-[#3d3036]">{activeQuestion?.title ?? labels.noQuestion}</h2> : null}
          {activeQuestion?.instruction ? (
            <p className="mt-3 text-sm leading-6 text-[#74646b]">{activeQuestion.instruction}</p>
          ) : null}
          <p className={`${activeQuestion?.instruction ? 'mt-4' : 'mt-3'} break-words text-lg leading-8 text-[#3d3036]`}>
            {activeQuestion ? <QuestionPrompt text={activeQuestion.prompt} target={activeQuestion.promptTarget} locale={settings.locale} /> : loading ? null : labels.noQuestionBody}
          </p>
        </div>

        {activeQuestion ? (
          <>
            {activeQuestion ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {activeQuestion.choices.map((choice, choiceIndex) => {
                  const answered = answers[activeQuestion.id];
                  const isSelected = answered?.selected === choice;
                  const isAnswer = choice === activeQuestion.answer;
                  const shouldReveal = feedbackMode === 'immediate' || (feedbackMode === 'batch' && complete && analysisStatus === 'completed');
                  const answerState = !answered
                    ? 'unanswered'
                    : shouldReveal
                      ? isAnswer
                        ? 'correct'
                        : isSelected
                          ? 'incorrect-selected'
                          : 'answered-muted'
                      : isSelected
                        ? 'selected-batch'
                        : 'unanswered';
                  const color = !answered
                    ? 'border-[#f0d4dd] bg-white hover:bg-[#fff7fb]'
                    : shouldReveal
                      ? isAnswer
                        ? 'border-[#65a37c] bg-[#f0fff5]'
                        : isSelected
                          ? 'border-[#d95f8a] bg-[#fff0f5]'
                          : 'border-[#f0d4dd] bg-[#fffafc] opacity-70'
                      : isSelected
                        ? 'border-[#d95f8a] bg-[#fff0f5]'
                        : 'border-[#f0d4dd] bg-white';
                  return (
                    <button
                      type="button"
                      key={choice}
                      disabled={feedbackMode === 'immediate' && Boolean(answered)}
                      aria-keyshortcuts={String(choiceIndex + 1)}
                      data-answer-state={answerState}
                      onClick={() => answerOnMobile(activeQuestion, choice)}
                      className={`cute-choice flex min-h-14 min-w-0 items-start gap-3 border px-4 py-3 text-left text-base font-bold break-words disabled:cursor-default ${color}`}
                    >
                      <span aria-hidden="true" className="journal-number flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs">
                        {choiceIndex + 1}
                      </span>
                      <span className="min-w-0 pt-0.5">{choice}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {feedbackMode === 'batch' && complete && analysisStatus !== 'completed' ? (
              <div className="mt-5 flex items-center justify-end gap-3 border-t border-[#f0d4dd] pt-4">
                <button type="button" onClick={requestReview} disabled={reviewPreparing} className="cute-button-primary h-10 rounded-full px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-70">
                  {reviewPreparing ? labels.reviewPreparing : analysisStatus === 'processing' ? labels.analysisProcessing : labels.reviewPage}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {activeQuestion && answers[activeQuestion.id] && (feedbackMode === 'immediate' || (feedbackMode === 'batch' && complete && analysisStatus === 'completed')) ? (
            <AnswerPanel
              question={activeQuestion}
              answer={answers[activeQuestion.id]}
              items={items}
              showRuby={settings.showExplanationRuby}
              labels={labels}
              locale={settings.locale}
            />
      ) : null}
      {answerSheetOpen ? (
        <div className="practice-answer-sheet-backdrop fixed inset-0 z-50 bg-[#2d2328]/30 px-4 py-5" role="dialog" aria-modal="true" aria-labelledby="practice-answer-sheet-title">
          <button type="button" className="absolute inset-0 h-full w-full cursor-default" aria-label={labels.close} onClick={() => setAnswerSheetOpen(false)} />
          <div className="practice-answer-sheet-panel absolute inset-x-0 bottom-0 max-h-[78vh] rounded-t-3xl border border-[#f0d4dd] bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 id="practice-answer-sheet-title" className="text-lg font-black text-[#3d3036]">{labels.practiceAnswerSheet}</h3>
                <p className="mt-1 text-xs font-semibold text-[#74646b]">{labels.completed} {answeredCount} / {questionsLength}</p>
              </div>
              <button type="button" onClick={() => setAnswerSheetOpen(false)} aria-label={labels.close} title={labels.close} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#f0c9d4] bg-white text-[#a84269] hover:bg-[#fff0f5]">
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-[#74646b]" role="toolbar" aria-label={labels.practiceAnswerSheet}>
              {answerSheetFilterOptions.map((option) => {
                const active = answerSheetFilter === option.key;
                const tone = option.key === 'current'
                  ? 'border-[#a84269] bg-[#fff0f5] text-[#a84269]'
                  : option.key === 'correct'
                    ? answerSheetShowsResults
                      ? 'border-[#65a37c] bg-[#f0fff5] text-[#285d47]'
                      : 'border-[#9bd8b0] bg-[#f2fff6] text-[#285d47]'
                    : option.key === 'wrong'
                      ? 'border-[#d95f8a] bg-[#ffe2ea] text-[#8f2046]'
                      : option.key === 'unanswered'
                        ? 'border-[#eadfe3] bg-white text-[#74646b]'
                        : 'border-[#eadfe3] bg-white text-[#3d3036]';
                return (
                  <button
                    type="button"
                    key={option.key}
                    aria-pressed={active}
                    onClick={() => { setAnswerSheetFilter(option.key); setAnswerSheetPage(0); }}
                    className={`rounded-full border px-3 py-1 font-bold ${tone} ${active ? 'ring-2 ring-[#d95f8a] ring-offset-1' : ''}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {visibleAnswerSheetQuestions.length > 100 ? <nav className="mt-3 flex items-center justify-between gap-3" aria-label="答题卡分页">
              <button type="button" disabled={answerSheetPage === 0} onClick={() => setAnswerSheetPage((page) => page - 1)} className="rounded-xl border px-3 py-2 disabled:opacity-40">上一页</button>
              <span>{answerSheetPage + 1} / {Math.ceil(visibleAnswerSheetQuestions.length / 100)}</span>
              <button type="button" disabled={(answerSheetPage + 1) * 100 >= visibleAnswerSheetQuestions.length} onClick={() => setAnswerSheetPage((page) => page + 1)} className="rounded-xl border px-3 py-2 disabled:opacity-40">下一页</button>
            </nav> : null}
            <div className="practice-answer-sheet-grid mt-3 grid grid-cols-5 gap-2">
              {visibleAnswerSheetQuestions.slice(answerSheetPage * 100, (answerSheetPage + 1) * 100).map(({ question, index, answer }) => {
                const answered = Boolean(answer);
                const current = index === activeIndex;
                const resultClass = answerSheetShowsResults && answer
                  ? answer.correct
                    ? 'border-[#65a37c] bg-[#f0fff5] text-[#285d47]'
                    : 'border-[#d95f8a] bg-[#ffe2ea] text-[#8f2046]'
                  : answered
                    ? 'border-[#9bd8b0] bg-[#f2fff6] text-[#285d47]'
                    : 'border-[#eadfe3] bg-white text-[#74646b]';
                const currentClass = current ? 'ring-2 ring-[#d95f8a] ring-offset-2' : '';
                const stateLabel = answerSheetShowsResults && answer
                  ? answer.correct
                    ? labels.correct
                    : labels.wrong
                  : answered
                    ? labels.practiceAnswered
                    : labels.practiceUnanswered;
                return (
                  <button
                    type="button"
                    key={question.id}
                    onClick={() => {
                      onJump(index);
                      setAnswerSheetOpen(false);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    aria-label={`${current ? `${labels.practiceCurrent}, ` : ''}${stateLabel}: ${index + 1}`}
                    className={`journal-number h-11 rounded-2xl border text-sm font-black ${resultClass} ${currentClass}`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
            {visibleAnswerSheetQuestions.length === 0 ? (
              <p className="mt-4 rounded-2xl bg-[#fff7fb] px-4 py-3 text-sm font-semibold text-[#74646b]">{labels.noQuestion}</p>
            ) : null}
          </div>
        </div>
      ) : null}
      {reviewDialogOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#2d2328]/45 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-6 sm:items-center sm:pb-6" role="dialog" aria-modal="true" aria-labelledby="review-processing-title" aria-describedby="review-processing-description">
          <button type="button" className="absolute inset-0 h-full w-full cursor-default" aria-label={labels.close} onClick={() => setReviewDialogOpen(false)} />
          <div className="relative w-full max-w-md rounded-[28px] border border-[#f0d4dd] bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff0f5] text-[#a84269]">
                <ScrollText size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="review-processing-title" className="text-lg font-black text-[#3d3036]">{labels.reviewProcessingTitle}</h2>
                <p id="review-processing-description" className="mt-2 text-sm leading-6 text-[#74646b]">{analysisStatus === 'completed' ? labels.analysisCompleted : reviewPreparing || analysisStatus === 'processing' ? labels.reviewProcessingNotice : labels.reviewRetryNotice}</p>
              </div>
              <button type="button" onClick={() => setReviewDialogOpen(false)} aria-label={labels.close} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#8f6f7b] hover:bg-[#fff0f5]">
                <X size={19} />
              </button>
            </div>
            {reviewPreparing || analysisStatus === 'processing' ? (
              <p role="status" className="mt-4 flex items-center gap-2 rounded-2xl bg-[#fff7fb] px-4 py-3 text-xs font-bold text-[#a84269]">
                <LoaderCircle size={16} className="animate-spin" /> {labels.analysisProcessing}
              </p>
            ) : analysisStatus === 'completed' ? <p role="status" className="mt-4 rounded-2xl bg-[#f2fff6] px-4 py-3 text-xs font-bold text-[#285d47]">{labels.analysisCompleted}</p> : null}
            <div className="mt-5 grid gap-2.5">
              {!reviewPreparing && analysisStatus !== 'processing' && analysisStatus !== 'completed' ? <button type="button" onClick={requestReview} className="cute-button-secondary min-h-12 rounded-2xl border px-4 text-sm font-bold">{labels.reviewRetry}</button> : null}
              <button type="button" onClick={() => runReviewDialogAction(onReview)} className="cute-button-primary flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold text-white">
                <ScrollText size={18} /> {labels.reviewViewHistory}
              </button>
              <button type="button" onClick={() => runReviewDialogAction(onPracticeHome)} className="cute-button-secondary flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-bold">
                <House size={18} /> {labels.reviewBackToPracticeHome}
              </button>
              <button type="button" onClick={() => runReviewDialogAction(onRestart)} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold text-[#a84269] hover:bg-[#fff7fb]">
                <RotateCcw size={17} /> {labels.restartPractice}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AnswerPanel({
  question,
  answer,
  items,
  showRuby,
  labels,
  locale,
  compact = false,
}: {
  question: Question;
  answer?: { selected: string; correct: boolean };
  items: VocabItem[];
  showRuby: boolean;
  labels: Record<string, string>;
  locale: Locale;
  compact?: boolean;
}) {
  if (!answer) {
    return null;
  }

  const explanationDetails = normalizePracticeExplanations(question);
  const sourceItem = items.find((item) => item.id === question.itemId);
  const needsHumanReview = sourceItem?.content_origin === 'ai_generated' && sourceItem.verification_status !== 'verified';
  const isCorrect = answer.selected === question.answer;
  const statusStyle = isCorrect ? 'is-correct' : 'is-wrong';

  return (
    <div className={`cute-answer-note practice-answer-panel mt-6 ${statusStyle}`}>
      <div className="answer-note-summary flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="answer-note-kicker text-xs font-black tracking-[0.08em] uppercase text-current/70">{labels.reviewPage}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="answer-status-pill text-sm font-black">{isCorrect ? labels.correct : labels.wrong}</span>
            {!isCorrect ? <>
              <span className="answer-inline-fact min-w-0 text-sm font-semibold">{labels.yourAnswer}: {answer.selected}</span>
              <span className="answer-inline-fact min-w-0 text-sm font-semibold">{labels.rightAnswer}: {question.answer}</span>
            </> : null}
          </div>
        </div>
        {sourceItem ? (
          <EntryLink item={sourceItem} label={`${labels.viewEntry}: ${sourceItem.original}`} />
        ) : null}
      </div>

      <div className="answer-note-sections mt-4 grid gap-3">
        {question.translationZh ? (
          <div className="answer-note-block">
            <p className="text-xs font-bold text-current/70">{labels.fullChineseTranslation ?? '完整中文翻译'}</p>
            <p className="mt-1 text-sm leading-6 text-[#3f4944]">{question.translationZh}</p>
          </div>
        ) : null}

        <div className="answer-note-block">
          <p className="text-sm font-black text-[#27312c]">{labels.correctReasonLabel}</p>
          <p className="mt-2 text-sm leading-6 text-[#3f4944]">
            <RubyText text={explanationDetails.correctReason} items={items} enabled={showRuby} />
          </p>
        </div>

        <details open={compact ? undefined : true} className="answer-note-block">
          <summary className="cursor-pointer text-sm font-bold text-[#27312c]">{labels.choiceAnalysisLabel}</summary>
          <div className="answer-choice-analysis mt-3 grid gap-2">
            {explanationDetails.choiceAnalysis.map((choice) => {
              const linkedItem = choice.correct ? sourceItem : itemForChoice(choice.choice, question.kind, items);
              const selected = choice.choice === answer.selected;
              return (
                <div
                  key={choice.choice}
                  className={`answer-choice-row ${choice.correct ? 'is-correct' : selected ? 'is-selected' : ''}`}
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {linkedItem ? (
                      <EntryLink item={linkedItem} label={choice.choice} compact />
                    ) : (
                      <span className="min-w-0 font-semibold text-[#27312c]">{choice.choice}</span>
                    )}
                    <span className={`answer-choice-tag px-2 py-0.5 text-xs font-bold ${choice.correct ? 'is-correct' : selected ? 'is-selected' : ''}`}>
                      {choice.correct ? labels.choiceFits : selected ? labels.yourAnswer : labels.choiceDoesNotFit}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#4b534e]">
                    <RubyText text={choice.explanation} items={items} enabled={showRuby} />
                  </p>
                </div>
              );
            })}
          </div>
        </details>

        <div className="answer-note-block">
          <p className="text-sm font-black text-[#27312c]">{labels.memoryPointLabel}</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#3f4944]">
            <RubyText text={question.memoryPoint} items={items} enabled={showRuby} />
          </p>
        </div>
      </div>

      {needsHumanReview ? (
        <p className="mt-3 rounded-2xl border border-[#f0cf80] bg-[#fff8df] p-3 text-sm leading-6 text-[#775516]">
          {labels.unverifiedContentNotice}
        </p>
      ) : null}
    </div>
  );
}

function itemForChoice(choice: string, kind: QuestionKind, items: VocabItem[]) {
  if (kind === 'meaning') return items.find((item) => item.paraphrase_ja === choice);
  if (kind === 'kanji_to_kana') return items.find((item) => item.reading === choice);
  return items.find((item) => item.original === choice);
}

function EntryLink({ item, label, compact = false }: { item: VocabItem; label: string; compact?: boolean }) {
  return (
    <a
      href={wordDetailHref(item)}
      target="_blank"
      rel="noreferrer"
      className={`font-semibold text-[#24473f] underline decoration-[#9ab0a7] underline-offset-4 hover:decoration-[#24473f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24473f] ${compact ? 'break-words' : 'rounded-md border border-[#b9c9c1] bg-white/80 px-3 py-2 text-sm no-underline'}`}
    >
      {label}
    </a>
  );
}

export function WordIndexPanel({ items, questions, answers, progress, labels: baseLabels, locale, deckLabels, wordbooks, selectedWordbookId = 'all', captureCategory, defaultTargetDeck = 'n1_vocab', pendingCaptureCount = 0, onOpen, onPractice, onTips, onReview, onManageWordbooks, onOpenPendingCaptures, onSaveCapture, onCreateWordbook, onWordbookChange }: {
  items: VocabItem[];
  questions: Question[];
  answers: AnswerState;
  progress: ProgressState;
  labels: Record<string, string>;
  locale: Locale;
  deckLabels: Record<Deck | 'all', string>;
  wordbooks: Wordbook[];
  selectedWordbookId?: string;
  captureCategory?: LearningCaptureCategory;
  defaultTargetDeck?: Deck;
  pendingCaptureCount?: number;
  onOpen: (id: string) => void;
  onPractice?: (focus?: WordIndexPracticeFocus) => void;
  onTips?: () => void;
  onReview?: () => void;
  onManageWordbooks?: () => void;
  onOpenPendingCaptures?: () => void;
  onSaveCapture?: (input: { body: string; category: LearningCaptureCategory; context?: string; targetDeck?: Deck; targetWordbookId?: string }) => Promise<void>;
  onCreateWordbook?: (title: string, deck?: Deck) => Promise<Wordbook | null>;
  onWordbookChange?: (wordbookId: string) => void;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [sortKey, setSortKey] = useState<WordIndexSortKey>('created-asc');
 const [showCaptureForm, setShowCaptureForm] = useState(false);
  useAuthoringNavigation(showCaptureForm ? (captureCategory === 'grammar' ? '记一个句型' : '记一个单词') : null, () => { setShowCaptureForm(false); });
  // The library is always visible; the action bar above it replaces the old entry hub.
  const showEntryLibrary = true;
  const [showFocusedPractice, setShowFocusedPractice] = useState(false);
  const [captureBody, setCaptureBody] = useState('');
  const [captureContext, setCaptureContext] = useState('');
  const [targetWordbookId, setTargetWordbookId] = useState<string>(defaultTargetDeck);
  const [newWordbookTitle, setNewWordbookTitle] = useState('');
  const [creatingWordbook, setCreatingWordbook] = useState(false);
  const [wordbookError, setWordbookError] = useState('');
  const [captureSaving, setCaptureSaving] = useState(false);
  const [captureSaved, setCaptureSaved] = useState(false);
  const [selectedTag, setSelectedTag] = useState('');
  const allTagValue = '__all__';
  const isGrammarLibrary = captureCategory === 'grammar';
  const isVocabularyLibrary = captureCategory === 'word';
  const showEntryHub = isGrammarLibrary || isVocabularyLibrary;
  const collectionLabel = isGrammarLibrary
    ? (locale === 'ja' ? '文法ノート' : locale === 'en' ? 'Grammar book' : '语法本')
    : (locale === 'ja' ? '単語帳' : locale === 'en' ? 'Wordbook' : '单词本');

  const labels = bookLabels(baseLabels, isGrammarLibrary ? 'grammar' : 'vocabulary');
  // Both libraries share one design: the wordbooks offered here are the ones of the active family.
  const libraryWordbooks = wordbooksForFamily(wordbooks, isGrammarLibrary ? 'grammar' : 'vocabulary');
  const selectedWordbook = libraryWordbooks.find((wordbook) => wordbook.id === selectedWordbookId);
  const questionsByItem = useMemo(() => questions.reduce<Record<string, Question[]>>((groups, question) => {
    groups[question.itemId] = [...(groups[question.itemId] ?? []), question];
    return groups;
  }, {}), [questions]);
  const questionKindOptions = useMemo(() => {
    const counts = questions.reduce<Partial<Record<QuestionKind, number>>>((groups, question) => {
      groups[question.kind] = (groups[question.kind] ?? 0) + 1;
      return groups;
    }, {});
    return (Object.entries(counts) as [QuestionKind, number][])
      .sort((left, right) => right[1] - left[1]);
  }, [questions]);
  const tagOptions = useMemo(() => {
    if (!showEntryHub) return [] as { tag: string; count: number }[];
    const counts = new Map<string, number>();
    items.forEach((item) => filterableTags(item).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag, locale));
  }, [showEntryHub, items, locale]);
  const focusedContentOptions = useMemo(() => tagOptions.slice(0, 8), [tagOptions]);
  const [listSearch, setListSearch] = useState('');
  const sortedItems = useMemo(() => {
    const hasTagFilter = showEntryHub && selectedTag && selectedTag !== allTagValue;
    const baseItems = hasTagFilter
      ? items.filter((item) => filterableTags(item).includes(selectedTag))
      : items;
    return baseItems.filter((item) => `${item.original} ${item.reading ?? ''} ${itemMeaning(item, locale)}`.toLocaleLowerCase().includes(listSearch.trim().toLocaleLowerCase())).sort((left, right) => {
      const leftQuestions = questionsByItem[left.id]?.length ?? 0;
      const rightQuestions = questionsByItem[right.id]?.length ?? 0;
      const leftAnswered = questionsByItem[left.id]?.filter((question) => answers[question.id]).length ?? 0;
      const rightAnswered = questionsByItem[right.id]?.filter((question) => answers[question.id]).length ?? 0;
      const leftProgress = leftQuestions ? leftAnswered / leftQuestions : 0;
      const rightProgress = rightQuestions ? rightAnswered / rightQuestions : 0;
      const fallback = reviewItemTime(left) - reviewItemTime(right) || readingSortValue(left).localeCompare(readingSortValue(right), 'ja');
      if (sortKey === 'created-desc') return reviewItemTime(right) - reviewItemTime(left) || fallback;
      if (sortKey === 'level-asc') return levelSortValue(left.jlpt_level) - levelSortValue(right.jlpt_level) || fallback;
      if (sortKey === 'level-desc') return levelSortValue(right.jlpt_level) - levelSortValue(left.jlpt_level) || fallback;
      if (sortKey === 'kana-asc') return readingSortValue(left).localeCompare(readingSortValue(right), 'ja') || fallback;
      if (sortKey === 'kana-desc') return readingSortValue(right).localeCompare(readingSortValue(left), 'ja') || fallback;
      if (sortKey === 'questions-desc') return rightQuestions - leftQuestions || fallback;
      if (sortKey === 'progress-asc') return leftProgress - rightProgress || fallback;
      return fallback;
    });
  }, [answers, items, questionsByItem, selectedTag, showEntryHub, sortKey, listSearch, locale]);
  const pageCount = Math.max(1, Math.ceil(sortedItems.length / WORD_INDEX_PAGE_SIZE));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const pageStart = currentPage * WORD_INDEX_PAGE_SIZE;
  const pageItems = sortedItems.slice(pageStart, pageStart + WORD_INDEX_PAGE_SIZE);
  const mobileList = useMobileList(sortedItems.length, JSON.stringify([captureCategory, selectedWordbookId, sortKey, selectedTag, listSearch]), WORD_INDEX_PAGE_SIZE);
  const mobileVisibleCount = mobileList.visible;
  const mobileItems = sortedItems.slice(0, mobileVisibleCount);
  const pageEnd = pageStart + pageItems.length;
  const mobilePageEnd = Math.min(mobileVisibleCount, sortedItems.length);

  useEffect(() => {
    setPageIndex((index) => Math.min(index, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    if (!showEntryHub) {
      setSelectedTag('');
      return;
    }
    if (!selectedTag || (selectedTag !== allTagValue && !tagOptions.some((option) => option.tag === selectedTag))) {
      setSelectedTag(allTagValue);
    }
  }, [showEntryHub, selectedTag, tagOptions, allTagValue]);

  useEffect(() => {
    setPageIndex(0);
  }, [sortKey, selectedTag, selectedWordbookId]);


  useEffect(() => {
    setTargetWordbookId(selectedWordbook?.id ?? defaultTargetDeck);
  }, [defaultTargetDeck, selectedWordbook?.id]);

  useEffect(() => {
    setShowFocusedPractice(false);
  }, [captureCategory]);



  async function saveCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!captureBody.trim() || !captureCategory || !onSaveCapture || captureSaving) return;
    setCaptureSaving(true);
    setCaptureSaved(false);
    try {
      const targetWordbook = libraryWordbooks.find((wordbook) => wordbook.id === targetWordbookId);
      await onSaveCapture({
        body: captureBody.trim(),
        category: captureCategory,
        context: captureContext.trim() || labels.entryCaptureContextDefault,
        targetDeck: targetWordbook?.deck ?? defaultTargetDeck,
        targetWordbookId: targetWordbook?.id ?? defaultTargetDeck,
      });
      setCaptureBody('');
      setCaptureContext('');
      setCaptureSaved(true);
    } finally {
      setCaptureSaving(false);
    }
  }

  function submitWordCaptureOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (captureCategory !== 'word') return;
    if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  async function createWordbook() {
    if (!newWordbookTitle.trim() || creatingWordbook || !onCreateWordbook) return;
    setCreatingWordbook(true);
    setWordbookError('');
    try {
      const wordbook = await onCreateWordbook(newWordbookTitle.trim(), isGrammarLibrary ? 'grammar_expression' : defaultTargetDeck);
      if (wordbook) {
        setTargetWordbookId(wordbook.id);
        setNewWordbookTitle('');
      }
    } catch (error) {
      setWordbookError(error instanceof Error ? error.message : labels.wordbookCreateFailed);
    } finally {
      setCreatingWordbook(false);
    }
  }

  return (
    <LearningListFrame className={showEntryHub ? 'ledger-word-index ledger-module-page min-w-0' : 'ledger-word-index min-w-0 overflow-hidden bg-white md:rounded-lg md:border md:border-[#d8cdbc] md:shadow-sm'}>
      {showEntryHub && !showCaptureForm ? (
        <ModuleActionBar
          label={isGrammarLibrary ? '语法' : '单词'}
          primary={onPractice ? { label: '开始练习', hint: isGrammarLibrary ? '随机一组语法题' : '随机一组单词题', onClick: () => onPractice({ kind: 'random' }) } : undefined}
          actions={[
            { key: 'focused', label: '按题型练习', icon: <Target size={16} aria-hidden="true" />, active: showFocusedPractice, onClick: () => { setShowFocusedPractice((value) => !value); setShowCaptureForm(false); } },
            ...(onTips ? [{ key: 'tips', label: '学习方法', icon: <Lightbulb size={16} aria-hidden="true" />, onClick: onTips }] : []),
            ...(onReview ? [{ key: 'review', label: labels.reviewPage, icon: <ScrollText size={16} aria-hidden="true" />, onClick: onReview }] : []),
            ...(captureCategory && onSaveCapture ? [{ key: 'capture', label: isGrammarLibrary ? '记一个句型' : '记一个单词', icon: <Plus size={16} aria-hidden="true" />, active: showCaptureForm, onClick: () => { setShowCaptureForm((value) => !value); setShowFocusedPractice(false); setCaptureSaved(false); } }] : []),
          ]}
        >
          {showFocusedPractice ? (
            <div className="ledger-focused-practice-panel">
              <div>
                <p>按题型练习</p>
                <div className="ledger-focused-practice-options">
                  {questionKindOptions.length ? questionKindOptions.map(([kind, count]) => (
                    <button key={kind} type="button" onClick={() => onPractice?.({ kind: 'question-kind', questionKind: kind })}>
                      <span>{questionKindLabel(kind, labels)}</span>
                      <strong>{count} 题</strong>
                    </button>
                  )) : <span className="ledger-focused-empty">暂无可练题型</span>}
                </div>
              </div>
              <div>
                <p>按内容练习</p>
                <div className="ledger-focused-practice-options">
                  {libraryWordbooks.length > 1 && onWordbookChange ? libraryWordbooks.slice(0, 8).map((wordbook) => (
                    <button key={wordbook.id} type="button" onClick={() => { onWordbookChange(wordbook.id); setShowFocusedPractice(false); }}>
                      <span>{wordbook.title}</span>
                      <strong>{items.filter((item) => itemInWordbook(item, wordbook.id)).length} 项</strong>
                    </button>
                  )) : null}
                  {focusedContentOptions.map((option) => (
                    <button
                      key={`tag:${option.tag}`}
                      type="button"
                      onClick={() => {
                        if (isGrammarLibrary) { onPractice?.({ kind: 'tag', tag: option.tag }); return; }
                        setSelectedTag(option.tag);
                        setShowFocusedPractice(false);
                      }}
                    >
                      <span>#{option.tag}</span>
                      <strong>{option.count} 项</strong>
                    </button>
                  ))}
                  {!focusedContentOptions.length && !(libraryWordbooks.length > 1 && onWordbookChange) ? <span className="ledger-focused-empty">暂无可用分类</span> : null}
                </div>
              </div>
            </div>
          ) : null}
        </ModuleActionBar>
      ) : null}
      <div className={showEntryLibrary ? "learning-list-controls" : undefined}>
      {showEntryLibrary ? <LearningListHeader title={isGrammarLibrary ? (locale === 'zh-CN' ? '语法笔记' : locale === 'ja' ? '文法ノート' : 'Grammar') : (locale === 'zh-CN' ? '单词本' : locale === 'ja' ? '単語帳' : 'Wordbook')} count={`${sortedItems.length} ${labels.items}`} search={<LearningListSearch value={listSearch} locale={locale} label={locale === 'zh-CN' ? '查找当前列表' : locale === 'ja' ? 'リストを検索' : 'Search this list'} placeholder={locale === 'zh-CN' ? '搜索词语、读音或释义' : locale === 'ja' ? 'リストを検索' : 'Search this list'} onChange={(value) => { setListSearch(value); setPageIndex(0); }}/>} >
        {showEntryHub && onManageWordbooks ? (
          <button
            type="button"
            onClick={onManageWordbooks}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-[#d9d0c3] bg-white px-3 text-sm font-semibold text-[#34443c] hover:bg-[#f7f4ef] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24473f]"
          >
            <Settings size={16} aria-hidden="true" />
            <span>{labels.wordbookManage}</span>
          </button>
        ) : null}
      </LearningListHeader> : null}
      <details onKeyDown={(event) => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }} onBlur={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) event.currentTarget.open = false; }} className={`ledger-word-toolbar learning-list-more border-b border-[#e5ddd1] px-4 py-4 md:px-5 ${showEntryHub && !showEntryLibrary ? 'hidden' : ''}`}>
        <summary>{locale === 'zh-CN' ? '更多' : locale === 'ja' ? 'その他' : 'More'}</summary>
        <div className="mobile-action-header flex flex-wrap items-center justify-between gap-3">
          <div className="hidden flex-wrap items-center justify-end gap-2 md:flex">
            {!showEntryHub && onPractice ? <ModuleAction label={labels.questionPage} onClick={onPractice}><Target size={16} /></ModuleAction> : null}
            {!showEntryHub && onTips ? <ModuleAction label={labels.navQuestionTypes} onClick={onTips}><Lightbulb size={16} /></ModuleAction> : null}
            {!showEntryHub && onReview ? <ModuleAction label={labels.reviewPage} onClick={onReview}><ScrollText size={16} /></ModuleAction> : null}
          </div>
          <div className="mobile-filter-row flex flex-wrap items-center gap-2">
            {showEntryHub && onWordbookChange ? (
              <label className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[#59645e]">
                <span className="shrink-0">{labels.wordbookFilter}</span>
                <select
                  value={selectedWordbook ? selectedWordbookId : 'all'}
                  onChange={(event) => onWordbookChange(event.target.value)}
                  aria-label={labels.wordbookFilter}
                  className="h-9 max-w-56 rounded-md border border-[#d9d0c3] bg-white px-2 text-sm font-semibold text-[#34443c] outline-none focus:border-[#24473f]"
                >
                  <option value="all">{labels.wordbookAll}</option>
                  {libraryWordbooks.map((wordbook) => (
                    <option key={wordbook.id} value={wordbook.id}>{wordbook.title}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {showEntryHub && tagOptions.length ? (
              <label className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[#59645e]">
                <span className="shrink-0">{labels.entryTagFilter}</span>
                <select
                  value={selectedTag || allTagValue}
                  onChange={(event) => setSelectedTag(event.target.value)}
                  aria-label={labels.entryTagFilter}
                  className="h-9 max-w-56 rounded-md border border-[#d9d0c3] bg-white px-2 text-sm font-semibold text-[#34443c] outline-none focus:border-[#24473f]"
                >
                  <option value={allTagValue}>{labels.entryTagAll}</option>
                  {tagOptions.map((option) => <option key={option.tag} value={option.tag}>{option.tag} ({option.count})</option>)}
                </select>
              </label>
            ) : null}
            <label className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[#59645e]">
              <span className="shrink-0">{labels.entrySort}</span>
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as WordIndexSortKey)}
                className="h-9 max-w-48 rounded-md border border-[#d9d0c3] bg-white px-2 text-sm font-semibold text-[#34443c] outline-none focus:border-[#24473f]"
              >
                {(['created-asc', 'created-desc', 'level-asc', 'level-desc', 'kana-asc', 'kana-desc', 'questions-desc', 'progress-asc'] as WordIndexSortKey[]).map((key) => (
                  <option key={key} value={key}>{sortLabel(key, labels)}</option>
                ))}
              </select>
            </label>
            {captureCategory && pendingCaptureCount ? (
              <button
                type="button"
                onClick={onOpenPendingCaptures}
                className="rounded-md bg-[#fff8df] px-3 py-1 text-sm font-semibold text-[#775516] ring-1 ring-[#eadb9b] hover:bg-[#fff1bd] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b98718] disabled:cursor-default"
                disabled={!onOpenPendingCaptures}
              >
                {labels.entryPendingCapture}: {pendingCaptureCount}
              </button>
            ) : null}
            <span className="rounded-md bg-[#e8f0eb] px-3 py-1 text-sm font-semibold text-[#24473f]">{sortedItems.length} {labels.items}</span>
          </div>
        </div>
      </details>
      </div>
      {showCaptureForm && captureCategory && onSaveCapture ? (
        <form onSubmit={saveCapture} className="grid gap-3 border-b border-[#e5ddd1] bg-[#fffafc] px-4 py-4 md:px-5">
          <label className="block text-sm font-semibold text-[#4b3b42]">
            {captureCategory === 'grammar' ? labels.entryAddGrammarInput : labels.entryAddWordInput}
            <textarea
              value={captureBody}
              onChange={(event) => { setCaptureBody(event.target.value); setCaptureSaved(false); }}
              onKeyDown={submitWordCaptureOnEnter}
              maxLength={5000}
              autoFocus
              placeholder={captureCategory === 'grammar' ? labels.entryAddGrammarPlaceholder : labels.entryAddWordPlaceholder}
              className="mt-2 min-h-28 w-full resize-y rounded-md border border-[#e2c8d3] bg-white p-3 text-base leading-7 text-[#27312c] outline-none focus:border-[#d95f8a]"
            />
          </label>
          <label className="block text-sm font-semibold text-[#4b3b42]">
            {labels.entryAddContext}
            <input
              value={captureContext}
              onChange={(event) => setCaptureContext(event.target.value)}
              maxLength={2000}
              placeholder={labels.entryAddContextPlaceholder}
              className="mt-2 h-10 w-full rounded-md border border-[#e2c8d3] bg-white px-3 text-sm text-[#27312c] outline-none focus:border-[#d95f8a]"
            />
          </label>
          {showEntryHub ? (
            <label className="block text-sm font-semibold text-[#4b3b42]">
              {labels.entryAddTargetDeck}
              <select
                value={targetWordbookId}
                onChange={(event) => setTargetWordbookId(event.target.value)}
                className="mt-2 h-10 w-full rounded-md border border-[#e2c8d3] bg-white px-3 text-sm text-[#27312c] outline-none focus:border-[#d95f8a]"
              >
                {libraryWordbooks.map((wordbook) => (
                  <option key={wordbook.id} value={wordbook.id}>{wordbook.title}</option>
                ))}
              </select>
            </label>
          ) : null}
          {showEntryHub && onCreateWordbook ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1 text-sm font-semibold text-[#4b3b42]">
                {labels.wordbookNewName}
                <input
                  value={newWordbookTitle}
                  onChange={(event) => setNewWordbookTitle(event.target.value)}
                  maxLength={60}
                  placeholder={labels.wordbookCreatePlaceholder}
                  className="mt-2 h-10 w-full rounded-md border border-[#e2c8d3] bg-white px-3 text-sm text-[#27312c] outline-none focus:border-[#d95f8a]"
                />
              </label>
              <button type="button" onClick={createWordbook} disabled={!newWordbookTitle.trim() || creatingWordbook} className="h-10 rounded-md border border-[#e2c8d3] bg-white px-4 text-sm font-bold text-[#a84269] disabled:cursor-wait disabled:opacity-50">
                {creatingWordbook ? labels.processing : labels.wordbookCreate}
              </button>
              {wordbookError ? <p role="alert" className="text-sm font-semibold text-[#8f3d2e]">{wordbookError}</p> : null}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={!captureBody.trim() || captureSaving} className="h-10 rounded-md bg-[#d95f8a] px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-50">
              {captureSaving ? labels.captureSaving : labels.entryAddSave}
            </button>
            {captureSaved ? <p role="status" className="text-sm font-semibold text-[#356146]">{labels.entryAddSaved}</p> : null}
          </div>
        </form>
      ) : null}
      {showEntryLibrary ? (
        <>
        <LearningList locale={locale} columns={showEntryHub ? <LearningListColumns locale={locale}
          title={isGrammarLibrary ? (locale === 'ja' ? '文型' : locale === 'en' ? 'Grammar' : '句型') : (locale === 'ja' ? '単語' : locale === 'en' ? 'Word' : '单词')}
          collectionLabel={collectionLabel} showPartOfSpeech={isVocabularyLibrary}/> : undefined}>{(mobileList.mobile ? mobileItems : pageItems).map((item) => {
          const missingBook = locale === 'ja' ? '不明' : locale === 'en' ? 'Unknown' : '未知';
          const wordbookId = itemWordbookId(item);
          const wordbookTitle = wordbooks.find((book) => book.id === wordbookId)?.title
            ?? (wordbookId === item.deck ? deckLabels[item.deck] : missingBook);
          return <LearningListRow key={item.id}
            title={item.original}
            reading={isVocabularyLibrary && item.reading === item.original ? undefined : item.reading}
            description={showEntryHub ? undefined : itemMeaning(item, locale)}
            metadata={showEntryHub ? <LearningListMetadata locale={locale}
              addedAt={item.input_at ?? item.date} collectionLabel={collectionLabel} collection={wordbookTitle}
              nextReviewAt={progress[item.id]?.nextReviewAt} showPartOfSpeech={isVocabularyLibrary} partOfSpeech={item.part_of_speech}/> : undefined}
            statusKind={progress[item.id]?.status ?? "new"}
            status={progress[item.id]?.status === 'mastered' ? labels.statusMastered : progress[item.id]?.status === 'review' ? labels.statusReview : progress[item.id]?.status === 'learning' ? labels.statusLearning : labels.statusNew}
            locale={locale} onOpen={() => onOpen(item.id)}/>;
        })}</LearningList>
        {sortedItems.length > 0 && (mobileList.mobile
          ? <div ref={mobileList.setSentinel} className="catalog-notice" role="status">{mobilePageEnd >= sortedItems.length ? labels.mobileNoMore : null}</div>
          : <LearningListPagination page={currentPage} pages={pageCount} onChange={setPageIndex} summary={`${pageStart + 1}-${pageEnd} / ${sortedItems.length} ${labels.items}`} previous={labels.entryPagePrev} next={labels.entryPageNext}/>)}
        </>
      ) : null}
    </LearningListFrame>
  );
}

function ModuleAction({ label, children, onClick }: { label: string; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#ead1dc] bg-white px-3 text-sm font-bold text-[#a84269] hover:bg-[#fff0f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d95f8a]">
      {children}
      <span>{label}</span>
    </button>
  );
}

function IconAction({ label, title, children, onClick }: { label: string; title: string; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={title} onClick={onClick} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#ead1dc] bg-white text-[#a84269] hover:bg-[#fff0f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d95f8a]">
      {children}
    </button>
  );
}

export function WordbookManagerPanel({ labels: baseLabels, family, wordbooks, items = [], onCreateWordbook, onRenameWordbook, onShareWordbook, onBack }: {
  labels: Record<string, string>;
  family: WordbookFamily;
  wordbooks: Wordbook[];
  items?: VocabItem[];
  onCreateWordbook?: (title: string, deck?: Deck) => Promise<Wordbook | null>;
  onRenameWordbook: (id: string, title: string) => Promise<Wordbook | null>;
  onShareWordbook: (id: string, description: string) => Promise<void>;
  onBack: () => void;
}) {
  const [editingWordbookId, setEditingWordbookId] = useState<string | null>(null);
  const [editingWordbookTitle, setEditingWordbookTitle] = useState('');
  const [renamingWordbook, setRenamingWordbook] = useState(false);
  const [renameWordbookError, setRenameWordbookError] = useState('');
  const [newWordbookTitle, setNewWordbookTitle] = useState('');
  const [creatingWordbook, setCreatingWordbook] = useState(false);
  const [createWordbookError, setCreateWordbookError] = useState('');
  const labels = bookLabels(baseLabels, family);
  const familyWordbooks = wordbooksForFamily(wordbooks, family);
  const isGrammar = family === 'grammar';

  async function createWordbook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newWordbookTitle.trim() || creatingWordbook || !onCreateWordbook) return;
    setCreatingWordbook(true);
    setCreateWordbookError('');
    try {
      const wordbook = await onCreateWordbook(newWordbookTitle.trim(), isGrammar ? 'grammar_expression' : 'n1_vocab');
      if (wordbook) setNewWordbookTitle('');
    } catch (error) {
      setCreateWordbookError(error instanceof Error ? error.message : labels.wordbookCreateFailed);
    } finally {
      setCreatingWordbook(false);
    }
  }

  function startRenamingWordbook(wordbook: Wordbook) {
    setEditingWordbookId(wordbook.id);
    setEditingWordbookTitle(wordbook.title);
    setRenameWordbookError('');
  }

  async function renameWordbook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingWordbookId || !editingWordbookTitle.trim() || renamingWordbook) return;
    setRenamingWordbook(true);
    setRenameWordbookError('');
    try {
      const wordbook = await onRenameWordbook(editingWordbookId, editingWordbookTitle.trim());
      if (wordbook) {
        setEditingWordbookId(null);
        setEditingWordbookTitle('');
      }
    } catch (error) {
      setRenameWordbookError(error instanceof Error ? error.message : labels.wordbookRenameFailed);
    } finally {
      setRenamingWordbook(false);
    }
  }

  return (
    <section className="min-w-0 overflow-hidden bg-white md:rounded-lg md:border md:border-[#d8cdbc] md:shadow-sm">
      <div className="border-b border-[#e5ddd1] px-4 py-4 md:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-[#26352f]">{labels.wordbookManage}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#68736d]">{labels.wordbookManageHint}</p>
          </div>
          <button type="button" onClick={onBack} className="h-9 rounded-md border border-[#d9d0c3] bg-white px-3 text-sm font-semibold text-[#34443c] hover:bg-[#f7f4ef]">
            {labels.backToEntryList}
          </button>
        </div>
      </div>
      {onCreateWordbook ? (
        <form onSubmit={createWordbook} className="flex flex-col gap-2 border-b border-[#e5ddd1] px-4 py-4 sm:flex-row sm:items-end md:px-5">
          <label className="min-w-0 flex-1 text-sm font-semibold text-[#4b3b42]">
            {labels.wordbookNewName}
            <input
              value={newWordbookTitle}
              onChange={(event) => setNewWordbookTitle(event.target.value)}
              maxLength={60}
              placeholder={labels.wordbookCreatePlaceholder}
              className="mt-2 h-10 w-full rounded-md border border-[#d9d0c3] bg-white px-3 text-sm text-[#27312c] outline-none focus:border-[#24473f]"
            />
          </label>
          <button type="submit" disabled={!newWordbookTitle.trim() || creatingWordbook} className="h-10 rounded-md bg-[#24473f] px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-50">
            {creatingWordbook ? labels.processing : labels.wordbookCreate}
          </button>
          {createWordbookError ? <p role="alert" className="text-sm font-semibold text-[#8f3d2e]">{createWordbookError}</p> : null}
        </form>
      ) : null}
      <div className="p-4">
        <LearningList hasActions columnLabels={[labels.wordbookFilter, null, null]}>{familyWordbooks.map((wordbook) => editingWordbookId === wordbook.id ? (
<form key={wordbook.id} onSubmit={renameWordbook} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={editingWordbookTitle}
                  onChange={(event) => setEditingWordbookTitle(event.target.value)}
                  maxLength={60}
                  autoFocus
                  aria-label={labels.wordbookRenameTitle}
                  className="h-10 min-w-0 flex-1 rounded-md border border-[#c8d1c8] bg-white px-3 text-sm outline-none focus:border-[#24473f]"
                />
                <div className="flex gap-2">
                  <button type="submit" disabled={!editingWordbookTitle.trim() || renamingWordbook} className="h-10 rounded-md bg-[#24473f] px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-50">
                    {renamingWordbook ? labels.processing : labels.draftEditSave}
                  </button>
                  <button type="button" onClick={() => { setEditingWordbookId(null); setRenameWordbookError(''); }} className="h-10 rounded-md border border-[#d9d0c3] bg-white px-4 text-sm font-semibold text-[#59645e]">
                    {labels.draftEditCancel}
                  </button>
                </div>
              </form>
        ) : <LearningListRow key={wordbook.id} compact inlineActions title={wordbook.title} reading={`${items.filter((item) => itemInWordbook(item, wordbook.id)).length} ${labels.items}${wordbook.builtIn ? ` · ${labels.wordbookBuiltIn}` : ''}`} secondary={<ShareButton iconOnly onShare={(description) => onShareWordbook(wordbook.id, description)} />} actionIcon={<Pencil size={20} aria-hidden="true" />} actionLabel={labels.wordbookRename} onOpen={() => startRenamingWordbook(wordbook)}/>)}</LearningList>
        {renameWordbookError ? <p role="alert" className="text-sm font-semibold text-[#8f3d2e]">{renameWordbookError}</p> : null}
      </div>
    </section>
  );
}

function StatusPill({ status, labels }: { status: ReviewStatus; labels: Record<string, string> }) {
  const text = status === 'mastered'
    ? labels.statusMastered
    : status === 'review'
      ? labels.statusReview
      : status === 'learning'
        ? labels.statusLearning
        : labels.statusNew;
  const color = status === 'mastered'
    ? 'bg-[#d5eadc] text-[#285d47]'
    : status === 'review'
      ? 'bg-[#e8f0eb] text-[#24473f]'
      : status === 'learning'
        ? 'bg-[#f8ead6] text-[#73532b]'
        : 'bg-[#f1eee8] text-[#665f55]';
  return <span className={`whitespace-nowrap rounded px-2 py-1 text-xs font-semibold ${color}`}>{text}</span>;
}

const ENTRY_NAVIGATOR_PAGE_SIZE = 20;

export function WordDetailPanel({
  item,
  index,
  total,
  showRuby,
  labels,
  locale,
  wordbooks = [],
  navigationItems = [],
  onOrganize,
  onShowRubyChange,
  onPrevious,
  onNext,
  onSelectIndex,
}: {
  item?: VocabItem;
  index: number;
  total: number;
  showRuby: boolean;
  labels: Record<string, string>;
  locale: Locale;
  wordbooks?: Wordbook[];
  navigationItems?: VocabItem[];
  onOrganize?: (id: string, input: { wordbookId?: string; tags?: string[] }) => Promise<VocabItem | null>;
  onShowRubyChange: (checked: boolean) => void;
  onPrevious: () => void;
  onNext: () => void;
  onSelectIndex?: (index: number) => void;
}) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [navigatorPage, setNavigatorPage] = useState(() => Math.floor(index / ENTRY_NAVIGATOR_PAGE_SIZE));

  if (!item) {
    return <EmptyModule labels={labels} />;
  }

  function handleTouchEnd(x: number) {
    if (touchStart === null) {
      return;
    }
    const delta = x - touchStart;
    setTouchStart(null);
    if (Math.abs(delta) < 48) {
      return;
    }
    if (delta > 0) {
      onPrevious();
    } else {
      onNext();
    }
  }

  return (
    <section
      className="min-w-0"
      onTouchStart={(event) => setTouchStart(event.changedTouches[0]?.clientX ?? null)}
      onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
    >
      <div className="sticky top-12 z-20 mb-3 -mx-4 border-y border-[#f0d4dd] bg-[#fffdf9]/95 px-4 py-2.5 shadow-[0_6px_16px_rgba(79,48,63,0.04)] backdrop-blur md:static md:mx-0 md:border-x-0 md:border-t-0 md:bg-transparent md:px-0 md:pb-3 md:pt-0 md:shadow-none">
        <p className="hidden text-sm font-bold text-[#a84269] md:block">{labels.wordDetail}</p>
        <div className="flex items-center justify-between gap-3 md:mt-3 md:justify-start">
          <CompactToggle checked={showRuby} label={labels.furigana} onChange={onShowRubyChange} />
          <div className="grid shrink-0 grid-cols-[2.75rem_minmax(4.75rem,auto)_2.75rem] items-center gap-1.5" aria-label={labels.wordDetail}>
            <ArrowButton label={labels.prev} direction="left" onClick={onPrevious} disabled={total <= 1} />
            <button
              type="button"
              className="journal-number rounded-full bg-[#fff0f5] px-2.5 py-2 text-center text-sm font-bold tabular-nums text-[#a84269] hover:bg-[#ffe6ef]"
              aria-haspopup="dialog"
              aria-expanded={navigatorOpen}
              onClick={() => {
                setNavigatorPage(Math.floor(index / ENTRY_NAVIGATOR_PAGE_SIZE));
                setNavigatorOpen((open) => !open);
              }}
            >
              {total ? `${safeIndex(index, total) + 1} / ${total}` : '0 / 0'}
            </button>
            <ArrowButton label={labels.next} direction="right" onClick={onNext} disabled={total <= 1} />
          </div>
        </div>
        {navigatorOpen && navigationItems.length ? (
          <div role="dialog" aria-label={labels.wordDetail} className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-[#f0d4dd] bg-white p-3 shadow-lg">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {navigationItems.slice(navigatorPage * ENTRY_NAVIGATOR_PAGE_SIZE, (navigatorPage + 1) * ENTRY_NAVIGATOR_PAGE_SIZE).map((entry, pageIndex) => {
                const entryIndex = navigatorPage * ENTRY_NAVIGATOR_PAGE_SIZE + pageIndex;
                return (
                <button
                  type="button"
                  key={entry.id}
                  className={`rounded-lg border px-2 py-2 text-left text-xs font-bold ${entryIndex === safeIndex(index, total) ? 'border-[#d95f8a] bg-[#fff0f5] text-[#a84269]' : 'border-[#ead1dc] bg-white text-[#59645e] hover:bg-[#fffafc]'}`}
                  aria-current={entryIndex === safeIndex(index, total) ? 'true' : undefined}
                  onClick={() => { onSelectIndex?.(entryIndex); setNavigatorOpen(false); }}
                >
                  <span className="mr-1 text-[#a84269]">{entryIndex + 1}.</span>{entry.original}
                </button>
                );
              })}
            </div>
            {navigationItems.length > ENTRY_NAVIGATOR_PAGE_SIZE ? (
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#f0d4dd] pt-3 text-xs font-bold text-[#74646b]">
                <button type="button" className="rounded-md border border-[#ead1dc] px-2.5 py-1.5 text-[#a84269] disabled:opacity-40" disabled={navigatorPage === 0} onClick={() => setNavigatorPage((page) => Math.max(0, page - 1))}>上一页</button>
                <span>{navigatorPage + 1} / {Math.ceil(navigationItems.length / ENTRY_NAVIGATOR_PAGE_SIZE)}</span>
                <button type="button" className="rounded-md border border-[#ead1dc] px-2.5 py-1.5 text-[#a84269] disabled:opacity-40" disabled={(navigatorPage + 1) * ENTRY_NAVIGATOR_PAGE_SIZE >= navigationItems.length} onClick={() => setNavigatorPage((page) => Math.min(Math.ceil(navigationItems.length / ENTRY_NAVIGATOR_PAGE_SIZE) - 1, page + 1))}>下一页</button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <VocabCard
        item={item}
        showRuby={showRuby}
        labels={labels}
        locale={locale}
      />
      {onOrganize ? <EntryOrganizer key={item.id} item={item} wordbooks={wordbooks} labels={labels} onOrganize={onOrganize} /> : null}
    </section>
  );
}

/** One wordbook per entry, any number of tags. */
function EntryOrganizer({ item, wordbooks, labels: baseLabels, onOrganize }: {
  item: VocabItem;
  wordbooks: Wordbook[];
  labels: Record<string, string>;
  onOrganize: (id: string, input: { wordbookId?: string; tags?: string[] }) => Promise<VocabItem | null>;
}) {
  const family = wordbookFamily(item.deck);
  const labels = bookLabels(baseLabels, family);
  const familyWordbooks = wordbooksForFamily(wordbooks, family);
  const tags = itemTagList(item);
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(input: { wordbookId?: string; tags?: string[] }) {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await onOrganize(item.id, input);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : labels.entryOrganizeFailed);
    } finally {
      setSaving(false);
    }
  }

  function addTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tag = newTag.trim();
    if (!tag || tags.includes(tag)) { setNewTag(''); return; }
    setNewTag('');
    void save({ tags: [...tags, tag] });
  }

  const selectClass = 'h-9 max-w-64 rounded-md border border-[#d9d0c3] bg-white px-2 text-sm font-semibold text-[#34443c] outline-none focus:border-[#24473f] disabled:opacity-60';
  return (
    <section className="mt-4 rounded-lg border border-[#e5ddd1] bg-white p-4" aria-label={labels.entryOrganize}>
      <h3 className="text-sm font-black text-[#26352f]">{labels.entryOrganize}</h3>
      <p className="mt-1 text-xs leading-5 text-[#68736d]">{labels.entryOrganizeHint}</p>
      <label className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-[#59645e]">
        <span className="shrink-0">{labels.wordbookFilter}</span>
        <select value={itemWordbookId(item)} disabled={saving} onChange={(event) => void save({ wordbookId: event.target.value })} className={selectClass}>
          {familyWordbooks.map((wordbook) => <option key={wordbook.id} value={wordbook.id}>{wordbook.title}</option>)}
          {familyWordbooks.some((wordbook) => wordbook.id === itemWordbookId(item)) ? null : <option value={itemWordbookId(item)}>{itemWordbookId(item)}</option>}
        </select>
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-[#59645e]">{labels.entryTags}</span>
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-[#e8f0eb] py-1 pl-3 pr-1 text-sm font-semibold text-[#24473f]">
            #{tag}
            <button type="button" disabled={saving} aria-label={`${labels.entryTagRemove}: ${tag}`} onClick={() => void save({ tags: tags.filter((current) => current !== tag) })} className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-[#d5e3da] disabled:opacity-60">
              <X size={14} aria-hidden="true" />
            </button>
          </span>
        ))}
        <form onSubmit={addTag} className="flex items-center gap-1">
          <input value={newTag} onChange={(event) => setNewTag(event.target.value)} maxLength={40} disabled={saving} placeholder={labels.entryTagAddPlaceholder} aria-label={labels.entryTagAdd} className="h-9 w-40 rounded-md border border-[#d9d0c3] bg-white px-2 text-sm outline-none focus:border-[#24473f] disabled:opacity-60" />
          <button type="submit" disabled={!newTag.trim() || saving} className="h-9 rounded-md border border-[#d9d0c3] bg-white px-3 text-sm font-semibold text-[#34443c] hover:bg-[#f7f4ef] disabled:opacity-50">{labels.entryTagAdd}</button>
        </form>
      </div>
      {error ? <p role="alert" className="mt-2 text-sm font-semibold text-[#8f3d2e]">{error}</p> : null}
    </section>
  );
}

function EmptyModule({ labels }: { labels: Record<string, string> }) {
  return (
    <section className="cute-practice-card min-w-0 border border-dashed p-6">
      <h2 className="text-2xl font-black text-[#3d3036]">{labels.moduleEmptyTitle}</h2>
      <p className="mt-3 text-sm leading-7 text-[#74646b]">{labels.moduleEmptyBody}</p>
    </section>
  );
}

function CompactToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-bold transition-colors ${checked ? 'border-[#d95f8a] bg-[#fff0f5] text-[#a84269]' : 'border-[#d7dfd6] bg-white text-[#68716b]'}`}>
      <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-[#d95f8a]' : 'bg-[#cbd2cc]'}`} aria-hidden="true">
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5'}`} />
      </span>
      <span>{label}</span>
    </button>
  );
}

function ArrowButton({ label, direction, shortcut, onClick, disabled = false }: { label: string; direction: 'left' | 'right'; shortcut?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-keyshortcuts={shortcut}
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-[#f0c9d4] bg-white text-[#a84269] hover:bg-[#fff0f5] disabled:cursor-not-allowed disabled:border-[#e3e8e2] disabled:text-[#b8beb9]"
    >
      {direction === 'left' ? <ChevronLeft size={19} /> : <ChevronRight size={19} />}
    </button>
  );
}

function VocabCard({
  item,
  showRuby,
  labels,
  locale,
}: {
  item: VocabItem;
  showRuby: boolean;
  labels: Record<string, string>;
  locale: Locale;
}) {
  const meaning = localized(item, locale, 'meaning') ?? item.meaning_zh;
  const coreMemory = localized(item, locale, 'core_memory') ?? item.core_memory;
  const analysis = localized(item, locale, 'analysis') ?? item.analysis;
  const isGrammarEntry = item.deck === 'grammar_expression';
  const grammarForms = item.grammar_forms?.filter((form) => form.form || form.example || form.meaning_zh || form.connection_zh) ?? [];
  const grammarFeatures = item.grammar_features?.filter((feature) => feature.feature || feature.detail_zh) ?? [];
  const examples = item.examples?.filter((example) => example.ja || example.zh || example.spoken_ja || example.spoken_zh || example.analysis_zh || example.form_analysis_zh) ?? [];
  const inflectionClass = resolvedInflectionClass(item);
  const baseForm = item.base_form ?? (inflectionClass === 'suru' && item.original.endsWith('する') ? item.original : undefined);
  const conjugations = resolvedConjugations(item, inflectionClass, baseForm);
  const everydayAlternatives = item.everyday_alternatives?.filter((alternative) => alternative.ja || alternative.zh) ?? [];
  const registerLabel = item.usage_register
    ? labels[`usageRegister_${item.usage_register}`] ?? item.usage_register
    : null;
  const comparisonNotes = [
    ...(item.comparison_notes ?? []),
    ...(item.comparisons ?? []),
  ].filter((comparison) => comparison.target || comparison.difference_zh);
  return (
    <article className="cute-practice-card min-w-0 border p-4 md:p-6">
      <h3 className="text-3xl font-black text-[#3d3036]">
        <RubyText text={item.original} items={[item]} enabled={showRuby} />
      </h3>
      <div className="mt-5 space-y-5 border-t border-[#f0d4dd] pt-5">
        <section>
          <h4 className="text-xs font-bold text-[#a84269]">{labels.japaneseMeaning}</h4>
          <p className="mt-2 text-sm leading-7 text-[#3d3036]">
            <RubyText text={item.meaning_ja ?? '-'} items={[item]} enabled={showRuby} />
          </p>
        </section>
        {locale !== 'ja' ? (
          <section className="border-t border-[#f0d4dd] pt-5">
            <h4 className="text-xs font-bold text-[#a84269]">{labels.localizedMeaning}</h4>
            <p className="mt-2 text-sm leading-7 text-[#3d3036]">{meaning}</p>
          </section>
        ) : null}
      </div>
      {isGrammarEntry && item.formation ? (
        <section className="mt-5 border-t border-[#f0d4dd] pt-5">
          <h4 className="text-xs font-bold text-[#a84269]">形成・接续</h4>
          <p className="mt-2 whitespace-pre-line text-sm leading-7 text-[#3d3036]">{item.formation}</p>
        </section>
      ) : null}
      <section className="mt-5 border-t border-[#f0d4dd] pt-5">
        <h4 className="text-xs font-bold text-[#a84269]">{labels.examQuickNote}</h4>
        <p className="mt-2 whitespace-pre-line text-sm leading-7 text-[#3d3036]">{coreMemory}</p>
      </section>
      {item.collocations?.length ? (
        <section className="mt-5 border-t border-[#f0d4dd] pt-5">
          <h4 className="text-xs font-bold text-[#a84269]">{labels.collocationsLabel}</h4>
          <ol className="mt-3 space-y-4">
            {item.collocations.slice(0, 4).map((collocation, collocationIndex) => {
              const separatorIndex = collocation.search(/[：:]/);
              const phrase = (separatorIndex < 0 ? collocation : collocation.slice(0, separatorIndex)).trim();
              const translation = separatorIndex < 0 ? '' : collocation.slice(separatorIndex + 1).trim();
              return (
                <li key={`${collocation}-${collocationIndex}`} className="border-l-2 border-[#f0c9d4] pl-3">
                  <p className="text-sm font-bold leading-7 text-[#3d3036]">
                    <span className="journal-number mr-2 text-[#a84269]">{collocationIndex + 1}.</span>
                    <RubyText text={phrase} items={[item]} enabled={showRuby} />
                  </p>
                  {translation ? <p className="mt-1 text-sm leading-6 text-[#74646b]">{translation}</p> : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
      {!isGrammarEntry && examples.length ? (
        <section className="mt-5 border-t border-[#f0d4dd] pt-5">
          <h4 className="text-xs font-bold text-[#a84269]">{labels.vocabularyExamples}</h4>
          <ol className="mt-3 space-y-4">
            {examples.slice(0, 2).map((example, exampleIndex) => (
              <li key={`${example.ja}-${exampleIndex}`} className="border-l-2 border-[#f0c9d4] pl-3">
                {example.ja ? (
                  <p className="text-sm font-bold leading-7 text-[#3d3036]">
                    <span className="journal-number mr-2 text-[#a84269]">{exampleIndex + 1}.</span>
                    <RubyText text={example.ja} items={[item]} enabled={showRuby} />
                  </p>
                ) : null}
                {example.zh ? <p className="mt-1 text-sm leading-6 text-[#74646b]">{example.zh}</p> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {!isGrammarEntry && conjugations.length ? (
        <section className="mt-5 border-t border-[#f0d4dd] pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-xs font-bold text-[#a84269]">{labels.conjugationsLabel}</h4>
            <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
              {inflectionClass ? (
                <span className="rounded-full bg-[#fff0f5] px-2.5 py-1 font-bold text-[#8f365b]">
                  {labels.inflectionClassLabel}：{labels[`inflectionClass_${inflectionClass}`] ?? inflectionClass}
                </span>
              ) : null}
              {baseForm ? <span className="text-[#74646b]">{labels.baseFormLabel}：{baseForm}</span> : null}
            </div>
          </div>
          <dl className="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {conjugations.map((conjugation, conjugationIndex) => (
              <div key={`${conjugation.kind}-${conjugation.form}-${conjugationIndex}`} className="border-b border-[#f5e1e7] pb-2">
                <dt className="text-xs font-semibold text-[#8f365b]">{labels[`conjugation_${conjugation.kind}`] ?? conjugation.kind}</dt>
                <dd className="mt-1 text-sm font-bold text-[#3d3036]">
                  <RubyText text={conjugation.form} items={[item]} enabled={showRuby} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {isGrammarEntry && grammarForms.length ? (
        <section className="mt-5 border-t border-[#f0d4dd] pt-5">
          <h4 className="text-xs font-bold text-[#a84269]">{labels.grammarConnection ?? '接续格式'}</h4>
          <div className="mt-3 space-y-3">
            {grammarForms.map((form, formIndex) => (
              <div key={`${form.form ?? 'form'}-${formIndex}`} className="border-l-2 border-[#f0c9d4] pl-3">
                {form.form ? <p className="text-sm font-bold leading-7 text-[#3d3036]">{form.form}</p> : null}
                {form.connection_zh ? <p className="mt-1 text-sm leading-6 text-[#74646b]">{form.connection_zh}</p> : null}
                {form.example ? (
                  <p className="mt-1 text-sm leading-7 text-[#3d3036]">
                    <RubyText text={form.example} items={[item]} enabled={showRuby} />
                  </p>
                ) : null}
                {form.meaning_zh ? <p className="mt-1 text-sm leading-6 text-[#74646b]">{form.meaning_zh}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {isGrammarEntry && grammarFeatures.length ? (
        <section className="mt-5 border-t border-[#f0d4dd] pt-5">
          <h4 className="text-xs font-bold text-[#a84269]">{labels.grammarTips ?? '用法技巧'}</h4>
          <div className="mt-3 divide-y divide-[#f0d4dd] border-y border-[#f0d4dd]">
            {grammarFeatures.map((feature, featureIndex) => (
              <div key={`${feature.feature ?? 'feature'}-${featureIndex}`} className="py-3">
                {feature.feature ? <p className="text-sm font-bold leading-6 text-[#3d3036]">{feature.feature}</p> : null}
                {feature.detail_zh ? <p className="mt-1 text-sm leading-6 text-[#74646b]">{feature.detail_zh}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {isGrammarEntry && examples.length ? (
        <section className="mt-5 border-t border-[#f0d4dd] pt-5">
          <h4 className="text-xs font-bold text-[#a84269]">{labels.exampleAnalysis ?? '例句分析'}</h4>
          <div className="mt-3 space-y-4">
            {examples.map((example, exampleIndex) => (
              <div key={`${example.ja}-${exampleIndex}`} className="border-l-2 border-[#f0c9d4] pl-3">
                {example.ja ? (
                  <p className="text-sm font-bold leading-7 text-[#3d3036]">
                    <RubyText text={example.ja} items={[item]} enabled={showRuby} />
                  </p>
                ) : null}
                {example.zh ? <p className="mt-1 text-sm leading-6 text-[#74646b]">{example.zh}</p> : null}
                {example.spoken_ja || example.spoken_zh ? (
                  <div className="mt-3 rounded-lg border border-[#f0d4dd] bg-[#fffaf5] px-3 py-2">
                    <p className="text-xs font-bold text-[#8f365b]">{labels.spokenExample ?? '口语版'}</p>
                    {example.spoken_ja ? (
                      <p className="mt-1 text-sm font-bold leading-7 text-[#3d3036]">
                        <RubyText text={example.spoken_ja} items={[item]} enabled={showRuby} />
                      </p>
                    ) : null}
                    {example.spoken_zh ? <p className="mt-1 text-sm leading-6 text-[#74646b]">{example.spoken_zh}</p> : null}
                  </div>
                ) : null}
                {example.form_analysis_zh ? <p className="mt-2 text-sm leading-6 text-[#8f365b]">{example.form_analysis_zh}</p> : null}
                {example.analysis_zh ? <p className="mt-1 text-sm leading-6 text-[#74646b]">{example.analysis_zh}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {isGrammarEntry && (registerLabel || item.usage_register_zh || item.exam_register_zh || everydayAlternatives.length) ? (
        <section className="mt-5 border-t border-[#f0d4dd] pt-5">
          <h4 className="text-xs font-bold text-[#a84269]">{labels.grammarRegister ?? '语体与口语说法'}</h4>
          <div className="mt-3 space-y-3">
            {registerLabel ? (
              <div className="flex flex-wrap items-start gap-2">
                <span className="rounded-full bg-[#fff0f5] px-3 py-1 text-xs font-bold text-[#8f365b]">{registerLabel}</span>
                {item.usage_register_zh ? <p className="min-w-0 flex-1 text-sm leading-6 text-[#3d3036]">{item.usage_register_zh}</p> : null}
              </div>
            ) : item.usage_register_zh ? (
              <p className="text-sm leading-6 text-[#3d3036]">{item.usage_register_zh}</p>
            ) : null}
            {item.exam_register_zh ? (
              <p className="rounded-xl bg-[#fffaf5] px-3 py-2 text-sm leading-6 text-[#74646b]">
                <span className="font-bold text-[#8f365b]">{labels.examRegisterNote ?? '考试提示'}：</span>
                {item.exam_register_zh}
              </p>
            ) : null}
            {everydayAlternatives.length ? (
              <div>
                <p className="text-xs font-bold text-[#8f365b]">{labels.spokenAlternatives ?? '口语一般这样说'}</p>
                <div className="mt-2 space-y-2">
                  {everydayAlternatives.map((alternative, alternativeIndex) => (
                    <div key={`${alternative.ja ?? 'alt'}-${alternativeIndex}`} className="border-l-2 border-[#f0c9d4] pl-3">
                      {alternative.ja ? <p className="text-sm font-bold leading-6 text-[#3d3036]">{alternative.ja}</p> : null}
                      {alternative.zh ? <p className="mt-0.5 text-sm leading-6 text-[#74646b]">{alternative.zh}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
      {isGrammarEntry && comparisonNotes.length ? (
        <section className="mt-5 border-t border-[#f0d4dd] pt-5">
          <h4 className="text-xs font-bold text-[#a84269]">{labels.comparisonNotes ?? '近义辨析'}</h4>
          <div className="mt-3 divide-y divide-[#f0d4dd] border-y border-[#f0d4dd]">
            {comparisonNotes.map((comparison, comparisonIndex) => (
              <div key={`${comparison.target ?? 'comparison'}-${comparisonIndex}`} className="py-3">
                {comparison.target ? <p className="text-sm font-bold leading-6 text-[#3d3036]">{comparison.target}</p> : null}
                {comparison.difference_zh ? <p className="mt-1 text-sm leading-6 text-[#74646b]">{comparison.difference_zh}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {analysis ? (
        <section className="mt-5 border-t border-[#f0d4dd] pt-5">
          <h4 className="text-xs font-bold text-[#a84269]">{labels.analysis}</h4>
          <p className="mt-2 text-sm leading-7 text-[#74646b]">
            <RubyText text={analysis} items={[item]} enabled={showRuby} />
          </p>
        </section>
      ) : null}
      {item.content_origin === 'ai_generated' && item.verification_status !== 'verified' ? (
        <p className="mt-3 rounded-2xl border border-[#f0cf80] bg-[#fff8df] p-3 text-xs leading-5 text-[#775516]">
          {labels.unverifiedContentNotice}
        </p>
      ) : null}
    </article>
  );
}

function resolvedInflectionClass(item: VocabItem) {
  if (item.inflection_class) return item.inflection_class;
  if (/動詞|动词|verb/iu.test(`${item.type} ${item.part_of_speech ?? ''}`) && item.original.endsWith('する')) return 'suru' as const;
  return undefined;
}

function resolvedConjugations(item: VocabItem, inflectionClass: VocabItem['inflection_class'], baseForm?: string) {
  const stored = item.conjugations?.filter((conjugation) => conjugation.kind && conjugation.form) ?? [];
  if (stored.length || inflectionClass !== 'suru' || !baseForm?.endsWith('する')) return stored;
  const stem = baseForm.slice(0, -2);
  return [
    { kind: 'dictionary', form: baseForm },
    { kind: 'polite', form: `${stem}します` },
    { kind: 'negative', form: `${stem}しない` },
    { kind: 'past', form: `${stem}した` },
    { kind: 'te', form: `${stem}して` },
    { kind: 'conditional', form: `${stem}すれば` },
  ];
}

function RubyText({ text, items, enabled }: { text: string; items: VocabItem[]; enabled: boolean }) {
  if (!enabled) {
    return <>{text}</>;
  }

  const terms = rubyTermsForItems(items);
  if (!terms.length) {
    return <>{text}</>;
  }

  const parts: ReactNode[] = [];
  let index = 0;
  while (index < text.length) {
    const term = terms.find((candidate) => text.startsWith(candidate.surface, index));
    if (!term) {
      parts.push(text[index]);
      index += 1;
      continue;
    }
    parts.push(
      <ruby key={`${term.surface}-${index}`}>
        {term.surface}
        <rp>(</rp>
        <rt>{term.reading}</rt>
        <rp>)</rp>
      </ruby>,
    );
    index += term.surface.length;
  }
  return <>{parts}</>;
}

function rubyTermsForItems(items: VocabItem[]) {
  const fromItems = items.flatMap((item) => [
    ...(item.reading ? [{ text: item.original, reading: item.reading }] : []),
    ...(item.ruby_terms ?? []),
  ]);
  const seen = new Set<string>();
  return [...fromItems, ...defaultRubyTerms]
    .filter((term) => {
      const key = `${term.text}\u0000${term.reading}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((term) => ({ surface: term.text, reading: term.reading }))
    .sort((a, b) => b.surface.length - a.surface.length);
}
import { useAuthoringNavigation } from '../../components/AuthoringNavigation';
