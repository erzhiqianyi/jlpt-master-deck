import type { PracticeModule } from '../../domain/practiceModules.mjs';
import './practice-layout.css';
import './primary-practice.css';
import { ModuleActionBar } from '../../components/ModuleActionBar';
import { BatchActionBar, BatchManageButton, useListBatch } from '../../components/ListBatch';
import { LearningList, LearningListRow, LearningListHeader, LearningListSearch, LearningListPagination, LearningListFrame } from '../../components/LearningList';
import { ArrowRight, BookOpenText, ChevronLeft, ChevronRight, FileCheck2, FileText, Layers3, Target, MessagesSquare, Mic, Repeat2, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DialoguePracticePanel } from './DialoguePracticePanel';
import { OpinionPracticePanel } from './OpinionPracticePanel';
import { opinionPractices } from '../../data/opinionPractice';
import { dialoguePractices } from '../../data/dialoguePractice';
import { useMobileList } from '../../hooks/useMobileList';
import { buildQuestionIndex, questionKindsForItem } from '../../domain/questions';
import type { AnswerState, AppView, DailyPractice, DraftSummary, LearningCapture, ListeningQuestion, Locale, PracticeAttempt, ProgressState, Question, ReadingQuestion, StudyPlanDocument, VocabItem } from '../../types';

type ModuleSummary = { view: AppView; title: string; body: string; count: number };
type PracticeEntry = { remove?: () => Promise<void>; completedCount?: number; modules?: PracticeModule[]; reference?: string; description?: string; sourceSummary?: string; share?: (description: string) => Promise<void>; status?: 'ready' | 'pending'; updatedAt?: string; key: string; title: string; body: string; count?: number; icon: LucideIcon; tone: string; action: () => void; start?: () => void };
type PracticeGroup = { action?: () => void; key: string; title: string; body: string; count: number; icon: LucideIcon; tone: string; entries: PracticeEntry[] };
const MIXED_ENTRY_PAGE_SIZE = 8;

export function MixedPracticeHub({
  topicEntries = [], topicCount, topicCompletedCount, mixedQuestionCount, attempts, mockExamCount, mockCompletedCount,
  groupKey, locale, questions, onStart, onStartMock, onTypePractice,
}: {
  onTypePractice?: () => void;
  topicEntries?: PracticeEntry[];
  mixedQuestionCount?: number;
  topicCount?: number;
  topicCompletedCount?: number;
  attempts?: PracticeAttempt[];
  mockExamCount?: number;
  mockCompletedCount?: number;
  dailyPractice?: DailyPractice;
  dailyAnswers?: AnswerState;
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
  const activeGroupKey = groupKey?.split('/')[0] ?? null;
  const opinionTopicId = activeGroupKey === 'opinion' ? groupKey?.split('/')[1] : undefined;
  const opinionTopic = opinionPractices.find(item => item.id === opinionTopicId);
  const setActiveGroupKey = (key: string | null) => { window.location.hash = key ? `#/mixed/tips/${key}` : '#/mixed/tips'; };
  const copy = practiceCopy(locale);
  const mixedRounds = attempts === undefined ? undefined : new Set(attempts.filter(attempt => attempt.view === 'mixed' && Boolean(attempt.completedAt)).map(attempt => attempt.id)).size;
  const topicCountsComplete = (topicCount === undefined || topicCount === topicEntries.length) && topicEntries.every(entry => entry.status === 'pending' || entry.completedCount !== undefined);
  const topicRounds = topicCompletedCount ?? (topicCountsComplete ? topicEntries.reduce((total, entry) => total + (entry.completedCount ?? 0), 0) : undefined);
  const entries = [
    { key: 'topics', title: copy.topics, count: topicCount ?? topicEntries.length, completedCount: topicRounds, unit: copy.sets, icon: BookOpenText, action: () => setActiveGroupKey('topics') },
    ...(onTypePractice ? [{ key: 'types', title: locale === 'zh-CN' ? '题型练习' : locale === 'ja' ? '問題形式別練習' : 'Question type practice', icon: Target, unit: '', action: onTypePractice }] : []),
    { key: 'mixed', title: copy.mixed, count: mixedQuestionCount ?? questions.length, completedCount: mixedRounds, retainedRounds: true, unit: copy.questions, icon: Layers3, action: onStart },
    { key: 'mock', title: copy.mock, count: mockExamCount, completedCount: mockCompletedCount, unit: copy.sets, icon: FileCheck2, action: onStartMock },
  ];
  const groups: PracticeGroup[] = [
    { key: 'opinion', title: copy.opinion, body: copy.opinionBody, count: opinionPractices.length, icon: Mic, tone: 'mint', entries: [] },
    { key: 'dialogue', title: copy.dialogue, body: copy.dialogueBody, count: dialoguePractices.length, icon: MessagesSquare, tone: 'blue', entries: [] },
    { key: 'topics', title: copy.topics, body: copy.topicsBody, count: topicEntries.length, icon: BookOpenText, tone: 'mint', entries: topicEntries },
  ];
  const activeGroup = activeGroupKey ? groups.find(group => group.key === activeGroupKey) ?? null : null;

  return <main className={`ledger-mixed ledger-practice-center primary-practice${activeGroupKey === 'topics' ? ' topic-practice-page' : ''}`} aria-label={copy.practice}>
    {activeGroup?.key === 'opinion' && opinionTopicId ? <header className="practice-simple-heading gentle-section-heading has-active-group">
      <button type="button" aria-label={copy.backOpinion} onClick={() => setActiveGroupKey('opinion')}><ChevronLeft size={24} aria-hidden="true" /></button>
      <h1>{opinionTopic?.title ?? copy.opinion}</h1>
    </header> : null}
    {activeGroup ? activeGroup.key === 'opinion' ? <OpinionPracticePanel topicId={opinionTopicId} /> : activeGroup.key === 'dialogue' ? <DialoguePracticePanel /> : <TopicPracticeList entries={topicEntries} locale={locale} /> :
      <div className="primary-practice-entries">{entries.map(entry => <PracticeModuleCard key={entry.key} entry={entry} locale={locale} />)}</div>}
    {!activeGroup ? <ModuleActionBar locale={locale} label={copy.practice} shortcuts actions={entries.map(entry => ({ key: entry.key, label: entry.title, icon: <entry.icon size={20} />, onClick: entry.action }))} /> : null}
  </main>;
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
  const batch = useListBatch(filtered.map(entry => entry.key));
  const byKey = new Map(entries.map(entry => [entry.key, entry]));
  const batchCopy = locale === 'ja'
    ? { remove: '削除', share: '共有', select: '選択', deleteConfirm: (n: number) => `${n} 件の元の下書きを削除します。元に戻せません。公開済みの練習と解答記録は保持されます。`, shareConfirm: (n: number) => `${n} 件の内容を公開の「発見」に共有します。他の学習者が閲覧・追加できます。` }
    : locale === 'en'
      ? { remove: 'Delete', share: 'Share', select: 'Select', deleteConfirm: (n: number) => `Delete ${n} source drafts permanently? Published practices and answer history are kept.`, shareConfirm: (n: number) => `Share ${n} practices publicly in Discover? Other learners can view and add them.` }
      : { remove: '删除', share: '分享', select: '选择', deleteConfirm: (n: number) => `将删除所选 ${n} 项的来源草稿，并从专项列表移除，无法撤销。已生成的正式练习和答题记录会保留。`, shareConfirm: (n: number) => `将所选 ${n} 套练习及说明发布到公开的「发现」，其他学习者可以查看并加入。待确认的练习不会分享。` };
  const pageSize = 8;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const mobileList = useMobileList(filtered.length, `${query}|${status}|${module}|${sort}`);
  const visibleEntries = mobileList.mobile ? filtered.slice(0, mobileList.visible) : filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const mobilePageEnd = Math.min(mobileList.visible, filtered.length);
  return (
    <LearningListFrame className="topic-library topic-practice-list" label={copy.topicList} locale={locale}>
      <LearningListHeader expandedOnWide title={copy.topics} appliedSummary={query || status !== 'all' || module !== 'all' || sort !== 'recent' ? [query ? `${copy.searchTopics}: ${query}` : '', module !== 'all' ? copy[module] : '', status !== 'all' ? status === 'ready' ? copy.ready : copy.pending : '', sort !== 'recent' ? copy.titleOrder : ''].filter(Boolean).join(' · ') : undefined} onReset={() => { setQuery(''); setStatus('all'); setModule('all'); setSort('recent'); setPage(0); }} search={<LearningListSearch value={query} label={copy.searchTopics} placeholder={copy.searchTopics} locale={locale} onChange={(value) => { setQuery(value); setPage(0); }}/> }>
      <h3 className="primary-topic-filter-title">{copy.questionType}</h3>
      <div className="topic-library-filters" role="group" aria-label={copy.questionType}>
        {(['all', 'grammar', 'listening', 'vocabulary', 'reading'] as const).map((value) => <button key={value} type="button" aria-pressed={module === value} onClick={() => { setModule(value); setPage(0); }}>{value === 'all' ? copy.all : copy[value]}</button>)}
      </div>
      <h3 className="primary-topic-filter-title">{copy.practiceStatus}</h3>
      <div className="topic-library-filters" role="group" aria-label={copy.practiceStatus}>
        {([['all', copy.all], ['ready', copy.ready], ['pending', copy.pending]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => { setStatus(value); setPage(0); }}>{label}</button>)}

      </div>
        <label className="topic-panel-sort"><span>{copy.sort}</span><select aria-label={copy.sort} value={sort} onChange={(event) => { setSort(event.target.value); setPage(0); }}><option value="recent">{copy.recent}</option><option value="title">{copy.titleOrder}</option></select></label>

      </LearningListHeader>

      {entries.some(entry => entry.share || entry.remove) ? <div className="topic-batch-controls">
        <BatchManageButton batch={batch} locale={locale} />
        <BatchActionBar batch={batch} locale={locale} actions={[
          { key: 'delete', label: batchCopy.remove, danger: true, confirm: batchCopy.deleteConfirm, appliesTo: id => Boolean(byKey.get(id)?.remove), run: async id => { await byKey.get(id)!.remove!(); } },
          { key: 'share', label: batchCopy.share, confirm: batchCopy.shareConfirm, appliesTo: id => Boolean(byKey.get(id)?.share), run: async id => { const entry = byKey.get(id)!; await entry.share!(entry.description?.trim() || entry.title); } },
        ]} />
      </div> : null}
      <div className="primary-topic-list" role="list">{visibleEntries.length ? visibleEntries.map(entry => <div key={entry.key} role="listitem" className={batch.active ? 'topic-selectable-row' : undefined}>
        {batch.active ? <label className="topic-select-check"><input type="checkbox" checked={batch.selected.has(entry.key)} onChange={() => batch.toggle(entry.key)} aria-label={`${batchCopy.select}：${entry.title}`} /></label> : null}
        <button type="button" className="primary-topic-row" aria-pressed={batch.active ? batch.selected.has(entry.key) : undefined} onClick={() => batch.active ? batch.toggle(entry.key) : entry.action()}>
          <FileText className="primary-topic-icon" size={22} aria-hidden="true" />
          <span className="primary-topic-copy"><strong>{entry.title}</strong><small className={entry.status === 'pending' ? 'is-pending' : undefined}>
            {entry.count !== undefined ? <><span>{entry.count} {copy.questions}</span><span aria-hidden="true">·</span></> : null}
            {entry.status === 'pending' ? <span>{copy.pending}</span> : entry.completedCount === undefined ? <span>{copy.ready}</span> : entry.completedCount > 0 ? <CompletedRounds count={entry.completedCount} locale={locale} /> : <span>{copy.notPracticed}</span>}
          </small></span>
          <ChevronRight size={21} aria-hidden="true" />
        </button>
      </div>) : <p className="primary-topic-empty" role="status">{copy.noResults}</p>}</div>
      {mobileList.mobile && filtered.length ? <div ref={mobileList.setSentinel} className="catalog-notice" role="status">{mobilePageEnd < filtered.length ? null : copy.endOfList}</div> : null}
      {!mobileList.mobile && pages > 1 ? <LearningListPagination page={currentPage} pages={pages} onChange={setPage} previous={copy.previous} next={copy.next}/> : null}
    </LearningListFrame>
  );
}

function CompletedRounds({ count, locale, retained = false }: { count: number; locale: Locale; retained?: boolean }) {
  const text = locale === 'ja' ? `${count} 回` : locale === 'en' ? `${count} rounds` : `${count} 次`;
  const label = locale === 'ja' ? `完了した練習 ${text}` : locale === 'en' ? `${text} completed` : `已完成练习 ${text}`;
  const scope = locale === 'ja' ? '保存されている完了済みの練習記録のみ。全期間の合計ではありません。' : locale === 'en' ? 'Completed rounds in retained history only, not a lifetime total.' : '仅统计当前保留记录中的已完成练习，不代表全部历史。';
  return <span className="primary-completed-rounds" aria-label={retained ? `${label}；${scope}` : label} title={retained ? scope : label}><Repeat2 size={16} aria-hidden="true" />{text}</span>;
}

function PracticeModuleCard({ entry, locale }: { entry: { title: string; count?: number; completedCount?: number; retainedRounds?: boolean; unit: string; icon: LucideIcon; action: () => void }; locale: Locale }) {
  const Icon = entry.icon;
  return <button type="button" className="practice-entry-row primary-practice-row" onClick={entry.action}>
    <Icon className="primary-practice-icon" size={30} aria-hidden="true" />
    <span><strong>{entry.title}</strong>{entry.count !== undefined || entry.completedCount !== undefined ? <small>
      {entry.count !== undefined ? <span>{entry.count} {entry.unit}</span> : null}
      {entry.count !== undefined && entry.completedCount !== undefined ? <span aria-hidden="true">·</span> : null}
      {entry.completedCount !== undefined ? <CompletedRounds count={entry.completedCount} locale={locale} retained={entry.retainedRounds} /> : null}
    </small> : null}</span>
    <span className="primary-practice-cta"><ArrowRight size={18} aria-hidden="true" />{practiceCopy(locale).openPractice}</span>
  </button>;
}

function practiceCopy(locale: Locale) {
  if (locale === 'ja') return {
    prepareToday: '今日の練習を準備', newTodayBody: '新しいセットの目安は約30分です。', about: '約', minutes: '分', completed: '解答済み', continuePractice: '練習を続ける', startPractice: '練習を始める', openPractice: '練習を開く',
    manageTopics: '分野別練習を管理', notPracticed: '未練習', noResults: '該当する練習がありません', completedCount: '練習回数', questionType: '問題分野', grammar: '文法', listening: '聴解', vocabulary: '単語', reading: '読解',
    vocabularyBody: '単語・漢字・読み方', grammarBody: '文の組み立て方を学ぶ', listeningBody: '聞いて答えを選ぶ', readingBody: '読んで問いに答える',
    mixed: '総合練習', mixedBody: '単語と文法の項目を復習', topics: '分野別練習', topicsBody: '教材・漢字・文法のテーマで練習', daily: '今日の練習', dailyBody: '今日の問題を始める', dialogue: '会話練習', dialogueBody: '場面に合わせて会話を練習', opinion: '意見を述べる練習', opinionBody: '約2分で意見と理由を伝える', mock: '模擬試験', mockBody: '自分の内容と予定で取り組む', drafts: '練習の下書き', draftsBody: '準備された問題を確認',
    backOpinion: '意見を述べる練習に戻る', backPractice: '練習に戻る', practice: '練習', whatToPractice: '何を練習しますか？', choose: '練習方法を選んでください。', modules: '学習分野', morePractice: 'ほかの練習', items: '件',
    topicList: '分野別練習の一覧', sets: 'セット', searchTopics: '分野別練習を検索', practiceStatus: '練習の状態', all: 'すべて', ready: '練習できる', pending: '確認待ち', sort: '並び替え', recent: '更新順', titleOrder: 'タイトル順', results: (count: number) => `${count} セット見つかりました`, reset: '絞り込みを解除', countAndSource: '問題数・出典', status: '状態', questions: '問', sourcePending: '出典を確認中', confirm: '確認', endOfList: '最後まで表示しました', previous: '前のページ', next: '次のページ',
  };
  if (locale === 'en') return {
    prepareToday: 'Prepare today’s practice', newTodayBody: 'New sets are prepared for about 30 minutes.', about: 'about', minutes: 'min', completed: 'Answered', continuePractice: 'Continue practice', startPractice: 'Start practice', openPractice: 'Open practice',
    manageTopics: 'Manage topic practice', notPracticed: 'Not practiced', noResults: 'No matching practice sets', completedCount: 'Practice count', questionType: 'Question category', grammar: 'Grammar', listening: 'Listening', vocabulary: 'Vocabulary', reading: 'Reading',
    vocabularyBody: 'Words, kanji and readings', grammarBody: 'Learn how sentences work', listeningBody: 'Listen and choose an answer', readingBody: 'Read and answer questions',
    mixed: 'Mixed practice', mixedBody: 'Review vocabulary and grammar entries', topics: 'Topic practice', topicsBody: 'Practice by textbook, kanji or grammar topic', daily: "Today's practice", dailyBody: 'Start the questions prepared for today', dialogue: 'Dialogue practice', dialogueBody: 'Practice openings, responses and endings', opinion: 'Opinion practice', opinionBody: 'Explain your view and reasons in about 2 minutes', mock: 'Mock exam', mockBody: 'Use your own content and schedule', drafts: 'Practice drafts', draftsBody: 'Review prepared questions',
    backOpinion: 'Back to opinion practice', backPractice: 'Back to practice', practice: 'Practice', whatToPractice: 'What would you like to practice?', choose: 'Choose a way to begin.', modules: 'Study modules', morePractice: 'More practice', items: 'items',
    topicList: 'Topic practice list', sets: 'sets', searchTopics: 'Search topic practice', practiceStatus: 'Practice status', all: 'All', ready: 'Ready', pending: 'Pending review', sort: 'Sort', recent: 'Recently updated', titleOrder: 'Title order', results: (count: number) => `${count} sets found`, reset: 'Reset filters', countAndSource: 'Questions and source', status: 'Status', questions: 'questions', sourcePending: 'Source pending', confirm: 'Confirm', endOfList: 'End of list', previous: 'Previous page', next: 'Next page',
  };
  return {
    prepareToday: '准备今日练习', newTodayBody: '新题组按约 30 分钟准备。', about: '约', minutes: '分钟', completed: '已完成', continuePractice: '继续练习', startPractice: '开始练习', openPractice: '查看练习',
    manageTopics: '管理专项练习', notPracticed: '未练习', noResults: '没有符合条件的练习', completedCount: '练习次数', questionType: '题型', grammar: '语法', listening: '听力', vocabulary: '单词', reading: '阅读',
    vocabularyBody: '单词、汉字、读音', grammarBody: '学习句子怎么说', listeningBody: '听一听，选出答案', readingBody: '读一读，回答问题',
    mixed: '综合练习', mixedBody: '复习单词与语法条目', topics: '专项练习', topicsBody: '按教材、汉字或语法主题练一套', daily: '今日练习', dailyBody: '开始今天准备好的题目', dialogue: '对话练习', dialogueBody: '按人物关系练习开场、回应和收尾', opinion: '意见表达', opinionBody: '用约 2 分钟说清立场、理由和例子', mock: '模拟考试', mockBody: '按自己的内容和安排作答', drafts: '练习草稿', draftsBody: '查看和确认准备好的题目',
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
    <LearningListFrame className="learning-catalog" label={labels.mixedHubAllEntries} locale={locale}>
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
