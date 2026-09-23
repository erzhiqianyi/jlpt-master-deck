import { NavigationCard } from '../../components/NavigationCard';
import { ShareButton } from '../../components/ShareButton';
import { LearningList, LearningListRow, LearningListHeader, LearningListSearch, LearningListPagination, LearningListFrame } from '../../components/LearningList';
import { Play, BookOpenText, Brain, CheckCircle2, ChevronLeft, ChevronRight, FileCheck2, Headphones, Languages, Layers3, MessagesSquare, Mic, NotebookTabs, RotateCcw, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DialoguePracticePanel } from './DialoguePracticePanel';
import { OpinionPracticePanel } from './OpinionPracticePanel';
import { opinionPractices } from '../../data/opinionPractice';
import { dialoguePractices } from '../../data/dialoguePractice';
import { useMobileList } from '../../hooks/useMobileList';
import { buildQuestionIndex, questionKindsForItem } from '../../domain/questions';
import type { AppView, DraftSummary, LearningCapture, ListeningQuestion, ProgressState, Question, ReadingQuestion, StudyPlanDocument, VocabItem } from '../../types';

type ModuleSummary = { view: AppView; title: string; body: string; count: number };
type PracticeEntry = { reference?: string; description?: string; share?: (description: string) => Promise<void>; status?: 'ready' | 'pending'; updatedAt?: string; key: string; title: string; body: string; count: number; icon: LucideIcon; tone: string; action: () => void; start?: () => void };
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
  onStartModule,
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
  onStartModule: (view: AppView) => void;
}) {
  // Never-answered items have no progress entry but are still due today, same as memory review.
  const now = new Date().toISOString();
  const dueCount = items.filter((item) => (progress[item.id]?.nextReviewAt ?? '') <= now).length;
  const grammarCount = items.filter((item) => item.deck === 'grammar_expression').length;
  const vocabularyCount = items.filter((item) => item.deck !== 'grammar_expression').length;
  const plannedTaskCount = studyPlan.tasks.length;
  const syncedWorkCount = captures.length + drafts.length;
  const moduleCount = (view: AppView) => modules.find((module) => module.view === view)?.count ?? 0;
  const activeGroupKey = groupKey?.split('/')[0] ?? null;
  const opinionTopicId = activeGroupKey === 'opinion' ? groupKey?.split('/')[1] : undefined;
  const opinionTopic = opinionPractices.find((item) => item.id === opinionTopicId);
  const setActiveGroupKey = (key: string | null) => { window.location.hash = key ? `#/mixed/tips/${key}` : '#/mixed/tips'; };
  const moduleEntries: PracticeEntry[] = [
    { key: 'vocabulary', title: labels.navVocabulary, body: '单词、汉字、读音', count: vocabularyCount || moduleCount('vocabulary'), icon: Languages, tone: 'green', action: () => onNavigate('vocabulary'), start: () => onStartModule('vocabulary') },
    { key: 'grammar', title: labels.navGrammar, body: '学习句子怎么说', count: grammarCount || moduleCount('grammar'), icon: Brain, tone: 'orange', action: () => onNavigate('grammar'), start: () => onStartModule('grammar') },
    { key: 'listening', title: labels.navListening, body: '听一听，选出答案', count: listeningQuestions.length || moduleCount('listening'), icon: Headphones, tone: 'blue', action: () => onNavigate('listening'), start: () => onStartModule('listening') },
    { key: 'reading', title: labels.navReading, body: '读一读，回答问题', count: readingQuestions.length || moduleCount('reading'), icon: BookOpenText, tone: 'mint', action: () => onNavigate('reading'), start: () => onStartModule('reading') },
  ];
  // Everything that is not one of the four core modules lives in one flat list below the module cards.
  const moreEntries: PracticeEntry[] = [
    { key: 'mixed', title: '综合练习', body: '单词和句子一起练', count: questions.length, icon: Layers3, tone: 'purple', action: onStart },
    { key: 'topics', title: '专项练习', body: '按教材、汉字或语法主题练一套', count: topicEntries.length, icon: BookOpenText, tone: 'mint', action: () => setActiveGroupKey('topics') },
    { key: 'daily', title: '今日练习', body: '开始今天准备好的题目', count: dueCount, icon: RotateCcw, tone: 'blue', action: () => onNavigate('daily-practice') },
    { key: 'news', title: '新闻学习', body: '用新闻材料练阅读和听力', count: syncedWorkCount, icon: NotebookTabs, tone: 'yellow', action: () => onNavigate('news-cycle') },
    { key: 'dialogue', title: '对话练习', body: '按人物关系练习开场、回应和收尾', count: dialoguePractices.length, icon: MessagesSquare, tone: 'blue', action: () => setActiveGroupKey('dialogue') },
    { key: 'opinion', title: '意见表达', body: '用约 2 分钟说清立场、理由和例子', count: opinionPractices.length, icon: Mic, tone: 'mint', action: () => setActiveGroupKey('opinion') },
    { key: 'mock', title: '模拟考试', body: '按考试节奏练一套', count: plannedTaskCount, icon: FileCheck2, tone: 'gray', action: onStartMock },
    { key: 'drafts', title: '练习草稿', body: '查看和确认准备好的题目', count: drafts.length, icon: FileCheck2, tone: 'yellow', action: () => onNavigate('drafts') },
  ];
  const groups: PracticeGroup[] = [
    { key: 'opinion', title: '意见表达', body: '用约2分钟说清立场、理由和例子', count: opinionPractices.length, icon: Mic, tone: 'mint', entries: [] },
    { key: 'dialogue', title: '对话练习', body: '按人物关系练习开场、回应和收尾', count: dialoguePractices.length, icon: MessagesSquare, tone: 'blue', entries: [] },
    { key: 'topics', title: '专项练习', body: '按教材、汉字或语法主题练一套', count: topicEntries.length, icon: BookOpenText, tone: 'mint', entries: topicEntries },
  ];
  const activeGroup = activeGroupKey ? groups.find((group) => group.key === activeGroupKey) ?? null : null;

  return (
    <main className={`ledger-mixed ledger-practice-center${activeGroupKey === 'topics' ? ' topic-practice-page' : ''}`}>
      {activeGroupKey !== 'topics' && activeGroupKey !== 'dialogue' && !(activeGroupKey === 'opinion' && !opinionTopicId) ? <header className={`practice-simple-heading gentle-section-heading${activeGroup ? ' has-active-group' : ''}`}>
        {activeGroup ? <button type="button" aria-label={opinionTopicId ? '返回意见表达' : '返回练习'} onClick={() => setActiveGroupKey(opinionTopicId ? 'opinion' : null)}><ChevronLeft size={24} aria-hidden="true" /></button> : null}
        <div>
          <p>练习</p>
          <h1>{opinionTopic?.title ?? (activeGroup ? activeGroup.title : '你想练什么？')}</h1>
          {!activeGroup ? <span>选一种方式开始。</span> : null}
        </div>
      </header> : null}

      {activeGroup ? (
        activeGroup.key === 'opinion' ? <OpinionPracticePanel topicId={opinionTopicId} /> : activeGroup.key === 'dialogue' ? <DialoguePracticePanel /> : <TopicPracticeList entries={topicEntries} />
      ) : (
        <>
          <section className="navigation-grid practice-core-grid" aria-label="分项学习">
            {moduleEntries.map((card) => <PracticeModuleCard key={card.key} entry={card} />)}
          </section>
          <section className="navigation-section" aria-labelledby="more-practice-title">
            <h2 id="more-practice-title">更多练习</h2>
            <div className="navigation-grid">
              {moreEntries.map((entry) => <PracticeModuleCard key={entry.key} entry={entry} />)}
            </div>
          </section>
        </>
      )}

    </main>
  );
}

function TopicPracticeList({ entries }: { entries: PracticeEntry[] }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(0);
  const filtered = entries.filter((entry) =>
    (status === 'all' || entry.status === status)
    && `${entry.reference ?? ''} ${entry.title}`.normalize('NFKC').toLocaleLowerCase().includes(query.trim().normalize('NFKC').toLocaleLowerCase())
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
    <LearningListFrame className="topic-library topic-practice-list" label="专项练习列表">
      <LearningListHeader title="专项练习" count={`${entries.length} 套`} search={<LearningListSearch value={query} label="搜索专项练习" onChange={(value) => { setQuery(value); setPage(0); }}/> }>
      <div className="topic-library-filters" aria-label="练习状态">
        {[['all', '全部'], ['ready', '可练习'], ['pending', '待确认']].map(([value, label]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => { setStatus(value); setPage(0); }}>{label}</button>)}

      </div>
        <label className="topic-panel-sort"><span className="sr-only">排序</span><select aria-label="排序" value={sort} onChange={(event) => { setSort(event.target.value); setPage(0); }}><option value="recent">最近更新</option><option value="title">标题顺序</option></select></label>
      </LearningListHeader>
      {query || status !== 'all' ? <div className="topic-search-summary" role="status">找到 {filtered.length} 套练习<button type="button" onClick={() => { setQuery(''); setStatus('all'); setPage(0); }}>重置筛选</button></div> : null}
      <LearningList hasActions columnLabels={["练习", "题数", "状态"]}>{visibleEntries.map((entry) => <LearningListRow compact inlineActions key={entry.key} title={entry.title} references={[entry.reference]} status={entry.status === "ready" ? "可练习" : "待确认"} secondary={entry.share ? <ShareButton iconOnly onShare={entry.share} description={entry.description} /> : undefined} description={entry.count ? `${entry.count} 题` : undefined} actionIcon={entry.status === 'ready' ? <Play size={20} aria-hidden="true"/> : <CheckCircle2 size={20} aria-hidden="true"/>} actionLabel={entry.status === 'ready' ? '练习' : '确认'} onOpen={entry.action}/>)}</LearningList>
      {mobileList.mobile && filtered.length ? <div ref={mobileList.setSentinel} className="catalog-notice" role="status">{mobilePageEnd < filtered.length ? null : '已经到底了'}</div> : null}
      {!mobileList.mobile && pages > 1 ? <LearningListPagination page={currentPage} pages={pages} onChange={setPage}/> : null}
    </LearningListFrame>
  );
}

function PracticeModuleCard({ entry }: { entry: PracticeEntry }) {
  const Icon = entry.icon;
  return <NavigationCard icon={<Icon size={24} />} title={entry.title}
    description={entry.count ? `${entry.body} · ${entry.count} 项` : entry.body}
    onOpen={entry.action} onStart={entry.start} />;
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
    <LearningListFrame className="learning-catalog" label={labels.mixedHubAllEntries}>
      <LearningListHeader title={labels.mixedHubAllEntries} count={`${entries.length} ${labels.items}`}>
        <div className="list-tools">
          <CountPill label={labels.navVocabulary} value={counts.vocabulary} />
          <CountPill label={labels.navGrammar} value={counts.grammar} />
          <CountPill label={labels.navListening} value={counts.listening} />
          <CountPill label={labels.navReading} value={counts.reading} />
        </div>
      </LearningListHeader>
      <LearningList locale={locale} columnLabels={locale === "ja" ? ["項目", "概要", "モジュール"] : locale === "en" ? ["Entry", "Summary", "Module"] : ["条目", "概要", "模块"]}>{pageItems.map((entry) => <LearningListRow key={`${entry.module}-${entry.id}`} title={entry.title} description={entry.subtitle} status={<ModuleBadge module={entry.module} labels={labels}/>} locale={locale} onOpen={() => onOpenModule(entry.module)}/>)}</LearningList>
      {pageCount > 1 ? <LearningListPagination page={currentPage} pages={pageCount} onChange={(next) => setPageIndex(next)} summary={`${entries.length ? `${pageStart + 1}-${pageEnd}` : '0'} / ${entries.length} ${labels.items}`} previous={labels.entryPagePrev} next={labels.entryPageNext} /> : null}
    </LearningListFrame>
  );
}

function combinedEntries(items: VocabItem[], listeningQuestions: ListeningQuestion[], readingQuestions: ReadingQuestion[], labels: Record<string, string>) {
  const itemEntries: CombinedEntry[] = items.map((item) => {
    const module = item.deck === 'grammar_expression' ? 'grammar' : 'vocabulary';
    const kinds = questionKindsForItem(item);
    return {
      id: item.id,
      module,
      title: item.original,
      subtitle: item.reading,
      createdAt: item.input_at ?? item.date,
      level: item.jlpt_level,
      tags: [
        ...kinds.map((kind) => questionKindLabel(kind, labels)),
        ...(item.tags ?? []).map((tag) => tag === 'mcp-draft' ? labels.entryTagDraft : tag === 'codex-chat-review' ? labels.entryTagChatReview : tag),
      ].filter(Boolean),
      questionCount: buildQuestionIndex([item]).length,
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
  if (kind === 'word_formation') return labels.wordFormation;
  if (kind === 'usage') return labels.usage;
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
