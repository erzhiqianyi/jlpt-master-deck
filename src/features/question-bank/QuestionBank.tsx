// 題庫（v3）：モジュールごとの題組一覧、題組の詳細（素材・小題・選項・解説・根拠・審査）、作成と編集。データは /api/v3 から直接読む。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Locale } from '../../types';
import { createV3Client, type V3Client } from '../../v3/client';
import type { GroupMaterial, GroupStatus, GroupSummary, JlptLevel, QuestionGroup, QuestionMark, QuestionModule, QuestionType, TextValue } from '../../v3/types';
import { bankText } from './bankText';
import { GroupEditor } from './GroupEditor';
import '../library/library.css';
import './questionBank.css';

const PAGE_SIZE = 30;
const LEVELS: JlptLevel[] = ['N1', 'N2', 'N3', 'N4', 'N5'];
const STATUSES: GroupStatus[] = ['ready', 'needs_review', 'needs_revision', 'draft', 'retired'];
export const textOf = (value: TextValue | undefined) => (value && typeof value === 'object' ? value.text : value ?? '');

type Props = {
  token: string;
  locale: Locale;
  module: QuestionModule;
  /** 題組番号（QS12）、'new'、または 'QS12~edit' */
  itemId?: string;
  onNavigate: (itemId: string | null) => void;
};

export function QuestionBank({ token, locale, module, itemId, onNavigate }: Props) {
  const client = useMemo(() => createV3Client(token), [token]);
  const t = bankText(locale);
  const [types, setTypes] = useState<QuestionType[]>([]);
  useEffect(() => { client.questionTypes().then(setTypes).catch(() => undefined); }, [client]);
  const moduleTypes = types.filter((type) => type.module === module);

  if (itemId === 'new' || itemId?.endsWith('~edit')) {
    const code = itemId === 'new' ? null : itemId.replace(/~edit$/, '');
    return <GroupEditor client={client} locale={locale} types={moduleTypes} code={code} onCancel={() => onNavigate(code)} onSaved={(saved) => onNavigate(saved)} />;
  }
  if (itemId) return <GroupDetail client={client} locale={locale} code={itemId} types={types} onNavigate={onNavigate} />;
  return (
    <section className="library">
      <header className="library-header">
        <div><h1>{t.title[module]}</h1></div>
        <button type="button" className="library-button" onClick={() => onNavigate('new')}>{t.create}</button>
      </header>
      <p className="bank-hint">{t.reviewHint}</p>
      <GroupList client={client} locale={locale} module={module} types={moduleTypes} onOpen={onNavigate} />
    </section>
  );
}

// ---------- 一覧 ----------
function GroupList({ client, locale, module, types, onOpen }: { client: V3Client; locale: Locale; module: QuestionModule; types: QuestionType[]; onOpen: (code: string) => void }) {
  const t = bankText(locale);
  const key = `bank-filters:${module}`;
  const [filters, setFilters] = useState<{ typeId?: string; status?: GroupStatus; level?: JlptLevel; q?: string; offset?: number }>(() => {
    try { return JSON.parse(sessionStorage.getItem(key) ?? '{}'); } catch { return {}; }
  });
  const [search, setSearch] = useState(filters.q ?? '');
  const [result, setResult] = useState<{ total: number; items: GroupSummary[] } | null>(null);
  const [error, setError] = useState('');
  const request = useRef(0);
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(filters)); } catch { /* なくても動く */ } }, [filters, key]);
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((f) => ((f.q ?? '') === search.trim() ? f : { ...f, q: search.trim() || undefined, offset: 0 })), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const load = useCallback(() => {
    const id = ++request.current;
    setError('');
    client.questionGroups({ module, ...filters, limit: PAGE_SIZE })
      .then((data) => { if (id === request.current) setResult(data); })
      .catch((e: unknown) => { if (id === request.current) setError(e instanceof Error ? e.message : String(e)); });
  }, [client, module, filters]);
  useEffect(load, [load]);
  const set = (patch: Partial<typeof filters>) => setFilters((f) => ({ ...f, ...patch, offset: 0 }));
  const offset = filters.offset ?? 0;
  const label = (typeId: string) => types.find((type) => type.typeId === typeId)?.labelJa ?? typeId;
  return (
    <>
      <div className="library-filters">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.search} aria-label={t.search} />
        <select value={filters.typeId ?? ''} onChange={(e) => set({ typeId: e.target.value || undefined })} aria-label={t.type}>
          <option value="">{t.allTypes}</option>
          {types.map((type) => <option key={type.typeId} value={type.typeId}>{type.labelJa}</option>)}
        </select>
        <select value={filters.status ?? ''} onChange={(e) => set({ status: (e.target.value || undefined) as GroupStatus | undefined })} aria-label={t.allStatuses}>
          <option value="">{t.allStatuses}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t.status[s]}</option>)}
        </select>
        <select value={filters.level ?? ''} onChange={(e) => set({ level: (e.target.value || undefined) as JlptLevel | undefined })} aria-label={t.level}>
          <option value="">{t.allLevels}</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      {error ? <p className="library-error">{t.loadError}：{error}</p> : null}
      {result ? <p className="bank-count">{t.total(result.total)}</p> : <p className="library-empty">{t.loading}</p>}
      {result && !result.items.length ? <p className="library-empty">{t.empty}</p> : null}
      <ol className="library-list">
        {result?.items.map((g) => (
          <li key={g.code}>
            <button type="button" className="bank-row" onClick={() => onOpen(g.code)}>
              <span className="library-code">{g.code}</span>
              <span className="bank-row-main">
                <span className="bank-row-type">{label(g.typeId)}{g.materials.length ? ` · ${g.materials.map((m) => t.role[m.role] ?? m.role).join('・')}` : ''}{g.questions.length > 1 ? ` · ${g.questions.length}` : ''}</span>
                <span lang="ja" className="bank-row-prompt">{g.questions[0]?.prompt ?? ''}</span>
              </span>
              <span className="library-meta">
                {g.level ? <em>{g.level}</em> : null}
                <em data-status={g.status}>{t.status[g.status]}</em>
              </span>
            </button>
          </li>
        ))}
      </ol>
      {result && result.total > PAGE_SIZE ? (
        <nav className="library-pager">
          <button type="button" disabled={offset === 0} onClick={() => setFilters((f) => ({ ...f, offset: Math.max(0, offset - PAGE_SIZE) }))}>{t.previous}</button>
          <span>{Math.floor(offset / PAGE_SIZE) + 1} / {Math.ceil(result.total / PAGE_SIZE)}</span>
          <button type="button" disabled={offset + PAGE_SIZE >= result.total} onClick={() => setFilters((f) => ({ ...f, offset: offset + PAGE_SIZE }))}>{t.next}</button>
        </nav>
      ) : null}
    </>
  );
}

// ---------- 詳細 ----------
/** 問題文や本文の中の標記（下線・空欄・★）を見えるようにする。 */
export function MarkedText({ text, marks }: { text: string; marks: QuestionMark[] }) {
  const sorted = [...marks].sort((a, b) => a.start - b.start);
  const parts: ReactNode[] = [];
  let at = 0;
  sorted.forEach((m, i) => {
    if (m.start < at || m.end > text.length) return;
    if (m.start > at) parts.push(text.slice(at, m.start));
    const inner = text.slice(m.start, m.end);
    parts.push(<mark key={i} className={`bank-mark bank-mark-${m.kind}`} title={m.kind}>{inner || '　'}</mark>);
    at = m.end;
  });
  parts.push(text.slice(at));
  return <span lang="ja" className="bank-marked">{parts}</span>;
}

/** 認証つきのファイル（音声・画像）を表示する。 */
export function MediaView({ client, id, kind, alt }: { client: V3Client; id: number; kind: 'audio' | 'image'; alt?: string }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let disposed = false;
    let objectUrl = '';
    setUrl(''); setFailed(false);
    client.media(id).then((blob) => { if (disposed) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [client, id]);
  if (failed) return <span className="library-muted">✕ {id}</span>;
  if (!url) return <span className="library-muted">…</span>;
  return kind === 'audio' ? <audio controls src={url} className="bank-audio" /> : <img src={url} alt={alt ?? ''} className="bank-image" />;
}

function MaterialView({ client, material, marks, locale }: { client: V3Client; material: GroupMaterial; marks: QuestionMark[]; locale: Locale }) {
  const t = bankText(locale);
  return (
    <section className="library-section">
      <h2>{t.role[material.role] ?? material.role}{material.material ? ` · ${material.material}` : ''}{textOf(material.title) ? ` · ${textOf(material.title)}` : ''}</h2>
      {material.mediaId && material.kind ? <MediaView client={client} id={material.mediaId} kind={material.kind === 'audio' ? 'audio' : 'image'} /> : null}
      {material.body ? <p className="library-pre bank-passage"><MarkedText text={material.body} marks={marks.filter((m) => m.material === material.role)} /></p> : null}
      {material.transcript ? <details className="bank-details"><summary>{t.transcript}</summary><p lang="ja" className="library-pre">{material.transcript}</p>
        {textOf(material.transcriptTranslation) ? <p className="library-pre library-muted">{textOf(material.transcriptTranslation)}</p> : null}</details> : null}
      {textOf(material.bodyTranslation) ? <details className="bank-details"><summary>{t.translation}</summary><p className="library-pre library-muted">{textOf(material.bodyTranslation)}</p></details> : null}
      {material.sentences?.some((s) => s.isKey) ? (
        <ul className="bank-key-sentences">{material.sentences.filter((s) => s.isKey).map((s, i) => <li key={i}><span lang="ja">{s.sentence}</span>{textOf(s.translation) ? <span className="library-muted"> — {textOf(s.translation)}</span> : null}</li>)}</ul>
      ) : null}
    </section>
  );
}

function GroupDetail({ client, locale, code, types, onNavigate }: { client: V3Client; locale: Locale; code: string; types: QuestionType[]; onNavigate: (itemId: string | null) => void }) {
  const t = bankText(locale);
  const [group, setGroup] = useState<QuestionGroup | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setError('');
    client.questionGroup(code).then(setGroup).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [client, code]);
  useEffect(load, [load]);
  const act = async (action: () => Promise<unknown>, after?: () => void) => {
    setBusy(true); setError('');
    try { await action(); after ? after() : load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const nav = <nav className="library-detail-nav"><button type="button" onClick={() => onNavigate(null)}>{t.back}</button></nav>;
  if (!group) return <section className="library">{nav}<p className={error ? 'library-error' : 'library-empty'}>{error ? `${t.loadError}：${error}` : t.loading}</p></section>;
  const type = types.find((x) => x.typeId === group.typeId);
  const allMarks = group.questions.flatMap((q) => q.marks);
  return (
    <article className="library library-detail">
      {nav}
      <header className="library-detail-head">
        <span className="library-code">{group.code} · {type?.labelJa ?? group.typeId}{group.level ? ` · ${group.level}` : ''}</span>
        <p className="bank-status-line"><em className="bank-status" data-status={group.status}>{t.status[group.status]}</em>{group.official ? ' · JLPT' : ''}</p>
        {group.instruction ? <p lang="ja">{group.instruction}</p> : null}
        {group.context ? <p lang="ja" className="library-muted">{group.context}</p> : null}
        <div className="library-row-actions">
          <button type="button" onClick={() => onNavigate(`${group.code}~edit`)}>{t.edit}</button>
          {group.status === 'retired'
            ? <button type="button" disabled={busy} onClick={() => act(() => client.setGroupStatus(group.code, 'needs_review'))}>{t.restore}</button>
            : <button type="button" disabled={busy} onClick={() => act(() => client.setGroupStatus(group.code, 'retired'))}>{t.retire}</button>}
          <button type="button" disabled={busy} onClick={() => { if (window.confirm(t.confirmRemove(group.code))) void act(() => client.deleteGroup(group.code), () => onNavigate(null)); }}>{t.remove}</button>
        </div>
        {error ? <p className="library-error">{error}</p> : null}
      </header>

      {group.materials.map((m) => <MaterialView key={m.role} client={client} material={m} marks={allMarks} locale={locale} />)}

      {group.questions.map((q, qi) => (
        <section key={q.code ?? qi} className="library-section bank-question">
          <h2>{group.questions.length > 1 ? `${t.question(qi + 1)} · ` : ''}{q.code}</h2>
          {q.promptMediaId && !group.materials.some((m) => m.mediaId === q.promptMediaId) ? <MediaView client={client} id={q.promptMediaId} kind="audio" /> : null}
          {q.prompt ? <p className="bank-prompt"><MarkedText text={q.prompt} marks={q.marks.filter((m) => !m.material)} /></p> : null}
          {textOf(q.translation) ? <p className="library-muted">{textOf(q.translation)}</p> : null}
          {q.expectedText ? <p><span className="library-label">{t.expectedText}</span><span lang="ja">{q.expectedText}</span></p> : null}
          {q.options.length ? (
            <ol className="bank-options">
              {q.options.map((o, oi) => (
                <li key={o.id ?? oi} data-correct={o.correct ? 'true' : 'false'}>
                  <span className="bank-option-number">{oi + 1}</span>
                  <span className="bank-option-body">
                    <span lang="ja">{o.text || (o.mediaId ? '' : '—')}</span>
                    {o.mediaId ? <MediaView client={client} id={o.mediaId} kind={type?.optionMedia === 'audio' ? 'audio' : 'image'} /> : null}
                    {o.correct ? <em className="bank-correct">{t.correct}</em> : null}
                    {o.distractorType ? <small className="library-muted"> · {o.distractorType}</small> : null}
                    {textOf(o.translation) ? <span className="library-muted bank-option-note">{textOf(o.translation)}</span> : null}
                    {textOf(o.analysis) ? <span className="bank-option-note library-pre">{textOf(o.analysis)}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
          {q.explanation.length ? (
            <dl className="library-notes bank-explanation">
              {q.explanation.map((s, si) => <div key={si}><dt>{textOf(s.title) || t.section[s.kind]}</dt><dd className="library-pre">{textOf(s.body)}</dd></div>)}
            </dl>
          ) : null}
          {q.evidence.length ? (
            <div><h3 className="bank-subhead">{t.evidence}</h3><ul className="library-bullets">{q.evidence.map((e, ei) => <li key={ei} lang="ja">「{e.quote}」{e.option != null ? <small className="library-muted"> → {e.option + 1}</small> : null}</li>)}</ul></div>
          ) : null}
          {q.knowledge.length || q.tags.length ? (
            <p className="library-muted">{q.knowledge.map((k) => `${k.code} ${k.expression ?? ''}`).join('、')}{q.tags.length ? ` · ${q.tags.join('、')}` : ''}</p>
          ) : null}
        </section>
      ))}

      <section className="library-section">
        <h2>{t.review}</h2>
        {group.review.latest ? (
          <p>{t.latestReview}：{t.reviewer[group.review.latest.reviewer] ?? group.review.latest.reviewer}{group.review.latest.agentLabel ? `（${group.review.latest.agentLabel}）` : ''} · {t.verdict[group.review.latest.verdict]}
            {textOf(group.review.latest.summary) ? ` — ${textOf(group.review.latest.summary)}` : ''}</p>
        ) : <p className="library-muted">{t.noReview}</p>}
        {group.review.openFindings.length ? (
          <>
            <h3 className="bank-subhead">{t.openFindings}</h3>
            <ul className="bank-findings">{group.review.openFindings.map((f) => <li key={f.id} data-severity={f.severity}><strong>{f.check}</strong>{f.question ? ` · ${f.question}` : ''} — {textOf(f.message)}</li>)}</ul>
          </>
        ) : null}
      </section>
    </article>
  );
}
