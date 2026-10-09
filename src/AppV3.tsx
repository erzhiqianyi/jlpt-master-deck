// アプリの外枠（v3）：ログイン、ナビゲーション、設定の読み込みと保存、検索、各画面への振り分け。画面の中身はそれぞれ /api/v3 から読む。
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createV3Client } from './v3/client';
import { fontSizeOf, type V3Settings, type V3SettingsPatch } from './v3/types';
import { apiRequest } from './lib/api';
import { configureFirebase, googleIdToken, firebaseLogout } from './lib/firebase';
import { translations } from './i18n/translations';
import { useBrowserHash } from './hooks/useBrowserHash';
import { routeFromHash, routeHash, isBankModule, isPracticeItem, isOfficialSampleModule } from './domain/appRoutes';
import { contextualBackRoute, isPrimaryNavigationRoot, primaryNavigationView, primaryNavigationViews } from './domain/appNavigation';
import type { QuestionTypeSection } from './data/questionTypes';
import type { AppRoute, AppView, AuthUser, CustomQuestionTypeTip, Locale, SearchResult, StudyPage } from './types';
import { SpeechProvider } from './components/SpeechControls';
import { PageChromeProvider } from './components/PageChrome';
import { AuthoringNavigationProvider, type AuthoringLocation } from './components/AuthoringNavigation';
import { AppNoticeDialog } from './components/AppNoticeDialog';
import { LoginScreen, PublicGuideRedirect } from './features/auth/LoginScreen';
import { PublicIntroPanel } from './features/about/PublicIntroPanel';
import { AboutPanel, aboutSectionTitle, isAboutSection } from './features/about/AboutPanel';
import { AgentConsentPage, isAgentConsentPage } from './features/agents/AgentConsentPage';
import { DesktopPageHeader, DesktopSidebarNavigation, MobileAppHeader, MobileBottomNavigation } from './features/navigation/MobileNavigation';
import { GlobalSearch } from './features/search/GlobalSearch';
import { HomeToday } from './features/home/HomeToday';
import { StudyHub } from './features/home/StudyHub';
import { KnowledgeLibrary } from './features/library/KnowledgeLibrary';
import { QuestionBank } from './features/question-bank/QuestionBank';
import { PracticeArea } from './features/practice/PracticeArea';
import { CardReview } from './features/practice/CardReview';
import { StudyStats } from './features/practice/StudyStats';
import { InboxView, DraftsView, PlanView, ReportsView, MarketView } from './features/activity/ActivityViews';
import { SettingsView } from './features/settings/SettingsView';
import { QuestionTypeGuide } from './features/question-types/QuestionTypeGuide';
import { QuestionTypeDetail } from './features/question-types/QuestionTypeDetail';
import { OfficialModuleSamples } from './features/official-samples/OfficialModuleSamples';
import './features/home/LightWorkspace.css';

const remoteApiOrigin = import.meta.env.DEV ? import.meta.env.VITE_API_ORIGIN : '';
const STORAGE_TOKEN = remoteApiOrigin ? `jlpt-auth-token-v1:${remoteApiOrigin}` : 'jlpt-auth-token-v1';
const DEV_AUTH_TOKEN = import.meta.env.DEV && !remoteApiOrigin ? import.meta.env.VITE_DEV_AUTH_TOKEN : undefined;
const LOGIN_LOCALE_KEY = 'jlpt-login-locale';
const SIDEBAR_KEY = 'jlpt.sidebar.collapsed';
const CUSTOM_TIP = 'custom-';

const readStorage = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const writeStorage = (key: string, value: string | null) => { try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* Storage may be unavailable. */ } };
const asLocale = (value: string | null | undefined): Locale | null => (value === 'zh-CN' || value === 'ja' || value === 'en' ? value : null);
const go = (view: AppView, page: StudyPage = 'questions', itemId?: string) => { window.location.hash = routeHash(view, page, itemId); };

const NAV_TITLES: Record<Locale, string[]> = { 'zh-CN': ['学习', '发现', '统计', '题库'], ja: ['学習', '発見', '統計', '問題集'], en: ['Learn', 'Discover', 'Statistics', 'Library'] };
const SECTION_OF: Partial<Record<AppView, QuestionTypeSection>> = { vocabulary: 'vocabulary', grammar: 'grammar', reading: 'reading', listening: 'listening' };

/** 設定の「自分の問題形式メモ」を問題形式の案内で使う形にする（id は custom-<rid>）。 */
function customTipEntries(settings: V3Settings): CustomQuestionTypeTip[] {
  return settings.customTips.map((tip) => ({ ...tip, id: `${CUSTOM_TIP}${tip.id}`, section: tip.section as QuestionTypeSection, description: tip.description ?? '' }));
}
const customTipList = (settings: V3Settings) => settings.customTips.map(({ id, section, title, description, tip }) => ({ id, section, title, description, tip }));

export default function AppV3() {
  const [token, setToken] = useState(() => readStorage(STORAGE_TOKEN) ?? DEV_AUTH_TOKEN ?? '');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [settings, setSettings] = useState<V3Settings | null>(null);
  const [authMode, setAuthMode] = useState<'local' | 'firebase' | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(token));
  const [authError, setAuthError] = useState('');
  const [notice, setNotice] = useState('');
  const [loginLocale, setLoginLocale] = useState<Locale>(() => asLocale(readStorage(LOGIN_LOCALE_KEY)) ?? 'zh-CN');
  const [firebaseLinked, setFirebaseLinked] = useState(true);
  const [authoring, setAuthoring] = useState<AuthoringLocation | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readStorage(SIDEBAR_KEY) === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const route = routeFromHash(useBrowserHash());
  const client = useMemo(() => (token ? createV3Client(token) : null), [token]);
  const locale: Locale = asLocale(settings?.uiLanguage) ?? loginLocale;
  const labels = translations[locale];

  useEffect(() => {
    apiRequest<{ mode: 'local' | 'firebase'; firebase: import('firebase/app').FirebaseOptions | null }>('/api/auth/config')
      .then((config) => { if (config.firebase) configureFirebase(config.firebase); setAuthMode(config.mode); })
      .catch(() => setAuthError('无法读取登录配置，请刷新页面重试'));
  }, []);

  // ログイン状態と設定を読む
  useEffect(() => {
    if (!token || !client) { setUser(null); setSettings(null); setAuthLoading(false); return; }
    let cancelled = false;
    setAuthLoading(true);
    Promise.all([apiRequest<{ user: AuthUser }>('/api/me', { token }), client.settings()])
      .then(([me, loaded]) => { if (!cancelled) { setUser(me.user); setSettings(loaded); writeStorage(LOGIN_LOCALE_KEY, loaded.uiLanguage); } })
      .catch(() => { if (!cancelled) { writeStorage(STORAGE_TOKEN, null); setToken(''); } })
      .finally(() => { if (!cancelled) setAuthLoading(false); });
    return () => { cancelled = true; };
  }, [token, client]);

  useEffect(() => {
    if (!token || authMode !== 'firebase') return;
    apiRequest<{ uid: string | null }>('/api/auth/firebase/status', { token }).then((s) => setFirebaseLinked(Boolean(s.uid))).catch(() => undefined);
  }, [token, authMode]);

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  useEffect(() => {
    if (!settings) return;
    document.documentElement.dataset.fontSize = fontSizeOf(settings.fontScale);
    return () => { delete document.documentElement.dataset.fontSize; };
  }, [settings]);

  // 検索：知識点（見出し語・読み・意味）と題組（問題文）
  useEffect(() => {
    const q = searchQuery.trim();
    if (!client || !searchOpen || !q) { setSearchResults([]); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.all([client.lookup(q), client.questionGroups({ q, limit: 30 })]).then(([items, groups]) => {
        if (cancelled) return;
        const moduleLabel = (view: SearchResult['view']) => ({ vocabulary: labels.navVocabulary, grammar: labels.navGrammar, reading: labels.navReading, listening: labels.navListening })[view];
        setSearchResults([
          ...items.map((item, i): SearchResult => {
            const view = item.kind === 'grammar' ? 'grammar' : 'vocabulary';
            return { id: item.code, view, title: item.expression, subtitle: [item.reading, item.meaning?.text].filter(Boolean).join(' · '), moduleLabel: moduleLabel(view), matches: [], score: 1000 - i };
          }),
          ...groups.items.map((group, i): SearchResult => ({
            id: group.code, view: group.module, title: group.questions[0]?.prompt ?? group.labelJa, subtitle: `${group.code} · ${group.labelJa}`, moduleLabel: moduleLabel(group.module), matches: [], score: 500 - i,
          })),
        ]);
      }).catch(() => undefined);
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [client, searchOpen, searchQuery, labels]);

  const navigate = useCallback((view: AppView, page?: StudyPage, itemId?: string) => {
    authoring?.close();
    go(view, page ?? (view === 'vocabulary' || view === 'grammar' ? 'words' : view === 'reading' || view === 'listening' ? 'bank' : 'questions'), itemId);
  }, [authoring]);

  const updateSettings = useCallback((patch: V3SettingsPatch) => {
    if (!client) return;
    client.updateSettings(patch).then((next) => { setSettings(next); writeStorage(LOGIN_LOCALE_KEY, next.uiLanguage); })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)));
  }, [client]);

  function signedIn(session: { user: AuthUser; token: string }) {
    writeStorage(STORAGE_TOKEN, session.token);
    setToken(session.token);
    setUser(session.user);
  }
  async function handleAuth(mode: 'login' | 'register', username: string, password: string) {
    setAuthLoading(true); setAuthError('');
    try { signedIn(await apiRequest<{ user: AuthUser; token: string }>(`/api/auth/${mode}`, { method: 'POST', body: { username, password } })); }
    catch (error) { setAuthError(error instanceof Error ? error.message : 'Authentication failed'); setAuthLoading(false); }
  }
  async function handleGoogleLogin(link = false) {
    setAuthLoading(true); setAuthError('');
    try {
      const idToken = await googleIdToken();
      signedIn(await apiRequest<{ user: AuthUser; token: string }>(link ? '/api/auth/firebase/link' : '/api/auth/firebase', { method: 'POST', token: link ? token : undefined, body: { idToken } }));
      if (link) { setFirebaseLinked(true); setNotice('已绑定 Google，原来的学习记录已保留。'); }
    } catch (error) { setAuthError(error instanceof Error ? error.message : 'Google 登录失败'); setAuthLoading(false); }
  }
  function handleLogout() {
    void firebaseLogout();
    if (token) apiRequest('/api/auth/logout', { method: 'POST', token }).catch(() => undefined);
    writeStorage(STORAGE_TOKEN, null);
    setToken(''); setUser(null); setSettings(null);
  }
  function changeLoginLocale(next: Locale) { writeStorage(LOGIN_LOCALE_KEY, next); setLoginLocale(next); }

  // 問題形式のメモ（公式の形式ごとのメモと、自分で足した形式）
  const tipActions = settings ? {
    customTips: settings.questionTypeTips,
    customTipEntries: customTipEntries(settings),
    onUpdateTip: (id: string, tip: string) => updateSettings({ questionTypeTips: { [id]: tip } }),
    onCreateCustomTip: async (input: { section: QuestionTypeSection; title: string; description: string; tip: string }) => {
      if (!client) return '';
      const before = new Set(settings.customTips.map((tip) => tip.id));
      const next = await client.updateSettings({ customTips: [...customTipList(settings), { section: input.section, title: input.title, description: input.description || null, tip: input.tip }] as V3Settings['customTips'] });
      setSettings(next);
      const created = next.customTips.find((tip) => !before.has(tip.id));
      return created ? `${CUSTOM_TIP}${created.id}` : '';
    },
    onUpdateCustomTip: (id: string, input: { title: string; description: string; tip: string }) => updateSettings({
      customTips: customTipList(settings).map((tip) => (`${CUSTOM_TIP}${tip.id}` === id ? { ...tip, title: input.title || tip.title, description: input.description || null, tip: input.tip } : tip)) as V3Settings['customTips'],
    }),
    onDeleteCustomTip: (id: string) => updateSettings({ customTips: customTipList(settings).filter((tip) => `${CUSTOM_TIP}${tip.id}` !== id) as V3Settings['customTips'] }),
  } : null;

  const consentPage = isAgentConsentPage();
  if (!user || !settings) {
    if (token && authLoading) return <main className="cute-shell light-workspace flex min-h-[100dvh] items-center justify-center" role="status" aria-busy="true">…</main>;
    const isPublicLanding = !consentPage && (!window.location.hash || window.location.hash === '#/');
    if (!consentPage && route.view === 'about' && route.itemId !== 'connect' && route.itemId !== 'agents') return <PublicGuideRedirect target={`${locale === 'zh-CN' ? '' : `/${locale}`}${route.itemId ? '/articles/ai-integration/' : '/community/'}`} />;
    if (isPublicLanding) return <PublicIntroPanel locale={locale} />;
    return <LoginScreen error={authError} loading={authLoading || authMode === null} onSubmit={handleAuth} firebase={authMode === 'firebase'} onGoogle={() => void handleGoogleLogin()} locale={locale} onLocaleChange={changeLoginLocale} />;
  }
  if (consentPage) return <AgentConsentPage authToken={token} username={user.username} />;
  if (route.view === 'memory-review') {
    return <SpeechProvider settings={settings} token={token} cacheScope={String(user.id)}><CardReview token={token} locale={locale} onExit={() => go('home')} /></SpeechProvider>;
  }

  const view = route.view;
  const page = route.page;
  const feedback = settings.feedbackMode;
  const practiceRoute = (target: AppView, targetPage: StudyPage = 'questions') => (itemId: string | null) => go(target, targetPage, itemId ?? undefined);
  const title = pageTitle(route, labels, locale);
  const primaryRoot = isPrimaryNavigationRoot(route, Boolean(authoring));
  const back = contextualBackRoute(route);
  const goBack = () => { if (authoring) { authoring.close(); return; } if (back) go(back.view, back.page, back.itemId); else go('home'); };
  const navItems = primaryNavigationViews.map((v, i) => ({ view: v as AppView, label: NAV_TITLES[locale][i] }));
  const sidebarItems = navItems.map((item) => (item.view === 'study' ? {
    ...item,
    children: [
      { view: 'vocabulary' as const, page: 'words' as const, label: labels.navVocabulary },
      { view: 'grammar' as const, page: 'words' as const, label: labels.navGrammar },
      { view: 'reading' as const, page: 'bank' as const, label: labels.navReading },
      { view: 'listening' as const, page: 'bank' as const, label: labels.navListening },
    ],
  } : item));
  const typeGuide = (section?: QuestionTypeSection, open = (id: string) => go('question-types', 'questions', id)) => tipActions && (route.itemId
    ? <QuestionTypeDetail id={route.itemId} labels={labels} locale={locale} customTip={settings.questionTypeTips[route.itemId]} customTipEntry={tipActions.customTipEntries.find((entry) => entry.id === route.itemId)}
      onBack={() => (section ? go(view, 'tips') : go('question-types'))} onUpdateTip={tipActions.onUpdateTip} onUpdateCustomTip={tipActions.onUpdateCustomTip} onDeleteCustomTip={tipActions.onDeleteCustomTip} />
    : <QuestionTypeGuide labels={labels} locale={locale} customTips={tipActions.customTips} customTipEntries={tipActions.customTipEntries} section={section} onOpen={open} onCreateCustomTip={tipActions.onCreateCustomTip} />);

  let content: ReactNode = null;
  if (view === 'home') content = <HomeToday token={token} locale={locale} onNavigate={navigate} onOpenDraft={(code) => go('drafts', 'questions', code)} />;
  else if (view === 'study') content = <StudyHub token={token} locale={locale} onNavigate={navigate} />;
  else if (isBankModule(view)) {
    const section = SECTION_OF[view];
    if (page === 'questions' || page === 'review') content = <PracticeArea key={view} token={token} locale={locale} module={view} itemId={isPracticeItem(route.itemId) ? route.itemId : undefined} feedback={feedback} onNavigate={practiceRoute(view)} />;
    else if (page === 'tips') content = typeGuide(section, (id) => go(view, 'tips', id));
    else if (page === 'samples' && isOfficialSampleModule(view)) content = <OfficialModuleSamples module={view} sampleId={route.itemId} labels={labels} locale={locale} token={token} onOpen={(id) => go(view, 'samples', id)} onBack={() => go(view, 'samples')} />;
    else if ((view === 'vocabulary' || view === 'grammar') && (page === 'words' || page === 'wordbooks')) {
      content = <KnowledgeLibrary token={token} locale={locale} family={view} page={page} code={page === 'words' ? route.itemId : undefined} showRomaji={settings.showRomaji}
        onOpen={(code) => go(view, 'words', code ?? undefined)} onManageWordbooks={() => go(view, 'wordbooks')} />;
    } else content = <QuestionBank token={token} locale={locale} module={view} itemId={route.itemId} onNavigate={(itemId) => go(view, 'bank', itemId ?? undefined)} />;
  } else if (view === 'mixed') content = <PracticeArea key="mixed" token={token} locale={locale} module={null} itemId={isPracticeItem(route.itemId) ? route.itemId : undefined} feedback={feedback} onNavigate={practiceRoute('mixed')} />;
  else if (view === 'daily-practice') content = <PracticeArea key="daily" token={token} locale={locale} module={null} setKind="daily" itemId={route.itemId} feedback={feedback} onNavigate={practiceRoute('daily-practice')} />;
  else if (view === 'mock-exams') content = <PracticeArea key="mock" token={token} locale={locale} module={null} setKind="mock" itemId={route.itemId} feedback={feedback} onNavigate={practiceRoute('mock-exams')} />;
  else if (view === 'mistakes') content = <PracticeArea key="mistakes" token={token} locale={locale} module={null} itemId="mistakes" feedback={feedback} onNavigate={(itemId) => go('mixed', 'questions', itemId ?? undefined)} />;
  else if (view === 'history' && route.itemId === 'today') content = <ReportsView token={token} locale={locale} />;
  else if (view === 'history' && route.itemId) content = <PracticeArea key="history" token={token} locale={locale} module={null} itemId="history" feedback={feedback} onNavigate={practiceRoute('mixed')} />;
  else if (view === 'history' || view === 'insights' || view === 'memory' || view === 'data') {
    content = <StudyStats token={token} locale={locale} onOpenCards={() => go('memory-review')} onOpenMistakes={() => go('mistakes')} onOpenHistory={() => go('history', 'questions', 'history')} onOpenReports={() => go('history', 'questions', 'today')} onOpenInbox={() => go('captures')} />;
  } else if (view === 'captures' || view === 'capture') content = <InboxView token={token} locale={locale} />;
  else if (view === 'drafts') content = <DraftsView token={token} locale={locale} code={route.itemId} onOpen={(code) => go('drafts', 'questions', code ?? undefined)} />;
  else if (view === 'plan') content = <PlanView token={token} locale={locale} />;
  else if (view === 'market') content = <MarketView token={token} locale={locale} shareId={route.itemId} onOpen={(id) => go('market', 'questions', id ?? undefined)} />;
  else if (view === 'question-types') content = typeGuide();
  else if (view === 'about' || view === 'mcp') content = <AboutPanel labels={labels} user={user} locale={locale} authToken={token} section={route.itemId} />;
  else if (view === 'settings' || view === 'profile') {
    content = <>
      {authMode === 'firebase' && !firebaseLinked && (!route.itemId || route.itemId === 'account') ? <section className="mb-5 rounded-xl border p-4"><h2>Google 登录</h2><p className="my-2 text-sm">绑定当前账号，今后使用 Google 登录即可保留这里的学习记录。</p><button type="button" className="cute-button-secondary px-4 py-2" disabled={authLoading} onClick={() => void handleGoogleLogin(true)}>绑定当前账号到 Google</button></section> : null}
      <SettingsView labels={labels} settings={settings} username={user.username} authToken={token} activeSection={view === 'profile' ? 'account' : route.itemId} onOpenSection={(section) => go('settings', 'questions', section)} onLogout={handleLogout} onUpdateSettings={updateSettings} onSearch={() => setSearchOpen(true)} />
    </>;
  }

  return (
    <SpeechProvider settings={settings} token={token} cacheScope={String(user.id)}><PageChromeProvider>
    <AuthoringNavigationProvider onChange={setAuthoring}>
    <main data-bottom-navigation={primaryRoot ? 'visible' : 'hidden'} className="cute-shell light-workspace flex min-h-[100dvh] max-w-full flex-col overflow-x-clip text-[#28312d]">
      <GlobalSearch locale={locale} open={searchOpen} query={searchQuery} results={searchResults} labels={labels} onQueryChange={setSearchQuery}
        onOpenResult={(result) => { setSearchOpen(false); if (result.view === 'vocabulary' || result.view === 'grammar') go(result.view, 'words', result.id); else go(result.view, 'bank', result.id); }}
        onClose={() => setSearchOpen(false)} />
      <MobileAppHeader discovery={view === 'market' && !route.itemId} library={view === 'study'} onSettings={view === 'market' ? undefined : () => go('settings')} settingsLabel={labels.settings}
        onSearch={() => setSearchOpen(true)} searchLabel={labels.searchOpen} title={authoring?.label ?? title} backLabel={authoring?.backLabel || labels.navBack} showBack={!primaryRoot} onBack={goBack} />
      <div className="app-frame flex min-w-0 flex-1 md:items-stretch">
        <DesktopSidebarNavigation brand="JLPT Master" items={sidebarItems} route={route} labels={labels} username={user.username} collapsed={sidebarCollapsed} mobileOpen={mobileSidebarOpen}
          onNavigate={navigate} onSettings={() => go('settings')} onLogout={handleLogout}
          onToggle={() => setSidebarCollapsed((value) => { writeStorage(SIDEBAR_KEY, String(!value)); return !value; })} onMobileClose={() => setMobileSidebarOpen(false)} />
        <div className="app-content flex min-w-0 flex-1 flex-col">
          <DesktopPageHeader sidebarHidden={sidebarCollapsed} onShowSidebar={() => { setSidebarCollapsed(false); writeStorage(SIDEBAR_KEY, 'false'); }}
            title={authoring?.label ?? title} labels={labels} showBack={!primaryRoot} onBack={goBack} onSearch={() => setSearchOpen(true)} />
          {notice ? <AppNoticeDialog message={notice} onDismiss={() => setNotice('')} /> : null}
          <section className="mx-auto w-full min-w-0 flex-1 max-w-6xl px-4 py-4 md:px-8 md:py-5 lg:px-10">{content}</section>
        </div>
      </div>
      {primaryRoot ? <MobileBottomNavigation items={navItems} activeView={primaryNavigationView(route)} onNavigate={(v) => navigate(v)} navigationLabel={labels.mobileNavigation} /> : null}
    </main>
    </AuthoringNavigationProvider>
    </PageChromeProvider></SpeechProvider>
  );
}

function pageTitle(route: AppRoute, labels: Record<string, string>, locale: Locale) {
  const pick = (zh: string, ja: string, en: string) => (locale === 'ja' ? ja : locale === 'en' ? en : zh);
  const module = { vocabulary: labels.navVocabulary, grammar: labels.navGrammar, reading: labels.navReading, listening: labels.navListening } as Partial<Record<AppView, string>>;
  switch (route.view) {
    case 'home': return NAV_TITLES[locale][0];
    case 'market': return NAV_TITLES[locale][1];
    case 'history': return route.itemId === 'today' ? pick('学习日报', '学習日報', 'Daily reports') : route.itemId ? pick('练习记录', '練習の記録', 'Practice history') : NAV_TITLES[locale][2];
    case 'insights': case 'memory': case 'data': return NAV_TITLES[locale][2];
    case 'study': return NAV_TITLES[locale][3];
    case 'vocabulary': case 'grammar': case 'reading': case 'listening': {
      const suffix = route.page === 'questions' || route.page === 'review' ? pick('练习', '練習', 'practice') : route.page === 'bank' ? pick('题库', '問題集', 'question bank')
        : route.page === 'tips' ? labels.navQuestionTypes : route.page === 'samples' ? pick('官方样题', '公式サンプル', 'official samples') : route.page === 'wordbooks' ? pick('单词本', '単語帳', 'wordbooks') : '';
      return suffix ? `${module[route.view]} · ${suffix}` : module[route.view] ?? '';
    }
    case 'mixed': return pick('综合练习', '総合練習', 'Mixed practice');
    case 'daily-practice': return labels.dailyPracticeTitle;
    case 'mock-exams': return labels.navMockExams;
    case 'mistakes': return pick('错题', '間違えた問題', 'Mistakes');
    case 'captures': case 'capture': return pick('收集箱', '受信箱', 'Inbox');
    case 'drafts': return pick('AI 草稿', 'AI 下書き', 'AI drafts');
    case 'plan': return pick('学习计划', '学習計画', 'Study plan');
    case 'question-types': return labels.navQuestionTypes;
    case 'about': case 'mcp': return isAboutSection(route.itemId) ? aboutSectionTitle(route.itemId, locale) : labels.aboutTitle;
    case 'settings': case 'profile': return labels.settings;
    default: return labels.brand;
  }
}
