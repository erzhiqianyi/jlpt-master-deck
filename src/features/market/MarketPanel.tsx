import { usePageHeaderActions } from '../../components/PageChrome';
import './market.css';
import { useAuthoringNavigation } from '../../components/AuthoringNavigation';
import { loadDiscoveryShares } from '../../lib/discovery';
import { discoveryCategories, discoveryPresentation } from '../../domain/discoveryPresentation.mjs';
import { Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, FileText, FolderHeart, Pencil, Plus, Search, Undo2, UserRound } from 'lucide-react';
import { PracticePanel, PracticeReviewPanel } from "../practice/StudyPanels";
import type { Question, AnswerState, DisplaySettings, Locale } from "../../types";
import { LearningListFrame, LearningListHeader, LearningListPagination, LearningListSearch } from "../../components/LearningList";
import { useMobileList } from "../../hooks/useMobileList";
import { BatchActionBar, BatchManageButton, useListBatch, type BatchAction } from "../../components/ListBatch";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useConfirmation } from "../../components/confirmation";
import { apiRequest } from "../../lib/api";

type SharedContent = {
  coverUrl?: string;
  format: "jlpt-share";
  version: 1;
  kind: "practice" | "wordbook" | "listening";
  title: string;
  description: string;
  questions?: {
    prompt?: string;
    choices: string[];
    answer?: string;
    title?: string;
    questionTypeId?: string;
    question?: string;
    choiceDetails?: { translation: string; explanation: string }[];
    explanation?: string;
    answerIndex?: number;
    correctReason?: string;
    kind?: Question["kind"];
    instruction?: string;
    promptTarget?: string;
    translationZh?: string;
    context?: string;
    memoryPoint?: string;
    choiceAnalysis?: Question["choiceAnalysis"];
  }[];
  items?: { original: string; reading?: string; meaning_zh?: string }[];
  audioFileName?: string;
  transcript?: string;
  transcriptTranslation?: string;
};
type Share = {
  id: string;
  title: string;
  kind: SharedContent["kind"];
  description: string;
  count: number;
  mine: boolean;
  categories?: string[]; coverUrl?: string; cover?: string; level?: string; coverTitle?: string;
};
export function MarketPanel({
  token, initialShareId,
  labels, settings, locale, onAdded,
}: {
  token: string;
  onAdded: () => Promise<void>;
  initialShareId?: string;
  labels: Record<string, string>;
  settings: DisplaySettings;
  locale: Locale;
}) {
  const mineView = initialShareId === 'mine';
  const requestedShareId = mineView ? undefined : initialShareId;
  const [kind, setKind] = useState<"all" | "vocabulary" | "grammar" | "reading" | "listening">("all");
  const [contentTab, setContentTab] = useState('all');
  const [articles, setArticles] = useState<{id: string; title: string; kind: string; cover: string; coverTitle: string; href: string}[]>([]);
  useEffect(() => { let active = true; fetch('/community/catalog.json').then(r => { if (!r.ok) throw new Error('catalog'); return r.json(); }).then(data => { if (active) setArticles(data[locale] ?? []); }).catch(() => {}); return () => { active = false; }; }, [locale]);
  const editorial = locale === 'ja' ? 'AIアシスタント' : locale === 'en' ? 'AI Assistant' : 'AI助手';
  const practiceLabel = locale === 'ja' ? '練習' : locale === 'en' ? 'Practice' : '练习';
  const [shares, setShares] = useState<Share[]>([]);
  const [preview, setPreview] = useState<SharedContent | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [practiceActive, setPracticeActive] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  useAuthoringNavigation(practiceActive ? (locale === 'ja' ? '試用' : locale === 'en' ? 'Trial practice' : '分享试做') : mineView ? (preview ? preview.title : locale === 'ja' ? '自分の共有' : locale === 'en' ? 'My shares' : '我的分享') : null, () => { if (editing) setEditing(false); else if (practiceActive) setPracticeActive(false); else if (preview) clearPreview(); else window.location.hash = '#/market'; }, { kind: 'practice' });
  const [loadRevision, setLoadRevision] = useState(0);
  const [importedIds, setImportedIds] = useState<Set<string>>(() => new Set());
  const [importingIds, setImportingIds] = useState<Set<string>>(() => new Set());
  type ImportResult = { alreadyImported?: boolean };
  const importsRef = useRef({ token, pending: new Map<string, Promise<ImportResult>>(), added: new Set<string>() });
  const confirm = useConfirmation();
  const copy = marketCopy(locale);
  const editLabel = locale === 'ja' ? '共有を編集' : locale === 'en' ? 'Edit share' : '编辑分享';
  const [editing, setEditing] = useState(false);
  const hasMineHeader = usePageHeaderActions(!preview && !mineView ? [{ key: 'my-shares', label: copy.myShares, icon: <FolderHeart size={22} />, onClick: () => { window.location.hash = '#/market/mine'; } }] : [], 0);

  const request = <T,>(path: string, method = "GET", body?: unknown) =>
    apiRequest<T>(path, { token, method, body });
  async function refresh() {
    setShares(await loadDiscoveryShares(token, mineView));
  }
  async function getContent(id: string): Promise<SharedContent> {
    return (await request<{ package: SharedContent }>(`/api/market/${encodeURIComponent(id)}`)).package;
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error && e.message === copy.addedRefreshFailed ? e.message : copy.failed);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    importsRef.current = { token, pending: new Map(), added: new Set() };
    setImportedIds(new Set());
    setImportingIds(new Set());
  }, [token]);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    setNotice("");
    setPreview(null);
    setPreviewId(null);
    setPracticeActive(false);
    setEditing(false);
    setContentTab('all');
    setDescriptionExpanded(false);
    // A new route owns its own result. A slow previous share must not replace it.
    void Promise.all([loadDiscoveryShares(token, mineView), requestedShareId ? getContent(requestedShareId) : Promise.resolve(null)])
      .then(([nextShares, content]) => {
        if (!active) return;
        setShares(nextShares);
        setPreview(content);
        setPreviewId(requestedShareId ?? null);
      })
      .catch(() => { if (active) setError(copy.failed); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [token, requestedShareId, mineView, loadRevision]);
  async function openShare(id: string) {
    if (!mineView) { window.location.hash = `#/market/${encodeURIComponent(id)}`; return; }
    await run(async () => { const content = await getContent(id); setPreview(content); setPreviewId(id); });
  }
  function clearPreview() {
    setEditing(false);
    setPreview(null);
    setPreviewId(null);
    setPracticeActive(false);
    if (!mineView && window.location.hash.startsWith('#/market/')) window.location.hash = '#/market';
  }
  function importShare(id: string): Promise<ImportResult> {
    const ledger = importsRef.current;
    if (ledger.added.has(id)) return Promise.resolve({ alreadyImported: true });
    const pending = ledger.pending.get(id);
    if (pending) return pending;
    const operation = request<ImportResult>("/api/market/import", "POST", { shareId: id })
      .then((result) => {
        ledger.added.add(id);
        if (importsRef.current === ledger) setImportedIds(new Set(ledger.added));
        return result;
      })
      .finally(() => {
        ledger.pending.delete(id);
        if (importsRef.current === ledger) setImportingIds(new Set(ledger.pending.keys()));
      });
    ledger.pending.set(id, operation);
    setImportingIds(new Set(ledger.pending.keys()));
    return operation;
  }
  async function addShare(id: string, shareKind: SharedContent['kind']) {
    // The ref blocks repeated events before React has rendered the busy state.
    const ledger = importsRef.current;
    if (ledger.pending.has(id) || ledger.added.has(id)) return;
    setError("");
    setNotice("");
    try {
      const result = await importShare(id);
      if (importsRef.current !== ledger) return;
      setNotice(result.alreadyImported ? copy.alreadyAdded : `${copy.addedTo}${shareKind === 'wordbook' ? copy.wordbooks : shareKind === 'listening' ? copy.listeningBank : copy.topicPractice}`);
      try { await onAdded(); }
      catch { if (importsRef.current === ledger) setError(copy.addedRefreshFailed); }
    } catch { if (importsRef.current === ledger) setError(copy.failed); }
  }
  async function withdrawShare(id: string) {
    if (!(await confirm({ title: copy.withdraw, description: copy.withdrawConfirm(1), confirmLabel: copy.withdraw, cancelLabel: labels.cancel || (locale === 'ja' ? 'キャンセル' : locale === 'en' ? 'Cancel' : '取消'), danger: true }))) return;
    await run(async () => {
      await request(`/api/market/${encodeURIComponent(id)}`, "DELETE");
      await refresh();
      if (previewId === id) clearPreview();
      setNotice(copy.withdrawn);
    });
  }
  const filteredArticles = articles.filter(article => article.title.toLowerCase().includes(query.trim().toLowerCase()));
  const filtered = shares.filter((s) => (contentTab !== "practice" || kind === "all" || discoveryCategories(s).includes(kind)) && (!mineView || s.mine) &&
    `${s.title} ${s.coverTitle ?? ""} ${s.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const mobileList = useMobileList(filtered.length, `${contentTab}:${mineView}:${kind}:${query}`, 8);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 8));
  const currentPage = Math.min(page, pageCount - 1);
  const batch = useListBatch(filtered.map((s) => s.id));
  const mineIds = new Set(shares.filter((s) => s.mine).map((s) => s.id));
  const batchActions: BatchAction[] = [
    { key: "import", icon: <Plus size={16} aria-hidden="true" />, label: copy.addToMine, appliesTo: (id) => !mineIds.has(id) && !importedIds.has(id) && !importingIds.has(id),
      run: importShare, after: onAdded },
    { key: "withdraw", danger: true, icon: <Undo2 size={16} aria-hidden="true" />, label: copy.withdraw, appliesTo: (id) => mineIds.has(id),
      confirm: (count) => copy.withdrawConfirm(count),
      run: (id) => request(`/api/market/${encodeURIComponent(id)}`, "DELETE"), after: refresh },
  ];
  const visibleShares = mobileList.mobile ? filtered.slice(0, mobileList.visible) : filtered.slice(currentPage * 8, currentPage * 8 + 8);
  return (
    <section className="discovery-panel">
      {!hasMineHeader && !preview && !mineView && <button className="discovery-my-shares" aria-label={copy.myShares} onClick={() => { window.location.hash = '#/market/mine'; }}><FolderHeart size={22} /></button>}
      {error && <p role="alert" className="market-error">{error}</p>}
      {!preview && error && <button type="button" className="cute-button min-h-11 px-4 py-2" onClick={() => setLoadRevision((value) => value + 1)}>{copy.retry}</button>}
      {requestedShareId && !preview && <section className="market-preview" aria-label={copy.preview}>{busy && <p role="status">{copy.loading}</p>}</section>}
      {notice && <p role="status">{notice}</p>}
      {!preview && !requestedShareId && <LearningListFrame className="discovery-catalog" label={copy.shareList} locale={locale}>
        <LearningListHeader showDensity={false} controlIcon={<Search size={22} />} expandedOnWide={false} appliedSummary={query.trim() ? `${copy.search}: ${query.trim()}` : ''} onReset={() => { setQuery(''); setKind('all'); setContentTab('all'); setPage(0); }} title={mineView ? copy.myShares : copy.discover} count={`${(contentTab === "article" ? 0 : filtered.length) + (contentTab === "practice" || mineView ? 0 : filteredArticles.length)} ${copy.items}`} search={<LearningListSearch value={query} onChange={value => { setQuery(value); setPage(0); }} label={copy.search} placeholder={copy.search} locale={locale} />}>
          {mineView && <BatchManageButton batch={batch} locale={locale} />}
        </LearningListHeader>
        {!mineView && <div className="discovery-categories discovery-content-tabs" role="group" aria-label={copy.categories}>
          {([['all', copy.all], ['practice', practiceLabel], ['article', editorial]]).map(([value, label]) => <button key={value} type="button" aria-pressed={contentTab === value} onClick={() => { batch.exit(); setContentTab(value); setPage(0); }}>{label}</button>)}
        </div>}
        {!mineView && contentTab === 'practice' && <div className="discovery-categories discovery-subjects" role="group" aria-label={copy.categories}>
          {([['all', copy.all], ['vocabulary', copy.words], ['grammar', copy.grammar], ['reading', locale === 'ja' ? '読解' : locale === 'en' ? 'Reading' : '阅读'], ['listening', copy.listening]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => { setKind(value); setPage(0); }}>{label}</button>)}
        </div>}

        <BatchActionBar batch={batch} actions={batchActions} locale={locale} />
        {busy ? <p role="status" className="list-empty">{copy.loading}</p> : <div className="discovery-cover-grid">
          {contentTab !== 'article' && visibleShares.map((share, index) => <article key={share.id} className="discovery-cover-card" style={{ order: index * 2 }}>
            {batch.active ? <label className="discovery-select"><input type="checkbox" checked={batch.selected.has(share.id)} onChange={() => batch.toggle(share.id)} aria-label={`${copy.select}: ${share.title}`} /></label> : null}
            <button type="button" className="discovery-open-card" onClick={() => batch.active ? batch.toggle(share.id) : void openShare(share.id)}>
              <DiscoveryCover content={share} /><span className="discovery-kind-badge">{practiceLabel}</span>
              <strong className="discovery-card-title">{share.title}</strong>
              <span className="discovery-card-meta"><span><FileText size={18} aria-hidden="true" />{share.count} {share.kind === 'wordbook' ? copy.wordUnit : copy.questionUnit}</span></span>
            </button>
          </article>)}
          {contentTab !== 'practice' && !mineView && filteredArticles.map((article, index) => <article key={article.id} className="discovery-cover-card" style={{ order: index * 2 + 1 }}><a className="discovery-open-card" href={article.href}><DiscoveryCover content={article} /><span className="discovery-kind-badge is-article">{editorial}</span><strong className="discovery-card-title">{article.title}</strong><span className="discovery-card-meta"><span><FileText size={18} />{locale === 'en' ? 'AI community' : locale === 'ja' ? 'AI コミュニティ' : 'AI社区'}</span></span></a></article>)}
          {!(contentTab === 'article' ? 0 : filtered.length) && !(contentTab === 'practice' || mineView ? 0 : filteredArticles.length) ? <p className="list-empty" role="status">{copy.noResults}</p> : null}
        </div>}
        {contentTab !== 'article' && mobileList.mobile && filtered.length ? <div ref={mobileList.setSentinel} className="catalog-notice" role="status">{mobileList.visible >= filtered.length ? copy.endOfList : null}</div> : null}
        {contentTab !== 'article' && !mobileList.mobile && pageCount > 1 ? <LearningListPagination page={currentPage} pages={pageCount} onChange={setPage} summary={`${currentPage * 8 + 1}-${Math.min(currentPage * 8 + 8, filtered.length)} / ${filtered.length}`} previous={copy.previous} next={copy.next} /> : null}
      </LearningListFrame>}
      {editing && preview && previewId && mineIds.has(previewId) && <ShareEditForm key={previewId} content={preview} locale={locale} busy={busy} onCancel={() => setEditing(false)} onSave={async input => {
        await run(async () => {
          const result = await request<{package: SharedContent}>(`/api/market/${encodeURIComponent(previewId)}`, 'PATCH', input);
          setPreview(result.package); setEditing(false); setNotice(locale === 'ja' ? '保存しました' : locale === 'en' ? 'Share saved' : '分享已保存');
          try { await refresh(); } catch { setError(locale === 'ja' ? '保存済みですが、一覧を更新できませんでした。' : locale === 'en' ? 'Share saved, but the list could not refresh.' : '分享已保存，但列表刷新失败，请重新加载。'); }
        });
      }} />}
      {preview && previewId && !editing && (
        <section className="market-preview" aria-label={copy.preview}>
          {!practiceActive && <>
            <SharePreviewCarousel key={previewId} content={preview} copy={copy} presentation={shares.find(share => share.id === previewId)} />
            <div className="market-detail-heading">
              <h2>{preview.title}</h2><span className="market-detail-count">{preview.kind === 'wordbook' ? `${preview.items?.length ?? 0} ${copy.wordUnit}` : `${preview.questions?.length ?? 0} ${copy.questionUnit}`}</span>
              {mineIds.has(previewId) ? <ShareManagement copy={copy} busy={busy} onCover={async file => {
                setBusy(true); setError('');
                try {
                  if (file.size > 5 * 1024 * 1024) throw new Error(locale === 'zh-CN' ? '图片不能超过 5 MB' : 'Image exceeds 5 MB');
                  const imageBase64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
                  const result = await apiRequest<{ coverUrl: string }>(`/api/market/${previewId}/cover`, { method: 'PUT', token, body: { imageBase64, mime: file.type } });
                  setPreview(current => current ? { ...current, ...result } : current);
                  setShares(current => current.map(share => share.id === previewId ? { ...share, ...result } : share));
                } catch (cause) { setError(cause instanceof Error ? cause.message : copy.failed); }
                finally { setBusy(false); }
              }} coverLabel={locale === 'ja' ? '表紙をアップロード' : locale === 'en' ? 'Upload cover' : '上传封面'} onEdit={() => setEditing(true)} editLabel={editLabel} onWithdraw={() => void withdrawShare(previewId)} /> : <ShareBookmark copy={copy} busy={busy || importingIds.has(previewId)} added={importedIds.has(previewId)} onAdd={() => void addShare(previewId, preview.kind)} />}
            </div>
            <p className="market-detail-author"><UserRound size={24} aria-hidden="true" />{mineIds.has(previewId) ? copy.ownShareShort : copy.communityAuthor}</p>
            {preview.description ? <div className="market-introduction">
              <p className={descriptionExpanded ? '' : 'is-collapsed'} id="market-introduction">{preview.description}</p>
              <button type="button" aria-expanded={descriptionExpanded} aria-controls="market-introduction" onClick={() => setDescriptionExpanded(expanded => !expanded)}>{descriptionExpanded ? copy.collapseIntro : copy.expandIntro}<ChevronDown size={16} aria-hidden="true" /></button>
            </div> : null}
            {preview.kind === 'practice' && !preview.questions?.length ? <p role="status">{copy.emptyPractice}</p> : null}
            {preview.kind === 'listening' ? <SharedListening content={preview} shareId={previewId} token={token} locale={locale} /> : null}
            <div className="market-preview-actions">
              {preview.kind === 'practice' ? <button type="button" className="cute-button-primary" disabled={!preview.questions?.length} onClick={() => setPracticeActive(true)}>{copy.startPreview}</button> : !mineIds.has(previewId) ? <button type="button" className="cute-button-primary" disabled={busy || importingIds.has(previewId) || importedIds.has(previewId)} onClick={() => void addShare(previewId, preview.kind)}>{importingIds.has(previewId) ? copy.adding : importedIds.has(previewId) ? copy.added : copy.addToMine}</button> : null}
              {(preview.kind === 'practice' || !mineIds.has(previewId)) && <p>{preview.kind === 'practice' ? copy.previewNotice : copy.importNotice}</p>}
            </div>
            <p className="market-source-notice">{copy.sourceNotice}</p>
          </>}
          {preview.kind === 'practice' && practiceActive && <SharedPractice key={previewId} content={preview} labels={labels} settings={settings} locale={locale} onBack={() => setPracticeActive(false)} importAction={!mineIds.has(previewId) ? <button type="button" className="cute-button min-h-11 px-4 py-2" disabled={importingIds.has(previewId) || importedIds.has(previewId)} onClick={() => void addShare(previewId, preview.kind)}>{importingIds.has(previewId) ? copy.adding : importedIds.has(previewId) ? copy.added : copy.addToMine}</button> : null} />}
        </section>
      )}
    </section>
  );
}

function ShareManagement({ copy, busy, onWithdraw, onCover, coverLabel, onEdit, editLabel }: { onEdit: () => void; editLabel: string; onCover: (file: File) => Promise<void>; coverLabel: string; copy: ReturnType<typeof marketCopy>; busy: boolean; onWithdraw: () => void }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const hasHeaderActions = usePageHeaderActions([{ key: 'share-manage', label: copy.manage, onClick: () => setOpen(true), disabled: busy }], 20);
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); else if (!open && dialog.current?.open) dialog.current?.close(); }, [open]);
  return <>
    {!hasHeaderActions ? <button type="button" className="market-manage-trigger" disabled={busy} onClick={() => setOpen(true)}>{copy.manage}</button> : null}
    <dialog ref={dialog} className="market-management-dialog" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} aria-label={copy.manage}>
      <div><h3>{copy.manage}</h3><button type="button" aria-label={copy.close} onClick={() => setOpen(false)}>×</button></div>
      <button type="button" disabled={busy} onClick={() => { setOpen(false); onEdit(); }}><Pencil size={16} />{editLabel}</button>
      <label>{coverLabel}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) { setOpen(false); void onCover(file); } }} /></label>
      <button type="button" disabled={busy} onClick={() => { setOpen(false); onWithdraw(); }}><Undo2 size={16} aria-hidden="true" />{copy.withdraw}</button>
    </dialog>
  </>;
}

function ShareBookmark({ copy, busy, added, onAdd }: { copy: ReturnType<typeof marketCopy>; busy: boolean; added: boolean; onAdd: () => void }) {
  const label = busy ? copy.adding : added ? copy.added : copy.addToMine;
  const icon = added ? <Check size={22} /> : <Bookmark size={22} />;
  const registered = usePageHeaderActions([{ key: 'share-bookmark', label, icon, onClick: onAdd, disabled: busy || added }], 20);
  return registered ? null : <button type="button" className="market-bookmark" aria-label={label} title={label} disabled={busy || added} onClick={onAdd}>{icon}</button>;
}

export function DiscoveryCover({ content, page }: { content: { title: string; kind: string; categories?: string[]; coverUrl?: string; cover?: string; coverTitle?: string; level?: string }; page?: string }) {
  const fallback = discoveryPresentation(content);
  const cover = ['stairs', 'clock', 'coffee', 'gold'].includes(content.cover ?? '') ? content.cover : fallback.cover;
  return <div className={`discovery-artwork cover-${cover}`}>
    <img src={content.coverUrl || `/images/discovery/${cover}.png`} alt="" loading="lazy" />
    {page ? <span className="discovery-page-counter">{page}</span> : null}
    {!content.coverUrl && <div className="discovery-cover-type"><span lang="ja">{content.coverTitle || fallback.coverTitle}</span>{content.level || fallback.level ? <small>{content.level || fallback.level}</small> : null}</div>}
  </div>;
}

function SharePreviewCarousel({ content, copy, presentation }: { content: SharedContent; copy: ReturnType<typeof marketCopy>; presentation?: Share }) {
  const [index, setIndex] = useState(0);
  const [selections, setSelections] = useState<Record<number, number>>({});
  const rail = useRef<HTMLDivElement>(null);
  const questions = content.questions ?? [];
  const words = content.kind === 'wordbook' ? content.items ?? [] : [];
  const total = 1 + (words.length || questions.length);
  function go(next: number) {
    const clamped = Math.max(0, Math.min(total - 1, next));
    setIndex(clamped);
    const el = rail.current;
    const width = (el?.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0;
    el?.scrollTo({ left: clamped * (width + 16), behavior: 'smooth' });
  }
  return <div className="discovery-preview-gallery">
    <div ref={rail} className="discovery-preview-rail" aria-label={copy.preview} onScroll={event => {
      const el = event.currentTarget;
      const width = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? el.clientWidth;
      setIndex(Math.max(0, Math.min(total - 1, Math.round(el.scrollLeft / (width + 16)))));
    }}>
      <div className="discovery-preview-slide"><DiscoveryCover content={{ ...content, ...presentation, title: content.title }} page={`1 / ${total}`} /></div>
      {questions.map((question, q) => <section key={q} className="discovery-preview-slide market-question-preview" inert={index !== q + 1} aria-label={`${copy.sampleQuestion} ${q + 1}`}>
        <div className="market-question-caption"><strong>{copy.sampleQuestion} · {q + 1}</strong><span>{q + 2} / {total}</span></div>
        {question.instruction ? <p className="market-question-instruction">{question.instruction}</p> : null}
        <p className="market-question-prompt" lang="ja">{question.prompt ?? question.question ?? question.title ?? ''}</p>
        <ol role="radiogroup" aria-label={`${copy.sampleQuestion} ${q + 1}`}>{question.choices.map((choice, c) => <li key={c}><button type="button" role="radio" tabIndex={(selections[q] ?? 0) === c ? 0 : -1} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault();
          const next = (c + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + question.choices.length) % question.choices.length;
          setSelections(current => ({ ...current, [q]: next }));
          (event.currentTarget.closest('ol')?.querySelectorAll('button')[next] as HTMLButtonElement | undefined)?.focus();
        }} aria-checked={selections[q] === c} onClick={() => setSelections(current => ({ ...current, [q]: c }))}><Circle size={18} aria-hidden="true" /><span>{String.fromCharCode(65 + c)}</span><span lang="ja">{choice}</span></button></li>)}</ol>
        <p className="discovery-preview-only">{copy.previewOnly}</p>
      </section>)}
      {words.map((word, w) => <section key={w} className="discovery-preview-slide discovery-word-slide"><span className="discovery-page-counter">{w + 2} / {total}</span><h3 lang="ja">{word.original}</h3><p lang="ja">{word.reading}</p><p>{word.meaning_zh}</p><small>{copy.previewOnly}</small></section>)}
    </div>
    <div className="discovery-gallery-controls"><button type="button" aria-label={copy.previous} disabled={index === 0} onClick={() => go(index - 1)}><ChevronLeft size={18} /></button><span aria-live="polite">{index === 0 ? copy.swipePreview : `${index + 1} / ${total}`}</span><button type="button" aria-label={copy.next} disabled={index === total - 1} onClick={() => go(index + 1)}><ChevronRight size={18} /></button></div>
  </div>;
}

function SharedPractice({ content, labels, settings, locale, onBack, importAction }: {
  content: SharedContent; labels: Record<string, string>; settings: DisplaySettings; locale: Locale; onBack: () => void; importAction: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [review, setReview] = useState(false);
  useAuthoringNavigation(review ? (locale === 'ja' ? '試用の結果' : locale === 'en' ? 'Trial results' : '试做结果') : null, () => setReview(false), { kind: 'practice' });
  const copy = marketCopy(locale);
  const previewLabels = { ...labels, reviewBackToPracticeHome: copy.backToPreview, reviewPage: copy.previewResults };
  const questions: Question[] = (content.questions ?? []).map((q, i) => ({
    ...q, prompt: q.prompt ?? q.question ?? '', answer: q.answer ?? (q.answerIndex !== undefined ? q.choices[q.answerIndex] : '') ?? '', id: `shared-${i}`, itemId: `shared-${i}`, kind: q.kind ?? 'meaning',
    title: content.title, context: q.context ?? '', correctReason: q.correctReason ?? q.explanation ?? '',
    memoryPoint: q.memoryPoint ?? '', choiceAnalysis: q.choiceAnalysis ?? [],
  }));
  const restart = () => { setIndex(0); setAnswers({}); setReview(false); };
  const answeredCount = questions.filter((question) => answers[question.id]).length;
  const complete = questions.length > 0 && answeredCount === questions.length;
  if (review) return <div className="shared-practice-results">
    <p role="status">{copy.previewNotice}</p>
    <PracticeReviewPanel questions={questions} answers={answers} items={[]} labels={previewLabels}
      practiceTitle={content.title} locale={locale} showRuby={settings.showReviewRuby} onRestart={restart} onBackToPractice={() => setReview(false)} />
    <div className="mt-4 flex flex-wrap gap-3">{importAction}</div>
  </div>;
  return <div className="shared-practice-session"><p>{copy.previewNotice}</p><PracticePanel activeQuestion={questions[index]} questions={questions} questionsLength={questions.length}
    activeIndex={index} answeredCount={answeredCount} complete={complete}
    feedbackMode="immediate" answers={answers} items={[]} labels={previewLabels} questionTypeLabel={content.title} settings={settings}
    onAnswer={(q, selected) => setAnswers((previous) => previous[q.id] ? previous : ({ ...previous, [q.id]: { selected, correct: selected === q.answer } }))}
    onPrev={() => setIndex(Math.max(0, index - 1))} onNext={() => setIndex(Math.min(questions.length - 1, index + 1))}
    onJump={(next) => setIndex(Math.max(0, Math.min(questions.length - 1, next)))} onRestart={restart} onPracticeHome={onBack} onPrepareReview={async () => {}} onReview={() => { if (complete) setReview(true); }}
    analysisStatus="completed" /></div>;
}

function SharedListening({ content, shareId, token, locale }: { content: SharedContent; shareId: string; token: string; locale: Locale }) {
  const [audioUrl, setAudioUrl] = useState('');
  const [error, setError] = useState('');
  const copy = marketCopy(locale);
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setAudioUrl(''); setError('');
    void fetch(`/api/market/${encodeURIComponent(shareId)}/audio`, { headers: { authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error(copy.audioUnavailable);
        return response.blob();
      })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); if (active) setAudioUrl(objectUrl); else URL.revokeObjectURL(objectUrl); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : copy.audioFailed); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [shareId, token, locale]);
  return <div className="mt-5 space-y-4">
    <p className="text-sm text-[#31564c]">{content.audioFileName} · {content.questions?.length ?? 0} {copy.questionUnit}</p>
    {audioUrl ? <audio controls src={audioUrl} className="w-full" aria-label={copy.sharedAudio} /> : <p role={error ? 'alert' : 'status'}>{error || copy.audioLoading}</p>}
    <ol className="space-y-3">{content.questions?.map((question, index) => <li key={index} className="rounded-lg border p-3">
      <strong>{index + 1}. {question.title || question.question}</strong>
      {question.title && question.question && question.title !== question.question ? <p>{question.question}</p> : null}
      {question.choices.length ? <ol className="ml-5 list-decimal">{question.choices.map((choice, i) => <li key={i}>{choice}</li>)}</ol> : null}
    </li>)}</ol>
    {content.transcript ? <details><summary>{copy.transcript}</summary><p className="whitespace-pre-wrap">{content.transcript}</p></details> : null}
    {content.transcriptTranslation ? <details><summary>{copy.transcriptTranslation}</summary><p className="whitespace-pre-wrap">{content.transcriptTranslation}</p></details> : null}
  </div>;
}

function marketCopy(locale: Locale) {
  if (locale === 'ja') return {
    grammar: '文法', communityAuthor: '学習者の共有', select: '選択', noResults: '該当する共有がありません', previewOnly: 'プレビューのみ・解答は保存されません', swipePreview: '左にスワイプして問題を見る', close: '閉じる', manage: '管理', ownShareShort: '自分の共有', expandIntro: '概要を展開', collapseIntro: '概要を閉じる', sampleQuestion: '問題プレビュー',
    retry: '再試行', added: '追加済み', backToList: '共有一覧に戻る', backToPreview: '共有の詳細に戻る', startPreview: '練習を始める', previewResults: '試用の結果を見る', emptyPractice: '試せる問題がありません', previewNotice: '試用の解答はこの画面だけに保持されます。学習履歴や進捗には保存されません。', sourceNotice: 'ユーザーが共有した教材です。正確性と利用権限を確認してください。', ownShare: 'あなたが共有した教材です。', importNotice: '追加すると自分のライブラリにコピーされます。あなたの学習記録を公開する操作ではありません。',
    failed: '操作に失敗しました。もう一度お試しください', alreadyAdded: 'このコンテンツはすでに追加されています', addedTo: '追加先：', wordbooks: '単語帳', listeningBank: '聴解ライブラリ', topicPractice: '分野別練習', addedRefreshFailed: '追加しましたが、一覧を更新できませんでした。ページを再読み込みしてください',
    addToMine: '自分のコンテンツに追加', withdraw: '共有を取り消す', withdrawConfirm: (count: number) => `${count} 件の共有を取り消します。他のユーザーには表示されなくなります。`, withdrawn: '共有を取り消しました',
    discover: '発見', shareList: '共有コンテンツの一覧', shares: '共有コンテンツ', items: '件', sets: 'セット', clips: '件', books: '冊', search: '共有コンテンツを検索', shareScope: '共有範囲', allShares: 'すべての共有', myShares: '自分の共有', categories: 'コンテンツの種類', all: 'すべて', words: '単語', listening: '聴解',
    content: '共有コンテンツ', description: '概要', type: '種類', practice: '練習', wordUnit: '語', questionUnit: '問', add: '追加', loading: '読み込み中…', endOfList: '最後まで表示しました', previous: '前のページ', next: '次のページ', preview: '共有コンテンツのプレビュー', adding: '追加中…',
    audioUnavailable: '共有された音声を再生できません', audioFailed: '音声を読み込めませんでした', sharedAudio: '共有された聴解音声', audioLoading: '音声を読み込み中…', transcript: '聴解の全文', transcriptTranslation: '全文の翻訳',
  };
  if (locale === 'en') return {
    grammar: 'Grammar', communityAuthor: 'Community share', select: 'Select', noResults: 'No matching shares', previewOnly: 'Preview only · answers are not saved', swipePreview: 'Swipe left to preview', close: 'Close', manage: 'Manage', ownShareShort: 'Shared by you', expandIntro: 'Expand introduction', collapseIntro: 'Collapse introduction', sampleQuestion: 'Question preview',
    retry: 'Retry', added: 'Added', backToList: 'Back to shared content', backToPreview: 'Back to share details', startPreview: 'Start practice', previewResults: 'View trial results', emptyPractice: 'No questions are available to try', previewNotice: 'Trial answers stay on this screen only. They are not saved to study history or progress.', sourceNotice: 'Material shared by a user. Check its accuracy and your rights to use it.', ownShare: 'Material you shared.', importNotice: 'Adding saves a copy to your library. It does not publish your study records.',
    failed: 'Action failed. Please try again', alreadyAdded: 'This content is already in your library', addedTo: 'Added to ', wordbooks: 'wordbooks', listeningBank: 'listening library', topicPractice: 'topic practice', addedRefreshFailed: 'Added, but the list could not refresh. Reload the page to view it',
    addToMine: 'Add to my content', withdraw: 'Withdraw share', withdrawConfirm: (count: number) => `Withdraw ${count} shares? Others will no longer see them.`, withdrawn: 'Share withdrawn',
    discover: 'Discover', shareList: 'Shared content list', shares: 'Shared content', items: 'items', sets: 'sets', clips: 'clips', books: 'books', search: 'Search shared content', shareScope: 'Share scope', allShares: 'All shares', myShares: 'My shares', categories: 'Content types', all: 'All', words: 'Words', listening: 'Listening',
    content: 'Shared content', description: 'Description', type: 'Type', practice: 'Practice', wordUnit: 'words', questionUnit: 'questions', add: 'Add', loading: 'Loading…', endOfList: 'End of list', previous: 'Previous page', next: 'Next page', preview: 'Shared content preview', adding: 'Adding…',
    audioUnavailable: 'Shared audio is unavailable', audioFailed: 'Could not load audio', sharedAudio: 'Shared listening audio', audioLoading: 'Loading audio…', transcript: 'Full transcript', transcriptTranslation: 'Transcript translation',
  };
  return {
    grammar: '语法', communityAuthor: '学习者分享', select: '选择', noResults: '暂无符合条件的分享', previewOnly: '仅预览，不记录答案', swipePreview: '左滑预览题目', close: '关闭', manage: '管理', ownShareShort: '我分享的内容', expandIntro: '展开简介', collapseIntro: '收起简介', sampleQuestion: '题目预览',
    retry: '重试', added: '已加入', backToList: '返回分享列表', backToPreview: '返回分享详情', startPreview: '开始练习', previewResults: '查看试做结果', emptyPractice: '暂无可试做的题目', previewNotice: '试做答案只保留在当前页面，不计入学习历史或进度。', sourceNotice: '内容由用户分享，请核对准确性及使用权限。', ownShare: '这是你分享的内容。', importNotice: '加入会复制到你的内容库，不会公开你的学习记录。',
    failed: '操作失败，请重试', alreadyAdded: '这份内容已在你的内容中', addedTo: '已添加到我的', wordbooks: '单词本', listeningBank: '听力题库', topicPractice: '专项练习', addedRefreshFailed: '内容已添加，但列表刷新失败，请刷新页面查看',
    addToMine: '添加到我的内容', withdraw: '撤回分享', withdrawConfirm: (count: number) => `将撤回你的 ${count} 份分享，其他人将无法再看到。`, withdrawn: '已撤回',
    discover: '发现', shareList: '分享列表', shares: '分享', items: '项', sets: '套', clips: '段', books: '本', search: '搜索分享', shareScope: '分享范围', allShares: '全部分享', myShares: '我的分享', categories: '内容分类', all: '全部', words: '词汇', listening: '听力',
    content: '分享内容', description: '内容简介', type: '类型', practice: '练习', wordUnit: '词', questionUnit: '题', add: '加入', loading: '加载中…', endOfList: '已经到底了', previous: '上一页', next: '下一页', preview: '分享内容预览', adding: '添加中…',
    audioUnavailable: '分享音频暂时无法播放', audioFailed: '音频加载失败', sharedAudio: '分享听力音频', audioLoading: '正在加载音频…', transcript: '听力原文', transcriptTranslation: '原文翻译',
  };
}

function ShareEditForm({ content, locale, busy, onCancel, onSave }: { content: SharedContent; locale: Locale; busy: boolean; onCancel: () => void; onSave: (input: {title: string; description: string; refreshSource: boolean}) => Promise<void> }) {
  const [title, setTitle] = useState(content.title);
  const [description, setDescription] = useState(content.description ?? '');
  const [refreshSource, setRefreshSource] = useState(false);
  const text = locale === 'ja' ? ['共有を編集', 'タイトル', '概要', '元の内容の最新版に更新', '保存', 'キャンセル', '元の単語帳や練習の編集後、共有内容を更新できます。取り込み済みのコピーは変更されません。'] : locale === 'en' ? ['Edit share', 'Title', 'Description', 'Update from the latest source', 'Save', 'Cancel', 'After editing the original wordbook or practice, update this share. Existing imported copies stay independent.'] : ['编辑分享', '标题', '简介', '更新为原内容最新版', '保存', '取消', '修改原单词本或练习后，可在这里更新分享内容。别人已导入的副本不会改变。'];
  useAuthoringNavigation(text[0], () => { if (!busy) onCancel(); }, { kind: 'form', priority: 10 });
  return <form className="share-edit-form" onSubmit={event => { event.preventDefault(); if (!busy && title.trim()) void onSave({ title, description, refreshSource }); }}>
    <h2>{text[0]}</h2><label>{text[1]}<input value={title} maxLength={120} required disabled={busy} onChange={event => setTitle(event.target.value)} /></label>
    <label>{text[2]}<textarea value={description} maxLength={3000} rows={5} disabled={busy} onChange={event => setDescription(event.target.value)} /></label>
    {content.kind !== 'listening' && <><label className="share-refresh-source"><input type="checkbox" checked={refreshSource} disabled={busy} onChange={event => setRefreshSource(event.target.checked)} />{text[3]}</label><p>{text[6]}</p></>}
    <div><button type="button" disabled={busy} onClick={onCancel}>{text[5]}</button><button type="submit" disabled={busy || !title.trim()}>{busy ? '…' : text[4]}</button></div>
  </form>;
}
