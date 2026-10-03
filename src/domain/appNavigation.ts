import type { AppRoute, AppView } from '../types';

export const primaryNavigationViews = ['home', 'mixed', 'market', 'history', 'study'] as const;

/** Primary destination is based on the task, not just the module in the URL. */
export function primaryNavigationView(route: AppRoute): AppView {
  if (['vocabulary', 'grammar', 'reading', 'listening'].includes(route.view)) {
    return route.page === 'questions' || route.page === 'review' ? 'mixed' : 'study';
  }
  if (['daily-practice', 'mock-exams', 'news-cycle', 'memory-review'].includes(route.view)) return 'mixed';
  if (route.view === 'question-types' || (route.view === 'mixed' && route.page === 'words')) return 'study';
  if (['captures', 'capture', 'drafts', 'mistakes', 'insights', 'memory', 'data'].includes(route.view)) return 'history';
  if (['plan', 'settings', 'profile', 'about', 'mcp'].includes(route.view)) return 'home';
  return route.view;
}

/** Browsing keeps global destinations; answering, authoring and memorizing are focused. */
export function isImmersiveRoute(route: AppRoute) {
  if (route.view === 'memory-review' || route.view === 'capture' || route.view === 'daily-practice') return true;
  if (['vocabulary', 'grammar', 'reading', 'listening', 'mixed'].includes(route.view)) {
    return route.page === 'questions' || route.page === 'review' || route.page === 'mock'
      || (route.page === 'samples' && Boolean(route.itemId))
      || (['reading', 'listening'].includes(route.view) && route.page === 'words' && Boolean(route.itemId));
  }
  return route.view === 'mock-exams' && Boolean(route.itemId);
}

export function adjacentEntryId(items: Array<{ id: string }>, currentId: string | undefined, offset: number) {
  if (!items.length) return undefined;
  const index = items.findIndex((item) => item.id === currentId);
  if (index < 0) return undefined;
  return items[(index + offset + items.length) % items.length]?.id;
}
