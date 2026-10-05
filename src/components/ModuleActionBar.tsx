import { type ReactNode } from 'react';

export type ModuleAction = {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  hint?: string;
};

/** Module heading and inline actions. Shortcut entry points are pending redesign. */
export function ModuleActionBar({ title, label, count, primary, actions = [], children, shortcuts = false, locale = 'zh-CN' }: {
  shortcuts?: boolean;
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
  const actionsLabel = locale === 'ja' ? '操作' : locale === 'en' ? 'Actions' : '操作';
  return <div className="module-action-bar" role="group" aria-label={`${label} · ${actionsLabel}`}>
    {title ? <div className="module-action-bar-heading"><h2>{title}</h2>{count ? <span>{count}</span> : null}</div> : null}
    {!primary && !shortcuts && actions.length ? <div className="module-context-actions">{actions.map((action) => <button
      key={action.key}
      type="button"
      className={`module-action-secondary${action.active ? ' is-active' : ''}`}
      aria-pressed={action.active}
      disabled={action.disabled}
      title={action.hint}
      onClick={action.onClick}
    >{action.icon ? <span aria-hidden="true">{action.icon}</span> : null}<span>{action.label}</span></button>)}</div> : null}
    {children}
  </div>;
}
