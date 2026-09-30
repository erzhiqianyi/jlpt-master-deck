import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { Locale } from '../types';

export function ShareButton({ onShare, description = '', iconOnly = false, locale = 'zh-CN' }: { onShare: (description: string) => Promise<void>; description?: string; iconOnly?: boolean; locale?: Locale }) {
  const copy = locale === 'ja'
    ? { shared: '共有済み', share: '共有', content: 'コンテンツを共有', description: '内容の説明', placeholder: '練習内容や対象となる学習者、学習目標を紹介してください', cancel: 'キャンセル', sharing: '共有中…', confirm: '共有する', failed: '共有できませんでした' }
    : locale === 'en'
      ? { shared: 'Shared', share: 'Share', content: 'Share content', description: 'Description', placeholder: 'Describe the practice scope, intended learners or learning goals', cancel: 'Cancel', sharing: 'Sharing…', confirm: 'Confirm share', failed: 'Could not share' }
      : { shared: '已分享', share: '分享', content: '分享内容', description: '内容说明', placeholder: '介绍练习范围、适合的学习者或学习目标', cancel: '取消', sharing: '分享中…', confirm: '确认分享', failed: '分享失败' };
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(description);
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState(false);
  const [error, setError] = useState('');
  return <>
    <button type="button" className="cute-button-secondary px-3 py-2" aria-label={shared ? copy.shared : copy.share} title={shared ? copy.shared : copy.share} onClick={() => { setText(description); setError(''); setOpen(true); }} disabled={shared}>{iconOnly ? (shared ? <Check size={22} aria-hidden="true" /> : <Share2 size={22} aria-hidden="true" />) : shared ? copy.shared : copy.share}</button>
    {open && createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onKeyDown={(e) => { if (e.key === 'Escape' && !busy) setOpen(false); }}>
      <form role="dialog" aria-modal="true" aria-label={copy.content} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onSubmit={async (e) => {
        e.preventDefault(); if (busy || !text.trim()) return;
        setBusy(true); setError('');
        try { await onShare(text.trim()); setShared(true); setOpen(false); }
        catch { setError(copy.failed); }
        finally { setBusy(false); }
      }}>
        <h2 className="mb-4 text-xl font-bold">{copy.content}</h2>
        <label className="block">{copy.description}<textarea autoFocus required maxLength={600} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={copy.placeholder} className="mt-2 w-full rounded-xl border p-3" /></label>
        {error && <p role="alert">{error}</p>}
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" className="cute-button-secondary px-4 py-2" disabled={busy} onClick={() => setOpen(false)}>{copy.cancel}</button>
          <button type="submit" className="cute-button px-4 py-2" disabled={busy || !text.trim()}>{busy ? copy.sharing : copy.confirm}</button>
        </div>
      </form>
    </div>, document.body)}
  </>;
}
