// 選んだ日本語を自分の題庫で引く（活用形・別表記も見つかる）。無ければ収集箱に入れて、あとで AI に整理してもらう。
// 文章・問題・カードなど、画面のどこで選んでも使える（入力欄の中は除く）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { createV3Client } from '../../v3/client';
import type { KnowledgeSummary } from '../../v3/types';
import type { Locale } from '../../types';
import './wordLookup.css';

const JAPANESE = /[぀-ヿ㐀-鿿々〆ヶ]/;
const MAX_LENGTH = 30;
const TEXT = {
  'zh-CN': { title: '查词', none: '词库里还没有这个词。', add: '加入收集箱', added: '已加入收集箱，AI 整理后会出现在词库里。', open: '查看', close: '关闭', loading: '查询中…' },
  ja: { title: '辞書', none: 'まだ題庫にない言葉です。', add: '受信箱に入れる', added: '受信箱に入れました。AI が整理すると題庫に出ます。', open: '開く', close: '閉じる', loading: '検索中…' },
  en: { title: 'Look up', none: 'Not in your library yet.', add: 'Add to inbox', added: 'Added to the inbox. It appears in the library once your AI files it.', open: 'Open', close: 'Close', loading: 'Looking up…' },
} as const;

type Selection = { text: string; context: string; x: number; y: number };

export function WordLookup({ token, locale, onOpen }: { token: string; locale: Locale; onOpen: (item: KnowledgeSummary) => void }) {
  const client = useMemo(() => createV3Client(token), [token]);
  const t = TEXT[locale];
  const [selection, setSelection] = useState<Selection | null>(null);
  const [matches, setMatches] = useState<KnowledgeSummary[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'added' | 'error'>('idle');
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const read = (event: Event) => {
      if (panel.current?.contains(event.target as Node)) return;
      window.setTimeout(() => {
        const current = window.getSelection();
        const text = current?.toString().trim() ?? '';
        const target = current?.anchorNode?.parentElement;
        if (!current || current.isCollapsed || !text || text.length > MAX_LENGTH || !JAPANESE.test(text) || target?.closest('input, textarea, [contenteditable="true"]')) {
          setSelection(null);
          return;
        }
        const rect = current.getRangeAt(0).getBoundingClientRect();
        const context = (target?.closest('p, li, dd, blockquote') ?? target)?.textContent?.trim().slice(0, 300) ?? '';
        setSelection({ text, context, x: rect.left + rect.width / 2, y: rect.bottom });
      }, 10);
    };
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelection(null); };
    document.addEventListener('mouseup', read);
    document.addEventListener('touchend', read);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mouseup', read); document.removeEventListener('touchend', read); document.removeEventListener('keydown', close); };
  }, []);

  useEffect(() => {
    if (!selection) { setMatches(null); return; }
    let cancelled = false;
    setMatches(null); setStatus('idle');
    client.lookup(selection.text).then((items) => { if (!cancelled) setMatches(items); }).catch(() => { if (!cancelled) setMatches([]); });
    return () => { cancelled = true; };
  }, [client, selection]);

  if (!selection) return null;
  const left = Math.max(12, Math.min(selection.x - 160, window.innerWidth - 332));
  const top = Math.min(selection.y + 8, window.innerHeight - 220);
  const add = async () => {
    setStatus('saving');
    try {
      await client.createCapture({ body: selection.text, category: 'word', context: `${t.title}：${selection.context}\n${window.location.hash}` });
      setStatus('added');
    } catch { setStatus('error'); }
  };
  return (
    <div ref={panel} className="word-lookup" role="dialog" aria-label={t.title} style={{ left, top }}>
      <header><strong lang="ja">{selection.text}</strong><button type="button" aria-label={t.close} onClick={() => setSelection(null)}>×</button></header>
      {matches === null ? <p className="word-lookup-muted">{t.loading}</p> : null}
      {matches?.map((item) => (
        <button key={item.code} type="button" className="word-lookup-match" onClick={() => { setSelection(null); onOpen(item); }}>
          <span lang="ja"><b>{item.expression}</b>{item.reading && item.reading !== item.expression ? ` ${item.reading}` : ''}</span>
          <span>{item.meaning?.text ?? ''}</span>
          <small>{t.open} {item.code}</small>
        </button>
      ))}
      {matches?.length === 0 ? (
        <>
          <p className="word-lookup-muted">{t.none}</p>
          {status === 'added' ? <p role="status">{t.added}</p>
            : <button type="button" className="library-button" disabled={status === 'saving'} onClick={() => void add()}>{t.add}</button>}
        </>
      ) : null}
    </div>
  );
}
