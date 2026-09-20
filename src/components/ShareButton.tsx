import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { createPortal } from 'react-dom';

export function ShareButton({ onShare, description = '', iconOnly = false }: { onShare: (description: string) => Promise<void>; description?: string; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(description);
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState(false);
  const [error, setError] = useState('');
  return <>
    <button type="button" className="cute-button-secondary px-3 py-2" aria-label={shared ? '已分享' : '分享'} title={shared ? '已分享' : '分享'} onClick={() => { setText(description); setError(''); setOpen(true); }} disabled={shared}>{iconOnly ? (shared ? <Check size={22} aria-hidden="true" /> : <Share2 size={22} aria-hidden="true" />) : shared ? '已分享' : '分享'}</button>
    {open && createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onKeyDown={(e) => { if (e.key === 'Escape' && !busy) setOpen(false); }}>
      <form role="dialog" aria-modal="true" aria-label="分享内容" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onSubmit={async (e) => {
        e.preventDefault(); if (busy || !text.trim()) return;
        setBusy(true); setError('');
        try { await onShare(text.trim()); setShared(true); setOpen(false); }
        catch (e) { setError(e instanceof Error ? e.message : '分享失败'); }
        finally { setBusy(false); }
      }}>
        <h2 className="mb-4 text-xl font-bold">分享内容</h2>
        <label className="block">内容说明<textarea autoFocus required maxLength={600} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="介绍练习范围、适合的学习者或学习目标" className="mt-2 w-full rounded-xl border p-3" /></label>
        {error && <p role="alert">{error}</p>}
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" className="cute-button-secondary px-4 py-2" disabled={busy} onClick={() => setOpen(false)}>取消</button>
          <button type="submit" className="cute-button px-4 py-2" disabled={busy || !text.trim()}>{busy ? '分享中…' : '确认分享'}</button>
        </div>
      </form>
    </div>, document.body)}
  </>;
}
