import { LearningCatalog } from '../../components/LearningCatalog';
import { ModuleActionBar } from '../../components/ModuleActionBar';
import { LearningList, LearningListRow } from '../../components/LearningList';
import { useMobileList } from '../../hooks/useMobileList';
import { useConfirmation } from '../../components/confirmation';
import { CheckCircle2, ChevronLeft, ChevronRight, Clipboard, Clock3, Lightbulb, LoaderCircle, Mic, Pause, Play, Plus, RotateCcw, ScrollText, Sparkles, Square, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { officialN1QuestionTypes } from '../../data/questionTypes';
import { apiRequest } from '../../lib/api';
import type { ListeningQuestion, ListeningQuestionInput, ListeningRecording, Locale } from '../../types';

const LISTENING_LIBRARY_PAGE_SIZE = 8;
const listeningQuestionTypes = [
  ...officialN1QuestionTypes.filter((type) => type.section === 'listening').map((type) => ({ id: type.id, label: type.officialName })),
  { id: 'listening-basic-training', label: '基础训练' },
];
const defaultListeningQuestionTypeId = listeningQuestionTypes[0]?.id ?? 'listening-task';

type ListeningPanelProps = {
  mode: 'practice' | 'library';
  labels: Record<string, string>;
  locale: Locale;
  token: string;
  questions: ListeningQuestion[];
  onCreate: (input: ListeningQuestionInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpenLibrary?: () => void;
  onPractice?: () => void;
  onTips?: () => void;
  onReview?: () => void;
  activeQuestionId?: string;
  onOpenQuestion?: (id: string) => void;
  onBackToLibrary?: () => void;
};

export function ListeningPanel({ mode, labels, locale, token, questions, onCreate, onDelete, onOpenLibrary, onPractice, onTips, onReview, activeQuestionId, onOpenQuestion, onBackToLibrary }: ListeningPanelProps) {
  const [title, setTitle] = useState('');
  const [questionTypeId, setQuestionTypeId] = useState(defaultListeningQuestionTypeId);
  const [question, setQuestion] = useState('');
  const [choices, setChoices] = useState(['', '', '', '']);
  const [answerIndex, setAnswerIndex] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
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
  const pageCount = Math.max(1, Math.ceil(questions.length / LISTENING_LIBRARY_PAGE_SIZE));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const pageStart = currentPage * LISTENING_LIBRARY_PAGE_SIZE;
  const pageItems = questions.slice(mobileList.mobile ? 0 : pageStart, mobileList.mobile ? mobileList.visible : pageStart + LISTENING_LIBRARY_PAGE_SIZE);
  const pageEnd = pageStart + pageItems.length;

  useEffect(() => {
    setPageIndex((index) => Math.min(index, pageCount - 1));
  }, [pageCount]);

  if (mode === 'practice') {
    return <ListeningPracticePanel labels={labels} locale={locale} token={token} questions={questions} onOpenLibrary={onOpenLibrary} />;
  }

  const activeLibraryQuestion = activeQuestionId ? questions.find((item) => item.id === activeQuestionId) : undefined;
  if (activeLibraryQuestion) {
    return (
      <section className="cute-practice-card min-w-0 overflow-hidden border">
        <div className="flex items-center gap-3 border-b border-[#f0d4dd] px-4 py-3 md:px-6">
          <button type="button" onClick={onBackToLibrary} aria-label={labels.listeningBackToList} title={labels.listeningBackToList} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#ead1dc] bg-white text-[#a84269] hover:bg-[#fff0f5]">
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#a84269]">{labels.listeningLibrary}</p>
            <h2 className="truncate text-lg font-black text-[#3d3036]">ID {activeLibraryQuestion.id} · {listeningQuestionTypeName(activeLibraryQuestion.questionTypeId)}</h2>
          </div>
        </div>
        <ListeningQuestionItem item={activeLibraryQuestion} labels={labels} locale={locale} token={token} onDelete={onDelete} detail />
      </section>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!audioFile) {
      setMessage(labels.listeningFileRequired);
      return;
    }
    if (audioFile.size > 25 * 1024 * 1024) {
      setMessage(labels.listeningFileTooLarge);
      return;
    }
    setSubmitting(true);
    try {
      await onCreate({
        title,
        questionTypeId,
        question,
        choices,
        answerIndex,
        explanation,
        audioFileName: audioFile.name,
        audioMime: audioFile.type || audioMimeFromName(audioFile.name),
        audioBase64: await fileToBase64(audioFile),
      });
      setTitle('');
      setQuestionTypeId(defaultListeningQuestionTypeId);
      setQuestion('');
      setChoices(['', '', '', '']);
      setAnswerIndex(0);
      setExplanation('');
      setAudioFile(null);
      setFileInputKey((value) => value + 1);
      setShowForm(false);
      setMessage(labels.listeningSaved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save listening question');
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
      '请使用 JLPT Review 本地 MCP / 本地后台，为当前账号生成听力题库。',
      `素材链接：${url}`,
      `题目数量：${questionCount}`,
      '要求：读取或转写音频内容，生成 JLPT N1 风格听力题。每题包含标题、题目、4 个选项、正确答案、解析，并尽量标注听力线索。',
      '保存：生成后写入本应用的听力题库，完成后告诉我生成了哪些题。',
    ].join('\n');
    await navigator.clipboard.writeText(prompt);
    setMessage(labels.aiPromptCopied);
  }

  return (
    <section className="ledger-word-index ledger-module-page min-w-0">
      <ModuleActionBar
        label="听力"
        primary={onPractice ? { label: '开始练习', hint: '按题库顺序练一轮', onClick: onPractice } : undefined}
        actions={[
          ...(onTips ? [{ key: 'tips', label: '学习方法', icon: <Lightbulb size={16} aria-hidden="true" />, onClick: onTips }] : []),
          ...(onReview ? [{ key: 'review', label: labels.reviewPage, icon: <ScrollText size={16} aria-hidden="true" />, onClick: onReview }] : []),
          { key: 'ai', label: labels.aiGenerateFromLink, icon: <Sparkles size={16} aria-hidden="true" />, active: showAiForm, onClick: () => { setShowAiForm((value) => !value); setShowForm(false); setMessage(''); } },
          { key: 'add', label: labels.listeningUploadTitle, icon: <Plus size={16} aria-hidden="true" />, active: showForm, onClick: () => { setShowForm((value) => !value); setShowAiForm(false); setMessage(''); } },
        ]}
      />

      {message ? <p role="status" className="border-b border-[#f0d4dd] px-4 py-3 text-sm font-bold text-[#8f365b] md:px-6">{message}</p> : null}

      {showAiForm ? (
        <section className="grid gap-4 border-b border-[#f0d4dd] bg-white/70 px-4 py-5 md:px-6">
          <p className="text-sm leading-6 text-[#68716b]">{labels.aiListeningGeneratorBody}</p>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_9rem]">
            <label className="block text-sm font-semibold text-[#46514c]">
              {labels.aiSourceUrl}
              <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder={labels.aiListeningUrlPlaceholder} className="mt-2 h-11 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-base" />
            </label>
            <label className="block text-sm font-semibold text-[#46514c]">
              {labels.aiQuestionCount}
              <input type="number" min={1} max={10} value={questionCount} onChange={(event) => setQuestionCount(Math.max(1, Math.min(10, Number(event.target.value) || 1)))} className="mt-2 h-11 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-base" />
            </label>
          </div>
          <button type="button" onClick={copyAgentPrompt} className="cute-button-primary inline-flex h-11 w-fit items-center gap-2 rounded-full px-5 text-sm font-bold text-white">
            <Clipboard size={17} />
            {labels.aiCopyAgentPrompt}
          </button>
        </section>
      ) : null}

      {showForm ? (
        <form className="grid gap-4 border-b border-[#f0d4dd] bg-white/70 px-4 py-5 md:px-6" onSubmit={submit}>
          <p className="text-sm leading-6 text-[#68716b]">{labels.listeningUploadBody}</p>
          <label className="block text-sm font-semibold text-[#46514c]">
            {labels.listeningAudio}
            <input
              key={fileInputKey}
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac"
              onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)}
              className="mt-2 block w-full rounded-md border border-[#cbd6cf] bg-white p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-[#e9f0e9] file:px-3 file:py-2 file:font-semibold file:text-[#31564c]"
              required
            />
            {audioFile ? (
              <span className="mt-2 block text-xs font-normal text-[#68716b]">{audioFile.name} · {formatFileSize(audioFile.size, locale)}</span>
            ) : null}
          </label>

          {audioFile ? <UploadedAudioPreview file={audioFile} labels={labels} /> : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-semibold text-[#46514c]">
              {labels.questionType}
              <select value={questionTypeId} onChange={(event) => setQuestionTypeId(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-base">
                {listeningQuestionTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-[#46514c]">
              {labels.listeningTitle}
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={labels.listeningTitlePlaceholder} maxLength={120} className="mt-2 h-11 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-base" />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-semibold text-[#46514c]">
              {labels.listeningCorrectAnswer}
              <select value={answerIndex} onChange={(event) => setAnswerIndex(Number(event.target.value))} className="mt-2 h-11 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-base">
                {choices.map((choice, index) => <option key={index} value={index}>{index + 1}. {choice || labels.listeningChoice.replace('{number}', String(index + 1))}</option>)}
              </select>
            </label>
          </div>

          <label className="block text-sm font-semibold text-[#46514c]">
            {labels.listeningQuestion}
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={labels.listeningQuestionPlaceholder} maxLength={1000} className="mt-2 min-h-24 w-full rounded-md border border-[#c8d1c8] bg-white p-3 text-base leading-6" required />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            {choices.map((choice, index) => (
              <label key={index} className="block text-sm font-semibold text-[#46514c]">
                {labels.listeningChoice.replace('{number}', String(index + 1))}
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
            {labels.listeningExplanation}
            <textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder={labels.listeningExplanationPlaceholder} maxLength={2000} className="mt-2 min-h-24 w-full rounded-md border border-[#c8d1c8] bg-white p-3 text-base leading-6" />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={submitting} className="cute-button-primary h-11 rounded-full px-5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60">
              {submitting ? labels.listeningSubmitting : labels.listeningSubmit}
            </button>
          </div>
        </form>
      ) : null}

      {showLibrary ? <LearningCatalog title={locale === 'ja' ? '聴解ライブラリ' : locale === 'en' ? 'Listening library' : '听力题库'} items={questions} locale={locale} searchText={(item) => `${item.libraryNumber ?? questions.length - questions.indexOf(item)} ${listeningQuestionTypeName(item.questionTypeId)}`} renderRow={(item) => <LearningListRow key={item.id} inlineActions title={`${labels.listeningDatabaseNumber} #${item.libraryNumber ?? questions.length - questions.indexOf(item)}`} description={listeningQuestionTypeName(item.questionTypeId)} locale={locale} onOpen={() => onOpenQuestion?.(item.id)} secondary={<ListeningListAudioButton item={item} labels={labels} token={token} displayNumber={item.libraryNumber ?? questions.length - questions.indexOf(item)}/>}/>}/> : null}
    </section>
  );
}

function ListeningListAudioButton({ item, labels, token, displayNumber }: { item: ListeningQuestion; labels: Record<string, string>; token: string; displayNumber: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const objectUrlRef = useRef('');
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => {
    audioRef.current?.pause();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  async function togglePlayback() {
    setError('');
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }
    setLoading(true);
    try {
      if (!audioRef.current) {
        const response = await fetch(`/api/listening-questions/${item.id}/audio`, { headers: { authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error(labels.listeningPlayError);
        objectUrlRef.current = URL.createObjectURL(await response.blob());
        audioRef.current = new Audio(objectUrlRef.current);
        audioRef.current.addEventListener('ended', () => setPlaying(false));
        audioRef.current.addEventListener('pause', () => setPlaying(false));
      }
      await audioRef.current.play();
      setPlaying(true);
    } catch {
      setError(labels.listeningPlayError);
    } finally {
      setLoading(false);
    }
  }

  const label = loading ? labels.listeningAudioLoading : playing ? labels.listeningPauseAudio : labels.listeningPlayAudio;
  return (
    <button type="button" onClick={togglePlayback} disabled={loading} aria-label={`${label}: ${labels.listeningDatabaseNumber} ${displayNumber}`} title={error || label} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#dce7df] bg-[#edf7f1] px-5 text-[#245e4b] hover:bg-[#e0f0e7] disabled:cursor-wait disabled:opacity-60">
      {loading ? <LoaderCircle className="animate-spin" size={16} /> : playing ? <Pause size={16} fill="currentColor" /> : <Play className="ml-0.5" size={16} fill="currentColor" />}<span className="sr-only">{label}</span>
    </button>
  );
}

function ListeningPracticePanel({ labels, locale, token, questions, onOpenLibrary }: { labels: Record<string, string>; locale: Locale; token: string; questions: ListeningQuestion[]; onOpenLibrary?: () => void }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeQuestion = questions[activeIndex % Math.max(questions.length, 1)];

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(questions.length - 1, 0)));
  }, [questions.length]);

  if (!questions.length || !activeQuestion) {
    return (
      <section className="cute-practice-card mobile-page-surface min-w-0 border p-5 md:p-6">
        <h2 className="text-2xl font-black text-[#3d3036]">{labels.listeningPracticeTitle}</h2>
        <p className="mt-3 text-sm leading-6 text-[#74646b]">{labels.listeningPracticeEmpty}</p>
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
        <p className="text-sm font-bold text-[#a84269]">{labels.listeningPracticeTitle}</p>
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
      <ListeningPracticeQuestion item={activeQuestion} labels={labels} token={token} locale={locale} />
    </section>
  );
}

function ListeningPracticeQuestion({ item, labels, token, locale }: { item: ListeningQuestion; labels: Record<string, string>; token: string; locale: Locale }) {
  const [audioUrl, setAudioUrl] = useState('');
  const [audioError, setAudioError] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answerNotice, setAnswerNotice] = useState('');

  useEffect(() => {
    setSelected(null);
    setRevealed(false);
    setAnswerNotice('');
  }, [item.id]);

  useEffect(() => {
    let disposed = false;
    let objectUrl = '';
    setAudioUrl('');
    setAudioError('');
    fetch(`/api/listening-questions/${item.id}/audio`, { headers: { authorization: `Bearer ${token}` } })
      .then((response) => {
        if (!response.ok) throw new Error(labels.listeningPlayError);
        return response.blob();
      })
      .then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
      })
      .catch(() => { if (!disposed) setAudioError(labels.listeningPlayError); });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.id, labels.listeningPlayError, token]);

  return (
    <div className="p-4 md:p-6">
      <div className="min-w-0">
        <h2 className="break-words text-2xl font-black text-[#3d3036]">{item.title}</h2>
        <p className="mt-1 text-xs text-[#8f6f7b]">{listeningQuestionTypeName(item.questionTypeId)} · {item.audioFileName} · {formatFileSize(item.audioSize, locale)}</p>
      </div>
      <div className="mt-5">
        {audioUrl ? <AudioPlayer src={audioUrl} labels={labels} /> : <p className="text-sm text-[#74646b]">{audioError || 'Loading audio...'}</p>}
      </div>
      {hasDistinctListeningQuestion(item) ? <p className="mt-6 whitespace-pre-wrap text-lg font-bold leading-8 text-[#3d3036]">{item.question}</p> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {item.choices.map((choice, index) => {
          const resultClass = revealed
            ? index === item.answerIndex ? 'border-[#65a37c] bg-[#f0fff5]' : selected === index ? 'border-[#d95f8a] bg-[#fff0f5]' : 'border-[#f0d4dd] bg-white'
            : selected === index ? 'border-[#d95f8a] bg-[#fff0f5]' : 'border-[#f0d4dd] bg-white hover:bg-[#fff7fb]';
          return (
            <button key={index} type="button" onClick={() => { setSelected(index); setRevealed(false); setAnswerNotice(''); }} className={`cute-choice flex min-h-14 items-center gap-3 border px-4 py-3 text-left text-base font-bold ${resultClass}`}>
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs">{index + 1}</span>
              <span className="min-w-0 break-words">{choice}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#f0d4dd] pt-4">
        <button type="button" onClick={() => selected === null ? setAnswerNotice(labels.listeningSelectAnswer) : setRevealed(true)} className="cute-button-primary h-10 rounded-full px-4 text-sm font-bold text-white">
          {labels.listeningShowAnswer}
        </button>
        {answerNotice ? <p role="status" className="text-sm font-bold text-[#8a6134]">{answerNotice}</p> : null}
        {revealed && selected !== null ? <p role="status" className={`text-sm font-bold ${selected === item.answerIndex ? 'text-[#356146]' : 'text-[#a84269]'}`}>{selected === item.answerIndex ? labels.listeningCorrect : labels.listeningWrong}</p> : null}
      </div>
      {revealed && item.explanation ? <p className="cute-answer-note mt-4 whitespace-pre-wrap border border-[#f0d4dd] bg-[#fff7fb] p-3 text-sm leading-6 text-[#4f5b55]">{item.explanation}</p> : null}
    </div>
  );
}

function ListeningQuestionItem({ item, labels, locale, token, onDelete, detail = false }: { item: ListeningQuestion; labels: Record<string, string>; locale: Locale; token: string; onDelete: (id: string) => Promise<void>; detail?: boolean }) {
  const [audioUrl, setAudioUrl] = useState('');
  const [audioError, setAudioError] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answerNotice, setAnswerNotice] = useState('');
  const confirm = useConfirmation();
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let disposed = false;
    let objectUrl = '';
    fetch(`/api/listening-questions/${item.id}/audio`, { headers: { authorization: `Bearer ${token}` } })
      .then((response) => {
        if (!response.ok) throw new Error(labels.listeningPlayError);
        return response.blob();
      })
      .then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
      })
      .catch(() => { if (!disposed) setAudioError(labels.listeningPlayError); });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.id, labels.listeningPlayError, token]);

  async function remove() {
    if (!(await confirm({ title: labels.listeningDelete, description: labels.listeningDeleteConfirm, confirmLabel: labels.listeningDelete, cancelLabel: labels.cancelAction, danger: true }))) return;
    setDeleting(true);
    try {
      await onDelete(item.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <article className={`min-w-0 bg-white p-4 md:p-6 ${detail ? '' : 'rounded-md border border-[#d8e0d7]'}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-semibold text-[#27312c]">{item.title}</h3>
          <p className="mt-1 text-xs text-[#778079]">{listeningQuestionTypeName(item.questionTypeId)} · {item.audioFileName} · {formatFileSize(item.audioSize, locale)} · {formatDateTime(item.createdAt, locale)}</p>
        </div>
        <div className="flex shrink-0 justify-end gap-1">
          <QuestionAction label={`${labels.listeningDelete}: ${item.title}`} title={labels.listeningDelete} onClick={remove} disabled={deleting}><Trash2 size={16} /></QuestionAction>
        </div>
      </div>
      <div className="mt-4">
        {audioUrl ? <AudioPlayer src={audioUrl} labels={labels} /> : <p className="text-sm text-[#68716b]">{audioError || 'Loading audio...'}</p>}
      </div>
      {detail ? <ListeningRecordingAnalysisPanel item={item} labels={labels} locale={locale} token={token} /> : null}
      {hasDistinctListeningQuestion(item) ? <p className="mt-5 whitespace-pre-wrap text-base font-semibold leading-7">{item.question}</p> : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {item.choices.map((choice, index) => {
          const resultClass = revealed
            ? index === item.answerIndex ? 'border-[#6f947c] bg-[#edf5ee]' : selected === index ? 'border-[#c9907d] bg-[#fbf1ed]' : 'border-[#d8e0d7] bg-white'
            : selected === index ? 'border-[#31564c] bg-[#edf3ef]' : 'border-[#d8e0d7] bg-white';
          return (
            <label key={index} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm ${resultClass}`}>
              <input type="radio" name={`listening-${item.id}`} checked={selected === index} onChange={() => { setSelected(index); setRevealed(false); setAnswerNotice(''); }} />
              <span>{index + 1}. {choice}</span>
            </label>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => selected === null ? setAnswerNotice(labels.listeningSelectAnswer) : setRevealed(true)} className="h-10 rounded-md bg-[#31564c] px-4 text-sm font-semibold text-white">{labels.listeningShowAnswer}</button>
        {answerNotice ? <p role="status" className="text-sm font-semibold text-[#8a6134]">{answerNotice}</p> : null}
        {revealed && selected !== null ? <p role="status" className={`text-sm font-semibold ${selected === item.answerIndex ? 'text-[#356146]' : 'text-[#8a493c]'}`}>{selected === item.answerIndex ? labels.listeningCorrect : labels.listeningWrong}</p> : null}
      </div>
      {revealed && item.explanation ? <p className="mt-4 whitespace-pre-wrap rounded-md bg-[#f5f7f3] p-3 text-sm leading-6 text-[#4f5b55]">{item.explanation}</p> : null}
    </article>
  );
}

function ListeningRecordingAnalysisPanel({ item, labels, locale, token }: { item: ListeningQuestion; labels: Record<string, string>; locale: Locale; token: string }) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const [recordings, setRecordings] = useState<ListeningRecording[]>([]);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const latest = recordings[0];

  useEffect(() => {
    let disposed = false;
    async function load() {
      try {
        const response = await apiRequest<{ recordings: ListeningRecording[] }>(`/api/listening-questions/${item.id}/recordings`, { token });
        if (!disposed) setRecordings(response.recordings ?? []);
      } catch {
        if (!disposed) setRecordings([]);
      }
    }
    void load();
    const interval = window.setInterval(load, 5000);
    return () => { disposed = true; window.clearInterval(interval); };
  }, [item.id, token]);

  useEffect(() => {
    if (!recordingBlob) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(recordingBlob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [recordingBlob]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function startRecording() {
    setNotice('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setNotice(labels.listeningRecordingUnsupported);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((mime) => MediaRecorder.isTypeSupported(mime));
      const recorder = preferredMime ? new MediaRecorder(stream, { mimeType: preferredMime }) : new MediaRecorder(stream);
      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      setRecordingBlob(null);
      setSeconds(0);
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || preferredMime || 'audio/webm' });
        if (blob.size) setRecordingBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      recorder.start(250);
      setRecording(true);
      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250);
    } catch {
      setNotice(labels.listeningRecordingPermissionError);
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setRecording(false);
  }

  async function submitRecording() {
    if (!recordingBlob || submitting) return;
    setSubmitting(true);
    setNotice('');
    try {
      const response = await apiRequest<{ recording: ListeningRecording; agentMessage: string }>(`/api/listening-questions/${item.id}/recordings`, {
        method: 'POST',
        token,
        body: { audioMime: recordingBlob.type || 'audio/webm', audioBase64: await blobToBase64(recordingBlob) },
      });
      setRecordings((current) => [response.recording, ...current.filter((entry) => entry.id !== response.recording.id)]);
      setRecordingBlob(null);
      setNotice(labels.listeningRecordingQueued);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : labels.listeningRecordingSubmitError);
    } finally {
      setSubmitting(false);
    }
  }

  const statusLabel = latest?.status === 'completed'
    ? labels.listeningRecordingStatusCompleted
    : latest?.status === 'analyzing'
      ? labels.listeningRecordingStatusAnalyzing
      : latest?.status === 'failed'
        ? labels.listeningRecordingStatusFailed
        : labels.listeningRecordingStatusPending;

  return (
    <section className="mt-5 rounded-xl border border-[#ead1dc] bg-[#fffafd] p-4" aria-labelledby={`recording-title-${item.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 id={`recording-title-${item.id}`} className="flex items-center gap-2 text-base font-black text-[#3d3036]"><Mic size={18} />{labels.listeningRecordingTitle}</h4>
          <p className="mt-1 text-sm leading-6 text-[#74646b]">{labels.listeningRecordingBody}</p>
        </div>
        {latest ? <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-bold text-[#8f365b]"><Clock3 size={14} />{statusLabel}</span> : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {recording ? (
          <button type="button" onClick={stopRecording} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#a84269] px-4 text-sm font-bold text-white"><Square size={15} fill="currentColor" />{labels.listeningRecordingStop}</button>
        ) : (
          <button type="button" onClick={startRecording} disabled={submitting} className="cute-button-primary inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold text-white disabled:opacity-50"><Mic size={16} />{labels.listeningRecordingStart}</button>
        )}
        {recording ? <span className="font-mono text-sm font-bold tabular-nums text-[#a84269]">{formatDuration(seconds)}</span> : null}
      </div>

      {previewUrl ? (
        <div className="mt-4 grid gap-3 rounded-lg border border-[#f0d4dd] bg-white p-3">
          <audio controls preload="metadata" src={previewUrl} className="cute-audio-player w-full" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setRecordingBlob(null); setNotice(''); }} disabled={submitting} className="cute-button-secondary inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-bold"><RotateCcw size={15} />{labels.listeningRecordingAgain}</button>
            <button type="button" onClick={submitRecording} disabled={submitting} className="cute-button-primary inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60">{submitting ? <LoaderCircle className="animate-spin" size={15} /> : <Sparkles size={15} />}{submitting ? labels.listeningRecordingSubmitting : labels.listeningRecordingSubmit}</button>
          </div>
        </div>
      ) : null}

      {notice ? <p role="status" className="mt-3 text-sm font-bold text-[#8f365b]">{notice}</p> : null}

      {latest?.status === 'completed' && latest.analysis ? (
        <div className="mt-4 grid gap-3 border-t border-[#f0d4dd] pt-4">
          <div className="flex items-center gap-2 text-sm font-black text-[#356146]"><CheckCircle2 size={17} />{labels.listeningRecordingAnalysisTitle}</div>
          <p className="text-sm leading-6 text-[#46514c]">{latest.analysis.summary}</p>
          {latest.analysis.strengths.length ? <FeedbackList title={labels.listeningRecordingStrengths} items={latest.analysis.strengths} tone="good" /> : null}
          {latest.analysis.improvements.length ? <FeedbackList title={labels.listeningRecordingImprovements} items={latest.analysis.improvements} tone="improve" /> : null}
          <div className="rounded-lg bg-[#f3f6f1] p-3"><p className="text-xs font-black text-[#356146]">{labels.listeningRecordingNextPractice}</p><p className="mt-1 text-sm leading-6 text-[#46514c]">{latest.analysis.nextPractice}</p></div>
          <p className="text-xs text-[#8f6f7b]">{formatDateTime(latest.updatedAt, locale)}</p>
        </div>
      ) : latest ? <p className="mt-4 border-t border-[#f0d4dd] pt-3 text-sm leading-6 text-[#74646b]">{latest.status === 'failed' ? labels.listeningRecordingFailedBody : labels.listeningRecordingWaitingBody}</p> : null}
    </section>
  );
}

function FeedbackList({ title, items, tone }: { title: string; items: string[]; tone: 'good' | 'improve' }) {
  return (
    <div className={`rounded-lg p-3 ${tone === 'good' ? 'bg-[#f0f8f2]' : 'bg-[#fff5e9]'}`}>
      <p className={`text-xs font-black ${tone === 'good' ? 'text-[#356146]' : 'text-[#8a6134]'}`}>{title}</p>
      <ul className="mt-2 grid gap-1 text-sm leading-6 text-[#46514c]">{items.map((entry, index) => <li key={`${entry}-${index}`}>• {entry}</li>)}</ul>
    </div>
  );
}


function QuestionAction({ label, title, children, onClick, disabled }: { label: string; title: string; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={title} onClick={onClick} disabled={disabled} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#ead1dc] bg-white text-[#a84269] hover:bg-[#fff0f5] disabled:cursor-wait disabled:opacity-50">
      {children}
    </button>
  );
}

const AUDIO_PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

function UploadedAudioPreview({ file, labels }: { file: File; labels: Record<string, string> }) {
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!previewUrl) return null;

  return (
    <section className="rounded-xl border border-[#ead1dc] bg-[#fff7fb] p-3" aria-label={labels.listeningPreview}>
      <p className="mb-2 text-sm font-bold text-[#46514c]">{labels.listeningPreview}</p>
      <AudioPlayer src={previewUrl} labels={labels} />
    </section>
  );
}

function AudioPlayer({ src, labels }: { src: string; labels: Record<string, string> }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playbackRate, setPlaybackRate] = useState(1);

  function updatePlaybackRate(rate: number) {
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        src={src}
        onLoadedMetadata={() => updatePlaybackRate(playbackRate)}
        className="cute-audio-player w-full"
      />
      <label className="flex items-center gap-2 text-sm font-semibold text-[#46514c]">
        <span className="whitespace-nowrap">{labels.listeningPlaybackRate}</span>
        <select
          value={playbackRate}
          onChange={(event) => updatePlaybackRate(Number(event.target.value))}
          aria-label={labels.listeningPlaybackRate}
          className="h-10 rounded-md border border-[#d8bdc8] bg-white px-2 font-bold text-[#8f365b]"
        >
          {AUDIO_PLAYBACK_RATES.map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
        </select>
      </label>
    </div>
  );
}

function fileToBase64(file: File) {
  return blobToBase64(file);
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? '').split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Failed to read audio file'));
    reader.readAsDataURL(blob);
  });
}

function audioMimeFromName(name: string) {
  const extension = name.toLowerCase().split('.').pop();
  return ({ mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm', aac: 'audio/aac', flac: 'audio/flac' } as Record<string, string>)[extension ?? ''] ?? 'audio/mpeg';
}

function listeningQuestionTypeName(id: string | undefined) {
  return listeningQuestionTypes.find((type) => type.id === id)?.label ?? listeningQuestionTypes[0]?.label ?? '';
}

function hasDistinctListeningQuestion(item: ListeningQuestion) {
  const normalize = (value: string) => value.trim().replace(/\s+/gu, ' ');
  return normalize(item.question) !== normalize(item.title);
}

function formatFileSize(bytes: number, locale: Locale) {
  const unit = bytes >= 1024 * 1024 ? 'megabyte' : 'kilobyte';
  const divisor = bytes >= 1024 * 1024 ? 1024 * 1024 : 1024;
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: 1 }).format(bytes / divisor);
}

function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
