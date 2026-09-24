import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { findLookupItems, lookupForms, normalizeLookup, segmentJapanese } from '../../domain/wordLookup';
import { itemMeaning } from '../../domain/items';
import type { LearningCapture, Locale, VocabItem } from '../../types';
import './WordLookup.css';

type CaptureInput = { body: string; category: 'word'; context: string; targetDeck: 'n1_vocab' };
const LookupContext = createContext<{ forms: Set<string>; open: (word: string, context: string) => void } | null>(null);

export function LookupText({ text }: { text: string }) {
  const lookup = useContext(LookupContext);
  const parts = useMemo(() => segmentJapanese(text, lookup?.forms), [text, lookup?.forms]);
  if (!lookup) return <>{text}</>;
  return <>{parts.map((part, index) => part.word
    ? <button type="button" className="lookup-word" key={index} aria-label={`查询「${part.text}」`} onClick={(event) => { event.stopPropagation(); lookup.open(part.text, text); }} onKeyDown={(event) => event.stopPropagation()}>{part.text}</button>
    : <span key={index}>{part.text}</span>)}</>;
}

export function WordLookupProvider({ children, items, captures, locale, enabled, onCapture }: {
  children: ReactNode; items: VocabItem[]; captures: LearningCapture[]; locale: Locale; enabled: boolean;
  onCapture: (input: CaptureInput) => Promise<void>;
}) {
  const [selection, setSelection] = useState<{ word: string; context: string } | null>(null);
  const forms = useMemo(() => new Set(items.flatMap(lookupForms)), [items]);
  return <LookupContext.Provider value={{ forms, open: (word, context) => setSelection({ word, context }) }}>
    {children}
    {selection && <LookupDialog key={`${selection.word}:${selection.context}`} selection={selection} items={items} captures={captures} locale={locale} enabled={enabled} onCapture={onCapture} onClose={() => setSelection(null)} />}
  </LookupContext.Provider>;
}

function LookupDialog({ selection, items, captures, locale, enabled, onCapture, onClose }: {
  selection: { word: string; context: string }; items: VocabItem[]; captures: LearningCapture[]; locale: Locale; enabled: boolean;
  onCapture: (input: CaptureInput) => Promise<void>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const [query, setQuery] = useState(selection.word);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [error, setError] = useState('');
  const word = normalizeLookup(query);
  const matches = useMemo(() => findLookupItems(items, word), [items, word]);
  const queued = saved.includes(word) || captures.some((capture) => capture.status === 'inbox' && normalizeLookup(capture.body) === word);
  useEffect(() => {
    const element = dialog.current;
    const active = document.activeElement as HTMLElement | null;
    element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = previous; active?.focus(); };
  }, []);
  async function enqueue() {
    if (!word || queued || busy.current || !enabled) return;
    busy.current = true; setSaving(true); setError('');
    try {
      await onCapture({ body: word, category: 'word', targetDeck: 'n1_vocab', context: `记忆卡点词查询\n原文：${selection.context}\n请结合上下文确认词义与辞书形，通过 MCP 解析并加入词库。` });
      setSaved((current) => [...current, word]);
    } catch (err) { setError(err instanceof Error ? err.message : '加入失败，请重试。'); }
    finally { busy.current = false; setSaving(false); }
  }
  return <dialog ref={dialog} className="word-lookup-dialog" aria-labelledby="word-lookup-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
    <header><h2 id="word-lookup-title">单词查询</h2><button type="button" onClick={onClose} autoFocus aria-label="关闭查询">关闭</button></header>
    <div className="word-lookup-content">
      <label htmlFor="lookup-query">查询词（可修改）</label>
      <input id="lookup-query" lang="ja" value={query} disabled={saving} onChange={(event) => { setQuery(event.target.value); setError(''); }} />
      <p className="word-lookup-context" lang="ja">{selection.context}</p>
      {!word ? <p>请输入要查询的单词。</p> : matches.length ? matches.map((item) => <article key={item.id}>
        <h3 lang="ja">{item.original}</h3><p lang="ja">{item.reading} <small>{item.part_of_speech} {item.jlpt_level}</small></p>
        <p>{itemMeaning(item, locale)}</p>{item.meaning_ja && <p lang="ja">{item.meaning_ja}</p>}
        {item.examples?.slice(0, 2).map((example, index) => <p key={index}><span lang="ja">{example.ja}</span><br /><small>{example.zh}</small></p>)}
      </article>) : <div className="word-lookup-empty"><p>词库尚未收录「{word}」。</p>
        <p>加入待解析队列后，可由连接 MCP 的助手结合原文解析并入库。</p>
        <button type="button" disabled={!enabled || saving || queued} onClick={enqueue}>{saving ? '正在加入…' : queued ? '已在待解析队列' : '加入解析队列'}</button>
        {!enabled && <p>登录后可以加入队列。</p>}
        {queued && <p role="status">已保存到输入记录，等待 MCP 助手处理。</p>}
      </div>}
      {error && <p role="alert">{error}</p>}
    </div>
  </dialog>;
}
