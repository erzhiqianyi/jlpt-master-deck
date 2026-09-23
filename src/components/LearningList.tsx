import { ChevronLeft, ChevronRight, Eye, Minus, Search, X } from 'lucide-react';
import { Children, createContext, isValidElement, useContext, type ReactNode } from 'react';
import { LearningStatusIcon, type LearningStatus } from './LearningStatusIcon';
import { batchText, type ListSelection } from './ListBatch';

const StandardListContext = createContext(false);
const ListLabelsContext = createContext<[string, string | null, string | null]>(['名称', '信息', '状态']);
const SelectionContext = createContext<ListSelection | undefined>(undefined);

/** Every catalog retains its columns even when there are no matching rows. */
export function LearningList({ children, columns, locale = 'zh-CN', columnLabels, hasActions, selection }: {
  children?: ReactNode; columns?: ReactNode; locale?: string; columnLabels?: [string, string | null, string | null]; hasActions?: boolean;
  /** Batch mode: rows with a `selectId` prop get a leading checkbox. */
  selection?: ListSelection;
}) {
  const rows = Children.toArray(children);
  const rowLocale = rows.find((row) => isValidElement<{ locale?: string }>(row) && row.props.locale);
  const language = isValidElement<{ locale?: string }>(rowLocale) ? rowLocale.props.locale ?? locale : locale;
  const labels: [string, string | null, string | null] = columnLabels ?? (language === 'ja' ? ['名前', '情報', '状態'] : language === 'en' ? ['Name', 'Details', 'Status'] : ['名称', '信息', '状态']);
  const actions = hasActions ?? rows.some((row) => isValidElement<{ actionIcon?: ReactNode; trailing?: ReactNode; inlineActions?: boolean; secondary?: ReactNode }>(row) && (row.props.actionIcon || row.props.trailing || (row.props.inlineActions && row.props.secondary)));
  const header = columns ?? <div className="standard-list-header" aria-hidden="true"><span className="standard-list-fields">{labels.map((label, index) => label === null ? null : <span key={index}>{label}</span>)}</span><span className="standard-actions-heading">{language === 'ja' ? '操作' : language === 'en' ? 'Actions' : '操作'}</span></div>;
  const text = batchText(language);
  const rowSelection = (row: ReactNode) => isValidElement<{ selectId?: string; title?: ReactNode }>(row) && row.props.selectId ? { id: row.props.selectId, label: typeof row.props.title === 'string' ? row.props.title : row.props.selectId } : null;
  const body = selection ? rows.map((row, index) => {
    const target = rowSelection(row);
    if (!target) return row;
    return <div key={isValidElement(row) ? row.key ?? index : index} className={`list-selectable${selection.selected.has(target.id) ? ' is-selected' : ''}`}>
      <label className="list-select-check"><input type="checkbox" checked={selection.selected.has(target.id)} onChange={() => selection.toggle(target.id)} aria-label={text.selectRow(target.label)}/></label>
      {row}
    </div>;
  }) : rows;
  return <div className="learning-list-scroll"><div className={`learning-list-columns${columns ? '' : ' standard-list-columns'}${actions ? '' : ' without-list-actions'}${labels[1] === null ? ' without-list-description' : ''}${labels[2] === null ? ' without-list-status' : ''}${selection ? ' is-selecting' : ''}`}>
    {header}
    <ListLabelsContext.Provider value={labels}><StandardListContext.Provider value={!columns}><SelectionContext.Provider value={selection}>
      <div className="learning-list unified-list" role="list">{rows.length ? body : <div role="listitem" className="list-empty-row"><span role="status">{language === 'ja' ? 'データがありません' : language === 'en' ? 'No data' : '没有数据'}</span></div>}</div>
    </SelectionContext.Provider></StandardListContext.Provider></ListLabelsContext.Provider>
  </div></div>;
}

export function LearningListRow({ selectId, title, references, reading, description, metadata, status, statusKind, locale, onOpen: openRow, actionLabel, actionIcon, trailing, secondary, expanded, compact = false, inlineActions = false }: {
  /** Read by the parent LearningList in batch mode. */
  selectId?: string;
  title: ReactNode; references?: (string | undefined)[]; reading?: ReactNode; description?: ReactNode; metadata?: ReactNode; status?: ReactNode; statusKind?: LearningStatus;
  locale?: string; onOpen: () => void; actionLabel?: string; actionIcon?: ReactNode; trailing?: ReactNode; secondary?: ReactNode; expanded?: boolean; compact?: boolean; inlineActions?: boolean;
}) {
  const referenceCodes = [...new Set((references ?? []).filter((code): code is string => Boolean(code)))];
  const referenceLabel = locale === 'ja' ? '参照番号' : locale === 'en' ? 'Reference' : '编号';
  // Its own row within the name cell (a display:grid stack), styled as a badge — a separate element, not inline text.
  const referenceText = referenceCodes.length ? <span className="list-item-references" aria-label={`${referenceLabel} ${referenceCodes.join(', ')}`}>{referenceCodes.map(code => <span key={code}>{code}</span>)}</span> : null;
  const standard = useContext(StandardListContext);
  const labels = useContext(ListLabelsContext);
  const selection = useContext(SelectionContext);
  // In batch mode a row click toggles its checkbox instead of navigating away.
  const onOpen = selection && selectId ? () => selection.toggle(selectId) : openRow;
  const action = actionLabel ?? (expanded ? (locale === 'ja' ? '閉じる' : locale === 'en' ? 'Collapse details' : '收起详情') : (locale === 'ja' ? '詳細を見る' : locale === 'en' ? 'View details' : '查看详情'));
  if (standard) return <div className="standard-list-row" role="listitem">
    <button type="button" className="standard-list-open standard-list-fields" aria-expanded={expanded} onClick={onOpen}>
      <span className="list-item-name"><strong>{title}</strong>{referenceText}{reading ? <span className="list-item-reading">{reading}</span> : null}</span>
      <span className="standard-list-description" data-mobile-label={labels[1] ?? undefined}>{description || '—'}</span>
      <span className="standard-list-status" data-mobile-label={labels[2] ?? undefined}>{status || '—'}</span>
      <span className="sr-only">{action}</span>
    </button>
    <div className="standard-list-actions">
      {actionIcon ? <button type="button" aria-label={action} title={action} onClick={onOpen}>{actionIcon}</button> : null}
      {trailing}{inlineActions ? secondary : null}
    </div>
    {secondary && !inlineActions ? <div className="standard-list-detail">{secondary}</div> : null}
  </div>;
  return <div className={`list-item-row${compact ? ' is-compact' : ''}${inlineActions ? ' has-inline-actions' : ''}${trailing ? ' has-trailing-control' : ''}`} role="listitem">
    <button type="button" className={`list-item-open${status ? '' : ' without-status'}${description ? '' : ' without-description'}${metadata ? ' has-metadata' : ''}`} aria-expanded={expanded} onClick={onOpen}>
      <span className="list-item-name"><strong>{title}</strong>{referenceText}{reading ? <span className="list-item-reading">{reading}</span> : null}{metadata && description ? <span className="list-item-description">{description}</span> : null}</span>
      {metadata ? <span className="list-item-metadata">{metadata}</span> : <>
      <span className="list-item-description">{description}</span>
      <span className="list-item-status">{status ? <span>{statusKind ? <LearningStatusIcon kind={statusKind} label={String(status)}/> : status}</span> : null}</span>
      <span className="list-item-action" title={action}><span className="sr-only">{action}</span>{actionIcon ?? (expanded ? <Minus size={20} aria-hidden="true"/> : <Eye size={20} aria-hidden="true"/>)}</span>
      </>}
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
