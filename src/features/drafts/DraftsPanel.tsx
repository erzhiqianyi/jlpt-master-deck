import { RecordReference } from '../../components/RecordReference';
import { LearningCatalog } from '../../components/LearningCatalog';
import { LearningList, LearningListRow } from '../../components/LearningList';
import { isTopicDraft } from '../../domain/practicePurpose';
import { useMobileList } from '../../hooks/useMobileList';
import { useConfirmation } from '../../components/confirmation';
import { QuestionReviewWorkspace } from './QuestionReviewWorkspace';
import { ArrowLeft, ChevronRight, MessageSquare, MoreHorizontal, BookOpenText, ClipboardList, FileText, Languages, Lightbulb, ListChecks, Trash2, type LucideIcon } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { DraftSummary, ReviewPackDraft } from '../../types';

type DraftsPanelProps = {
  labels: Record<string, string>;
  drafts: DraftSummary[];
  activeDraft: ReviewPackDraft | null;
  annotation: string;
  onAnnotationChange: (value: string) => void;
  onCreateDailyDraft: () => void;
  onSelectDraft: (id: string) => void;
  onSaveAnnotation: () => void;
  onCopyRevisionContext: () => void;
  onCreateDraftFromSelection?: (ids: string[]) => Promise<string | null>;
  onDeleteDraft?: (id: string) => Promise<void>;
  onConfirmDraft?: (id: string, input: { unknownWords: string }) => Promise<void>;
  onPublishDraft?: (id: string) => Promise<void>;
  onUpdateDraft?: (id: string, input: { title: string; content: unknown }) => Promise<void>;
  detailDraftId?: string | null;
  onDetailDraftChange?: (id: string | null) => void;
  onSaveQuestionReview?: (id: string, body: string) => Promise<void>;
  onFinalizeReviewedDraft?: (id: string) => Promise<void>;
  embedded?: boolean;
};

export function DraftsPanel({
  labels,
  drafts,
  activeDraft,
  annotation,
  onAnnotationChange,
  onSelectDraft,
  onSaveAnnotation,
  onCopyRevisionContext,
  onCreateDraftFromSelection,
  onDeleteDraft,
  onConfirmDraft,
  onPublishDraft,
  onUpdateDraft,
  detailDraftId,
  onDetailDraftChange,
  onSaveQuestionReview,
  onFinalizeReviewedDraft,
  embedded = false,
}: DraftsPanelProps) {
  const confirm = useConfirmation();
  const [internalDetailDraftId, setInternalDetailDraftId] = useState<string | null>(null);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [confirmingDraftId, setConfirmingDraftId] = useState<string | null>(null);
  const [publishingDraftId, setPublishingDraftId] = useState<string | null>(null);
  const [unknownWords, setUnknownWords] = useState('');
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingContent, setEditingContent] = useState('');
  const [editingError, setEditingError] = useState('');
  const [savingDraftId, setSavingDraftId] = useState<string | null>(null);
  const selectedDraftIdSet = useMemo(() => new Set(selectedDraftIds), [selectedDraftIds]);
  const [manageList, setManageList] = useState(false);
  const mobileList = useMobileList(drafts.length, 'drafts', 6);
  const orderedDrafts = useMemo(() => [...drafts].sort((a, b) => {
    const priority = (status: string) => ['draft', 'needs_revision'].includes(status) ? 0 : status === 'approved' ? 1 : 2;
    return priority(a.status) - priority(b.status) || b.updated_at.localeCompare(a.updated_at);
  }), [drafts]);
  const draftStatusText = (status: string) => ({ draft: '待审核', needs_revision: '待修改', approved: '已确认', archived: '已归档' }[status] ?? status);
  const selectedCount = selectedDraftIds.length;
  const currentDetailDraftId = detailDraftId === undefined ? internalDetailDraftId : detailDraftId;
  const showingDetail = Boolean(currentDetailDraftId);
  const detailDraft = activeDraft?.id === currentDetailDraftId ? activeDraft : null;
  const contentRecord = detailDraft && isRecord(detailDraft.content) ? detailDraft.content as GrammarReviewPack : null;
  const reviewQuestions = [contentRecord?.generated_practice, contentRecord?.quiz, contentRecord?.practice_questions, contentRecord?.review_questions].find((list) => Array.isArray(list) && list.length) ?? [];
  const hasQuestionReview = Array.isArray(reviewQuestions) && reviewQuestions.length > 0 && onSaveQuestionReview && onFinalizeReviewedDraft;

  function setCurrentDetailDraftId(id: string | null) {
    if (detailDraftId === undefined) {
      setInternalDetailDraftId(id);
    }
    onDetailDraftChange?.(id);
  }

  function openDraft(id: string) {
    setCurrentDetailDraftId(id);
    setUnknownWords('');
    cancelDraftEditing();
    onSelectDraft(id);
  }

  function backToList() {
    setCurrentDetailDraftId(null);
    cancelDraftEditing();
  }

  function toggleDraft(id: string) {
    setSelectedDraftIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAllDrafts() {
    const ids = orderedDrafts.map((draft) => draft.id);
    const allSelected = ids.every((id) => selectedDraftIdSet.has(id));
    setSelectedDraftIds(allSelected ? [] : ids);
  }

  async function organizeSelectedDrafts() {
    if (!onCreateDraftFromSelection || !selectedDraftIds.length) return;
    setSelectionBusy(true);
    try {
      const nextId = await onCreateDraftFromSelection(selectedDraftIds);
      setSelectedDraftIds([]);
      if (nextId) setCurrentDetailDraftId(nextId);
    } finally {
      setSelectionBusy(false);
    }
  }

  async function deleteDraft(id: string) {
    if (!onDeleteDraft || deletingDraftId) return;
    const target = drafts.find((draft) => draft.id === id);
    if (!(await confirm({ title: labels.deleteDraft, description: labels.deleteDraftConfirm.replace('{title}', target?.title ?? labels.draftUntitledItem), confirmLabel: labels.deleteDraft, cancelLabel: labels.cancelAction, danger: true }))) return;
    setDeletingDraftId(id);
    try {
      await onDeleteDraft(id);
      setSelectedDraftIds((current) => current.filter((item) => item !== id));
      if (currentDetailDraftId === id) {
        setCurrentDetailDraftId(null);
      }
    } finally {
      setDeletingDraftId(null);
    }
  }

  async function confirmDraftForAgent(id: string) {
    if (!onConfirmDraft || confirmingDraftId) return;
    setConfirmingDraftId(id);
    try {
      await onConfirmDraft(id, { unknownWords });
      setUnknownWords('');
    } finally {
      setConfirmingDraftId(null);
    }
  }

  async function publishDraft(id: string) {
    if (!onPublishDraft || publishingDraftId) return;
    setPublishingDraftId(id);
    try {
      await onPublishDraft(id);
    } finally {
      setPublishingDraftId(null);
    }
  }

  function startDraftEditing(draft: ReviewPackDraft) {
    setEditingDraftId(draft.id);
    setEditingTitle(draft.title);
    setEditingContent(JSON.stringify(draft.content, null, 2));
    setEditingError('');
  }

  function cancelDraftEditing() {
    setEditingDraftId(null);
    setEditingTitle('');
    setEditingContent('');
    setEditingError('');
    setSavingDraftId(null);
  }

  async function saveDraftEdits(id: string) {
    if (!onUpdateDraft || savingDraftId) return;
    const title = editingTitle.trim();
    if (!title) {
      setEditingError(labels.draftEditTitleRequired);
      return;
    }
    let content: unknown;
    try {
      content = JSON.parse(editingContent);
    } catch {
      setEditingError(labels.draftEditInvalidJson);
      return;
    }
    setSavingDraftId(id);
    setEditingError('');
    try {
      await onUpdateDraft(id, { title, content });
      cancelDraftEditing();
    } catch (error) {
      setEditingError(error instanceof Error ? error.message : labels.draftEditSaveFailed);
      setSavingDraftId(null);
    }
  }

  return (
    <section className="min-w-0 space-y-4">
      {embedded ? (!showingDetail ? (
        <div className="mobile-action-row flex justify-end gap-3">
          {!manageList ? <button type="button" className="gentle-back" onClick={() => setManageList(true)}>管理</button> : null}
        </div>
      ) : null) : <div className="min-w-0 rounded-lg border border-[#d7dfd6] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">{labels.draftsTitle}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[#5f625b]">{labels.draftsBody}</p>
          </div>
        </div>
      </div>}

      {embedded && drafts.length === 0 ? (
        <div className="border-y border-[#dfe5df] py-8">
          <h3 className="text-lg font-semibold text-[#27312c]">{labels.noDrafts}</h3>
          <p className="mt-2 text-sm leading-6 text-[#68716b]">{labels.noDraftsBody}</p>
        </div>
      ) : showingDetail ? (
        <article className="gentle-draft min-w-0 rounded-lg border border-[#d7dfd6] bg-white shadow-sm">
          {detailDraft ? (
            <>
              <div className="gentle-draft-back border-b border-[#e1e6df] p-4 md:p-5">
                <button type="button" onClick={backToList} className="inline-flex items-center gap-2 text-sm font-semibold text-[#31564c] hover:underline">
                  <ArrowLeft size={16} /> {labels.draftBackToList}
                </button>
              </div>
              <div className="gentle-draft-heading flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between md:p-5">
                <div>
                  
                  <h3 title={detailDraft.title} className="mt-1 text-2xl font-semibold">{detailDraft.title}</h3>
                  <RecordReference reference={detailDraft.reference} />
                </div>
                <PreviewDisclosure title="更多操作" icon={MoreHorizontal}><div className="mobile-action-row flex flex-wrap gap-2">
                  <button type="button" onClick={onCopyRevisionContext} className="h-10 rounded-md border border-[#cbd6cf] bg-white px-3 text-sm font-semibold text-[#24473f]">
                    {labels.revisionContext}
                  </button>
                  {onUpdateDraft ? (
                    <button type="button" onClick={() => startDraftEditing(detailDraft)} disabled={editingDraftId === detailDraft.id} className="h-10 rounded-md border border-[#cbd6cf] bg-white px-3 text-sm font-semibold text-[#24473f] disabled:cursor-default disabled:opacity-60">
                      {labels.draftEdit}
                    </button>
                  ) : null}
                  {onDeleteDraft ? (
                    <button type="button" onClick={() => deleteDraft(detailDraft.id)} disabled={deletingDraftId === detailDraft.id} className="inline-flex h-10 items-center gap-2 rounded-md border border-[#d7b9ad] bg-white px-3 text-sm font-semibold text-[#8f3d2e] disabled:cursor-wait disabled:opacity-60">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      {deletingDraftId === detailDraft.id ? labels.processing : labels.deleteDraft}
                    </button>
                  ) : null}
                </div></PreviewDisclosure>
              </div>

              <div className="gentle-draft-body grid gap-5 border-t border-[#edf0ec] p-4 md:p-5">
                <div className="min-w-0">
                  {editingDraftId === detailDraft.id ? (
                    <DraftEditor
                      labels={labels}
                      title={editingTitle}
                      content={editingContent}
                      error={editingError}
                      saving={savingDraftId === detailDraft.id}
                      onTitleChange={setEditingTitle}
                      onContentChange={setEditingContent}
                      onCancel={cancelDraftEditing}
                      onSave={() => saveDraftEdits(detailDraft.id)}
                    />
                  ) : (
                    hasQuestionReview ? <QuestionReviewWorkspace key={detailDraft.id} draft={detailDraft} questions={reviewQuestions}
                      renderQuestion={(index) => <QuestionList key={JSON.stringify([index, reviewQuestions[index]])} questions={[reviewQuestions[index]]} labels={labels} startNumber={index + 1} hidePagination />}
                      onSave={onSaveQuestionReview!} onFinalize={onFinalizeReviewedDraft!} />
                      : <DraftContentPreview key={detailDraft.id} content={detailDraft.content} labels={labels} />
                  )}
                </div>
                {!hasQuestionReview ? <aside className="gentle-draft-notes min-w-0 space-y-4">
                  <PreviewDisclosure title="有不认识的词，或想改的地方？" buttonLabel="记生词 / 提建议" icon={MessageSquare}>
                  {onConfirmDraft ? (
                    <section className="rounded-lg border border-[#d8e1d9] bg-[#f8faf7] p-4">
                      <h4 className="text-base font-semibold">记下不认识的词</h4>
                      <p className="mt-2 text-sm leading-6 text-[#68716b]">可以先记在这里，确认时会一起提交。</p>
                      <label className="mt-3 block text-sm font-semibold text-[#34413b]">
                        {labels.draftUnknownWords}
                        <textarea
                          value={unknownWords}
                          onChange={(event) => setUnknownWords(event.target.value)}
                          placeholder={labels.draftUnknownWordsPlaceholder}
                          className="mt-2 min-h-24 w-full rounded-md border border-[#c8bcae] bg-white p-3 text-sm leading-6"
                        />
                      </label>
                    </section>
                  ) : null}

                  <section className="rounded-lg border border-[#e2ddd3] bg-white p-4">
                    <h4 className="text-base font-semibold">写下你的想法</h4>
                    <div className="mt-3 grid gap-2">
                      {detailDraft.annotations.length ? detailDraft.annotations.map((item) => (
                        <p key={item.id} className="rounded-md bg-[#fffaf4] p-3 text-sm leading-6 text-[#4f5b55]">
                          {item.body}
                        </p>
                      )) : (
                        <p className="rounded-md bg-[#f5f7f3] p-3 text-sm leading-6 text-[#5f625b]">{labels.addAnnotation}</p>
                      )}
                    </div>
                    <textarea
                      value={annotation}
                      onChange={(event) => onAnnotationChange(event.target.value)}
                      aria-label="想改的地方" placeholder="比如：这道题太难了，想多看一个例子。"
                      className="mt-4 min-h-28 w-full rounded-md border border-[#c8bcae] bg-white p-3 text-sm leading-6"
                    />
                    <button type="button" onClick={onSaveAnnotation} className="mt-3 h-10 rounded-md bg-[#173d35] px-4 text-sm font-semibold text-white">
                      {labels.saveAnnotation}
                    </button>
                  </section>
                  </PreviewDisclosure>
                  <div className="gentle-draft-confirm">
                    <p>{detailDraft.status === 'archived' ? '这份练习已经整理好了。' : detailDraft.status === 'approved' ? (isTopicDraft(detailDraft) ? '已确认，可以保存为专项练习了。' : '已确认。加入今日练习后，就可以开始做题了。') : '看完了吗？先确认题目，再开始练习。'}</p>
                    <div className="flex flex-wrap gap-3">                  {onConfirmDraft && !['approved', 'archived'].includes(detailDraft.status) ? (
                    <button type="button" onClick={() => confirmDraftForAgent(detailDraft.id)} disabled={confirmingDraftId === detailDraft.id} className="h-10 rounded-md bg-[#173d35] px-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">
                      {confirmingDraftId === detailDraft.id ? '正在提交…' : '确认这份练习'}
                    </button>
                  ) : null}
                  {onPublishDraft && ['approved', 'archived'].includes(detailDraft.status) ? (
                    <button type="button" onClick={() => publishDraft(detailDraft.id)} disabled={publishingDraftId === detailDraft.id} className="h-10 rounded-md bg-[#a84269] px-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">
                      {publishingDraftId === detailDraft.id ? '正在准备…' : isTopicDraft(detailDraft) ? '保存为专项练习并开始' : '加入今日练习'}
                    </button>
                  ) : null}
</div>
                  </div>
                </aside> : null}
              </div>
            </>
          ) : (
            <div className="mt-5 rounded-md bg-[#f5f7f3] p-4">
              <h3 className="text-xl font-semibold">{labels.draftLoading}</h3>
              <p className="mt-2 text-sm leading-6 text-[#5f625b]">{labels.draftLoadingBody}</p>
            </div>
          )}
        </article>
      ) : !manageList ? (
        <LearningCatalog columnLabels={["草稿", "更新时间", "状态"]} title="练习草稿" items={orderedDrafts} tools={!embedded ? <button type="button" onClick={() => setManageList(true)}>管理</button> : undefined} searchText={(draft) => `${draft.reference ?? ''} ${draft.title} ${draftStatusText(draft.status)}`} renderRow={(draft) => <LearningListRow key={draft.id} title={draft.title} references={[draft.reference]} description={formatDate(draft.updated_at)} statusKind={draft.status === "needs_revision" ? "needs_revision" : draft.status === "approved" ? "approved" : draft.status === "archived" ? "archived" : "draft"} status={draftStatusText(draft.status)} onOpen={() => openDraft(draft.id)}/>}/>

      ) : (
        <section className="min-w-0 space-y-4">
          <button type="button" className="gentle-back" onClick={() => { setManageList(false); setSelectedDraftIds([]); }}>完成</button>
          <div className="mobile-action-header flex flex-wrap items-center gap-3">
            {selectedCount ? (
              <div className="mobile-action-row flex flex-wrap items-center gap-3 text-sm">
                <span className="font-semibold text-[#31564c]">{labels.draftSelectedCount}: {selectedCount}</span>
                {onCreateDraftFromSelection ? (
                  <button type="button" onClick={organizeSelectedDrafts} disabled={selectionBusy} className="h-10 rounded-md bg-[#173d35] px-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">
                    {selectionBusy ? labels.processing : labels.organizeSelectedDrafts}
                  </button>
                ) : null}
                <button type="button" onClick={() => setSelectedDraftIds([])} className="font-semibold text-[#856033] hover:underline">
                  {labels.clearSelection}
                </button>
              </div>
            ) : null}
          </div>

          {drafts.length ? (
            <section className="rounded-lg border border-[#d7dfd6] bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-[#e0e6df] px-4 py-3">
                <label className="flex min-w-0 items-center gap-3">
                  <input type="checkbox" checked={orderedDrafts.every((draft) => selectedDraftIdSet.has(draft.id))} onChange={toggleAllDrafts} className="h-4 w-4 accent-[#31564c]" />
                  <span className="font-semibold text-[#27312c]">{labels.draftSelectAll}</span>
                </label>
                <span className="text-sm font-semibold text-[#68716b]">{orderedDrafts.length} {labels.draftItemsUnit}</span>
              </div>
              <LearningList hasActions columnLabels={["草稿", "更新时间", "状态"]}>{orderedDrafts.map((draft) => <LearningListRow key={draft.id} inlineActions title={draft.title} references={[draft.reference]} description={formatDate(draft.updated_at)} statusKind={draft.status === "needs_revision" ? "needs_revision" : draft.status === "approved" ? "approved" : draft.status === "archived" ? "archived" : "draft"} status={draftStatusText(draft.status)} onOpen={() => openDraft(draft.id)} secondary={<div className="learning-list-manage-actions">
                <label><input type="checkbox" checked={selectedDraftIdSet.has(draft.id)} onChange={() => toggleDraft(draft.id)} aria-label={`选择: ${draft.title}`}/></label>
                {onDeleteDraft ? <button type="button" aria-label={deletingDraftId === draft.id ? labels.processing : labels.deleteDraft} title={labels.deleteDraft} onClick={() => deleteDraft(draft.id)} disabled={deletingDraftId === draft.id}><Trash2 size={20} aria-hidden="true"/></button> : null}
              </div>}/>)}</LearningList>
            </section>
          ) : (
            <LearningList hasActions columnLabels={["草稿", "更新时间", "状态"]}/>
          )}
        </section>
      )}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short' }).format(new Date(value));
}

type GrammarItem = {
  id?: string;
  expression?: string;
  point?: string;
  meaning_zh?: string;
  connection?: string;
  usage?: string;
  example_ja?: string;
  example_zh?: string;
  core_memory?: string;
  exam_tip?: string;
};

type DraftQuestion = {
  id?: string;
  type?: string;
  kind?: string;
  prompt?: string;
  instruction?: string;
  choices?: string[];
  answer?: string;
  answerIndex?: number;
  explanation_zh?: string;
  tested_expression?: string;
  tested?: string;
  full_order?: string;
  target_blank_index?: number;
  item_id?: string;
  promptTarget?: string;
};

type AnswerStrategy = {
  title?: string;
  points_zh?: string[];
};

type DraftSection = {
  id?: string | number;
  title?: string;
  instruction?: string;
  body?: string;
  items?: unknown[];
  questions?: DraftQuestion[];
};

type DraftPracticePlan = {
  minutes?: number;
  task?: string;
};

type DraftWeakQuestionType = {
  kind?: string;
  total?: number;
  correct?: number;
  wrong?: number;
  accuracy?: number;
  lastAnsweredAt?: string;
};

type DraftDiagnosis = {
  weak_question_types?: DraftWeakQuestionType[];
  recent_wrong_answers?: unknown[];
  rule?: string;
};

type BlankAnalysis = {
  blank?: string;
  answer?: string;
  grammar_point?: string;
  explanation_zh?: string;
  distractors?: Record<string, string>;
};

type OriginalQuestion = {
  passage?: string;
  notes?: string[];
};

type GrammarReviewPack = {
  description?: string;
  kind?: string;
  strategy?: string;
  minutes?: number;
  practice_plan?: DraftPracticePlan[];
  diagnosis?: DraftDiagnosis;
  jlpt_level?: string;
  topic?: string;
  original_question?: OriginalQuestion;
  normalized?: { passage?: string };
  translation_zh?: string;
  grammar_items?: GrammarItem[];
  grammar_points?: GrammarItem[];
  answer_analysis?: BlankAnalysis[];
  source_questions?: DraftQuestion[];
  practice_questions?: DraftQuestion[];
  review_questions?: DraftQuestion[];
  generated_practice?: DraftQuestion[];
  quiz?: DraftQuestion[];
  warmup?: unknown[];
  answer_strategy?: AnswerStrategy;
  strategy_summary?: string[];
  sections?: DraftSection[];
  time_limit_minutes?: number;
  points_per_question?: number;
  total_points?: number;
  question_count?: number;
  next_step?: string;
};

function DraftEditor({
  labels,
  title,
  content,
  error,
  saving,
  onTitleChange,
  onContentChange,
  onCancel,
  onSave,
}: {
  labels: Record<string, string>;
  title: string;
  content: string;
  error: string;
  saving: boolean;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <section className="mt-5 border-t border-[#e1e6df] pt-5">
      <div className="grid gap-4">
        <label className="grid gap-2 text-sm font-semibold text-[#34413b]">
          {labels.draftEditTitle}
          <input
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            className="h-11 rounded-md border border-[#c8d1c8] bg-white px-3 text-base font-normal text-[#27312c]"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#34413b]">
          {labels.draftEditContent}
          <textarea
            value={content}
            onChange={(event) => onContentChange(event.target.value)}
            spellCheck={false}
            className="min-h-[420px] rounded-md border border-[#c8d1c8] bg-[#fbfcfa] p-3 font-mono text-sm font-normal leading-6 text-[#27312c]"
          />
        </label>
      </div>
      {error ? <p className="mt-3 rounded-md border border-[#e6c3b9] bg-[#fff8f5] p-3 text-sm font-semibold text-[#8f3d2e]">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onSave} disabled={saving} className="h-10 rounded-md bg-[#173d35] px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">
          {saving ? labels.processing : labels.draftEditSave}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="h-10 rounded-md border border-[#cbd6cf] bg-white px-4 text-sm font-semibold text-[#24473f] disabled:cursor-wait disabled:opacity-60">
          {labels.draftEditCancel}
        </button>
      </div>
    </section>
  );
}

function DraftContentPreview({ content, labels }: { content: unknown; labels: Record<string, string> }) {
  const draft = isRecord(content) ? content as GrammarReviewPack : null;

  if (!draft) {
    return (
      <div className="mt-4 border-y border-[#e1e6df] py-6 text-sm leading-6 text-[#68716b]">
        {labels.draftReadableFallback}
      </div>
    );
  }

  const grammarItems = Array.isArray(draft.grammar_items) ? draft.grammar_items : [];
  const grammarPoints = Array.isArray(draft.grammar_points) ? draft.grammar_points : [];
  const answerAnalysis = Array.isArray(draft.answer_analysis) ? draft.answer_analysis : [];
  const sourceQuestions = Array.isArray(draft.source_questions) ? draft.source_questions : [];
  const practiceQuestions = Array.isArray(draft.practice_questions) ? draft.practice_questions : [];
  const reviewQuestions = Array.isArray(draft.review_questions) ? draft.review_questions : [];
  const generatedPractice = Array.isArray(draft.generated_practice) ? draft.generated_practice : [];
  const dailyQuiz = generatedPractice.length ? generatedPractice : Array.isArray(draft.quiz) ? draft.quiz : [];
  const practicePlan = Array.isArray(draft.practice_plan) ? draft.practice_plan : [];
  const weakQuestionTypes = Array.isArray(draft.diagnosis?.weak_question_types) ? draft.diagnosis.weak_question_types : [];
  const warmup = Array.isArray(draft.warmup) ? draft.warmup : [];
  const strategyPoints = Array.isArray(draft.answer_strategy?.points_zh) ? draft.answer_strategy.points_zh : [];
  const strategySummary = Array.isArray(draft.strategy_summary) ? draft.strategy_summary : [];
  const sections = Array.isArray(draft.sections) ? draft.sections : [];
  const sectionQuestionCount = sections.reduce((total, section) => total + (Array.isArray(section.questions) ? section.questions.length : 0), 0);
  const visualized = Boolean(
    grammarItems.length
    || grammarPoints.length
    || answerAnalysis.length
    || sourceQuestions.length
    || practiceQuestions.length
    || reviewQuestions.length
    || dailyQuiz.length
    || practicePlan.length
    || weakQuestionTypes.length
    || warmup.length
    || strategyPoints.length
    || strategySummary.length
    || draft.original_question?.passage
    || draft.normalized?.passage
    || draft.translation_zh
    || sections.length,
  );

  return (
    <div className="gentle-draft-preview mt-5 space-y-8">
      <div className="gentle-draft-meta flex flex-wrap gap-2 text-xs font-semibold">
        {draft.kind ? <span className="rounded bg-[#edf4ef] px-2 py-1 text-[#31564c]">{readableKind(draft.kind, labels)}</span> : null}
        {draft.jlpt_level ? <span className="rounded bg-[#f1eee8] px-2 py-1 text-[#584f43]">{draft.jlpt_level}</span> : null}
        {draft.description ? <p className="w-full text-sm text-[#4f5b55]">{draft.description}</p> : null}
        {draft.topic ? <span className="rounded bg-[#f5f7f3] px-2 py-1 text-[#4f5b55]">{draft.topic}</span> : null}
        
        {draft.minutes ? <span className="rounded bg-[#f5f7f3] px-2 py-1 text-[#4f5b55]">{draft.minutes} 分钟</span> : null}
        {draft.time_limit_minutes ? <span className="rounded bg-[#f5f7f3] px-2 py-1 text-[#4f5b55]">{draft.time_limit_minutes} 分钟</span> : null}
        {!(practiceQuestions.length || reviewQuestions.length || dailyQuiz.length) && (draft.question_count || sectionQuestionCount) ? <span className="rounded bg-[#f5f7f3] px-2 py-1 text-[#4f5b55]">{draft.question_count ?? sectionQuestionCount} 题</span> : null}
        {draft.total_points ? <span className="rounded bg-[#f5f7f3] px-2 py-1 text-[#4f5b55]">{draft.total_points} 分</span> : null}
        {grammarItems.length || grammarPoints.length ? <span className="rounded bg-[#f5f7f3] px-2 py-1 text-[#4f5b55]">{labels.draftGrammarPoints}: {grammarItems.length + grammarPoints.length}</span> : null}
        {practiceQuestions.length || reviewQuestions.length || dailyQuiz.length ? <span className="rounded bg-[#f5f7f3] px-2 py-1 text-[#4f5b55]">{labels.draftPracticeQuestions}: {practiceQuestions.length + reviewQuestions.length + dailyQuiz.length}</span> : null}
      </div>

      {draft.original_question?.passage || draft.normalized?.passage ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {draft.original_question?.passage ? (
            <PreviewSection icon={FileText} title={labels.draftOriginalPassage ?? '原文'}>
              <PassageBlock value={draft.original_question.passage} />
              {Array.isArray(draft.original_question.notes) && draft.original_question.notes.length ? (
                <ul className="mt-3 grid gap-2 text-sm leading-6 text-[#68716b]">
                  {draft.original_question.notes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              ) : null}
            </PreviewSection>
          ) : null}
          {draft.normalized?.passage ? (
            <PreviewSection icon={FileText} title={labels.draftNormalizedPassage ?? '校正文'}>
              <PassageBlock value={draft.normalized.passage} />
            </PreviewSection>
          ) : null}
        </div>
      ) : null}

      {draft.translation_zh ? (
        <PreviewSection icon={Languages} title={labels.draftFullTranslation ?? '全文翻译'}>
          <PassageBlock value={draft.translation_zh} tone="translation" />
        </PreviewSection>
      ) : null}

      {answerAnalysis.length ? (
        <PreviewSection icon={ClipboardList} title={labels.draftBlankAnalysis ?? '空格解析'}>
          <div className="divide-y divide-[#e1e6df]">
            {answerAnalysis.map((item, index) => (
              <article key={`${item.blank}-${item.answer}-${index}`} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  {item.blank ? <span className="rounded bg-[#173d35] px-2 py-1 text-xs font-semibold text-white">「{item.blank}」</span> : null}
                  {item.answer ? <span className="text-base font-semibold text-[#27312c]">{item.answer}</span> : null}
                  {item.grammar_point ? <span className="rounded bg-[#edf4ef] px-2 py-1 text-xs font-semibold text-[#31564c]">{item.grammar_point}</span> : null}
                </div>
                {item.explanation_zh ? <p className="mt-3 text-sm leading-6 text-[#4f5b55]">{item.explanation_zh}</p> : null}
                {item.distractors && Object.keys(item.distractors).length ? (
                  <dl className="mt-3 grid gap-2">
                    {Object.entries(item.distractors).map(([choice, note]) => (
                      <div key={choice} className="rounded-md border border-[#e1e6df] bg-[#fbfcfa] p-3 text-sm leading-6">
                        <dt className="font-semibold text-[#8f3d2e]">{choice}</dt>
                        <dd className="mt-1 text-[#68716b]">{note}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </article>
            ))}
          </div>
        </PreviewSection>
      ) : null}

      {grammarItems.length ? (
        <PreviewSection icon={BookOpenText} title={labels.draftGrammarPoints}>
          <GrammarItemList items={grammarItems} labels={labels} />
        </PreviewSection>
      ) : null}

      {grammarPoints.length ? (
        <PreviewSection icon={BookOpenText} title={labels.draftGrammarPoints}>
          <GrammarItemList items={grammarPoints} labels={labels} />
        </PreviewSection>
      ) : null}

      {sourceQuestions.length ? (
        <PreviewSection icon={ClipboardList} title={labels.draftSourceQuestions}>
          <QuestionList questions={sourceQuestions} labels={labels} />
        </PreviewSection>
      ) : null}

      {practiceQuestions.length ? (
        <PreviewSection icon={ListChecks} title={labels.draftPracticeQuestions}>
          <QuestionList questions={practiceQuestions} labels={labels} />
        </PreviewSection>
      ) : null}

      {reviewQuestions.length ? (
        <PreviewSection icon={ListChecks} title={labels.draftPracticeQuestions}>
          <QuestionList questions={reviewQuestions} labels={labels} />
        </PreviewSection>
      ) : null}

      {dailyQuiz.length ? (
        <PreviewSection icon={ListChecks} title={labels.draftPracticeQuestions}>
          <QuestionList questions={dailyQuiz} labels={labels} />
        </PreviewSection>
      ) : null}

      {strategyPoints.length || strategySummary.length ? (
        <PreviewSection icon={Lightbulb} title={draft.answer_strategy?.title ?? labels.draftAnswerStrategy}>
          <ol className="grid gap-2 text-sm leading-6 text-[#4f5b55]">
            {[...strategyPoints, ...strategySummary].map((point, index) => (
              <li key={point} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2">
                <span className="font-semibold text-[#31564c]">{index + 1}.</span>
                <span>{point}</span>
              </li>
            ))}
          </ol>
        </PreviewSection>
      ) : null}

      {!grammarItems.length && !grammarPoints.length && !answerAnalysis.length && !sourceQuestions.length && !practiceQuestions.length && !reviewQuestions.length && !dailyQuiz.length && sections.length ? (
        <PreviewSection icon={ClipboardList} title={labels.draftPreview}>
          <div className="divide-y divide-[#e1e6df]">
            <QuestionList
              questions={sections.flatMap((section) => Array.isArray(section.questions) ? section.questions : [])}
              sections={sections.flatMap((section) => (Array.isArray(section.questions) ? section.questions : []).map(() => section))}
              labels={labels}
            />
            {sections.filter((section) => !Array.isArray(section.questions) || !section.questions.length).map((section, index) => (
              <section key={section.id ?? index} className="py-5">
                {section.title ? <h4 className="text-base font-semibold text-[#27312c]">{section.title}</h4> : null}
                {section.instruction ? <p className="mt-2 text-sm leading-6 text-[#4f5b55]">{section.instruction}</p> : null}
                {section.body ? <p className="mt-2 text-sm leading-6 text-[#4f5b55]">{section.body}</p> : null}
                {Array.isArray(section.items) ? <ul className="mt-3 grid gap-2 text-sm leading-6 text-[#68716b]">{section.items.map((item, itemIndex) => <li key={itemIndex}>{summarizeValue(item, labels)}</li>)}</ul> : null}
              </section>
            ))}
          </div>
        </PreviewSection>
      ) : null}

      <div className="gentle-draft-context">
      {practicePlan.length ? (
        <PreviewDisclosure title="学习安排" icon={ListChecks}><PreviewSection icon={ListChecks} title="今日计划">
          <div className="grid gap-2 sm:grid-cols-3">
            {practicePlan.map((item, index) => (
              <div key={`${item.task}-${index}`} className="rounded-md border border-[#d8e1d9] bg-[#f8faf7] p-3">
                {typeof item.minutes === 'number' ? <p className="text-lg font-semibold text-[#31564c]">{item.minutes} 分钟</p> : null}
                {item.task ? <p className="mt-1 text-sm leading-6 text-[#4f5b55]">{item.task}</p> : null}
              </div>
            ))}
          </div>
        </PreviewSection></PreviewDisclosure>
      ) : null}

      {weakQuestionTypes.length || draft.diagnosis?.rule ? (
        <PreviewDisclosure title="为什么练这些题？" icon={Lightbulb}><PreviewSection icon={Lightbulb} title="针对性诊断">
          {draft.diagnosis?.rule ? <p className="mb-3 text-sm leading-6 text-[#4f5b55]">{draft.diagnosis.rule}</p> : null}
          {weakQuestionTypes.length ? (
            <div className="grid gap-2">
              {weakQuestionTypes.map((item, index) => (
                <div key={`${item.kind}-${index}`} className="rounded-md border border-[#e1e6df] bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-[#27312c]">{readableQuestionKind(item.kind)}</p>
                    <span className="rounded bg-[#edf4ef] px-2 py-1 text-xs font-semibold text-[#31564c]">{formatAccuracy(item.accuracy)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#68716b]">
                    {`做过 ${item.total ?? "—"} 题 · 答对 ${item.correct ?? "未记录"} · 答错 ${item.wrong ?? "未记录"}`}
                    {item.lastAnsweredAt ? ` · 最近 ${formatDateTime(item.lastAnsweredAt)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </PreviewSection></PreviewDisclosure>
      ) : null}

      {warmup.length ? (
        <PreviewDisclosure title="先回忆一下" icon={BookOpenText}><PreviewSection icon={BookOpenText} title="回忆小提示">
          <ul className="grid gap-2 text-sm leading-6 text-[#4f5b55]">
            {warmup.slice(0, 12).map((item, index) => <li key={index} className="rounded-md bg-[#f8faf7] p-3">{summarizeValue(item, labels)}</li>)}
          </ul>
        </PreviewSection></PreviewDisclosure>
      ) : null}

      </div>
      {!visualized ? (
        <div className="border-y border-[#e1e6df] py-6 text-sm leading-6 text-[#68716b]">
          {labels.draftReadableFallback}
        </div>
      ) : null}
    </div>
  );
}

function PreviewDisclosure({ title, buttonLabel, icon: Icon, children }: { title: string; buttonLabel?: string; icon?: LucideIcon; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <div className="preview-disclosure">
      <button className="preview-disclosure-trigger" type="button" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>{Icon ? <Icon size={18} aria-hidden="true" /> : null}<span>{buttonLabel ?? title}</span></button>
      <dialog ref={dialog} className="preview-dialog" aria-label={title}>
        <header><h3>{title}</h3><button type="button" autoFocus onClick={() => dialog.current?.close()}>关闭</button></header>
        <div className="preview-dialog-content">{children}</div>
      </dialog>
    </div>
  );
}

function PreviewSection({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-[#e1e6df] pt-5">
      <h4 className="flex items-center gap-2 text-base font-semibold text-[#27312c]">
        <Icon size={18} className="text-[#31564c]" />
        <span>{title}</span>
      </h4>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PassageBlock({ value, tone = 'source' }: { value: string; tone?: 'source' | 'translation' }) {
  return (
    <div className={`whitespace-pre-wrap rounded-md p-4 text-sm leading-7 ${tone === 'translation' ? 'bg-[#fffaf4] text-[#4f5b55]' : 'bg-[#f8faf7] text-[#27312c]'}`}>
      {value}
    </div>
  );
}

function GrammarItemList({ items, labels }: { items: GrammarItem[]; labels: Record<string, string> }) {
  return (
    <div className="divide-y divide-[#e1e6df]">
      {items.map((item, index) => {
        const title = item.expression ?? item.point ?? labels.draftUntitledItem;
        return (
          <article key={item.id ?? `${title}-${index}`} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <h4 className="text-lg font-semibold text-[#27312c]">{title}</h4>
              {item.connection ? <p className="text-sm font-semibold text-[#856033]">{item.connection}</p> : null}
            </div>
            {item.meaning_zh ? <p className="mt-2 text-sm leading-6 text-[#4f5b55]">{item.meaning_zh}</p> : null}
            {item.usage ? <p className="mt-2 text-sm leading-6 text-[#68716b]">{item.usage}</p> : null}
            {item.example_ja ? <p className="mt-3 rounded-md bg-[#f8faf7] p-3 text-base leading-7 text-[#27312c]">{item.example_ja}</p> : null}
            {item.example_zh ? <p className="mt-2 text-sm leading-6 text-[#68716b]">{item.example_zh}</p> : null}
            {item.exam_tip ? <p className="mt-2 text-sm font-semibold leading-6 text-[#856033]">{item.exam_tip}</p> : null}
            {item.core_memory ? <p className="mt-2 text-sm font-semibold leading-6 text-[#31564c]">{item.core_memory}</p> : null}
          </article>
        );
      })}
    </div>
  );
}

function QuestionList({ questions, sections, labels, startNumber = 1, hidePagination = false }: { questions: DraftQuestion[]; sections?: DraftSection[]; labels: Record<string, string>; startNumber?: number; hidePagination?: boolean }) {
  const [page, setPage] = useState(0);
  const currentPage = Math.min(page, Math.max(0, questions.length - 1));
  const section = sections?.[currentPage];
  const [revealedQuestionIds, setRevealedQuestionIds] = useState<Set<string>>(() => new Set());

  function toggleAnswer(id: string) {
    setRevealedQuestionIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="gentle-draft-questions">
      {section?.title ? <h4 className="text-base font-semibold text-[#27312c]">{section.title}</h4> : null}
      {section?.instruction ? <p className="mt-2 rounded-md bg-[#f8faf7] p-3 text-sm leading-6 text-[#4f5b55]">{section.instruction}</p> : null}
      {section?.body ? <p className="mt-2 text-sm leading-6 text-[#4f5b55]">{section.body}</p> : null}
      {Array.isArray(section?.items) && section.items.length ? <ul className="mt-3 grid gap-2 text-sm leading-6 text-[#68716b]">{section.items.map((item, itemIndex) => <li key={itemIndex}>{summarizeValue(item, labels)}</li>)}</ul> : null}
      {!hidePagination ? <nav className="gentle-question-pager" aria-label="预览题目翻页">
        <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一题</button>
        <span aria-live="polite">第 {questions.length ? currentPage + 1 : 0} / {questions.length} 题</span>
        <button type="button" disabled={currentPage >= questions.length - 1} onClick={() => setPage(currentPage + 1)}>下一题</button>
      </nav> : null}
      {questions.slice(currentPage, currentPage + 1).map((question, offset) => {
        const index = currentPage + offset;
        const questionId = `${index}-${question.id ?? question.prompt}`;
        const answerChoiceNumber = typeof question.answerIndex === 'number' && question.answerIndex >= 0
          ? question.answerIndex + 1
          : numericAnswerIndex(question.answer);
        const hasStarResult = Boolean(question.full_order || question.target_blank_index || answerChoiceNumber);
        const isRevealed = revealedQuestionIds.has(questionId);
        return (
          <article key={questionId} className="py-4 first:pt-0 last:pb-0">
            <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2">
              <span className="pt-0.5 text-base font-semibold text-[#31564c]">{startNumber + index}.</span>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <p className="text-base font-semibold leading-7 text-[#27312c]">{question.prompt}</p>
                {question.tested_expression || question.tested ? <span className="w-fit shrink-0 rounded bg-[#edf4ef] px-2 py-1 text-xs font-semibold text-[#31564c]">{question.tested_expression ?? question.tested}</span> : null}
              </div>
            </div>
            {isRevealed && hasStarResult ? (
              <div className="mt-3 grid gap-2 rounded-md border border-[#d8e1d9] bg-[#f8faf7] p-3 text-sm leading-6 text-[#4f5b55] sm:grid-cols-3">
                {question.full_order ? <ResultField label={labels.draftFullOrder ?? '完整排序'} value={question.full_order} /> : null}
                {question.target_blank_index ? <ResultField label={labels.draftStarBlank ?? '★ 位置'} value={`${question.target_blank_index}`} /> : null}
                {question.answer ? <ResultField label={labels.draftStarAnswer ?? labels.draftCorrectAnswer} value={question.answer} strong /> : null}
              </div>
            ) : null}
            {Array.isArray(question.choices) && question.choices.length ? (
              <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                {question.choices.map((choice, choiceIndex) => {
                  const isAnswer = isRevealed && (answerChoiceNumber !== null ? choiceIndex + 1 === answerChoiceNumber : choice === question.answer);
                  return (
                    <li key={`${choice}-${choiceIndex}`} className={`rounded-md border px-3 py-2 text-sm leading-6 ${isAnswer ? 'border-[#31564c] bg-[#edf4ef] text-[#24473f]' : 'border-[#d7dfd6] bg-white text-[#4f5b55]'}`}>
                      <span className="font-semibold">{choiceIndex + 1}. </span>{choice}
                      {isAnswer ? <span className="ml-2 text-xs font-semibold">{labels.draftCorrectAnswer}</span> : null}
                    </li>
                  );
                })}
              </ol>
            ) : null}
            <button type="button" onClick={() => toggleAnswer(questionId)} className="mt-3 h-9 rounded-md border border-[#cbd6cf] bg-white px-3 text-sm font-semibold text-[#24473f] hover:bg-[#f8faf7]">
              {isRevealed ? labels.draftHideAnswer : labels.draftShowAnswer}
            </button>
            {isRevealed && question.explanation_zh ? <p className="mt-3 text-sm leading-6 text-[#68716b]">{question.explanation_zh}</p> : null}
          </article>
        );
      })}
    </div>
  );
}

function ResultField({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <p>
      <span className="block text-xs font-semibold text-[#68716b]">{label}</span>
      <span className={`mt-1 block ${strong ? 'text-base font-semibold text-[#24473f]' : 'font-semibold text-[#27312c]'}`}>{value}</span>
    </p>
  );
}

function numericAnswerIndex(answer?: string) {
  if (!answer) return null;
  const parsed = Number(answer.trim());
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

function readableQuestionKind(kind?: string) {
  if (kind === 'kanji_to_kana') return '漢字読み';
  if (kind === 'kana_to_kanji') return '表記';
  if (kind === 'moji_goi') return '文脈規定';
  if (kind === 'meaning') return '言い換え類義';
  if (kind === 'word_formation') return '語形成';
  if (kind === 'usage') return '用法';
  if (kind === 'grammar') return '文の文法1';
  return kind ? kind.replaceAll('_', ' ') : '题型';
}

function formatAccuracy(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '正确率 -';
  return `正确率 ${Math.round(value * 100)}%`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function readableKind(kind: string, labels: Record<string, string>) {
  if (kind === 'grammar_review_pack') return labels.draftKindGrammar;
  if (kind === 'daily_review_pack') return labels.draftKindDaily;
  if (kind === 'organized_review_pack') return labels.draftKindOrganized;
  return kind.replaceAll('_', ' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function summarizeValue(value: unknown, labels: Record<string, string>) {
  if (typeof value === 'string') return value;
  if (isRecord(value)) {
    const prompt = stringField(value, 'prompt');
    const answer = stringField(value, 'answer');
    if (prompt && answer) return `${prompt} -> ${answer}`;
    if (prompt) return prompt;
    const kind = stringField(value, 'kind');
    if (kind && typeof value.total === 'number') {
      const correct = typeof value.correct === 'number' ? value.correct : 0;
      const wrong = typeof value.wrong === 'number' ? value.wrong : 0;
      const accuracy = typeof value.accuracy === 'number' ? `，正确率 ${Math.round(value.accuracy * 100)}%` : '';
      return `${readableQuestionKind(kind)}：总 ${value.total}，对 ${correct}，错 ${wrong}${accuracy}`;
    }
    const type = stringField(value, 'type');
    const itemId = stringField(value, 'item_id');
    if (type && itemId) return `${type}：${itemId}`;
    const original = stringField(value, 'original');
    const expression = stringField(value, 'expression');
    const title = stringField(value, 'title');
    const task = stringField(value, 'task');
    if (task) return task;
    const id = stringField(value, 'id');
    return original || expression || title || id || labels.draftUntitledItem;
  }
  return String(value ?? '');
}

function stringField(value: Record<string, unknown>, key: string) {
  return typeof value[key] === 'string' ? value[key] : '';
}
