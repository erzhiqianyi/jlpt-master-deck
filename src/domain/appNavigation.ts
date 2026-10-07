import type { AppRoute, AppView } from '../types';

export const primaryNavigationViews = ['home', 'market', 'history', 'study'] as const;

/** Only the four destination roots expose phone tabs. Local screens take precedence. */
export function isPrimaryNavigationRoot(route: AppRoute, hasLocalScreen = false) {
  if (hasLocalScreen || route.itemId) return false;
  if (route.view === 'mixed') return false;
  return ['home', 'market', 'history', 'study'].includes(route.view) && route.page === 'questions';
}

/** A single semantic parent for every viewport, independent of display breadcrumbs. */
export function contextualBackRoute(route: AppRoute, { dailyPracticeIsTopic = false }: { dailyPracticeIsTopic?: boolean } = {}): AppRoute | null {
  if (isPrimaryNavigationRoot(route)) return null;
  if (route.view === 'mixed') {
    if (route.itemId?.startsWith('replay:')) return { view: 'history', page: 'questions', itemId: 'history' };
    if (route.page === 'tips' && route.itemId?.startsWith('opinion/')) return { view: 'mixed', page: 'tips', itemId: 'opinion' };
    if (route.page === 'words') return { view: 'study', page: 'questions' };
    if (route.page === 'review') return { view: 'mixed', page: 'questions', ...(route.itemId === 'type-session' ? { itemId: route.itemId } : {}) };
    return { view: 'home', page: 'questions' };
  }
  if (['vocabulary', 'grammar', 'reading', 'listening'].includes(route.view)) {
    if (route.itemId) return { view: route.view, page: route.page };
    if (route.page === 'review' && ['vocabulary', 'grammar'].includes(route.view)) return { view: route.view, page: 'questions' };
    return route.page === 'words' ? { view: 'study', page: 'questions' } : { view: route.view, page: 'words' };
  }
  if (route.view === 'market' || route.view === 'history' || route.view === 'settings') {
    if (route.itemId) return { view: route.view, page: 'questions' };
  }
  if (route.view === 'question-types') return route.itemId ? { view: 'question-types', page: 'questions' } : { view: 'study', page: 'questions' };
  if (route.view === 'mock-exams') {
    if (route.itemId) return { view: 'mock-exams', page: 'questions', itemId: /^custom:/.test(route.itemId) && route.itemId.split(':').length > 2 ? route.itemId.split(':').slice(0, 2).join(':') : undefined };
    return { view: 'home', page: 'questions' };
  }
  if (route.view === 'daily-practice') return route.page === 'review'
    ? { view: 'daily-practice', page: 'questions', itemId: route.itemId }
    : dailyPracticeIsTopic ? { view: 'mixed', page: 'tips', itemId: 'topics' } : { view: 'home', page: 'questions' };
  if (route.view === 'capture') return { view: 'captures', page: 'questions' };
  if (route.view === 'drafts') return { view: 'home', page: 'questions' };
  if (['captures', 'mistakes', 'memory', 'data', 'insights'].includes(route.view)) return { view: 'history', page: 'questions' };
  if (route.view === 'plan' && route.itemId) return { view: 'plan', page: 'questions' };
  if (route.view === 'about' && route.itemId?.startsWith('guide-')) return { view: 'about', page: 'questions', itemId: 'guide' };
  if (route.view === 'about' && route.itemId) return { view: 'about', page: 'questions' };
  return { view: 'home', page: 'questions' };
}

/** Primary destination is based on the task, not just the module in the URL. */
export function primaryNavigationView(route: AppRoute): AppView {
  if (['vocabulary', 'grammar', 'reading', 'listening'].includes(route.view)) {
    return route.page === 'questions' || route.page === 'review' ? 'home' : 'study';
  }
  if (['daily-practice', 'mock-exams', 'memory-review'].includes(route.view)) return 'home';
  if (route.view === 'question-types' || (route.view === 'mixed' && route.page === 'words')) return 'study';
  if (route.view === 'drafts') return 'home';
  if (['captures', 'capture', 'mistakes', 'insights', 'memory', 'data'].includes(route.view)) return 'history';
  if (['plan', 'settings', 'profile', 'about', 'mcp'].includes(route.view)) return 'home';
  return route.view === 'mixed' ? 'home' : route.view;
}

/** Legacy focused-task classification; primary tab visibility uses isPrimaryNavigationRoot. */
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
