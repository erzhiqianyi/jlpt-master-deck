import { LearningCatalog } from '../../components/LearningCatalog';
import { ModuleActionBar } from '../../components/ModuleActionBar';
import { LearningList, LearningListRow } from '../../components/LearningList';
import { useMobileList } from '../../hooks/useMobileList';
import { useConfirmation } from '../../components/confirmation';
import { ChevronLeft, ChevronRight, Clipboard, Lightbulb, Plus, ScrollText, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Locale, ReadingQuestion, ReadingQuestionInput } from '../../types';

const READING_LIBRARY_PAGE_SIZE = 8;

type ReadingPanelProps = {
  activeQuestionId?: string;
  onBackToLibrary?: () => void;
  mode: 'practice' | 'library';
  labels: Record<string, string>;
  locale: Locale;
  questions: ReadingQuestion[];
  onCreate: (input: ReadingQuestionInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpenLibrary?: () => void;
  onPractice?: () => void;
  onTips?: () => void;
  onReview?: () => void;
};

export function ReadingPanel({ activeQuestionId, onBackToLibrary, mode, labels, locale, questions, onCreate, onDelete, onOpenLibrary, onPractice, onTips, onReview }: ReadingPanelProps) {
  const [title, setTitle] = useState('');
  const [passage, setPassage] = useState('');
  const [question, setQuestion] = useState('');
  const [choices, setChoices] = useState(['', '', '', '']);
  const [answerIndex, setAnswerIndex] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showAiForm, setShowAiForm] = useState(false);
  // The library is always visible; the action bar above it replaces the old entry hub.
  const showLibrary = true;
  const [sourceUrl, setSourceUrl] = useState('');
  const [questionCount, setQuestionCount] = useState(3);
  const [pageIndex, setPageIndex] = useState(0);
  const mobileList = useMobileList(questions.length, 'library');
  const pageCount = Math.max(1, Math.ceil(questions.length / READING_LIBRARY_PAGE_SIZE));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const pageStart = currentPage * READING_LIBRARY_PAGE_SIZE;
  const pageItems = questions.slice(mobileList.mobile ? 0 : pageStart, mobileList.mobile ? mobileList.visible : pageStart + READING_LIBRARY_PAGE_SIZE);
  const pageEnd = pageStart + pageItems.length;

  useEffect(() => {
    setPageIndex((index) => Math.min(index, pageCount - 1));
  }, [pageCount]);

  if (mode === 'practice') {
    return <ReadingPracticePanel labels={labels} locale={locale} questions={questions} onOpenLibrary={onOpenLibrary} />;
  }

  if (activeQuestionId) {
    const item = questions.find((question) => question.id === activeQuestionId);
    return <div className="space-y-4"><button type="button" onClick={onBackToLibrary} className="cute-focus rounded-full border px-4 py-2 text-sm">{labels.backToEntryList}</button>{item ? <ReadingQuestionItem key={item.id} item={item} labels={labels} locale={locale} onDelete={onDelete} /> : <p>{labels.noSearchResults}</p>}</div>;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setSubmitting(true);
    try {
      await onCreate({ title, passage, question, choices, answerIndex, explanation });
      setTitle('');
      setPassage('');
      setQuestion('');
      setChoices(['', '', '', '']);
      setAnswerIndex(0);
      setExplanation('');
      setShowForm(false);
      setMessage(labels.readingSaved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save reading question');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyAgentPrompt() {
    const url = sourceUrl.trim();
    if (!url) {
      setMessage(labels.aiSourceUrlRequired);
      return;
    }
    const prompt = [
      '请使用 JLPT Review 本地 MCP / 本地后台，为当前账号生成阅读题库。',
      `素材链接：${url}`,
      `题目数量：${questionCount}`,
      '要求：读取文章内容，生成 JLPT N1 风格阅读题。每题包含标题、文章、题目、4 个选项、正确答案、解析，并尽量标注定位句和排除理由。',
      '保存：生成后写入本应用的阅读题库，完成后告诉我生成了哪些题。',
    ].join('\n');
    await navigator.clipboard.writeText(prompt);
    setMessage(labels.aiPromptCopied);
  }

  return (
    <section className="ledger-word-index ledger-module-page min-w-0">
      <ModuleActionBar
        label="阅读"
        primary={onPractice ? { label: '开始练习', hint: '按题库顺序练一轮', onClick: onPractice } : undefined}
        actions={[
          ...(onTips ? [{ key: 'tips', label: '学习方法', icon: <Lightbulb size={16} aria-hidden="true" />, onClick: onTips }] : []),
          ...(onReview ? [{ key: 'review', label: labels.reviewPage, icon: <ScrollText size={16} aria-hidden="true" />, onClick: onReview }] : []),
          { key: 'ai', label: labels.aiGenerateFromLink, icon: <Sparkles size={16} aria-hidden="true" />, active: showAiForm, onClick: () => { setShowAiForm((value) => !value); setShowForm(false); setMessage(''); } },
          { key: 'add', label: '添加阅读材料', icon: <Plus size={16} aria-hidden="true" />, active: showForm, onClick: () => { setShowForm((value) => !value); setShowAiForm(false); setMessage(''); } },
        ]}
      />

      {message ? <p role="status" className="border-b border-[#e1e7df] px-4 py-3 text-sm font-semibold text-[#5a654f] md:px-6">{message}</p> : null}

      {showAiForm ? (
        <section className="grid gap-4 border-b border-[#e1e7df] bg-white px-4 py-5 md:px-6">
          <p className="text-sm leading-6 text-[#68716b]">{labels.aiReadingGeneratorBody}</p>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_9rem]">
            <label className="block text-sm font-semibold text-[#46514c]">
              {labels.aiSourceUrl}
              <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder={labels.aiReadingUrlPlaceholder} className="mt-2 h-11 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-base" />
            </label>
            <label className="block text-sm font-semibold text-[#46514c]">
              {labels.aiQuestionCount}
              <input type="number" min={1} max={10} value={questionCount} onChange={(event) => setQuestionCount(Math.max(1, Math.min(10, Number(event.target.value) || 1)))} className="mt-2 h-11 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-base" />
            </label>
          </div>
          <button type="button" onClick={copyAgentPrompt} className="inline-flex h-11 w-fit items-center gap-2 rounded-md bg-[#31564c] px-5 text-sm font-semibold text-white hover:bg-[#24473f]">
            <Clipboard size={17} />
            {labels.aiCopyAgentPrompt}
          </button>
        </section>
      ) : null}

      {showForm ? (
        <form className="grid gap-4 border-b border-[#e1e7df] bg-white px-4 py-5 md:px-6" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-semibold text-[#46514c]">
              {labels.readingTitle}
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={labels.readingTitlePlaceholder} maxLength={120} className="mt-2 h-11 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-base" />
            </label>
            <label className="block text-sm font-semibold text-[#46514c]">
              {labels.readingCorrectAnswer}
              <select value={answerIndex} onChange={(event) => setAnswerIndex(Number(event.target.value))} className="mt-2 h-11 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-base">
                {choices.map((choice, index) => <option key={index} value={index}>{index + 1}. {choice || labels.readingChoice.replace('{number}', String(index + 1))}</option>)}
              </select>
            </label>
          </div>

          <label className="block text-sm font-semibold text-[#46514c]">
            {labels.readingPassage}
            <textarea value={passage} onChange={(event) => setPassage(event.target.value)} placeholder={labels.readingPassagePlaceholder} maxLength={8000} className="mt-2 min-h-40 w-full rounded-md border border-[#c8d1c8] bg-white p-3 text-base leading-7" required />
          </label>

          <label className="block text-sm font-semibold text-[#46514c]">
            {labels.readingQuestion}
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={labels.readingQuestionPlaceholder} maxLength={1000} className="mt-2 min-h-24 w-full rounded-md border border-[#c8d1c8] bg-white p-3 text-base leading-6" required />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            {choices.map((choice, index) => (
              <label key={index} className="block text-sm font-semibold text-[#46514c]">
                {labels.readingChoice.replace('{number}', String(index + 1))}
                <input
                  value={choice}
                  onChange={(event) => setChoices((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                  maxLength={300}
                  className="mt-2 h-11 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-base"
                  required
                />
              </label>
            ))}
          </div>

          <label className="block text-sm font-semibold text-[#46514c]">
            {labels.readingExplanation}
            <textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder={labels.readingExplanationPlaceholder} maxLength={2000} className="mt-2 min-h-24 w-full rounded-md border border-[#c8d1c8] bg-white p-3 text-base leading-6" />
          </label>

          <button type="submit" disabled={submitting} className="h-11 w-fit rounded-md bg-[#31564c] px-5 text-sm font-semibold text-white hover:bg-[#24473f] disabled:cursor-wait disabled:opacity-60">
            {submitting ? labels.readingSubmitting : labels.readingSubmit}
          </button>
        </form>
      ) : null}

      {showLibrary ? <LearningCatalog title={locale === 'ja' ? '読解ライブラリ' : locale === 'en' ? 'Reading library' : '阅读题库'} items={questions} locale={locale} searchText={(item) => `${item.title} ${item.passage}`} renderRow={(item) => <LearningListRow key={item.id} title={item.title} description={item.passage} locale={locale} onOpen={() => { window.location.hash = `#/reading/words/${encodeURIComponent(item.id)}`; }}/>}/> : null}
    </section>
  );
}

function ReadingPracticePanel({ labels, locale, questions, onOpenLibrary }: { labels: Record<string, string>; locale: Locale; questions: ReadingQuestion[]; onOpenLibrary?: () => void }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeQuestion = questions[activeIndex % Math.max(questions.length, 1)];

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(questions.length - 1, 0)));
  }, [questions.length]);

  if (!questions.length || !activeQuestion) {
    return (
      <section className="cute-practice-card mobile-page-surface min-w-0 border p-5 md:p-6">
        <h2 className="text-2xl font-black text-[#3d3036]">{labels.readingPracticeTitle}</h2>
        <p className="mt-3 text-sm leading-6 text-[#74646b]">{labels.readingPracticeEmpty}</p>
        {onOpenLibrary ? (
          <button type="button" onClick={onOpenLibrary} className="cute-button-primary mt-5 h-10 rounded-full px-4 text-sm font-bold text-white">
            {labels.questionBankPage}
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="cute-practice-card mobile-page-surface min-w-0 border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0d4dd] px-4 py-3 md:px-5">
        <p className="text-sm font-bold text-[#a84269]">{labels.readingPracticeTitle}</p>
        <div className="flex items-center gap-2">
          <button type="button" aria-label={labels.prev} title={labels.prev} disabled={activeIndex === 0} onClick={() => setActiveIndex((index) => Math.max(0, index - 1))} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#f0c9d4] bg-white text-[#a84269] hover:bg-[#fff0f5] disabled:cursor-not-allowed disabled:opacity-40">
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-16 rounded-full bg-[#fff0f5] px-3 py-1 text-center text-sm font-bold text-[#a84269]">{activeIndex + 1} / {questions.length}</span>
          <button type="button" aria-label={labels.next} title={labels.next} disabled={activeIndex >= questions.length - 1} onClick={() => setActiveIndex((index) => Math.min(questions.length - 1, index + 1))} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#f0c9d4] bg-white text-[#a84269] hover:bg-[#fff0f5] disabled:cursor-not-allowed disabled:opacity-40">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <ReadingPracticeQuestion item={activeQuestion} labels={labels} locale={locale} />
    </section>
  );
}

function ReadingPracticeQuestion({ item, labels, locale }: { item: ReadingQuestion; labels: Record<string, string>; locale: Locale }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answerNotice, setAnswerNotice] = useState('');

  useEffect(() => {
    setSelected(null);
    setRevealed(false);
    setAnswerNotice('');
  }, [item.id]);

  return (
    <div className="p-4 md:p-6">
      <div className="min-w-0">
        <h2 className="break-words text-2xl font-black text-[#3d3036]">{item.title}</h2>
        <p className="mt-1 text-xs text-[#8f6f7b]">{formatDateTime(item.createdAt, locale)}</p>
      </div>
      <div className="mt-5 whitespace-pre-wrap rounded-2xl border border-[#f0d4dd] bg-white/80 p-4 text-base leading-8 text-[#3d3036] shadow-sm">{item.passage}</div>
      <p className="mt-6 whitespace-pre-wrap text-lg font-bold leading-8 text-[#3d3036]">{item.question}</p>
      <ChoiceGrid item={item} selected={selected} revealed={revealed} onSelect={(index) => { setSelected(index); setRevealed(false); setAnswerNotice(''); }} />
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#f0d4dd] pt-4">
        <button type="button" onClick={() => selected === null ? setAnswerNotice(labels.readingSelectAnswer) : setRevealed(true)} className="cute-button-primary h-10 rounded-full px-4 text-sm font-bold text-white">
          {labels.readingShowAnswer}
        </button>
        {answerNotice ? <p role="status" className="text-sm font-bold text-[#8a6134]">{answerNotice}</p> : null}
        {revealed && selected !== null ? <p role="status" className={`text-sm font-bold ${selected === item.answerIndex ? 'text-[#356146]' : 'text-[#a84269]'}`}>{selected === item.answerIndex ? labels.readingCorrect : labels.readingWrong}</p> : null}
      </div>
      {revealed && item.explanation ? <p className="cute-answer-note mt-4 whitespace-pre-wrap border border-[#f0d4dd] bg-[#fff7fb] p-3 text-sm leading-6 text-[#4f5b55]">{item.explanation}</p> : null}
    </div>
  );
}

function ReadingQuestionItem({ item, labels, locale, onDelete }: { item: ReadingQuestion; labels: Record<string, string>; locale: Locale; onDelete: (id: string) => Promise<void> }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answerNotice, setAnswerNotice] = useState('');
  const confirm = useConfirmation();
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!(await confirm({ title: labels.readingDelete, description: labels.readingDeleteConfirm, confirmLabel: labels.readingDelete, cancelLabel: labels.cancelAction, danger: true }))) return;
    setDeleting(true);
    try {
      await onDelete(item.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <article className="min-w-0 rounded-md border border-[#d8e0d7] bg-white p-4 md:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-semibold text-[#27312c]">{item.title}</h3>
          <p className="mt-1 text-xs text-[#778079]">{formatDateTime(item.createdAt, locale)}</p>
        </div>
        <div className="flex shrink-0 justify-end gap-1">
          <QuestionAction label={`${labels.readingDelete}: ${item.title}`} title={labels.readingDelete} onClick={remove} disabled={deleting}><Trash2 size={16} /></QuestionAction>
        </div>
      </div>
      <p className="mt-4 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-[#53605a]">{item.passage}</p>
      <p className="mt-5 whitespace-pre-wrap text-base font-semibold leading-7">{item.question}</p>
      <ChoiceGrid item={item} selected={selected} revealed={revealed} onSelect={(index) => { setSelected(index); setRevealed(false); setAnswerNotice(''); }} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => selected === null ? setAnswerNotice(labels.readingSelectAnswer) : setRevealed(true)} className="h-10 rounded-md bg-[#31564c] px-4 text-sm font-semibold text-white">{labels.readingShowAnswer}</button>
        {answerNotice ? <p role="status" className="text-sm font-semibold text-[#8a6134]">{answerNotice}</p> : null}
        {revealed && selected !== null ? <p role="status" className={`text-sm font-semibold ${selected === item.answerIndex ? 'text-[#356146]' : 'text-[#8a493c]'}`}>{selected === item.answerIndex ? labels.readingCorrect : labels.readingWrong}</p> : null}
      </div>
      {revealed && item.explanation ? <p className="mt-4 whitespace-pre-wrap rounded-md bg-[#f5f7f3] p-3 text-sm leading-6 text-[#4f5b55]">{item.explanation}</p> : null}
    </article>
  );
}


function QuestionAction({ label, title, children, onClick, disabled }: { label: string; title: string; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={title} onClick={onClick} disabled={disabled} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#ead1dc] bg-white text-[#a84269] hover:bg-[#fff0f5] disabled:cursor-wait disabled:opacity-50">
      {children}
    </button>
  );
}

function ChoiceGrid({ item, selected, revealed, onSelect }: { item: ReadingQuestion; selected: number | null; revealed: boolean; onSelect: (index: number) => void }) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {item.choices.map((choice, index) => {
        const resultClass = revealed
          ? index === item.answerIndex ? 'border-[#65a37c] bg-[#f0fff5]' : selected === index ? 'border-[#d95f8a] bg-[#fff0f5]' : 'border-[#f0d4dd] bg-white'
          : selected === index ? 'border-[#d95f8a] bg-[#fff0f5]' : 'border-[#f0d4dd] bg-white hover:bg-[#fff7fb]';
        return (
          <button key={index} type="button" onClick={() => onSelect(index)} className={`cute-choice flex min-h-14 items-center gap-3 border px-4 py-3 text-left text-base font-bold ${resultClass}`}>
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs">{index + 1}</span>
            <span className="min-w-0 break-words">{choice}</span>
          </button>
        );
      })}
    </div>
  );
}

function formatDateTime(value: string, locale: Locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
