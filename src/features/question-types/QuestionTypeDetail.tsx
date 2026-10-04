import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { officialN1QuestionTypes } from '../../data/questionTypes';
import type { CustomQuestionTypeTip, Locale } from '../../types';
import { useAuthoringNavigation } from '../../components/AuthoringNavigation';
import { usePageHeaderActions } from '../../components/PageChrome';

const OFFICIAL_SOURCE_URL = 'https://www.jlpt.jp/e/guideline/testsections.html';

type QuestionTypeDetailProps = {
  id: string;
  labels: Record<string, string>;
  locale: Locale;
  customTip?: string;
  customTipEntry?: CustomQuestionTypeTip;
  onBack: () => void;
  onUpdateTip: (id: string, tip: string) => void;
  onUpdateCustomTip: (id: string, input: { title: string; description: string; tip: string }) => void;
  onDeleteCustomTip: (id: string) => void;
};

export function QuestionTypeDetail({ id, labels, locale, customTip, customTipEntry, onBack, onUpdateTip, onUpdateCustomTip, onDeleteCustomTip }: QuestionTypeDetailProps) {
  const item = officialN1QuestionTypes.find((candidate) => candidate.id === id);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftTip, setDraftTip] = useState('');
  const draftFor = useRef<string | null>(null);
  const title = customTipEntry?.title ?? item?.name[locale] ?? '';
  const displayedTip = customTipEntry?.tip ?? customTip ?? item?.defaultTip[locale] ?? '';
  useAuthoringNavigation(title ? (editing ? labels.questionTypeEditTip : title) : null, () => editing ? setEditing(false) : onBack(), { kind: editing ? 'form' : 'detail', backLabel: editing ? labels.questionTypeCancel : labels.questionTypeBackToList });
  const inHeader = usePageHeaderActions(title ? [{ key: editing ? 'tip-save' : 'tip-edit', label: editing ? labels.questionTypeSaveTip : labels.questionTypeEditTip, onClick: editing ? saveTip : startEditing, disabled: editing && !draftTip.trim() }] : [], 10);

  useEffect(() => {
    setEditing(false);
    setDraftTip('');
    draftFor.current = null;
  }, [id]);

  if (!item && !customTipEntry) {
    return (
      <section className="py-10">
        <p className="text-sm text-[#68716b]">{labels.questionTypeNotFound}</p>
        {!inHeader ? <button type="button" onClick={onBack} className="mt-4 min-h-11 text-sm font-semibold text-[#176c62] hover:underline">← {labels.questionTypeBackToList}</button> : null}
      </section>
    );
  }

  const isCustomEntry = Boolean(customTipEntry);
  const subtitle = customTipEntry ? labels.questionTypeCustomTip : item?.officialName ?? '';
  const sectionLabel = customTipEntry ? labels[`questionTypeSection_${customTipEntry.section}`] : item ? labels[`questionTypeSection_${item.section}`] : '';
  const description = customTipEntry?.description || item?.description[locale] || labels.questionTypeCustomDescriptionEmpty;

  function startEditing() {
    if (draftFor.current !== id) {
      setDraftTitle(customTipEntry?.title ?? '');
      setDraftDescription(customTipEntry?.description ?? '');
      setDraftTip(displayedTip);
      draftFor.current = id;
    }
    setEditing(true);
  }

  function saveTip() {
    if (!draftTip.trim()) return;
    if (customTipEntry) {
      onUpdateCustomTip(id, {
        title: draftTitle.trim() || customTipEntry.title,
        description: draftDescription.trim(),
        tip: draftTip.trim(),
      });
    } else {
      onUpdateTip(id, draftTip.trim());
    }
    setEditing(false);
    draftFor.current = null;
  }

  return (
    <article className="min-w-0">
      {!inHeader ? <button type="button" onClick={() => editing ? setEditing(false) : onBack()} className="min-h-11 text-sm font-semibold text-[#176c62] hover:underline">← {editing ? labels.questionTypeCancel : labels.questionTypeBackToList}</button> : null}

      <header className="mt-3 border-b border-[#d7dfd6] pb-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#7d6032]">JLPT N1 · {sectionLabel}</p>
            {!inHeader || editing ? <h1 className="mt-1 text-2xl font-semibold text-[#142c35]">{title}</h1> : null}
            <p className="mt-1 text-sm font-semibold text-[#7d6032]">{subtitle}</p>
          </div>
          {isCustomEntry ? <span className="w-fit rounded bg-[#e8eef4] px-2 py-1 text-xs font-semibold text-[#2f526a]">{labels.questionTypeCustomTip}</span> : customTip ? <span className="w-fit rounded bg-[#e7f0eb] px-2 py-1 text-xs font-semibold text-[#31564c]">{labels.questionTypePersonalized}</span> : null}
        </div>
      </header>

      <section className="border-b border-[#dfe5dc] py-6">
        <p className="text-xs font-semibold text-[#6b746e]">{labels.questionTypeQuestionForm}</p>
        <p className="mt-2 max-w-3xl whitespace-pre-wrap text-base leading-7 text-[#3f5149]">{description}</p>
      </section>

      <section className="py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[#6b746e]">{isCustomEntry || customTip ? labels.questionTypeMyTip : labels.questionTypeDefaultTip}</p>
            <h2 className="mt-1 text-lg font-semibold text-[#27312c]">{labels.questionTypeSolvingApproach}</h2>
          </div>
          {!editing && !inHeader ? <button type="button" onClick={startEditing} className="min-h-11 rounded-md border border-[#c8d1c8] bg-white px-4 text-sm font-semibold text-[#176c62] hover:bg-[#f3f6f1]">{labels.questionTypeEditTip}</button> : null}
        </div>

        {editing ? (
          <div className="mt-4 max-w-3xl">
            {customTipEntry ? (
              <div className="mb-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <label className="min-w-0 text-sm font-semibold text-[#34443c]">
                  <span className="mb-1 block">{labels.questionTypeCustomTitle}</span>
                  <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} maxLength={80} className="h-10 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-sm font-normal text-[#27312c]" />
                </label>
                <label className="min-w-0 text-sm font-semibold text-[#34443c]">
                  <span className="mb-1 block">{labels.questionTypeCustomDescription}</span>
                  <input value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} maxLength={200} className="h-10 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-sm font-normal text-[#27312c]" />
                </label>
              </div>
            ) : null}
            <textarea aria-label={labels.questionTypeTipEditor} value={draftTip} onChange={(event) => setDraftTip(event.target.value)} maxLength={2000} className="min-h-64 w-full rounded-md border border-[#d5dcd8] bg-[#fffefd] p-4 text-base leading-7" />
            <div className="mt-3 flex flex-wrap gap-2">
              {!inHeader ? <><button type="button" onClick={saveTip} disabled={!draftTip.trim()} className="cute-button-primary min-h-11 px-4 disabled:cursor-not-allowed disabled:opacity-45">{labels.questionTypeSaveTip}</button>
              <button type="button" onClick={() => setEditing(false)} className="min-h-11 rounded-md border border-[#d7dfd6] bg-white px-4 text-sm font-semibold text-[#4f5b55]">{labels.questionTypeCancel}</button></> : null}
              {!customTipEntry && customTip ? <button type="button" onClick={() => { onUpdateTip(id, ''); setEditing(false); }} className="h-10 rounded-md border border-[#d9c9c3] bg-white px-4 text-sm font-semibold text-[#7a4d42]">{labels.questionTypeResetTip}</button> : null}
            </div>
          </div>
        ) : (
          <p className="mt-4 max-w-3xl whitespace-pre-wrap border-l-2 border-[#c3a45b] pl-4 text-base leading-7 text-[#3f5149]">{displayedTip}</p>
        )}
      </section>

      <footer className="border-t border-[#dfe5dc] pt-4">
        <p className="text-xs leading-5 text-[#7a807b]">{isCustomEntry ? labels.questionTypeCustomNotice : labels.questionTypeTipNotice}</p>
        {isCustomEntry ? (
          <button type="button" onClick={() => { onDeleteCustomTip(id); onBack(); }} className="mt-2 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#7a4d42] hover:underline">
            <Trash2 size={16} />
            {labels.questionTypeDeleteCustom}
          </button>
        ) : (
          <a href={OFFICIAL_SOURCE_URL} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-[#31564c] hover:underline">{labels.questionTypeOfficialSource} ↗</a>
        )}
      </footer>
    </article>
  );
}
