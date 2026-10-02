import { PracticeTimer } from '../../components/PracticeTimer';
import { LookupText } from '../review/WordLookup';
import { RecordReference } from '../../components/RecordReference';
import { ReadingExplanation } from './ReadingExplanation';
import './reading.css';
import { LearningListMetadata, LearningListColumns } from '../../components/LearningListMetadata';
import { useAuthoringNavigation } from '../../components/AuthoringNavigation';
import { LearningCatalog } from '../../components/LearningCatalog';
import { ModuleActionBar } from '../../components/ModuleActionBar';
import { LearningListRow } from '../../components/LearningList';
import { useConfirmation } from '../../components/confirmation';
import { ChevronLeft, ChevronRight, Clipboard, Lightbulb, Plus, ScrollText, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Locale, ProgressState, ReadingQuestion, ReadingQuestionInput } from '../../types';

// Keep original question IDs and answers; only share the passage presentation.
export function groupReadingQuestions(questions: ReadingQuestion[]) {
  const groups = new Map<string, ReadingQuestion[]>();
  for (const item of questions) {
    const key = item.passage.replace(/\r\n?/g, '\n').trim() || item.id;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()];
}

function questionCountLabel(count: number, locale: Locale) {
  return locale === 'ja' ? `全${count}問` : locale === 'en' ? `${count} questions` : `共 ${count} 题`;
}

type RecordReadingPractice = (item: ReadingQuestion, sessionId: string, correct: boolean) => Promise<void>;

type ReadingPanelProps = {
  activeQuestionId?: string;
  onBackToLibrary?: () => void;
  mode: 'practice' | 'library';
  labels: Record<string, string>;
  locale: Locale;
  questions: ReadingQuestion[];
  progress?: ProgressState;
  onRecordPractice: RecordReadingPractice;
  onCreate: (input: ReadingQuestionInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpenLibrary?: () => void;
  onPractice?: () => void;
  onTips?: () => void;
  onReview?: () => void;
};

export function ReadingPanel({ activeQuestionId, onBackToLibrary, mode, labels, locale, questions, progress = {}, onRecordPractice, onCreate, onDelete, onOpenLibrary, onPractice, onTips, onReview }: ReadingPanelProps) {
  const [title, setTitle] = useState('');
  const [passage, setPassage] = useState('');
  const [question, setQuestion] = useState('');
  const [choices, setChoices] = useState(['', '', '', '']);
  const [answerIndex, setAnswerIndex] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [tags, setTags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showAiForm, setShowAiForm] = useState(false);
  useAuthoringNavigation(mode === 'library' && !activeQuestionId ? (showForm ? '添加阅读材料' : showAiForm ? labels.aiGenerateFromLink : null) : null, () => { setShowForm(false); setShowAiForm(false); });
  // The library is always visible; the action bar above it replaces the old entry hub.
  const showLibrary = !showForm && !showAiForm;
  const [sourceUrl, setSourceUrl] = useState('');
  const [questionCount, setQuestionCount] = useState(3);
  const [activeTag, setActiveTag] = useState('全部');
  const availableTags = [...new Set(questions.flatMap((item) => item.tags ?? []))].sort();
  const groups = groupReadingQuestions(questions);
  const filteredGroups = activeTag === '全部' ? groups : groups.filter((group) => group.some((item) => (item.tags ?? []).includes(activeTag)));

  if (mode === 'practice') {
    return <ReadingPracticePanel labels={labels} locale={locale} questions={questions} onRecordPractice={onRecordPractice} onOpenLibrary={onOpenLibrary} />;
  }

  if (activeQuestionId) {
    const group = groups.find((items) => items.some((item) => item.id === activeQuestionId));
    return group ? <ReadingPassage key={group[0].passage} items={group} onRecordPractice={onRecordPractice} labels={labels} locale={locale} onDelete={async (id) => {
      await onDelete(id);
      if (id === activeQuestionId) {
        const remaining = group.find((item) => item.id !== id);
        if (remaining) window.location.replace(`#/reading/words/${encodeURIComponent(remaining.id)}`);
        else onBackToLibrary?.();
      }
    }} /> : <p>{labels.noSearchResults}</p>;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setSubmitting(true);
    try {
      await onCreate({ title, passage, question, choices, answerIndex, explanation, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean) });
      setTitle('');
      setPassage('');
      setQuestion('');
      setChoices(['', '', '', '']);
      setAnswerIndex(0);
      setExplanation('');
      setTags('');
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
      '请使用 JLPT Master Deck 本地 MCP / 本地后台，为当前账号生成阅读题库。',
      `素材链接：${url}`,
      `题目数量：${questionCount}`,
      '要求：读取文章内容，生成 JLPT N1 风格阅读题。每题包含标题、文章、题目、4 个选项、正确答案，以及中文总解析 explanation。以下解析均为必填，缺失或空白会被 MCP 拒绝：passageTranslation 完整中文翻译（覆盖所有段落，不能用摘要代替）；choiceExplanations 按选项顺序填写 text、中文 translation、逐项 analysis、原文 evidence、errorType；readingAnalysis 填写中文 summary、structure 和逐字引用原文的 keySentences；explanationNodes 用明确标题分节写出具体解题步骤和干扰项排除技巧。正确选项的 errorType 必须留空，三个错误选项必须标明类型。保存前逐项核对翻译、依据和推理质量；更新旧题时必须一次补齐缺失解析，不能清空必填字段。',
      '同一篇文章的各题请使用完全相同的文章全文，应用会合并展示为一篇多题。',
      '保存：生成后写入本应用的阅读题库，完成后告诉我生成了哪些题。',
    ].join('\n');
    await navigator.clipboard.writeText(prompt);
    setMessage(labels.aiPromptCopied);
  }

  return (
    <section className="ledger-word-index ledger-module-page min-w-0">
      {showForm || showAiForm ? null : <ModuleActionBar
        label="阅读"
        primary={onPractice ? { label: '开始练习', hint: '按题库顺序练一轮', onClick: onPractice } : undefined}
        actions={[
          ...(onTips ? [{ key: 'tips', label: '学习方法', icon: <Lightbulb size={16} aria-hidden="true" />, onClick: onTips }] : []),
          ...(onReview ? [{ key: 'review', label: labels.reviewPage, icon: <ScrollText size={16} aria-hidden="true" />, onClick: onReview }] : []),
          { key: 'ai', label: labels.aiGenerateFromLink, icon: <Sparkles size={16} aria-hidden="true" />, active: showAiForm, onClick: () => { setShowAiForm((value) => !value); setShowForm(false); setMessage(''); } },
          { key: 'add', label: '添加阅读材料', icon: <Plus size={16} aria-hidden="true" />, active: showForm, onClick: () => { setShowForm((value) => !value); setShowAiForm(false); setMessage(''); } },
        ]}
      />}

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

          <label className="block text-sm font-semibold text-[#46514c]">
            题目标签
            <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="例如：对比、全文主旨、信息社会（用逗号分隔）" maxLength={300} className="mt-2 h-11 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-base" />
          </label>

          <button type="submit" disabled={submitting} className="h-11 w-fit rounded-md bg-[#31564c] px-5 text-sm font-semibold text-white hover:bg-[#24473f] disabled:cursor-wait disabled:opacity-60">
            {submitting ? labels.readingSubmitting : labels.readingSubmit}
          </button>
        </form>
      ) : null}

      {showLibrary ? <>
        <div className="flex flex-wrap gap-2 border-b border-[#e1e7df] bg-white px-4 py-4 md:px-6">
          {['全部', ...availableTags].map((tag) => <button key={tag} type="button" onClick={() => { setActiveTag(tag); }} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${activeTag === tag ? 'border-[#31564c] bg-[#31564c] text-white' : 'border-[#c8d1c8] bg-white text-[#53605a]'}`}>{tag}</button>)}
        </div>
        <LearningCatalog columns={<LearningListColumns locale={locale} mobileReview={false} practiceCount
          title={locale === 'ja' ? '文章' : locale === 'en' ? 'Passage' : '文章'}
          collectionLabel={locale === 'ja' ? 'タグ' : locale === 'en' ? 'Tags' : '标签'}/>} title={locale === 'ja' ? '読解ライブラリ' : locale === 'en' ? 'Reading library' : '阅读题库'} items={filteredGroups} locale={locale}
          batch={{ id: (group) => group[0].id, actions: [{
            key: 'delete', danger: true, icon: <Trash2 size={16} aria-hidden="true"/>,
            label: locale === 'ja' ? '削除' : locale === 'en' ? 'Delete' : '删除',
            confirm: (count) => locale === 'ja' ? `選択した ${count} 件の文章と、その問題をすべて削除します。` : locale === 'en' ? `Delete ${count} selected passages and all of their questions?` : `将删除所选 ${count} 篇文章及其全部题目，删除后无法恢复。`,
            run: async (id) => { for (const item of filteredGroups.find((group) => group[0].id === id) ?? []) await onDelete(item.id); },
          }] }}
          searchText={(group) => group.map((item) => `${item.reference ?? ''} ${item.title} ${item.passage} ${item.question} ${(item.tags ?? []).join(' ')}`).join(' ')} renderRow={(group) => {
          const addedAt = group.map((item) => item.createdAt).filter((value) => value && Number.isFinite(Date.parse(value)))
            .sort((left, right) => Date.parse(left) - Date.parse(right))[0];
          const tags = [...new Set(group.flatMap((item) => item.tags ?? []))];
          return <LearningListRow key={group[0].id} title={group[0].title} references={group.map(item => item.reference)}
            metadata={<LearningListMetadata locale={locale} addedAt={addedAt} practiceCount={group.reduce((count, item) => count + (progress[item.id]?.reviewCount ?? 0), 0)}
              collectionLabel={locale === 'ja' ? 'タグ' : locale === 'en' ? 'Tags' : '标签'}
              collection={tags.length ? tags.join(' · ') : (locale === 'ja' ? 'タグなし' : locale === 'en' ? 'No tags' : '未分类')}/>}
            locale={locale} onOpen={() => { window.location.hash = `#/reading/words/${encodeURIComponent(group[0].id)}`; }}/>
        }}/>
      </> : null}
    </section>
  );
}

function ReadingPracticePanel({ labels, locale, questions, onRecordPractice, onOpenLibrary }: { labels: Record<string, string>; locale: Locale; questions: ReadingQuestion[]; onRecordPractice: RecordReadingPractice; onOpenLibrary?: () => void }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const groups = groupReadingQuestions(questions);
  const activeQuestion = groups[activeIndex % Math.max(groups.length, 1)];

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(groups.length - 1, 0)));
  }, [groups.length]);

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
          <span className="min-w-16 rounded-full bg-[#fff0f5] px-3 py-1 text-center text-sm font-bold text-[#a84269]">{activeIndex + 1} / {groups.length}</span>
          <button type="button" aria-label={labels.next} title={labels.next} disabled={activeIndex >= groups.length - 1} onClick={() => setActiveIndex((index) => Math.min(groups.length - 1, index + 1))} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#f0c9d4] bg-white text-[#a84269] hover:bg-[#fff0f5] disabled:cursor-not-allowed disabled:opacity-40">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <ReadingPassage key={activeQuestion[0].passage} items={activeQuestion} onRecordPractice={onRecordPractice} labels={labels} locale={locale} />
    </section>
  );
}

function ReadingPassage({ items, labels, locale, onDelete, onRecordPractice }: { items: ReadingQuestion[]; onRecordPractice: RecordReadingPractice; labels: Record<string, string>; locale: Locale; onDelete?: (id: string) => Promise<void> }) {
  const item = items[0];
  const [sessionId] = useState(() => crypto.randomUUID());
  const [segmented, setSegmented] = useState(false);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  return <article className="reading-passage min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="break-words text-xl font-semibold leading-8 text-[#27312c]">{item.title}</h2><PracticeTimer locale={locale} running={!items.every((question) => completedIds.includes(question.id))} /></div>
    <RecordReference reference={item.reference} locale={locale} />
    <p className="mt-2 text-sm text-[#778079]">{questionCountLabel(items.length, locale)}</p>
    <div className="reading-practice-layout">
    <details className="reading-passage-body" open>
      <summary className="cursor-pointer text-sm font-semibold text-[#31564c]">{locale === 'ja' ? '本文' : locale === 'en' ? 'Passage' : '阅读原文'}</summary>
      <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm text-[#31564c]">
        <input type="checkbox" role="switch" checked={segmented} onChange={(event) => setSegmented(event.target.checked)} />
        {locale === 'ja' ? '分かち書き・単語検索' : locale === 'en' ? 'Segment and look up words' : '分词查词'}
      </label>
      <p lang="ja" className={`mt-3 whitespace-pre-wrap break-words text-base leading-8 text-[#37473f]${segmented ? ' reading-segmented' : ''}`}>{segmented ? <LookupText text={item.passage} source={`阅读 ${item.reference ?? item.id} · ${item.title}`} /> : item.passage}</p>
    </details>
    <div className="reading-question-column divide-y divide-[#e1e7df]">
      {items.map((question, index) => <ReadingQuestionItem key={question.id} item={question} number={index + 1} onRecordPractice={(correct) => onRecordPractice(question, sessionId, correct)} onComplete={() => setCompletedIds((ids) => ids.includes(question.id) ? ids : [...ids, question.id])} segmented={segmented} labels={labels} locale={locale} onDelete={onDelete} />)}
    </div>
    </div>
  </article>;
}

function ReadingQuestionItem({ item, number, onRecordPractice, onComplete, segmented, labels, locale, onDelete }: { item: ReadingQuestion; number: number; onRecordPractice: (correct: boolean) => Promise<void>; onComplete: () => void; segmented: boolean; labels: Record<string, string>; locale: Locale; onDelete?: (id: string) => Promise<void> }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answerNotice, setAnswerNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const confirm = useConfirmation();
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!onDelete) return;
    if (!(await confirm({ title: labels.readingDelete, description: labels.readingDeleteConfirm, confirmLabel: labels.readingDelete, cancelLabel: labels.cancelAction, danger: true }))) return;
    setDeleting(true);
    try {
      await onDelete(item.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="min-w-0 py-6 first:pt-0" aria-label={locale === 'en' ? `Question ${number}` : `問 ${number}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-[#31564c]">{locale === 'en' ? `Question ${number}` : `問 ${number}`}</h3>
        {onDelete ? <QuestionAction label={`${labels.readingDelete}: ${item.question}`} title={labels.readingDelete} onClick={remove} disabled={deleting}><Trash2 size={16} /></QuestionAction> : null}
      </div>
      <RecordReference reference={item.reference} locale={locale} />
      {(item.tags ?? []).length ? <div className="mt-3 flex flex-wrap gap-2">{item.tags.map((tag) => <span key={tag} className="text-xs text-[#68716b]">#{tag}</span>)}</div> : null}
      <p className="mt-5 whitespace-pre-wrap text-lg font-bold leading-8">{item.question}</p>
      {segmented ? <p className="mt-3 text-xs text-[#68716b]">{locale === 'ja' ? '単語を押すと検索、番号を押すと解答を選択できます。' : locale === 'en' ? 'Click a word to look it up; click a number to select your answer.' : '点击词语查词，点击编号选择答案。'}</p> : null}
      <ChoiceGrid item={item} segmented={segmented} selected={selected} revealed={revealed} onSelect={(index) => { setSelected(index); setRevealed(false); setAnswerNotice(''); }} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={saving} onClick={async () => {
          if (selected === null) { setAnswerNotice(labels.readingSelectAnswer); return; }
          setAnswerNotice('');
          setSaving(true);
          try {
            await onRecordPractice(selected === item.answerIndex);
            setRevealed(true);
            onComplete();
          } catch (error) {
            setAnswerNotice(error instanceof Error ? error.message : '保存失败，请重试');
          } finally {
            setSaving(false);
          }
        }} className="h-10 rounded-md bg-[#31564c] px-4 text-sm font-semibold text-white">{labels.readingShowAnswer}</button>
        {answerNotice ? <p role="status" className="text-sm font-semibold text-[#8a6134]">{answerNotice}</p> : null}
        {revealed && selected !== null ? <p role="status" className={`text-sm font-semibold ${selected === item.answerIndex ? 'text-[#356146]' : 'text-[#8a493c]'}`}>{selected === item.answerIndex ? labels.readingCorrect : labels.readingWrong}</p> : null}
      </div>
      {revealed ? <ReadingExplanation item={item} locale={locale} /> : null}
    </section>
  );
}


function QuestionAction({ label, title, children, onClick, disabled }: { label: string; title: string; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={title} onClick={onClick} disabled={disabled} className="reading-question-action inline-flex h-11 w-11 items-center justify-center text-[#68716b] hover:text-[#8a493c] disabled:cursor-wait disabled:opacity-50">
      {children}
    </button>
  );
}

function ChoiceGrid({ item, segmented, selected, revealed, onSelect }: { item: ReadingQuestion; segmented: boolean; selected: number | null; revealed: boolean; onSelect: (index: number) => void }) {
  return (
    <div className="reading-choices mt-4">
      {item.choices.map((choice, index) => {
        const answerState = revealed
          ? index === item.answerIndex ? 'correct' : selected === index ? 'incorrect' : 'idle'
          : selected === index ? 'selected' : 'idle';
        if (segmented) {
          return (
            <div key={index} data-answer-state={answerState} className="reading-choice">
              <button type="button" aria-label={`${index + 1}. ${choice}`} aria-pressed={selected === index} onClick={() => onSelect(index)} className="reading-choice-number shrink-0">
                {index + 1}
              </button>
              <span lang="ja" className="reading-segmented min-w-0 whitespace-pre-wrap break-words">
                <LookupText text={choice} source={`阅读 ${item.reference ?? item.id} · ${item.title} · 選択肢 ${index + 1}`} />
              </span>
            </div>
          );
        }
        return (
          <button key={index} type="button" aria-pressed={selected === index} data-answer-state={answerState} onClick={() => onSelect(index)} className="reading-choice">
            <span className="reading-choice-number">{index + 1}</span>
            <span className="min-w-0 break-words">{choice}</span>
          </button>
        );
      })}
    </div>
  );
}
