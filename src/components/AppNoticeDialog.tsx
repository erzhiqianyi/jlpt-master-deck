import { useEffect, useRef } from 'react';

const validationPrefix = '解析质量校验未通过：';
const validationHint = '请逐项说明含义或接续，以及与本题线索的具体关系。';

export function AppNoticeDialog({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const isValidation = message.startsWith(validationPrefix);
  const problems = isValidation
    ? message.slice(validationPrefix.length).replace(validationHint, '').replace(/。$/, '').split('；').filter(Boolean)
    : [];
  const groups = new Map<string, string[]>();
  for (const problem of problems) {
    const match = problem.match(/^(第\s*\d+\s*题)\s*(.*)$/u);
    const title = match?.[1] ?? '其他问题';
    groups.set(title, [...(groups.get(title) ?? []), match?.[2] ?? problem]);
  }

  useEffect(() => {
    if (!message) return;
    const element = dialog.current;
    if (!element?.open) element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = previous;
    };
  }, [message]);

  return <dialog ref={dialog} className="app-confirmation app-notice" aria-labelledby="app-notice-title" aria-describedby="app-notice-description"
    onCancel={(event) => { event.preventDefault(); onDismiss(); }}>
    <div className="app-notice-content">
      <div className="app-confirmation-body">
        <h2 id="app-notice-title">{isValidation ? '题目解析需要补充' : '提示'}</h2>
        <p id="app-notice-description">{isValidation ? `发现 ${problems.length} 处解析不完整，请补充后重试。` : message}</p>
        {isValidation && <details key={message} className="app-notice-details">
          <summary>查看问题详情（{problems.length}）</summary>
          <p>{validationHint}</p>
          {[...groups].map(([title, entries]) => <section key={title}>
            <h3>{title}</h3>
            <ul>{entries.map((entry, index) => <li key={index}>{entry}</li>)}</ul>
          </section>)}
        </details>}
      </div>
    </div>
    <footer><button type="button" className="is-primary" autoFocus onClick={onDismiss}>知道了</button></footer>
  </dialog>;
}
