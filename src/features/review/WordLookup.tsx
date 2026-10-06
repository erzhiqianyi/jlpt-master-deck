import { SpeechControls } from '../../components/SpeechControls';
import { createContext, useContext, useEffect, useMemo, useRef, useState, useId, type ReactNode } from 'react';
import { findLookupItems, lookupForms, normalizeLookup, segmentJapanese } from '../../domain/wordLookup';
import { itemMeaning } from '../../domain/items';
import type { LearningCapture, Locale, TtsProviderId, VocabItem } from '../../types';
import './WordLookup.css';

type CaptureInput = { body: string; category: 'word'; context: string; targetDeck: 'n1_vocab' };
type LookupRange = { owner: string; text: string; start: number; end: number };
const LookupContext = createContext<{
  forms: Set<string>;
  range: LookupRange | null;
  open: (range: LookupRange, source?: string) => void;
} | null>(null);

export function LookupText({ text, source, renderText, additionalForms }: { text: string; source?: string; renderText?: (text: string) => ReactNode; additionalForms?: string[] }) {
  const lookup = useContext(LookupContext);
  const parts = useMemo(() => segmentJapanese(text, additionalForms ? new Set([...(lookup?.forms ?? []), ...additionalForms]) : lookup?.forms), [text, lookup?.forms, additionalForms]);
  const owner = useId();
  if (!lookup) return <>{renderText ? renderText(text) : text}</>;
  const range = lookup.range?.owner === owner && lookup.range.text === text ? lookup.range : null;
  let offset = 0;
  const renderedParts: { text: string; word: boolean; start: number; end: number; selected: boolean }[] = [];
  for (const part of parts) {
    const start = offset;
    offset += part.text.length;
    if (range && start >= range.start && offset <= range.end) {
      const previous = renderedParts[renderedParts.length - 1];
      if (previous?.selected) {
        previous.text += part.text;
        previous.end = offset;
      } else {
        renderedParts.push({ ...part, start, end: offset, selected: true });
      }
    } else {
      renderedParts.push({ ...part, start, end: offset, selected: false });
    }
  }
  return <>{renderedParts.map((part) => part.word
    ? <button type="button" className={`lookup-word${part.selected ? ' lookup-word-selected' : ''}`} key={part.start} aria-pressed={part.selected} aria-label={`查询「${part.text}」`} onClick={(event) => {
      event.stopPropagation();
      lookup.open({ owner, text, start: part.start, end: part.end }, source);
    }} onKeyDown={(event) => event.stopPropagation()}>{renderText ? renderText(part.text) : part.text}</button>
    : <span key={part.start}>{renderText ? renderText(part.text) : part.text}</span>)}</>;
}

export function WordLookupProvider({ children, items, captures, locale, enabled, onCapture, authToken, ttsProvider }: {
  children: ReactNode; items: VocabItem[]; captures: LearningCapture[]; locale: Locale; enabled: boolean;
  onCapture: (input: CaptureInput) => Promise<void>; authToken: string; ttsProvider: TtsProviderId;
}) {
  const [selection, setSelection] = useState<{ word: string; context: string } | null>(null);
  const [range, setRange] = useState<LookupRange | null>(null);
  const forms = useMemo(() => new Set(items.flatMap(lookupForms)), [items]);
  function open(next: LookupRange, source?: string) {
    const adjacent = range?.owner === next.owner && range.text === next.text
      && (range.end === next.start || next.end === range.start);
    const merged = adjacent ? { ...next, start: Math.min(range.start, next.start), end: Math.max(range.end, next.end) } : next;
    setRange(merged);
    const context = merged.text.slice(Math.max(0, merged.start - 400), merged.end + 400);
    setSelection({ word: merged.text.slice(merged.start, merged.end), context: source ? `${source}\n${context}` : context });
  }
  return <LookupContext.Provider value={{ forms, range, open }}>
    {children}
    {selection && <LookupDialog key={`${selection.word}:${selection.context}`} selection={selection} items={items} captures={captures} locale={locale} enabled={enabled} onCapture={onCapture} authToken={authToken} ttsProvider={ttsProvider} onClose={() => setSelection(null)} />}
  </LookupContext.Provider>;
}

function LookupDialog({ selection, items, captures, locale, enabled, onCapture, authToken, ttsProvider, onClose }: {
  selection: { word: string; context: string }; items: VocabItem[]; captures: LearningCapture[]; locale: Locale; enabled: boolean;
  onCapture: (input: CaptureInput) => Promise<void>; authToken: string; ttsProvider: TtsProviderId; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const [query, setQuery] = useState(selection.word);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [error, setError] = useState('');
  const word = normalizeLookup(query);
  const matches = useMemo(() => findLookupItems(items, word).map((item) => ({
    item, meaning: itemMeaning(item, locale)?.trim() || item.meaning_zh?.trim() || item.meaning_ja?.trim(),
  })), [items, word, locale]);
  const queued = saved.includes(word) || captures.some((capture) => capture.status === 'inbox' && capture.category === 'word' && normalizeLookup(capture.body) === word);
  useEffect(() => {
    const element = dialog.current;
    const active = document.activeElement as HTMLElement | null;
    element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = previous; active?.focus(); };
  }, []);
  async function enqueue() {
    if (!word || findLookupItems(items, word).length || queued || busy.current || !enabled) return;
    busy.current = true; setSaving(true); setError('');
    try {
      await onCapture({ body: word, category: 'word', targetDeck: 'n1_vocab', context: `点词查询\n原文：${selection.context}\n请结合上下文确认词义与辞书形，通过 MCP 解析并加入词库。` });
      setSaved((current) => [...current, word]);
    } catch (err) { setError(err instanceof Error ? err.message : '加入失败，请重试。'); }
    finally { busy.current = false; setSaving(false); }
  }
  return <dialog ref={dialog} className="word-lookup-dialog" aria-labelledby="word-lookup-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
    <header><h2 id="word-lookup-title">单词查询</h2><button type="button" onClick={onClose} autoFocus aria-label="关闭查询">关闭</button></header>
    <div className="word-lookup-content">
      <label htmlFor="lookup-query">查询词（可修改）</label>
      <input id="lookup-query" lang="ja" value={query} disabled={saving} onChange={(event) => { setQuery(event.target.value); setError(''); }} />
      {!word ? <p>请输入要查询的单词。</p> : matches.length ? matches.map(({ item, meaning }) => <article key={item.id}>
        <p className="word-lookup-reading-row">
          {item.reading && <span className="word-lookup-reading" lang="ja">{item.reading}</span>}
          <SpeechControls text={item.reading || item.original} label={`朗读「${item.original}」`} />
        </p>
        <p>{meaning || '暂无释义'}</p>
      </article>) : <div className="word-lookup-empty"><p>暂无释义。</p>
        <button type="button" disabled={!enabled || saving || queued} onClick={enqueue}>{saving ? '正在加入…' : queued ? '已加入待解析队列' : '加入待解析队列'}</button>
        {!enabled && <p>登录后可以加入队列。</p>}
        {queued && <p role="status">解析后可在词库查看。</p>}
      </div>}
      {error && <p role="alert">{error}</p>}
    </div>
  </dialog>;
}
