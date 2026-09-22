import { useMobileList } from '../hooks/useMobileList';
import { useState, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { LearningList, LearningListFrame, LearningListHeader, LearningListPagination, LearningListSearch } from './LearningList';

/** Complete browsing surface; features own data and render each row. */
export function LearningCatalog<T>({ title, items, searchText, renderRow, locale = 'zh-CN', tools, notice, columns, columnLabels, hasActions, onBack }: {
  title: string; items: T[]; searchText: (item: T) => string; renderRow: (item: T) => ReactNode;
  locale?: string; tools?: ReactNode; notice?: ReactNode; columns?: ReactNode; columnLabels?: [string, string | null, string | null]; hasActions?: boolean; onBack?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase();
  const filtered = items.filter((item) => normalize(searchText(item)).includes(normalize(query.trim())));
  const mobile = useMobileList(filtered.length, query);
  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  const current = Math.min(page, pages - 1);
  const ja = locale === 'ja'; const en = locale === 'en';
  return <LearningListFrame label={title} className="learning-catalog">
    {onBack ? <button className="catalog-mobile-back" type="button" aria-label={ja ? '戻る' : en ? 'Back' : '返回练习'} onClick={onBack}><ChevronLeft size={20}/></button> : null}
    <LearningListHeader title={title} count={`${filtered.length}${ja ? ' 件' : en ? ' items' : ' 项'}`} search={<LearningListSearch value={query} locale={locale} label={`${ja ? '検索' : en ? 'Search' : '搜索'}${title}`} placeholder={ja ? 'タイトル・キーワードで検索' : en ? 'Search titles or keywords' : '搜索标题或关键词'} onChange={(value) => { setQuery(value); setPage(0); }}/>} >{tools}</LearningListHeader>
    {notice ? <div className="catalog-notice">{notice}</div> : null}
    <LearningList columns={columns} locale={locale} columnLabels={columnLabels} hasActions={hasActions}>{filtered.slice(mobile.mobile ? 0 : current * 8, mobile.mobile ? mobile.visible : current * 8 + 8).map(renderRow)}</LearningList>
    {mobile.mobile && filtered.length > 0 ? <div ref={mobile.setSentinel} className="catalog-notice" role="status">{mobile.visible >= filtered.length ? (ja ? 'すべて表示しました' : en ? 'End of list' : '已经到底了') : null}</div> : null}
    {!mobile.mobile && pages > 1 ? <LearningListPagination page={current} pages={pages} onChange={setPage} previous={ja ? '前へ' : en ? 'Previous' : '上一页'} next={ja ? '次へ' : en ? 'Next' : '下一页'}/> : null}
  </LearningListFrame>;
}
