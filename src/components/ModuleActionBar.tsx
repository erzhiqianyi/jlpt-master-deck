import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Shuffle, ListFilter, ChevronLeft, MessageCircle } from 'lucide-react';

export type ModuleAction = { key: string; label: string; icon?: ReactNode; onClick: () => void; active?: boolean };

export function ModuleActionBar({ title, label, count, primary, contentActions = [], onAsk, children }: {
  title?: string; label: string; count?: string;
  primary?: { label: string; hint?: string; onClick: () => void };
  onAsk?: (question: string) => Promise<void>;
  actions?: ModuleAction[];
  contentActions?: ModuleAction[];
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  return <div className="module-action-bar" aria-label={`${label}操作`}>
    {title ? <div className="module-action-bar-heading"><h2>{title}</h2>{count ? <span>{count}</span> : null}</div> : null}
    {primary ? <div ref={root} className="study-companion-launcher" onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } }}>
      {open ? <div id={id} className="study-companion-menu" role="group" aria-label="练习模式">
        {asking ? <div className="study-question-composer"><button type="button" onClick={() => setAsking(false)}><ChevronLeft size={18} />问一个问题</button><textarea aria-label="你的问题" placeholder="写下原句和不懂的地方…" value={question} disabled={submitting} onChange={(event) => { setQuestion(event.target.value); setCopyStatus(''); }} /><button type="button" disabled={!question.trim() || submitting || !onAsk} onClick={async () => { setSubmitting(true); setCopyStatus(''); try { await onAsk?.(question.trim()); setQuestion(''); setCopyStatus('已加入队列，等待你的 AI 助手处理'); } catch { setCopyStatus('提交失败，请重试'); } finally { setSubmitting(false); } }}>{submitting ? '提交中…' : '加入待处理队列'}</button>{copyStatus ? <p role="status">{copyStatus}</p> : null}</div> : content ? <><button type="button" onClick={() => setContent(false)}><ChevronLeft size={18} />按内容练习</button><div className="study-companion-content">{contentActions.length ? contentActions.map((action) => <button type="button" key={action.key} onClick={() => { setOpen(false); action.onClick(); }}>{action.label}</button>) : <p>暂无可练习内容</p>}</div></> : <>
          <button type="button" onClick={() => { setOpen(false); primary.onClick(); }}><Shuffle size={18} />随机练习</button>
          <button type="button" onClick={() => setContent(true)}><ListFilter size={18} />按内容练习</button>
          <button type="button" onClick={() => setAsking(true)}><MessageCircle size={18} />问一个问题</button>
        </>}
      </div> : null}
      <button ref={trigger} type="button" className="study-companion-button" aria-label="选择练习模式" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => { setOpen(!open); setContent(false); setAsking(false); }}>
        <img src="/study-companion.png" width="76" height="76" alt="" draggable={false} />
      </button>
    </div> : null}
    {children}
  </div>;
}
