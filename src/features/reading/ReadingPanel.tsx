import { AnswerCelebration } from '../../components/StudyCompanion';
import { SpeechControls } from '../../components/SpeechControls';
import { formatListDate } from '../../components/LearningListMetadata';
import { PracticeTimer } from '../../components/PracticeTimer';
import { ReadingRubyProvider, ReadingText } from './ReadingText';
import { RecordReference } from '../../components/RecordReference';
import { ReadingExplanation } from './ReadingExplanation';
import './reading.css';
import { useAuthoringNavigation } from '../../components/AuthoringNavigation';
import { LearningCatalog } from '../../components/LearningCatalog';
import { ModuleActionBar } from '../../components/ModuleActionBar';
import { LearningListRow, LearningListSelect } from '../../components/LearningList';
import { useConfirmation } from '../../components/confirmation';
import { usePageHeaderActions } from '../../components/PageChrome';
import { ChevronDown, ChevronLeft, ChevronRight, Clipboard, Lightbulb, Plus, ScrollText, Sparkles, Trash2 } from 'lucide-react';
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
  onAsk?: (question: string) => Promise<void>;
  onTips?: () => void;
  onReview?: () => void;
};

export function ReadingPanel({ activeQuestionId, onBackToLibrary, mode, labels, locale, questions, progress = {}, onRecordPractice, onCreate, onDelete, onOpenLibrary, onPractice, onAsk, onTips, onReview }: ReadingPanelProps) {
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
  useAuthoringNavigation(mode === 'library' && !activeQuestionId ? (showForm ? (locale === 'ja' ? '読解を追加' : locale === 'en' ? 'Add reading material' : '添加阅读材料') : showAiForm ? labels.aiGenerateFromLink : null) : null, () => { setShowForm(false); setShowAiForm(false); });
  // Local form state survives leaving and reopening the editor.
  const showLibrary = !showForm && !showAiForm;
  const [sourceUrl, setSourceUrl] = useState('');
  const [questionCount, setQuestionCount] = useState(3);
  const [activeTag, setActiveTag] = useState('全部');
  const availableTags = [...new Set(questions.flatMap((item) => item.tags ?? []))].sort();
  const groups = groupReadingQuestions(questions);
  const filteredGroups = activeTag === '全部' ? groups : groups.filter((group) => group.some((item) => (item.tags ?? []).includes(activeTag)));

  if (mode === 'practice') {
    return <ReadingPracticePanel labels={labels} locale={locale} questions={questions} progress={progress} onRecordPractice={onRecordPractice} onOpenLibrary={onOpenLibrary} />;
  }

  if (activeQuestionId) {
    const group = groups.find((items) => items.some((item) => item.id === activeQuestionId));
    return group ? <ReadingPassage key={group[0].passage} items={group} progress={progress} onRecordPractice={onRecordPractice} labels={labels} locale={locale} onDelete={async (id) => {
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
      '为原文、问题、选项及解析引用的日文补充 rubyTerms（text 原文片段、reading 上下文中的假名读音），不改写正文。多音词使用更长的词组区分，避免给中文注音。',
      '同一篇文章的各题请使用完全相同的文章全文，应用会合并展示为一篇多题。',
      '保存：生成后写入本应用的阅读题库，完成后告诉我生成了哪些题。',
    ].join('\n');
    await navigator.clipboard.writeText(prompt);
    setMessage(labels.aiPromptCopied);
  }

  return (
    <section className="reading-workspace ledger-word-index ledger-module-page min-w-0">
      {showForm || showAiForm ? null : <ModuleActionBar
        locale={locale}
        label="阅读"
        primary={onPractice ? { label: '开始练习', hint: '按题库顺序练一轮', onClick: () => { const group = filteredGroups[Math.floor(Math.random() * filteredGroups.length)]; if (group) window.location.hash = `#/reading/words/${encodeURIComponent(group[0].id)}`; } } : undefined}
        onAsk={onAsk}
        contentActions={filteredGroups.map((group) => ({ key: group[0].id, label: group[0].title, onClick: () => { window.location.hash = `#/reading/words/${encodeURIComponent(group[0].id)}`; } }))}

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
        <form className="content-authoring-form reading-authoring-form" onSubmit={submit}>
            <label className="block text-sm font-semibold text-[#46514c]">
              {labels.readingTitle}
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={labels.readingTitlePlaceholder} maxLength={120} className="mt-2 h-11 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-base" />
            </label>


          <label className="block text-sm font-semibold text-[#46514c]">
            {labels.readingPassage}
            <textarea value={passage} onChange={(event) => setPassage(event.target.value)} placeholder={labels.readingPassagePlaceholder} maxLength={8000} className="mt-2 min-h-40 w-full rounded-md border border-[#c8d1c8] bg-white p-3 text-base leading-7" required />
          </label>

          <label className="block text-sm font-semibold text-[#46514c]">
            {labels.readingQuestion}
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={labels.readingQuestionPlaceholder} maxLength={1000} className="mt-2 min-h-24 w-full rounded-md border border-[#c8d1c8] bg-white p-3 text-base leading-6" required />
          </label>

          <details className="content-form-group" onInvalid={(event) => { event.currentTarget.open = true; }}>
            <summary><strong>{locale === 'ja' ? '選択肢と解説' : locale === 'en' ? 'Choices and explanation' : '选项与解析'}</strong><span>{locale === 'ja' ? '選択肢 1–4・正解・解説（任意）' : locale === 'en' ? 'Choices 1–4 · correct answer · optional explanation' : '选项 1–4 · 正确答案 · 解析（可选）'}</span><ChevronDown size={18} aria-hidden="true" /></summary>
            <div className="content-form-group-body">
            <label className="block text-sm font-semibold text-[#46514c]">
              {labels.readingCorrectAnswer}
              <select value={answerIndex} onChange={(event) => setAnswerIndex(Number(event.target.value))} className="mt-2 h-11 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-base">
                {choices.map((choice, index) => <option key={index} value={index}>{index + 1}. {choice || labels.readingChoice.replace('{number}', String(index + 1))}</option>)}
              </select>
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
            </div>
          </details>

          <details className="content-form-group"><summary><strong>{locale === 'ja' ? 'タグ' : locale === 'en' ? 'Question tags' : '题目标签'}</strong><span>{tags || (locale === 'ja' ? '分類やテーマ（任意）' : locale === 'en' ? 'Optional categories and topics' : '分类、主题等（可选）')}</span><ChevronDown size={18} aria-hidden="true" /></summary><div className="content-form-group-body">
          <label className="block text-sm font-semibold text-[#46514c]">
            题目标签
            <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="例如：对比、全文主旨、信息社会（用逗号分隔）" maxLength={300} className="mt-2 h-11 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-base" />
          </label></div></details>

          <button type="submit" disabled={submitting} className="content-form-submit">
            {submitting ? labels.readingSubmitting : labels.readingSubmit}
          </button>
        </form>
      ) : null}

      {showLibrary ? <>
        <LearningCatalog appliedSummary={activeTag === '全部' ? undefined : activeTag} onReset={() => setActiveTag('全部')} title={locale === 'ja' ? '読解' : locale === 'en' ? 'Reading' : '阅读'} items={filteredGroups} locale={locale} columnLabels={[locale === 'ja' ? '文章' : locale === 'en' ? 'Passage' : '文章', locale === 'ja' ? '概要' : locale === 'en' ? 'Summary' : '摘要', null]}
          tools={<>
            <LearningListSelect label={locale === 'ja' ? 'タグ' : locale === 'en' ? 'Tags' : '标签'} value={activeTag} onChange={setActiveTag}><option value="全部">{locale === 'ja' ? 'すべて' : locale === 'en' ? 'All' : '全部'}</option>{availableTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</LearningListSelect>
            <div className="list-tools">
              <button type="button" onClick={() => { setShowForm(true); setShowAiForm(false); setMessage(''); }}><Plus size={16} aria-hidden="true" />{locale === 'ja' ? '読解を追加' : locale === 'en' ? 'Add reading material' : '添加阅读材料'}</button>
              <button type="button" onClick={() => { setShowAiForm(true); setShowForm(false); setMessage(''); }}><Sparkles size={16} aria-hidden="true" />{labels.aiGenerateFromLink}</button>
              {onTips ? <button type="button" onClick={onTips}><Lightbulb size={16} aria-hidden="true" />{locale === 'ja' ? '学習方法' : locale === 'en' ? 'Study tips' : '学习方法'}</button> : null}
              {onReview ? <button type="button" onClick={onReview}><ScrollText size={16} aria-hidden="true" />{labels.reviewPage}</button> : null}
            </div>
          </>}
          batch={{ id: (group) => group[0].id, actions: [{
            key: 'delete', danger: true, icon: <Trash2 size={16} aria-hidden="true"/>,
            label: locale === 'ja' ? '削除' : locale === 'en' ? 'Delete' : '删除',
            confirm: (count) => locale === 'ja' ? `選択した ${count} 件の文章と、その問題をすべて削除します。` : locale === 'en' ? `Delete ${count} selected passages and all of their questions?` : `将删除所选 ${count} 篇文章及其全部题目，删除后无法恢复。`,
            run: async (id) => { for (const item of filteredGroups.find((group) => group[0].id === id) ?? []) await onDelete(item.id); },
          }] }}
          searchText={(group) => group.map((item) => `${item.reference ?? ''} ${item.title} ${item.passage} ${item.question} ${(item.tags ?? []).join(' ')}`).join(' ')} renderRow={(group) => {
          const tags = [...new Set(group.flatMap((item) => item.tags ?? []))];
          const count = group.reduce((total, item) => total + (progress[item.id]?.reviewCount ?? 0), 0);
          const summary = [tags.slice(0, 2).join(' · '), questionCountLabel(group.length, locale), locale === 'ja' ? `解答 ${count} 回` : locale === 'en' ? `${count} answers` : `作答 ${count} 次`].filter(Boolean).join(' · ');
          return <LearningListRow key={group[0].id} title={group[0].title} description={summary}
            locale={locale} onOpen={() => { window.location.hash = `#/reading/words/${encodeURIComponent(group[0].id)}`; }}/>

        }}/>
      </> : null}
    </section>
  );
}

function ReadingPracticePanel({ labels, locale, questions, progress, onRecordPractice, onOpenLibrary }: { progress: ProgressState; labels: Record<string, string>; locale: Locale; questions: ReadingQuestion[]; onRecordPractice: RecordReadingPractice; onOpenLibrary?: () => void }) {
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
          <button type="button" onClick={onOpenLibrary} className="cute-button-primary mt-5 h-11 rounded-full px-4 text-sm font-bold text-white">
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
          <button type="button" aria-label={labels.prev} title={labels.prev} disabled={activeIndex === 0} onClick={() => setActiveIndex((index) => Math.max(0, index - 1))} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#f0c9d4] bg-white text-[#a84269] hover:bg-[#fff0f5] disabled:cursor-not-allowed disabled:opacity-40">
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-16 rounded-full bg-[#fff0f5] px-3 py-1 text-center text-sm font-bold text-[#a84269]">{activeIndex + 1} / {groups.length}</span>
          <button type="button" aria-label={labels.next} title={labels.next} disabled={activeIndex >= groups.length - 1} onClick={() => setActiveIndex((index) => Math.min(groups.length - 1, index + 1))} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#f0c9d4] bg-white text-[#a84269] hover:bg-[#fff0f5] disabled:cursor-not-allowed disabled:opacity-40">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <ReadingPassage key={activeQuestion[0].passage} items={activeQuestion} progress={progress} onRecordPractice={onRecordPractice} labels={labels} locale={locale} />
    </section>
  );
}

function ReadingPassage({ items, labels, locale, progress, onDelete, onRecordPractice }: { progress: ProgressState; items: ReadingQuestion[]; onRecordPractice: RecordReadingPractice; labels: Record<string, string>; locale: Locale; onDelete?: (id: string) => Promise<void> }) {
  const item = items[0];
  const [sessionId] = useState(() => crypto.randomUUID());
  const [segmented, setSegmented] = useState(false);
  const [showRuby, setShowRuby] = useState(false);
  const rubyTerms = items.flatMap((question) => question.rubyTerms ?? []);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [revealedIds, setRevealedIds] = useState<string[]>([]);
  const reviewAvailable = items.every((question) => completedIds.includes(question.id) || revealedIds.includes(question.id));
  const [passageOpen, setPassageOpen] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);
  useAuthoringNavigation(!passageOpen ? (locale === 'ja' ? '読解の解答' : locale === 'en' ? 'Reading questions' : '阅读作答') : null, () => setPassageOpen(true), { kind: 'practice' });
  const manageLabel = locale === 'ja' ? '管理' : locale === 'en' ? 'Manage' : '管理';
  const hasHeaderActions = usePageHeaderActions(onDelete ? [{ key: 'reading-manage', label: manageLabel, onClick: () => setManageOpen((open) => !open) }] : [], 20);
  return <ReadingRubyProvider terms={rubyTerms} enabled={reviewAvailable && showRuby}><article className="reading-passage min-w-0">
    <div className="reading-content-heading"><h2><ReadingText text={item.title} /></h2>{onDelete && !hasHeaderActions ? <button type="button" onClick={() => setManageOpen((open) => !open)} aria-expanded={manageOpen}>{manageLabel}</button> : null}</div>
    <div className="reading-session-summary"><PracticeTimer locale={locale} running={!reviewAvailable} /><span>{questionCountLabel(items.length, locale)}</span></div>
    {manageOpen ? <div className="reading-management"><RecordReference reference={item.reference} locale={locale} /><p>{[...new Set(items.flatMap((question) => question.tags ?? []))].join(' · ')}</p><p>{locale === 'ja' ? '追加日' : locale === 'en' ? 'Added' : '添加时间'} · {formatListDate(item.createdAt, '—', locale)}</p></div> : null}
    {reviewAvailable ? <div className="reading-display-options"><label><span>{locale === 'ja' ? 'ふりがなを表示' : locale === 'en' ? 'Show furigana' : '显示假名'}</span><input type="checkbox" role="switch" checked={showRuby} onChange={(event) => setShowRuby(event.target.checked)} /></label><label><span>{locale === 'ja' ? '分かち書き・単語検索' : locale === 'en' ? 'Word lookup' : '分词查词'}</span><input type="checkbox" role="switch" checked={segmented} onChange={(event) => setSegmented(event.target.checked)} /></label></div> : null}
    {reviewAvailable && showRuby && !rubyTerms.length ? <p role="status" className="mt-2 text-sm text-[#68716b]">{locale === 'ja' ? 'この文章にはまだ読みが登録されていません。' : locale === 'en' ? 'No readings have been added to this passage yet.' : '这篇文章尚未补充读音，补充后即可显示假名。'}</p> : null}
    <div className={`reading-practice-layout${passageOpen ? ' is-passage-open' : ' is-answering'}`}>
    <details className="reading-passage-body" open={passageOpen} onToggle={(event) => setPassageOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-semibold text-[#31564c]">{locale === 'ja' ? '本文' : locale === 'en' ? 'Passage' : '阅读原文'}</summary>
      {reviewAvailable ? <div className="reading-passage-speech"><SpeechControls text={item.passage} label={locale === 'ja' ? '本文を読み上げる' : locale === 'en' ? 'Read passage' : '朗读全文'} /></div> : null}
      {item.passage.split(/\n\s*\n|\n/).filter((paragraph) => paragraph.trim()).map((paragraph, index) => <div key={index}>
        <p lang="ja" className={`reading-original-text whitespace-pre-wrap break-words${reviewAvailable && segmented ? ' reading-segmented' : ''}`}><ReadingText text={paragraph} lookup={reviewAvailable && segmented} source={`阅读 ${item.reference ?? item.id} · ${item.title}`} /></p>
        {reviewAvailable ? <div className="reading-paragraph-speech"><SpeechControls iconOnly text={paragraph} label={locale === 'ja' ? `段落 ${index + 1}` : locale === 'en' ? `Paragraph ${index + 1}` : `朗读第 ${index + 1} 段`} /></div> : null}
      </div>)}
      <button type="button" className="reading-start-answer" onClick={() => { setPassageOpen(false); window.requestAnimationFrame(() => document.getElementById('reading-questions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }}>{locale === 'ja' ? '本文を閉じて解答する' : locale === 'en' ? 'Close passage and answer' : '收起原文并作答'}</button>
    </details>
    <div id="reading-questions" className="reading-question-column divide-y divide-[#e1e7df]">
      {items.map((question, index) => <ReadingQuestionItem key={question.id} item={question} number={index + 1} previouslyAnswered={completedIds.includes(question.id) || Boolean((progress[question.id]?.reviewCount ?? 0) > 0 || (progress[question.id]?.correct ?? 0) + (progress[question.id]?.wrong ?? 0) > 0)} revealed={revealedIds.includes(question.id)} setRevealed={(revealed) => setRevealedIds((ids) => revealed ? [...new Set([...ids, question.id])] : ids.filter((id) => id !== question.id))} onRecordPractice={(correct) => onRecordPractice(question, sessionId, correct)} onComplete={() => setCompletedIds((ids) => ids.includes(question.id) ? ids : [...ids, question.id])} segmented={reviewAvailable && segmented} labels={labels} locale={locale} onDelete={manageOpen ? onDelete : undefined} />)}
    </div>
    </div>
    {items.some((question) => revealedIds.includes(question.id)) ? <div className="reading-explanations mt-8">
      {items.map((question, index) => revealedIds.includes(question.id) ? <section key={question.id} aria-label={locale === 'ja' ? `問${index + 1}の解説` : locale === 'en' ? `Question ${index + 1} explanation` : `第 ${index + 1} 题解析`}>
        <h3 className="mb-3 text-sm font-bold text-[#31564c]">{locale === 'ja' ? `問${index + 1}の解説` : locale === 'en' ? `Question ${index + 1} explanation` : `第 ${index + 1} 题解析`}</h3>
        <ReadingExplanation item={question} locale={locale} />
      </section> : null)}
    </div> : null}
  </article></ReadingRubyProvider>;
}

function ReadingQuestionItem({ item, number, previouslyAnswered, revealed, setRevealed, onRecordPractice, onComplete, segmented, labels, locale, onDelete }: { item: ReadingQuestion; number: number; previouslyAnswered: boolean; revealed: boolean; setRevealed: (revealed: boolean) => void; onRecordPractice: (correct: boolean) => Promise<void>; onComplete: () => void; segmented: boolean; labels: Record<string, string>; locale: Locale; onDelete?: (id: string) => Promise<void> }) {
  const [selected, setSelected] = useState<number | null>(null);
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
    <section className="reading-question min-w-0 py-6 first:pt-0" aria-label={locale === 'en' ? `Question ${number}` : `問 ${number}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-[#31564c]">{locale === 'en' ? `Question ${number}` : `問 ${number}`}</h3>
        {onDelete ? <QuestionAction label={`${labels.readingDelete}: ${item.question}`} title={labels.readingDelete} onClick={remove} disabled={deleting}><Trash2 size={16} /></QuestionAction> : null}
      </div>
      {onDelete ? <RecordReference reference={item.reference} locale={locale} /> : null}
      {onDelete && (item.tags ?? []).length ? <div className="mt-3 flex flex-wrap gap-2">{item.tags.map((tag) => <span key={tag} className="text-xs text-[#68716b]">#{tag}</span>)}</div> : null}
      <p className="reading-question-stem whitespace-pre-wrap"><ReadingText text={item.question} /></p>
      {segmented ? <p className="mt-3 text-xs text-[#68716b]">{locale === 'ja' ? '単語を押すと検索、番号を押すと解答を選択できます。' : locale === 'en' ? 'Click a word to look it up; click a number to select your answer.' : '点击词语查词，点击编号选择答案。'}</p> : null}
      <ReadingChoiceGrid item={item} segmented={segmented} selected={selected} revealed={revealed} onSelect={(index) => { setSelected(index); setRevealed(false); setAnswerNotice(''); }} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {previouslyAnswered && !revealed ? <button type="button" className="reading-view-answer" disabled={saving} onClick={() => { setSelected(null); setAnswerNotice(''); setRevealed(true); }}>{locale === 'ja' ? '解答を見る' : locale === 'en' ? 'View answer' : '查看答案'}</button> : null}
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
        }} className="reading-confirm-answer">{labels.readingShowAnswer}</button>
        {answerNotice ? <p role="status" className="text-sm font-semibold text-[#8a6134]">{answerNotice}</p> : null}
        <AnswerCelebration correct={revealed && selected !== null && selected === item.answerIndex} />
        {revealed && selected !== null ? <p role="status" className={`text-sm font-semibold ${selected === item.answerIndex ? 'text-[#356146]' : 'text-[#8a493c]'}`}>{selected === item.answerIndex ? labels.readingCorrect : labels.readingWrong}</p> : null}
      </div>
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

export function ReadingChoiceGrid({ item, segmented, selected, revealed, onSelect }: { item: ReadingQuestion; segmented: boolean; selected: number | null; revealed: boolean; onSelect: (index: number) => void }) {
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
                <ReadingText lookup text={choice} source={`阅读 ${item.reference ?? item.id} · ${item.title} · 選択肢 ${index + 1}`} />
              </span>
            </div>
          );
        }
        return (
          <button key={index} type="button" aria-pressed={selected === index} data-answer-state={answerState} onClick={() => onSelect(index)} className="reading-choice">
            <span className="reading-choice-number">{index + 1}</span>
            <span className="min-w-0 break-words"><ReadingText text={choice} /></span>
          </button>
        );
      })}
    </div>
  );
}
