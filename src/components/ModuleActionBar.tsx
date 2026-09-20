import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

export type ModuleAction = { key: string; label: string; icon?: ReactNode; onClick: () => void; active?: boolean };

/* One primary CTA plus a row of secondary actions; sits above a module's list so the page always has content. */
export function ModuleActionBar({ title, label, count, primary, actions = [], children }: {
  title?: string;
  label: string;
  count?: string;
  primary?: { label: string; hint?: string; onClick: () => void };
  actions?: ModuleAction[];
  children?: ReactNode;
}) {
  return (
    <div className="module-action-bar" aria-label={`${label}操作`}>
      {title ? (
        <div className="module-action-bar-heading">
          <h2>{title}</h2>
          {count ? <span>{count}</span> : null}
        </div>
      ) : null}
      <div className="module-action-bar-actions">
        {primary ? (
          <button type="button" className="module-action-primary" onClick={primary.onClick}>
            <strong>{primary.label}</strong>
            {primary.hint ? <small>{primary.hint}</small> : null}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        ) : null}
        {actions.map((action) => (
          <button key={action.key} type="button" className={`module-action-secondary${action.active ? ' is-active' : ''}`} aria-pressed={action.active} onClick={action.onClick}>
            {action.icon}
            <span>{action.label}</span>
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
