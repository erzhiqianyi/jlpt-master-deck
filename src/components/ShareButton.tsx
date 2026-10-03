import { useEffect, useId, useRef, useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import type { Locale } from '../types';

export function ShareButton({ onShare, description = '', iconOnly = false, locale = 'zh-CN' }: { onShare: (description: string) => Promise<void>; description?: string; iconOnly?: boolean; locale?: Locale }) {
  const copy = locale === 'ja'
    ? { shared: '共有済み', share: '共有', content: 'コンテンツを共有', audience: '内容と説明が公開の「発見」に表示され、他の学習者が閲覧・追加できます。個人情報を含めないでください。', description: '内容の説明', placeholder: '練習内容や対象となる学習者、学習目標を紹介してください', cancel: 'キャンセル', sharing: '共有中…', confirm: '公開して共有', failed: '共有できませんでした' }
    : locale === 'en'
      ? { shared: 'Shared', share: 'Share', content: 'Share content', audience: 'The content and description will appear in public discovery so other learners can view and add them. Do not include private information.', description: 'Description', placeholder: 'Describe the practice scope, intended learners or learning goals', cancel: 'Cancel', sharing: 'Sharing…', confirm: 'Share publicly', failed: 'Could not share' }
      : { shared: '已分享', share: '分享', content: '分享内容', audience: '内容及说明将显示在公开的「发现」中，其他学习者可以查看并加入自己的资料。请勿包含个人隐私信息。', description: '内容说明', placeholder: '介绍练习范围、适合的学习者或学习目标', cancel: '取消', sharing: '分享中…', confirm: '公开分享', failed: '分享失败' };
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(description);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [shared, setShared] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element?.open) element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = previous;
      if (trigger.current?.isConnected) trigger.current.focus();
    };
  }, [open]);

  return <>
    <button ref={trigger} type="button" className="cute-button-secondary share-trigger px-3 py-2" aria-label={shared ? copy.shared : copy.share} title={shared ? copy.shared : copy.share}
      aria-haspopup="dialog" aria-disabled={shared} onClick={() => { if (shared) return; setText(description); setError(''); setOpen(true); }}>
      {iconOnly ? (shared ? <Check size={22} aria-hidden="true" /> : <Share2 size={22} aria-hidden="true" />) : shared ? copy.shared : copy.share}
    </button>
    <dialog ref={dialog} className="app-confirmation share-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-audience`}
      onCancel={(event) => { event.preventDefault(); if (!busyRef.current) setOpen(false); }}>
      {open ? <form onSubmit={async (event) => {
        event.preventDefault();
        if (busyRef.current || !text.trim()) return;
        busyRef.current = true;
        setBusy(true);
        setError('');
        try { await onShare(text.trim()); setShared(true); setOpen(false); }
        catch { setError(copy.failed); }
        finally { busyRef.current = false; setBusy(false); }
      }} aria-busy={busy}>
        <div className="app-confirmation-body">
          <h2 id={`${id}-title`}>{copy.content}</h2>
          <p id={`${id}-audience`}>{copy.audience}</p>
          <label>{copy.description}<textarea autoFocus required maxLength={600} rows={4} value={text} disabled={busy} onChange={(event) => setText(event.target.value)} placeholder={copy.placeholder} /></label>
          {error ? <p role="alert" className="share-error">{error}</p> : null}
        </div>
        <footer>
          <button type="button" disabled={busy} onClick={() => setOpen(false)}>{copy.cancel}</button>
          <button type="submit" className="is-primary" disabled={busy || !text.trim()}>{busy ? copy.sharing : copy.confirm}</button>
        </footer>
      </form> : null}
    </dialog>
  </>;
}
