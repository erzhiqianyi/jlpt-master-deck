// 知識ライブラリ（v3）：単語帳ごとの一覧・検索、知識項目の詳細、単語帳の管理。データは /api/v3 から直接読む。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Locale } from '../../types';
import { createV3Client } from '../../v3/client';
import type { JlptLevel, KnowledgeDetail, KnowledgeList, KnowledgeQuery, PickedText, ReviewState, Wordbook } from '../../v3/types';
import { kindLabel, languageName, levelLabel, libraryText, posLabel, statusLabel } from './libraryText';
import './library.css';
import { SpeechControls } from '../../components/SpeechControls';

export type LibraryFamily = 'vocabulary' | 'grammar';
const FAMILY_KINDS: Record<LibraryFamily, string> = { vocabulary: 'word,name', grammar: 'grammar' };
const PAGE_SIZE = 50;
const LEVELS: JlptLevel[] = ['N1', 'N2', 'N3', 'N4', 'N5'];
const STATUSES: Array<ReviewState | 'due'> = ['due', 'new', 'learning', 'review', 'mastered'];

type Props = {
  token: string;
  locale: Locale;
  family: LibraryFamily;
  page: 'words' | 'wordbooks';
  code?: string;
  showRomaji: boolean;
  onOpen: (code: string | null) => void;
  onManageWordbooks: () => void;
};

export function KnowledgeLibrary({ token, locale, family, page, code, showRomaji, onOpen, onManageWordbooks }: Props) {
  const client = useMemo(() => createV3Client(token), [token]);
  const t = libraryText(locale);
  const [wordbooks, setWordbooks] = useState<Wordbook[]>([]);
  const refreshWordbooks = useCallback(() => client.wordbooks().then(setWordbooks).catch(() => undefined), [client]);
  useEffect(() => { void refreshWordbooks(); }, [refreshWordbooks]);
  // 一覧で見ていた順番（詳細の前後移動に使う）
  const [visibleCodes, setVisibleCodes] = useState<string[]>([]);

  if (page === 'wordbooks') return <WordbookManager client={client} locale={locale} wordbooks={wordbooks} onChanged={refreshWordbooks} onBack={() => onOpen(null)} />;
  if (code) {
    const index = visibleCodes.indexOf(code);
    return (
      <KnowledgeDetailView client={client} locale={locale} code={code} showRomaji={showRomaji} wordbooks={wordbooks}
        onBack={() => onOpen(null)}
        onPrevious={index > 0 ? () => onOpen(visibleCodes[index - 1]) : undefined}
        onNext={index >= 0 && index < visibleCodes.length - 1 ? () => onOpen(visibleCodes[index + 1]) : undefined}
        position={index >= 0 ? `${index + 1} / ${visibleCodes.length}` : undefined} />
    );
  }
  return <KnowledgeListView client={client} locale={locale} family={family} wordbooks={wordbooks} showRomaji={showRomaji} t={t}
    onOpen={onOpen} onManageWordbooks={onManageWordbooks} onVisible={setVisibleCodes} />;
}

// ---------- 一覧 ----------
function KnowledgeListView({ client, locale, family, wordbooks, showRomaji, t, onOpen, onManageWordbooks, onVisible }: {
  client: ReturnType<typeof createV3Client>; locale: Locale; family: LibraryFamily; wordbooks: Wordbook[]; showRomaji: boolean; t: ReturnType<typeof libraryText>;
  onOpen: (code: string) => void; onManageWordbooks: () => void; onVisible: (codes: string[]) => void;
}) {
  const storageKey = `library-filters:${family}`;
  const [filters, setFilters] = useState<KnowledgeQuery>(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey) ?? '{}') as KnowledgeQuery; } catch { return {}; }
  });
  const [search, setSearch] = useState(filters.q ?? '');
  const [result, setResult] = useState<KnowledgeList | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const request = useRef(0);

  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(filters)); } catch { /* 保存できなくても動く */ } }, [filters, storageKey]);
  // 検索語は入力が止まってから反映
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((f) => (f.q ?? '') === search.trim() ? f : { ...f, q: search.trim() || undefined, offset: 0 }), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const load = useCallback(() => {
    const id = ++request.current;
    setLoading(true);
    setError('');
    client.knowledge({ ...filters, kind: filters.kind ?? FAMILY_KINDS[family], limit: PAGE_SIZE })
      .then((data) => { if (id === request.current) { setResult(data); onVisible(data.items.map((i) => i.code)); } })
      .catch((e: unknown) => { if (id === request.current) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (id === request.current) setLoading(false); });
  }, [client, filters, family, onVisible]);
  useEffect(load, [load]);

  const set = (patch: Partial<KnowledgeQuery>) => setFilters((f) => ({ ...f, ...patch, offset: 0 }));
  const offset = filters.offset ?? 0;
  const pages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;
  const currentBook = wordbooks.find((w) => w.code === filters.wordbook);

  return (
    <section className="library">
      <header className="library-header">
        <div>
          <h1>{family === 'grammar' ? t.grammarTitle : t.wordsTitle}</h1>
          <p>{result ? t.total(result.total) : t.loading}{currentBook ? ` · ${currentBook.title}` : ''}</p>
        </div>
        <button type="button" className="library-button" onClick={onManageWordbooks}>{t.manageWordbooks}</button>
      </header>

      <div className="library-books" role="tablist" aria-label={t.wordbooks}>
        <button type="button" role="tab" aria-selected={!filters.wordbook} className="library-book" onClick={() => set({ wordbook: undefined })}>{t.allWordbooks}</button>
        {wordbooks.map((book) => ({ book, count: family === 'grammar' ? book.stats.grammar : book.stats.words + book.stats.names }))
          // この画面の種類が入っていない単語帳は出さない（選択中のものは残す）
          .filter(({ book, count }) => count > 0 || filters.wordbook === book.code)
          .map(({ book, count }) => (
            <button key={book.code} type="button" role="tab" aria-selected={filters.wordbook === book.code} className="library-book" onClick={() => set({ wordbook: book.code })}>
              <span>{book.title}</span>
              <small>{count}</small>
            </button>
          ))}
      </div>

      <div className="library-filters">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.search} aria-label={t.search} />
        {family === 'vocabulary' ? (
          <select value={filters.kind ?? ''} onChange={(e) => set({ kind: e.target.value || undefined })} aria-label={t.allKinds}>
            <option value="">{t.allKinds}</option>
            <option value="word">{kindLabel(locale, 'word')}</option>
            <option value="name">{kindLabel(locale, 'name')}</option>
          </select>
        ) : null}
        <select value={filters.level ?? ''} onChange={(e) => set({ level: (e.target.value || undefined) as JlptLevel | undefined })} aria-label={t.level}>
          <option value="">{t.allLevels}</option>
          {LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
        </select>
        <select value={filters.status ?? ''} onChange={(e) => set({ status: (e.target.value || undefined) as KnowledgeQuery['status'] })} aria-label={t.allStatuses}>
          <option value="">{t.allStatuses}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s === 'due' ? t.due : statusLabel(locale, s)}</option>)}
        </select>
        <select value={filters.sort ?? 'recent'} onChange={(e) => set({ sort: e.target.value as KnowledgeQuery['sort'] })} aria-label="sort">
          <option value="recent">{t.sortRecent}</option>
          <option value="code">{t.sortCode}</option>
          <option value="expression">{t.sortExpression}</option>
          <option value="due">{t.sortDue}</option>
        </select>
      </div>

      {error ? <p className="library-error">{t.loadError}：{error} <button type="button" onClick={load}>{t.retry}</button></p> : null}
      {result && !result.items.length && !loading ? <p className="library-empty">{t.empty}</p> : null}
      <ol className="library-list" aria-busy={loading}>
        {result?.items.map((item) => (
          <li key={item.code}>
            <button type="button" onClick={() => onOpen(item.code)}>
              <span className="library-code">{item.code}</span>
              <span className="library-term">
                <strong lang="ja">{item.expression}</strong>
                {item.reading && item.reading !== item.expression ? <span lang="ja">{item.reading}</span> : null}
                {showRomaji && item.romaji ? <span className="library-romaji">{item.romaji}</span> : null}
              </span>
              <span className="library-meaning">{item.meaning?.text ?? ''}</span>
              <span className="library-meta">
                {item.kind === 'name' ? <em>{kindLabel(locale, 'name')}</em> : null}
                {item.jlptLevel ? <em>{levelLabel(item.jlptLevel)}</em> : null}
                <em data-status={item.review.status}>{statusLabel(locale, item.review.status)}</em>
              </span>
            </button>
          </li>
        ))}
      </ol>
      {pages > 1 ? (
        <nav className="library-pager">
          <button type="button" disabled={offset === 0} onClick={() => setFilters((f) => ({ ...f, offset: Math.max(0, offset - PAGE_SIZE) }))}>{t.previous}</button>
          <span>{t.page(Math.floor(offset / PAGE_SIZE) + 1, pages)}</span>
          <button type="button" disabled={offset + PAGE_SIZE >= (result?.total ?? 0)} onClick={() => setFilters((f) => ({ ...f, offset: offset + PAGE_SIZE }))}>{t.next}</button>
        </nav>
      ) : null}
    </section>
  );
}

// ---------- 詳細 ----------
function Fallback({ text, locale }: { text: PickedText | null; locale: Locale }) {
  if (!text?.isFallback) return null;
  return <span className="library-fallback" title={libraryText(locale).fallback(languageName(text.language))}>{languageName(text.language)}</span>;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="library-section"><h2>{title}</h2>{children}</section>;
}

function KnowledgeDetailView({ client, locale, code, showRomaji, wordbooks, onBack, onPrevious, onNext, position }: {
  client: ReturnType<typeof createV3Client>; locale: Locale; code: string; showRomaji: boolean; wordbooks: Wordbook[];
  onBack: () => void; onPrevious?: () => void; onNext?: () => void; position?: string;
}) {
  const t = libraryText(locale);
  const [item, setItem] = useState<KnowledgeDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setItem(null);
    setError('');
    client.knowledgePoint(code).then((data) => { if (live) setItem(data); }).catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [client, code]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === 'ArrowLeft' && onPrevious) onPrevious();
      if (event.key === 'ArrowRight' && onNext) onNext();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onPrevious, onNext]);

  const nav = (
    <nav className="library-detail-nav">
      <button type="button" onClick={onBack}>{t.back}</button>
      {position ? <span>{position}</span> : null}
      <span className="library-detail-arrows">
        <button type="button" disabled={!onPrevious} onClick={onPrevious} aria-label={t.previous}>←</button>
        <button type="button" disabled={!onNext} onClick={onNext} aria-label={t.next}>→</button>
      </span>
    </nav>
  );
  if (error) return <section className="library">{nav}<p className="library-error">{t.loadError}：{error}</p></section>;
  if (!item) return <section className="library">{nav}<p className="library-empty">{t.loading}</p></section>;

  const book = wordbooks.find((w) => w.code === item.wordbook);
  const facts: Array<[string, string]> = [
    [t.wordbook, book?.title ?? item.wordbook],
    [t.level, levelLabel(item.jlptLevel)],
    [t.pos, [posLabel(locale, item.pos), item.transitivity ? t.transitivity[item.transitivity] : '', item.isSuruNoun ? t.suruNoun : ''].filter(Boolean).join(' · ')],
    ['', item.register ? t.register[item.register] : ''],
  ].filter(([, value]) => value) as Array<[string, string]>;

  return (
    <article className="library library-detail">
      {nav}
      <header className="library-detail-head">
        <span className="library-code">{item.code} · {kindLabel(locale, item.kind)}</span>
        <h1 lang="ja">{item.expression} <SpeechControls text={item.kind === 'word' && item.reading ? item.reading : item.expression} iconOnly /></h1>
        {item.reading && item.reading !== item.expression ? <p className="library-reading" lang="ja">{item.reading}{showRomaji && item.romaji ? <span className="library-romaji">{item.romaji}</span> : null}</p> : null}
        {item.meaning ? <p className="library-detail-meaning">{item.meaning.text} <Fallback text={item.meaning} locale={locale} /></p> : null}
        <dl className="library-facts">{facts.map(([label, value]) => <div key={label + value}>{label ? <dt>{label}</dt> : null}<dd>{value}</dd></div>)}</dl>
      </header>

      {item.meaningJa || item.paraphrase ? (
        <Section title={t.meaningJa}>
          {item.meaningJa ? <p lang="ja">{item.meaningJa}</p> : null}
          {item.paraphrase ? <p lang="ja"><span className="library-label">{t.paraphrase}</span>{item.paraphrase}</p> : null}
        </Section>
      ) : null}
      {item.explanation ? <Section title={t.explanation}><p className="library-pre">{item.explanation.text} <Fallback text={item.explanation} locale={locale} /></p></Section> : null}

      {item.examples.length ? (
        <Section title={t.examples}>
          <ol className="library-examples">
            {item.examples.map((example, index) => (
              <li key={index}>
                <p lang="ja" className="library-sentence">{example.sentence} <SpeechControls text={example.sentence} iconOnly /></p>
                {example.reading ? <p lang="ja" className="library-muted">{example.reading}</p> : null}
                {example.translation ? <p>{example.translation.text} <Fallback text={example.translation} locale={locale} /></p> : null}
                {example.spokenSentence ? <p lang="ja" className="library-muted">{example.spokenSentence}{example.spokenTranslation ? ` — ${example.spokenTranslation.text}` : ''}</p> : null}
                {example.analysis ? <p className="library-muted library-pre">{example.analysis.text}</p> : null}
                {example.formAnalysis ? <p className="library-muted library-pre">{example.formAnalysis.text}</p> : null}
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {item.patterns.length ? (
        <Section title={t.patterns}>
          <ul className="library-patterns">
            {item.patterns.map((p, index) => (
              <li key={index}>
                <strong lang="ja">{p.pattern}</strong>
                {p.connection ? <span>{p.connection.text}</span> : null}
                {p.meaning ? <span>{p.meaning.text}</span> : null}
                {p.example ? <p lang="ja">{p.example}{p.exampleTranslation ? <span className="library-muted"> — {p.exampleTranslation.text}</span> : null}</p> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {item.conjugations.length ? (
        <Section title={t.conjugations}>
          <table className="library-conjugations">
            <tbody>
              {item.conjugations.map((c) => (
                <tr key={c.form}>
                  <th scope="row">{c.label}</th>
                  <td lang="ja"><strong>{c.written}</strong>{c.reading && c.reading !== c.written ? <span className="library-muted"> {c.reading}</span> : null}</td>
                  <td className="library-muted">{c.step?.text ?? ''}{c.exception ? <em className="library-exception">{t.exception}</em> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      {item.memoryPoints.length ? <Section title={t.memoryPoints}><ul className="library-bullets">{item.memoryPoints.map((m, i) => <li key={i}>{m.text}</li>)}</ul></Section> : null}
      {item.notes.length ? (
        <Section title={t.notes}>
          <dl className="library-notes">
            {item.notes.map((note, i) => <div key={i}><dt>{note.title?.text ?? t.noteKind[note.kind]}</dt><dd className="library-pre">{note.body?.text ?? ''}</dd></div>)}
          </dl>
        </Section>
      ) : null}
      {item.comparisons.length ? (
        <Section title={t.comparisons}>
          <dl className="library-notes">
            {item.comparisons.map((c, i) => <div key={i}><dt lang="ja">{c.target} <small>{t.comparisonKind[c.kind]}</small></dt><dd className="library-pre">{c.difference?.text ?? ''}</dd></div>)}
          </dl>
        </Section>
      ) : null}

      {item.memoryImage?.url ? (
        <Section title={t.memoryImage}>
          <figure className="library-image"><img src={item.memoryImage.url} alt={item.memoryImage.caption ?? item.expression} />{item.memoryImage.caption ? <figcaption>{item.memoryImage.caption}</figcaption> : null}</figure>
        </Section>
      ) : null}

      <div className="library-chips-grid">
        {item.alternateForms.length ? <Chips title={t.alternateForms} values={item.alternateForms} /> : null}
        {item.relatedWords.length ? <Chips title={t.relatedWords} values={item.relatedWords} /> : null}
        {item.tags.length ? <Chips title={t.tags} values={item.tags} /> : null}
        {item.questions.length ? <Chips title={t.questions} values={item.questions.map((q) => q.code)} /> : null}
      </div>

      {item.sourceSentence ? <Section title={t.sourceSentence}><p lang="ja">{item.sourceSentence}</p></Section> : null}
      {item.sources.length ? (
        <Section title={t.sources}>
          <ul className="library-bullets">{item.sources.map((s, i) => <li key={i}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}</li>)}</ul>
        </Section>
      ) : null}
      <Section title={t.review}>
        <p className="library-muted">
          {statusLabel(locale, item.review.status)}
          {item.review.reviewCount ? ` · ${t.reviewCount(item.review.reviewCount)}` : ''}
          {item.review.intervalDays ? ` · ${t.interval(item.review.intervalDays)}` : ''}
          {item.review.dueAt ? ` · ${t.dueAt} ${new Date(item.review.dueAt).toLocaleDateString(locale)}` : ''}
        </p>
      </Section>
    </article>
  );
}

function Chips({ title, values }: { title: string; values: string[] }) {
  return <div className="library-chips"><h2>{title}</h2><ul>{values.map((v) => <li key={v} lang="ja">{v}</li>)}</ul></div>;
}

// ---------- 単語帳の管理 ----------
function WordbookManager({ client, locale, wordbooks, onChanged, onBack }: {
  client: ReturnType<typeof createV3Client>; locale: Locale; wordbooks: Wordbook[]; onChanged: () => Promise<unknown>; onBack: () => void;
}) {
  const t = libraryText(locale);
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState<{ code: string; title: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try { await action(); await onChanged(); return true; } catch (e) { setError(e instanceof Error ? e.message : String(e)); return false; } finally { setBusy(false); }
  };
  return (
    <section className="library">
      <nav className="library-detail-nav"><button type="button" onClick={onBack}>{t.back}</button></nav>
      <header className="library-header"><div><h1>{t.wordbooks}</h1></div></header>
      <form className="library-filters" onSubmit={(e) => { e.preventDefault(); if (title.trim()) void run(() => client.createWordbook(title.trim())).then((ok) => ok && setTitle('')); }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t.newWordbook} aria-label={t.newWordbook} maxLength={80} />
        <button type="submit" className="library-button" disabled={busy || !title.trim()}>{t.create}</button>
      </form>
      {error ? <p className="library-error">{error}</p> : null}
      <ul className="library-books-table">
        {wordbooks.map((book) => (
          <li key={book.code}>
            {editing?.code === book.code ? (
              <form onSubmit={(e) => { e.preventDefault(); void run(() => client.renameWordbook(book.code, editing.title.trim())).then((ok) => ok && setEditing(null)); }}>
                <input value={editing.title} onChange={(e) => setEditing({ code: book.code, title: e.target.value })} maxLength={80} autoFocus aria-label={t.rename} />
                <button type="submit" disabled={busy || !editing.title.trim()}>{t.save}</button>
                <button type="button" onClick={() => setEditing(null)}>{t.cancel}</button>
              </form>
            ) : (
              <>
                <div><span className="library-code">{book.code}</span> <strong>{book.title}</strong></div>
                <dl className="library-stats">
                  {([[t.statsTotal, book.stats.total], [t.statsWords, book.stats.words], [t.statsGrammar, book.stats.grammar], [t.statsNames, book.stats.names],
                    [t.statsDue, book.stats.due], [t.statsNew, book.stats.new], [t.statsMastered, book.stats.mastered]] as Array<[string, number]>)
                    .map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
                </dl>
                <div className="library-row-actions">
                  <button type="button" onClick={() => setEditing({ code: book.code, title: book.title })}>{t.rename}</button>
                  <button type="button" disabled={busy} onClick={() => { if (window.confirm(t.confirmRemove(book.title))) void run(() => client.deleteWordbook(book.code)); }}>{t.remove}</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
