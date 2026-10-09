// 題組の作成・編集フォーム。題型の規則（question_type_rules）で入力欄を出し分け、共有の校驗（src/domain/questionValidation.mjs）で入力中に確認する。
// 保存時はサーバーが同じ校驗をもう一度行い、最終判断する。
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Locale } from '../../types';
import type { V3Client } from '../../v3/client';
import type { GroupMaterial, GroupQuestion, QuestionGroup, QuestionType, ValidationIssue } from '../../v3/types';
import { validateQuestionGroup, typeForValidation } from '../../domain/questionValidation.mjs';
import { autoMarks, emptyGroup, emptyQuestion, formToInput, groupToForm, markText, type QuestionForm } from '../../domain/questionEditing.mjs';
import { bankText } from './bankText';
import { textOf } from './QuestionBank';

type Form = QuestionForm;
type Props = { client: V3Client; locale: Locale; types: QuestionType[]; code: string | null; onCancel: () => void; onSaved: (code: string) => void };

const SECTION_KINDS = ['basis', 'step', 'full_answer', 'tip', 'objective'] as const;
const splitList = (value: string) => value.split(/[,，、\s]+/).map((v) => v.trim()).filter(Boolean);

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function GroupEditor({ client, locale, types, code, onCancel, onSaved }: Props) {
  const t = bankText(locale);
  const [original, setOriginal] = useState<QuestionGroup | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [serverIssues, setServerIssues] = useState<{ message: string; errors: ValidationIssue[] } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  // 読み込み：編集なら題組を一度だけ読む
  useEffect(() => {
    if (!code) return;
    let live = true;
    client.questionGroup(code).then((group) => {
      if (!live) return;
      setOriginal(group);
      const next = groupToForm(group);
      setForm(next);
      setTargets(next.questions.map((q) => (q.marks[0] && !q.marks[0].material ? markText(q, q.marks[0], next.materials) : '')));
    }).catch((e: unknown) => { if (live) setServerIssues({ message: e instanceof Error ? e.message : String(e), errors: [] }); });
    return () => { live = false; };
  }, [client, code]);
  // 作成：題型が届いたら最初の題型の空の題組
  useEffect(() => {
    if (code || !types.length) return;
    setForm((current) => current ?? emptyGroup(types[0]));
    setTargets((current) => (current.length ? current : ['']));
  }, [code, types]);

  const type = types.find((x) => x.typeId === form?.typeId);
  const rule = (name: string) => type?.rules[name]?.requirement ?? 'optional';
  const materialTexts = useMemo(() => Object.fromEntries((original?.materials ?? []).filter((m) => m.material).map((m) => [m.material as string, { kind: m.kind, body: m.body, transcript: m.transcript }])), [original]);
  const input = useMemo(() => (form ? formToInput(form, { originalMaterials: original?.materials ?? [] }) : null), [form, original]);
  const issues = useMemo(() => (input && type ? validateQuestionGroup(input, typeForValidation(type), { materialTexts }) : { errors: [], warnings: [] }), [input, type, materialTexts]);

  if (!form || !type) return <section className="library"><p className={serverIssues ? 'library-error' : 'library-empty'}>{serverIssues?.message ?? t.loading}</p></section>;

  const update = (patch: Partial<Form>) => setForm((current) => (current ? { ...current, ...patch } : current));
  const setQuestion = (index: number, patch: Partial<GroupQuestion>, target = targets[index]) => setForm((current) => {
    if (!current) return current;
    const questions = current.questions.map((q, i) => {
      if (i !== index) return q;
      const next = { ...q, ...patch };
      return type.targetMarking === 'none' ? next : { ...next, marks: autoMarks(type, next, { target, index, materials: current.materials }) };
    });
    return { ...current, questions };
  });
  const setMaterial = (role: string, patch: Partial<GroupMaterial>) => setForm((current) => {
    if (!current) return current;
    const materials = current.materials.map((m) => (m.role === role ? { ...m, ...patch } : m));
    // 文章の文法：本文の空欄が変わったら標記も作り直す
    const questions = type.targetMarking === 'passage_blank' ? current.questions.map((q, index) => ({ ...q, marks: autoMarks(type, q, { index, materials }) })) : current.questions;
    return { ...current, materials, questions };
  });
  const changeType = (typeId: string) => {
    const next = types.find((x) => x.typeId === typeId);
    if (!next) return;
    setForm(emptyGroup(next));
    setTargets(['']);
    setServerIssues(null);
  };
  const upload = async (role: string, file: File) => {
    setUploading(role);
    try {
      const media = await client.uploadMedia({ base64: await readFile(file), mime: file.type, fileName: file.name });
      setMaterial(role, { mediaId: media.id });
    } catch (e) {
      setServerIssues({ message: e instanceof Error ? e.message : String(e), errors: [] });
    } finally { setUploading(null); }
  };
  const save = async (status: 'draft' | 'needs_review') => {
    if (!input) return;
    setSaving(true); setServerIssues(null);
    try {
      const saved = code ? await client.updateGroup(code, { ...input, status }) : await client.createGroup({ ...input, status });
      onSaved(saved.code);
    } catch (e) {
      const details = (e as { details?: { errors?: ValidationIssue[] } }).details;
      setServerIssues({ message: e instanceof Error ? e.message : String(e), errors: details?.errors ?? [] });
    } finally { setSaving(false); }
  };

  const optionRule = type.rules.options;
  const fixedOptionCount = optionRule?.requirement !== 'forbidden' && optionRule?.value != null;
  const spokenOptions = type.optionMedia === 'audio' || type.optionMedia === 'mixed';
  const issueAt = (path: string) => issues.errors.filter((e) => e.path === path || e.path.startsWith(`${path}.`) || e.path.startsWith(`${path}[`));

  return (
    <article className="library library-detail bank-editor">
      <nav className="library-detail-nav"><button type="button" onClick={onCancel}>{t.cancel}</button></nav>
      <header className="library-detail-head">
        <h1>{code ? t.editTitle(code) : t.newTitle}</h1>
        <div className="bank-field-row">
          <label className="bank-field">{t.type}
            <select value={form.typeId} disabled={Boolean(code)} onChange={(e) => changeType(e.target.value)}>
              {types.map((x) => <option key={x.typeId} value={x.typeId}>{x.labelJa}{x.official ? '' : ' *'}</option>)}
            </select>
          </label>
          <label className="bank-field">{t.level}
            <select value={form.level ?? ''} onChange={(e) => update({ level: (e.target.value || null) as QuestionForm['level'] })}>
              <option value="">{t.none}</option>
              {(type.levels.length ? type.levels : ['N1', 'N2', 'N3', 'N4', 'N5']).map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
        </div>
        {textOf(type.task) ? <p className="library-muted">{textOf(type.task)}</p> : null}
        <RuleSummary type={type} locale={locale} />
      </header>

      <section className="library-section bank-form">
        <label className="bank-field">{t.instruction}<textarea lang="ja" rows={2} value={form.instruction} onChange={(e) => update({ instruction: e.target.value })} /></label>
        <label className="bank-field">{t.context}<textarea lang="ja" rows={2} value={form.context} onChange={(e) => update({ context: e.target.value })} /></label>
      </section>

      {form.materials.map((m) => (
        <section key={m.role} className="library-section bank-form">
          <h2>{t.role[m.role] ?? m.role}{m.material ? ` · ${m.material}` : ''}</h2>
          {m.kind === 'passage' || m.kind === 'notice' ? (
            <label className="bank-field">{t.body}<textarea lang="ja" rows={8} value={m.body ?? ''} onChange={(e) => setMaterial(m.role, { body: e.target.value })} /></label>
          ) : (
            <div className="bank-field">
              {t.file}
              <input type="file" accept={m.kind === 'audio' ? 'audio/*' : 'image/png,image/jpeg,image/webp,image/gif'} onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(m.role, file); }} />
              <span className="library-muted">{uploading === m.role ? t.uploading : m.mediaId ? t.uploaded(m.mediaId) : ''}</span>
            </div>
          )}
          {m.kind === 'audio' ? <label className="bank-field">{t.transcript}<textarea lang="ja" rows={5} value={m.transcript ?? ''} onChange={(e) => setMaterial(m.role, { transcript: e.target.value })} /></label> : null}
          <Issues issues={issueAt('materials')} />
        </section>
      ))}

      {form.questions.map((q, qi) => (
        <section key={qi} className="library-section bank-form">
          <h2>{t.question(qi + 1)}{q.code ? ` · ${q.code}` : ''}</h2>
          {rule('prompt') !== 'forbidden' ? (
            <label className="bank-field">{t.prompt}{rule('prompt') === 'required' ? ` · ${t.required}` : ''}
              <textarea lang="ja" rows={2} value={q.prompt ?? ''} onChange={(e) => setQuestion(qi, { prompt: e.target.value })} />
            </label>
          ) : null}
          {type.targetMarking === 'underline' || (type.targetMarking === 'blank' && !/（[\s　]*）|\([\s　]*\)|＿{2,}/.test(q.prompt ?? '')) ? (
            <label className="bank-field">{type.targetMarking === 'blank' ? `${t.target} / ${t.blankAuto}` : t.target}
              <input lang="ja" value={targets[qi] ?? ''} onChange={(e) => {
                const next = [...targets]; next[qi] = e.target.value; setTargets(next); setQuestion(qi, {}, e.target.value);
              }} />
              <small className="library-muted">{q.marks.length ? t.markFound(markText(q, q.marks[0], form.materials)) : targets[qi] ? t.markMissing : ''}</small>
            </label>
          ) : null}
          {type.targetMarking === 'blank' && q.marks.length && /（[\s　]*）|\([\s　]*\)|＿{2,}/.test(q.prompt ?? '') ? <small className="library-muted">{t.blankAuto}</small> : null}
          {type.targetMarking === 'star' ? <small className="library-muted">{t.starAuto}（{q.marks.length}）</small> : null}
          {type.targetMarking === 'passage_blank' ? <small className="library-muted">{t.passageBlankAuto(qi + 1)} {q.marks.length ? '✓' : '—'}</small> : null}
          {q.prompt && q.marks.length ? <p className="bank-preview">{markPreview(q)}</p> : null}
          <label className="bank-field">{t.translation}<input value={textOf(q.translation)} onChange={(e) => setQuestion(qi, { translation: e.target.value })} /></label>
          {rule('expected_text') !== 'forbidden' ? (
            <label className="bank-field">{t.expectedText} · {t.required}<textarea lang="ja" rows={2} value={q.expectedText ?? ''} onChange={(e) => setQuestion(qi, { expectedText: e.target.value })} /></label>
          ) : null}

          {rule('options') !== 'forbidden' ? (
            <fieldset className="bank-options-editor">
              <legend>{t.options}{optionRule?.value != null ? `（${optionRule.value}）` : ''}</legend>
              {spokenOptions ? <small className="library-muted">{t.spokenOptions}</small> : null}
              {q.options.map((o, oi) => (
                <div key={oi} className="bank-option-row" data-correct={o.correct ? 'true' : 'false'}>
                  <span className="bank-option-number">{oi + 1}</span>
                  <div className="bank-option-fields">
                    <div className="bank-field-row">
                      <input lang="ja" aria-label={t.optionText} placeholder={t.optionText} value={o.text ?? ''} onChange={(e) => setQuestion(qi, { options: q.options.map((x, i) => (i === oi ? { ...x, text: e.target.value } : x)) })} />
                      {rule('correct_option') !== 'forbidden' ? (
                        <label className="bank-radio"><input type="radio" name={`correct-${qi}`} checked={o.correct === true} onChange={() => setQuestion(qi, { options: q.options.map((x, i) => ({ ...x, correct: i === oi })) })} />{t.correct}</label>
                      ) : null}
                      {!fixedOptionCount ? <button type="button" onClick={() => setQuestion(qi, { options: q.options.filter((_, i) => i !== oi) })}>{t.removeOption}</button> : null}
                    </div>
                    {rule('option_analysis') !== 'forbidden' ? (
                      <textarea rows={2} aria-label={t.analysis} placeholder={t.analysis} value={textOf(o.analysis)} onChange={(e) => setQuestion(qi, { options: q.options.map((x, i) => (i === oi ? { ...x, analysis: e.target.value } : x)) })} />
                    ) : null}
                    {!o.correct && rule('correct_option') !== 'forbidden' ? (
                      <input aria-label={t.distractorType} placeholder={t.distractorType} value={o.distractorType ?? ''} onChange={(e) => setQuestion(qi, { options: q.options.map((x, i) => (i === oi ? { ...x, distractorType: e.target.value } : x)) })} />
                    ) : null}
                  </div>
                </div>
              ))}
              {!fixedOptionCount ? <button type="button" onClick={() => setQuestion(qi, { options: [...q.options, { id: null, text: '', correct: false, analysis: '' }] })}>{t.addOption}</button> : null}
            </fieldset>
          ) : null}

          <fieldset className="bank-sections-editor">
            <legend>{t.explanation}{rule('basis') === 'required' ? ` · ${t.section.basis} ${t.required}` : ''}</legend>
            {q.explanation.map((s, si) => (
              <div key={si} className="bank-field-row">
                <select aria-label={t.sectionKind} value={s.kind} onChange={(e) => setQuestion(qi, { explanation: q.explanation.map((x, i) => (i === si ? { ...x, kind: e.target.value as typeof s.kind } : x)) })}>
                  {SECTION_KINDS.filter((k) => k !== 'basis' || rule('basis') !== 'forbidden').map((k) => <option key={k} value={k}>{t.section[k]}</option>)}
                </select>
                <textarea rows={2} aria-label={t.sectionBody} value={textOf(s.body)} onChange={(e) => setQuestion(qi, { explanation: q.explanation.map((x, i) => (i === si ? { ...x, body: e.target.value } : x)) })} />
                <button type="button" onClick={() => setQuestion(qi, { explanation: q.explanation.filter((_, i) => i !== si) })}>{t.removeOption}</button>
              </div>
            ))}
            <button type="button" onClick={() => setQuestion(qi, { explanation: [...q.explanation, { kind: rule('basis') === 'forbidden' ? 'step' : 'basis', title: null, body: '' }] })}>{t.addSection}</button>
          </fieldset>

          <div className="bank-field-row">
            <label className="bank-field">{t.knowledgeCodes}<input defaultValue={q.knowledge.map((k) => k.code).join(', ')} onBlur={(e) => setQuestion(qi, { knowledge: splitList(e.target.value).map((c) => ({ code: c.toUpperCase(), relation: q.knowledge.find((k) => k.code === c.toUpperCase())?.relation ?? 'target' })) })} /></label>
            <label className="bank-field">{t.tagsInput}<input defaultValue={q.tags.join(', ')} onBlur={(e) => setQuestion(qi, { tags: splitList(e.target.value) })} /></label>
          </div>
          {type.drawWholeGroup && form.questions.length > 1 ? <button type="button" onClick={() => { update({ questions: form.questions.filter((_, i) => i !== qi) }); setTargets(targets.filter((_, i) => i !== qi)); }}>{t.removeQuestion}</button> : null}
          <Issues issues={issueAt(`questions[${qi}]`)} />
        </section>
      ))}
      {type.drawWholeGroup ? <button type="button" className="bank-add" onClick={() => { update({ questions: [...form.questions, emptyQuestion(type)] }); setTargets([...targets, '']); }}>{t.addQuestion}</button> : null}

      <section className="library-section bank-status-panel" aria-live="polite">
        {issues.errors.length
          ? <details className="bank-issue-summary"><summary>{t.errors}（{issues.errors.length}）</summary><Issues issues={issues.errors} /></details>
          : <p className="bank-valid">✓ {t.valid}</p>}
        {issues.warnings.length ? <details className="bank-issue-summary" open><summary>{t.warnings}（{issues.warnings.length}）</summary><Issues issues={issues.warnings} warning /></details> : null}
        {serverIssues ? <div className="library-error"><p>{t.serverErrors} {serverIssues.message}</p></div> : null}
        <div className="library-row-actions">
          <button type="button" className="library-button" disabled={saving || issues.errors.length > 0} onClick={() => void save('needs_review')}>{saving ? t.saving : t.save}</button>
          <button type="button" disabled={saving} onClick={() => void save('draft')}>{t.saveDraft}</button>
          <button type="button" onClick={onCancel}>{t.cancel}</button>
        </div>
      </section>
    </article>
  );
}

function markPreview(q: GroupQuestion) {
  const prompt = q.prompt ?? '';
  const marks = q.marks.filter((m) => !m.material).sort((a, b) => a.start - b.start);
  const parts: ReactNode[] = [];
  let at = 0;
  marks.forEach((m, i) => {
    if (m.start < at) return;
    parts.push(prompt.slice(at, m.start));
    parts.push(<mark key={i} className={`bank-mark bank-mark-${m.kind}`}>{prompt.slice(m.start, m.end) || '　'}</mark>);
    at = m.end;
  });
  parts.push(prompt.slice(at));
  return <span lang="ja">{parts}</span>;
}

function Issues({ issues, warning = false }: { issues: ValidationIssue[]; warning?: boolean }) {
  if (!issues.length) return null;
  return <ul className={warning ? 'bank-issues bank-issues-warning' : 'bank-issues'}>{issues.map((i, n) => <li key={n}><code>{i.path}</code> {i.message}</li>)}</ul>;
}

function RuleSummary({ type, locale }: { type: QuestionType; locale: Locale }) {
  const t = bankText(locale);
  const label: Record<string, string> = { prompt: t.prompt, options: t.options, correct_option: t.correct, expected_text: t.expectedText, materials: t.materials, basis: t.section.basis, option_analysis: t.analysis };
  const items = Object.entries(label).map(([rule, name]) => {
    const r = type.rules[rule];
    if (!r || r.requirement === 'optional') return null;
    const value = rule === 'options' && r.requirement === 'required' ? `（${r.value ?? '≥2'}）` : '';
    return `${name}${value}：${r.requirement === 'required' ? t.required : r.requirement === 'forbidden' ? t.forbidden : r.requirement}`;
  }).filter(Boolean);
  return <p className="bank-rules"><span className="library-label">{t.rulesOf(type.labelJa)}</span>{items.join(' · ')}</p>;
}
