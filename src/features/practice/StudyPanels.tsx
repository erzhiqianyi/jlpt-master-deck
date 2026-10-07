import { QuestionRenderer } from '../../components/QuestionRenderer';
import { QuestionPrompt } from '../../components/QuestionPrompt';
import { AnswerCelebration } from '../../components/StudyCompanion';
import { SpeechControls } from '../../components/SpeechControls';
import { LearningListMetadata } from '../../components/LearningListMetadata';
import { usePageHeaderActions } from '../../components/PageChrome';
import { useAuthoringNavigation } from '../../components/AuthoringNavigation';
import './practice-layout.css';
import { conciseEvidence, practiceReviewModel } from './practicePresentation';
import { itemPracticeCounts } from '../../domain/itemPracticeCounts.mjs';
import { PracticeTimer } from '../../components/PracticeTimer';
import { conjugationReading } from '../../domain/conjugationReading';
import { RecordReference, QuestionReference as QuestionReferenceBadge } from '../../components/RecordReference';
import { StudyText } from '../../components/StudyText';
import type { QuestionReference } from '../../domain/questions';
import { ShareButton } from '../../components/ShareButton';
import { ModuleActionBar } from '../../components/ModuleActionBar';
import { normalizePracticeExplanations } from '../../domain/practiceExplanations.mjs';
import { LearningList, LearningListRow, LearningListHeader, LearningListSearch, LearningListPagination, LearningListFrame } from '../../components/LearningList';
import { BatchActionBar, BatchManageButton, useListBatch, type BatchAction } from '../../components/ListBatch';
import { useMobileList } from '../../hooks/useMobileList';
import { CheckCircle2, CircleMinus, BookOpenText, Pencil, ChevronLeft, ChevronRight, ImagePlus, Lightbulb, LoaderCircle, Plus, RotateCcw, ScrollText, Settings, Target, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type TouchEvent as ReactTouchEvent } from 'react';
import { defaultRubyTerms } from '../../data/rubyTerms';
import { distinctReading, localized, itemExplanation, itemMeaning, itemMemoryPoints } from '../../domain/items';
import { ItemImage, prepareImageUpload } from '../../components/ItemImage';
import { memoryImagePrompt } from '../../domain/memoryImagePrompt';
import { filterableTags, itemInWordbook, itemTagList, itemWordbookId, wordbookFamily, wordbooksForFamily, type WordbookFamily } from '../../domain/wordbooks';
import type { AnswerState, Deck, DisplaySettings, FeedbackMode, LearningCaptureCategory, Locale, PracticeAttempt, ProgressState, Question, QuestionKind, VocabItem, Wordbook } from '../../types';


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
  | { kind: 'tag'; tag: string }
  | { kind: 'items'; itemIds: string[] };
function safeIndex(index: number, total: number) {
  return total ? ((index % total) + total) % total : 0;
}

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
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
  const value = Date.parse(item.input_at);
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
  if (kind === 'word_formation') return labels.wordFormation;
  if (kind === 'usage') return labels.usage;
  return kind;
}

export function PracticeReviewPanel({
  token, attempt, questions, answers, items, labels, practiceTitle, practiceReference,
  locale, showRuby, onRestart, onBackToPractice,
}: {
  token?: string;
  attempt?: PracticeAttempt;
  questions: Question[];
  answers: AnswerState;
  items: VocabItem[];
  labels: Record<string, string>;
  practiceTitle?: string;
  practiceReference?: string;
  locale: Locale;
  showRuby: boolean;
  onRestart?: () => void;
  onBackToPractice: () => void;
}) {
  const model = practiceReviewModel(questions, answers, attempt);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [navigationFilter, setNavigationFilter] = useState<'all' | 'wrong' | 'unanswered'>('all');
  const [filter, setFilter] = useState<'all' | 'wrong' | 'unanswered'>(() => model.wrong + model.unanswered ? 'wrong' : 'all');
  const reviewTouch = useRef<{ x: number; y: number } | null>(null);
  const questionRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const activeRow = reviewIndex === null ? undefined : model.rows[reviewIndex];
  const activeQuestion = activeRow?.question;
  const activeAnswer = activeRow?.answer;
  const reviewTitle = attempt?.title ?? practiceTitle ?? labels.reviewSummaryTitle;
  const copy = locale === 'zh-CN'
    ? { list: '题目列表', previous: '上一题', next: '下一题', restart: '重新练习', back: '返回练习', results: '练习结果', returnResults: '返回结果', all: '全部题目', wrong: '错题', unanswered: '未答', accuracy: '整组正确率', scoreNote: '按整组题目计分；只看错题也包含未作答的题目。', emptyWrong: '没有错题。可以查看全部题目。', emptyUnanswered: '所有题目都已作答。', allCorrect: '全部答对了！', evidence: '查看答案与解析', unansweredBody: '这道题尚未作答；以下是正确答案与解析。', missing: '部分原题当前不可用；历史成绩已保留，缺失题目不会计为未答。', historicalScore: '成绩按当时保存的记录展示。', currentVersion: '以下答案与解析来自当前题目版本，可能与作答时不同。', currentAnswer: '当前题目答案' }
    : locale === 'ja'
      ? { list: '問題一覧', previous: '前の問題', next: '次の問題', restart: 'もう一度練習', back: '練習に戻る', results: '練習結果', returnResults: '結果に戻る', all: 'すべて', wrong: '不正解', unanswered: '未解答', accuracy: '全問の正答率', scoreNote: '未解答を含む全問題数で計算しています。', emptyWrong: '不正解はありません。すべての問題を確認できます。', emptyUnanswered: 'すべて解答済みです。', allCorrect: '全問正解です！', evidence: '答えと解説を見る', unansweredBody: '未解答の問題です。正解と解説を確認できます。', missing: '元の問題の一部が利用できません。保存済みの成績は保持し、欠落した問題を未解答には数えません。', historicalScore: '当時保存された成績を表示しています。', currentVersion: '以下の正解と解説は現在の問題版です。解答時と異なる場合があります。', currentAnswer: '現在の問題の正解' }
      : { list: 'Questions', previous: 'Previous', next: 'Next', restart: 'Restart practice', back: 'Back to practice', results: 'Practice results', returnResults: 'Back to results', all: 'All questions', wrong: 'Incorrect', unanswered: 'Unanswered', accuracy: 'Whole-set accuracy', scoreNote: 'Accuracy includes every question, including unanswered ones.', emptyWrong: 'No incorrect answers. You can review all questions.', emptyUnanswered: 'Every question has been answered.', allCorrect: 'Every answer is correct!', evidence: 'View answer and explanation', unansweredBody: 'This question was not answered. Review the correct answer and explanation below.', missing: 'Some original questions are unavailable. Saved results are preserved; missing questions are not counted as unanswered.', historicalScore: 'Showing the result saved at the time of this attempt.', currentVersion: 'Answers and explanations below use the current question version and may differ from the original.', currentAnswer: 'Current question answer' };
  const rows = model.rows.filter((row) => filter === 'all' || (filter === 'wrong' ? row.status !== 'correct' : row.status === filter));

  const reviewPosition = rows.findIndex(row => row.index === reviewIndex);
  function moveReview(delta: number) {
    const next = rows[reviewPosition + delta];
    if (next) openQuestion(next.index);
  }
  function startReview(value: typeof filter) {
    setFilter(value);
    const first = model.rows.find(row => value === 'all' || (value === 'wrong' ? row.status !== 'correct' : row.status === value));
    if (first) openQuestion(first.index);
    else setReviewIndex(null);
  }
  function openQuestion(index: number) {
    setReviewIndex(index);
    window.requestAnimationFrame(() => {
      questionRef.current?.focus();
      questionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  function showResults() {
    setReviewIndex(null);
    window.requestAnimationFrame(() => listRef.current?.focus());
  }

  useAuthoringNavigation(activeQuestion ? (locale === 'zh-CN' ? '答案解析' : locale === 'ja' ? '解答と解説' : 'Answer explanation') : null, showResults, { kind: 'detail' });

  return (
    <section className={`practice-review-results${activeQuestion ? ' is-answer-detail' : ''}`}>
      <div className="practice-results-layout"><div className="practice-results-main">
      {!activeQuestion ? <header className="practice-results-heading">
        <button type="button" className="practice-text-action" onClick={onBackToPractice}><ChevronLeft size={18} aria-hidden="true" />{copy.back}</button>
        <div><p>{copy.results}</p><h1>{reviewTitle}</h1></div>
        {onRestart ? <button type="button" className="practice-text-action" onClick={onRestart}><RotateCcw size={17} aria-hidden="true" />{copy.restart}</button> : null}
      </header> : null}
      {!activeQuestion && model.total > 0 ? <div className="practice-completion-hero">
        <img src="/study-companion.png" width="112" height="112" alt="" />
        <span><CheckCircle2 size={18} aria-hidden="true" />{locale === 'zh-CN' ? '本轮练习完成' : locale === 'ja' ? '今回の練習が完了しました' : 'Practice complete'}</span>
        <h2>{model.correct === model.total ? (locale === 'zh-CN' ? '全对，做得漂亮！' : locale === 'ja' ? '全問正解、お見事！' : 'Every answer correct. Well done!') : (locale === 'zh-CN' ? '每一次练习，都在向前一步' : locale === 'ja' ? '一問ずつ、着実に前へ' : 'Every practice is a step forward')}</h2>
        <p>{model.correct === model.total ? (locale === 'zh-CN' ? '这一轮的努力收获满满。回顾一下，让知识记得更牢。' : locale === 'ja' ? '努力が実りました。復習して、知識を定着させましょう。' : 'Your effort paid off. A quick review will help it stick.') : (locale === 'zh-CN' ? '错题帮你找到下一步的方向。一起把还不熟悉的地方练扎实。' : locale === 'ja' ? '間違いは次の一歩のヒント。復習して少しずつ身につけましょう。' : 'Mistakes show what to work on next. Take it one question at a time.')}</p>
      </div> : null}
      {!activeQuestion ? <section className="practice-result-summary" ref={listRef} tabIndex={-1} aria-label={copy.results}>
        <div className="practice-result-score"><strong>{Math.round(model.accuracy * 100)}<small>%</small></strong><span>{copy.accuracy}</span></div>
        <dl><div><dt><CheckCircle2 size={16} aria-hidden="true" />{labels.correct}</dt><dd>{model.correct} / {model.total}</dd></div><div><dt><RotateCcw size={16} aria-hidden="true" />{copy.wrong}</dt><dd>{model.wrong}</dd></div><div><dt><CircleMinus size={16} aria-hidden="true" />{copy.unanswered}</dt><dd>{model.unanswered}</dd></div><div><dt>{labels.elapsed}</dt><dd>{formatDuration(model.elapsedMs)}</dd></div></dl>
        <p>{attempt ? copy.historicalScore : model.total > 0 && model.correct === model.total ? copy.allCorrect : copy.scoreNote}</p>
        {model.missingOriginals > 0 ? <p role="status">{copy.missing} ({model.missingOriginals})</p> : null}
      </section> : null}
      {!activeQuestion && model.rows.length > 0 ? <div className="practice-completion-actions">
        <button type="button" disabled={!(model.wrong + model.unanswered)} onClick={() => startReview('wrong')}><RotateCcw size={18} aria-hidden="true" />{locale === 'zh-CN' ? '只看错题' : copy.wrong} ({model.wrong + model.unanswered})</button>
        <button type="button" onClick={() => startReview('all')}><BookOpenText size={18} aria-hidden="true" />{locale === 'zh-CN' ? '查看全部解析' : copy.all} ({model.rows.length})</button>
      </div> : null}
      <div className={`practice-review-workspace${activeQuestion ? ' has-question' : ''}`}>
        {activeQuestion && activeRow ? <article key={activeQuestion.id} ref={questionRef} tabIndex={-1} className="practice-review-detail"
          onTouchStart={event => {
            reviewTouch.current = event.touches.length === 1 && !(event.target as HTMLElement).closest('button, a, input, select, audio, summary')
              ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
          }}
          onTouchCancel={() => { reviewTouch.current = null; }}
          onTouchEnd={event => {
            const start = reviewTouch.current; reviewTouch.current = null;
            if (!start || event.changedTouches.length !== 1) return;
            const dx = event.changedTouches[0].clientX - start.x;
            const dy = event.changedTouches[0].clientY - start.y;
            if (Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.5) moveReview(dx < 0 ? 1 : -1);
          }}
          onKeyDown={event => {
            if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveReview(event.key === 'ArrowRight' ? 1 : -1); }
          }} aria-label={`${copy.list} ${activeRow.index + 1}`}>
          <div className="practice-review-detail-nav"><button type="button" className="practice-text-action" onClick={showResults}><ChevronLeft size={18} aria-hidden="true" />{copy.returnResults}</button><span>{reviewPosition + 1} / {rows.length} · {copy.list} {activeRow.index + 1}</span></div>
          <div className="practice-result-filters" role="group" aria-label={copy.list}>{([['wrong', copy.wrong, model.wrong + model.unanswered], ['all', copy.all, model.rows.length], ['unanswered', copy.unanswered, model.unanswered]] as const).map(([value, title, count]) => <button type="button" key={value} aria-pressed={filter === value} disabled={!count} onClick={() => startReview(value)}>{title} <span>{count}</span></button>)}</div>
          {attempt ? <p className="practice-historical-version" role="note">{copy.currentVersion}</p> : null}
          <QuestionRenderer questionId={activeQuestion.id} questionTypeId={activeQuestion.questionTypeId??activeQuestion.kind}
            materials={activeQuestion.passage?<p className="whitespace-pre-wrap">{activeQuestion.passage}</p>:undefined} taskConditions={activeQuestion.taskConditions}
            instruction={activeQuestion.instruction} promptClassName="practice-review-prompt"
            prompt={<QuestionPrompt text={activeQuestion.prompt} target={activeQuestion.promptTarget} locale={locale} />}
            choices={activeQuestion.choices} selected={activeQuestion.choices.indexOf(activeAnswer?.selected??'')}
            answerIndex={activeQuestion.choices.indexOf(activeQuestion.answer)} reveal disabled onSelect={()=>{}}
            optionClassName="practice-review-option"
            renderText={choice=><>{choice}{choice===activeQuestion.answer?<small className="ml-3">{attempt?copy.currentAnswer:labels.rightAnswer}</small>:choice===activeAnswer?.selected?<small className="ml-3">{labels.yourAnswer}</small>:null}</>} />
          {!activeAnswer ? <p className="practice-unanswered-explanation">{copy.unansweredBody}</p> : null}
          <AnswerPanel question={activeQuestion} answer={activeAnswer} historical={Boolean(attempt)} items={items} showRuby={showRuby} labels={labels} locale={locale} />
          <div className="practice-question-reference">{!practiceReference ? <RecordReference reference={activeQuestion.practiceReference} locale={locale} /> : null}<QuestionReferenceBadge question={activeQuestion} token={token} locale={locale} /></div>
          {rows.length > 1 ? <nav className="practice-review-footer" aria-label={copy.list}><button type="button" disabled={reviewPosition <= 0} onClick={() => moveReview(-1)}><ChevronLeft size={18} aria-hidden="true" />{copy.previous}</button><button type="button" disabled={reviewPosition >= rows.length - 1} onClick={() => moveReview(1)}>{copy.next}<ChevronRight size={18} aria-hidden="true" /></button></nav> : null}
        </article> : null}
      </div>
      </div>
      {model.rows.length > 0 ? <aside className="practice-question-navigation" aria-label={copy.list}>
        <div className="practice-question-navigation-heading"><h2>{copy.list}</h2><span>{model.rows.length}</span></div>
        <p className="practice-question-navigation-hint">{locale === 'zh-CN' ? '点击题目，直接查看答案与解析' : locale === 'ja' ? '問題を選んで、答えと解説を確認' : 'Select a question to view its answer and explanation'}</p>
        <div className="practice-result-filters" role="group" aria-label={copy.list}>{([['all', copy.all, model.rows.length], ['wrong', copy.wrong, model.wrong + model.unanswered], ['unanswered', copy.unanswered, model.unanswered]] as const).map(([value, title, count]) => <button type="button" key={value} aria-pressed={navigationFilter === value} disabled={!count} onClick={() => setNavigationFilter(value)}>{title} <span>{count}</span></button>)}</div>
        <ol className="practice-result-rows">{model.rows.filter(row => navigationFilter === 'all' || (navigationFilter === 'wrong' ? row.status !== 'correct' : row.status === 'unanswered')).map(row => {
          const status = row.status === 'correct' ? labels.correct || (locale === 'zh-CN' ? '正确' : locale === 'ja' ? '正解' : 'Correct') : row.status === 'wrong' ? copy.wrong : copy.unanswered;
          return <li key={row.question.id}><button type="button" aria-current={reviewIndex === row.index ? 'true' : undefined} onClick={() => { setFilter(navigationFilter); openQuestion(row.index); }}>
            <span className={`practice-result-number is-${row.status}`}>{row.index + 1}</span>
            <span><strong>{row.question.prompt.replace(/\s+/g, ' ').trim()}</strong><small>{status}</small></span>
            <ChevronRight size={18} aria-hidden="true" />
          </button></li>;
        })}</ol>
        {model.missingOriginals > 0 ? <p className="practice-question-navigation-hint">{copy.missing} ({model.missingOriginals})</p> : null}
      </aside> : null}
      </div>
    </section>
  );
}

export function PracticePanel({
  token,
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
  practiceReference,
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
  token?: string;
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
  practiceReference?: string;
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
  const [celebratedQuestion, setCelebratedQuestion] = useState<string | null>(null);
  const [timerSession, setTimerSession] = useState(0);
  const [pendingAdvance, setPendingAdvance] = useState<{ questionId: string; choice: string; index: number } | null>(null);
  const copy = settings.locale === 'ja'
    ? { more: 'その他', restart: '解答と経過時間をリセットして、もう一度練習しますか？', batch: 'まとめて答え合わせ', immediate: '1問ずつ答え合わせ' }
    : settings.locale === 'en'
      ? { more: 'More', restart: 'Clear your answers and timer to restart this practice?', batch: 'Review at the end', immediate: 'Feedback after each answer' }
      : { more: '更多', restart: '重新练习将清空本组作答并重置计时，确定继续吗？', batch: '整组反馈 · 交卷后查看答案与解析', immediate: '逐题反馈 · 作答后查看解析' };
  const [answerSheetOpen, setAnswerSheetOpen] = useState(false);
  const [answerSheetPage, setAnswerSheetPage] = useState(0);
  const [answerSheetFilter, setAnswerSheetFilter] = useState<'all' | 'current' | 'correct' | 'wrong' | 'unanswered'>('all');
  const [reviewError, setReviewError] = useState('');
  const answerSheetRef = useRef<HTMLDialogElement>(null);
  const [reviewPreparing, setReviewPreparing] = useState(false);
  const reviewPreparingRef = useRef(false);
  const reviewMountedRef = useRef(true);
  const reviewGenerationRef = useRef(0);
  const reviewSessionKey = JSON.stringify([practiceReference, questionTypeLabel, questions.map((question) => question.id)]);
  const reviewSessionKeyRef = useRef(reviewSessionKey);
  if (reviewSessionKeyRef.current !== reviewSessionKey) {
    reviewSessionKeyRef.current = reviewSessionKey;
    reviewGenerationRef.current += 1;
    reviewPreparingRef.current = false;
  }
  useEffect(() => {
    reviewMountedRef.current = true;
    return () => { reviewMountedRef.current = false; reviewGenerationRef.current += 1; };
  }, []);
  useEffect(() => { setReviewPreparing(false); setReviewError(''); }, [reviewSessionKey]);
  const practiceCardRef = useRef<HTMLElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  function invalidatePendingReview() {
    reviewGenerationRef.current += 1;
    reviewPreparingRef.current = false;
    setReviewPreparing(false);
    setReviewError('');
  }

  function leavePractice() {
    invalidatePendingReview();
    onPracticeHome();
  }

  function restartTimedPractice() {
    if (!window.confirm(copy.restart)) return;
    invalidatePendingReview();
    setTimerSession((session) => session + 1);
    onRestart();
  }

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
    if (reviewPreparingRef.current) return;
    reviewPreparingRef.current = true;
    const generation = reviewGenerationRef.current;
    const isCurrent = () => reviewMountedRef.current && reviewGenerationRef.current === generation;
    setReviewError('');
    if (analysisStatus === 'completed') { onReview(); reviewPreparingRef.current = false; return; }
    setReviewPreparing(true);
    try {
      await onPrepareReview();
      if (isCurrent()) onReview();
    } catch (error) {
      if (isCurrent()) setReviewError(error instanceof Error ? error.message : labels.reviewRetryNotice);
    } finally {
      if (isCurrent()) {
        reviewPreparingRef.current = false;
        setReviewPreparing(false);
      }
    }
  }

  const chooseAnswer = useCallback((question: Question, choice: string) => {
    if (feedbackMode === 'immediate' && answers[question.id]) return;
    onAnswer(question, choice);
    setPendingAdvance(feedbackMode === 'batch' && settings.practiceNavigation !== 'manual' ? { questionId: question.id, choice, index: activeIndex } : null);
    if (feedbackMode === 'immediate' && choice === question.answer) {
      setCelebratedQuestion(question.id);
    }
  }, [feedbackMode, answers, onAnswer, activeIndex, settings.practiceNavigation]);

  useEffect(() => {
    if (!pendingAdvance) return;
    if (activeQuestion?.id !== pendingAdvance.questionId || activeIndex !== pendingAdvance.index || answerSheetOpen || complete || feedbackMode !== 'batch' || settings.practiceNavigation === 'manual') {
      setPendingAdvance(null); return;
    }
    if (answers[pendingAdvance.questionId]?.selected !== pendingAdvance.choice) return;
    const timer = window.setTimeout(() => {
      const next = questions.findIndex((question, index) => index > activeIndex && !answers[question.id]);
      const target = next >= 0 ? next : questions.findIndex(question => !answers[question.id]);
      setPendingAdvance(null);
      if (target >= 0) {
        onJump(target);
        practiceCardRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    }, Math.max(0, Math.min(10, settings.practiceAutoAdvanceSeconds ?? 0.5)) * 1000);
    const cancel = () => { if (document.hidden) setPendingAdvance(null); };
    document.addEventListener('visibilitychange', cancel);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', cancel); };
  }, [pendingAdvance, activeQuestion?.id, activeIndex, answers, answerSheetOpen, complete, feedbackMode, questions, onJump, settings.practiceNavigation, settings.practiceAutoAdvanceSeconds]);

  const displayPracticeTitle = questionTypeLabel;
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
    if (!activeQuestion || answerSheetOpen || reviewPreparing) return;
    const currentQuestion = activeQuestion;

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.repeat || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isTextEntryTarget(event.target)) return;

      if (event.key === 'ArrowLeft' && activeIndex > 0) {
        event.preventDefault();
        onPrev();
        return;
      }

      if (event.key === 'ArrowRight' && activeIndex < questionsLength - 1) {
        event.preventDefault();
        onNext();
        return;
      }

      if (/^[1-4]$/.test(event.key)) {
        const choice = currentQuestion.choices[Number(event.key) - 1];
        const alreadyAnswered = Boolean(answers[currentQuestion.id]);
        if (!choice || (feedbackMode === 'immediate' && alreadyAnswered)) return;
        event.preventDefault();
        chooseAnswer(currentQuestion, choice);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeQuestion, answers, answerSheetOpen, reviewPreparing, feedbackMode, chooseAnswer, onNext, onPrev, questionsLength, activeIndex]);

  useEffect(() => {
    const dialog = answerSheetRef.current;
    if (answerSheetOpen && !dialog?.open) dialog?.showModal();
    if (!answerSheetOpen && dialog?.open) dialog.close();
  }, [answerSheetOpen]);

  return (
    <section
      ref={practiceCardRef}
      className="study-practice-session practice-session"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { touchStartRef.current = null; }}
    >
      {loading ? <p role="status" className="py-6 text-center">正在加载题目…</p> : null}
      <h2 className="practice-session-title">{displayPracticeTitle}</h2>
      <div className="practice-workspace-grid">
      <aside className="practice-control-panel" aria-label={labels.practiceAnswerSheet}>
        <div className="practice-question-toolbar">
          <details className="practice-more-actions">
            <summary>{copy.more}</summary>
            <div>
              <button type="button" aria-label={labels.restartPractice} onClick={restartTimedPractice}><RotateCcw size={16} aria-hidden="true" />{labels.restartPractice}</button>
              <button type="button" onClick={leavePractice}>{labels.reviewBackToPracticeHome}</button>
            </div>
          </details>
          <button type="button" disabled={questionsLength === 0} aria-haspopup="dialog" aria-expanded={answerSheetOpen}
            onClick={() => { setAnswerSheetFilter('all'); setAnswerSheetPage(Math.floor(activeIndex / 100)); setAnswerSheetOpen(true); }}
            aria-label={`${labels.practiceAnswerSheet}: ${questionsLength ? `${activeIndex + 1} / ${questionsLength}` : '0 / 0'}`} className="practice-text-action">
            {labels.practiceAnswerSheet}
          </button>
        </div>
        <div className="practice-timing-strip">
          {questionsLength > 0 ? <PracticeTimer key={`${questions.map((question) => question.id).join(',')}:${timerSession}`} locale={settings.locale} running={!complete && !loading} /> : <span />}
          <span>{labels.completed} {answeredCount} / {questionsLength}</span>
        </div>
        <progress className="practice-question-progress" max={Math.max(1, questionsLength)} value={answeredCount} aria-label={`${labels.completed}: ${answeredCount} / ${questionsLength}`} />

        <nav className="practice-top-navigation" aria-label={labels.practiceAnswerSheet}>
          <button type="button" disabled={!activeQuestion || activeIndex === 0} onClick={onPrev}><ChevronLeft size={18} aria-hidden="true" />{labels.prev}</button>
          <strong aria-live="polite">{questionsLength ? activeIndex + 1 : 0} / {questionsLength}</strong>
          <button type="button" disabled={!activeQuestion || activeIndex >= questionsLength - 1} onClick={onNext}>{labels.next}<ChevronRight size={18} aria-hidden="true" /></button>
        </nav>
        <p className="practice-feedback-hint" role="status">{feedbackMode === 'batch' ? copy.batch : copy.immediate}</p>
        <nav className="practice-nearby-questions" aria-label={labels.practiceAnswerSheet}>
          {questions.slice(Math.max(0, Math.min(activeIndex - 4, questions.length - 10)), Math.max(0, Math.min(activeIndex - 4, questions.length - 10)) + 10).map((question, offset) => {
            const index = Math.max(0, Math.min(activeIndex - 4, questions.length - 10)) + offset;
            return <button type="button" key={question.id} aria-current={index === activeIndex ? 'step' : undefined}
              aria-label={`${index + 1} · ${answers[question.id] ? labels.practiceAnswered : labels.practiceUnanswered}`}
              data-answered={Boolean(answers[question.id])} onClick={() => onJump(index)}>{index + 1}</button>;
          })}
        </nav>
      {activeQuestion && complete ? <footer className="practice-session-actions">
        {reviewError ? <div className="practice-save-error" role="alert"><p>{reviewError}</p><button type="button" onClick={onReview}>{labels.reviewViewHistory}</button></div> : null}
        <button type="button" className="practice-primary-action" onClick={requestReview} disabled={reviewPreparing}>{reviewPreparing ? <><LoaderCircle size={18} className="animate-spin" aria-hidden="true" />{labels.reviewPreparing}</> : reviewError ? labels.reviewRetry : labels.reviewPage}<ChevronRight size={19} aria-hidden="true" /></button>
      </footer> : null}
      </aside>
      <div className="practice-content-column">
      <div className="practice-question-section">
        {activeQuestion ? <QuestionRenderer questionId={activeQuestion.id} questionTypeId={activeQuestion.questionTypeId??activeQuestion.kind}
          materials={activeQuestion.passage?<p className="whitespace-pre-wrap">{activeQuestion.passage}</p>:undefined} taskConditions={activeQuestion.taskConditions}
          instruction={activeQuestion.instruction}
          prompt={<QuestionPrompt text={activeQuestion.prompt} target={activeQuestion.promptTarget} locale={settings.locale} />}
          choices={activeQuestion.choices} selected={activeQuestion.choices.indexOf(answers[activeQuestion.id]?.selected??'')}
          answerIndex={activeQuestion.choices.indexOf(activeQuestion.answer)}
          reveal={Boolean(answers[activeQuestion.id]) && (feedbackMode==='immediate'||(feedbackMode==='batch'&&complete&&analysisStatus==='completed'))}
          disabled={feedbackMode==='immediate'&&Boolean(answers[activeQuestion.id])}
          onSelect={index=>chooseAnswer(activeQuestion,activeQuestion.choices[index])} optionClassName="cute-choice" /> :
          <p className="mt-3 text-lg leading-8">{loading?null:labels.noQuestionBody}</p>}
        {activeQuestion ? <div className="practice-question-reference">
          {!practiceReference ? <RecordReference reference={activeQuestion.practiceReference} locale={settings.locale} /> : null}
          <QuestionReferenceBadge question={activeQuestion} token={token} locale={settings.locale} />
        </div> : null}
      </div>

      <AnswerCelebration correct={Boolean(activeQuestion && celebratedQuestion === activeQuestion.id && answers[activeQuestion.id]?.correct && feedbackMode === 'immediate')} />
      {activeQuestion && answers[activeQuestion.id] && (feedbackMode === 'immediate' || (feedbackMode === 'batch' && complete && analysisStatus === 'completed')) ? (
            <AnswerPanel
              key={activeQuestion.id}
              question={activeQuestion}
              answer={answers[activeQuestion.id]}
              items={items}
              showRuby={settings.showExplanationRuby}
              labels={labels}
              locale={settings.locale}
            />
      ) : null}
      </div></div>
      {!activeQuestion && !loading ? <button type="button" className="practice-text-action" onClick={leavePractice}>{labels.reviewBackToPracticeHome}</button> : null}
      <dialog ref={answerSheetRef} className="practice-native-answer-sheet" aria-labelledby="practice-answer-sheet-title" onClose={() => setAnswerSheetOpen(false)} onCancel={() => setAnswerSheetOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setAnswerSheetOpen(false); }}>
          <div className="practice-native-answer-sheet-content">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 id="practice-answer-sheet-title" className="text-lg font-black text-[#3d3036]">{labels.practiceAnswerSheet}</h3>
                <p className="mt-1 text-xs font-semibold text-[#74646b]">{labels.completed} {answeredCount} / {questionsLength}</p>
              </div>
              <button type="button" autoFocus onClick={() => setAnswerSheetOpen(false)} aria-label={labels.close} title={labels.close} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#f0c9d4] bg-white text-[#a84269] hover:bg-[#fff0f5]">
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
      </dialog>

    </section>
  );
}

function AnswerPanel({ question, answer, historical = false, items, showRuby, labels, locale }: {
  question: Question;
  answer?: { selected: string; correct: boolean };
  historical?: boolean;
  items: VocabItem[];
  showRuby: boolean;
  labels: Record<string, string>;
  locale: Locale;
}) {
  const explanationDetails = normalizePracticeExplanations(question);
  const sourceItem = items.find((item) => item.id === question.itemId);
  const needsHumanReview = sourceItem?.content_origin === 'ai_generated' && sourceItem.verification_status !== 'verified';
  const isCorrect = historical ? Boolean(answer?.correct) : answer?.selected === question.answer;
  const currentAnswerLabel = locale === 'zh-CN' ? '当前题目答案' : locale === 'ja' ? '現在の問題の正解' : 'Current question answer';
  const evidence = conciseEvidence(explanationDetails.correctReason);
  const memory = conciseEvidence(question.memoryPoint, 120);
  const fullReason = locale === 'zh-CN' ? '完整解题依据' : locale === 'ja' ? '詳しい解説' : 'Full explanation';
  const memoryDetails = locale === 'zh-CN' ? '展开记忆点' : locale === 'ja' ? 'ポイントを詳しく見る' : 'More memory notes';
  const answerNumber = question.choices.indexOf(question.answer) + 1;

  return <section className={`practice-feedback ${!answer ? 'is-unanswered' : isCorrect ? 'is-correct' : 'is-wrong'}`} aria-label={labels.reviewPage}>
    <div className="practice-feedback-outcome" role="status" aria-live="polite">
      <p className="practice-feedback-status"><span aria-hidden="true">{!answer ? '–' : isCorrect ? '✓' : '×'}</span><strong>{!answer ? labels.practiceUnanswered : isCorrect ? labels.correct : labels.wrong}</strong></p>
      {answer ? <p className="practice-feedback-selected">{labels.yourAnswer}: {answer.selected}</p> : null}
      <div className="practice-feedback-answer"><span>{historical ? currentAnswerLabel : labels.rightAnswer}</span><strong>{answerNumber > 0 ? `${answerNumber}. ` : ''}{question.answer}</strong></div>
    </div>
    {evidence.summary ? <div className="practice-feedback-evidence"><h3>{labels.correctReasonLabel}</h3><StudyText text={evidence.summary} renderText={(text) => <RubyText text={text} items={items} enabled={showRuby} />} /></div> : null}
    {memory.summary ? <aside className="practice-feedback-memory"><h3>{labels.memoryPointLabel}</h3><StudyText text={memory.summary} renderText={(text) => <RubyText text={text} items={items} enabled={showRuby} />} /></aside> : null}
    <div className="practice-feedback-disclosures">
      {evidence.hasMore ? <details><summary>{fullReason}</summary><StudyText text={explanationDetails.correctReason} renderText={(text) => <RubyText text={text} items={items} enabled={showRuby} />} /></details> : null}
      <details><summary>{labels.choiceAnalysisLabel}<span>{explanationDetails.choiceAnalysis.length}</span></summary><div className="practice-feedback-choices">
        {explanationDetails.choiceAnalysis.map((choice) => {
          const linkedItem = choice.correct ? sourceItem : itemForChoice(choice.choice, question.kind, items);
          const selected = choice.choice === answer?.selected;
          return <div key={choice.choice} className={`practice-feedback-choice ${choice.correct ? 'is-correct' : selected ? 'is-selected' : ''}`}>
            <div>{linkedItem ? <EntryLink item={linkedItem} label={choice.choice} compact /> : <strong>{choice.choice}</strong>}<span>{choice.correct ? labels.choiceFits : selected ? labels.yourAnswer : labels.choiceDoesNotFit}</span></div>
            <StudyText text={choice.explanation} renderText={(text) => <RubyText text={text} items={items} enabled={showRuby} />} />
          </div>;
        })}
      </div></details>
      {memory.hasMore ? <details><summary>{memoryDetails}</summary><StudyText text={question.memoryPoint} renderText={(text) => <RubyText text={text} items={items} enabled={showRuby} />} /></details> : null}
      {question.translationZh ? <details><summary>{labels.fullChineseTranslation ?? '完整中文翻译'}</summary><p lang="zh-CN">{question.translationZh}</p></details> : null}
      {sourceItem ? <details><summary>{labels.viewEntry}: {sourceItem.original}</summary><EntryLink item={sourceItem} label={`${labels.viewEntry}: ${sourceItem.original}`} /></details> : null}
    </div>
    {needsHumanReview ? <p className="practice-verification-notice">{labels.unverifiedContentNotice}</p> : null}
  </section>;
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

export function WordIndexPanel({ items, questions, answers, progress, attempts = [], labels: baseLabels, locale, deckLabels, wordbooks, selectedWordbookId = 'all', captureCategory, defaultTargetDeck = 'n1_vocab', pendingCaptureCount = 0, onOpen, onPractice, onTips, onReview, onManageWordbooks, onOpenQuestionBank, onOpenPendingCaptures, onSaveCapture, onCreateWordbook, onWordbookChange, onOrganize }: {
  items: VocabItem[];
  questions: QuestionReference[];
  answers: AnswerState;
  progress: ProgressState;
  attempts?: PracticeAttempt[];
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
  onOpenQuestionBank?: () => void;
  onOpenPendingCaptures?: () => void;
  onSaveCapture?: (input: { body: string; category: LearningCaptureCategory; context?: string; targetDeck?: Deck; targetWordbookId?: string }) => Promise<void>;
  onCreateWordbook?: (title: string, deck?: Deck) => Promise<Wordbook | null>;
  onWordbookChange?: (wordbookId: string) => void;
  onOrganize?: (id: string, input: { wordbookId?: string; tags?: string[] }) => Promise<unknown>;
}) {
  const hasPageChrome = usePageHeaderActions([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [batchWordbookId, setBatchWordbookId] = useState('');
  const [batchTag, setBatchTag] = useState('');
  const [sortKey, setSortKey] = useState<WordIndexSortKey>('created-asc');
  const recentPracticeCounts = useMemo(() => itemPracticeCounts(attempts), [attempts]);
  const [showCaptureForm, setShowCaptureForm] = useState(false);
  useAuthoringNavigation(showCaptureForm ? (captureCategory === 'grammar' ? '记一个句型' : '记一个单词') : null, () => { setShowCaptureForm(false); });
  const [showFocusedPractice, setShowFocusedPractice] = useState(false);
  const showEntryLibrary = !showCaptureForm && !showFocusedPractice;
  useAuthoringNavigation(showFocusedPractice ? (locale === 'zh-CN' ? '按内容练习' : locale === 'ja' ? '内容別に練習' : 'Practice by content') : null, () => setShowFocusedPractice(false), { kind: 'detail' });
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
  const questionsByItem = useMemo(() => questions.reduce<Record<string, QuestionReference[]>>((groups, question) => {
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
    return baseItems.filter((item) => `${item.reference ?? ''} ${item.original} ${item.reading ?? ''} ${itemMeaning(item, locale)}`.toLocaleLowerCase().includes(listSearch.trim().toLocaleLowerCase())).sort((left, right) => {
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
  const appliedListSummary = [
    selectedWordbookId !== 'all' ? selectedWordbook?.title : '',
    selectedTag && selectedTag !== allTagValue ? `#${selectedTag}` : '',
    sortKey !== 'created-asc' ? sortLabel(sortKey, labels) : '',
    listSearch.trim(),
  ].filter(Boolean).join(' · ');
  function resetListControls() {
    onWordbookChange?.('all');
    setSelectedTag(allTagValue);
    setSortKey('created-asc');
    setListSearch('');
    setPageIndex(0);
  }
  const pageCount = Math.max(1, Math.ceil(sortedItems.length / WORD_INDEX_PAGE_SIZE));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const pageStart = currentPage * WORD_INDEX_PAGE_SIZE;
  const pageItems = sortedItems.slice(pageStart, pageStart + WORD_INDEX_PAGE_SIZE);
  const mobileList = useMobileList(sortedItems.length, JSON.stringify([captureCategory, selectedWordbookId, sortKey, selectedTag, listSearch]), WORD_INDEX_PAGE_SIZE);
  const mobileVisibleCount = mobileList.visible;
  const mobileItems = sortedItems.slice(0, mobileVisibleCount);
  const pageEnd = pageStart + pageItems.length;
  const mobilePageEnd = Math.min(mobileVisibleCount, sortedItems.length);
  const batch = useListBatch(useMemo(() => sortedItems.map((item) => item.id), [sortedItems]));
  const batchT = (zh: string, ja: string, en: string) => locale === 'ja' ? ja : locale === 'en' ? en : zh;
  const batchTargetWordbook = libraryWordbooks.find((wordbook) => wordbook.id === batchWordbookId) ?? libraryWordbooks[0];
  const batchActions: BatchAction[] = [
    ...(onPractice ? [{
      key: 'practice', icon: <Target size={16} aria-hidden="true" />, label: batchT('练习所选', '選択を練習', 'Practice selected'),
      runAll: async (ids: string[]) => { batch.exit(); onPractice({ kind: 'items', itemIds: ids }); },
    }] : []),
    ...(onOrganize && batchTargetWordbook ? [{
      key: 'move', label: batchT(`移到${collectionLabel}`, `${collectionLabel}へ移動`, `Move to ${collectionLabel.toLocaleLowerCase()}`),
      control: <select aria-label={batchT(`目标${collectionLabel}`, `移動先の${collectionLabel}`, `Target ${collectionLabel.toLocaleLowerCase()}`)} value={batchTargetWordbook.id} onChange={(event) => setBatchWordbookId(event.target.value)}>
        {libraryWordbooks.map((wordbook) => <option key={wordbook.id} value={wordbook.id}>{wordbook.title}</option>)}
      </select>,
      appliesTo: (id: string) => { const item = items.find((entry) => entry.id === id); return Boolean(item) && itemWordbookId(item!) !== batchTargetWordbook.id; },
      run: (id: string) => onOrganize(id, { wordbookId: batchTargetWordbook.id }),
    }] : []),
    ...(onOrganize ? [{
      key: 'tag', label: batchT('添加标签', 'タグを追加', 'Add tag'), disabled: !batchTag.trim(),
      control: <input aria-label={batchT('标签名', 'タグ名', 'Tag name')} placeholder={batchT('标签名', 'タグ名', 'Tag')} value={batchTag} maxLength={40} onChange={(event) => setBatchTag(event.target.value)} />,
      appliesTo: (id: string) => !(items.find((item) => item.id === id)?.tags ?? []).includes(batchTag.trim()),
      run: (id: string) => onOrganize(id, { tags: [...(items.find((item) => item.id === id)?.tags ?? []), batchTag.trim()] }),
    }] : []),
  ];

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
    <LearningListFrame locale={locale} className={showEntryHub ? 'ledger-word-index ledger-module-page min-w-0' : 'ledger-word-index min-w-0 overflow-hidden bg-white md:rounded-lg md:border md:border-[#d8cdbc] md:shadow-sm'}>
      {showEntryHub && !showCaptureForm ? (
        <ModuleActionBar
          locale={locale}
          label={isGrammarLibrary ? '语法' : '单词'}
          primary={onPractice && !showFocusedPractice ? { label: '开始练习', hint: isGrammarLibrary ? '随机一组语法题' : '随机一组单词题', onClick: () => onPractice({ kind: 'random' }) } : undefined}
          onAsk={onSaveCapture ? (body) => onSaveCapture({ body, category: captureCategory ?? 'unsure', context: `学习模块：${isGrammarLibrary ? '语法' : '词汇'} · 用户提问`, targetDeck: defaultTargetDeck, ...(selectedWordbookId !== 'all' ? { targetWordbookId: selectedWordbookId } : {}) }) : undefined}
          contentActions={libraryWordbooks.map((wordbook) => ({ key: wordbook.id, label: wordbook.title, onClick: () => { onWordbookChange?.(wordbook.id); onPractice?.({ kind: 'random' }); } }))}
          actions={showFocusedPractice ? [] : [
            { key: 'focused', label: '按题型练习', icon: <Target size={16} aria-hidden="true" />, active: showFocusedPractice, onClick: () => { setShowFocusedPractice((value) => !value); setShowCaptureForm(false); } },
          ]}
        >
          {showFocusedPractice ? (
            <div className="ledger-focused-practice-panel study-focused-selector"><button type="button" className="practice-text-action" onClick={() => setShowFocusedPractice(false)}><ChevronLeft size={18} aria-hidden="true" />{locale === 'zh-CN' ? '返回列表' : locale === 'ja' ? '一覧に戻る' : 'Back to list'}</button>
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
                    <button key={wordbook.id} type="button" onClick={() => { onWordbookChange(wordbook.id); onPractice?.({ kind: 'random' }); setShowFocusedPractice(false); }}>
                      <span>{wordbook.title}</span>
                      <strong>{items.filter((item) => itemInWordbook(item, wordbook.id)).length} 项</strong>
                    </button>
                  )) : null}
                  {focusedContentOptions.map((option) => (
                    <button
                      key={`tag:${option.tag}`}
                      type="button"
                      onClick={() => { onPractice?.({ kind: 'tag', tag: option.tag }); setShowFocusedPractice(false); }}
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
      {showEntryLibrary ? <LearningListHeader title={undefined} count={`${sortedItems.length} ${labels.items}`} appliedSummary={appliedListSummary} onReset={appliedListSummary ? resetListControls : undefined} search={<LearningListSearch value={listSearch} locale={locale} label={locale === 'zh-CN' ? '查找当前列表' : locale === 'ja' ? 'リストを検索' : 'Search this list'} placeholder={locale === 'zh-CN' ? '搜索词语、读音或释义' : locale === 'ja' ? 'リストを検索' : 'Search this list'} onChange={(value) => { setListSearch(value); setPageIndex(0); }}/>} >
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
        {showEntryHub && onManageWordbooks ? (
          <button
            type="button"
            onClick={onManageWordbooks}
            className="list-management-control inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-[#d9d0c3] bg-white px-3 text-sm font-semibold text-[#34443c] hover:bg-[#f7f4ef] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24473f]"
          >
            <Settings size={16} aria-hidden="true" />
            <span>{labels.wordbookManage}</span>
          </button>
        ) : null}
        {batchActions.length ? <div className="list-tools"><BatchManageButton batch={batch} locale={locale} /></div> : null}
      <div className="study-entry-filter-fields">
        <div className="mobile-action-header flex flex-wrap items-center justify-between gap-3">
          <div className="hidden flex-wrap items-center justify-end gap-2 md:flex">
          </div>
          <div className="mobile-filter-row flex flex-wrap items-center gap-2">
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
      </div>
        {onTips ? <ModuleAction label={labels.navQuestionTypes} onClick={onTips}><Lightbulb size={16} /></ModuleAction> : null}
        {onReview ? <ModuleAction label={labels.reviewPage} onClick={onReview}><ScrollText size={16} /></ModuleAction> : null}
        {onOpenQuestionBank ? <ModuleAction label={locale === 'zh-CN' ? '题库管理' : locale === 'ja' ? '問題集管理' : 'Question bank'} onClick={onOpenQuestionBank}><BookOpenText size={16} /></ModuleAction> : null}
        {captureCategory && onSaveCapture ? <ModuleAction label={isGrammarLibrary ? (locale === 'zh-CN' ? '记一个句型' : locale === 'ja' ? '文型を追加' : 'Add a pattern') : (locale === 'zh-CN' ? '记一个单词' : locale === 'ja' ? '単語を追加' : 'Add a word')} onClick={() => { setShowCaptureForm(true); setShowFocusedPractice(false); setCaptureSaved(false); }}><Plus size={16} /></ModuleAction> : null}
      </LearningListHeader> : null}
      </div>
      {showCaptureForm && captureCategory && onSaveCapture ? (
        <form onSubmit={saveCapture} className="entry-capture-form">
          {!hasPageChrome ? <header className="study-form-heading"><button type="button" className="practice-text-action" onClick={() => setShowCaptureForm(false)}>{labels.draftEditCancel}</button><h2>{isGrammarLibrary ? (locale === 'zh-CN' ? '记一个句型' : locale === 'ja' ? '文型を追加' : 'Add a pattern') : (locale === 'zh-CN' ? '记一个单词' : locale === 'ja' ? '単語を追加' : 'Add a word')}</h2></header> : null}
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
            <details className="entry-new-book"><summary>{labels.wordbookCreate}</summary><div className="flex flex-col gap-2 sm:flex-row sm:items-end">
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
            </div></details>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={!captureBody.trim() || captureSaving} className="h-10 rounded-md bg-[#d95f8a] px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-50">
              {captureSaving ? labels.captureSaving : labels.entryAddSave}
            </button>
            {captureSaved ? <p role="status" className="text-sm font-semibold text-[#356146]">{labels.entryAddSaved}</p> : null}
          </div>
          {hasPageChrome ? <button type="button" className="practice-text-action study-form-cancel" onClick={() => setShowCaptureForm(false)}>{labels.draftEditCancel}</button> : null}
        </form>
      ) : null}
      {showEntryLibrary ? (
        <>
        <BatchActionBar batch={batch} actions={batchActions} locale={locale} />
        <LearningList locale={locale} selection={batch.selection}>{(mobileList.mobile ? mobileItems : pageItems).map((item) => {
          const completedRounds = recentPracticeCounts[item.id] ?? 0;
          const roundsLabel = locale === 'zh-CN' ? `${completedRounds} 次已完成练习` : locale === 'ja' ? `完了した練習 ${completedRounds} 回` : `${completedRounds} completed practices`;
          const wordbookId = itemWordbookId(item);
          const wordbookTitle = wordbooks.find((book) => book.id === wordbookId)?.title
            ?? (wordbookId === item.deck ? deckLabels[item.deck] : locale === 'zh-CN' ? '未知' : locale === 'ja' ? '不明' : 'Unknown');
          const studyStatus = progress[item.id]?.status;
          const statusLabel = studyStatus === 'mastered' ? labels.statusMastered : studyStatus === 'review' ? labels.statusReview : studyStatus === 'learning' ? labels.statusLearning : labels.statusNew;
          return <LearningListRow key={item.id} selectId={item.id}
            title={item.original}
            references={[item.reference]}
            reading={distinctReading(item)}
            description={itemMeaning(item, locale)}
            metadata={<><LearningListMetadata locale={locale} addedAt={item.input_at} collectionLabel={collectionLabel} collection={wordbookTitle}
              nextReviewAt={progress[item.id]?.nextReviewAt} showPartOfSpeech={isVocabularyLibrary} partOfSpeech={item.part_of_speech} meaning={itemMeaning(item, locale)} />
              <span className="list-learning-status"><span className="list-metadata-label">{locale === 'zh-CN' ? '学习状态' : locale === 'ja' ? '学習状況' : 'Study status'}</span><span>{statusLabel}</span></span>
            </>}
            status={completedRounds > 0 ? <span className="entry-completed-rounds" aria-label={roundsLabel} title={roundsLabel}><RotateCcw size={17} aria-hidden="true" /><span>{completedRounds}{locale === 'en' ? '' : locale === 'ja' ? ' 回' : ' 次'}</span></span> : <></>}
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

export function WordbookManagerPanel({ labels: baseLabels, locale, family, wordbooks, items = [], onCreateWordbook, onRenameWordbook, onShareWordbook, onBack }: {
  labels: Record<string, string>;
  locale: Locale;
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
  const [showNewWordbook, setShowNewWordbook] = useState(false);
  const cancelRename = () => { setEditingWordbookId(null); setRenameWordbookError(''); };
  useAuthoringNavigation(editingWordbookId ? labels.wordbookRename : null, cancelRename, { kind: 'form' });
  useAuthoringNavigation(showNewWordbook ? labels.wordbookCreate : null, () => setShowNewWordbook(false), { kind: 'form' });
  const newWordbookLabel = locale === 'zh-CN' ? '新建' : locale === 'ja' ? '新規' : 'New';
  const hasPageChrome = usePageHeaderActions(onCreateWordbook && !editingWordbookId && !showNewWordbook ? [{ key: 'new-wordbook', label: newWordbookLabel, onClick: () => setShowNewWordbook(true) }] : []);

  async function createWordbook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newWordbookTitle.trim() || creatingWordbook || !onCreateWordbook) return;
    setCreatingWordbook(true);
    setCreateWordbookError('');
    try {
      const wordbook = await onCreateWordbook(newWordbookTitle.trim(), isGrammar ? 'grammar_expression' : 'n1_vocab');
      if (wordbook) { setNewWordbookTitle(''); setShowNewWordbook(false); }
    } catch (error) {
      setCreateWordbookError(error instanceof Error ? error.message : labels.wordbookCreateFailed);
    } finally {
      setCreatingWordbook(false);
    }
  }

  function startRenamingWordbook(wordbook: Wordbook) {
    setShowNewWordbook(false);
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
    <section className="study-wordbook-manager">
      {!hasPageChrome ? <header className="study-wordbook-fallback-heading">
        <button type="button" className="practice-text-action" onClick={editingWordbookId ? cancelRename : showNewWordbook ? () => setShowNewWordbook(false) : onBack}><ChevronLeft size={18} aria-hidden="true" />{editingWordbookId || showNewWordbook ? labels.draftEditCancel : labels.backToEntryList}</button>
        <h2>{editingWordbookId ? labels.wordbookRename : showNewWordbook ? labels.wordbookCreate : labels.wordbookManage}</h2>
        {onCreateWordbook && !editingWordbookId && !showNewWordbook ? <button type="button" className="practice-text-action" onClick={() => setShowNewWordbook(true)}>{newWordbookLabel}</button> : null}
      </header> : null}
      {showNewWordbook && onCreateWordbook ? (
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
          <button type="button" className="practice-text-action" onClick={() => setShowNewWordbook(false)}>{labels.draftEditCancel}</button>
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
                  <button type="button" onClick={cancelRename} className="h-10 rounded-md border border-[#d9d0c3] bg-white px-4 text-sm font-semibold text-[#59645e]">
                    {labels.draftEditCancel}
                  </button>
                </div>
              </form>
        ) : <LearningListRow key={wordbook.id} compact inlineActions title={wordbook.title} references={[wordbook.reference]} reading={`${items.filter((item) => itemInWordbook(item, wordbook.id)).length} ${labels.items}${wordbook.builtIn ? ` · ${labels.wordbookBuiltIn}` : ''}`} secondary={<ShareButton iconOnly onShare={(description) => onShareWordbook(wordbook.id, description)} locale={locale} />} actionIcon={<Pencil size={20} aria-hidden="true" />} actionLabel={labels.wordbookRename} onOpen={() => startRenamingWordbook(wordbook)}/>)}</LearningList>
        {renameWordbookError ? <p role="alert" className="text-sm font-semibold text-[#8f3d2e]">{renameWordbookError}</p> : null}
      </div>
    </section>
  );
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
  token,
  onAddImage,
  onRemoveImage,
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
  token?: string;
  onAddImage?: (id: string, input: { imageBase64?: string; mime?: string; url?: string; caption?: string }) => Promise<VocabItem | null>;
  onRemoveImage?: (id: string, image: string) => Promise<VocabItem | null>;
  onShowRubyChange: (checked: boolean) => void;
  onPrevious: () => void;
  onNext: () => void;
  onSelectIndex?: (index: number) => void;
}) {
  const touchStartRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [navigatorPage, setNavigatorPage] = useState(() => Math.floor(index / ENTRY_NAVIGATOR_PAGE_SIZE));
  useAuthoringNavigation(navigatorOpen ? labels.wordDetail : null, () => setNavigatorOpen(false), { kind: 'detail' });

  if (!item) {
    return <EmptyModule labels={labels} />;
  }

  function handleTouchStart(event: ReactTouchEvent<HTMLElement>) {
    touchStartRef.current = null;
    if (total <= 1 || navigatorOpen || event.touches.length !== 1) return;
    if (event.target instanceof Element && event.target.closest(
      'button, a, input, select, textarea, label, summary, audio, video, [role="button"], [role="dialog"], [contenteditable]:not([contenteditable="false"])',
    )) return;
    const touch = event.touches[0];
    touchStartRef.current = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
  }

  function handleTouchMove(event: ReactTouchEvent<HTMLElement>) {
    const start = touchStartRef.current;
    if (!start) return;
    const touch = event.touches[0];
    if (event.touches.length !== 1 || touch.identifier !== start.id) {
      touchStartRef.current = null;
      return;
    }
    const deltaX = Math.abs(touch.clientX - start.x);
    const deltaY = Math.abs(touch.clientY - start.y);
    // Once the gesture becomes a vertical scroll, do not turn it into navigation.
    if (deltaY > 12 && deltaY >= deltaX) touchStartRef.current = null;
  }

  function handleTouchEnd(event: ReactTouchEvent<HTMLElement>) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || event.touches.length !== 0 || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    if (touch.identifier !== start.id) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 90 || Math.abs(deltaX) < Math.abs(deltaY) * 2) return;
    if (window.getSelection()?.toString()) return;
    if (deltaX > 0) onPrevious();
    else onNext();
  }

  return (
    <section
      className="study-entry-detail"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { touchStartRef.current = null; }}
    >
      <div className="study-entry-navigation sticky top-12 z-20 mb-3 -mx-4 border-y border-[#f0d4dd] bg-[#fffdf9]/95 px-4 py-2.5 shadow-[0_6px_16px_rgba(79,48,63,0.04)] backdrop-blur md:static md:mx-0 md:border-x-0 md:border-t-0 md:bg-transparent md:px-0 md:pb-3 md:pt-0 md:shadow-none">
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
        token={token}
        imageEditor={onAddImage && onRemoveImage ? { onAdd: onAddImage, onRemove: onRemoveImage } : undefined}
      />
      {onOrganize ? <details className="study-entry-disclosure"><summary>{labels.entryOrganize}</summary><EntryOrganizer key={item.id} item={item} wordbooks={wordbooks} labels={labels} onOrganize={onOrganize} /></details> : null}
      {item.reference ? <div className="study-entry-reference"><RecordReference reference={item.reference} locale={locale} /></div> : null}
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
        <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5'}`} />
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

type ImageEditor = {
  onAdd: (id: string, input: { imageBase64?: string; mime?: string; url?: string; caption?: string }) => Promise<VocabItem | null>;
  onRemove: (id: string, image: string) => Promise<VocabItem | null>;
};

/** One detail layout for vocabulary, grammar and names; sections appear when the entry has data. */
function VocabCard({
  item,
  showRuby,
  labels,
  locale,
  token,
  imageEditor,
}: {
  item: VocabItem;
  showRuby: boolean;
  labels: Record<string, string>;
  locale: Locale;
  token?: string;
  imageEditor?: ImageEditor;
}) {
  const meaning = localized(item, locale, 'meaning') ?? item.meaning_zh;
  const coreMemory = itemMemoryPoints(item, locale);
  const explanation = itemExplanation(item, locale);
  const explanationPreview = conciseEvidence(explanation ?? '', 240);
  const isGrammarEntry = item.deck === 'grammar_expression';
  const reading = distinctReading(item);
  const patterns = item.patterns?.filter((pattern) => pattern.pattern || pattern.example || pattern.connection_zh) ?? [];
  const points = item.points?.filter((point) => point.label || point.detail_zh) ?? [];
  const examples = item.examples?.filter((example) => example.ja || example.zh || example.spoken_ja || example.spoken_zh || example.analysis_zh || example.form_analysis_zh) ?? [];
  const inflectionClass = resolvedInflectionClass(item);
  const baseForm = item.base_form ?? (inflectionClass === 'suru' && item.original.endsWith('する') ? item.original : undefined);
  const conjugations = resolvedConjugations(item, inflectionClass, baseForm);
  const everydayAlternatives = item.comparisons?.filter((comparison) => comparison.kind === 'everyday' && (comparison.target || comparison.difference_zh)) ?? [];
  const comparisons = item.comparisons?.filter((comparison) => comparison.kind !== 'everyday' && (comparison.target || comparison.difference_zh)) ?? [];
  const register = item.register ?? {};
  const registerLabel = register.level ? labels[`usageRegister_${register.level}`] ?? register.level : null;
  const moreExamples = locale === 'zh-CN' ? '更多例句' : locale === 'ja' ? '例文をもっと見る' : 'More examples';
  const renderPattern = (pattern: typeof patterns[number], index: number) => <div key={`${pattern.pattern ?? 'pattern'}-${index}`} className="study-entry-pattern">
    {pattern.pattern ? <p className="study-entry-highlight"><RubyText text={pattern.pattern} items={[item]} enabled={showRuby} /></p> : null}
    {pattern.connection_zh ? <p className="study-entry-translation">{pattern.connection_zh}</p> : null}
    {pattern.meaning_zh ? <p className="study-entry-translation">{pattern.meaning_zh}</p> : null}
    {pattern.example ? <p lang="ja"><RubyText text={pattern.example} items={[item]} enabled={showRuby} /> <SpeechControls text={pattern.example} /></p> : null}
    {pattern.example_zh ? <p className="study-entry-translation">{pattern.example_zh}</p> : null}
  </div>;
  const renderExample = (example: typeof examples[number], index: number) => <div key={`${example.ja}-${index}`} className="study-entry-example">
    {example.ja ? <p lang="ja"><RubyText text={example.ja} items={[item]} enabled={showRuby} /> <SpeechControls text={example.ja} /></p> : null}
    {example.zh ? <p className="study-entry-translation">{example.zh}</p> : null}
    {example.spoken_ja || example.spoken_zh || example.form_analysis_zh || example.analysis_zh ? <details className="study-example-analysis"><summary>{labels.exampleAnalysis ?? '例句分析'}</summary>
      {example.spoken_ja || example.spoken_zh ? <div><h5>{labels.spokenExample ?? '口语版'}</h5>{example.spoken_ja ? <p lang="ja"><RubyText text={example.spoken_ja} items={[item]} enabled={showRuby} /> <SpeechControls text={example.spoken_ja} /></p> : null}{example.spoken_zh ? <p className="study-entry-translation">{example.spoken_zh}</p> : null}</div> : null}
      {example.form_analysis_zh ? <p>{example.form_analysis_zh}</p> : null}
      {example.analysis_zh ? <p>{example.analysis_zh}</p> : null}
    </details> : null}
  </div>;
  return <article className={`study-entry-card${isGrammarEntry ? ' is-grammar' : ''}`}>
    <header className="study-entry-heading">
      {reading && showRuby ? <p className="study-entry-reading" lang="ja">{reading}</p> : null}
      <div className="study-entry-title-row"><h1 lang="ja">{item.original}</h1><SpeechControls text={item.reading || item.original} /></div>
      {isGrammarEntry ? <p className="study-entry-meaning">{meaning}</p> : item.part_of_speech ? <p className="study-entry-translation">{item.part_of_speech}</p> : null}
    </header>
    <div className="study-entry-content-grid"><div className="study-entry-main">
    {isGrammarEntry && patterns.length ? <section className="study-entry-section"><h2>{labels.grammarConnection ?? '接续'}</h2>{patterns.map(renderPattern)}</section> : null}
    {item.meaning_ja ? <section className="study-entry-section"><h2>{labels.japaneseMeaning}</h2><p lang="ja"><RubyText text={item.meaning_ja} items={[item]} enabled={showRuby} /></p></section> : null}
    {!isGrammarEntry && locale !== 'ja' && meaning ? <section className="study-entry-section"><h2>{labels.localizedMeaning}</h2><p>{meaning}</p></section> : null}
    {explanation ? <section className="study-entry-section"><h2>{labels.analysis}</h2><StudyText text={explanationPreview.summary} renderText={(text) => <RubyText text={text} items={[item]} enabled={showRuby} />} />{explanationPreview.hasMore ? <details className="study-example-analysis"><summary>{locale === 'zh-CN' ? '完整解析' : locale === 'ja' ? '詳しい解説' : 'Full explanation'}</summary><StudyText text={explanation} renderText={(text) => <RubyText text={text} items={[item]} enabled={showRuby} />} /></details> : null}</section> : null}
    {examples.length ? <section className="study-entry-section"><h2>{labels.vocabularyExamples ?? '例句'}</h2>{examples.slice(0, 1).map(renderExample)}</section> : null}
    </div><aside className="study-entry-support">
    {coreMemory.length || points.length ? <section className="study-entry-section"><h2>{labels.examQuickNote}</h2>
      {coreMemory.length ? <ul className="study-entry-memory">{coreMemory.map((point, index) => <li key={`${index}-${point}`}>{point}</li>)}</ul> : null}
      {points.map((point, index) => <div className="study-entry-point" key={`${point.label ?? 'point'}-${index}`}>{point.label ? <h3>{point.label}</h3> : null}{point.detail_zh ? <p>{point.detail_zh}</p> : null}</div>)}
    </section> : null}
    {examples.length > 1 ? <details className="study-entry-disclosure"><summary>{moreExamples}<span>{examples.length - 1}</span></summary>{examples.slice(1).map(renderExample)}</details> : null}
    {!isGrammarEntry && patterns.length ? <details className="study-entry-disclosure"><summary>{labels.collocationsLabel}</summary>{patterns.map(renderPattern)}</details> : null}
    {conjugations.length ? <details className="study-entry-disclosure"><summary>{labels.conjugationsLabel}</summary>
      <p className="study-entry-translation">{inflectionClass ? `${labels.inflectionClassLabel}：${labels[`inflectionClass_${inflectionClass}`] ?? inflectionClass}` : ''}{baseForm ? ` · ${labels.baseFormLabel}：${baseForm}` : ''}</p>
      <dl className="study-entry-conjugations">{conjugations.map((conjugation, index) => <div key={`${conjugation.kind}-${index}`}><dt>{labels[`conjugation_${conjugation.kind}`] ?? conjugation.kind}</dt><dd><RubyText text={conjugation.form} items={[item]} enabled={showRuby} /></dd></div>)}</dl>
    </details> : null}
    {registerLabel || register.note_zh || register.exam_tip_zh || everydayAlternatives.length ? <details className="study-entry-disclosure"><summary>{labels.grammarRegister ?? '语体与口语说法'}</summary>
      {registerLabel ? <p className="study-entry-highlight">{registerLabel}</p> : null}{register.note_zh ? <p>{register.note_zh}</p> : null}{register.exam_tip_zh ? <p>{labels.examRegisterNote ?? '考试提示'}：{register.exam_tip_zh}</p> : null}
      {everydayAlternatives.length ? <div><h3>{labels.spokenAlternatives ?? '口语一般这样说'}</h3>{everydayAlternatives.map((alternative, index) => <div className="study-entry-point" key={`${alternative.target}-${index}`}>{alternative.target ? <h4>{alternative.target}</h4> : null}{alternative.difference_zh ? <p>{alternative.difference_zh}</p> : null}</div>)}</div> : null}
    </details> : null}
    {comparisons.length ? <details className="study-entry-disclosure"><summary>{labels.comparisonNotes ?? '近义辨析'}</summary>{comparisons.map((comparison, index) => <div className="study-entry-point" key={`${comparison.target}-${index}`}>{comparison.target ? <h3>{comparison.target}</h3> : null}{comparison.difference_zh ? <p>{comparison.difference_zh}</p> : null}</div>)}</details> : null}
    {item.images?.length || imageEditor ? <details className="study-entry-disclosure"><summary>{locale === 'zh-CN' ? '记忆图片' : locale === 'ja' ? '記憶イメージ' : 'Memory images'}</summary><EntryImages item={item} token={token} editor={imageEditor} /></details> : null}
    </aside></div>
    {item.content_origin === 'ai_generated' && item.verification_status !== 'verified' ? <p className="practice-verification-notice">{labels.unverifiedContentNotice}</p> : null}
  </article>;
}

const MAX_ENTRY_IMAGES = 6;

/** Memory images of an entry, with upload and removal when the entry is editable. */
function EntryImages({ item, token, editor }: { item: VocabItem; token?: string; editor?: ImageEditor }) {
  const images = item.images ?? [];
  const [caption, setCaption] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setPromptCopied(false), [item.id]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(memoryImagePrompt(item));
      setPromptCopied(true);
      setError('');
    } catch {
      setError('复制失败，请检查浏览器的剪贴板权限。');
    }
  }

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '图片保存失败，请稍后重试。');
    } finally {
      setBusy(false);
    }
  }

  function upload(file: File | undefined) {
    if (!file || !editor) return;
    void run(async () => {
      await editor.onAdd(item.id, { ...(await prepareImageUpload(file)), caption: caption.trim() || undefined });
      setCaption('');
    });
  }

  return (
    <section className="mt-5 border-t border-[#f0d4dd] pt-5" aria-label="记忆图片">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-[#a84269]">记忆图片</h4>
        {editor && images.length < MAX_ENTRY_IMAGES ? (
          <div className="flex flex-wrap items-center gap-2">
            <input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={120} disabled={busy} placeholder="图片说明（可选）" aria-label="图片说明" className="h-9 w-40 rounded-md border border-[#d9d0c3] bg-white px-2 text-sm outline-none focus:border-[#24473f] disabled:opacity-60" />
            <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className="inline-flex h-9 items-center gap-1 rounded-md border border-[#f0c9d4] bg-white px-3 text-sm font-semibold text-[#a84269] hover:bg-[#fff0f5] disabled:opacity-60">
              {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <ImagePlus size={15} aria-hidden="true" />}添加图片
            </button>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ''; }} />
          </div>
        ) : null}
      </div>
      {editor ? (
        <details className="mt-3 rounded-lg border border-[#f0d4dd] bg-[#fffaf5] px-3 py-2 text-xs leading-5 text-[#74646b]">
          <summary className="cursor-pointer font-semibold text-[#8f365b]">用 AI 制作记忆图片</summary>
          <p className="mt-2">可把这个词条的生成要求复制给任意 AI 助手。图片应写出词条、接续或用法、含义，以及一组日文例句和中文译文；上传前请放大核对文字。</p>
          <button type="button" onClick={() => void copyPrompt()} className="mt-2 rounded-md border border-[#f0c9d4] bg-white px-3 py-1.5 font-semibold text-[#8f365b] hover:bg-[#fff0f5]">
            {promptCopied ? '已复制生成要求' : '复制这个词条的生成要求'}
          </button>
        </details>
      ) : null}
      {images.length ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image) => (
            <figure key={image.id ?? image.url} className="relative m-0 overflow-hidden rounded-xl border border-[#f0d4dd] bg-[#fffaf5]">
              <ItemImage image={image} token={token} alt={image.caption || item.original} className="aspect-[4/3] w-full object-contain" />
              {image.caption ? <figcaption className="px-2 py-1.5 text-xs leading-5 text-[#74646b]">{image.caption}</figcaption> : null}
              {editor ? (
                <button type="button" disabled={busy} aria-label={`删除图片${image.caption ? `：${image.caption}` : ''}`} onClick={() => void run(() => editor.onRemove(item.id, image.id ?? image.url ?? ''))} className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[#8f365b] shadow hover:bg-white disabled:opacity-60">
                  <X size={14} aria-hidden="true" />
                </button>
              ) : null}
            </figure>
          ))}
        </div>
      ) : editor ? <p className="mt-2 text-xs leading-5 text-[#74646b]">给这个词条配一张能唤起记忆的图片，复习卡片上也会显示。</p> : null}
      {error ? <p role="alert" className="mt-2 text-sm font-semibold text-[#8f3d2e]">{error}</p> : null}
    </section>
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
    ...(item.conjugations ?? []).flatMap((entry) => {
      const reading = conjugationReading(item, entry);
      return reading ? [{ text: entry.form, reading }] : [];
    }),
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
