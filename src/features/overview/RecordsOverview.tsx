import { LearningListRow } from '../../components/LearningList';
import { LearningCatalog } from '../../components/LearningCatalog';
import { ArrowRight, BookMarked, CircleAlert, Database, PlugZap } from 'lucide-react';
import { MistakesPanel } from '../history/MistakesPanel';
import { itemMeaning } from '../../domain/items';
import type { Locale, PracticeAttempt, ProgressState, Question, VocabItem } from '../../types';

export function RecordsOverview({ questionStatus, view, items, progress, attempts, questions, locale, onOpenMemoryReview, onOpenSettings }: {
  questionStatus?: 'loading' | 'ready' | 'error';
  view: 'mistakes' | 'memory' | 'data' | 'mcp'; items: VocabItem[]; progress: ProgressState; attempts: PracticeAttempt[]; questions: Question[]; locale: Locale;
  onOpenMemoryReview: () => void; onOpenSettings: () => void;
}) {
  if (view === 'mistakes') return <MistakesPanel questionStatus={questionStatus} attempts={attempts} questions={questions} items={items} locale={locale} />;
  const due = items.filter((item) => !progress[item.id]?.nextReviewAt || (progress[item.id]?.nextReviewAt ?? '') <= new Date().toISOString());
  const wrong = attempts.flatMap((attempt) => attempt.answers).filter((answer) => !answer.correct);
  const mastered = Object.values(progress).filter((entry) => entry.status === 'mastered').length;
  const configs = {
    mistakes: { icon: CircleAlert, title: '错题', sub: '按最近练习汇总错误，保留题目来源与再次练习入口。' },
    memory: { icon: BookMarked, title: '学习记忆', sub: '词汇与语法的长期记忆状态，以及下一次复习日期。' },
    data: { icon: Database, title: '数据', sub: '本地学习数据的数量、进度和同步状态。' },
    mcp: { icon: PlugZap, title: 'MCP 设置', sub: '把 SQLite 学习记录安全提供给 Codex 等外部 Agent。' },
  } as const;
  const config = configs[view]; const Icon = config.icon;
  return <div className="ledger-record-page"><header className="gentle-section-heading gentle-records-heading"><p>学习记录</p><div><Icon size={25}/><h1>{config.title}</h1></div><span>{config.sub}</span></header>
    {view === 'memory' ? <LearningCatalog title="当前到期" items={due} locale={locale} searchText={(item) => `${item.original} ${item.reading ?? ''} ${itemMeaning(item, locale)}`} tools={<div className="list-tools"><button type="button" onClick={onOpenMemoryReview}>开始复习<ArrowRight size={15}/></button></div>} renderRow={(item) => <LearningListRow key={item.id} title={item.original} reading={item.reading} description={itemMeaning(item, locale)} statusKind={progress[item.id]?.nextReviewAt ? 'missed' : 'new'} status={progress[item.id]?.nextReviewAt ? '到期' : '新卡'} locale={locale} onOpen={() => { window.location.hash = `#/${item.deck === 'grammar_expression' ? 'grammar' : 'vocabulary'}/words/${encodeURIComponent(item.id)}`; }}/>}/> : null}
    {view === 'data' ? <section className="ledger-data-grid"><article><b>{items.length}</b><span>学习条目</span></article><article><b>{attempts.length}</b><span>练习记录</span></article><article><b>{wrong.length}</b><span>错误作答</span></article><article><b>{mastered}</b><span>已掌握</span></article></section> : null}
    {view === 'mcp' ? <section className="ledger-mcp-panel"><div><span className="ledger-mcp-dot"/><strong>MCP 数据层已就绪</strong></div><dl><div><dt>存储</dt><dd>本地 SQLite</dd></div><div><dt>Agent 边界</dt><dd>应用不内置 AI；外部 Agent 通过 MCP 读取并写回</dd></div><div><dt>可用数据</dt><dd>学习记录、错题、教材计划、草稿、记忆进度</dd></div></dl><button onClick={onOpenSettings}>连接与显示设置<ArrowRight size={15}/></button></section> : null}
  </div>;
}
