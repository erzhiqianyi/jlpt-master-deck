// 収集箱・AI の下書き・学習計画・毎日のまとめ・共有（v3）。データは /api/v3 から直接読む。
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Locale } from '../../types';
import { createV3Client, type V3Client } from '../../v3/client';
import type { DailyReport, Draft, DraftQuestionRef, DraftSummary, InboxCapture, JlptLevel, MarketShare, MarketShareDetail, PlanModule, StudyPlan } from '../../v3/types';
import { textOf } from '../question-bank/QuestionBank';
import { activityText } from './activityText';
import '../library/library.css';
import '../question-bank/questionBank.css';
import '../practice/practice.css';

const useClient = (token: string) => useMemo(() => createV3Client(token), [token]);
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => { setError(''); load().then(setData).catch((e: unknown) => setError(errorText(e))); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(reload, [reload]);
  return { data, error, reload, setData };
}

function State({ error, loading, locale }: { error: string; loading: boolean; locale: Locale }) {
  const t = activityText(locale);
  if (error) return <p className="library-error">{t.loadError}：{error}</p>;
  return loading ? <p className="library-empty">{t.loading}</p> : null;
}

// ---------- 収集箱 ----------
export function InboxView({ token, locale }: { token: string; locale: Locale }) {
  const client = useClient(token);
  const t = activityText(locale);
  const [status, setStatus] = useState<InboxCapture['status']>('inbox');
  const { data, error, reload } = useLoad(() => client.inbox({ status, limit: 200 }), [client, status]);
  const act = (action: Promise<unknown>) => void action.then(reload).catch(() => reload());
  return (
    <section className="library">
      <header className="library-header"><div><h1>{t.inbox}</h1><p>{t.inboxHint}</p></div></header>
      <div className="library-books" role="tablist">
        {(['inbox', 'processed', 'archived'] as const).map((s) => <button key={s} type="button" role="tab" className="library-book" aria-selected={status === s} onClick={() => setStatus(s)}>{t.status[s]}</button>)}
      </div>
      <State error={error} loading={!data} locale={locale} />
      {data && !data.items.length ? <p className="library-empty">{t.empty}</p> : null}
      <ol className="library-list">
        {data?.items.map((c) => (
          <li key={c.code}>
            <div className="bank-row inbox-row">
              <span className="library-code">{c.code}</span>
              <span className="bank-row-main">
                <span className="bank-row-type">{t.category[c.category]}{c.wordbook ? ` · ${c.wordbook}` : ''} · {new Date(c.createdAt).toLocaleString(locale)}</span>
                <strong lang="ja">{c.body}</strong>
                {c.context ? <span className="library-muted library-pre">{c.context}</span> : null}
              </span>
              <span className="library-row-actions">
                {c.status === 'inbox' ? <button type="button" onClick={() => act(client.setCaptureStatus(c.code, 'archived'))}>{t.archive}</button>
                  : <button type="button" onClick={() => act(client.setCaptureStatus(c.code, 'inbox'))}>{t.reopen}</button>}
                <button type="button" onClick={() => { if (window.confirm(t.confirmDelete)) act(client.deleteCapture(c.code)); }}>{t.delete}</button>
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------- AI の下書き ----------
export function DraftsView({ token, locale, code, onOpen }: { token: string; locale: Locale; code?: string; onOpen: (code: string | null) => void }) {
  const client = useClient(token);
  if (code) return <DraftDetail client={client} locale={locale} code={code} onBack={() => onOpen(null)} />;
  return <DraftList client={client} locale={locale} onOpen={onOpen} />;
}

function DraftList({ client, locale, onOpen }: { client: V3Client; locale: Locale; onOpen: (code: string) => void }) {
  const t = activityText(locale);
  const { data, error } = useLoad(() => client.drafts(), [client]);
  return (
    <section className="library">
      <header className="library-header"><div><h1>{t.drafts}</h1><p>{t.draftsHint}</p></div></header>
      <State error={error} loading={!data} locale={locale} />
      {data && !data.length ? <p className="library-empty">{t.empty}</p> : null}
      <ol className="library-list">
        {data?.map((d: DraftSummary) => (
          <li key={d.code}>
            <button type="button" className="bank-row" onClick={() => onOpen(d.code)}>
              <span className="library-code">{d.code}</span>
              <span className="bank-row-main"><span className="bank-row-type">{d.date ?? new Date(d.createdAt).toLocaleDateString(locale)} · {t.questions(d.questionCount)}{d.commentCount ? ` · ${t.comments} ${d.commentCount}` : ''}</span><span>{textOf(d.title) || d.code}</span></span>
              <span className="library-meta"><em data-status={d.status === 'approved' ? 'mastered' : d.status === 'needs_revision' ? 'needs_revision' : 'learning'}>{t.draftStatus[d.status]}</em></span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function QuestionRefs({ refs, locale }: { refs: DraftQuestionRef[]; locale: Locale }) {
  return (
    <ol className="library-bullets draft-questions">
      {refs.map((q) => <li key={q.question}><span className="library-code">{q.question}</span> <span lang="ja">{q.prompt ?? ''}</span>{q.groupStatus !== 'ready' ? <em className="library-fallback">{activityText(locale).groupNotReady.slice(0, 6)}</em> : null}</li>)}
    </ol>
  );
}

function DraftDetail({ client, locale, code, onBack }: { client: V3Client; locale: Locale; code: string; onBack: () => void }) {
  const t = activityText(locale);
  const { data: draft, error, setData } = useLoad(() => client.draft(code), [client, code]);
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (action: () => Promise<Draft | void>, done?: string) => {
    setBusy(true); setMessage('');
    try { const next = await action(); if (next) setData(next); if (done) setMessage(done); } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); }
  };
  const nav = <nav className="library-detail-nav"><button type="button" onClick={onBack}>{t.back}</button></nav>;
  if (!draft) return <section className="library">{nav}<State error={error} loading locale={locale} /></section>;
  const allReady = [...draft.sections.flatMap((s) => s.questions), ...draft.quiz, ...draft.generated].every((q) => q.groupStatus === 'ready');
  return (
    <article className="library library-detail">
      {nav}
      <header className="library-detail-head">
        <span className="library-code">{draft.code} · {t.draftStatus[draft.status]}{draft.date ? ` · ${draft.date}` : ''}</span>
        <h1>{textOf(draft.title) || draft.code}</h1>
        {textOf(draft.description) ? <p className="library-pre">{textOf(draft.description)}</p> : null}
        {draft.published.length ? <p className="library-muted">{t.published(draft.published.join('、'))}</p> : null}
        <div className="library-row-actions">
          {draft.status !== 'approved' ? <button type="button" disabled={busy} onClick={() => void act(() => client.setDraftStatus(draft.code, 'approved'))}>{t.approve}</button> : null}
          <button type="button" className="library-button" disabled={busy || !allReady} title={allReady ? '' : t.groupNotReady}
            onClick={() => void act(async () => { const r = await client.publishDraft(draft.code); setMessage(t.published(r.practice)); return client.draft(draft.code); })}>{t.publish}</button>
          <button type="button" disabled={busy} onClick={() => { if (window.confirm(t.confirmDelete)) void client.deleteDraft(draft.code).then(onBack); }}>{t.delete}</button>
        </div>
        {!allReady ? <p className="library-muted">{t.groupNotReady}</p> : null}
        {message ? <p className="library-muted">{message}</p> : null}
      </header>
      {draft.objectives.length ? <section className="library-section"><h2>{t.objectives}</h2><ul className="library-bullets">{draft.objectives.map((o, i) => <li key={i}>{o.text}</li>)}</ul></section> : null}
      {draft.sections.map((s) => (
        <section key={s.position} className="library-section">
          <h2>{textOf(s.title) || `${s.position + 1}`}</h2>
          {textOf(s.body) ? <p className="library-pre">{textOf(s.body)}</p> : null}
          {s.questions.length ? <QuestionRefs refs={s.questions} locale={locale} /> : null}
        </section>
      ))}
      {draft.quiz.length ? <section className="library-section"><h2>{t.quiz}</h2><QuestionRefs refs={draft.quiz} locale={locale} /></section> : null}
      {draft.generated.length ? <section className="library-section"><h2>{t.generated}</h2><QuestionRefs refs={draft.generated} locale={locale} /></section> : null}
      {textOf(draft.nextStep) ? <section className="library-section"><h2>{t.nextStep}</h2><p className="library-pre">{textOf(draft.nextStep)}</p></section> : null}
      <section className="library-section">
        <h2>{t.comments}</h2>
        <ul className="library-bullets">{draft.comments.map((c) => <li key={c.code}><span className="library-code">{c.code}</span> {c.body}</li>)}</ul>
        <form className="practice-text-answer" onSubmit={(e) => { e.preventDefault(); if (comment.trim()) void act(() => client.commentDraft(draft.code, comment.trim())).then(() => setComment('')); }}>
          <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t.commentPlaceholder} aria-label={t.commentPlaceholder} />
          <button type="submit" className="library-button" disabled={busy || !comment.trim()}>{t.send}</button>
        </form>
      </section>
    </article>
  );
}

// ---------- 学習計画 ----------
export function PlanView({ token, locale }: { token: string; locale: Locale }) {
  const client = useClient(token);
  const t = activityText(locale);
  const { data: plan, error, setData } = useLoad(() => client.plan(), [client]);
  const [editing, setEditing] = useState(false);
  if (!plan) return <section className="library"><State error={error} loading locale={locale} /></section>;
  const today = new Date().toISOString().slice(0, 10);
  const todays = plan.tasks.filter((x) => x.date === today);
  const upcoming = plan.tasks.filter((x) => x.date > today).slice(0, 14);
  const setStatus = (code: string, status: StudyPlan['tasks'][number]['status']) => void client.setTaskStatus(code, status).then(() => client.plan()).then(setData);
  return (
    <section className="library">
      <header className="library-header">
        <div><h1>{t.plan}</h1><p>{t.planStatus[plan.status]}{plan.profile?.examDate ? ` · ${t.examDate} ${plan.profile.examDate}` : ''}</p></div>
        <button type="button" className="library-button" onClick={() => setEditing(!editing)}>{editing ? t.cancel : t.exam}</button>
      </header>
      <p className="bank-hint">{t.planHint}</p>
      {editing || plan.status === 'none' ? <PlanProfileForm client={client} locale={locale} plan={plan} onSaved={(next) => { setData(next); setEditing(false); }} /> : null}
      {textOf(plan.strategy?.goal) ? <section className="library-section"><h2>{t.exam}</h2><p className="library-pre">{textOf(plan.strategy?.goal)}</p>{textOf(plan.strategy?.phaseStrategy) ? <p className="library-pre library-muted">{textOf(plan.strategy?.phaseStrategy)}</p> : null}</section> : null}
      {[[t.today, todays], [t.upcoming, upcoming]].map(([title, tasks]) => (tasks as StudyPlan['tasks']).length ? (
        <section key={title as string} className="library-section">
          <h2>{title as string}</h2>
          <ol className="plan-tasks">
            {(tasks as StudyPlan['tasks']).map((task) => (
              <li key={task.code} data-status={task.status}>
                <span className="library-code">{task.date.slice(5)}</span>
                <span className="bank-row-main"><strong>{textOf(task.title)}</strong><span className="library-muted">{t.module[task.module]}{task.minutes ? ` · ${task.minutes} min` : ''}{textOf(task.detail) ? ` · ${textOf(task.detail)}` : ''}</span></span>
                <span className="library-row-actions">
                  {task.status === 'pending' ? <><button type="button" onClick={() => setStatus(task.code, 'completed')}>{t.done}</button><button type="button" onClick={() => setStatus(task.code, 'skipped')}>{t.skip}</button></>
                    : <button type="button" onClick={() => setStatus(task.code, 'pending')}>{t.taskStatus[task.status]} · {t.undo}</button>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null)}
      {plan.phases.length ? (
        <section className="library-section">
          <h2>{t.phases}</h2>
          <dl className="library-notes">{plan.phases.map((p) => <div key={p.position}><dt>{p.startDate} – {p.endDate} · {textOf(p.focus)}</dt><dd>{textOf(p.goal)}{p.points.length ? <ul className="library-bullets">{p.points.map((x, i) => <li key={i}>{x.text}</li>)}</ul> : null}</dd></div>)}</dl>
        </section>
      ) : null}
    </section>
  );
}

function PlanProfileForm({ client, locale, plan, onSaved }: { client: V3Client; locale: Locale; plan: StudyPlan; onSaved: (plan: StudyPlan) => void }) {
  const t = activityText(locale);
  const p = plan.profile;
  const [form, setForm] = useState({
    examName: p?.examName ?? 'JLPT', level: p?.level ?? 'N1', startDate: p?.startDate ?? new Date().toISOString().slice(0, 10), examDate: p?.examDate ?? '',
    studyDaysPerWeek: p?.studyDaysPerWeek ?? 6, dailyMinutes: p?.dailyMinutes ?? 60, fixedSchedule: textOf(p?.fixedSchedule), supplementalNeeds: textOf(p?.supplementalNeeds),
    materials: (p?.materials ?? []).map((m) => ({ title: textOf(m.title), module: m.module, currentPosition: textOf(m.currentPosition) })),
  });
  const [error, setError] = useState('');
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const save = () => client.savePlanProfile({ ...form, examDate: form.examDate || null, materials: form.materials.filter((m) => m.title.trim()) }).then(onSaved).catch((e: unknown) => setError(errorText(e)));
  return (
    <section className="library-section bank-editor bank-form">
      <div className="bank-field-row">
        <label className="bank-field">{t.examName}<input value={form.examName} onChange={(e) => set({ examName: e.target.value })} /></label>
        <label className="bank-field">{t.level}<select value={form.level} onChange={(e) => set({ level: e.target.value as JlptLevel })}>{['N1', 'N2', 'N3', 'N4', 'N5'].map((l) => <option key={l}>{l}</option>)}</select></label>
        <label className="bank-field">{t.startDate}<input type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} /></label>
        <label className="bank-field">{t.examDate}<input type="date" value={form.examDate} onChange={(e) => set({ examDate: e.target.value })} /></label>
        <label className="bank-field">{t.days}<input type="number" min={1} max={7} value={form.studyDaysPerWeek} onChange={(e) => set({ studyDaysPerWeek: Number(e.target.value) })} /></label>
        <label className="bank-field">{t.minutes}<input type="number" min={5} max={720} value={form.dailyMinutes} onChange={(e) => set({ dailyMinutes: Number(e.target.value) })} /></label>
      </div>
      <fieldset className="bank-options-editor">
        <legend>{t.materials}</legend>
        {form.materials.map((m, i) => (
          <div key={i} className="bank-field-row">
            <input aria-label={t.materialTitle} placeholder={t.materialTitle} value={m.title} onChange={(e) => set({ materials: form.materials.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
            <select aria-label="module" value={m.module} onChange={(e) => set({ materials: form.materials.map((x, j) => (j === i ? { ...x, module: e.target.value as PlanModule } : x)) })}>
              {(['vocabulary', 'grammar', 'reading', 'listening', 'other'] as const).map((x) => <option key={x} value={x}>{t.module[x]}</option>)}
            </select>
            <input aria-label={t.currentPosition} placeholder={t.currentPosition} value={m.currentPosition} onChange={(e) => set({ materials: form.materials.map((x, j) => (j === i ? { ...x, currentPosition: e.target.value } : x)) })} />
            <button type="button" onClick={() => set({ materials: form.materials.filter((_, j) => j !== i) })}>{t.removeMaterial}</button>
          </div>
        ))}
        <button type="button" onClick={() => set({ materials: [...form.materials, { title: '', module: 'vocabulary', currentPosition: '' }] })}>{t.addMaterial}</button>
      </fieldset>
      <label className="bank-field">{t.fixedSchedule}<textarea rows={2} value={form.fixedSchedule} onChange={(e) => set({ fixedSchedule: e.target.value })} /></label>
      <label className="bank-field">{t.supplementalNeeds}<textarea rows={2} value={form.supplementalNeeds} onChange={(e) => set({ supplementalNeeds: e.target.value })} /></label>
      {error ? <p className="library-error">{error}</p> : null}
      <div className="library-row-actions"><button type="button" className="library-button" onClick={() => void save()}>{t.save}</button></div>
    </section>
  );
}

// ---------- 毎日のまとめ ----------
export function ReportsView({ token, locale }: { token: string; locale: Locale }) {
  const client = useClient(token);
  const t = activityText(locale);
  const { data: list, error } = useLoad(() => client.reports(), [client]);
  const [date, setDate] = useState<string | null>(null);
  const [report, setReport] = useState<DailyReport | null>(null);
  useEffect(() => { const d = date ?? list?.[0]?.date; if (d) client.report(d).then(setReport).catch(() => setReport(null)); }, [client, date, list]);
  return (
    <section className="library">
      <header className="library-header"><div><h1>{t.reports}</h1><p>{t.reportsHint}</p></div></header>
      <State error={error} loading={!list} locale={locale} />
      {list && !list.length ? <p className="library-empty">{t.empty}</p> : null}
      {list?.length ? (
        <div className="library-books">{list.map((r) => <button key={r.date} type="button" className="library-book" aria-selected={(date ?? list[0].date) === r.date} onClick={() => setDate(r.date)}><span>{r.date}</span><small>{r.correct}/{r.total}</small></button>)}</div>
      ) : null}
      {report ? (
        <>
          <dl className="stats-tiles">
            <div><dt>{t.total}</dt><dd>{report.totals.total}</dd></div>
            <div><dt>{t.accuracy}</dt><dd>{report.totals.accuracy == null ? '—' : `${report.totals.accuracy}%`}</dd></div>
          </dl>
          {textOf(report.summary) ? <section className="library-section"><p className="library-pre">{textOf(report.summary)}</p></section> : null}
          {([['strengths', report.strengths], ['weaknesses', report.weaknesses]] as const).map(([key, points]) => points.length ? (
            <section key={key} className="library-section"><h2>{t[key]}</h2><dl className="library-notes">{points.map((p, i) => <div key={i}><dt>{textOf(p.label)}</dt><dd>{textOf(p.detail)}</dd></div>)}</dl></section>
          ) : null)}
          {report.confusions.length ? <section className="library-section"><h2>{t.confusions}</h2><ul className="library-bullets">{report.confusions.map((c, i) => <li key={i}>{textOf(c.topic)} <span className="library-muted" lang="ja">{c.knowledge.map((k) => k.expression).join('・')}</span></li>)}</ul></section> : null}
          {report.recommendations.length ? <section className="library-section"><h2>{t.recommendations}</h2><dl className="library-notes">{report.recommendations.map((r, i) => <div key={i}><dt>{textOf(r.title)}</dt><dd>{textOf(r.detail)}</dd></div>)}</dl></section> : null}
          {report.wrongAnswers.length ? <section className="library-section"><h2>{t.wrongAnswers}</h2><ul className="library-bullets">{report.wrongAnswers.map((w, i) => <li key={i}><span lang="ja">{w.prompt}</span> <span className="library-muted">{t.chose} {w.selected} · {t.answer} {w.correctAnswer}</span></li>)}</ul></section> : null}
        </>
      ) : null}
    </section>
  );
}

// ---------- 共有 ----------
export function MarketView({ token, locale, shareId, onOpen }: { token: string; locale: Locale; shareId?: string; onOpen: (id: string | null) => void }) {
  const client = useClient(token);
  if (shareId) return <ShareDetail client={client} locale={locale} id={shareId} onBack={() => onOpen(null)} />;
  return <ShareList client={client} locale={locale} onOpen={onOpen} />;
}

function ShareList({ client, locale, onOpen }: { client: V3Client; locale: Locale; onOpen: (id: string) => void }) {
  const t = activityText(locale);
  const [mine, setMine] = useState(false);
  const { data, error, reload } = useLoad(() => client.marketShares(mine), [client, mine]);
  const { data: sources } = useLoad(() => client.marketSources(), [client]);
  const [message, setMessage] = useState('');
  const share = (kind: 'wordbook' | 'practice', source: string) => void client.publishShare({ kind, source }).then((s) => { setMessage(s.title); setMine(true); reload(); }).catch((e: unknown) => setMessage(errorText(e)));
  return (
    <section className="library">
      <header className="library-header"><div><h1>{t.market}</h1><p>{t.marketHint}</p></div></header>
      <div className="library-books" role="tablist">
        <button type="button" role="tab" className="library-book" aria-selected={!mine} onClick={() => setMine(false)}>{t.all}</button>
        <button type="button" role="tab" className="library-book" aria-selected={mine} onClick={() => setMine(true)}>{t.mine}</button>
      </div>
      {message ? <p className="library-muted">{message}</p> : null}
      <State error={error} loading={!data} locale={locale} />
      {data && !data.length ? <p className="library-empty">{t.empty}</p> : null}
      <ol className="library-list">
        {data?.map((s: MarketShare) => (
          <li key={s.id}>
            <button type="button" className="bank-row" onClick={() => onOpen(s.id)}>
              <span className="library-code">{s.kind === 'wordbook' ? 'WB' : 'TP'}</span>
              <span className="bank-row-main"><span className="bank-row-type">{new Date(s.createdAt).toLocaleDateString(locale)} · {t.knowledgeCount(s.knowledgeCount)} · {t.groupCount(s.groupCount)}</span><span>{s.title}</span></span>
              <span className="library-meta">{s.withdrawn ? <em>{t.withdrawn}</em> : null}</span>
            </button>
          </li>
        ))}
      </ol>
      {mine && sources ? (
        <section className="library-section">
          <h2>{t.sources}</h2>
          <ul className="library-bullets">
            {[...sources.wordbooks, ...sources.practices].map((x) => <li key={`${x.kind}:${x.source}`}>{x.title} <span className="library-muted">· {x.count}</span> <button type="button" className="practice-link" onClick={() => share(x.kind, x.source)}>{t.share}</button></li>)}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

function ShareDetail({ client, locale, id, onBack }: { client: V3Client; locale: Locale; id: string; onBack: () => void }) {
  const t = activityText(locale);
  const { data: share, error, reload } = useLoad<MarketShareDetail>(() => client.marketShare(id), [client, id]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = <nav className="library-detail-nav"><button type="button" onClick={onBack}>{t.back}</button></nav>;
  if (!share) return <section className="library">{nav}<State error={error} loading locale={locale} /></section>;
  const run = (action: () => Promise<void>) => { setBusy(true); setMessage(''); action().catch((e: unknown) => setMessage(errorText(e))).finally(() => setBusy(false)); };
  return (
    <article className="library library-detail">
      {nav}
      <header className="library-detail-head">
        <span className="library-code">{t.knowledgeCount(share.knowledgeCount)} · {t.groupCount(share.groupCount)}</span>
        <h1>{share.title}</h1>
        {share.description ? <p className="library-pre">{share.description}</p> : null}
        <div className="library-row-actions">
          {share.mine ? (!share.withdrawn ? <button type="button" disabled={busy} onClick={() => run(async () => { await client.withdrawShare(share.id); reload(); })}>{t.withdraw}</button> : <em>{t.withdrawn}</em>)
            : <button type="button" className="library-button" disabled={busy || share.withdrawn} onClick={() => run(async () => {
              const r = await client.importShare(share.id);
              setMessage(r.alreadyImported ? t.alreadyImported : `${t.imported({ knowledge: r.knowledge.length, groups: r.groups.length })}${r.needsRevision?.length ? ` · ${t.needsRevision(r.needsRevision.length)}` : ''}`);
            })}>{t.importShare}</button>}
        </div>
        {message ? <p className="library-muted">{message}</p> : null}
      </header>
      {share.package.knowledge.length ? (
        <section className="library-section"><ul className="library-bullets">{share.package.knowledge.slice(0, 200).map((k, i) => <li key={i}><strong lang="ja">{k.expression}</strong> <span className="library-muted">{k.reading ?? ''} {k.meaning ?? ''}</span></li>)}</ul></section>
      ) : null}
      {share.package.groups.length ? (
        <section className="library-section"><ol className="library-bullets">{share.package.groups.slice(0, 200).map((g, i) => <li key={i}><span className="library-code">{g.typeId}</span> <span lang="ja">{g.questions[0]?.prompt ?? ''}</span></li>)}</ol></section>
      ) : null}
    </article>
  );
}
