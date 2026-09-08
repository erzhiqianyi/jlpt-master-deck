import { BookOpenCheck, CalendarRange, Clock3, Layers3, Plus, School, Target, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { createStudyMaterial } from '../../domain/studyPlan';
import type { StudyPlanMaterial, StudyPlanModule, StudyPlanProfile } from '../../types';

const modules: StudyPlanModule[] = ['grammar', 'reading', 'listening', 'vocabulary', 'other'];

export function PlanSetupForm({ labels, profile, onSave, onCancel }: { labels: Record<string, string>; profile: StudyPlanProfile; onSave: (profile: StudyPlanProfile) => Promise<void>; onCancel?: () => void }) {
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => setDraft(profile), [profile]);

  function updateMaterial(id: string, patch: Partial<StudyPlanMaterial>) {
    setDraft((current) => ({ ...current, materials: current.materials.map((material) => material.id === id ? { ...material, ...patch } : material) }));
  }

  async function save() {
    if (draft.examDate < draft.startDate) return setMessage(labels.planInvalidDates);
    if (!draft.materials.length || draft.materials.some((material) => !material.title.trim())) return setMessage(labels.planMaterialNameRequired);
    setSaving(true);
    setMessage('');
    try {
      await onSave(draft);
      setMessage(labels.planProfileSaved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.planSaveFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <FormSection initiallyOpen icon={Target} title={labels.planBasicInfo} body={labels.planProfileOverviewBody}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label={labels.planLevel}>
            <select value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value as StudyPlanProfile['level'] })} className={inputClass}>
              {['N1', 'N2', 'N3', 'N4', 'N5'].map((level) => <option key={level}>{level}</option>)}
            </select>
          </Field>
          <Field label={labels.planStartDate}><input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} className={inputClass} /></Field>
          <Field label={labels.planExamDate}><input type="date" value={draft.examDate} onChange={(event) => setDraft({ ...draft, examDate: event.target.value })} className={inputClass} /></Field>
          <Field label={labels.planDaysPerWeek}><NumberInput value={draft.studyDaysPerWeek} min={1} max={7} onChange={(value) => setDraft({ ...draft, studyDaysPerWeek: value })} /></Field>
          <Field label={labels.planDailyMinutes}><NumberInput value={draft.dailyMinutes} min={15} max={480} step={15} onChange={(value) => setDraft({ ...draft, dailyMinutes: value })} /></Field>
        </div>
        <Field label={labels.planGoal}>
          <textarea value={draft.goal ?? ''} maxLength={1000} onChange={(event) => setDraft({ ...draft, goal: event.target.value })} placeholder={labels.planGoalPlaceholder} className={textareaClass} />
        </Field>
      </FormSection>

      <FormSection icon={Clock3} title={labels.planConstraintsSection} body={labels.planConstraintsSectionBody}>
        <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
          <Field label={labels.planMaterialStartStatus}>
            <select value={draft.materialStartStatus ?? 'not_started'} onChange={(event) => setDraft({ ...draft, materialStartStatus: event.target.value as StudyPlanProfile['materialStartStatus'] })} className={inputClass}>
              {(['not_started', 'in_progress', 'reviewing'] as const).map((status) => <option key={status} value={status}>{labels[`planMaterialStartStatus_${status}`]}</option>)}
            </select>
          </Field>
          <Field label={labels.planFixedSchedule}>
            <input value={draft.fixedSchedule ?? ''} maxLength={1000} onChange={(event) => setDraft({ ...draft, fixedSchedule: event.target.value })} placeholder={labels.planFixedSchedulePlaceholder} className={inputClass} />
          </Field>
        </div>
        <p className="flex items-start gap-2 rounded-md bg-[#f3f7f3] px-3 py-2 text-xs font-semibold leading-5 text-[#4f5b55]">
          <School className="mt-0.5 h-4 w-4 shrink-0 text-[#5f8275]" aria-hidden="true" />
          <span>{labels.planWeekdaySchoolRule}</span>
        </p>
      </FormSection>

      <FormSection icon={CalendarRange} title={labels.planPhaseStrategy} body={labels.planPhaseStrategyBody}>
        <textarea value={draft.phaseStrategy ?? ''} maxLength={1000} onChange={(event) => setDraft({ ...draft, phaseStrategy: event.target.value })} placeholder={labels.planPhaseStrategyPlaceholder} className={`${textareaClass} min-h-32`} />
      </FormSection>

      <FormSection icon={Layers3} title={labels.planSupplementalSection} body={labels.planSupplementalSectionBody}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={labels.planSupplementalNeeds}>
            <textarea value={draft.supplementalNeeds ?? ''} maxLength={1000} onChange={(event) => setDraft({ ...draft, supplementalNeeds: event.target.value })} placeholder={labels.planSupplementalNeedsPlaceholder} className={textareaClass} />
          </Field>
          <Field label={labels.planPostMaterialStrategy}>
            <textarea value={draft.postMaterialStrategy ?? ''} maxLength={1000} onChange={(event) => setDraft({ ...draft, postMaterialStrategy: event.target.value })} placeholder={labels.planPostMaterialStrategyPlaceholder} className={textareaClass} />
          </Field>
        </div>
      </FormSection>

      <FormSection icon={BookOpenCheck} title={labels.planMaterials} body={labels.planBasicMaterialsBody}>
        <div className="flex items-center justify-between gap-3">
          <span />
          <button type="button" onClick={() => setDraft((current) => ({ ...current, materials: [...current.materials, createStudyMaterial()] }))} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-[#bfcac0] bg-white px-3 text-sm font-semibold text-[#31564c] hover:bg-[#f3f6f1]">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {labels.planAddMaterial}
          </button>
        </div>
        <div className="mt-3 divide-y divide-[#dfe5dc] border-y border-[#dfe5dc]">
          {draft.materials.map((material) => (
            <div key={material.id} className="grid gap-3 py-4 md:grid-cols-[minmax(220px,1.5fr)_150px_minmax(220px,1fr)_40px] md:items-end">
              <Field label={labels.planMaterialName}><input value={material.title} maxLength={120} onChange={(event) => updateMaterial(material.id, { title: event.target.value })} className={inputClass} /></Field>
              <Field label={labels.planModule}>
                <select value={material.module} onChange={(event) => updateMaterial(material.id, { module: event.target.value as StudyPlanModule })} className={inputClass}>
                  {modules.map((module) => <option key={module} value={module}>{labels[`planModule_${module}`]}</option>)}
                </select>
              </Field>
              <Field label={labels.planCurrentPosition}><input value={material.currentPosition ?? ''} maxLength={1200} onChange={(event) => updateMaterial(material.id, { currentPosition: event.target.value })} placeholder={labels.planCurrentPositionPlaceholder} className={inputClass} /></Field>
              <button type="button" onClick={() => setDraft((current) => ({ ...current, materials: current.materials.filter((item) => item.id !== material.id) }))} aria-label={labels.planRemoveMaterial} title={labels.planRemoveMaterial} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#d9c9c3] bg-white text-[#7a4d42] hover:bg-[#faf3f0]">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </FormSection>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={saving} className="h-11 rounded-md bg-[#31564c] px-5 text-sm font-semibold text-white hover:bg-[#27483f] disabled:opacity-60">{saving ? labels.planSaving : labels.planSaveProfile}</button>
        {onCancel ? <button type="button" onClick={onCancel} disabled={saving} className="h-11 rounded-md border border-[#c8d1c8] bg-white px-5 text-sm font-semibold text-[#4f5b55] hover:bg-[#f3f6f1] disabled:opacity-60">{labels.planCancelEdit}</button> : null}
      </div>
      {message ? <p role="status" className="text-sm font-semibold text-[#4f5b55]">{message}</p> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-semibold text-[#5c675f]">{label}<span className="mt-1.5 block">{children}</span></label>;
}

function FormSection({ icon: Icon, title, body, children, initiallyOpen = false }: { initiallyOpen?: boolean; icon: typeof Target; title: string; body: string; children: ReactNode }) {
  return (
    <details className="gentle-details" open={initiallyOpen || undefined}>
      <summary>{title}</summary><div className="mb-4 flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#edf4ef] text-[#31564c]">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[#27312c]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[#68716b]">{body}</p>
        </div>
      </div>
      <div className="space-y-4 pb-4">{children}</div>
    </details>
  );
}

function NumberInput({ value, min, max, step = 1, onChange }: { value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return <input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value) || min)))} className={inputClass} />;
}

const inputClass = 'h-10 w-full rounded-md border border-[#c8d1c8] bg-white px-3 text-sm font-normal text-[#27312c]';
const textareaClass = 'min-h-24 w-full rounded-md border border-[#c8d1c8] bg-white p-3 text-sm font-normal leading-6 text-[#27312c]';
