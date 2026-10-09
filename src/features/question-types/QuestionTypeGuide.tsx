import { LearningCatalog } from '../../components/LearningCatalog';
import { LearningListRow, LearningListSelect } from '../../components/LearningList';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { officialN1QuestionTypes, type QuestionTypeSection } from '../../data/questionTypes';
import type { CustomQuestionTypeTip, Locale } from '../../types';
import { useAuthoringNavigation } from '../../components/AuthoringNavigation';
import { usePageHeaderActions } from '../../components/PageChrome';

const sections: QuestionTypeSection[] = ['vocabulary', 'grammar', 'reading', 'listening'];

type QuestionTypeGuideProps = {
  labels: Record<string, string>;
  locale: Locale;
  customTips: Record<string, string>;
  customTipEntries: CustomQuestionTypeTip[];
  section?: QuestionTypeSection;
  onOpen: (id: string) => void;
  onCreateCustomTip: (input: { section: QuestionTypeSection; title: string; description: string; tip: string }) => Promise<string>;
};

export function QuestionTypeGuide({ labels, locale, customTips, customTipEntries, section, onOpen, onCreateCustomTip }: QuestionTypeGuideProps) {
  const [activeSection, setActiveSection] = useState<QuestionTypeSection>(section ?? 'vocabulary');
  const selectedSection = section ?? activeSection;
  const categoryLabel = locale === 'ja' ? '分野' : locale === 'en' ? 'Category' : '分类';
  const [adding, setAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftTip, setDraftTip] = useState('');
  useAuthoringNavigation(adding ? labels.questionTypeAddCustom : null, () => setAdding(false), { kind: 'form', backLabel: labels.questionTypeCancel });
  const canSave = Boolean(draftTitle.trim() && draftTip.trim());
  const inHeader = usePageHeaderActions(adding ? [{ key: 'custom-tip-save', label: labels.questionTypeSaveTip, disabled: !canSave, onClick: () => void submitCustomTip() }] : [], 10);
  const visibleTypes = useMemo(() => [
    ...officialN1QuestionTypes.filter((item) => item.section === selectedSection).map((item) => ({
      id: item.id, title: item.name[locale], subtitle: item.officialName,
      tip: customTips[item.id] || item.defaultTip[locale],
    })),
    ...customTipEntries.filter((item) => item.section === selectedSection).map((item) => ({
      id: item.id, title: item.title, subtitle: labels.questionTypeCustomTip, tip: item.tip,
    })),
  ], [customTipEntries, customTips, labels, locale, selectedSection]);

  async function submitCustomTip() {
    if (!canSave) return;
    const id = await onCreateCustomTip({ section: selectedSection, title: draftTitle.trim(), description: draftDescription.trim(), tip: draftTip.trim() });
    setDraftTitle(''); setDraftDescription(''); setDraftTip('');
    setAdding(false);
    onOpen(id);
  }

  if (adding) return <form className="question-type-form mx-auto grid max-w-3xl gap-6 py-5" onSubmit={(event) => { event.preventDefault(); void submitCustomTip(); }}>
    {!inHeader ? <h1 className="text-xl font-bold">{labels.questionTypeAddCustom}</h1> : null}
    <p className="text-sm text-[#176c62]">JLPT N1 · {labels[`questionTypeSection_${selectedSection}`]}</p>
    <label className="grid gap-2 font-semibold">{labels.questionTypeCustomTitle}
      <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} maxLength={80} required className="min-h-12 w-full rounded-md border border-[#d5dcd8] bg-[#fffefd] px-3 text-base font-normal" />
    </label>
    <label className="grid gap-2 font-semibold">{labels.questionTypeCustomDescription}
      <input value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} maxLength={200} className="min-h-12 w-full rounded-md border border-[#d5dcd8] bg-[#fffefd] px-3 text-base font-normal" />
    </label>
    <label className="grid gap-2 font-semibold">{labels.questionTypeTipEditor}
      <textarea value={draftTip} onChange={(event) => setDraftTip(event.target.value)} maxLength={2000} required className="min-h-64 w-full rounded-md border border-[#d5dcd8] bg-[#fffefd] p-4 text-base font-normal leading-7" />
    </label>
    {!inHeader ? <div className="flex flex-wrap gap-3">
      <button type="submit" disabled={!canSave} className="cute-button-primary min-h-11 px-4 disabled:opacity-45">{labels.questionTypeSaveTip}</button>
      <button type="button" onClick={() => setAdding(false)} className="min-h-11 px-4">{labels.questionTypeCancel}</button>
    </div> : null}
  </form>;

  return <section className="question-type-guide min-w-0">
    <LearningCatalog
      title={labels.navQuestionTypes}
      items={visibleTypes}
      locale={locale}
      appliedSummary={`${categoryLabel}: ${labels[`questionTypeSection_${selectedSection}`]}`}
      onReset={() => setActiveSection(section ?? 'vocabulary')}
      columnLabels={locale === 'ja' ? ['問題形式', '説明', null] : locale === 'en' ? ['Question type', 'Description', null] : ['题型', '说明', null]}
      searchText={(item) => `${item.title} ${item.subtitle} ${item.tip}`}
      tools={<>
        {!section ? <LearningListSelect value={activeSection} onChange={(value) => setActiveSection(value as QuestionTypeSection)} label={categoryLabel}>
          {sections.map((candidate) => <option key={candidate} value={candidate}>{labels[`questionTypeSection_${candidate}`]}</option>)}
        </LearningListSelect> : null}
        <button type="button" className="inline-flex min-h-11 items-center gap-2 text-[#bc493a]" onClick={() => setAdding(true)}><Plus size={18} aria-hidden="true" />{labels.questionTypeAddCustom}</button>
      </>}
      renderRow={(item) => <LearningListRow key={item.id} title={item.title} description={item.subtitle} locale={locale} onOpen={() => onOpen(item.id)} />}
    />
  </section>;
}
