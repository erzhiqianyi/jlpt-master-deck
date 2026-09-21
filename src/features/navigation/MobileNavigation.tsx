import { ArrowLeft, Bot, NotebookPen, CalendarDays, Check, ChevronLeft, ChevronRight, Compass, FileText, Filter, History, House, LogOut, Menu, Newspaper, Search, Shuffle, SlidersHorizontal, Target, UserRound, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { AppRoute, AppView, Deck, StudyPage, Wordbook } from '../../types';
import { wordbooksForFamily, type WordbookFamily } from '../../domain/wordbooks';

export type MobileStudyPanel = 'task' | 'filter' | null;

type NavItem = { view: AppView; label: string };
type RouteNavItem = NavItem & { page?: StudyPage; itemId?: string; activeViews?: AppView[]; children?: RouteNavItem[]; group?: 'today' | 'study' | 'review' | 'record' | 'manage' };

export function MobileAppHeader({ onSearch, searchLabel, filterLabel, onHeaderFilter, title, backLabel, showBack, onBack, navOpen, navLabel, navCloseLabel, onNavToggle, actionLabel, onAction, studyActionLabel, studyActionAriaLabel, onStudyAction, filterActionLabel, filterActionAriaLabel, onFilterAction }: {
  onSearch?: () => void;
  searchLabel?: string;
  filterLabel?: string;
  onHeaderFilter?: () => void;
  title: string;
  backLabel: string;
  showBack: boolean;
  onBack: () => void;
  navOpen?: boolean;
  navLabel?: string;
  navCloseLabel?: string;
  onNavToggle?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  studyActionLabel?: string;
  studyActionAriaLabel?: string;
  onStudyAction?: () => void;
  filterActionLabel?: string;
  filterActionAriaLabel?: string;
  onFilterAction?: () => void;
}) {
  if (!showBack && !onNavToggle && !onSearch && !onHeaderFilter) {
    return null;
  }

  return (
    <header className="mobile-app-header sticky top-0 z-30 border-b border-[#f0d4dd] bg-white/95 backdrop-blur md:hidden">
      <div className="grid h-12 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-2">
        <div className="flex min-w-0 items-center justify-start">
          {showBack ? (
            <button type="button" onClick={onBack} aria-label={backLabel} title={backLabel} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#6b5a61] hover:bg-[#fff0f5]">
              <ArrowLeft size={21} />
            </button>
          ) : null}
        </div>
        <h1 className="max-w-[42vw] truncate px-2 text-center text-base font-bold text-[#3d3036]">
          {title}
        </h1>
        <div className="flex min-w-0 items-center justify-end gap-1">
          {onHeaderFilter ? <button type="button" onClick={onHeaderFilter} aria-label={`单词本筛选：${filterLabel}`} className="cute-focus flex h-10 min-w-0 max-w-full items-center gap-1 rounded-full px-2 text-[#a84269]"><Filter size={18} className="shrink-0" /><span className="truncate text-sm">{filterLabel}</span></button> : null}
          {onSearch ? <button type="button" onClick={onSearch} aria-label={searchLabel} className="cute-focus flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#a84269]"><Search size={21} /></button> : null}
          {onAction && actionLabel ? (
            <button type="button" onClick={onAction} aria-label={actionLabel} title={actionLabel} className="flex h-10 w-10 items-center justify-center rounded-full text-[#a84269] hover:bg-[#fff0f5]">
              <LogOut size={20} />
            </button>
          ) : null}
          {onNavToggle ? (
            <button type="button" onClick={onNavToggle} aria-label={navOpen ? navCloseLabel : navLabel} title={navOpen ? navCloseLabel : navLabel} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#a84269] hover:bg-[#fff0f5]">
              {navOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
          ) : null}
        </div>
      </div>
      {onStudyAction && studyActionLabel ? (
        <div className="mobile-header-context-actions flex min-w-0 items-center justify-end gap-2 border-t border-[#f7e7ed] px-3 py-2">
          <button type="button" onClick={onStudyAction} aria-label={studyActionAriaLabel ?? studyActionLabel} title={studyActionAriaLabel ?? studyActionLabel} className="mobile-control-chip cute-focus">
            <SlidersHorizontal size={16} />
            <span>{studyActionLabel}</span>
          </button>
          {onFilterAction && filterActionLabel ? (
            <button type="button" onClick={onFilterAction} aria-label={filterActionAriaLabel ?? filterActionLabel} title={filterActionAriaLabel ?? filterActionLabel} className="mobile-control-chip cute-focus">
              <Filter size={16} />
              <span>{filterActionLabel}</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

export function MobileHeader({
  brand,
  activeView,
  items,
  labels,
  searchContent,
  username,
  onHome,
  onSettings,
  onNavigate,
}: {
  brand: string;
  activeView: AppView;
  items: NavItem[];
  labels: Record<string, string>;
  searchContent: ReactNode;
  username: string;
  onHome: () => void;
  onSettings: () => void;
  onNavigate: (view: AppView) => void;
}) {
  const [panel, setPanel] = useState<'menu' | 'search' | null>(null);
  const currentLabel = activeView === 'settings' ? username : items.find((item) => item.view === activeView)?.label ?? brand;
  const studyViews: AppView[] = ['home', 'plan', 'vocabulary', 'grammar', 'listening', 'reading'];
  const studyItems = items.filter((item) => studyViews.includes(item.view));
  const managementItems = items.filter((item) => !studyViews.includes(item.view));

  useEffect(() => setPanel(null), [activeView]);
  useEffect(() => {
    document.body.style.overflow = panel ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [panel]);

  return (
    <>
      <div className="flex h-14 items-center justify-between gap-3 md:hidden">
        <button type="button" onClick={onHome} className="min-w-0 text-left">
          <span className="cute-brand block truncate text-sm">{brand}</span>
          {activeView !== 'home' ? <span className="block truncate text-xs text-[#7a6a70]">{currentLabel}</span> : null}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label={labels.searchOpen} onClick={() => setPanel('search')}><Search size={20} /></IconButton>
          <button type="button" onClick={onSettings} aria-label={`${labels.settings}: ${username}`} title={`${labels.settings}: ${username}`} className={`flex h-11 max-w-28 items-center gap-1.5 rounded-full px-2 text-sm font-semibold ${activeView === 'settings' ? 'bg-[#fff0f5] text-[#a84269]' : 'text-[#a84269] hover:bg-[#fff0f5]'}`}>
            <UserRound size={18} className="shrink-0" /><span className="truncate">{username}</span>
          </button>
          <IconButton label={labels.mobileMenu} onClick={() => setPanel('menu')}><Menu size={21} /></IconButton>
        </div>
      </div>

      {panel ? (
        <div className="cute-shell fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label={panel === 'search' ? labels.searchOpen : labels.mobileNavigation}>
          <div className="mx-auto min-h-full w-full max-w-lg px-4 pb-10">
            <header className="flex h-16 items-center justify-between border-b border-[#f0d4dd]">
              <div>
                <p className="text-xs font-semibold text-[#a84269]">{brand}</p>
                <h2 className="mt-0.5 text-lg font-semibold text-[#3d3036]">{panel === 'search' ? labels.searchOpen : labels.mobileNavigation}</h2>
              </div>
              <IconButton label={labels.mobileClose} onClick={() => setPanel(null)}><X size={22} /></IconButton>
            </header>

            {panel === 'search' ? (
              <div className="pt-5">{searchContent}</div>
            ) : (
              <div className="pb-8 pt-2">
                <MobileNavGroup title={labels.mobileStudyGroup} items={studyItems} activeView={activeView} onNavigate={(view) => { setPanel(null); onNavigate(view); }} />
                <MobileNavGroup title={labels.mobileManagementGroup} items={managementItems} activeView={activeView} onNavigate={(view) => { setPanel(null); onNavigate(view); }} />
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function MobileStudyControls({
  mode,
  labels,
  deckLabels,
  selectedDeck,
  wordbooks,
  selectedWordbookId,
  allowDeckFilter,
  allowWordbookFilter,
  wordbookFamily = 'vocabulary',
  allowWords,
  wordsLabel,
  panel,
  onPanelChange,
  onModeChange,
  onDeckChange,
  onWordbookChange,
}: {
  mode: StudyPage;
  labels: Record<string, string>;
  deckLabels: Record<Deck | 'all', string>;
  selectedDeck: Deck | 'all';
  wordbooks: Wordbook[];
  selectedWordbookId: string;
  allowDeckFilter: boolean;
  allowWordbookFilter: boolean;
  wordbookFamily?: WordbookFamily;
  allowWords: boolean;
  wordsLabel?: string;
  panel: MobileStudyPanel;
  onPanelChange: (panel: MobileStudyPanel) => void;
  onModeChange: (mode: StudyPage) => void;
  onDeckChange: (deck: Deck | 'all') => void;
  onWordbookChange: (wordbookId: string) => void;
}) {
  const modes: Array<{ value: StudyPage; label: string }> = [
    { value: 'tips', label: labels.navQuestionTypes },
    { value: 'questions', label: labels.questionPage },
    ...(allowWords ? [{ value: 'words' as const, label: wordsLabel ?? labels.wordPage }] : []),
    { value: 'review', label: labels.reviewPage },
  ];
  const familyWordbooks = wordbooksForFamily(wordbooks, wordbookFamily);
  useEffect(() => {
    document.body.style.overflow = panel ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [panel]);

  return (
    <>
      {panel ? (
        <div className="cute-shell fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="mx-auto min-h-full w-full max-w-lg px-4 pb-10">
            <header className="flex h-16 items-center justify-between border-b border-[#f0d4dd]">
              <h2 className="text-lg font-semibold text-[#3d3036]">{panel === 'task' ? labels.mobileSwitchTask : labels.filters}</h2>
              <IconButton label={labels.mobileClose} onClick={() => onPanelChange(null)}><X size={22} /></IconButton>
            </header>
            <div className="divide-y divide-[#f0d4dd] border-b border-[#f0d4dd] pt-2">
              {panel === 'task' ? modes.map((item) => (
                <SheetChoice key={item.value} active={mode === item.value} label={item.label} onClick={() => { onModeChange(item.value); onPanelChange(null); }} />
              )) : (
                <div className="divide-y divide-[#f0d4dd]">
                  {allowDeckFilter ? (
                    <section className="py-3">
                      <p className="px-1 pb-2 text-xs font-bold text-[#8f6f7b]">{labels.entryCategoryFilter}</p>
                      {(['all', 'n1_vocab', 'name_reading'] as Array<Deck | 'all'>).map((deck) => (
                        <SheetChoice key={deck} active={selectedDeck === deck} label={deckLabels[deck]} onClick={() => onDeckChange(deck)} />
                      ))}
                    </section>
                  ) : null}
                  {allowWordbookFilter ? (
                    <section className="py-3">
                      <p className="px-1 pb-2 text-xs font-bold text-[#8f6f7b]">{labels.wordbookFilter}</p>
                      <SheetChoice active={selectedWordbookId === 'all'} label={labels.wordbookAll} onClick={() => onWordbookChange('all')} />
                      {familyWordbooks.map((wordbook) => (
                        <SheetChoice
                          key={wordbook.id}
                          active={selectedWordbookId === wordbook.id}
                          label={wordbook.title}
                          onClick={() => onWordbookChange(wordbook.id)}
                        />
                      ))}
                    </section>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function DesktopPageHeader({ title, breadcrumbs, labels, onBack, onSearch, showBack, filterLabel, onHeaderFilter }: {
  breadcrumbs?: Array<{ label: string; onClick: () => void }>;
  title: string;
  labels: Record<string, string>;
  onBack: () => void;
  onSearch?: () => void;
  filterLabel?: string;
  onHeaderFilter?: () => void;
  showBack: boolean;
}) {
  return (
    <header className="workspace-topbar">
      {showBack ? <button type="button" className="workspace-back cute-focus" onClick={onBack} aria-label={labels.mobileBack ?? '返回上一页'} title="返回上一页"><ArrowLeft size={20} /></button> : null}
      {breadcrumbs ? <nav className="workspace-page-title flex flex-wrap items-center gap-2" aria-label="页面路径">
        {breadcrumbs.map((crumb, index) => <span key={index} className="inline-flex items-center gap-2">
          {index > 0 ? <span aria-hidden="true" className="text-gray-400">/</span> : null}
          <button type="button" className="cute-focus rounded px-1 py-1 hover:bg-[#eaf4ed]" onClick={crumb.onClick} aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}>{crumb.label}</button>
        </span>)}
      </nav> : <h1 className="workspace-page-title">{title}</h1>}
      {onHeaderFilter ? <button type="button" className="workspace-search cute-focus" onClick={onHeaderFilter} aria-label={`单词本筛选：${filterLabel}`}><Filter size={18} /><span>{filterLabel}</span></button> : <button type="button" className="workspace-search cute-focus" onClick={onSearch} aria-label={labels.searchOpen}><Search size={18} /><span>{labels.searchTitle}</span></button>}
    </header>
  );
}

export function DesktopSidebarNavigation({ brand, items, route, labels, username, collapsed, mobileOpen, onNavigate, onSettings, onLogout, onToggle, onMobileClose }: {
  brand: string;
  items: RouteNavItem[];
  route: AppRoute;
  labels: Record<string, string>;
  username: string;
  collapsed: boolean;
  mobileOpen?: boolean;
  onNavigate: (view: AppView, page?: StudyPage, itemId?: string) => void;
  onSettings: () => void;
  onLogout: () => void;
  onToggle: () => void;
  onMobileClose?: () => void;
}) {
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  let previousGroup: RouteNavItem['group'] | undefined;
  const navigateFromSidebar = (view: AppView, page?: StudyPage, itemId?: string) => {
    onNavigate(view, page, itemId);
    if (mobileOpen && typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      onMobileClose?.();
    }
  };
  const openSettingsFromSidebar = () => {
    onSettings();
    if (mobileOpen && typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      onMobileClose?.();
    }
  };
  const toggleSidebar = () => {
    if (mobileOpen && typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      onMobileClose?.();
      return;
    }
    onToggle();
  };

  return (
    <aside className={`desktop-sidebar flex ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : 'is-mobile-closed'}`} aria-label={labels.mobileNavigation}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="desktop-sidebar-header">
          <button type="button" onClick={() => navigateFromSidebar('home')} className="workspace-brand cute-focus" aria-label={`${brand} · ${labels.navTaskHome ?? labels.navHome}`} title={brand}>
            <img src="/jlpt-logo.svg" width="40" height="40" alt="" />
            <span className="workspace-brand-name"><strong>JLPT</strong><span>Master Deck</span></span>
          </button>
          <button type="button" onClick={toggleSidebar} className="desktop-sidebar-toggle cute-focus" aria-label={collapsed ? '展开导航' : '收起导航'} aria-expanded={!collapsed} title={collapsed ? '展开导航' : '收起导航'}>
            {collapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className="desktop-sidebar-nav" aria-label={labels.mobileNavigation}>
          {items.map((item) => {
            const active = isRouteItemActive(item, route);
            const Icon = mobileNavIcon(item.view);
            const showGroupLabel = item.group && item.group !== previousGroup;
            const hasChildren = Boolean(item.children?.length);
            const itemKey = `${item.view}-${item.page ?? 'index'}`;
            const expanded = hasChildren ? (expandedItems[itemKey] ?? active) : false;
            previousGroup = item.group;
            return (
              <div key={`${item.view}-${item.page ?? 'index'}-${item.label}`} className={`desktop-sidebar-group ${item.group ? `desktop-sidebar-group-${item.group}` : ''}`}>
                {showGroupLabel ? (
                  <p className="desktop-sidebar-section-label">
                    <span className="desktop-sidebar-text">{item.group === 'today' ? '今天' : item.group === 'study' ? '学习' : item.group === 'review' ? '练习' : item.group === 'record' ? '记录' : '工具'}</span>
                  </p>
                ) : null}
                {hasChildren ? (
                  <div className={`desktop-sidebar-parent-row ${active ? 'is-active' : ''}`}>
                    <button
                      type="button"
                      onClick={() => { navigateFromSidebar(item.view, item.page, item.itemId); setExpandedItems({ [itemKey]: true }); }}
                      aria-current={active ? 'page' : undefined}
                      aria-label={item.label}
                      title={collapsed ? item.label : undefined}
                      className={`desktop-sidebar-parent cute-focus ${active ? 'is-active' : ''}`}
                    >
                      <span className="desktop-sidebar-icon"><Icon size={18} strokeWidth={2.2} /></span>
                      <span className="desktop-sidebar-text">{item.label}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedItems((current) => ({ ...current, [itemKey]: !(current[itemKey] ?? active) }))}
                      aria-expanded={expanded}
                      aria-label={`${expanded ? '收起' : '展开'}${item.label}`}
                      className="desktop-sidebar-disclosure cute-focus"
                    >
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigateFromSidebar(item.view, item.page)}
                    aria-current={active ? 'page' : undefined}
                    aria-label={item.label}
                    title={collapsed ? item.label : undefined}
                    className={`desktop-sidebar-item cute-focus ${active ? 'is-active' : ''}`}
                  >
                    <span className="desktop-sidebar-icon"><Icon size={18} strokeWidth={2.2} /></span>
                    <span className="desktop-sidebar-text">{item.label}</span>
                  </button>
                )}
                {hasChildren && expanded ? (
                  <div className="desktop-sidebar-subnav is-root-subnav" aria-label={item.label}>
                    {item.children.map((child) => {
                      const childActive = isRouteItemActive(child, route);
                      return (
                        <div key={`${child.view}-${child.page ?? 'index'}`} className="desktop-sidebar-subgroup">
                          <button
                            type="button"
                            onClick={() => navigateFromSidebar(child.view, child.page, child.itemId)}
                            aria-current={childActive && !child.children?.some((grandchild) => isRouteItemActive(grandchild, route)) ? 'page' : undefined}
                            title={collapsed ? child.label : undefined}
                            className={`desktop-sidebar-subitem cute-focus ${childActive ? 'is-active' : ''}`}
                          >
                            <span className="desktop-sidebar-subdot" aria-hidden="true" />
                            <span className="desktop-sidebar-text">{child.label}</span>
                          </button>
                          {childActive && child.children?.length ? (
                            <div className="desktop-sidebar-page-nav" aria-label={child.label}>
                              {child.children.map((grandchild) => {
                                const grandchildActive = isRouteItemActive(grandchild, route);
                                return (
                                  <button
                                    key={`${grandchild.view}-${grandchild.page ?? 'index'}`}
                                    type="button"
                                    onClick={() => navigateFromSidebar(grandchild.view, grandchild.page, grandchild.itemId)}
                                    aria-current={grandchildActive ? 'page' : undefined}
                                    title={collapsed ? grandchild.label : undefined}
                                    className={`desktop-sidebar-page-item cute-focus ${grandchildActive ? 'is-active' : ''}`}
                                  >
                                    <span className="desktop-sidebar-text">{grandchild.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="desktop-sidebar-account-actions mt-auto">
          <button type="button" onClick={openSettingsFromSidebar} aria-label={`${labels.settings}: ${username}`} title={`${labels.settings}: ${username}`} className="desktop-sidebar-account cute-focus">
            <span className="desktop-sidebar-icon"><UserRound size={18} /></span>
            <span className="desktop-sidebar-text">{username}</span>
          </button>
          <button type="button" onClick={onLogout} aria-label={labels.logout} title={labels.logout} className="desktop-sidebar-logout cute-focus">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function isRouteItemActive(item: RouteNavItem, route: AppRoute) {
  if (item.children?.some((child) => isRouteItemActive(child, route))) {
    return true;
  }
  const viewActive = route.view === item.view || Boolean(item.activeViews?.includes(route.view));
  if (!viewActive) {
    return false;
  }
  if (item.itemId) {
    return route.itemId === item.itemId || Boolean(route.itemId?.startsWith(`${item.itemId}/`));
  }
  return !item.page || route.page === item.page;
}

export function RouteNavigation({ items, activeView, onNavigate, variant }: {
  items: RouteNavItem[];
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  variant: 'desktop' | 'mobile';
}) {
  const activeIndex = Math.max(0, items.findIndex((item) => activeView === item.view || item.activeViews?.includes(activeView)));
  const progressWidth = items.length > 1 ? `${(activeIndex / (items.length - 1)) * 100}%` : '0%';

  if (variant === 'desktop') {
    return (
      <nav className="route-nav-desktop min-w-0 flex-1" aria-label="Main navigation">
        <div className="route-rail" aria-hidden="true">
          <span style={{ width: progressWidth }} />
        </div>
        <div className="grid min-w-[34rem] gap-1" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((item, index) => {
            const active = activeView === item.view || Boolean(item.activeViews?.includes(activeView));
            const Icon = mobileNavIcon(item.view);
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => onNavigate(item.view)}
                aria-current={active ? 'page' : undefined}
                className={`route-stop-button cute-focus ${active ? 'is-active' : ''}`}
              >
                <span className="route-stop-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="route-stop-dot"><Icon size={15} strokeWidth={2.25} /></span>
                <span className="route-stop-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav className="route-nav-mobile fixed inset-x-0 bottom-0 z-40 bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-2 shadow-[0_-8px_24px_rgba(79,48,63,0.08)] backdrop-blur md:hidden" aria-label="Mobile navigation">
      <div className="route-mobile-rail" aria-hidden="true">
        <span style={{ width: progressWidth }} />
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = activeView === item.view || item.activeViews?.includes(activeView);
          const Icon = mobileNavIcon(item.view);
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => onNavigate(item.view)}
              aria-current={active ? 'page' : undefined}
              className={`route-mobile-button ${active ? 'is-active' : ''}`}
            >
              <span className="route-mobile-dot"><Icon size={17} strokeWidth={2.2} /></span>
              <span className="route-mobile-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function MobileBottomNavigation({ items, activeView, onNavigate }: {
  items: RouteNavItem[];
  activeView: AppView;
  onNavigate: (view: AppView) => void;
}) {
  return <RouteNavigation items={items} activeView={activeView} onNavigate={onNavigate} variant="mobile" />;
}

function MobileNavGroup({ title, items, activeView, onNavigate }: {
  title: string;
  items: NavItem[];
  activeView: AppView;
  onNavigate: (view: AppView) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section className="mt-5">
      <p className="px-1 text-xs font-semibold text-[#a84269]">{title}</p>
      <nav className="mt-2 divide-y divide-[#f0d4dd] border-y border-[#f0d4dd]">
        {items.map((item) => {
          const active = activeView === item.view;
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => onNavigate(item.view)}
              className={`flex min-h-14 w-full items-center justify-between px-1 py-3 text-left text-base font-semibold ${active ? 'text-[#a84269]' : 'text-[#654e58]'}`}
            >
              <span>{item.label}</span>
              {active ? <Check size={19} className="text-[#d95f8a]" /> : <ChevronRight size={18} className="text-[#b699a5]" />}
            </button>
          );
        })}
      </nav>
    </section>
  );
}

function IconButton({ label, children, onClick }: { label: string; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="flex h-11 w-11 items-center justify-center rounded-full text-[#a84269] hover:bg-[#fff0f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d95f8a]">
      {children}
    </button>
  );
}

function SheetChoice({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center justify-between py-3 text-left text-base font-semibold text-[#4b3b42]">
      <span>{label}</span>
      {active ? <Check size={19} className="text-[#d95f8a]" /> : null}
    </button>
  );
}

function mobileNavIcon(view: AppView) {
  switch (view) {
    case 'home':
      return House;
    case 'mixed':
    case 'daily-practice':
      return Shuffle;
    case 'plan':
      return CalendarDays;
    case 'mock-exams':
      return SlidersHorizontal;
    case 'news-cycle':
      return Newspaper;
    case 'history':
      return History;
    case 'captures':
      return NotebookPen;
    case 'insights':
      return NotebookPen;
    case 'mistakes':
      return Target;
    case 'question-types':
      return Shuffle;
    case 'settings':
      return UserRound;
    case 'market':
      return Compass;
    case 'about':
      return Bot;
    default:
      return FileText;
  }
}
