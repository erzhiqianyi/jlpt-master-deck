import { RecordReference } from '../../components/RecordReference';
import './listening.css';
import { listeningShareCopy, requestListeningShare } from './listeningShare';
import { listeningAudioGroupForRoute, listeningAudioRouteId, listeningPracticeKey } from '../../domain/listeningPractice';
import { listeningEditorContent, splitListeningExplanation } from '../../domain/listeningExplanation';
import { colorReadAlongTokens, listeningTranscriptForPractice, mergeReadAlongClips, splitReadAlongLines } from '../../domain/listeningReadAlong';
import { clearListeningClipDrafts, loadListeningClipDrafts, saveListeningClipDraft } from '../../domain/listeningClipDrafts';
import { formatListDate } from '../../components/LearningListMetadata';
import { LearningCatalog } from '../../components/LearningCatalog';
import { ModuleActionBar } from '../../components/ModuleActionBar';
import { LearningList, LearningListRow, LearningListSelect } from '../../components/LearningList';
import { useMobileList } from '../../hooks/useMobileList';
import { useConfirmation } from '../../components/confirmation';
import { CheckCircle2, ChevronLeft, ChevronRight, Clipboard, Lightbulb, LoaderCircle, Mic, Pause, Pencil, Play, Plus, RotateCcw, ScrollText, Share2, Sparkles, Square, Trash2, X } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { officialN1QuestionTypes } from '../../data/questionTypes';
import { apiRequest } from '../../lib/api';
import type { ListeningQuestion, ListeningQuestionInput, ListeningRecording, Locale, ProgressState } from '../../types';

const LISTENING_LIBRARY_PAGE_SIZE = 8;
const byLibraryNumber = (a: ListeningQuestion, b: ListeningQuestion) =>
  (a.libraryNumber ?? Number.MAX_SAFE_INTEGER) - (b.libraryNumber ?? Number.MAX_SAFE_INTEGER)
  || a.createdAt.localeCompare(b.createdAt)
  || a.id.localeCompare(b.id);
const listeningQuestionTypes = [
  ...officialN1QuestionTypes.filter((type) => type.section === 'listening').map((type) => ({ id: type.id, label: type.officialName })),
  { id: 'listening-basic-training', label: '基础训练' },
];
const defaultListeningQuestionTypeId = listeningQuestionTypes[0]?.id ?? 'listening-task';
const listeningTypeGuidance: Record<string, { prompt: string; choiceCount: number; freeResponse?: boolean; choicesOptional?: boolean }> = {
  'listening-task': { prompt: 'この問題では、まず質問を聞いてください。それから話を聞いて、問題用紙の1から4の中から、最もよいものを一つ選んでください。', choiceCount: 4 },
  'listening-points': { prompt: 'この問題では、まず質問を聞いてください。そのあと、問題用紙の選択肢を読んでください。読む時間があります。それから話を聞いて、問題用紙の1から4の中から、最もよいものを一つ選んでください。', choiceCount: 4 },
  'listening-outline': { prompt: 'この問題は、全体としてどんな内容かを聞く問題です。話の前に質問はありません。まず話を聞いてください。それから、質問と選択肢を聞いて、1から4の中から、最もよいものを一つ選んでください。', choiceCount: 4, choicesOptional: true },
  'listening-quick': { prompt: 'まず文を聞いてください。それから、それに対する返事を聞いて、1から3の中から、最もよいものを一つ選んでください。', choiceCount: 3, choicesOptional: true },
  // 統合理解 has two source formats: numbered answers only, or four
  // transcribed choice texts. Both still require selecting 1-4.
  'listening-integrated': { prompt: 'まず話を聞いてください。それから、質問と選択肢を聞いて、1から4の中から、最もよいものを一つ選んでください。二つの質問がある場合は、それぞれ答えてください。', choiceCount: 4, choicesOptional: true },
  'listening-basic-training': { prompt: 'まず音声を聞いてください。それから、質問と選択肢を聞いて、最もよいものを一つ選んでください。', choiceCount: 4, choicesOptional: true },
};

type RecordPractice = (item: ListeningQuestion) => Promise<void>;

type ListeningPanelProps = {
  mode: 'practice' | 'library';
  labels: Record<string, string>;
  locale: Locale;
  token: string;
  questions: ListeningQuestion[];
  progress?: ProgressState;
  onRecordPractice?: (item: ListeningQuestion, sessionId: string) => Promise<void>;
  onCreate: (input: ListeningQuestionInput) => Promise<void>;
  onUpdate: (id: string, patch: Partial<ListeningQuestion>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpenLibrary?: () => void;
  onPractice?: () => void;
  onAsk?: (question: string) => Promise<void>;
  onTips?: () => void;
  onReview?: () => void;
  activeQuestionId?: string;
  onOpenQuestion?: (id: string) => void;
  onBackToLibrary?: () => void;
};

type ListeningDraft = { existingQuestionId?: string; title: string; questionTypeId: string; question: string; choices: string[]; choiceDetails: { translation: string; explanation: string }[]; answerIndex: number; explanation: string };
type ListeningAudioGroup = { key: string; representative: ListeningQuestion; questions: ListeningQuestion[] };
const sameListeningHeading = (a: ListeningQuestion | undefined, b: ListeningQuestion | undefined) =>
  Boolean(a && b && a.questionTypeId === b.questionTypeId && a.title.trim() === b.title.trim());

export function ListeningPanel({ mode, labels, locale, token, questions, progress = {}, onRecordPractice, onCreate, onUpdate, onDelete, onOpenLibrary, onPractice, onAsk, onTips, onReview, activeQuestionId, onOpenQuestion, onBackToLibrary }: ListeningPanelProps) {
  const sessionId = useMemo(() => crypto.randomUUID(), [mode, activeQuestionId]);
  const [readAlongOpen, setReadAlongOpen] = useState(false);
  const [mobileQuestionIndex, setMobileQuestionIndex] = useState(0);
  useEffect(() => { setReadAlongOpen(false); }, [activeQuestionId]);
  useEffect(() => { setMobileQuestionIndex(0); }, [activeQuestionId]);
  const recordPractice: RecordPractice = async (item) => { await onRecordPractice?.(item, sessionId); };
  const [title, setTitle] = useState('');
  const [questionTypeId, setQuestionTypeId] = useState(defaultListeningQuestionTypeId);
  const [question, setQuestion] = useState(listeningTypeGuidance[defaultListeningQuestionTypeId]?.prompt ?? '');
  const [choices, setChoices] = useState(['', '', '', '']);
  const [choiceDetails, setChoiceDetails] = useState(() => emptyListeningChoiceDetails(4));
  const [answerIndex, setAnswerIndex] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [transcript, setTranscript] = useState('');
  const [transcriptTranslation, setTranscriptTranslation] = useState('');
  const [queuedDrafts, setQueuedDrafts] = useState<ListeningDraft[]>([]);
  const [activeDraftIndex, setActiveDraftIndex] = useState<number | null>(null);
  const [matchingAudio, setMatchingAudio] = useState(false);
  const audioSelection = useRef(0);
  const tailDraft = useRef<ListeningDraft | null>(null);
  const typeGuidance = listeningTypeGuidance[questionTypeId] ?? listeningTypeGuidance['listening-task'];
  const isBlankBasicTraining = questionTypeId === 'listening-basic-training' && choices.every((choice) => !choice.trim());
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
 const [showAiForm, setShowAiForm] = useState(false);
  useAuthoringNavigation(mode === 'library' && !activeQuestionId ? (showForm ? '添加听力题' : showAiForm ? labels.aiGenerateFromLink : null) : null, () => { setShowForm(false); setShowAiForm(false); });
  // The library is always visible; the action bar above it replaces the old entry hub.
  const showLibrary = !showForm && !showAiForm;
  const [sourceUrl, setSourceUrl] = useState('');
  const [questionCount, setQuestionCount] = useState(3);
  const [pageIndex, setPageIndex] = useState(0);
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');
  const mobileList = useMobileList(questions.length, 'library');
  const pageCount = Math.max(1, Math.ceil(questions.length / LISTENING_LIBRARY_PAGE_SIZE));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const pageStart = currentPage * LISTENING_LIBRARY_PAGE_SIZE;
  const pageItems = questions.slice(mobileList.mobile ? 0 : pageStart, mobileList.mobile ? mobileList.visible : pageStart + LISTENING_LIBRARY_PAGE_SIZE);
  const pageEnd = pageStart + pageItems.length;
  const visibleQuestions = useMemo(() => {
    const filtered = typeFilter === 'all' ? questions : questions.filter((item) => item.questionTypeId === typeFilter);
    return [...filtered].sort((a, b) => sortOrder === 'oldest'
      ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [questions, sortOrder, typeFilter]);
  const audioGroups = useMemo<ListeningAudioGroup[]>(() => {
    const groups = new Map<string, ListeningQuestion[]>();
    for (const item of visibleQuestions) {
      const key = item.audioAssetId ?? `${item.audioFileName}|${item.audioSize}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()].map(([key, grouped]) => {
      const ordered = [...grouped].sort(byLibraryNumber);
      return { key, representative: ordered[0], questions: ordered };
    });
  }, [visibleQuestions]);

  useEffect(() => {
    setPageIndex((index) => Math.min(index, pageCount - 1));
  }, [pageCount]);

  if (mode === 'practice') {
    return <ListeningPracticePanel onRecordPractice={recordPractice} labels={labels} locale={locale} token={token} questions={questions} onOpenLibrary={onOpenLibrary} />;
  }

  const activeGroup = activeQuestionId ? listeningAudioGroupForRoute(questions, activeQuestionId) : [];
  const activeLibraryQuestion = activeGroup[0];
  if (activeLibraryQuestion) {
    if (readAlongOpen) return <ListeningReadAlongWorkspace key={activeLibraryQuestion.audioAssetId ?? activeLibraryQuestion.id} item={activeLibraryQuestion} labels={labels} locale={locale} token={token} onBack={() => setReadAlongOpen(false)} />;
    return (
      <section className="listening-workspace cute-practice-card min-w-0 overflow-hidden border">
        <div className="flex items-center gap-3 border-b border-[#f0d4dd] px-4 py-3 md:px-6">
          <button type="button" onClick={onBackToLibrary} aria-label={labels.listeningBackToList} title={labels.listeningBackToList} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#ead1dc] bg-white text-[#a84269] hover:bg-[#fff0f5]">
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black text-[#3d3036]"><span className="md:hidden">{activeLibraryQuestion.audioReference || labels.listeningPracticeTitle} · {activeGroup.length} {locale === 'ja' ? '問' : locale === 'en' ? 'questions' : '题'}</span><span className="hidden md:inline">{activeLibraryQuestion.audioReference ? `${activeLibraryQuestion.audioReference} · ` : ''}{activeLibraryQuestion.audioFileName}</span></h2>
          </div>
          <ListeningShareButton key={activeLibraryQuestion.id} item={activeLibraryQuestion} token={token} locale={locale} questionCount={activeLibraryQuestion.audioAssetId ? activeGroup.length : 1} />
        </div>
        <div className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_minmax(440px,42%)]">
        <ListeningQuestionGroup key={activeGroup[0].audioAssetId ?? activeGroup[0].id} questions={activeGroup} recordPractice={recordPractice} labels={labels} locale={locale} onUpdate={onUpdate} onDelete={onDelete} mobile={mobileList.mobile} mobileIndex={mobileQuestionIndex} onMobileIndexChange={setMobileQuestionIndex} />
        <aside className="order-first min-w-0 border-b border-[#f0d4dd] bg-[#fffafd] p-4 md:p-5 xl:order-last xl:border-b-0 xl:border-l" aria-label={locale === 'ja' ? '音声と問題ナビゲーション' : locale === 'en' ? 'Audio and question navigation' : '音频与题目导航'}>
          <div className="xl:sticky xl:top-5 xl:max-h-[calc(100vh-2.5rem)] xl:overflow-y-auto">
            <ListeningQuestionNavigation questions={activeGroup} locale={locale} mobile={mobileList.mobile} mobileIndex={mobileQuestionIndex} onMobileIndexChange={setMobileQuestionIndex} />
            <ListeningAudioTools item={activeGroup[0]} labels={labels} locale={locale} token={token} onOpenReadAlong={() => setReadAlongOpen(true)} />
          </div>
        </aside>
        </div>
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
      const audioBase64 = await fileToBase64(audioFile);
      const currentDraft = { title, questionTypeId, question, choices, choiceDetails, answerIndex, explanation };
      const drafts = activeDraftIndex === null ? [...queuedDrafts, currentDraft] : queuedDrafts.map((draft, index) => index === activeDraftIndex ? { ...draft, ...currentDraft } : draft);
      for (const draft of drafts) {
        const isBlankBasicTraining = draft.questionTypeId === 'listening-basic-training' && draft.choices.every((choice) => !choice.trim());
        const normalizedAnswerIndex = isBlankBasicTraining ? -1 : draft.questionTypeId === 'listening-outline' && draft.answerIndex < 0 ? 0 : draft.answerIndex;
        await onCreate({ ...draft, answerIndex: normalizedAnswerIndex, transcript, transcriptTranslation, audioFileName: audioFile.name, audioMime: audioFile.type || audioMimeFromName(audioFile.name), audioBase64 });
      }
      setTitle('');
      setQuestionTypeId(defaultListeningQuestionTypeId);
      setQuestion(listeningTypeGuidance[defaultListeningQuestionTypeId]?.prompt ?? '');
      setChoices(['', '', '', '']);
      setChoiceDetails(emptyListeningChoiceDetails(4));
      setAnswerIndex(0);
      setExplanation('');
      setTranscript('');
      setTranscriptTranslation('');
      setQueuedDrafts([]);
      setActiveDraftIndex(null);
      setShowForm(false);
      setAudioFile(null);
      setFileInputKey((value) => value + 1);
      setMessage(`已保存 ${queuedDrafts.length + 1} 道听力题。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save listening question');
    } finally {
      setSubmitting(false);
    }
  }

  function addDraft() {
    const draft = { ...(activeDraftIndex === null ? {} : queuedDrafts[activeDraftIndex]), title, questionTypeId, question, choices, choiceDetails, answerIndex, explanation };
    setQueuedDrafts((current) => activeDraftIndex === null ? [...current, draft] : current.map((item, index) => index === activeDraftIndex ? draft : item));
    setActiveDraftIndex(null);
    setTitle('');
    setQuestionTypeId(defaultListeningQuestionTypeId);
    setQuestion(listeningTypeGuidance[defaultListeningQuestionTypeId]?.prompt ?? '');
    setChoices(['', '', '', '']);
    setChoiceDetails(emptyListeningChoiceDetails(4));
    setAnswerIndex(0);
    setExplanation('');
  }

  function loadDraft(draft: ListeningDraft) {
    setTitle(draft.title);
    setQuestionTypeId(draft.questionTypeId);
    setQuestion(draft.question);
    setChoices(draft.choices);
    setAnswerIndex(draft.answerIndex);
    setExplanation(draft.explanation);
    setChoiceDetails(resizeListeningChoiceDetails(draft.choiceDetails ?? [], draft.choices.length));
  }

  function openDraft(index: number) {
    const current = { title, questionTypeId, question, choices, choiceDetails, answerIndex, explanation };
    if (activeDraftIndex === null) tailDraft.current = current;
    else setQueuedDrafts((items) => items.map((item, i) => i === activeDraftIndex ? { ...item, ...current } : item));
    const draft = queuedDrafts[index] ?? tailDraft.current;
    if (!draft) return;
    loadDraft(draft);
    setActiveDraftIndex(index < queuedDrafts.length ? index : null);
  }

  async function selectAudio(file: File | null) {
    const selection = ++audioSelection.current;
    setAudioFile(file);
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { setMessage(labels.listeningFileTooLarge); return; }
    setMatchingAudio(true);
    setMessage('正在检查已有音频…');
    try {
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const result = await apiRequest<{ questions: ListeningQuestion[] }>(`/api/listening-audio-match?sha256=${hash}`, { token });
      if (selection !== audioSelection.current) return;
      const drafts = result.questions.map((item) => ({ ...item, choiceDetails: resizeListeningChoiceDetails(item.choiceDetails ?? [], item.choices.length), existingQuestionId: item.id }));
      if (drafts.length) {
        setQueuedDrafts(drafts);
        setActiveDraftIndex(0);
        loadDraft(drafts[0]);
        setTranscript(drafts[0].transcript ?? '');
        setTranscriptTranslation(drafts[0].transcriptTranslation ?? '');
        tailDraft.current = null;
        setMessage(`已加载同一音频的 ${drafts.length} 道题，保存时更新原题。`);
      } else {
        setTranscript('');
        setTranscriptTranslation('');
        setMessage('这是新音频，可以添加题目。');
      }
    } catch (error) {
      if (selection === audioSelection.current) setMessage(error instanceof Error ? error.message : '音频检查失败');
    } finally {
      if (selection === audioSelection.current) setMatchingAudio(false);
    }
  }

  async function copyAgentPrompt() {
    const url = sourceUrl.trim();
    if (!url) {
      setMessage(labels.aiSourceUrlRequired);
      return;
    }
    const prompt = [
      '请使用 JLPT Master Deck 本地 MCP / 本地后台，为当前账号生成听力题库。',
      `素材链接：${url}`,
      `题目数量：${questionCount}`,
      '要求：读取或转写音频内容，生成 JLPT N1 风格听力题。提供共享音频的完整日文原文和中文翻译；每道题的每个选项都填写中文翻译和具体解析（正确项说明依据，错误项说明错因），并保留整体解析作为补充。',
      '保存：生成后写入本应用的听力题库，完成后告诉我生成了哪些题。',
    ].join('\n');
    await navigator.clipboard.writeText(prompt);
    setMessage(labels.aiPromptCopied);
  }

  return (
    <section className="listening-workspace ledger-word-index ledger-module-page min-w-0">
      {showForm ? <div className="sticky top-0 z-20 flex flex-wrap items-center justify-end gap-3 border-b border-[#dce9df] bg-white px-4 py-4 md:px-6">
        <div className="flex items-center gap-2">
          <button type="button" onClick={addDraft} disabled={submitting || matchingAudio || !audioFile} className="h-10 rounded-md border border-[#31564c] bg-white px-4 text-sm font-bold text-[#31564c] disabled:opacity-50">添加下一题</button>
          <button type="submit" form="listening-authoring-form" disabled={submitting || matchingAudio || !audioFile} className="h-10 rounded-md bg-[#31564c] px-4 text-sm font-bold text-white disabled:opacity-50">{submitting ? labels.listeningSubmitting : '保存并完成添加'}</button>
        </div>
      </div> : <ModuleActionBar
        locale={locale}
        label="听力"
        primary={onPractice ? { label: '开始练习', hint: '按题库顺序练一轮', onClick: () => { const group = audioGroups[Math.floor(Math.random() * audioGroups.length)]; if (group) onOpenQuestion?.(listeningAudioRouteId(group.representative)); } } : undefined}
        onAsk={onAsk}
        contentActions={audioGroups.map((group) => ({ key: group.key, label: group.representative.title, onClick: () => onOpenQuestion?.(listeningAudioRouteId(group.representative)) }))}
        actions={[
          ...(onTips ? [{ key: 'tips', label: '学习方法', icon: <Lightbulb size={16} aria-hidden="true" />, onClick: onTips }] : []),
          ...(onReview ? [{ key: 'review', label: labels.reviewPage, icon: <ScrollText size={16} aria-hidden="true" />, onClick: onReview }] : []),
          { key: 'ai', label: labels.aiGenerateFromLink, icon: <Sparkles size={16} aria-hidden="true" />, active: showAiForm, onClick: () => { setShowAiForm((value) => !value); setMessage(''); } },
          { key: 'add', label: labels.listeningUploadTitle, icon: <Plus size={16} aria-hidden="true" />, active: false, onClick: () => { setShowForm(true); setShowAiForm(false); setMessage(''); } },
        ]}
      />}

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
        <form id="listening-authoring-form" className="border-b border-[#f0d4dd] bg-white/70 px-4 py-5 md:px-6" onSubmit={submit}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
            <div className="grid content-start gap-4">
              <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-black text-[#3d3036]">题目 {activeDraftIndex === null ? queuedDrafts.length + 1 : activeDraftIndex + 1}</h2><span className="text-sm text-[#68716b]">编辑题目内容</span></div>



          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-semibold text-[#46514c]">
              {labels.questionType}
              <select value={questionTypeId} onChange={(event) => { const next = event.target.value; const nextGuidance = listeningTypeGuidance[next] ?? listeningTypeGuidance['listening-task']; const nextChoices = nextGuidance.freeResponse ? ['', '', '', ''] : Array.from({ length: nextGuidance.choiceCount }, (_, index) => choices[index] ?? ''); setQuestionTypeId(next); setQuestion(nextGuidance.prompt); setChoices(nextChoices); setChoiceDetails((current) => resizeListeningChoiceDetails(current, nextChoices.length)); setAnswerIndex(nextGuidance.freeResponse ? -1 : 0); }} className="mt-2 h-11 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-base">
                {listeningQuestionTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-[#46514c]">
              {labels.listeningTitle}
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={labels.listeningTitlePlaceholder} maxLength={120} className="mt-2 h-11 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-base" />
            </label>
          </div>

          {!isBlankBasicTraining ? (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-semibold text-[#46514c]">
                {labels.listeningCorrectAnswer}
                <select value={answerIndex} onChange={(event) => setAnswerIndex(Number(event.target.value))} className="mt-2 h-11 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-base">
                  {typeGuidance.freeResponse ? <option value={-1}>自由作答（练习时自行输入）</option> : choices.slice(0, typeGuidance.choiceCount).map((choice, index) => <option key={index} value={index}>{index + 1}. {choice || labels.listeningChoice.replace('{number}', String(index + 1))}</option>)}
                </select>
              </label>
            </div>
          ) : (
            <p className="text-xs font-normal text-[#68716b]">全部选项已留空：这是一道填空题，练习时会显示文本输入框，请在下方解析中写出参考答案。</p>
          )}

          <label className="block text-sm font-semibold text-[#46514c]">
            {labels.listeningQuestion}
            <textarea value={question} readOnly maxLength={1000} className="mt-2 min-h-24 w-full cursor-not-allowed rounded-md border border-[#c8d1c8] bg-[#f4f7f3] p-3 text-base leading-6 text-[#46514c]" required />
          </label>

          <div className="grid gap-3">
            {choices.slice(0, typeGuidance.freeResponse ? 4 : typeGuidance.choiceCount).map((choice, index) => (
              <fieldset key={index} className="grid gap-2 rounded-lg border border-[#dce9df] bg-[#fbfdfb] p-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-[#46514c] sm:col-span-2">
                  {labels.listeningChoice.replace('{number}', String(index + 1))}{index === answerIndex ? ' · 正确答案' : ''}
                  <input value={choice} onChange={(event) => setChoices((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} maxLength={300} className="mt-2 h-11 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-base" required={!typeGuidance.freeResponse && !typeGuidance.choicesOptional} />
                </label>
                <label className="block text-sm font-medium text-[#68716b]">{labels.listeningChoiceTranslation}
                  <input value={choiceDetails[index]?.translation ?? ''} onChange={(event) => setChoiceDetails((current) => updateListeningChoiceDetail(current, index, 'translation', event.target.value))} maxLength={2000} className="mt-1 h-10 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-sm" />
                </label>
                <label className="block text-sm font-medium text-[#68716b]">{labels.listeningChoiceExplanation}
                  <textarea value={choiceDetails[index]?.explanation ?? ''} onChange={(event) => setChoiceDetails((current) => updateListeningChoiceDetail(current, index, 'explanation', event.target.value))} maxLength={4000} className="mt-1 min-h-16 w-full rounded-md border border-[#c8d1c8] bg-white p-2 text-sm leading-5" />
                </label>
              </fieldset>
            ))}
          </div>
          {typeGuidance.freeResponse ? <p className="text-xs font-normal text-[#68716b]">自由作答题不需要填写四个选项；解析中请写明参考回应、语气和判断要点。</p> : null}
          {!typeGuidance.freeResponse && typeGuidance.choicesOptional && questionTypeId === 'listening-basic-training' && !isBlankBasicTraining ? <p className="text-xs font-normal text-[#68716b]">基础训练题可以只填 2～3 个选项，从最后一个开始留空即可；若是纯填空题，可将全部选项留空。</p> : null}

          <label className="block text-sm font-semibold text-[#46514c]">{labels.listeningExplanation}
            <textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder={labels.listeningOverallExplanationPlaceholder} maxLength={2000} className="mt-2 min-h-20 w-full rounded-md border border-[#c8d1c8] bg-white p-3 text-base leading-6" />
          </label>


            </div>
          <aside className="min-w-0 h-fit rounded-2xl border border-[#dce9df] bg-[#f4faf5] p-4 lg:sticky lg:top-4">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-black text-[#31564c]">音频</h3><span className="text-xs text-[#68716b]">最多 25 MB</span></div>
            <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-[#dce9df] pb-4"><span className="mr-1 text-sm font-bold text-[#31564c]">题目导航</span>{(activeDraftIndex === null || tailDraft.current ? [...queuedDrafts, { title, questionTypeId, question, choices, answerIndex, explanation }] : queuedDrafts).map((draft, index) => <button key={index} type="button" onClick={() => openDraft(index)} className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full border px-3 text-sm font-bold ${index === (activeDraftIndex ?? queuedDrafts.length) ? 'border-[#31564c] bg-[#31564c] text-white' : 'border-[#cbd6cf] bg-white text-[#31564c]'}`}>{index + 1}</button>)}</div>
            <label className="block text-sm font-semibold text-[#46514c]">{labels.listeningAudio}<input key={fileInputKey} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac" onChange={(event) => void selectAudio(event.target.files?.[0] ?? null)} className="mt-2 block w-full rounded-md border border-[#cbd6cf] bg-white p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-[#e9f0e9] file:px-3 file:py-2 file:font-semibold file:text-[#31564c]" required />{audioFile ? <span className="mt-2 block text-xs font-normal text-[#68716b]">{audioFile.name} · {formatFileSize(audioFile.size, locale)}</span> : null}</label>
            <label className="mt-4 block text-sm font-semibold text-[#31564c]">{labels.listeningTranscript}
              <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} maxLength={30000} placeholder={labels.listeningTranscriptPlaceholder} className="mt-2 min-h-40 w-full rounded-md border border-[#c8d1c8] bg-white p-3 text-sm leading-6" />
            </label>
            <label className="mt-3 block text-sm font-semibold text-[#68716b]">{labels.listeningTranscriptTranslation}
              <textarea value={transcriptTranslation} onChange={(event) => setTranscriptTranslation(event.target.value)} maxLength={30000} placeholder={labels.listeningTranscriptTranslationPlaceholder} className="mt-2 min-h-28 w-full rounded-md border border-[#c8d1c8] bg-white p-3 text-sm leading-6" />
            </label>
            {audioFile ? <UploadedAudioPreview file={audioFile} labels={labels} /> : <p className="mt-3 text-xs leading-5 text-[#68716b]">选择音频后可在这里试听。</p>}
          </aside>
          </div>
        </form>
      ) : null}

      {showLibrary ? <LearningCatalog columns={<div className="list-column-header listening-column-header" aria-hidden="true">
        <span className="list-column-reference">{locale === 'ja' ? '参照番号' : locale === 'en' ? 'Reference' : '编号'}</span>
        <span className="list-column-title">{locale === 'ja' ? '音声' : locale === 'en' ? 'Audio' : '音频'}</span>
        <span className="list-column-metadata">
          <span>{locale === 'ja' ? '問題数・種類' : locale === 'en' ? 'Questions / types' : '题数与题型'}</span>
          <span>{locale === 'ja' ? '追加日' : locale === 'en' ? 'Added' : '添加时间'}</span>
          <span>{locale === 'ja' ? '練習回数' : locale === 'en' ? 'Practice count' : '练习次数'}</span>
        </span>
      </div>}
        title={locale === 'ja' ? '聴解ライブラリ' : locale === 'en' ? 'Listening library' : '听力题库'}
        items={audioGroups}
        locale={locale}
        batch={{ id: (item) => item.key, actions: [{
          key: 'delete', danger: true, icon: <Trash2 size={16} aria-hidden="true"/>,
          label: locale === 'ja' ? '削除' : locale === 'en' ? 'Delete' : '删除',
          confirm: (count) => locale === 'ja' ? `選択した ${count} 件の音声と、その問題をすべて削除します。` : locale === 'en' ? `Delete ${count} selected audio files and all of their questions?` : `将删除所选 ${count} 个音频及其全部题目，删除后无法恢复。`,
          run: async (key) => { for (const question of audioGroups.find((item) => item.key === key)?.questions ?? []) await onDelete(question.id); },
        }] }}
        tools={<><LearningListSelect label="题型" value={typeFilter} onChange={(value) => setTypeFilter(value)} hideLabel><option value="all">全部题型</option>{listeningQuestionTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</LearningListSelect><LearningListSelect label="排序" value={sortOrder} onChange={(value) => setSortOrder(value)} hideLabel><option value="newest">最新添加</option><option value="oldest">最早添加</option></LearningListSelect></>}
        searchText={(item) => `${item.representative.audioReference ?? ''} ${item.representative.audioFileName} ${item.questions.map((question) => `${question.reference ?? ''} ${listeningQuestionTypeName(question.questionTypeId)} ${question.title}`).join(' ')}`}
        renderRow={(item) => {
          const addedAt = item.questions.map((question) => question.createdAt)
            .filter((value) => value && Number.isFinite(Date.parse(value)))
            .sort((left, right) => Date.parse(left) - Date.parse(right))[0];
          return <LearningListRow key={item.key} title={item.representative.audioFileName}
            references={item.representative.audioReference ? [item.representative.audioReference] : item.questions.map(question => question.reference)}
            metadata={<>
              <span><span className="sr-only">{locale === 'ja' ? '問題数・種類' : locale === 'en' ? 'Questions / types' : '题数与题型'}</span>{item.questions.length} 道题 · {[...new Set(item.questions.map((question) => listeningQuestionTypeName(question.questionTypeId)))].join('、')}</span>
              <span className="list-added">{formatListDate(addedAt, locale === 'ja' ? '記録なし' : locale === 'en' ? 'Not recorded' : '未记录', locale, true)}</span>
              <span className="list-practice-count"><span className="practice-count-label">{locale === "ja" ? "練習回数 " : locale === "en" ? "Practice count " : "练习次数 "}</span>{progress[listeningPracticeKey(item.representative)]?.reviewCount ?? 0}</span>
            </>} locale={locale} onOpen={() => onOpenQuestion?.(listeningAudioRouteId(item.representative))}/>;
        }}
      /> : null}
    </section>
  );
}

function ListeningShareButton({ item, token, locale, questionCount }: { item: ListeningQuestion; token: string; locale: Locale; questionCount: number }) {
  const confirm = useConfirmation();
  const copy = listeningShareCopy[locale];
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  async function share() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError('');
    try {
      const result = await requestListeningShare({ filename: item.audioFileName, questionCount, locale, confirm,
        publish: () => apiRequest<{ id: string }>('/api/market/listening', { token, method: 'POST', body: { sourceId: item.id } }),
      });
      if (!result) return;
      const url = `${window.location.origin}/#/market/${encodeURIComponent(result.id)}`;
      setLink(url);
      try { await navigator.clipboard.writeText(url); } catch { /* Link remains visible for manual copying. */ }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.failed);
    } finally { pending.current = false; setBusy(false); }
  }
  return <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2">
    {link ? <input aria-label={copy.link} className="min-h-11 min-w-0 max-w-40 rounded border px-2 py-1 text-xs md:max-w-52" readOnly value={link} onFocus={(event) => event.currentTarget.select()} /> : null}
    <button type="button" onClick={() => void (link ? navigator.clipboard.writeText(link).catch(() => {}) : share())} disabled={busy} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#d6e6df] bg-white px-2.5 py-1.5 text-sm font-bold text-[#31564c]" aria-label={link ? copy.copy : copy.publish}>
      <Share2 size={16} aria-hidden="true" />{busy ? copy.busy : link ? copy.copy : copy.publish}
    </button>
    {error ? <span role="alert" className="text-xs text-red-600">{error}</span> : null}
  </div>;
}

function ListeningPracticePanel({ labels, locale, token, questions, onOpenLibrary, onRecordPractice }: { labels: Record<string, string>; locale: Locale; token: string; questions: ListeningQuestion[]; onOpenLibrary?: () => void; onRecordPractice: RecordPractice }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const orderedQuestions = useMemo(() => [...questions].sort(byLibraryNumber), [questions]);
  const activeQuestion = orderedQuestions[activeIndex % Math.max(orderedQuestions.length, 1)];

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(questions.length - 1, 0)));
  }, [questions.length]);

  if (!questions.length || !activeQuestion) {
    return (
      <section className="listening-workspace cute-practice-card mobile-page-surface min-w-0 border p-5 md:p-6">
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
    <section className="listening-workspace cute-practice-card mobile-page-surface min-w-0 border">
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
      <ListeningPracticeQuestion onRecordPractice={onRecordPractice} item={activeQuestion} labels={labels} token={token} locale={locale} />
    </section>
  );
}

function ListeningPracticeQuestion({ item, labels, token, locale, onRecordPractice }: { item: ListeningQuestion; labels: Record<string, string>; token: string; locale: Locale; onRecordPractice: RecordPractice }) {
  const [audioUrl, setAudioUrl] = useState('');
  const [audioError, setAudioError] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answerNotice, setAnswerNotice] = useState('');
  const savingRef = useRef(false);
  const [savingPractice, setSavingPractice] = useState(false);
  async function confirmPractice() {
    if (savingRef.current) return;
    if (isFreeResponse(item) ? !freeResponse.trim() : selected === null) { setAnswerNotice(isFreeResponse(item) ? '请先写下你的回答' : labels.listeningSelectAnswer); return; }
    savingRef.current = true;
    setSavingPractice(true);
    setAnswerNotice('');
    try {
      await onRecordPractice(item);
      setRevealed(true);
    } catch (error) {
      setAnswerNotice(error instanceof Error ? error.message : '保存失败，请重试');
    } finally {
      savingRef.current = false;
      setSavingPractice(false);
    }
  }

  const [freeResponse, setFreeResponse] = useState('');

  useEffect(() => {
    setSelected(null);
    setRevealed(false);
    setAnswerNotice('');
    setFreeResponse('');
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
        <RecordReference reference={item.reference} locale={locale} />
        <p className="mt-1 text-xs text-[#8f6f7b]">{listeningQuestionTypeName(item.questionTypeId)} · {item.audioFileName} · {formatFileSize(item.audioSize, locale)}</p>
      </div>
      <div className="mt-5">
        {audioUrl ? <AudioPlayer src={audioUrl} labels={labels} /> : <p className="text-sm text-[#74646b]">{audioError || 'Loading audio...'}</p>}
      </div>
      {hasDistinctListeningQuestion(item) ? <p className="mt-6 whitespace-pre-wrap text-lg font-bold leading-8 text-[#3d3036]">{item.question}</p> : null}
      {isFreeResponse(item) ? <textarea value={freeResponse} onChange={(event) => { setFreeResponse(event.target.value); setRevealed(false); setAnswerNotice(''); }} placeholder="写下你的回答" className="mt-4 min-h-24 w-full rounded-md border border-[#f0d4dd] bg-white p-3 text-base leading-6" /> : null}
      {!isFreeResponse(item) ? <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {item.choices.map((choice, index) => {
          const resultClass = revealed
            ? index === item.answerIndex ? 'border-[#65a37c] !bg-[#f0fff5]' : selected === index ? 'border-[#d95f8a] !bg-[#fff0f5]' : 'border-[#f0d4dd] !bg-white'
            : selected === index ? 'border-[#d95f8a] !bg-[#fff0f5]' : 'border-[#f0d4dd] !bg-white hover:!bg-[#fff7fb]';
          return (
            <button key={index} type="button" onClick={() => { setSelected(index); setRevealed(false); setAnswerNotice(''); }} className={`cute-choice flex min-h-14 items-center gap-3 border px-4 py-3 text-left text-base font-bold ${resultClass}`}>
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs">{index + 1}</span>
              <span className="min-w-0 break-words">{choice}</span>
              {revealed && item.choiceDetails?.[index]?.translation ? <span className="mt-1 block text-sm font-normal text-[#68716b]">{item.choiceDetails[index].translation}</span> : null}
              {revealed && item.choiceDetails?.[index]?.explanation ? <span className="mt-2 block border-t border-current/10 pt-2 text-sm font-normal leading-5 text-[#4f5b55]">{item.choiceDetails[index].explanation}</span> : null}
            </button>
          );
        })}
      </div> : null}
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#f0d4dd] pt-4">
        <button type="button" disabled={savingPractice} onClick={() => void confirmPractice()} className="cute-button-primary h-10 rounded-full px-4 text-sm font-bold text-white">
          {labels.listeningShowAnswer}
        </button>
        {answerNotice ? <p role="status" className="text-sm font-bold text-[#8a6134]">{answerNotice}</p> : null}
        {revealed && (isFreeResponse(item) ? freeResponse.trim() : selected !== null) ? <p role="status" className={`text-sm font-bold ${isFreeResponse(item) || selected === item.answerIndex ? 'text-[#356146]' : 'text-[#a84269]'}`}>{isFreeResponse(item) ? '已记录自答，请对照解析复盘' : selected === item.answerIndex ? labels.listeningCorrect : labels.listeningWrong}</p> : null}
      </div>
      {revealed ? <ListeningExplanation item={item} labels={labels} /> : null}
      {revealed ? <ListeningAnswerBreakdown item={item} /> : null}
    </div>
  );
}

function ListeningReadAlongWorkspace({ item, labels, locale, token, onBack }: { item: ListeningQuestion; labels: Record<string, string>; locale: Locale; token: string; onBack: () => void }) {
  const transcript = listeningTranscriptForPractice(item);
  const lines = useMemo(() => splitReadAlongLines(transcript), [transcript]);
  const [selectedLine, setSelectedLine] = useState(0);
  return <section className="listening-workspace cute-practice-card min-w-0 overflow-hidden border">
    <div className="flex flex-wrap items-center gap-3 border-b border-[#f0d4dd] px-4 py-3 md:px-6">
      <button type="button" onClick={onBack} className="inline-flex h-9 items-center gap-1 rounded-full border border-[#ead1dc] bg-white px-3 text-sm font-bold text-[#31564c]"><ChevronLeft size={17} />返回题目</button>
      <div className="min-w-0"><h2 className="text-lg font-black text-[#3d3036]">跟读练习</h2><p className="truncate text-xs text-[#778079]">{item.audioReference} · {item.audioFileName}</p></div>
    </div>
    <div className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_minmax(380px,36%)]">
      <div className="min-w-0 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-[#31564c]">听力原文 · 逐句练习</h3><span className="text-xs text-[#68716b]">{lines.length} 句</span></div>
        <p className="mt-2 text-xs text-[#68716b]">点选一句再录音。分词和颜色帮助找停顿，词类标记只标出可明确识别的类别。</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold"><span className="border-b-2 border-[#89a5d6] text-[#263e65]">词语</span><span className="border-b-2 border-[#23b5a6] text-[#245e59]">助词</span><span className="border-b-2 border-[#d7a42a] text-[#73581b]">数字</span><span className="text-[#67716b]">标点</span></div>
        {lines.length ? <div className="mt-4 grid gap-2" lang="ja">{lines.map((line, index) => <button key={index} type="button" onClick={() => setSelectedLine(index)} aria-current={selectedLine === index ? 'true' : undefined} className={`min-w-0 rounded-lg border p-4 text-left transition-colors ${selectedLine === index ? 'border-[#7aa88b] bg-[#edf5ee]' : 'border-[#dce9df] bg-white hover:bg-[#f7fbf7]'}`}>
          <span className="mr-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold text-[#31564c]">{index + 1}</span>
          <span className="text-base font-semibold leading-8">{colorReadAlongTokens(line).map((token, tokenIndex) => <span key={tokenIndex} className={token.kind === 'particle' ? 'border-b-2 border-[#23b5a6] text-[#245e59]' : token.kind === 'number' ? 'border-b-2 border-[#d7a42a] text-[#73581b]' : token.kind === 'word' ? 'border-b-2 border-[#89a5d6] text-[#263e65]' : 'text-[#67716b]'}>{token.text}</span>)}</span>
        </button>)}</div> : <p className="mt-4 rounded-lg border border-[#ead1dc] bg-[#fffafd] p-4 text-sm text-[#74646b]">这段音频还没有听力原文。可以先整段录音，添加原文后再逐句练习。</p>}
      </div>
      <aside className="min-w-0 border-t border-[#f0d4dd] bg-[#fffafd] p-4 md:p-5 xl:border-l xl:border-t-0">
        <div className="xl:sticky xl:top-5 xl:max-h-[calc(100vh-2.5rem)] xl:overflow-y-auto">
          <ListeningAudioTools item={item} labels={labels} locale={locale} token={token} />
          <ListeningRecordingAnalysisPanel item={item} labels={labels} locale={locale} token={token} lines={lines} selectedLine={selectedLine} onSelectLine={setSelectedLine} />
        </div>
      </aside>
    </div>
  </section>;
}

function ListeningAudioTools({ item, labels, locale, token, onOpenReadAlong }: { item: ListeningQuestion; labels: Record<string, string>; locale: Locale; token: string; onOpenReadAlong?: () => void }) {
  const [audioUrl, setAudioUrl] = useState('');
  const [audioError, setAudioError] = useState('');

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

  return <div className="mt-4 min-w-0">
    <h3 className="hidden text-sm font-bold text-[#31564c] md:block">{locale === 'ja' ? '音声を聞く' : locale === 'en' ? 'Listen to audio' : '听力播放'}</h3>
    <p className="mt-1 hidden break-all text-xs leading-5 text-[#778079] md:block">{item.audioFileName}</p>
    <div className="mt-3">{audioUrl ? <AudioPlayer src={audioUrl} labels={labels} /> : <p className="text-sm text-[#68716b]">{audioError || labels.listeningAudioLoading}</p>}</div>
    {onOpenReadAlong ? <button type="button" onClick={onOpenReadAlong} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-[#31564c] px-4 text-sm font-bold text-white"><Mic size={16} />进入跟读练习</button> : null}
  </div>;
}

function ListeningQuestionNavigation({ questions, locale, mobile, mobileIndex, onMobileIndexChange }: { questions: ListeningQuestion[]; locale: Locale; mobile: boolean; mobileIndex: number; onMobileIndexChange: (index: number) => void }) {
  const [activeId, setActiveId] = useState(questions[0]?.id);

  useEffect(() => {
    if (mobile) return;
    setActiveId(questions[0]?.id);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActiveId(visible.target.id.replace('listening-question-', ''));
    }, { rootMargin: '-15% 0px -65% 0px' });
    for (const question of questions) {
      const element = document.getElementById(`listening-question-${question.id}`);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [questions, mobile]);

  return <nav className="border-b border-[#ead1dc] pb-3 md:pb-4" aria-label={locale === 'ja' ? '問題ナビゲーション' : locale === 'en' ? 'Question navigation' : '题目导航'}>
    <h3 className="hidden text-sm font-bold text-[#31564c] md:block">{locale === 'ja' ? '問題ナビゲーション' : locale === 'en' ? 'Questions' : '题目导航'} <span className="font-normal text-[#778079]">({questions.length})</span></h3>
    <div className="flex gap-2 overflow-x-auto pb-1 md:mt-3 md:flex-wrap md:overflow-visible md:pb-0">
      {questions.map((question, index) => <button key={question.id} type="button"
        onClick={() => {
          if (mobile) {
            onMobileIndexChange(index);
            window.requestAnimationFrame(() => document.getElementById('listening-question-group')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
          } else {
            setActiveId(question.id);
            document.getElementById(`listening-question-${question.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }}
        aria-label={locale === 'ja' ? `問題 ${index + 1}` : locale === 'en' ? `Question ${index + 1}` : `第 ${index + 1} 题`}
        aria-current={(mobile ? mobileIndex === index : activeId === question.id) ? 'location' : undefined}
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold transition-colors md:h-11 md:w-11 ${(mobile ? mobileIndex === index : activeId === question.id) ? 'border-[#7aa88b] bg-[#edf5ee] text-[#31564c]' : 'border-[#d8e0d7] bg-white text-[#46514c] hover:bg-[#f4faf5]'}`}>
        {index + 1}
      </button>)}
    </div>
  </nav>;
}

type GroupAnswer = { selected: number | null; freeResponse: string };

function ListeningQuestionGroup({ questions, recordPractice, labels, locale, onUpdate, onDelete, mobile, mobileIndex, onMobileIndexChange }: { questions: ListeningQuestion[]; recordPractice: RecordPractice; labels: Record<string, string>; locale: Locale; onUpdate: (id: string, patch: Partial<ListeningQuestion>) => Promise<void>; onDelete: (id: string) => Promise<void>; mobile: boolean; mobileIndex: number; onMobileIndexChange: (index: number) => void }) {
  const [answers, setAnswers] = useState<Record<string, GroupAnswer>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const savedAnswers = useRef<Record<string, string>>({});

  useEffect(() => {
    if (questions.length && mobileIndex >= questions.length) onMobileIndexChange(questions.length - 1);
  }, [questions.length, mobileIndex, onMobileIndexChange]);

  function updateAnswer(id: string, answer: GroupAnswer) {
    setAnswers((current) => ({ ...current, [id]: answer }));
    setRevealed(false);
    setNotice('');
  }

  async function confirmAll() {
    if (savingRef.current) return;
    const missing = questions.findIndex((item) => isFreeResponse(item) ? !answers[item.id]?.freeResponse.trim() : answers[item.id]?.selected == null);
    if (missing >= 0) {
      setNotice(locale === 'ja' ? `問題 ${missing + 1} に答えてください` : locale === 'en' ? `Answer question ${missing + 1} first` : `请先回答第 ${missing + 1} 题`);
      if (mobile) onMobileIndexChange(missing);
      window.requestAnimationFrame(() => document.getElementById(`listening-question-${questions[missing].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setNotice('');
    try {
      for (const item of questions) {
        const answer = answers[item.id];
        const answerKey = isFreeResponse(item) ? `text:${answer.freeResponse.trim()}` : `choice:${answer.selected}`;
        if (savedAnswers.current[item.id] === answerKey) continue;
        await recordPractice(item);
        savedAnswers.current[item.id] = answerKey;
      }
      setRevealed(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存失败，请重试');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <div id="listening-question-group" className="min-w-0 scroll-mt-16">
    <div className="divide-y divide-[#f0d4dd]">{questions.map((item, index) => {
      if (mobile && index !== mobileIndex) return null;
      const sameAsPrevious = sameListeningHeading(questions[index - 1], item);
      const sharedTitle = sameAsPrevious || sameListeningHeading(item, questions[index + 1]);
      return <Fragment key={item.id}>
        {sharedTitle && !sameAsPrevious ? <h3 className="break-words bg-[#f4faf5] px-4 py-4 text-lg font-semibold leading-7 text-[#27312c] md:px-6">{item.title}</h3> : null}
        <div id={`listening-question-${item.id}`} className="scroll-mt-6">
          <ListeningQuestionItem item={item} labels={labels} locale={locale} onUpdate={onUpdate} onDelete={onDelete} detail hideTitle={sharedTitle} questionNumber={index + 1} answer={answers[item.id] ?? { selected: null, freeResponse: '' }} onAnswerChange={(answer) => updateAnswer(item.id, answer)} revealed={revealed} editing={editingId === item.id} onEditingChange={(open) => setEditingId(open ? item.id : null)} />
        </div>
      </Fragment>;
    })}</div>
    {mobile && questions.length > 1 ? <div className="flex items-center justify-between gap-3 border-t border-[#f0d4dd] px-4 py-3 text-sm font-semibold text-[#31564c]">
      <button type="button" disabled={mobileIndex === 0} onClick={() => { onMobileIndexChange(mobileIndex - 1); document.getElementById('listening-question-group')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="min-h-10 rounded-lg border border-[#d8e0d7] px-3 disabled:opacity-40">{locale === 'ja' ? '前へ' : locale === 'en' ? 'Previous' : '上一题'}</button>
      <span>{mobileIndex + 1} / {questions.length}</span>
      <button type="button" disabled={mobileIndex >= questions.length - 1} onClick={() => { onMobileIndexChange(mobileIndex + 1); document.getElementById('listening-question-group')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="min-h-10 rounded-lg border border-[#d8e0d7] px-3 disabled:opacity-40">{locale === 'ja' ? '次へ' : locale === 'en' ? 'Next' : '下一题'}</button>
    </div> : null}
    {editingId === null ? <div className="flex flex-wrap items-center gap-3 border-t border-[#f0d4dd] bg-[#f7fbf7] px-4 py-4 md:px-6">
      <button type="button" disabled={saving} onClick={() => void confirmAll()} className="h-10 rounded-md bg-[#31564c] px-4 text-sm font-semibold text-white disabled:opacity-60">{labels.listeningShowAnswer}</button>
      {notice ? <p role="status" className="text-sm font-semibold text-[#8a6134]">{notice}</p> : null}
    </div> : null}
  </div>;
}

function ListeningQuestionItem({ item, labels, locale, onUpdate, onDelete, detail = false, hideTitle = false, questionNumber, answer, onAnswerChange, revealed, editing, onEditingChange }: { item: ListeningQuestion; labels: Record<string, string>; locale: Locale; onUpdate: (id: string, patch: Partial<ListeningQuestion>) => Promise<void>; onDelete: (id: string) => Promise<void>; detail?: boolean; hideTitle?: boolean; questionNumber?: number; answer: GroupAnswer; onAnswerChange: (answer: GroupAnswer) => void; revealed: boolean; editing: boolean; onEditingChange: (open: boolean) => void }) {
  const { selected, freeResponse } = answer;

  const confirm = useConfirmation();
  const [deleting, setDeleting] = useState(false);

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
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="hidden md:inline-flex"><RecordReference reference={item.reference} locale={locale} /></span>
            <h3 className="break-words text-lg font-semibold text-[#27312c]">{detail && questionNumber ? `问题 ${questionNumber}${hideTitle ? '' : ` · ${item.title}`}` : item.title}</h3>
          </div>
        </div>
        <div className="hidden shrink-0 justify-end gap-1 md:flex">
          {detail ? <QuestionAction label={`${editing ? '退出编辑' : '编辑'}: ${item.title}`} title={editing ? '退出编辑' : '编辑'} onClick={() => onEditingChange(!editing)}>{editing ? <X size={16} /> : <Pencil size={16} />}</QuestionAction> : null}
          <QuestionAction label={`${labels.listeningDelete}: ${item.title}`} title={labels.listeningDelete} onClick={remove} disabled={deleting}><Trash2 size={16} /></QuestionAction>
        </div>
        <details className="relative shrink-0 text-sm md:hidden">
          <summary className="cursor-pointer rounded-lg border border-[#d8e0d7] px-3 py-2 font-semibold text-[#31564c]">{locale === 'ja' ? '管理' : locale === 'en' ? 'Manage' : '管理'}</summary>
          <div className="absolute right-0 z-10 mt-1 flex items-center gap-2 rounded-lg border border-[#d8e0d7] bg-white p-2 shadow-lg">
            <RecordReference reference={item.reference} locale={locale} />
            {detail ? <QuestionAction label={`${editing ? '退出编辑' : '编辑'}: ${item.title}`} title={editing ? '退出编辑' : '编辑'} onClick={() => onEditingChange(!editing)}>{editing ? <X size={16} /> : <Pencil size={16} />}</QuestionAction> : null}
            <QuestionAction label={`${labels.listeningDelete}: ${item.title}`} title={labels.listeningDelete} onClick={remove} disabled={deleting}><Trash2 size={16} /></QuestionAction>
          </div>
        </details>
      </div>
      {editing ? <ListeningQuestionEditor key={item.id} item={item} labels={labels} onUpdate={onUpdate} onCancel={() => onEditingChange(false)} onSaved={() => onEditingChange(false)} /> : null}
      {!editing ? <>
      {hasDistinctListeningQuestion(item) ? <p className="mt-5 whitespace-pre-wrap text-base font-semibold leading-7">{item.question}</p> : null}
      {isFreeResponse(item) ? <textarea value={freeResponse} onChange={(event) => onAnswerChange({ ...answer, freeResponse: event.target.value })} placeholder="写下你的回答" className="mt-3 min-h-24 w-full rounded-md border border-[#d8e0d7] bg-white p-3 text-sm leading-6" /> : null}
      {!isFreeResponse(item) ? <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {item.choices.map((choice, index) => {
          const resultClass = revealed
            ? index === item.answerIndex ? 'border-[#6f947c] !bg-[#edf5ee]' : selected === index ? 'border-[#c9907d] !bg-[#fbf1ed]' : 'border-[#d8e0d7] !bg-white'
            : selected === index ? 'border-[#31564c] !bg-[#edf3ef]' : 'border-[#d8e0d7] !bg-white';
          return (
            <label key={index} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm ${resultClass}`}>
              <input type="radio" name={`listening-${item.id}`} checked={selected === index} onChange={() => onAnswerChange({ ...answer, selected: index })} />
              <span className="min-w-0">{index + 1}. {choice}
                {revealed && item.choiceDetails?.[index]?.translation ? <span className="mt-1 block font-normal text-[#68716b]">{item.choiceDetails[index].translation}</span> : null}
                {revealed && item.choiceDetails?.[index]?.explanation ? <span className="mt-2 block border-t border-current/10 pt-2 font-normal leading-5 text-[#4f5b55]">{item.choiceDetails[index].explanation}</span> : null}
              </span>
            </label>
          );
        })}
      </div> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {revealed && (isFreeResponse(item) ? freeResponse.trim() : selected !== null) ? <p role="status" className={`text-sm font-semibold ${isFreeResponse(item) || selected === item.answerIndex ? 'text-[#356146]' : 'text-[#8a493c]'}`}>{isFreeResponse(item) ? '已记录自答，请对照解析复盘' : selected === item.answerIndex ? labels.listeningCorrect : labels.listeningWrong}</p> : null}
      </div>
      {revealed ? <div className="md:hidden"><details className="mt-4 rounded-lg border border-[#dce9df] bg-[#f7fbf7] p-4"><summary className="cursor-pointer font-bold text-[#31564c]">{locale === 'ja' ? '解説を見る' : locale === 'en' ? 'View explanation' : '查看解析'}</summary><ListeningExplanation item={item} labels={labels} /><ListeningAnswerBreakdown item={item} /></details></div> : null}
      {revealed ? <div className="hidden md:block"><ListeningExplanation item={item} labels={labels} /><ListeningAnswerBreakdown item={item} /></div> : null}
      </> : null}
    </article>
  );
}

function ListeningQuestionEditor({ item, labels, onUpdate, onCancel, onSaved }: { item: ListeningQuestion; labels: Record<string, string>; onUpdate: (id: string, patch: Partial<ListeningQuestion>) => Promise<void>; onCancel: () => void; onSaved: () => void }) {
  const initial = useMemo(() => listeningEditorContent(item), [item]);
  const [title, setTitle] = useState(item.title);
  const [questionTypeId, setQuestionTypeId] = useState(item.questionTypeId);
  const [question, setQuestion] = useState(item.question);
  const [choices, setChoices] = useState(() => Array.from({ length: listeningTypeGuidance[item.questionTypeId]?.choiceCount ?? 4 }, (_, index) => item.choices[index] ?? ''));
  const [choiceDetails, setChoiceDetails] = useState(() => resizeListeningChoiceDetails(initial.choiceDetails ?? [], listeningTypeGuidance[item.questionTypeId]?.choiceCount ?? 4));
  const [answerIndex, setAnswerIndex] = useState(item.answerIndex);
  const [explanation, setExplanation] = useState(initial.explanation);
  const [transcript, setTranscript] = useState(initial.transcript ?? '');
  const [transcriptTranslation, setTranscriptTranslation] = useState(initial.transcriptTranslation ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const guidance = listeningTypeGuidance[questionTypeId] ?? listeningTypeGuidance['listening-task'];
  const blankBasic = questionTypeId === 'listening-basic-training' && choices.every((choice) => !choice.trim());

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onUpdate(item.id, {
        title, questionTypeId, question, choices, choiceDetails,
        answerIndex: blankBasic ? -1 : answerIndex < 0 ? 0 : answerIndex,
        explanation,
        transcript, transcriptTranslation,
      });
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={save} className="mt-4 grid gap-4 rounded-xl border border-[#dce9df] bg-[#f7fbf7] p-4">
    <div className="flex items-center justify-between gap-3"><h4 className="font-bold text-[#31564c]">编辑听力题</h4><button type="button" onClick={onCancel} disabled={saving} className="inline-flex items-center gap-1 text-sm font-semibold text-[#31564c]"><X size={16} />退出编辑</button></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold">{labels.questionType}<select value={questionTypeId} onChange={(event) => {
        const next = event.target.value;
        const nextGuidance = listeningTypeGuidance[next] ?? listeningTypeGuidance['listening-task'];
        setQuestionTypeId(next);
        setQuestion(nextGuidance.prompt);
        setChoices((current) => Array.from({ length: nextGuidance.choiceCount }, (_, index) => current[index] ?? ''));
        setChoiceDetails((current) => resizeListeningChoiceDetails(current, nextGuidance.choiceCount));
        setAnswerIndex(0);
      }} className="mt-1 block h-10 w-full rounded-md border border-[#c8d1c8] bg-white px-3">{listeningQuestionTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
      <label className="text-sm font-semibold">{labels.listeningTitle}<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} className="mt-1 block h-10 w-full rounded-md border border-[#c8d1c8] bg-white px-3" /></label>
    </div>
    <label className="text-sm font-semibold">{labels.listeningQuestion}<textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1000} required className="mt-1 block min-h-24 w-full rounded-md border border-[#c8d1c8] bg-white p-3" /></label>
    <div className="grid gap-3 sm:grid-cols-2">{choices.map((choice, index) => <fieldset key={index} className="grid gap-2 rounded-md border border-[#dce9df] bg-white p-3">
      <label className="text-sm font-semibold">{labels.listeningChoice.replace('{number}', String(index + 1))}<input value={choice} onChange={(event) => setChoices((current) => current.map((value, i) => i === index ? event.target.value : value))} maxLength={300} required={!guidance.choicesOptional} className="mt-1 block h-10 w-full rounded-md border border-[#c8d1c8] px-3" /></label>
      <label className="text-sm">{labels.listeningChoiceTranslation}<input value={choiceDetails[index]?.translation ?? ''} onChange={(event) => setChoiceDetails((current) => updateListeningChoiceDetail(current, index, 'translation', event.target.value))} maxLength={2000} className="mt-1 block h-10 w-full rounded-md border border-[#c8d1c8] px-3" /></label>
      <label className="text-sm">{labels.listeningChoiceExplanation}<textarea value={choiceDetails[index]?.explanation ?? ''} onChange={(event) => setChoiceDetails((current) => updateListeningChoiceDetail(current, index, 'explanation', event.target.value))} maxLength={4000} className="mt-1 block min-h-16 w-full rounded-md border border-[#c8d1c8] p-2" /></label>
    </fieldset>)}</div>
    {!blankBasic ? <label className="text-sm font-semibold">{labels.listeningCorrectAnswer}<select value={answerIndex < 0 ? 0 : answerIndex} onChange={(event) => setAnswerIndex(Number(event.target.value))} className="mt-1 block h-10 w-full rounded-md border border-[#c8d1c8] bg-white px-3">{choices.map((choice, index) => <option key={index} value={index}>{index + 1}. {choice || '（未填写）'}</option>)}</select></label> : null}
    <label className="text-sm font-semibold">{labels.listeningExplanation}<textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} maxLength={2000} className="mt-1 block min-h-24 w-full rounded-md border border-[#c8d1c8] bg-white p-3" /></label>
    <p className="text-xs text-[#68716b]">原文和翻译由这段音频的所有题目共用。</p><label className="text-sm font-semibold">{labels.listeningTranscript}<textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} maxLength={30000} className="mt-1 block min-h-32 w-full rounded-md border border-[#c8d1c8] bg-white p-3" /></label><label className="text-sm font-semibold">{labels.listeningTranscriptTranslation}<textarea value={transcriptTranslation} onChange={(event) => setTranscriptTranslation(event.target.value)} maxLength={30000} className="mt-1 block min-h-24 w-full rounded-md border border-[#c8d1c8] bg-white p-3" /></label>
    {error ? <p role="alert" className="text-sm text-[#a84269]">{error}</p> : null}
    <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} disabled={saving} className="h-10 rounded-md border border-[#c8d1c8] px-4 text-sm">{labels.cancelAction}</button><button type="submit" disabled={saving} className="h-10 rounded-md bg-[#31564c] px-4 text-sm font-bold text-white disabled:opacity-50">{saving ? labels.listeningSubmitting : '保存修改'}</button></div>
  </form>;
}

function ListeningRecordingAnalysisPanel({ item, labels, locale, token, lines, selectedLine, onSelectLine }: { item: ListeningQuestion; labels: Record<string, string>; locale: Locale; token: string; lines: string[]; selectedLine: number; onSelectLine: (index: number) => void }) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const targetRef = useRef<number | 'whole'>('whole');
  const abortedRef = useRef(false);
  const draftWriteRef = useRef<Promise<void>>(Promise.resolve());
  const [mode, setMode] = useState<'line' | 'whole'>(lines.length ? 'line' : 'whole');
  const [clips, setClips] = useState<Record<number, Blob>>({});
  const [clipUrls, setClipUrls] = useState<Record<number, string>>({});
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [recordings, setRecordings] = useState<ListeningRecording[]>([]);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const recordedCount = Object.keys(clips).length;
  const draftId = item.audioAssetId ?? item.id;
  const draftTranscript = lines.join('\n');

  useEffect(() => {
    let disposed = false;
    loadListeningClipDrafts(draftId, draftTranscript)
      .then((saved) => { if (!disposed) setClips(saved); })
      .catch(() => { if (!disposed) setNotice('无法读取本地逐句录音草稿'); })
      .finally(() => { if (!disposed) setDraftsLoaded(true); });
    return () => { disposed = true; };
  }, [draftId, draftTranscript]);

  useEffect(() => {
    const urls = Object.fromEntries(Object.entries(clips).map(([index, blob]) => [index, URL.createObjectURL(blob)]));
    setClipUrls(urls);
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, [clips]);

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

  useEffect(() => {
    abortedRef.current = false;
    return () => {
      abortedRef.current = true;
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
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
      targetRef.current = mode === 'line' ? selectedLine : 'whole';
      chunksRef.current = [];
      if (mode === 'whole') setRecordingBlob(null);
      setSeconds(0);
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || preferredMime || 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (blob.size && !abortedRef.current) {
          if (targetRef.current === 'whole') {
            setRecordingBlob(blob);
            void saveRecording(blob);
          } else {
            const lineIndex = targetRef.current;
            setClips((current) => ({ ...current, [lineIndex]: blob }));
            draftWriteRef.current = draftWriteRef.current.catch(() => undefined).then(() => saveListeningClipDraft(draftId, draftTranscript, lineIndex, blob));
            void draftWriteRef.current.catch(() => setNotice('这一句尚未保存到本地草稿，请在离开前合并录音'));
            if (lineIndex + 1 < lines.length) onSelectLine(lineIndex + 1);
          }
        }
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

  async function saveRecording(blob: Blob) {
    setSubmitting(true);
    setNotice('');
    try {
      const response = await apiRequest<{ recording: ListeningRecording; agentMessage: string }>(`/api/listening-questions/${item.id}/recordings`, {
        method: 'POST',
        token,
        body: { audioMime: blob.type || 'audio/webm', audioBase64: await blobToBase64(blob) },
      });
      setRecordings((current) => [response.recording, ...current.filter((entry) => entry.id !== response.recording.id)]);
      setRecordingBlob(null);
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : labels.listeningRecordingSubmitError);
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function mergeClips() {
    if (!recordedCount || submitting) return;
    setSubmitting(true);
    setNotice('');
    try {
      const merged = await mergeReadAlongClips(Object.keys(clips).map(Number).sort((a, b) => a - b).map((index) => clips[index]));
      setRecordingBlob(merged);
      if (await saveRecording(merged)) {
        await draftWriteRef.current.catch(() => undefined);
        await clearListeningClipDrafts(draftId).catch(() => setNotice('完整录音已保存，但清理本地草稿失败'));
        setClips({});
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '合并录音失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-5 rounded-xl border border-[#ead1dc] bg-[#fffafd] p-4" aria-labelledby={`recording-title-${item.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 id={`recording-title-${item.id}`} className="flex items-center gap-2 text-base font-black text-[#3d3036]"><Mic size={18} />{labels.listeningRecordingTitle}</h4>
          <p className="mt-1 text-sm leading-6 text-[#74646b]">整段录音停止后自动保存；逐句录音可回听、重录，合并后保存到录音历史。</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-[#f2e9ee] p-1 text-sm font-semibold">
        <button type="button" disabled={recording || submitting || !lines.length} onClick={() => setMode('line')} className={`rounded-md py-2 disabled:opacity-40 ${mode === 'line' ? 'bg-white text-[#31564c] shadow-sm' : 'text-[#74646b]'}`}>逐句录</button>
        <button type="button" disabled={recording || submitting} onClick={() => setMode('whole')} className={`rounded-md py-2 ${mode === 'whole' ? 'bg-white text-[#31564c] shadow-sm' : 'text-[#74646b]'}`}>整段录</button>
      </div>
      {mode === 'line' ? <div className="mt-4 rounded-lg bg-white p-3 text-sm">
        <p className="font-bold text-[#31564c]">第 {selectedLine + 1} / {lines.length} 句 · 已录 {recordedCount} 句</p>
        <p lang="ja" className="mt-2 max-h-32 overflow-y-auto leading-6 text-[#3d3036]">{lines[selectedLine]}</p>
      </div> : <p className="mt-3 text-xs leading-5 text-[#74646b]">从头到尾录一次，停止后会自动保存。</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {recording ? (
          <button type="button" onClick={stopRecording} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#a84269] px-4 text-sm font-bold text-white"><Square size={15} fill="currentColor" />{labels.listeningRecordingStop}</button>
        ) : (
          <button type="button" onClick={startRecording} disabled={submitting || Boolean(recordingBlob) || (mode === 'line' && !draftsLoaded)} className="cute-button-primary inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold text-white disabled:opacity-50"><Mic size={16} />{mode === 'line' ? clips[selectedLine] ? '重录这一句' : '录这一句' : labels.listeningRecordingStart}</button>
        )}
        {recording ? <span className="font-mono text-sm font-bold tabular-nums text-[#a84269]">{formatDuration(seconds)}</span> : null}
        {submitting ? <span className="inline-flex items-center gap-1 text-sm text-[#8f365b]"><LoaderCircle className="animate-spin" size={15} />{labels.listeningRecordingSubmitting}</span> : null}
      </div>

      {mode === 'line' ? <div className="mt-4 grid gap-3">
        {clipUrls[selectedLine] ? <audio aria-label={`第 ${selectedLine + 1} 句录音`} controls preload="metadata" src={clipUrls[selectedLine]} className="cute-audio-player w-full" /> : null}
        <div className="flex flex-wrap gap-1">{lines.map((_, index) => <button key={index} type="button" onClick={() => onSelectLine(index)} className={`h-8 min-w-8 rounded-md border text-xs font-bold ${index === selectedLine ? 'border-[#31564c] bg-[#edf5ee] text-[#31564c]' : clips[index] ? 'border-[#7aa88b] bg-white text-[#31564c]' : 'border-[#e5d9df] bg-white text-[#74646b]'}`} aria-label={`第 ${index + 1} 句${clips[index] ? '，已录' : ''}`}>{index + 1}</button>)}</div>
        <button type="button" onClick={() => void mergeClips()} disabled={!recordedCount || recording || submitting} className="h-10 rounded-lg border border-[#7aa88b] bg-white px-3 text-sm font-bold text-[#31564c] disabled:opacity-50">合并并保存完整录音</button>
        {recordedCount > 0 && recordedCount < lines.length ? <p className="text-xs text-[#74646b]">还有 {lines.length - recordedCount} 句未录；合并时会跳过。</p> : null}
      </div> : null}

      {previewUrl && !submitting ? (
        <div className="mt-4 grid gap-3 rounded-lg border border-[#f0d4dd] bg-white p-3">
          <audio controls preload="metadata" src={previewUrl} className="cute-audio-player w-full" />
          <button type="button" onClick={() => { if (recordingBlob) void saveRecording(recordingBlob); }} className="cute-button-primary inline-flex h-9 w-fit items-center gap-2 rounded-full px-3 text-sm font-bold text-white"><RotateCcw size={15} />{labels.listeningRecordingRetrySave}</button>
        </div>
      ) : null}

      {notice ? <p role="status" className="mt-3 text-sm font-bold text-[#8f365b]">{notice}</p> : null}
      {recordings.length ? <div className="mt-5 border-t border-[#f0d4dd] pt-4">
        <h5 className="text-sm font-bold text-[#3d3036]">{labels.listeningRecordingHistory} ({recordings.length})</h5>
        <div className="mt-3 grid gap-2">{recordings.map((entry, index) => <ListeningRecordingHistoryItem key={entry.id} recording={entry} index={index} labels={labels} locale={locale} token={token} onDeleted={() => setRecordings((current) => current.filter((recording) => recording.id !== entry.id))} />)}</div>
      </div> : null}
    </section>
  );
}

function ListeningRecordingHistoryItem({ recording, index, labels, locale, token, onDeleted }: { recording: ListeningRecording; index: number; labels: Record<string, string>; locale: Locale; token: string; onDeleted: () => void }) {
  const [expanded, setExpanded] = useState(index === 0);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioError, setAudioError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const confirm = useConfirmation();

  async function remove() {
    if (!(await confirm({ title: labels.listeningRecordingDelete, description: labels.listeningRecordingDeleteConfirm, confirmLabel: labels.listeningRecordingDelete, cancelLabel: labels.cancelAction, danger: true }))) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await apiRequest(`/api/listening-recordings/${recording.id}`, { method: 'DELETE', token });
      onDeleted();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : labels.listeningRecordingDeleteError);
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (!expanded) return;
    let disposed = false;
    let objectUrl = '';
    setAudioUrl('');
    setAudioError('');
    fetch(`/api/listening-recordings/${recording.id}/audio`, { headers: { authorization: `Bearer ${token}` } })
      .then((response) => {
        if (!response.ok) throw new Error(labels.listeningRecordingPlayError);
        return response.blob();
      })
      .then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
      })
      .catch(() => { if (!disposed) setAudioError(labels.listeningRecordingPlayError); });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [expanded, labels.listeningRecordingPlayError, recording.id, token]);

  const statusLabel = recording.status === 'completed'
    ? labels.listeningRecordingStatusCompleted
    : recording.status === 'analyzing'
      ? labels.listeningRecordingStatusAnalyzing
      : recording.status === 'failed'
        ? labels.listeningRecordingStatusFailed
        : labels.listeningRecordingStatusPending;

  return <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)} className="relative min-w-0 rounded-lg border border-[#ead1dc] bg-white p-3">
    <summary className="listening-recording-summary min-w-0 cursor-pointer pr-9 text-sm font-semibold text-[#3d3036]">
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 align-middle">
        <span>{labels.listeningRecordingTake} {index + 1}</span>
        <span className="text-xs font-normal text-[#778079]">{formatDateTime(recording.createdAt, locale)}</span>
        <span className="text-xs text-[#8f365b]">{statusLabel}</span>
      </span>
    </summary>
    <button type="button" onClick={() => void remove()} disabled={deleting} aria-label={`${labels.listeningRecordingDelete}: ${formatDateTime(recording.createdAt, locale)}`} title={labels.listeningRecordingDelete} className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#ead1dc] text-[#a84269] hover:bg-[#fff0f5] disabled:opacity-50"><Trash2 size={15} /></button>
    {deleteError ? <p role="alert" className="mt-2 text-xs text-[#a84269]">{deleteError}</p> : null}
    <div className="mt-3 grid min-w-0 gap-3 border-t border-[#f0d4dd] pt-3">
      {audioUrl ? <audio controls preload="metadata" src={audioUrl} className="cute-audio-player w-full" /> : <p className="text-sm text-[#74646b]">{audioError || labels.listeningAudioLoading}</p>}
      <p className="text-xs text-[#778079]">{formatFileSize(recording.audioSize, locale)}</p>
      {recording.status === 'completed' && recording.analysis ? <div className="grid gap-3">
        <div className="flex items-center gap-2 text-sm font-black text-[#356146]"><CheckCircle2 size={17} />{labels.listeningRecordingAnalysisTitle}</div>
        {recording.analysis.transcript ? <div className="rounded-lg bg-[#f7fbf7] p-3"><p className="text-xs font-black text-[#356146]">{labels.listeningRecordingTranscript}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#46514c]">{recording.analysis.transcript}</p></div> : null}
        {recording.analysis.referenceTranscript ? <details className="rounded-lg border border-[#dce9df] p-3"><summary className="cursor-pointer text-xs font-black text-[#356146]">{labels.listeningRecordingReferenceTranscript}</summary><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#46514c]">{recording.analysis.referenceTranscript}</p></details> : null}
        <p className="text-sm leading-6 text-[#46514c]">{recording.analysis.summary}</p>
        {recording.analysis.strengths.length ? <FeedbackList title={labels.listeningRecordingStrengths} items={recording.analysis.strengths} tone="good" /> : null}
        {recording.analysis.improvements.length ? <FeedbackList title={labels.listeningRecordingImprovements} items={recording.analysis.improvements} tone="improve" /> : null}
        <div className="rounded-lg bg-[#f3f6f1] p-3"><p className="text-xs font-black text-[#356146]">{labels.listeningRecordingNextPractice}</p><p className="mt-1 text-sm leading-6 text-[#46514c]">{recording.analysis.nextPractice}</p></div>
      </div> : recording.status === 'failed' ? <p className="text-sm leading-6 text-[#74646b]">{labels.listeningRecordingFailedBody}</p> : null}
    </div>
  </details>;
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
    <div className="grid min-w-0 gap-3">
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

function emptyListeningChoiceDetails(count: number) {
  return Array.from({ length: count }, () => ({ translation: '', explanation: '' }));
}

function resizeListeningChoiceDetails(details: { translation: string; explanation: string }[], count: number) {
  return Array.from({ length: count }, (_, index) => details[index] ?? { translation: '', explanation: '' });
}

function updateListeningChoiceDetail(details: { translation: string; explanation: string }[], index: number, key: 'translation' | 'explanation', value: string) {
  return details.map((detail, detailIndex) => detailIndex === index ? { ...detail, [key]: value } : detail);
}

function hasDistinctListeningQuestion(item: ListeningQuestion) {
  const normalize = (value: string) => value.trim().replace(/\s+/gu, ' ');
  return normalize(item.question) !== normalize(item.title);
}

function isFreeResponse(item: ListeningQuestion) {
  // A blank-text choice still means the source only prints numbered answer
  // boxes (still multiple choice); no choices at all means the author left
  // every option field empty, i.e. a genuine fill-in-the-blank question.
  return item.choices.length === 0;
}

function ListeningExplanation({ item, labels }: { item: ListeningQuestion; labels: Record<string, string> }) {
  const embedded = splitListeningExplanation(item.explanation ?? '');
  const sections = [
    ...embedded.filter((section) => section.kind === 'analysis'),
    ...(item.transcript?.trim() ? [{ title: labels.listeningTranscript, body: item.transcript.trim(), kind: 'transcript' as const }] : embedded.filter((section) => section.kind === 'transcript')),
    ...(item.transcriptTranslation?.trim() ? [{ title: labels.listeningTranscriptTranslation, body: item.transcriptTranslation.trim(), kind: 'translation' as const }] : embedded.filter((section) => section.kind === 'translation')),
  ];
  if (!sections.length) return null;
  return <div className="mt-4 grid gap-3" aria-label={labels.listeningExplanation}>
    {sections.map((section, index) => {
      const title = section.title || (section.kind === 'transcript' ? labels.listeningTranscript : section.kind === 'translation' ? labels.listeningTranscriptTranslation : labels.listeningExplanation.replace(/（.*?）|\(.*?\)/gu, '').trim());
      const content = <p lang={section.kind === 'transcript' ? 'ja' : undefined} className="whitespace-pre-wrap break-words text-sm leading-7 text-[#4f5b55]">{section.body}</p>;
      return <details key={`${section.kind}-${index}`} className={`rounded-lg border border-[#dce9df] p-4 ${section.kind === 'analysis' ? 'bg-[#f7fbf7]' : 'bg-white'}`}>
        <summary className="cursor-pointer font-bold text-[#31564c]">{title}</summary>
        <div className="mt-3 border-t border-[#e7eee8] pt-3">{content}</div>
      </details>;
    })}
  </div>;
}

function ListeningAnswerBreakdown({ item }: { item: ListeningQuestion }) {
  return (
    <details className="mt-4 rounded-lg border border-[#dce9df] bg-[#f7fbf7] p-4 text-sm leading-6 text-[#4f5b55]">
      <summary className="cursor-pointer font-bold text-[#31564c]">{listeningQuestionTypeName(item.questionTypeId)} · 解析要点</summary>
      <div className="mt-3 border-t border-[#e7eee8] pt-3">{isFreeResponse(item) ? <p>这是自由作答题：先比较你的回答是否完成了题目要求，再根据上方解析检查语气、信息和回应是否自然。</p> : <ol className="list-decimal space-y-1 pl-5">{item.choices.map((choice, index) => <li key={index} className={index === item.answerIndex ? 'font-bold text-[#356146]' : ''}>{choice || '（未填写）'}{index === item.answerIndex ? ' · 正确答案' : ''}</li>)}</ol>}</div>
    </details>
  );
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
import { useAuthoringNavigation } from '../../components/AuthoringNavigation';
