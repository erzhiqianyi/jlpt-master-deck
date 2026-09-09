import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function getSnapshot() {
  return window.location.hash;
}

// Keep the URL as the single source of truth. Parse it during render, rather
// than retaining a parsed route (or an old parser) in a hashchange closure.
export function useBrowserHash() {
  return useSyncExternalStore(subscribe, getSnapshot, () => '');
}
