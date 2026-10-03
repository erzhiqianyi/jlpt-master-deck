import { LearningList, LearningListRow } from '../../components/LearningList';
import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SearchResult } from '../../types';

export function GlobalSearch({ open, query, results, labels, onQueryChange, onOpenResult, onClose }: {
  open: boolean;
  query: string;
  results: SearchResult[];
  labels: Record<string, string>;
  onQueryChange: (value: string) => void;
  onOpenResult: (result: SearchResult) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<SearchResult['view'] | 'all'>('all');
  const [limit, setLimit] = useState(30);
  useEffect(() => {
    if (!open) { dialog.current?.close(); return; }
    dialog.current?.showModal();
    input.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  const categories = [
    { id: 'all', label: labels.searchAll },
    { id: 'vocabulary', label: labels.searchModuleVocabulary },
    { id: 'grammar', label: labels.searchModuleGrammar },
    { id: 'listening', label: labels.navListening },
    { id: 'reading', label: labels.navReading },
  ] as const;
  const filtered = filter === 'all' ? results : results.filter((result) => result.view === filter);
  return (
    <dialog ref={dialog} onCancel={onClose} onClose={onClose} aria-labelledby="global-search-title" className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl rounded-2xl border border-[#d7dfd6] bg-white p-0 text-[#27312c] shadow-xl backdrop:bg-black/30">
      <div className="sticky top-0 z-10 border-b border-[#e1e6df] bg-white p-4">
        <div className="mb-3 flex items-center justify-between"><h2 id="global-search-title" className="font-bold">{labels.searchTitle}</h2><button type="button" onClick={onClose} aria-label={labels.mobileClose} className="cute-focus flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[#eef3ed]"><X size={20} /></button></div>
        <div className="flex items-center gap-2 rounded-xl border border-[#d7dfd6] px-3 focus-within:border-[#31564c]">
          <Search size={18} className="shrink-0 text-[#31564c]" />
          <input ref={input} value={query} onChange={(event) => { onQueryChange(event.target.value); setLimit(30); }} aria-label={labels.searchTitle} placeholder={labels.searchPlaceholder} className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none" />
          {query && <button type="button" onClick={() => { onQueryChange(''); setLimit(30); input.current?.focus(); }} aria-label={labels.searchClear} className="cute-focus flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[#eef3ed]"><X size={16} /></button>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2" aria-label={labels.filters}>
          {categories.map(({ id, label }) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => { setFilter(id); setLimit(30); }} className={`cute-focus min-h-11 rounded-full px-3 py-2 text-sm ${filter === id ? 'bg-[#31564c] text-white' : 'bg-[#eef3ed] text-[#31564c]'}`}>{label}</button>)}
        </div>
      </div>
      <div className="p-3">
        <p role="status" className="px-2 py-2 text-sm text-[#747b76]">{query.trim() ? `${labels.searchResults} · ${filtered.length}` : labels.searchHint}</p>
        <LearningList columnLabels={[labels.searchResults, labels.searchTitle, labels.filters]}>{filtered.slice(0, limit).map((result) => <LearningListRow key={`${result.view}:${result.id}`} title={result.title} reading={result.item?.reading} description={result.subtitle} status={result.moduleLabel} actionLabel={labels.entryOpen} onOpen={() => onOpenResult(result)}/>)}</LearningList>
        {filtered.length > limit && <button type="button" onClick={() => setLimit((value) => value + 30)} className="cute-focus my-3 w-full rounded-full border py-3 text-sm">{labels.searchMore}</button>}
      </div>
    </dialog>
  );
}
