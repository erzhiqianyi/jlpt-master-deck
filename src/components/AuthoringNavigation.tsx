import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';

type NavigationOptions = { kind?: 'detail' | 'form' | 'practice'; priority?: number; backLabel?: string };
export type AuthoringLocation = { label: string; close: () => void } & NavigationOptions;
type Registration = (owner: symbol, location: AuthoringLocation | null) => void;
export const AuthoringNavigation = createContext<Registration>(() => {});

/** Removing a child restores its parent; unrelated cleanup cannot clear another screen. */
export function createNavigationRegistry(onChange: (location: AuthoringLocation | null) => void) {
  const entries = new Map<symbol, { location: AuthoringLocation; order: number }>();
  let order = 0;
  return (owner: symbol, location: AuthoringLocation | null) => {
    if (location) entries.set(owner, { location, order: ++order });
    else if (!entries.delete(owner)) return;
    const current = [...entries.values()].sort((a, b) => (b.location.priority ?? 0) - (a.location.priority ?? 0) || b.order - a.order)[0];
    onChange(current?.location ?? null);
  };
}

export function AuthoringNavigationProvider({ children, onChange }: { children: ReactNode; onChange: (location: AuthoringLocation | null) => void }) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const registry = useRef<Registration | null>(null);
  if (!registry.current) registry.current = createNavigationRegistry((location) => onChangeRef.current(location));
  const register = useCallback<Registration>((owner, location) => registry.current?.(owner, location), []);
  return <AuthoringNavigation.Provider value={register}>{children}</AuthoringNavigation.Provider>;
}

// Keep navigation separate from form data: returning to the library preserves drafts.
export function useAuthoringNavigation(label: string | null, close: () => void, { kind = 'form', priority = 0, backLabel }: NavigationOptions = {}) {
  const publish = useContext(AuthoringNavigation);
  const owner = useRef(Symbol('local-navigation'));
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!label) return;
    publish(owner.current, { label, kind, priority, backLabel, close: () => closeRef.current() });
    return () => publish(owner.current, null);
  }, [label, kind, priority, backLabel, publish]);
}
