import { LearningCatalog } from '../../components/LearningCatalog';
import { LearningList, LearningListRow } from '../../components/LearningList';
import { ChevronLeft, ChevronRight, ExternalLink, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { officialN1QuestionTypes, type QuestionTypeSection } from '../../data/questionTypes';
import type { CustomQuestionTypeTip, Locale } from '../../types';

const sections: QuestionTypeSection[] = ['vocabulary', 'grammar', 'reading', 'listening'];
const QUESTION_TYPE_PAGE_SIZE = 8;

type QuestionTypeGuideProps = {
  labels: Record<string, string>;
  locale: Locale;
  customTips: Record<string, string>;
  customTipEntries: CustomQuestionTypeTip[];
  section?: QuestionTypeSection;
  onOpen: (id: string) => void;
  onCreateCustomTip: (input: { section: QuestionTypeSection; title: string; description: string; tip: string }) => string;
};

export function QuestionTypeGuide({ labels, locale, customTips, customTipEntries, section, onOpen, onCreateCustomTip }: QuestionTypeGuideProps) {
  const [activeSection, setActiveSection] = useState<QuestionTypeSection>(section ?? 'vocabulary');
  const selectedSection = section ?? activeSection;
  const [pageIndex, setPageIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftTip, setDraftTip] = useState('');
  const [mobileVisibleCount, setMobileVisibleCount] = useState(QUESTION_TYPE_PAGE_SIZE);
  const mobileLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const visibleTypes = useMemo(
    () => [
      ...officialN1QuestionTypes
        .filter((item) => item.section === selectedSection)
        .map((item) => ({
          id: item.id,
          title: item.name[locale],
          subtitle: item.officialName,
          tip: customTips[item.id] || item.defaultTip[locale],
          status: customTips[item.id] ? labels.questionTypePersonalized : labels.questionTypeDefaultTip,
          statusClassName: customTips[item.id] ? 'bg-[#e7f0eb] text-[#31564c]' : 'bg-[#f1eee8] text-[#665f55]',
        })),
      ...customTipEntries
        .filter((item) => item.section === selectedSection)
        .map((item) => ({
          id: item.id,
          title: item.title,
          subtitle: labels.questionTypeCustomTip,
          tip: item.tip,
          status: labels.questionTypeCustomTip,
          statusClassName: 'bg-[#e8eef4] text-[#2f526a]',
        })),
    ],
    [customTipEntries, customTips, labels, locale, selectedSection],
  );
  const pageCount = Math.max(1, Math.ceil(visibleTypes.length / QUESTION_TYPE_PAGE_SIZE));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const pageStart = currentPage * QUESTION_TYPE_PAGE_SIZE;
  const pageItems = visibleTypes.slice(pageStart, pageStart + QUESTION_TYPE_PAGE_SIZE);
  const mobileItems = visibleTypes.slice(0, mobileVisibleCount);
  const pageEnd = pageStart + pageItems.length;
  const mobilePageEnd = Math.min(mobileVisibleCount, visibleTypes.length);

  useEffect(() => {
    setPageIndex(0);
    setMobileVisibleCount(QUESTION_TYPE_PAGE_SIZE);
  }, [selectedSection]);

  useEffect(() => {
    setPageIndex((index) => Math.min(index, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    const sentinel = mobileLoadMoreRef.current;
    if (!sentinel || mobileVisibleCount >= visibleTypes.length) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setMobileVisibleCount((count) => Math.min(count + QUESTION_TYPE_PAGE_SIZE, visibleTypes.length));
    }, { rootMargin: '240px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [mobileVisibleCount, visibleTypes.length]);

  function resetForm() {
    setDraftTitle('');
    setDraftDescription('');
    setDraftTip('');
  }

  function submitCustomTip() {
    const title = draftTitle.trim();
    const tip = draftTip.trim();
    if (!title || !tip) return;
    const id = onCreateCustomTip({
      section: selectedSection,
      title,
      description: draftDescription.trim(),
      tip,
    });
    resetForm();
    setAdding(false);
    onOpen(id);
  }

  return (
    <section className="min-w-0">
      <div className="mobile-action-header flex flex-wrap items-center justify-between gap-3 border-b border-[#d7dfd6] py-4">
        {!section ? <div className="mobile-segment-scroll flex max-w-full gap-2 overflow-x-auto">
          {sections.map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => setActiveSection(candidate)}
              className={`h-10 shrink-0 rounded-md px-4 text-sm font-semibold ${activeSection === candidate ? 'bg-[#31564c] text-white' : 'border border-[#d7dfd6] bg-white text-[#4f5b55] hover:bg-[#f3f6f1]'}`}
            >
              {labels[`questionTypeSection_${candidate}`]}
            </button>
          ))}
        </div> : <p className="text-sm font-semibold text-[#59645e]">{labels[`questionTypeSection_${selectedSection}`]}</p>}
        <button type="button" onClick={() => setAdding((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-md border border-[#b9c9c1] bg-white px-3 text-sm font-semibold text-[#31564c] hover:bg-[#f3f6f1]">
          {adding ? <X size={17} /> : <Plus size={17} />}
          {adding ? labels.questionTypeCancel : labels.questionTypeAddCustom}
        </button>
      </div>

      {adding ? (
        <div className="border-b border-[#dfe5dc] bg-[#f8faf7] px-4 py-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <label className="min-w-0 text-sm font-semibold text-[#34443c]">
              <span className="mb-1 block">{labels.questionTypeCustomTitle}</span>
              <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} maxLength={80} className="h-10 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-sm font-normal text-[#27312c]" />
            </label>
            <label className="min-w-0 text-sm font-semibold text-[#34443c]">
              <span className="mb-1 block">{labels.questionTypeCustomDescription}</span>
              <input value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} maxLength={200} className="h-10 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-sm font-normal text-[#27312c]" />
            </label>
          </div>
          <label className="mt-3 block min-w-0 text-sm font-semibold text-[#34443c]">
            <span className="mb-1 block">{labels.questionTypeTipEditor}</span>
            <textarea value={draftTip} onChange={(event) => setDraftTip(event.target.value)} maxLength={2000} className="min-h-28 w-full rounded-md border border-[#c8d1c8] bg-white p-3 text-sm font-normal leading-6 text-[#27312c]" />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={submitCustomTip} disabled={!draftTitle.trim() || !draftTip.trim()} className="h-10 rounded-md bg-[#31564c] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">{labels.questionTypeSaveTip}</button>
            <button type="button" onClick={() => { resetForm(); setAdding(false); }} className="h-10 rounded-md border border-[#d7dfd6] bg-white px-4 text-sm font-semibold text-[#4f5b55]">{labels.questionTypeCancel}</button>
          </div>
        </div>
      ) : null}

      <LearningCatalog title={labels[`questionTypeSection_${selectedSection}`]} items={visibleTypes} locale={locale} searchText={(item) => `${item.title} ${item.subtitle} ${item.tip}`} renderRow={(item) => <LearningListRow key={item.id} title={item.title} reading={item.subtitle} description={item.tip} status={item.status} locale={locale} onOpen={() => onOpen(item.id)}/>}/>

    </section>
  );
}
