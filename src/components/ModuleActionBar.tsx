import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ListFilter, MessageCircle, Shuffle, X } from 'lucide-react';

export type ModuleAction = {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  hint?: string;
};

type Panel = 'modes' | 'content' | 'ask' | 'actions';

function moduleActionCopy(locale: string) {
  if (locale === 'ja') return { actions: '操作', more: 'その他の操作', modes: '練習モードを選択', byContent: '内容別に練習', ask: '質問する', back: '練習モードに戻る', close: '閉じる', empty: '練習できる内容がありません', question: '質問', placeholder: '原文と分からないところを入力…', hint: '送信した質問は待機リストに入り、AI アシスタントが処理します。', submitting: '送信中…', submit: '待機リストに追加', error: '送信できませんでした。質問は保存されています。もう一度お試しください。', saved: '待機リストに追加しました。AI アシスタントの処理を待っています。', queue: '待機中の記録を見る', random: 'ランダム練習' };
  if (locale === 'en') return { actions: 'Actions', more: 'More actions', modes: 'Choose a practice mode', byContent: 'Practice by content', ask: 'Ask a question', back: 'Back to practice modes', close: 'Close', empty: 'No content to practice yet', question: 'Your question', placeholder: 'Add the original text and what you need help with…', hint: 'Your question will join the pending queue for your AI assistant to process.', submitting: 'Submitting…', submit: 'Add to pending queue', error: 'Could not submit. Your question is still here; please try again.', saved: 'Added to the queue, waiting for your AI assistant.', queue: 'View pending records', random: 'Random practice' };
  return { actions: '操作', more: '更多操作', modes: '选择练习模式', byContent: '按内容练习', ask: '问一个问题', back: '返回练习模式', close: '关闭', empty: '暂无可练习内容', question: '你的问题', placeholder: '写下原句和不懂的地方…', hint: '提交后会加入待处理队列，交给你的 AI 助手处理。', submitting: '提交中…', submit: '加入待处理队列', error: '提交失败，请重试。你的问题已保留。', saved: '已加入队列，等待你的 AI 助手处理。', queue: '查看待处理记录', random: '随机练习' };
}

/** One visible practice entry and the same module actions at every viewport size. */
export function ModuleActionBar({ title, label, count, primary, actions = [], contentActions = [], onAsk, children, locale = 'zh-CN' }: {
  title?: string;
  locale?: string;
  label: string;
  count?: string;
  primary?: { label: string; hint?: string; onClick: () => void; disabled?: boolean };
  onAsk?: (question: string) => Promise<void>;
  actions?: ModuleAction[];
  contentActions?: ModuleAction[];
  children?: ReactNode;
}) {
  const copy = moduleActionCopy(locale);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState<'saved' | 'error' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const panelTitle = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const open = panel !== null;

  function show(next: Panel) {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPanel(next);
  }

  function close() {
    dialog.current?.close();
    setPanel(null);
  }

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

  useEffect(() => {
    if (panel === 'ask') questionInput.current?.focus();
    else if (panel) panelTitle.current?.focus();
  }, [panel]);

  function runAction(action: ModuleAction) {
    if (action.disabled) return;
    close();
    action.onClick();
  }

  const actionButtons = actions.map((action) => <button
    key={action.key}
    type="button"
    className={`module-action-secondary${action.active ? ' is-active' : ''}`}
    aria-pressed={action.active}
    disabled={action.disabled}
    title={action.hint}
    onClick={() => runAction(action)}
  >{action.icon ? <span aria-hidden="true">{action.icon}</span> : null}<span>{action.label}</span></button>);

  return <div className="module-action-bar" role="group" aria-label={`${label} · ${copy.actions}`}>
    {title ? <div className="module-action-bar-heading"><h2>{title}</h2>{count ? <span>{count}</span> : null}</div> : null}
    {primary ? <button type="button" className="module-practice-mascot" aria-label={copy.modes} title={copy.modes}
      disabled={primary.disabled} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => show('modes')}>
      <img src="/study-companion.png" alt="" width="72" height="72"/><span>{locale === 'ja' ? '練習' : locale === 'en' ? 'Practice' : '练习'}</span>
    </button> : actions.length ? <div className="module-context-actions">{actionButtons}</div> : null}
    {children}
    <dialog ref={dialog} id={id} className="module-action-dialog" data-panel={panel} aria-labelledby={`${id}-title`}
      onCancel={(event) => { event.preventDefault(); close(); }}>
      {panel ? <>
        <header className="module-action-dialog-header">
          {panel === 'content' || panel === 'ask' ? <button type="button" aria-label={copy.back} onClick={() => setPanel('modes')}><ChevronLeft size={20} aria-hidden="true" /></button> : null}
          <h2 id={`${id}-title`} ref={panelTitle} tabIndex={-1}>{panel === 'actions' ? `${label} · ${copy.actions}` : panel === 'content' ? copy.byContent : panel === 'ask' ? copy.ask : copy.modes}</h2>
          <button type="button" aria-label={copy.close} onClick={close}><X size={20} aria-hidden="true" /></button>
        </header>
        <div className="module-action-dialog-body">
          {panel === 'actions' ? <div className="module-action-options">{actionButtons}</div> : panel === 'content' ? <div className="module-action-options">
            {contentActions.length ? contentActions.map((action) => <button type="button" key={action.key} disabled={action.disabled}
              aria-pressed={action.active} title={action.hint} onClick={() => runAction(action)}>
              {action.icon ? <span aria-hidden="true">{action.icon}</span> : null}<span>{action.label}</span>
            </button>) : <p>{copy.empty}</p>}
          </div> : panel === 'ask' ? <form className="module-question-composer" onSubmit={async (event) => {
            event.preventDefault();
            if (!question.trim() || !onAsk || submittingRef.current) return;
            submittingRef.current = true;
            setSubmitting(true);
            setStatus(null);
            try {
              await onAsk(question.trim());
              setQuestion('');
              setStatus('saved');
            } catch {
              setStatus('error');
            } finally {
              submittingRef.current = false;
              setSubmitting(false);
            }
          }}>
            <label htmlFor={`${id}-question`}>{copy.question}</label>
            <textarea ref={questionInput} id={`${id}-question`} placeholder={copy.placeholder} value={question} disabled={submitting}
              onChange={(event) => { setQuestion(event.target.value); setStatus(null); }} />
            <p className="module-question-hint">{copy.hint}</p>
            <button type="submit" className="module-question-submit" disabled={!question.trim() || submitting || !onAsk}>{submitting ? copy.submitting : copy.submit}</button>
            {status ? <div role={status === 'error' ? 'alert' : 'status'}>{status === 'error' ? copy.error : <>{copy.saved}<a href="#/captures" onClick={close}>{copy.queue}</a></>}</div> : null}
          </form> : <div className="module-action-options">
            <button type="button" disabled={!primary || primary.disabled} onClick={() => { if (!primary || primary.disabled) return; close(); primary.onClick(); }}><Shuffle size={20} aria-hidden="true" /><span>{copy.random}</span></button>
            <button type="button" disabled={!contentActions.some((action) => !action.disabled)} onClick={() => setPanel('content')}><ListFilter size={20} aria-hidden="true" /><span>{copy.byContent}</span></button>
            {onAsk ? <button type="button" onClick={() => setPanel('ask')}><MessageCircle size={20} aria-hidden="true" /><span>{copy.ask}</span></button> : null}{actions.length ? <div className="module-context-actions"><p>{copy.actions}</p>{actionButtons}</div> : null}
          </div>}
        </div>
      </> : null}
    </dialog>
  </div>;
}
