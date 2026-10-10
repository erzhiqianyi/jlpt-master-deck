import { PageHeaderActions } from '../../components/PageChrome';
import { primaryNavigationView, primaryNavigationViews } from '../../domain/appNavigation';
import { ArrowLeft, ChartNoAxesColumn, BookA, Captions, BookOpen, PanelLeft, LayoutGrid, Settings,   Headphones, Bot, NotebookPen, CalendarDays,   ChevronRight, Compass, FileText, Filter,   LogOut, Menu, Search, Shuffle, SlidersHorizontal, Target, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import type { AppRoute, AppView, StudyPage } from '../../types';

type NavItem = { view: AppView; label: string };
type RouteNavItem = NavItem & { page?: StudyPage; itemId?: string; activeViews?: AppView[]; children?: RouteNavItem[]; group?: 'today' | 'study' | 'review' | 'record' | 'manage' };

export function MobileAppHeader({ library = false, discovery = false, onSettings, settingsLabel, onSearch, searchLabel, filterLabel, filterName, filterIconOnly, onHeaderFilter, title, backLabel, showBack, onBack, navOpen, navLabel, navCloseLabel, onNavToggle, actionLabel, onAction, studyActionLabel, studyActionAriaLabel, onStudyAction, filterActionLabel, filterActionAriaLabel, onFilterAction }: {
  discovery?: boolean;
  library?: boolean;
  onSettings?: () => void;
  settingsLabel?: string;
  onSearch?: () => void;
  searchLabel?: string;
  filterLabel?: string;
  filterName?: string;
  filterIconOnly?: boolean;
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
  if (!discovery && !showBack && !onSettings && !onNavToggle && !onSearch && !onHeaderFilter) {
    return null;
  }

  return (
    <header className={`mobile-app-header ${discovery ? 'is-discovery-header' : library ? 'is-library-header' : ''} sticky top-0 z-30 border-b border-[#f0d4dd] bg-white/95 backdrop-blur md:hidden`}>
      <div className="grid h-12 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-2">
        <div className="flex min-w-0 items-center justify-start">
          {showBack ? (
            <button type="button" onClick={onBack} aria-label={backLabel} title={backLabel} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#6b5a61] hover:bg-[#fff0f5]">
              <ArrowLeft size={21} />
            </button>
          ) : !library && onSettings && settingsLabel ? (
            <button type="button" onClick={onSettings} aria-label={settingsLabel} title={settingsLabel} className="mobile-settings-entry cute-focus">
              <Settings size={20} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <h1 className="max-w-[42vw] truncate px-2 text-center text-base font-bold text-[#3d3036]">
          {title}
        </h1>
        <div className="flex min-w-0 items-center justify-end gap-1">
          {library && onSettings && settingsLabel ? <button type="button" onClick={onSettings} aria-label={settingsLabel} title={settingsLabel} className="mobile-settings-entry cute-focus"><Settings size={24} aria-hidden="true" /></button> : null}
          <PageHeaderActions />
          {onHeaderFilter ? <button type="button" onClick={onHeaderFilter} aria-label={`${filterName}：${filterLabel}`} title={`${filterName}：${filterLabel}`} className={`cute-focus flex h-10 min-w-0 max-w-full items-center justify-center gap-1 rounded-full text-[#a84269] ${filterIconOnly ? 'w-10' : 'px-2'}`}><Filter size={filterIconOnly ? 21 : 18} className="shrink-0" />{filterIconOnly ? null : <span className="truncate text-sm">{filterLabel}</span>}</button> : null}
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

export function DesktopPageHeader({ title, breadcrumbs, labels, onBack, onSearch, showBack, filterLabel, filterName, onHeaderFilter, sidebarHidden, onShowSidebar }: {
  sidebarHidden?: boolean;
  onShowSidebar?: () => void;
  breadcrumbs?: Array<{ label: string; onClick: () => void }>;
  title: string;
  labels: Record<string, string>;
  onBack: () => void;
  onSearch?: () => void;
  filterLabel?: string;
  filterName?: string;
  onHeaderFilter?: () => void;
  showBack: boolean;
}) {
  return (
    <header className="workspace-topbar">
      {sidebarHidden ? <button type="button" className="workspace-back cute-focus" onClick={onShowSidebar} aria-label={labels.navExpandAll} title={labels.navExpandAll} aria-expanded={false}><PanelLeft size={22} /></button> : null}
      {showBack ? <button type="button" className="workspace-back cute-focus" onClick={onBack} aria-label={labels.navBack} title={labels.navBack}><ArrowLeft size={20} /></button> : null}
      {breadcrumbs ? <nav className="workspace-page-title flex flex-wrap items-center gap-2" aria-label={labels.navPath}>
        {breadcrumbs.map((crumb, index) => <span key={index} className="inline-flex items-center gap-2">
          {index > 0 ? <span aria-hidden="true" className="text-gray-400">/</span> : null}
          <button type="button" className="cute-focus rounded px-1 py-1 hover:bg-[#eaf4ed]" onClick={crumb.onClick} aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}>{crumb.label}</button>
        </span>)}
      </nav> : <h1 className="workspace-page-title">{title}</h1>}
      {onHeaderFilter ? <button type="button" className="workspace-search cute-focus" onClick={onHeaderFilter} aria-label={`${filterName}：${filterLabel}`}><Filter size={18} /><span>{filterLabel}</span></button> : onSearch ? <button type="button" className="workspace-search cute-focus" onClick={onSearch} aria-label={labels.searchOpen}><Search size={18} /><span>{labels.searchTitle}</span></button> : null}
      <PageHeaderActions />
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="desktop-sidebar-header">
          <button type="button" onClick={() => navigateFromSidebar('home')} className="workspace-brand cute-focus" aria-label={`${brand} · ${labels.navTaskHome ?? labels.navHome}`} title={brand}>
            <img src="/jlpt-brand.png" width="40" height="40" alt="" />
            <span className="workspace-brand-name"><strong>JLPT Master</strong></span>
          </button>
          <button type="button" onClick={toggleSidebar} className="desktop-sidebar-toggle cute-focus" aria-label={collapsed ? labels.navExpandAll : labels.navCollapseAll} aria-expanded={!collapsed} title={collapsed ? labels.navExpandAll : labels.navCollapseAll}>
            <PanelLeft size={22} />
          </button>
        </div>

        <nav className="desktop-sidebar-nav" aria-label={labels.mobileNavigation}>
          {items.map((item) => {
            const active = (primaryNavigationViews as readonly string[]).includes(item.view)
              ? item.view === primaryNavigationView(route) : isRouteItemActive(item, route);
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
                    <span className="desktop-sidebar-text">{item.group === 'today' ? labels.navGroupToday : item.group === 'study' ? labels.homeStudyArea : item.group === 'review' ? labels.navGroupReview : item.group === 'record' ? labels.navGroupRecord : labels.navGroupManage}</span>
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
                      aria-label={`${expanded ? labels.navCollapse : labels.navExpand} ${item.label}`}
                      className="desktop-sidebar-disclosure cute-focus"
                    >
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigateFromSidebar(item.view, item.page, item.itemId)}
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
                    {item.children?.map((child) => {
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
          <button type="button" onClick={openSettingsFromSidebar} aria-label={labels.settings} title={labels.settings} className="desktop-sidebar-logout cute-focus">
            <Settings size={18} />
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

export function RouteNavigation({ items, activeView, onNavigate, variant, navigationLabel }: {
  items: RouteNavItem[];
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  variant: 'desktop' | 'mobile';
  navigationLabel: string;
}) {
  const activeIndex = Math.max(0, items.findIndex((item) => activeView === item.view || item.activeViews?.includes(activeView)));
  const progressWidth = items.length > 1 ? `${(activeIndex / (items.length - 1)) * 100}%` : '0%';

  if (variant === 'desktop') {
    return (
      <nav className="route-nav-desktop min-w-0 flex-1" aria-label={navigationLabel}>
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
    <nav className="route-nav-mobile fixed inset-x-0 bottom-0 z-40 bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-2 shadow-[0_-8px_24px_rgba(79,48,63,0.08)] backdrop-blur md:hidden" aria-label={navigationLabel}>
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

export function MobileBottomNavigation({ items, activeView, onNavigate, navigationLabel }: {
  items: RouteNavItem[];
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  navigationLabel: string;
}) {
  return <RouteNavigation items={items} activeView={activeView} onNavigate={onNavigate} variant="mobile" navigationLabel={navigationLabel} />;
}

function mobileNavIcon(view: AppView) {
  switch (view) {
    case 'study':
      return LayoutGrid;
    case 'vocabulary': return BookA;
    case 'grammar': return Captions;
    case 'reading': return BookOpen;
    case 'listening': return Headphones;
    case 'home':
      return BookOpen;
    case 'mixed':
    case 'daily-practice':
      return FileText;
    case 'plan':
      return CalendarDays;
    case 'mock-exams':
      return SlidersHorizontal;
    case 'history':
      return ChartNoAxesColumn;
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
