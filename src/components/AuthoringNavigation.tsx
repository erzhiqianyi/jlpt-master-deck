import { createContext, useContext, useEffect, useRef } from 'react';

export type AuthoringLocation = { label: string; close: () => void };
export const AuthoringNavigation = createContext<(location: AuthoringLocation | null) => void>(() => {});

// Keep navigation separate from form data: returning to the library preserves drafts.
export function useAuthoringNavigation(label: string | null, close: () => void) {
  const publish = useContext(AuthoringNavigation);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    publish(label ? { label, close: () => closeRef.current() } : null);
    return () => publish(null);
  }, [label, publish]);
}
