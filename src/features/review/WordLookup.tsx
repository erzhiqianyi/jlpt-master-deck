import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Volume2 } from 'lucide-react';
import { findLookupItems, lookupForms, normalizeLookup, segmentJapanese } from '../../domain/wordLookup';
import { itemMeaning } from '../../domain/items';
import { speak } from '../../lib/tts';
import type { LearningCapture, Locale, TtsProviderId, VocabItem } from '../../types';
import './WordLookup.css';

type CaptureInput = { body: string; category: 'word'; context: string; targetDeck: 'n1_vocab' };
const LookupContext = createContext<{ forms: Set<string>; open: (word: string, context: string) => void } | null>(null);

export function LookupText({ text, source }: { text: string; source?: string }) {
  const lookup = useContext(LookupContext);
  const parts = useMemo(() => segmentJapanese(text, lookup?.forms), [text, lookup?.forms]);
  if (!lookup) return <>{text}</>;
  let offset = 0;
  const contexts = parts.map((part) => {
    const context = text.slice(Math.max(0, offset - 400), offset + part.text.length + 400);
    offset += part.text.length;
    return source ? `${source}\n${context}` : context;
  });
  return <>{parts.map((part, index) => part.word
    ? <button type="button" className="lookup-word" key={index} aria-label={`查询「${part.text}」`} onClick={(event) => { event.stopPropagation(); lookup.open(part.text, contexts[index]); }} onKeyDown={(event) => event.stopPropagation()}>{part.text}</button>
    : <span key={index}>{part.text}</span>)}</>;
}

export function WordLookupProvider({ children, items, captures, locale, enabled, onCapture, authToken, ttsProvider }: {
  children: ReactNode; items: VocabItem[]; captures: LearningCapture[]; locale: Locale; enabled: boolean;
  onCapture: (input: CaptureInput) => Promise<void>; authToken: string; ttsProvider: TtsProviderId;
}) {
  const [selection, setSelection] = useState<{ word: string; context: string } | null>(null);
  const forms = useMemo(() => new Set(items.flatMap(lookupForms)), [items]);
  return <LookupContext.Provider value={{ forms, open: (word, context) => setSelection({ word, context }) }}>
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
  const [speaking, setSpeaking] = useState<string | null>(null);
  const word = normalizeLookup(query);
  const matches = useMemo(() => findLookupItems(items, word).map((item) => ({
    item, meaning: itemMeaning(item, locale)?.trim() || item.meaning_zh?.trim() || item.meaning_ja?.trim(),
  })).filter((match) => match.meaning), [items, word, locale]);
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
    if (!word || queued || busy.current || !enabled) return;
    busy.current = true; setSaving(true); setError('');
    try {
      await onCapture({ body: word, category: 'word', targetDeck: 'n1_vocab', context: `点词查询\n原文：${selection.context}\n请结合上下文确认词义与辞书形，通过 MCP 解析并加入词库。` });
      setSaved((current) => [...current, word]);
    } catch (err) { setError(err instanceof Error ? err.message : '加入失败，请重试。'); }
    finally { busy.current = false; setSaving(false); }
  }
  async function playPronunciation(itemId: string, text: string) {
    if (speaking) return;
    setSpeaking(itemId); setError('');
    try { await speak(text, { provider: ttsProvider, token: authToken }); }
    catch (err) { setError(err instanceof Error ? err.message : '朗读失败，请重试。'); }
    finally { setSpeaking(null); }
  }
  return <dialog ref={dialog} className="word-lookup-dialog" aria-labelledby="word-lookup-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
    <header><h2 id="word-lookup-title">单词查询</h2><button type="button" onClick={onClose} autoFocus aria-label="关闭查询">关闭</button></header>
    <div className="word-lookup-content">
      <label htmlFor="lookup-query">查询词（可修改）</label>
      <input id="lookup-query" lang="ja" value={query} disabled={saving} onChange={(event) => { setQuery(event.target.value); setError(''); }} />
      {!word ? <p>请输入要查询的单词。</p> : matches.length ? matches.map(({ item, meaning }) => <article key={item.id}>
        <p className="word-lookup-reading-row">
          {item.reading && item.reading !== word && <span className="word-lookup-reading" lang="ja">{item.reading}</span>}
          <button type="button" className="word-lookup-speak" disabled={speaking === item.id} aria-label={`朗读「${item.original}」`} onClick={() => playPronunciation(item.id, item.reading || item.original)}>
            <Volume2 size={16} />
          </button>
        </p>
        <p>{meaning}</p>
      </article>) : <div className="word-lookup-empty"><p>暂无释义。</p>
        <button type="button" disabled={!enabled || saving || queued} onClick={enqueue}>{saving ? '正在加入…' : queued ? '已加入待解析队列' : '加入待解析队列'}</button>
        {!enabled && <p>登录后可以加入队列。</p>}
        {queued && <p role="status">解析后可在词库查看。</p>}
      </div>}
      {error && <p role="alert">{error}</p>}
    </div>
  </dialog>;
}
