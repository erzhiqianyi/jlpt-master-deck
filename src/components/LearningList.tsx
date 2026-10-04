import { ChevronLeft, ChevronRight, Minus, Search, SlidersHorizontal, X } from 'lucide-react';
import { Children, createContext, isValidElement, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePageHeaderActions } from './PageChrome';
import { LearningStatusIcon, type LearningStatus } from './LearningStatusIcon';
import { batchText, type ListSelection } from './ListBatch';

const ListDensityContext = createContext<{ locale: string; detailed: boolean; toggle: () => void } | null>(null);
const CountColumnContext = createContext<string | undefined>(undefined);
const StandardListContext = createContext(false);
const ListLabelsContext = createContext<[string, string | null, string | null]>(['名称', '信息', '状态']);
const SelectionContext = createContext<ListSelection | undefined>(undefined);
/** Desktop shows reference codes in their own leading column; mobile keeps them inline under the title. */
const ReferenceColumnContext = createContext(false);

function referenceLabel(locale?: string) {
  return locale === 'ja' ? '参照番号' : locale === 'en' ? 'Reference' : '编号';
}

/** Every catalog retains its columns even when there are no matching rows. */
export function LearningList({ children, columns, locale = 'zh-CN', columnLabels, countLabel, hasActions, selection }: {
  countLabel?: string; children?: ReactNode; columns?: ReactNode; locale?: string; columnLabels?: [string, string | null, string | null]; hasActions?: boolean;
  /** Batch mode: rows with a `selectId` prop get a leading checkbox. */
  selection?: ListSelection;
}) {
  const rows = Children.toArray(children);
  const rowLocale = rows.find((row) => isValidElement<{ locale?: string }>(row) && row.props.locale);
  const language = isValidElement<{ locale?: string }>(rowLocale) ? rowLocale.props.locale ?? locale : locale;
  const labels: [string, string | null, string | null] = columnLabels ?? (language === 'ja' ? ['名前', '情報', '状態'] : language === 'en' ? ['Name', 'Details', 'Status'] : ['名称', '信息', '状态']);
  const actions = hasActions ?? rows.some((row) => isValidElement<{ actionIcon?: ReactNode; trailing?: ReactNode; inlineActions?: boolean; secondary?: ReactNode }>(row) && (row.props.actionIcon || row.props.trailing || (row.props.inlineActions && row.props.secondary)));
  const referenceColumn = rows.some((row) => isValidElement<{ references?: (string | undefined)[] }>(row) && row.props.references?.some(Boolean));
  const referenceHeading = referenceColumn ? <span key="reference" className="list-column-reference">{referenceLabel(language)}</span> : null;
  const header = columns ?? <div className="standard-list-header" aria-hidden="true"><span className="standard-list-fields">{referenceHeading}{labels.map((label, index) => label === null ? null : <span key={index} className={index === 0 ? 'list-column-title' : undefined}>{label}</span>)}{countLabel ? <span>{countLabel}</span> : null}</span><span className="standard-actions-heading">{language === 'ja' ? '操作' : language === 'en' ? 'Actions' : '操作'}</span></div>;
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
  return <div className="learning-list-scroll"><div className={`learning-list-columns${columns ? '' : ' standard-list-columns'}${actions ? '' : ' without-list-actions'}${labels[1] === null ? ' without-list-description' : ''}${labels[2] === null ? ' without-list-status' : ''}${countLabel ? ' has-count-column' : ''}${selection ? ' is-selecting' : ''}${referenceColumn ? ' has-list-references' : ''}`}>
    {header}
    <CountColumnContext.Provider value={countLabel}><ListLabelsContext.Provider value={labels}><StandardListContext.Provider value={!columns}><SelectionContext.Provider value={selection}><ReferenceColumnContext.Provider value={referenceColumn}>
      <div className="learning-list unified-list" role="list">{rows.length ? body : <div role="listitem" className="list-empty-row"><span role="status">{language === 'ja' ? 'データがありません' : language === 'en' ? 'No data' : '没有数据'}</span></div>}</div>
    </ReferenceColumnContext.Provider></SelectionContext.Provider></StandardListContext.Provider></ListLabelsContext.Provider></CountColumnContext.Provider>
  </div></div>;
}

export function LearningListRow({ selectId, title, references, reading, description, metadata, count, status, statusKind, locale, onOpen: openRow, actionLabel, actionIcon, trailing, secondary, expanded, compact = false, inlineActions = false }: {
  /** Read by the parent LearningList in batch mode. */
  selectId?: string;
  count?: number; title: ReactNode; references?: (string | undefined)[]; reading?: ReactNode; description?: ReactNode; metadata?: ReactNode; status?: ReactNode; statusKind?: LearningStatus;
  locale?: string; onOpen: () => void; actionLabel?: string; actionIcon?: ReactNode; trailing?: ReactNode; secondary?: ReactNode; expanded?: boolean; compact?: boolean; inlineActions?: boolean;
}) {
  const referenceCodes = [...new Set((references ?? []).filter((code): code is string => Boolean(code)))];
  const referenceChips = referenceCodes.length ? referenceCodes.map(code => <span key={code}>{code}</span>) : null;
  const referenceText = referenceChips ? <span className="list-item-references" aria-label={`${referenceLabel(locale)} ${referenceCodes.join(', ')}`}>{referenceChips}</span> : null;
  const density = useContext(ListDensityContext);
  const countLabel = useContext(CountColumnContext);
  const standard = useContext(StandardListContext);
  const referenceColumn = useContext(ReferenceColumnContext) && (standard || Boolean(metadata));
  // Desktop shows a dedicated column cell; mobile shows the inline chips under the title (CSS toggles which one renders).
  const referenceCell = referenceColumn ? <span className="list-item-reference-cell">{referenceChips ?? <span className="list-item-reference-empty" aria-hidden="true">—</span>}</span> : null;
  const labels = useContext(ListLabelsContext);
  const selection = useContext(SelectionContext);
  // In batch mode a row click toggles its checkbox instead of navigating away.
  const onOpen = selection && selectId ? () => selection.toggle(selectId) : openRow;
  const action = actionLabel ?? (expanded ? (locale === 'ja' ? '閉じる' : locale === 'en' ? 'Collapse details' : '收起详情') : (locale === 'ja' ? '詳細を見る' : locale === 'en' ? 'View details' : '查看详情'));
  if (standard) return <div className="standard-list-row" role="listitem">
    <button type="button" className="standard-list-open standard-list-fields" aria-expanded={expanded} onClick={onOpen}>
      {referenceCell}
      <span className="list-item-name"><strong>{title}</strong>{referenceText}{reading ? <span className="list-item-reading">{reading}</span> : null}</span>
      <span className="standard-list-description" data-mobile-label={labels[1] ?? undefined}>{description}</span>
      <span className="standard-list-status" data-mobile-label={labels[2] ?? undefined}>{status}</span>
      <span className="sr-only">{action}</span>
      {!actionIcon ? <ChevronRight className="standard-list-chevron" size={20} aria-hidden="true" /> : null}
      {countLabel ? <span className="standard-list-count" data-mobile-label={countLabel}><span className="sr-only">{countLabel} </span>{count ?? 0}</span> : null}
    </button>
    <div className="standard-list-actions">
      {actionIcon ? <button type="button" aria-label={action} title={action} onClick={onOpen}>{actionIcon}</button> : null}
      {trailing}{inlineActions ? secondary : null}
    </div>
    {metadata && density?.detailed ? <div className="standard-list-metadata">{metadata}</div> : null}
    {secondary && !inlineActions ? <div className="standard-list-detail">{secondary}</div> : null}
  </div>;
  return <div className={`list-item-row${compact ? ' is-compact' : ''}${inlineActions ? ' has-inline-actions' : ''}${trailing ? ' has-trailing-control' : ''}`} role="listitem">
    <button type="button" className={`list-item-open${status ? '' : ' without-status'}${description ? '' : ' without-description'}${metadata ? ' has-metadata' : ''}`} aria-expanded={expanded} onClick={onOpen}>
      {referenceCell}
      <span className="list-item-name"><strong>{title}</strong>{referenceText}{reading ? <span className="list-item-reading">{reading}</span> : null}{metadata && description ? <span className="list-item-description">{description}</span> : null}</span>
      {metadata ? <span className="list-item-metadata">{metadata}</span> : <>
      <span className="list-item-description">{description}</span>
      <span className="list-item-status">{status ? <span>{statusKind ? <LearningStatusIcon kind={statusKind} label={String(status)}/> : status}</span> : null}</span>
      <span className="list-item-action" title={action}><span className="sr-only">{action}</span>{actionIcon ?? (expanded ? <Minus size={20} aria-hidden="true"/> : <ChevronRight size={20} aria-hidden="true"/>)}</span>
      </>}
    </button>
    {trailing ? <div className="list-item-trailing">{trailing}</div> : null}
    {secondary ? <div className="list-item-secondary">{secondary}</div> : null}
  </div>;
}

/** Slots keep feature-specific filters, row content and actions outside the layout. */
export function LearningListHeader({ title, count, search, children, appliedSummary, onReset, expandedOnWide = true }: { expandedOnWide?: boolean; title?: ReactNode; count?: ReactNode; search?: ReactNode; children?: ReactNode; appliedSummary?: ReactNode; onReset?: () => void }) {
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const update = () => setWide(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const inline = expandedOnWide && wide;
  const density = useContext(ListDensityContext);
  const locale = density?.locale ?? (isValidElement<{ locale?: string }>(search) ? search.props.locale : undefined) ?? 'zh-CN';
  const ja = locale === 'ja'; const en = locale === 'en';
  const label = ja ? '検索・絞り込み' : en ? 'Search and filters' : '搜索与筛选';
  const closeLabel = ja ? '閉じる' : en ? 'Close' : '关闭';
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const hasControls = Boolean(search || Children.toArray(children).length || density);
  const show = () => { trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setOpen(true); };
  const close = () => { dialog.current?.close(); setOpen(false); };
  const [searchHost, setSearchHost] = useState<HTMLDivElement | null>(null);
  const inHeader = usePageHeaderActions(inline && search ? [{ key: `list-search-${id}`, label, content: <div ref={setSearchHost} />, onClick: () => {} }] : hasControls && !inline ? [{ key: `list-controls-${id}`, label, icon: <SlidersHorizontal size={21}/>, onClick: show }] : []);
  useEffect(() => { if (inline) setOpen(false); }, [inline]);
  const query = isValidElement<{ value?: string }>(search) ? search.props.value : undefined;
  const summary = appliedSummary || (query ? `${ja ? '検索' : en ? 'Search' : '搜索'}: ${query}` : null);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    element?.showModal();
    heading.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = previous; if (trigger.current?.isConnected) trigger.current.focus(); };
  }, [open]);
  if (inline) return <header className="list-header list-header-expanded">{inHeader ? searchHost ? createPortal(search, searchHost) : null : <div className="list-expanded-top">{search}</div>}<div className="list-expanded-filters">{children}{density ? <button type="button" className="list-density-toggle" aria-pressed={density.detailed} onClick={density.toggle}>{ja ? '詳細表示' : en ? 'Detailed list' : '详细列表'}</button> : null}</div>{summary && onReset ? <div className="list-applied-summary"><span>{summary}</span><button type="button" onClick={onReset}>{ja ? 'リセット' : en ? 'Reset' : '重置'}</button></div> : null}</header>;
  return <header className={`list-header${inHeader ? ' has-page-header' : ''}`}>
    {!inHeader && title ? <div className="list-title"><h1>{title}</h1>{count ? <span>{count}</span> : null}</div> : null}
    {!inHeader && hasControls ? <button type="button" className="list-controls-trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={show}><SlidersHorizontal size={20}/><span>{label}</span></button> : null}
    {summary ? <div className="list-applied-summary"><span>{summary}</span>{onReset ? <button type="button" onClick={onReset}>{ja ? 'リセット' : en ? 'Reset' : '重置'}</button> : <button type="button" onClick={show}>{ja ? '変更' : en ? 'Change' : '修改'}</button>}</div> : null}
    {hasControls ? <dialog ref={dialog} id={id} className="list-controls-dialog" aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); close(); }}>
      {open ? <><div className="list-controls-heading"><h2 ref={heading} tabIndex={-1} id={`${id}-title`}>{label}</h2><button type="button" aria-label={closeLabel} onClick={close}><X size={22}/></button></div>
        <div className="list-controls-body">{search}{children}{density ? <button type="button" className="list-density-toggle" aria-pressed={density.detailed} onClick={density.toggle}>{ja ? '詳細表示' : en ? 'Detailed list' : '详细列表'}</button> : null}</div>
        <footer className="list-controls-footer"><button type="button" className="cute-button-primary" onClick={close}>{ja ? '結果を表示' : en ? 'Show results' : '显示结果'}{count ? <span> · {count}</span> : null}</button></footer></> : null}
    </dialog> : null}
  </header>;
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

export function LearningListFrame({ children, className = '', enabled = true, label, locale = 'zh-CN' }: { locale?: string; children: ReactNode; className?: string; enabled?: boolean; label?: string }) {
  const [detailed, setDetailed] = useState(false);
  const isStudyList = true;
  return <ListDensityContext.Provider value={isStudyList ? { locale, detailed, toggle: () => setDetailed(value => !value) } : null}><section className={`${className}${enabled ? ' list-frame' : ''}${isStudyList && !detailed ? ' is-simple-study-list' : ''}`} aria-label={label}>{children}</section></ListDensityContext.Provider>;
}
