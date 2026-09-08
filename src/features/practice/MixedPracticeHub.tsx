import { ArrowRight, BookOpenText, Brain, CheckCircle2, ChevronLeft, ChevronRight, FileCheck2, Headphones, Languages, Layers3, NotebookTabs, PlayCircle, RotateCcw, Search, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMobileList } from '../../hooks/useMobileList';
import type { AppView, DraftSummary, LearningCapture, ListeningQuestion, ProgressState, Question, ReadingQuestion, StudyPlanDocument, VocabItem } from '../../types';

type ModuleSummary = { view: AppView; title: string; body: string; count: number };
type PracticeEntry = { status?: 'ready' | 'pending'; updatedAt?: string; key: string; title: string; body: string; count: number; icon: LucideIcon; tone: string; action: () => void };
type PracticeGroup = { action?: () => void; key: string; title: string; body: string; count: number; icon: LucideIcon; tone: string; entries: PracticeEntry[] };
const MIXED_ENTRY_PAGE_SIZE = 8;

export function MixedPracticeHub({
  topicEntries = [],
  groupKey,
  labels,
  questions,
  items,
  progress,
  modules,
  captures,
  drafts,
  listeningQuestions,
  readingQuestions,
  studyPlan,
  onStart,
  onStartMock,
  onNavigate,
}: {
  topicEntries?: PracticeEntry[];
  groupKey?: string;
  labels: Record<string, string>;
  questions: Question[];
  items: VocabItem[];
  progress: ProgressState;
  modules: ModuleSummary[];
  captures: LearningCapture[];
  drafts: DraftSummary[];
  listeningQuestions: ListeningQuestion[];
  readingQuestions: ReadingQuestion[];
  studyPlan: StudyPlanDocument;
  onStart: () => void;
  onStartMock: () => void;
  onNavigate: (view: AppView) => void;
}) {
  const dueCount = Object.values(progress).filter((item) => !item.nextReviewAt || item.nextReviewAt <= new Date().toISOString()).length;
  const grammarCount = items.filter((item) => item.deck === 'grammar_expression').length;
  const vocabularyCount = items.filter((item) => item.deck !== 'grammar_expression').length;
  const plannedTaskCount = studyPlan.tasks.length;
  const syncedWorkCount = captures.length + drafts.length;
  const moduleCount = (view: AppView) => modules.find((module) => module.view === view)?.count ?? 0;
  const activeGroupKey = groupKey ?? null;
  const setActiveGroupKey = (key: string | null) => { window.location.hash = key ? `#/mixed/tips/${key}` : '#/mixed/tips'; };
  const moduleEntries: PracticeEntry[] = [
    { key: 'vocabulary', title: labels.navVocabulary, body: '单词、汉字、读音', count: vocabularyCount || moduleCount('vocabulary'), icon: Languages, tone: 'green', action: () => onNavigate('vocabulary') },
    { key: 'grammar', title: labels.navGrammar, body: '学习句子怎么说', count: grammarCount || moduleCount('grammar'), icon: Brain, tone: 'orange', action: () => onNavigate('grammar') },
    { key: 'listening', title: labels.navListening, body: '听一听，选出答案', count: listeningQuestions.length || moduleCount('listening'), icon: Headphones, tone: 'blue', action: () => onNavigate('listening') },
    { key: 'reading', title: labels.navReading, body: '读一读，回答问题', count: readingQuestions.length || moduleCount('reading'), icon: BookOpenText, tone: 'mint', action: () => onNavigate('reading') },
  ];
  const groups: PracticeGroup[] = [
    {
      key: 'topics', title: '专项练习', body: '按教材、汉字或语法主题练一套',
      count: topicEntries.length, icon: BookOpenText, tone: 'mint',
      entries: topicEntries,
    },
    {
      key: 'modules',
      title: '分项学习',
      body: '单词、语法、听力、阅读',
      count: moduleEntries.reduce((total, entry) => total + entry.count, 0),
      icon: Languages,
      tone: 'green',
      entries: moduleEntries,
    },
    {
      key: 'exam',
      title: '做题练习',
      body: '今日练习、综合练习和模拟考试',
      count: questions.length + plannedTaskCount,
      icon: Layers3,
      tone: 'purple',
      entries: [
        { key: 'daily', title: '今日练习', body: '开始今天准备好的题目', count: dueCount, icon: RotateCcw, tone: 'blue', action: () => onNavigate('daily-practice') },
        { key: 'drafts', title: '待确认的练习', body: '先检查新题目，确认后再开始', count: drafts.length, icon: FileCheck2, tone: 'yellow', action: () => onNavigate('drafts') },
        { key: 'mixed', title: '综合练习', body: '单词和句子一起练', count: questions.length, icon: Layers3, tone: 'purple', action: onStart },
        { key: 'mock', title: '模拟考试', body: '按考试节奏练一套', count: plannedTaskCount, icon: FileCheck2, tone: 'gray', action: onStartMock },
      ],
    },
    {
      key: 'materials',
      title: '新闻学习',
      body: '用新闻练习阅读和听力',
      action: () => onNavigate('news-cycle'),
      count: syncedWorkCount + items.length,
      icon: NotebookTabs,
      tone: 'yellow',
      entries: [
        { key: 'news', title: '新闻练习', body: '用新闻材料练读听', count: syncedWorkCount, icon: NotebookTabs, tone: 'yellow', action: () => onNavigate('news-cycle') },
      ],
    },
  ];
  const activeGroup = activeGroupKey ? groups.find((group) => group.key === activeGroupKey) ?? null : null;

  return (
    <main className="ledger-mixed ledger-practice-center">
      <header className={`practice-simple-heading gentle-section-heading${activeGroup ? ' has-active-group' : ''}`}>
        {activeGroup ? <button type="button" aria-label="返回练习" onClick={() => setActiveGroupKey(null)}><ChevronLeft size={24} aria-hidden="true" /></button> : null}
        <div>
          <p>练习</p>
          <h1>{activeGroup ? activeGroup.title : '你想练什么？'}</h1>
          {!activeGroup ? <span>选一种方式开始。</span> : null}
        </div>
      </header>

      {activeGroup ? (
        <>
          {activeGroup.key === 'topics' ? <TopicPracticeList entries={topicEntries} /> : (
            <section className="ledger-practice-center-grid" aria-label={`${activeGroup.title}入口`}>
              {activeGroup.entries.map((card) => (
                <PracticeCenterCard key={card.key} icon={card.icon} title={card.title} body={card.body} count={card.count} tone={card.tone} onClick={card.action} />
              ))}
            </section>
          )}
        </>
      ) : (
        <section className="ledger-practice-center-grid" aria-label="练习分类">
          {groups.map((group) => (
            <PracticeCenterCard
              key={group.key}
              icon={group.icon}
              title={group.title}
              body={group.body}
              count={group.count}
              tone={group.tone}
              onClick={group.action ?? (() => setActiveGroupKey(group.key))}
            />
          ))}
        </section>
      )}

    </main>
  );
}

function TopicPracticeList({ entries }: { entries: PracticeEntry[] }) {
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(0);
  const filtered = entries.filter((entry) =>
    (status === 'all' || entry.status === status)
    && entry.title.normalize('NFKC').toLocaleLowerCase().includes(query.trim().normalize('NFKC').toLocaleLowerCase())
  ).sort((a, b) => sort === 'title'
    ? a.title.localeCompare(b.title, 'zh-CN', { numeric: true })
    : (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  const pageSize = 8;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const mobileList = useMobileList(filtered.length, `${query}|${status}|${sort}`);
  const visibleEntries = mobileList.mobile ? filtered.slice(0, mobileList.visible) : filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const mobilePageEnd = Math.min(mobileList.visible, filtered.length);
  return (
    <section className="topic-library" aria-label="专项练习列表">
      <div className={`topic-library-tools${searchOpen || query ? ' is-search-open' : ''}`}>
        <label className="topic-library-search"><span className="sr-only">搜索专项练习</span><input type="search" placeholder="搜索标题，如汉字、N1、限定" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label>
        <label><span className="sr-only">排序</span><select aria-label="排序" value={sort} onChange={(event) => { setSort(event.target.value); setPage(0); }}><option value="recent">最近更新</option><option value="title">标题顺序</option></select></label>
        <button type="button" className="topic-library-search-toggle" aria-label={searchOpen || query ? '关闭搜索' : '搜索专项练习'} aria-pressed={searchOpen || Boolean(query)} onClick={() => {
          if (searchOpen || query) {
            setQuery('');
            setPage(0);
            setSearchOpen(false);
            return;
          }
          setSearchOpen(true);
        }}>{searchOpen || query ? <X size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}</button>
      </div>
      <div className="topic-library-filters" aria-label="练习状态">
        {[['all', '全部'], ['ready', '可练习'], ['pending', '待确认']].map(([value, label]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => { setStatus(value); setPage(0); }}>{label}</button>)}
        <span role="status">{filtered.length} 套</span>
      </div>
      {filtered.length ? <ul className="topic-library-rows">
        {visibleEntries.map((entry) => {
          const isReady = entry.status === 'ready';
          const actionLabel = isReady ? '开始' : '查看';
          const statusLabel = isReady ? '可练习' : '待确认';
          const Icon = isReady ? PlayCircle : CheckCircle2;
          return <li key={entry.key}>
          <button className="topic-library-row" type="button" onClick={entry.action}>
            <span className={`topic-library-icon is-${entry.status ?? 'pending'}`}><Icon size={26} aria-hidden="true" /></span>
            <span className="topic-library-copy">
              <strong>{entry.title}</strong>
              <small>
                <span>{entry.body}</span>
                {entry.updatedAt ? <time dateTime={entry.updatedAt}>{new Date(entry.updatedAt).toLocaleDateString('zh-CN')}</time> : null}
              </small>
            </span>
            <span className={`topic-library-status is-${entry.status ?? 'pending'}`}>{statusLabel}</span>
            <span className="topic-library-action">{actionLabel}<ChevronRight size={18} aria-hidden="true" /></span>
          </button>
        </li>;
        })}
      </ul> : <p className="topic-library-empty">{entries.length ? '没有找到匹配的练习，试试其他关键词或状态。' : '还没有专项练习。根据想练的内容生成草稿，确认后就可以开始。'}</p>}
      {mobileList.mobile && filtered.length ? <div ref={mobileList.setSentinel} className="mobile-list-end topic-library-mobile-end" role="status">{mobilePageEnd < filtered.length ? '上拉查看更多' : '已经到底了'}</div> : null}
      {!mobileList.mobile && pages > 1 ? <nav className="topic-library-pager" aria-label="专项练习分页"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button><span aria-live="polite">{currentPage + 1} / {pages}</span><button type="button" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>下一页</button></nav> : null}
    </section>
  );
}

function PracticeCenterCard({ icon: Icon, title, body, tone, isActive, onClick }: {
  icon: LucideIcon;
  title: string;
  body: string;
  count: number;
  tone: string;
  isActive?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`ledger-practice-card is-${tone}${isActive ? ' is-active' : ''}`} onClick={onClick}>
      <span><Icon size={28} /></span>
      <strong>{title}</strong>
      <small>{body}</small>
      <ArrowRight size={20} />
    </button>
  );
}

type CombinedEntry = {
  id: string;
  module: AppView;
  title: string;
  subtitle?: string;
  createdAt?: string;
  level?: string;
  tags: string[];
  questionCount: number;
};

export function MixedEntryIndexPanel({
  labels,
  locale,
  items,
  listeningQuestions,
  readingQuestions,
  onOpenModule,
}: {
  labels: Record<string, string>;
  locale: string;
  items: VocabItem[];
  listeningQuestions: ListeningQuestion[];
  readingQuestions: ReadingQuestion[];
  onOpenModule: (view: AppView) => void;
}) {
  const entries = combinedEntries(items, listeningQuestions, readingQuestions, labels);
  const [pageIndex, setPageIndex] = useState(0);
  const pageCount = Math.max(1, Math.ceil(entries.length / MIXED_ENTRY_PAGE_SIZE));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const pageStart = currentPage * MIXED_ENTRY_PAGE_SIZE;
  const pageItems = entries.slice(pageStart, pageStart + MIXED_ENTRY_PAGE_SIZE);
  const pageEnd = pageStart + pageItems.length;
  const counts = {
    vocabulary: entries.filter((entry) => entry.module === 'vocabulary').length,
    grammar: entries.filter((entry) => entry.module === 'grammar').length,
    listening: entries.filter((entry) => entry.module === 'listening').length,
    reading: entries.filter((entry) => entry.module === 'reading').length,
  };

  useEffect(() => {
    setPageIndex((index) => Math.min(index, pageCount - 1));
  }, [pageCount]);

  return (
    <section className="min-w-0 overflow-hidden bg-white md:rounded-lg md:border md:border-[#d8cdbc] md:shadow-sm">
      <div className="border-b border-[#e5ddd1] px-4 py-4 md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[#a84269]">{labels.navMixed}</p>
            <h2 className="text-xl font-black text-[#27312c]">{labels.mixedHubAllEntries}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CountPill label={labels.navVocabulary} value={counts.vocabulary} />
            <CountPill label={labels.navGrammar} value={counts.grammar} />
            <CountPill label={labels.navListening} value={counts.listening} />
            <CountPill label={labels.navReading} value={counts.reading} />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-sm">
          <thead className="bg-[#f3f6f1] text-xs font-semibold text-[#5b665f]">
            <tr>
              <th className="w-[12%] px-4 py-3">{labels.mixedHubEntryColumnModule}</th>
              <th className="w-[28%] px-3 py-3">{labels.entryColumnItem}</th>
              <th className="w-[17%] px-3 py-3">{labels.entryColumnCreated}</th>
              <th className="w-[9%] px-3 py-3">{labels.entryColumnLevel}</th>
              <th className="w-[20%] px-3 py-3">{labels.entryColumnTags}</th>
              <th className="w-[7%] px-3 py-3">{labels.entryColumnQuestions}</th>
              <th className="w-[7%] px-3 py-3 text-right"><span className="sr-only">{labels.entryOpen}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ece4d8]">
            {pageItems.map((entry) => (
              <tr key={`${entry.module}-${entry.id}`} className="bg-white hover:bg-[#fbf8f2]">
                <td className="px-4 py-3 align-top">
                  <ModuleBadge module={entry.module} labels={labels} />
                </td>
                <td className="px-3 py-3 align-top">
                  <button type="button" onClick={() => onOpenModule(entry.module)} className="block min-w-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24473f]">
                    <span className="block break-words text-base font-semibold text-[#173d35]">{entry.title}</span>
                    {entry.subtitle ? <span className="mt-1 block break-words text-xs font-semibold text-[#856033]">{entry.subtitle}</span> : null}
                  </button>
                </td>
                <td className="px-3 py-3 align-top text-[#4d5751]">{formatEntryDate(entry.createdAt, locale)}</td>
                <td className="px-3 py-3 align-top">
                  <span className="rounded bg-[#f1eee8] px-2 py-1 text-xs font-semibold text-[#584f43]">{entry.level ?? '-'}</span>
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="flex min-w-0 flex-wrap gap-1.5">
                    {entry.tags.length ? entry.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="max-w-full truncate rounded bg-[#e8f0eb] px-2 py-1 text-xs font-semibold text-[#31564c]" title={tag}>{tag}</span>
                    )) : <span className="text-xs font-semibold text-[#8a8175]">-</span>}
                  </div>
                </td>
                <td className="px-3 py-3 align-top font-semibold text-[#3f4b45]">{entry.questionCount}</td>
                <td className="px-3 py-3 align-top text-right">
                  <button type="button" onClick={() => onOpenModule(entry.module)} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#ead1dc] bg-white text-[#a84269] hover:bg-[#fff0f5]" aria-label={`${labels.entryOpen}: ${entry.title}`} title={labels.entryOpen}>
                    <ArrowRight size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5ddd1] px-4 py-3 text-sm text-[#59645e] md:px-5">
        <span className="font-semibold">
          {entries.length ? `${pageStart + 1}-${pageEnd}` : '0'} / {entries.length} {labels.items}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={labels.entryPagePrev}
            title={labels.entryPagePrev}
            disabled={currentPage === 0}
            onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#c8bcae] bg-white text-[#24473f] hover:bg-[#f2f6f1] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-14 text-center font-semibold text-[#34443c]">{currentPage + 1} / {pageCount}</span>
          <button
            type="button"
            aria-label={labels.entryPageNext}
            title={labels.entryPageNext}
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPageIndex((index) => Math.min(pageCount - 1, index + 1))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#c8bcae] bg-white text-[#24473f] hover:bg-[#f2f6f1] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}

function combinedEntries(items: VocabItem[], listeningQuestions: ListeningQuestion[], readingQuestions: ReadingQuestion[], labels: Record<string, string>) {
  const itemEntries: CombinedEntry[] = items.map((item) => {
    const module = item.deck === 'grammar_expression' ? 'grammar' : 'vocabulary';
    return {
      id: item.id,
      module,
      title: item.original,
      subtitle: item.reading,
      createdAt: item.input_at ?? item.date,
      level: item.jlpt_level,
      tags: [
        ...(item.question_kinds ?? []).map((kind) => questionKindLabel(kind, labels)),
        ...(item.tags ?? []).map((tag) => tag === 'mcp-draft' ? labels.entryTagDraft : tag === 'codex-chat-review' ? labels.entryTagChatReview : tag),
      ].filter(Boolean),
      questionCount: item.question_kinds?.length || item.practice_questions?.length || 0,
    };
  });
  const listeningEntries: CombinedEntry[] = listeningQuestions.map((question) => ({
    id: question.id,
    module: 'listening',
    title: question.title,
    subtitle: question.question,
    createdAt: question.createdAt,
    tags: [question.questionTypeId],
    questionCount: 1,
  }));
  const readingEntries: CombinedEntry[] = readingQuestions.map((question) => ({
    id: question.id,
    module: 'reading',
    title: question.title,
    subtitle: question.question,
    createdAt: question.createdAt,
    tags: [labels.navReading],
    questionCount: 1,
  }));
  return [...itemEntries, ...listeningEntries, ...readingEntries]
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || a.title.localeCompare(b.title, 'ja'));
}

function questionKindLabel(kind: string, labels: Record<string, string>) {
  if (kind === 'grammar') return labels.grammar;
  if (kind === 'meaning') return labels.meaning;
  if (kind === 'moji_goi') return labels.mojiGoi;
  if (kind === 'kana_to_kanji') return labels.kanaToKanji;
  if (kind === 'kanji_to_kana') return labels.kanjiToKana;
  return kind;
}

function formatEntryDate(value: string | undefined, locale: string) {
  return value ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '-';
}

function CountPill({ label, value }: { label: string; value: number }) {
  return <span className="rounded-md bg-[#e8f0eb] px-3 py-1 text-sm font-semibold text-[#24473f]">{label}: {value}</span>;
}

function ModuleBadge({ module, labels }: { module: AppView; labels: Record<string, string> }) {
  const text = module === 'grammar'
    ? labels.navGrammar
    : module === 'listening'
      ? labels.navListening
      : module === 'reading'
        ? labels.navReading
        : labels.navVocabulary;
  return <span className="rounded bg-[#fff8df] px-2 py-1 text-xs font-bold text-[#775516]">{text}</span>;
}
