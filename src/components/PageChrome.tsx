import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

export type PageHeaderAction = { key: string; label: string; content?: ReactNode; icon?: ReactNode; onClick: () => void; disabled?: boolean };
type Registration = { id: string; priority: number; actions: () => PageHeaderAction[] };
const PageChrome = createContext<{ register: (entry: Registration) => () => void; entries: Registration[] } | null>(null);

/** A page owns its header actions. Registrations disappear with that page, including local subpages. */
export function PageChromeProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Registration[]>([]);
  const register = useCallback((entry: Registration) => {
    setEntries(current => [...current.filter(item => item.id !== entry.id), entry]);
    return () => setEntries(current => current.filter(item => item.id !== entry.id));
  }, []);
  const value = useMemo(() => ({ register, entries }), [register, entries]);
  return <PageChrome.Provider value={value}>{children}</PageChrome.Provider>;
}

export function usePageHeaderActions(actions: PageHeaderAction[], priority = 0) {
  const context = useContext(PageChrome);
  const register = context?.register;
  const id = useId();
  const current = useRef(actions);
  current.current = actions;
  const signature = actions.map(action => `${action.key}:${action.label}:${Boolean(action.disabled)}`).join('|');
  useEffect(() => {
    if (!register || !signature) return;
    return register({ id, priority, actions: () => current.current });
  }, [register, id, priority, signature]);
  return Boolean(context);
}

export function PageHeaderActions() {
  const context = useContext(PageChrome);
  if (!context?.entries.length) return null;
  const highest = Math.max(...context.entries.map(entry => entry.priority));
  const actions = context.entries.filter(entry => entry.priority === highest).flatMap(entry => entry.actions());
  return <div className="page-header-actions">{actions.map(action => action.content ? <div key={action.key} className="page-header-control">{action.content}</div> : <button key={action.key} type="button" className="page-header-action" aria-label={action.label} title={action.label} disabled={action.disabled} onClick={action.onClick}>{action.icon ? <span aria-hidden="true">{action.icon}</span> : action.label}</button>)}</div>;
}
