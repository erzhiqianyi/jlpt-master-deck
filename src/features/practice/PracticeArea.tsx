// 練習（v3）の入口：条件を選んで始める、練習（毎日・テーマ別・模擬試験）、記録、間違えた問題。
// itemId：'AT12'（練習を解く・結果）、'DP3' などの練習、'history'、'mistakes'、なし（入口）。
import { useEffect, useMemo, useState } from 'react';
import type { Locale } from '../../types';
import { createV3Client, type V3Client } from '../../v3/client';
import type { AttemptListItem, JlptLevel, Mistake, PracticeSet, PracticeSetKind, PracticeSetSummary, QuestionModule, QuestionType, Wordbook } from '../../v3/types';
import { textOf } from '../question-bank/QuestionBank';
import { PracticeRunner } from './PracticeRunner';
import { practiceText } from './practiceText';
import '../library/library.css';
import '../question-bank/questionBank.css';
import './practice.css';

type Props = {
  token: string; locale: Locale; module: QuestionModule | null; itemId?: string; feedback: 'immediate' | 'batch';
  /** 一覧に出す練習の種類（毎日練習の画面は daily、模擬試験は mock）。 */
  setKind?: PracticeSetKind;
  onNavigate: (itemId: string | null) => void;
};

export function PracticeArea({ token, locale, module, itemId, feedback, setKind, onNavigate }: Props) {
  const client = useMemo(() => createV3Client(token), [token]);
  const t = practiceText(locale);
  const start = async (input: Parameters<V3Client['startAttempt']>[0]) => {
    const attempt = await client.startAttempt({ kind: module ?? (setKind === 'daily' ? 'daily' : setKind === 'mock' ? 'mock' : 'mixed'), ...input });
    onNavigate(attempt.code);
  };
  if (itemId && /^AT\d+$/i.test(itemId)) {
    return <PracticeRunner client={client} locale={locale} code={itemId} feedback={feedback} onExit={() => onNavigate(null)} onRetry={(questions) => void start({ questions })} />;
  }
  if (itemId && /^(DP|TP|MX)\d+$/i.test(itemId)) return <SetDetail client={client} locale={locale} code={itemId} onBack={() => onNavigate(null)} onStart={(practice) => start({ practice })} onOpen={onNavigate} />;
  if (itemId === 'history') return <History client={client} locale={locale} module={module} onBack={() => onNavigate(null)} onOpen={onNavigate} />;
  if (itemId === 'mistakes') return <Mistakes client={client} locale={locale} module={module} onBack={() => onNavigate(null)} onPractice={(questions) => start({ questions })} />;
  return (
    <section className="library">
      <header className="library-header">
        <div><h1>{setKind === 'daily' ? t.daily : setKind === 'mock' ? t.mock : t.practiceTitle(module ? t.module[module] : null)}</h1></div>
        <div className="library-row-actions">
          <button type="button" onClick={() => onNavigate('history')}>{t.history}</button>
          <button type="button" onClick={() => onNavigate('mistakes')}>{t.mistakes}</button>
        </div>
      </header>
      <Resume client={client} locale={locale} onOpen={onNavigate} />
      {setKind ? null : <StartForm client={client} locale={locale} module={module} onStart={(filters) => start({ filters })} />}
      <SetList client={client} locale={locale} kind={setKind} onOpen={onNavigate} />
    </section>
  );
}

function Resume({ client, locale, onOpen }: { client: V3Client; locale: Locale; onOpen: (code: string) => void }) {
  const t = practiceText(locale);
  const [active, setActive] = useState<{ code: string; answered: number; total: number } | null>(null);
  useEffect(() => { client.activeAttempt().then((a) => setActive(a ? { code: a.code, answered: a.summary.answered, total: a.summary.total } : null)).catch(() => undefined); }, [client]);
  if (!active) return null;
  return <button type="button" className="practice-resume" onClick={() => onOpen(active.code)}>{t.resume} · {active.code} · {active.answered}/{active.total}</button>;
}

function StartForm({ client, locale, module, onStart }: { client: V3Client; locale: Locale; module: QuestionModule | null; onStart: (filters: Parameters<V3Client['startAttempt']>[0]['filters']) => Promise<void> }) {
  const t = practiceText(locale);
  const [types, setTypes] = useState<QuestionType[]>([]);
  const [books, setBooks] = useState<Wordbook[]>([]);
  const [typeId, setTypeId] = useState('');
  const [level, setLevel] = useState<JlptLevel | ''>('');
  const [wordbook, setWordbook] = useState('');
  const [count, setCount] = useState(10);
  const [onlyDue, setOnlyDue] = useState(false);
  const [excludeCorrect, setExcludeCorrect] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    client.questionTypes().then((list) => setTypes(list.filter((x) => !module || x.module === module))).catch(() => undefined);
    client.wordbooks().then(setBooks).catch(() => undefined);
  }, [client, module]);
  const submit = async () => {
    setBusy(true); setError('');
    try {
      await onStart({ ...(module ? { module } : {}), ...(typeId ? { typeIds: [typeId] } : {}), ...(level ? { level } : {}), ...(wordbook ? { wordbook } : {}), onlyDue, excludeAnsweredCorrectly: excludeCorrect, count });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <section className="library-section practice-start">
      <div className="library-filters">
        <select value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-label={t.type}>
          <option value="">{t.allTypes}</option>
          {types.map((x) => <option key={x.typeId} value={x.typeId}>{module ? '' : `${t.module[x.module]} · `}{x.labelJa}</option>)}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value as JlptLevel | '')} aria-label={t.level}>
          <option value="">{t.anyLevel}</option>
          {(['N1', 'N2', 'N3', 'N4', 'N5'] as const).map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        {!module || module === 'vocabulary' || module === 'grammar' ? (
          <select value={wordbook} onChange={(e) => setWordbook(e.target.value)} aria-label={t.wordbook}>
            <option value="">{t.anyWordbook}</option>
            {books.map((b) => <option key={b.code} value={b.code}>{b.title}</option>)}
          </select>
        ) : null}
        <label className="practice-count">{t.count}<input type="number" min={1} max={100} value={count} onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} /></label>
      </div>
      <div className="practice-toggles">
        <label><input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} />{t.onlyDue}</label>
        <label><input type="checkbox" checked={excludeCorrect} onChange={(e) => setExcludeCorrect(e.target.checked)} />{t.excludeCorrect}</label>
      </div>
      {error ? <p className="library-error">{/没有可以练习|没有符合条件/.test(error) ? t.noQuestions : error}</p> : null}
      <button type="button" className="library-button" disabled={busy} onClick={() => void submit()}>{busy ? t.starting : t.start}</button>
    </section>
  );
}

function SetList({ client, locale, kind, onOpen }: { client: V3Client; locale: Locale; kind?: PracticeSetKind; onOpen: (code: string) => void }) {
  const t = practiceText(locale);
  const [sets, setSets] = useState<PracticeSetSummary[] | null>(null);
  useEffect(() => { client.practiceSets({ kind, limit: 30 }).then((r) => setSets(r.items)).catch(() => setSets([])); }, [client, kind]);
  return (
    <section className="practice-sets">
      <h2 className="bank-subhead">{kind ? (kind === 'daily' ? t.daily : kind === 'mock' ? t.mock : t.topic) : t.practiceSets}</h2>
      {sets === null ? <p className="library-empty">{t.loading}</p> : !sets.length ? <p className="library-muted">{t.noSets}</p> : (
        <ol className="library-list">
          {sets.map((s) => (
            <li key={s.code}>
              <button type="button" className="bank-row" onClick={() => onOpen(s.code)}>
                <span className="library-code">{s.code}</span>
                <span className="bank-row-main"><span className="bank-row-type">{t[s.kind]}{s.date ? ` · ${s.date}` : ''}{s.minutes ? ` · ${t.minutes(s.minutes)}` : ''}</span><span>{textOf(s.title) || s.code}</span></span>
                <span className="library-meta"><em>{t.questions(s.questionCount)}</em>{s.completedCount ? <em data-status="mastered">{t.completed(s.completedCount)}</em> : null}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function SetDetail({ client, locale, code, onBack, onStart, onOpen }: { client: V3Client; locale: Locale; code: string; onBack: () => void; onStart: (code: string) => Promise<void>; onOpen: (code: string) => void }) {
  const t = practiceText(locale);
  const [set, setSet] = useState<PracticeSet | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { client.practiceSet(code).then(setSet).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))); }, [client, code]);
  const nav = <nav className="library-detail-nav"><button type="button" onClick={onBack}>{t.backToHub}</button></nav>;
  if (!set) return <section className="library">{nav}<p className={error ? 'library-error' : 'library-empty'}>{error || t.loading}</p></section>;
  const count = set.entries.length + set.sections.reduce((n, s) => n + s.entries.length, 0);
  return (
    <section className="library">
      {nav}
      <header className="library-detail-head">
        <span className="library-code">{set.code} · {t[set.kind]}{set.date ? ` · ${set.date}` : ''}</span>
        <h1>{textOf(set.title) || set.code}</h1>
        {textOf(set.description) ? <p className="library-pre">{textOf(set.description)}</p> : null}
        {textOf(set.disclaimer) ? <p className="library-muted">{textOf(set.disclaimer)}</p> : null}
        <p className="library-muted">{t.questions(count)}{set.sections.length ? ` · ${t.sectionCount(set.sections.length)}` : ''}{set.minutes ? ` · ${t.minutes(set.minutes)}` : ''}</p>
        {error ? <p className="library-error">{error}</p> : null}
        <div className="library-row-actions"><button type="button" className="library-button" onClick={() => void onStart(set.code).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}>{t.start}</button></div>
      </header>
      {set.sections.map((s) => (
        <section key={s.position} className="library-section">
          <h2>{textOf(s.title) || `${s.position + 1}`}{s.durationMinutes ? ` · ${t.minutes(s.durationMinutes)}` : ''}</h2>
          {textOf(s.description) ? <p className="library-muted">{textOf(s.description)}</p> : null}
          <p className="library-muted">{t.questions(s.entries.length)}</p>
        </section>
      ))}
      {set.attempts.length ? (
        <section className="library-section">
          <h2>{t.history}</h2>
          <ul className="library-bullets">{set.attempts.map((a) => <li key={a.code}><button type="button" className="practice-link" onClick={() => onOpen(a.code)}>{a.code}</button> · {new Date(a.startedAt).toLocaleString(locale)} · {a.completedAt ? t.done : t.inProgress}</li>)}</ul>
        </section>
      ) : null}
    </section>
  );
}

function History({ client, locale, module, onBack, onOpen }: { client: V3Client; locale: Locale; module: QuestionModule | null; onBack: () => void; onOpen: (code: string) => void }) {
  const t = practiceText(locale);
  const [items, setItems] = useState<AttemptListItem[] | null>(null);
  useEffect(() => { client.attempts({ kind: module ?? undefined, limit: 100 }).then((r) => setItems(r.items)).catch(() => setItems([])); }, [client, module]);
  return (
    <section className="library">
      <nav className="library-detail-nav"><button type="button" onClick={onBack}>{t.backToHub}</button></nav>
      <header className="library-header"><div><h1>{t.history}</h1></div></header>
      {items === null ? <p className="library-empty">{t.loading}</p> : !items.length ? <p className="library-empty">{t.empty}</p> : (
        <ol className="library-list">
          {items.map((a) => (
            <li key={a.code}>
              <button type="button" className="bank-row" onClick={() => onOpen(a.code)}>
                <span className="library-code">{a.code}</span>
                <span className="bank-row-main"><span className="bank-row-type">{new Date(a.startedAt).toLocaleString(locale)}{a.practice ? ` · ${a.practice}` : ''}</span><span>{textOf(a.title) || t.practiceTitle(a.kind in t.module ? t.module[a.kind as QuestionModule] : null)}</span></span>
                <span className="library-meta"><em>{a.summary.correct}/{a.summary.scored || a.summary.answered}</em><em data-status={a.completedAt ? 'mastered' : 'learning'}>{a.completedAt ? t.done : t.inProgress}</em></span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Mistakes({ client, locale, module, onBack, onPractice }: { client: V3Client; locale: Locale; module: QuestionModule | null; onBack: () => void; onPractice: (questions: string[]) => Promise<void> }) {
  const t = practiceText(locale);
  const [items, setItems] = useState<Mistake[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { client.mistakes({ module: module ?? undefined, limit: 100 }).then((r) => setItems(r.items)).catch(() => setItems([])); }, [client, module]);
  return (
    <section className="library">
      <nav className="library-detail-nav"><button type="button" onClick={onBack}>{t.backToHub}</button></nav>
      <header className="library-header">
        <div><h1>{t.mistakes}</h1></div>
        {items?.length ? <button type="button" className="library-button" onClick={() => void onPractice(items.slice(0, 50).map((m) => m.question)).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}>{t.practiceAgain}</button> : null}
      </header>
      {error ? <p className="library-error">{error}</p> : null}
      {items === null ? <p className="library-empty">{t.loading}</p> : !items.length ? <p className="library-empty">{t.empty}</p> : (
        <ol className="library-list practice-mistakes">
          {items.map((m) => (
            <li key={m.question}>
              <div className="bank-row">
                <span className="library-code">{m.question}</span>
                <span className="bank-row-main">
                  <span lang="ja" className="bank-row-prompt">{m.prompt ?? ''}</span>
                  <span className="library-muted">{t.mistakeChosen}：<span lang="ja">{m.selectedText ?? '—'}</span> · {t.mistakeCorrect}：<span lang="ja">{m.correctText ?? '—'}</span></span>
                </span>
                <span className="library-meta"><em>{new Date(m.answeredAt).toLocaleDateString(locale)}</em></span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
