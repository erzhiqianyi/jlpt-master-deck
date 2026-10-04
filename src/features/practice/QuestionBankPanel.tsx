import './practice-layout.css';
import { ChevronDown } from 'lucide-react';
import { LearningListHeader, LearningListSearch } from '../../components/LearningList';
import { useMemo, useState } from 'react';
import { RecordReference } from '../../components/RecordReference';
import { practiceQuestionSourceLabel } from '../../domain/practiceProvenance';
import type { DailyPractice, Locale, Question } from '../../types';

type BankEntry = { key: string; question: Question; collection: string; group: 'grammar' | 'daily' };
const PAGE_SIZE = 40;

export function QuestionBankPanel({ grammarQuestions, dailyPractices, loadingDaily, locale }: {
  grammarQuestions: Question[];
  dailyPractices: DailyPractice[];
  loadingDaily: boolean;
  locale: Locale;
}) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<'all' | 'grammar' | 'daily'>('all');
  const [page, setPage] = useState(0);
  const entries = useMemo<BankEntry[]>(() => [
    ...grammarQuestions.map((question) => ({ key: `grammar:${question.id}`, question, collection: '语法题库', group: 'grammar' as const })),
    ...dailyPractices.flatMap((practice) => practice.questions.map((question) => ({
      key: `daily:${practice.id}:${question.id}`, question, collection: `${practice.title} · ${practice.date}`, group: 'daily' as const,
    }))),
  ], [grammarQuestions, dailyPractices]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return entries.filter(({ question, collection, group: entryGroup }) => {
      if (group !== 'all' && entryGroup !== group) return false;
      if (!needle) return true;
      return [question.reference, question.id, question.title, question.prompt, question.source_reference, collection]
        .some((value) => value?.toLocaleLowerCase().includes(needle));
    });
  }, [entries, group, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const copy = locale === 'ja'
    ? { title: '問題集管理', search: '問題・番号・出典を検索', all: 'すべて', grammar: '文法', daily: '毎日の練習', answer: '正解', source: '出典', empty: '該当する問題はありません', previous: '前へ', next: '次へ' }
    : locale === 'en'
      ? { title: 'Question bank', search: 'Search question, number, or source', all: 'All', grammar: 'Grammar', daily: 'Daily practice', answer: 'Answer', source: 'Source', empty: 'No matching questions', previous: 'Previous', next: 'Next' }
      : { title: '题库管理', search: '搜索题目、编号或来源', all: '全部', grammar: '语法', daily: '每日练习', answer: '正确答案', source: '来源', empty: '没有符合条件的题目', previous: '上一页', next: '下一页' };

  return <section className="study-question-bank">
    <div className="study-question-bank-toolbar">
      <LearningListHeader count={`${filtered.length} ${locale === 'en' ? 'questions' : locale === 'ja' ? '問' : '题'}`} search={<LearningListSearch value={query} onChange={(value) => { setQuery(value); setPage(0); }} label={copy.search} placeholder={copy.search} locale={locale} />} appliedSummary={[group !== 'all' ? copy[group] : '', query.trim()].filter(Boolean).join(' · ')} onReset={group !== 'all' || query.trim() ? () => { setGroup('all'); setQuery(''); setPage(0); } : undefined}>
      <nav className="mt-2 flex flex-wrap gap-3 text-sm font-semibold text-[#315b4d]" aria-label={copy.title}>
        <a href="#/vocabulary/words" className="hover:underline">{locale === 'ja' ? '単語' : locale === 'en' ? 'Vocabulary' : '词汇条目'}</a>
        <a href="#/reading/words" className="hover:underline">{locale === 'ja' ? '読解問題集' : locale === 'en' ? 'Reading bank' : '阅读题库'}</a>
        <a href="#/listening/words" className="hover:underline">{locale === 'ja' ? '聴解問題集' : locale === 'en' ? 'Listening bank' : '听力题库'}</a>
      </nav>
        <div className="study-bank-group-filter" role="group" aria-label={copy.title}>{(['all', 'grammar', 'daily'] as const).map((value) => <button key={value} type="button" aria-pressed={group === value} onClick={() => { setGroup(value); setPage(0); }}>{copy[value]}</button>)}</div>
      </LearningListHeader>
      {loadingDaily ? <p role="status" className="study-catalog-loading">{locale === 'zh-CN' ? '正在读取每日练习…' : locale === 'ja' ? '毎日の練習を読み込み中…' : 'Loading daily practices…'}</p> : null}
    </div>
    <div className="divide-y divide-[#e5ddd1]">
      {visible.map(({ key, question, collection }) => <details key={key} className="group px-4 py-3 md:px-5">
        <summary className="study-bank-question-heading"><div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#68736d]">
            <span>{collection}</span><span>{question.reference ?? question.id}</span>
          </div>
          <p className="mt-1 whitespace-pre-line font-semibold leading-7">{question.prompt}</p>
          </div><ChevronDown size={18} aria-hidden="true" /></summary>
        <div className="mt-3 border-t border-[#eee6db] pt-3 text-sm leading-7 text-[#34443c]">
          {question.title ? <p className="font-bold">{question.title}</p> : null}
          <p>{copy.source}：{practiceQuestionSourceLabel(question)}{question.source_reference?.trim() ? ` · ${question.source_reference.trim()}` : ''}</p>
          {question.reference ? <RecordReference reference={question.reference} locale={locale} /> : null}
          <ol className="study-bank-choices">{question.choices.map((choice, index) => <li key={`${index}:${choice}`}><span>{index + 1}</span>{choice}</li>)}</ol>
          <p className="study-bank-answer">{copy.answer}：{question.answer}</p>
          {question.correctReason ? <p className="mt-1">{question.correctReason}</p> : null}
        </div>
      </details>)}
      {!visible.length ? <p className="p-5 text-sm text-[#68736d]">{copy.empty}</p> : null}
    </div>
    {pages > 1 ? <nav className="flex items-center justify-between gap-3 border-t border-[#e5ddd1] p-4 text-sm" aria-label={copy.title}>
      <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded-md border px-3 py-2 disabled:opacity-40">{copy.previous}</button>
      <span>{currentPage + 1} / {pages}</span>
      <button type="button" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)} className="rounded-md border px-3 py-2 disabled:opacity-40">{copy.next}</button>
    </nav> : null}
  </section>;
}
