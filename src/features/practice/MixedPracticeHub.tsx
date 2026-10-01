import type { PracticeModule } from '../../domain/practiceModules.mjs';
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
import type { AppView, DraftSummary, LearningCapture, ListeningQuestion, Locale, ProgressState, Question, ReadingQuestion, StudyPlanDocument, VocabItem } from '../../types';

type ModuleSummary = { view: AppView; title: string; body: string; count: number };
type PracticeEntry = { modules?: PracticeModule[]; reference?: string; description?: string; sourceSummary?: string; share?: (description: string) => Promise<void>; status?: 'ready' | 'pending'; updatedAt?: string; key: string; title: string; body: string; count: number; icon: LucideIcon; tone: string; action: () => void; start?: () => void };
type PracticeGroup = { action?: () => void; key: string; title: string; body: string; count: number; icon: LucideIcon; tone: string; entries: PracticeEntry[] };
const MIXED_ENTRY_PAGE_SIZE = 8;

export function MixedPracticeHub({
  topicEntries = [],
  groupKey,
  labels,
  locale,
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
  locale: Locale;
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
  const copy = practiceCopy(locale);
  const moduleEntries: PracticeEntry[] = [
    { key: 'vocabulary', title: labels.navVocabulary, body: copy.vocabularyBody, count: vocabularyCount || moduleCount('vocabulary'), icon: Languages, tone: 'green', action: () => onNavigate('vocabulary'), start: () => onStartModule('vocabulary') },
    { key: 'grammar', title: labels.navGrammar, body: copy.grammarBody, count: grammarCount || moduleCount('grammar'), icon: Brain, tone: 'orange', action: () => onNavigate('grammar'), start: () => onStartModule('grammar') },
    { key: 'listening', title: labels.navListening, body: copy.listeningBody, count: listeningQuestions.length || moduleCount('listening'), icon: Headphones, tone: 'blue', action: () => onNavigate('listening'), start: () => onStartModule('listening') },
    { key: 'reading', title: labels.navReading, body: copy.readingBody, count: readingQuestions.length || moduleCount('reading'), icon: BookOpenText, tone: 'mint', action: () => onNavigate('reading'), start: () => onStartModule('reading') },
  ];
  // Everything that is not one of the four core modules lives in one flat list below the module cards.
  const moreEntries: PracticeEntry[] = [
    { key: 'mixed', title: copy.mixed, body: copy.mixedBody, count: questions.length, icon: Layers3, tone: 'purple', action: onStart },
    { key: 'topics', title: copy.topics, body: copy.topicsBody, count: topicEntries.length, icon: BookOpenText, tone: 'mint', action: () => setActiveGroupKey('topics') },
    { key: 'daily', title: copy.daily, body: copy.dailyBody, count: dueCount, icon: RotateCcw, tone: 'blue', action: () => onNavigate('daily-practice') },
    { key: 'news', title: copy.news, body: copy.newsBody, count: syncedWorkCount, icon: NotebookTabs, tone: 'yellow', action: () => onNavigate('news-cycle') },
    { key: 'dialogue', title: copy.dialogue, body: copy.dialogueBody, count: dialoguePractices.length, icon: MessagesSquare, tone: 'blue', action: () => setActiveGroupKey('dialogue') },
    { key: 'opinion', title: copy.opinion, body: copy.opinionBody, count: opinionPractices.length, icon: Mic, tone: 'mint', action: () => setActiveGroupKey('opinion') },
    { key: 'mock', title: copy.mock, body: copy.mockBody, count: plannedTaskCount, icon: FileCheck2, tone: 'gray', action: onStartMock },
    { key: 'drafts', title: copy.drafts, body: copy.draftsBody, count: drafts.length, icon: FileCheck2, tone: 'yellow', action: () => onNavigate('drafts') },
  ];
  const groups: PracticeGroup[] = [
    { key: 'opinion', title: copy.opinion, body: copy.opinionBody, count: opinionPractices.length, icon: Mic, tone: 'mint', entries: [] },
    { key: 'dialogue', title: copy.dialogue, body: copy.dialogueBody, count: dialoguePractices.length, icon: MessagesSquare, tone: 'blue', entries: [] },
    { key: 'topics', title: copy.topics, body: copy.topicsBody, count: topicEntries.length, icon: BookOpenText, tone: 'mint', entries: topicEntries },
  ];
  const activeGroup = activeGroupKey ? groups.find((group) => group.key === activeGroupKey) ?? null : null;

  return (
    <main className={`ledger-mixed ledger-practice-center${activeGroupKey === 'topics' ? ' topic-practice-page' : ''}`}>
      {activeGroupKey !== 'topics' && activeGroupKey !== 'dialogue' && !(activeGroupKey === 'opinion' && !opinionTopicId) ? <header className={`practice-simple-heading gentle-section-heading${activeGroup ? ' has-active-group' : ''}`}>
        {activeGroup ? <button type="button" aria-label={opinionTopicId ? copy.backOpinion : copy.backPractice} onClick={() => setActiveGroupKey(opinionTopicId ? 'opinion' : null)}><ChevronLeft size={24} aria-hidden="true" /></button> : null}
        <div>
          <p>{copy.practice}</p>
          <h1>{opinionTopic?.title ?? (activeGroup ? activeGroup.title : copy.whatToPractice)}</h1>
          {!activeGroup ? <span>{copy.choose}</span> : null}
        </div>
      </header> : null}

      {activeGroup ? (
        activeGroup.key === 'opinion' ? <OpinionPracticePanel topicId={opinionTopicId} /> : activeGroup.key === 'dialogue' ? <DialoguePracticePanel /> : <TopicPracticeList entries={topicEntries} locale={locale} />
      ) : (
        <>
          <section className="navigation-grid practice-core-grid" aria-label={copy.modules}>
            {moduleEntries.map((card) => <PracticeModuleCard key={card.key} entry={card} unit={copy.items} />)}
          </section>
          <section className="navigation-section" aria-labelledby="more-practice-title">
            <h2 id="more-practice-title">{copy.morePractice}</h2>
            <div className="navigation-grid">
              {moreEntries.map((entry) => <PracticeModuleCard key={entry.key} entry={entry} unit={copy.items} />)}
            </div>
          </section>
        </>
      )}

    </main>
  );
}

function TopicPracticeList({ entries, locale }: { entries: PracticeEntry[]; locale: Locale }) {
  const copy = practiceCopy(locale);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [module, setModule] = useState<PracticeModule | 'all'>('all');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(0);
  const filtered = entries.filter((entry) =>
    (status === 'all' || entry.status === status)
    && (module === 'all' || entry.modules?.includes(module))
    && `${entry.reference ?? ''} ${entry.title}`.normalize('NFKC').toLocaleLowerCase().includes(query.trim().normalize('NFKC').toLocaleLowerCase())
  ).sort((a, b) => sort === 'title'
    ? a.title.localeCompare(b.title, locale, { numeric: true })
    : (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  const pageSize = 8;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const mobileList = useMobileList(filtered.length, `${query}|${status}|${module}|${sort}`);
  const visibleEntries = mobileList.mobile ? filtered.slice(0, mobileList.visible) : filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const mobilePageEnd = Math.min(mobileList.visible, filtered.length);
  return (
    <LearningListFrame className="topic-library topic-practice-list" label={copy.topicList}>
      <LearningListHeader title={copy.topics} count={`${entries.length} ${copy.sets}`} search={<LearningListSearch value={query} label={copy.searchTopics} placeholder={copy.searchTopics} locale={locale} onChange={(value) => { setQuery(value); setPage(0); }}/> }>
      <div className="topic-library-filters" role="group" aria-label={copy.questionType}>
        {(['all', 'grammar', 'listening', 'vocabulary', 'reading'] as const).map((value) => <button key={value} type="button" aria-pressed={module === value} onClick={() => { setModule(value); setPage(0); }}>{value === 'all' ? copy.all : copy[value]}</button>)}
      </div>
      <div className="topic-library-filters" aria-label={copy.practiceStatus}>
        {([['all', copy.all], ['ready', copy.ready], ['pending', copy.pending]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => { setStatus(value); setPage(0); }}>{label}</button>)}

      </div>
        <label className="topic-panel-sort"><span className="sr-only">{copy.sort}</span><select aria-label={copy.sort} value={sort} onChange={(event) => { setSort(event.target.value); setPage(0); }}><option value="recent">{copy.recent}</option><option value="title">{copy.titleOrder}</option></select></label>
      </LearningListHeader>
      {query || status !== 'all' || module !== 'all' ? <div className="topic-search-summary" role="status">{copy.results(filtered.length)}<button type="button" onClick={() => { setQuery(''); setStatus('all'); setModule('all'); setPage(0); }}>{copy.reset}</button></div> : null}
      <LearningList hasActions locale={locale} columnLabels={[copy.practice, copy.countAndSource, copy.status]}>{visibleEntries.map((entry) => <LearningListRow compact inlineActions key={entry.key} title={entry.title} references={[entry.reference]} status={entry.status === "ready" ? copy.ready : copy.pending} locale={locale} secondary={entry.share ? <ShareButton iconOnly onShare={entry.share} description={entry.description} locale={locale} /> : undefined} description={`${entry.count ? `${entry.count} ${copy.questions} · ` : ''}${entry.sourceSummary ?? copy.sourcePending}`} actionIcon={entry.status === 'ready' ? <Play size={20} aria-hidden="true"/> : <CheckCircle2 size={20} aria-hidden="true"/>} actionLabel={entry.status === 'ready' ? copy.practice : copy.confirm} onOpen={entry.action}/>)}</LearningList>
      {mobileList.mobile && filtered.length ? <div ref={mobileList.setSentinel} className="catalog-notice" role="status">{mobilePageEnd < filtered.length ? null : copy.endOfList}</div> : null}
      {!mobileList.mobile && pages > 1 ? <LearningListPagination page={currentPage} pages={pages} onChange={setPage} previous={copy.previous} next={copy.next}/> : null}
    </LearningListFrame>
  );
}

function PracticeModuleCard({ entry, unit }: { entry: PracticeEntry; unit: string }) {
  const Icon = entry.icon;
  return <NavigationCard icon={<Icon size={24} />} title={entry.title}
    description={entry.count ? `${entry.body} · ${entry.count} ${unit}` : entry.body}
    onOpen={entry.action} onStart={entry.start} />;
}

function practiceCopy(locale: Locale) {
  if (locale === 'ja') return {
    questionType: '問題分野', grammar: '文法', listening: '聴解', vocabulary: '単語', reading: '読解',
    vocabularyBody: '単語・漢字・読み方', grammarBody: '文の組み立て方を学ぶ', listeningBody: '聞いて答えを選ぶ', readingBody: '読んで問いに答える',
    mixed: '総合練習', mixedBody: '単語と文を一緒に練習', topics: '分野別練習', topicsBody: '教材・漢字・文法のテーマで練習', daily: '今日の練習', dailyBody: '今日の問題を始める', news: 'ニュース学習', newsBody: 'ニュースで読解と聴解を練習', dialogue: '会話練習', dialogueBody: '場面に合わせて会話を練習', opinion: '意見を述べる練習', opinionBody: '約2分で意見と理由を伝える', mock: '模擬試験', mockBody: '試験のペースで解く', drafts: '練習の下書き', draftsBody: '準備された問題を確認',
    backOpinion: '意見を述べる練習に戻る', backPractice: '練習に戻る', practice: '練習', whatToPractice: '何を練習しますか？', choose: '練習方法を選んでください。', modules: '学習分野', morePractice: 'ほかの練習', items: '件',
    topicList: '分野別練習の一覧', sets: 'セット', searchTopics: '分野別練習を検索', practiceStatus: '練習の状態', all: 'すべて', ready: '練習できる', pending: '確認待ち', sort: '並び替え', recent: '更新順', titleOrder: 'タイトル順', results: (count: number) => `${count} セット見つかりました`, reset: '絞り込みを解除', countAndSource: '問題数・出典', status: '状態', questions: '問', sourcePending: '出典を確認中', confirm: '確認', endOfList: '最後まで表示しました', previous: '前のページ', next: '次のページ',
  };
  if (locale === 'en') return {
    questionType: 'Question category', grammar: 'Grammar', listening: 'Listening', vocabulary: 'Vocabulary', reading: 'Reading',
    vocabularyBody: 'Words, kanji and readings', grammarBody: 'Learn how sentences work', listeningBody: 'Listen and choose an answer', readingBody: 'Read and answer questions',
    mixed: 'Mixed practice', mixedBody: 'Practice words and sentences together', topics: 'Topic practice', topicsBody: 'Practice by textbook, kanji or grammar topic', daily: "Today's practice", dailyBody: 'Start the questions prepared for today', news: 'News study', newsBody: 'Practice reading and listening with news', dialogue: 'Dialogue practice', dialogueBody: 'Practice openings, responses and endings', opinion: 'Opinion practice', opinionBody: 'Explain your view and reasons in about 2 minutes', mock: 'Mock exam', mockBody: 'Practice at exam pace', drafts: 'Practice drafts', draftsBody: 'Review prepared questions',
    backOpinion: 'Back to opinion practice', backPractice: 'Back to practice', practice: 'Practice', whatToPractice: 'What would you like to practice?', choose: 'Choose a way to begin.', modules: 'Study modules', morePractice: 'More practice', items: 'items',
    topicList: 'Topic practice list', sets: 'sets', searchTopics: 'Search topic practice', practiceStatus: 'Practice status', all: 'All', ready: 'Ready', pending: 'Pending review', sort: 'Sort', recent: 'Recently updated', titleOrder: 'Title order', results: (count: number) => `${count} sets found`, reset: 'Reset filters', countAndSource: 'Questions and source', status: 'Status', questions: 'questions', sourcePending: 'Source pending', confirm: 'Confirm', endOfList: 'End of list', previous: 'Previous page', next: 'Next page',
  };
  return {
    questionType: '题型', grammar: '语法', listening: '听力', vocabulary: '单词', reading: '阅读',
    vocabularyBody: '单词、汉字、读音', grammarBody: '学习句子怎么说', listeningBody: '听一听，选出答案', readingBody: '读一读，回答问题',
    mixed: '综合练习', mixedBody: '单词和句子一起练', topics: '专项练习', topicsBody: '按教材、汉字或语法主题练一套', daily: '今日练习', dailyBody: '开始今天准备好的题目', news: '新闻学习', newsBody: '用新闻材料练阅读和听力', dialogue: '对话练习', dialogueBody: '按人物关系练习开场、回应和收尾', opinion: '意见表达', opinionBody: '用约 2 分钟说清立场、理由和例子', mock: '模拟考试', mockBody: '按考试节奏练一套', drafts: '练习草稿', draftsBody: '查看和确认准备好的题目',
    backOpinion: '返回意见表达', backPractice: '返回练习', practice: '练习', whatToPractice: '你想练什么？', choose: '选一种方式开始。', modules: '分项学习', morePractice: '更多练习', items: '项',
    topicList: '专项练习列表', sets: '套', searchTopics: '搜索专项练习', practiceStatus: '练习状态', all: '全部', ready: '可练习', pending: '待确认', sort: '排序', recent: '最近更新', titleOrder: '标题顺序', results: (count: number) => `找到 ${count} 套练习`, reset: '重置筛选', countAndSource: '题数与来源', status: '状态', questions: '题', sourcePending: '来源待确认', confirm: '确认', endOfList: '已经到底了', previous: '上一页', next: '下一页',
  };
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
      createdAt: item.input_at,
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
