import { ChevronLeft, ChevronRight, Eye, Minus, Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { LearningStatusIcon, type LearningStatus } from './LearningStatusIcon';

/** Shared list surface for browsing learning content on desktop and mobile. */
export function LearningList({ children }: { children: ReactNode }) {
  return <div className="learning-list unified-list" role="list">{children}</div>;
}

export function LearningListRow({ title, reading, description, status, statusKind, locale, onOpen, actionLabel, actionIcon, trailing, secondary, expanded, compact = false, inlineActions = false }: {
  title: ReactNode; reading?: ReactNode; description?: ReactNode; status?: ReactNode; statusKind?: LearningStatus;
  locale?: string; onOpen: () => void; actionLabel?: string; actionIcon?: ReactNode; trailing?: ReactNode; secondary?: ReactNode; expanded?: boolean; compact?: boolean; inlineActions?: boolean;
}) {
  const action = actionLabel ?? (expanded ? (locale === 'ja' ? '閉じる' : locale === 'en' ? 'Collapse details' : '收起详情') : (locale === 'ja' ? '詳細を見る' : locale === 'en' ? 'View details' : '查看详情'));
  return <div className={`list-item-row${compact ? ' is-compact' : ''}${inlineActions ? ' has-inline-actions' : ''}${trailing ? ' has-trailing-control' : ''}`} role="listitem">
    <button type="button" className={`list-item-open${status ? '' : ' without-status'}${description ? '' : ' without-description'}`} aria-expanded={expanded} onClick={onOpen}>
      <span className="list-item-name"><strong>{title}</strong>{reading ? <span className="list-item-reading">{reading}</span> : null}</span>
      <span className="list-item-description">{description}</span>
      <span className="list-item-status">{status ? <span>{statusKind ? <LearningStatusIcon kind={statusKind} label={String(status)}/> : status}</span> : null}</span>
      <span className="list-item-action" title={action}><span className="sr-only">{action}</span>{actionIcon ?? (expanded ? <Minus size={20} aria-hidden="true"/> : <Eye size={20} aria-hidden="true"/>)}</span>
    </button>
    {trailing ? <div className="list-item-trailing">{trailing}</div> : null}
    {secondary ? <div className="list-item-secondary">{secondary}</div> : null}
  </div>;
}

/** Slots keep feature-specific filters, row content and actions outside the layout. */
export function LearningListHeader({ title, count, search, children }: { title?: ReactNode; count?: ReactNode; search?: ReactNode; children?: ReactNode }) {
  return <header className="list-header">{title ? <div className="list-title"><h1>{title}</h1>{count ? <span>{count}</span> : null}</div> : null}<div className="list-toolbar">{search}{children}</div></header>;
}

export function LearningListSearch({ value, onChange, label = '搜索列表', placeholder = '搜索标题或关键词', locale = 'zh-CN' }: { value: string; onChange: (value: string) => void; label?: string; placeholder?: string; locale?: string }) {
  return <div className="list-search"><Search size={18} aria-hidden="true"/><input aria-label={label} type="search" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)}/>{value ? <button type="button" aria-label={locale === 'ja' ? '検索をクリア' : locale === 'en' ? 'Clear search' : '清空搜索'} onClick={() => onChange('')}><X size={16} aria-hidden="true"/></button> : null}</div>;
}

/** Sort / filter dropdown for the list toolbar; label stays visible so the control reads as a filter, not a bare select. */
export function LearningListSelect({ label, value, onChange, children, hideLabel = false }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode; hideLabel?: boolean }) {
  return <label className="list-select"><span className={hideLabel ? 'sr-only' : undefined}>{label}</span><select aria-label={hideLabel ? label : undefined} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

export function LearningListPagination({ page, pages, onChange, summary, previous = '上一页', next = '下一页' }: { page: number; pages: number; onChange: (page: number) => void; summary?: ReactNode; previous?: string; next?: string }) {
  return <nav className="list-pagination" aria-label={`${previous} / ${next}`}><span className="list-page-summary">{summary}</span><button type="button" aria-label={previous} title={previous} disabled={page === 0} onClick={() => onChange(page - 1)}><ChevronLeft size={16} aria-hidden="true"/></button><span aria-live="polite">{page + 1} / {pages}</span><button type="button" aria-label={next} title={next} disabled={page + 1 >= pages} onClick={() => onChange(page + 1)}><ChevronRight size={16} aria-hidden="true"/></button></nav>;
}

export function LearningListFrame({ children, className = '', enabled = true, label }: { children: ReactNode; className?: string; enabled?: boolean; label?: string }) {
  return <section className={`${className}${enabled ? ' list-frame' : ''}`} aria-label={label}>{children}</section>;
}
