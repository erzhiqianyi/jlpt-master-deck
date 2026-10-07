import type { AppRoute, AppView, StudyPage } from '../types';
import type { OfficialSampleModule } from '../data/officialModuleSamples';
import { migrateNewsHash } from './mockExam.mjs';
import { replayRouteAttemptId } from './attemptReplay';

export function routeFromHash(hash: string): AppRoute {
  hash = migrateNewsHash(hash) ?? hash;
  const [viewValue, pageValue, itemValue, detailValue] = hash.replace(/^#\/?/, '').split('/');
  const view = isAppView(viewValue) ? viewValue : 'home';
  if (view === 'plan') {
    return { view, page: 'questions', itemId: pageValue === 'textbooks' ? pageValue : undefined };
  }
  if (view === 'market' || view === 'question-types') {
    return { view, page: 'questions', itemId: pageValue ? decodeURIComponent(pageValue) : undefined };
  }
  if (view === 'mock-exams') {
    return { view, page: 'questions', itemId: pageValue ? decodeURIComponent(pageValue) : undefined };
  }
  if (view === 'news-cycle') {
    return { view, page: 'questions', itemId: pageValue ? decodeURIComponent(pageValue) : undefined };
  }
  if (view === 'history') {
    return { view, page: 'questions', itemId: ['today', 'history'].includes(pageValue) ? pageValue : undefined };
  }
  if (view === 'about' || view === 'settings') {
    return { view, page: 'questions', itemId: pageValue ? decodeURIComponent(pageValue) : undefined };
  }
  if (view === 'profile') {
    return { view, page: 'questions' };
  }
  if (isOfficialSampleModule(view) && pageValue === 'samples') {
    return { view, page: 'samples', itemId: itemValue ? decodeURIComponent(itemValue) : undefined };
  }
  if (view === 'mixed') {
    if (pageValue === 'tips' && itemValue === 'opinion' && detailValue) {
      return { view, page: 'tips', itemId: `opinion/${detailValue}` };
    }
    const page = pageValue === 'questions' || pageValue === 'review' || pageValue === 'mock' || pageValue === 'words' ? pageValue : 'tips';
    const itemId = (page === 'words' || ((page === 'questions' || page === 'review') && (itemValue === 'type-session' || replayRouteAttemptId(itemValue ? decodeURIComponent(itemValue) : undefined)))) && itemValue
      ? decodeURIComponent(itemValue)
      : page === 'tips' && ['topics', 'types', 'dialogue', 'opinion'].includes(itemValue)
        ? itemValue
        : undefined;
    if (page === 'tips' && !itemId) return { view: 'home', page: 'questions' };
    return { view, page, itemId };
  }
  if (view === 'daily-practice') {
    const page = pageValue === 'review' ? 'review' : 'questions';
    return { view, page, itemId: itemValue ? decodeURIComponent(itemValue) : undefined };
  }
  if (supportsStudyPage(view) && !pageValue) {
    return { view, page: defaultDesktopStudyPage(view) };
  }
  const page = pageValue === 'tips' || pageValue === 'words' || pageValue === 'wordbooks' || pageValue === 'review' || (view === 'grammar' && pageValue === 'bank') ? pageValue : 'questions';
  const itemId = (page === 'tips' || page === 'words' || (itemValue === 'type-session' && ['questions', 'review'].includes(page))) && itemValue ? decodeURIComponent(itemValue) : undefined;
  return { view, page: supportsStudyPage(view) && (page !== 'wordbooks' || view === 'vocabulary' || view === 'grammar') ? page : 'questions', itemId };
}

export function routeHash(view: AppView, page: StudyPage, itemId?: string) {
  if (view === 'mixed' && page === 'tips' && !itemId) return '#/home';
  if (view === 'mixed' && page === 'tips' && itemId?.startsWith('opinion/')) return `#/mixed/tips/${itemId}`;
  if (view === 'plan') {
    return itemId ? `#/plan/${encodeURIComponent(itemId)}` : '#/plan';
  }
  if (view === 'history') {
    return itemId ? `#/history/${encodeURIComponent(itemId)}` : '#/history';
  }
  if (view === 'market' || view === 'question-types') {
    return itemId ? `#/${view}/${encodeURIComponent(itemId)}` : `#/${view}`;
  }
  if (view === 'mock-exams') {
    return itemId ? `#/mock-exams/${encodeURIComponent(itemId)}` : '#/mock-exams';
  }
  if (view === 'news-cycle') {
    return migrateNewsHash(itemId ? `#/news-cycle/${encodeURIComponent(itemId)}` : '#/news-cycle')!;
  }
  if (view === 'about') {
    return itemId ? `#/about/${encodeURIComponent(itemId)}` : '#/about';
  }
  if (view === 'profile') {
    return '#/profile';
  }
  if (view === 'settings') {
    return itemId ? `#/settings/${encodeURIComponent(itemId)}` : '#/settings';
  }
  if (isOfficialSampleModule(view) && page === 'samples') {
    return itemId ? `#/${view}/samples/${encodeURIComponent(itemId)}` : `#/${view}/samples`;
  }
  if (itemId === 'type-session' && supportsStudyPage(view) && (page === 'questions' || page === 'review')) return `#/${view}/${page}/${itemId}`;
  if (view === 'mixed' && replayRouteAttemptId(itemId) && (page === 'questions' || page === 'review')) return `#/${view}/${page}/${encodeURIComponent(itemId!)}`;
  if (view === 'daily-practice' && itemId) return `#/${view}/${page}/${encodeURIComponent(itemId)}`;
  if (!supportsStudyPage(view)) {
    return `#/${view}`;
  }
  return itemId && (page === 'tips' || page === 'words') ? `#/${view}/${page}/${encodeURIComponent(itemId)}` : `#/${view}/${page}`;
}

export function supportsStudyPage(view: AppView) {
  return view === 'vocabulary' || view === 'grammar' || view === 'mixed' || view === 'daily-practice' || view === 'reading' || view === 'listening';
}

export function isOfficialSampleModule(view: AppView): view is OfficialSampleModule {
  return view === 'grammar' || view === 'reading' || view === 'listening';
}

export function isAppView(value: string): value is AppView {
  return ['study', 'market', 'capture', 'captures', 'home', 'memory-review', 'history', 'mistakes', 'memory', 'data', 'mcp', 'insights', 'plan', 'question-types', 'vocabulary', 'grammar', 'listening', 'reading', 'mixed', 'daily-practice', 'mock-exams', 'news-cycle', 'drafts', 'about', 'profile', 'settings'].includes(value);
}

export function defaultDesktopStudyPage(view: AppView): StudyPage {
  if (view === 'daily-practice') return 'questions';
  return view === 'vocabulary' || view === 'grammar' || view === 'listening' || view === 'reading' ? 'words' : 'tips';
}

export function mobileBackRoute(route: AppRoute): AppRoute {
  if (route.view === 'mixed' && replayRouteAttemptId(route.itemId)) return { view: 'history', page: 'questions', itemId: 'history' };
  if (route.view === 'plan' && route.itemId) return { view: route.itemId === 'textbooks' ? 'home' : 'plan', page: 'questions' };
  if (route.view === 'market' && route.itemId) return { view: 'market', page: 'questions' };
  if (route.view === 'mixed' && route.page === 'tips' && route.itemId?.startsWith('opinion/')) return { view: 'mixed', page: 'tips', itemId: 'opinion' };
  if (route.view === 'history' && route.itemId) return { view: 'history', page: 'questions' };
  if (route.view === 'mixed' && route.page === 'tips' && route.itemId) return { view: 'mixed', page: 'tips' };
  if (['vocabulary', 'grammar', 'listening', 'reading'].includes(route.view)) {
    if (route.itemId) return { view: route.view, page: route.page };
    if (route.page !== 'words') return { view: route.view, page: 'words' };
    return { view: 'study', page: 'questions' };
  }

  if (route.view === 'mock-exams' && route.itemId) {
    return { view: 'mock-exams', page: 'questions', itemId: /^(week|custom):/.test(route.itemId) && route.itemId.split(':').length > 2 ? route.itemId.split(':').slice(0, 2).join(':') : undefined };
  }
  if (route.view === 'mock-exams') {
    return { view: 'home', page: 'questions' };
  }
  if (route.view === 'news-cycle' && route.itemId) {
    return { view: 'news-cycle', page: 'questions' };
  }
  if (route.view === 'news-cycle') {
    return { view: 'home', page: 'questions' };
  }
  if (route.view === 'mixed' && route.page !== 'tips') {
    return { view: 'home', page: 'questions' };
  }
  if (route.view === 'daily-practice') {
    return { view: 'home', page: 'questions' };
  }
  if ((route.view === 'vocabulary' || route.view === 'grammar') && route.page === 'wordbooks') {
    return { view: route.view, page: 'words' };
  }
  if (route.itemId && route.page === 'words' && ['vocabulary', 'grammar'].includes(route.view)) {
    return { view: route.view, page: 'words' };
  }
  if (['vocabulary', 'grammar', 'listening', 'reading', 'question-types'].includes(route.view)) {
    return { view: 'home', page: 'questions' };
  }
  if (route.view === 'captures') {
    return { view: 'history', page: 'questions' };
  }
  if (['history', 'insights', 'captures', 'capture', 'drafts', 'mistakes', 'memory'].includes(route.view)) {
    return { view: 'mixed', page: 'tips' };
  }
  if (route.view === 'settings' && route.itemId) {
    return { view: 'settings', page: 'questions' };
  }
  if (route.view === 'about' && route.itemId?.startsWith('guide-')) return { view: 'about', page: 'questions', itemId: 'guide' };
  if (route.view === 'about' && route.itemId) {
    return { view: 'about', page: 'questions' };
  }
  return { view: 'home', page: 'questions' };
}

export function desktopBackRoute(route: AppRoute): AppRoute | null {
  if (route.view === 'mixed' && replayRouteAttemptId(route.itemId)) return { view: 'history', page: 'questions', itemId: 'history' };
  if (['vocabulary', 'grammar', 'listening', 'reading'].includes(route.view)) return mobileBackRoute(route);

  if (route.view === 'home') {
    return null;
  }
  if (route.view === 'history') {
    return route.itemId ? { view: 'history', page: 'questions' } : null;
  }
  if (route.itemId) {
    return { view: route.view, page: route.page };
  }
  if (supportsStudyPage(route.view) && route.page !== defaultDesktopStudyPage(route.view)) {
    return { view: route.view, page: defaultDesktopStudyPage(route.view) };
  }
  if (['vocabulary', 'grammar', 'listening', 'reading', 'mixed', 'daily-practice'].includes(route.view)) {
    return { view: 'home', page: 'questions' };
  }
  if (route.view === 'question-types') {
    return { view: 'home', page: 'questions' };
  }
  if (route.view === 'mock-exams') {
    return { view: 'home', page: 'questions' };
  }
  if (route.view === 'news-cycle') {
    return route.itemId ? { view: 'news-cycle', page: 'questions' } : { view: 'home', page: 'questions' };
  }
  if (route.view === 'captures') {
    return { view: 'history', page: 'questions' };
  }
  if (['history', 'insights', 'capture', 'drafts', 'mistakes', 'memory'].includes(route.view)) {
    return { view: 'mixed', page: 'tips' };
  }
  return { view: 'home', page: 'questions' };
}
