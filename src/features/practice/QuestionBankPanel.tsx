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

  return <section className="min-w-0 overflow-hidden rounded-lg border border-[#d8cdbc] bg-white">
    <header className="border-b border-[#e5ddd1] p-4 md:p-5">
      <h1 className="text-xl font-black text-[#26352f]">{copy.title}</h1>
      <p className="mt-1 text-sm text-[#68736d]">{filtered.length} {locale === 'en' ? 'questions' : locale === 'ja' ? '問' : '题'}{loadingDaily ? ' · 正在读取每日练习…' : ''}</p>
      <nav className="mt-2 flex flex-wrap gap-3 text-sm font-semibold text-[#315b4d]" aria-label={copy.title}>
        <a href="#/vocabulary/words" className="hover:underline">{locale === 'ja' ? '単語' : locale === 'en' ? 'Vocabulary' : '词汇条目'}</a>
        <a href="#/reading/words" className="hover:underline">{locale === 'ja' ? '読解問題集' : locale === 'en' ? 'Reading bank' : '阅读题库'}</a>
        <a href="#/listening/words" className="hover:underline">{locale === 'ja' ? '聴解問題集' : locale === 'en' ? 'Listening bank' : '听力题库'}</a>
      </nav>
      <div className="mt-4 flex flex-wrap gap-2">
        {(['all', 'grammar', 'daily'] as const).map((value) => <button key={value} type="button" aria-pressed={group === value}
          onClick={() => { setGroup(value); setPage(0); }}
          className={`rounded-md border px-3 py-2 text-sm font-semibold ${group === value ? 'border-[#24473f] bg-[#e8f0eb] text-[#24473f]' : 'border-[#d9d0c3] text-[#59645e]'}`}>
          {copy[value]}
        </button>)}
      </div>
      <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} aria-label={copy.search} placeholder={copy.search}
        className="mt-3 h-11 w-full rounded-md border border-[#d9d0c3] bg-white px-3 text-base outline-none focus:border-[#24473f]" />
    </header>
    <div className="divide-y divide-[#e5ddd1]">
      {visible.map(({ key, question, collection }) => <details key={key} className="group px-4 py-3 md:px-5">
        <summary className="cursor-pointer list-none text-[#26352f] marker:hidden">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#68736d]">
            <span>{collection}</span><span>{question.reference ?? question.id}</span>
          </div>
          <p className="mt-1 whitespace-pre-line font-semibold leading-7">{question.prompt}</p>
        </summary>
        <div className="mt-3 border-t border-[#eee6db] pt-3 text-sm leading-7 text-[#34443c]">
          {question.title ? <p className="font-bold">{question.title}</p> : null}
          <p>{copy.source}：{practiceQuestionSourceLabel(question)}{question.source_reference?.trim() ? ` · ${question.source_reference.trim()}` : ''}</p>
          {question.reference ? <RecordReference reference={question.reference} locale={locale} /> : null}
          <ol className="mt-2 list-inside list-decimal">{question.choices.map((choice, index) => <li key={`${index}:${choice}`}>{choice}</li>)}</ol>
          <p className="mt-2 font-bold">{copy.answer}：{question.answer}</p>
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
