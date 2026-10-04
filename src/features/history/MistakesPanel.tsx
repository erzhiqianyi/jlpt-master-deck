import '../practice/practice-layout.css';
import { useAuthoringNavigation } from '../../components/AuthoringNavigation';
import { LearningList, LearningListFrame, LearningListHeader, LearningListPagination, LearningListRow, LearningListSearch, LearningListSelect } from '../../components/LearningList';
import { useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, X } from 'lucide-react';
import { useMobileList } from '../../hooks/useMobileList';
import { buildMistakeEntries } from '../../domain/mistakes';
import { itemMeaning } from '../../domain/items';
import type { Locale, PracticeAttempt, Question, VocabItem } from '../../types';

export function MistakesPanel({ attempts, questions, items, locale, questionStatus = 'ready' }: { questionStatus?: 'loading' | 'ready' | 'error'; attempts: PracticeAttempt[]; questions: Question[]; items: VocabItem[]; locale: Locale }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('wrong');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [answerLimit, setAnswerLimit] = useState(10);
  const t = (zh: string, ja: string, en: string) => locale === 'zh-CN' ? zh : locale === 'ja' ? ja : en;
  const entries = useMemo(() => buildMistakeEntries(attempts, questions, items), [attempts, questions, items]);
  const title = (entry: typeof entries[number]) => entry.item?.original || entry.question?.promptTarget || entry.question?.memoryPoint || entry.question?.prompt || (questionStatus === 'loading' ? t('正在加载题目…', '読み込み中…', 'Loading question…') : t('未关联题目', '未関連の問題', 'Unlinked question'));
  const searchText = useMemo(() => new Map(entries.map((entry) => [entry.id, `${title(entry)} ${entry.item ? itemMeaning(entry.item, locale) : ''} ${entry.answers.map(({ question }) => question?.prompt ?? '').join(' ')}`.toLocaleLowerCase()])), [entries, locale, questionStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return entries.filter((entry) => (searchText.get(entry.id) ?? '').includes(needle))
      .sort((a, b) => sort === 'recent' ? Date.parse(b.lastWrongAt) - Date.parse(a.lastWrongAt) : sort === 'rate' ? b.wrong / b.total - a.wrong / a.total : b.wrong - a.wrong);
  }, [entries, searchText, search, sort]);
  const total = entries.reduce((sum, entry) => sum + entry.total, 0);
  const wrong = entries.reduce((sum, entry) => sum + entry.wrong, 0);
  const mobileList = useMobileList(filtered.length, `${search}:${sort}`, 10);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(mobileList.mobile ? 0 : currentPage * 10, mobileList.mobile ? mobileList.visible : (currentPage + 1) * 10);
  const selected = entries.find((entry) => entry.id === selectedId);
  useAuthoringNavigation(selected ? t('错题详情', '間違いの詳細', 'Mistake details') : null, () => setSelectedId(null), { kind: 'detail' });
  if (selected) return <section className="data-management-panel mx-auto w-full max-w-5xl py-2 md:py-5 mistakes-page study-mistakes-page">
    <button className="record-section-back" onClick={() => setSelectedId(null)}><ArrowLeft size={18}/>{t('返回错题集', '一覧に戻る', 'Back to mistakes')}</button>
    <header className="gentle-records-heading gentle-section-heading"><p>{t('错题集', '間違いノート', 'Mistake notebook')}</p><h1 lang="ja">{title(selected)}</h1>{selected.item ? <span>{itemMeaning(selected.item, locale)}</span> : null}</header>
    <p className="study-log-summary">{t('作答', '解答', 'Answers')} {selected.total} · {t('错误', '誤答', 'Mistakes')} {selected.wrong} · {t('正确率', '正答率', 'Accuracy')} {Math.round((selected.total - selected.wrong) / selected.total * 100)}%</p>
    <div className="mistakes-details study-mistake-details">{[...selected.answers].sort((a, b) => Date.parse(b.answer.answeredAt) - Date.parse(a.answer.answeredAt)).slice(0, answerLimit).map(({ answer, question, attemptId }, index) => <article key={`${attemptId}-${index}`}>
      <p className="study-mistake-date">{answer.answeredAt ? new Date(answer.answeredAt).toLocaleString(locale) : '—'}</p>
      <h2 lang="ja">{question?.prompt ?? t('原题资料暂不可用', '問題を取得できません', 'Original question unavailable')}</h2>
      <div className={`study-mistake-answer ${answer.correct ? 'is-correct' : 'is-wrong'}`}><h3>{answer.correct ? <Check size={20} aria-hidden="true" /> : <X size={20} aria-hidden="true" />}{t('你的答案', '選んだ答え', 'Your answer')}</h3><p lang="ja">{answer.selected || '—'}</p></div>
      {question ? <><div className="study-mistake-answer is-correct"><h3><Check size={20} aria-hidden="true" />{t('正确答案', '正解', 'Correct answer')}</h3><p lang="ja">{question.answer}</p></div>{question.correctReason ? <section className="study-mistake-explanation"><h3>{t('解析', '解説', 'Explanation')}</h3><p>{question.correctReason}</p></section> : null}</> : null}
    </article>)}</div>
    {answerLimit < selected.answers.length ? <button className="record-section-back" onClick={() => setAnswerLimit(answerLimit + 10)}>{t('查看更多作答', '続きを表示', 'More answers')}<ChevronRight size={16}/></button> : null}
  </section>;
  const sortSummary = sort === 'recent' ? t('最近出错', '最近の誤答順', 'Most recent mistake') : sort === 'rate' ? t('错误率最高', '誤答率の高い順', 'Highest error rate') : '';
  const appliedListSummary = [sortSummary, search.trim()].filter(Boolean).join(' · ');
  const pageStart = currentPage * 10;
  const pageEnd = Math.min(pageStart + 10, filtered.length);
  return <section className="data-management-panel mx-auto w-full max-w-5xl py-2 md:py-5 mistakes-page study-mistakes-page">
    <LearningListFrame locale={locale} label={t('错题集', '間違いノート', 'Mistake notebook')} className="learning-catalog">
      <LearningListHeader title={t('错题集', '間違いノート', 'Mistake notebook')} count={`${filtered.length} ${t('个知识点', '学習項目', 'learning points')}`} appliedSummary={appliedListSummary} onReset={appliedListSummary ? () => { setSort('wrong'); setSearch(''); setPage(0); } : undefined} search={<LearningListSearch value={search} locale={locale} label={t('查找知识点', '項目を検索', 'Find a learning point')} placeholder={t('词汇、语法或题目', '語彙・文法・問題', 'Vocabulary, grammar or question')} onChange={(value) => { setSearch(value); setPage(0); }}/>}>
        <LearningListSelect label={t('排序', '並び順', 'Sort')} value={sort} onChange={(value) => { setSort(value); setPage(0); }}>
          <option value="wrong">{t('错误次数最多', '誤答数の多い順', 'Most mistakes')}</option><option value="rate">{t('错误率最高', '誤答率の高い順', 'Highest error rate')}</option><option value="recent">{t('最近出错', '最近の誤答順', 'Most recent mistake')}</option>
        </LearningListSelect>
      <details className="study-mistake-statistics"><summary>{t('答题统计', '解答の集計', 'Answer statistics')}</summary><dl className="list-stats">
        {[[t('出错知识点', '間違えた項目', 'Learning points'), entries.length], [t('累计作答', '解答数', 'Answers'), total], [t('错误次数', '誤答数', 'Mistakes'), wrong], [t('正确率', '正答率', 'Accuracy'), total ? `${Math.round((total - wrong) / total * 100)}%` : '—']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl></details>
      </LearningListHeader>
      {questionStatus !== 'ready' ? <p role="status" className="list-notice">{questionStatus === 'loading' ? t('统计已就绪，正在补充原题…', '問題を読み込み中…', 'Loading original questions…') : t('部分原题未能加载，刷新页面可重试。统计记录仍保留。', '一部の問題を読み込めませんでした。再読み込みしてください。', 'Some questions could not load. Refresh to retry; statistics are preserved.')}</p> : null}
      <LearningList locale={locale} columnLabels={[t("知识点", "学習項目", "Learning point"), t("释义", "意味", "Meaning"), t("答题统计", "解答集計", "Answer statistics")]} >{visible.map((entry) => <LearningListRow key={entry.id} title={title(entry)} description={entry.item ? itemMeaning(entry.item, locale) : undefined} status={<span className="study-mistake-row-stats">{t('作答', '解答', 'Answers')} {entry.total} · <em>{t('错误', '誤答', 'Mistakes')} {entry.wrong}</em></span>} locale={locale} onOpen={() => { setSelectedId(entry.id); setAnswerLimit(10); }}/>)}</LearningList>
      {mobileList.mobile && filtered.length ? <div ref={mobileList.setSentinel} className="catalog-notice" role="status">{mobileList.visible < filtered.length ? null : t('已经到底了', 'すべて表示しました', 'End of list')}</div> : null}
      {!mobileList.mobile && pageCount > 1 ? <LearningListPagination page={currentPage} pages={pageCount} onChange={setPage} summary={`${pageStart + 1}-${pageEnd} / ${filtered.length}`} previous={t('上一页', '前へ', 'Previous')} next={t('下一页', '次へ', 'Next')}/> : null}
    </LearningListFrame>
  </section>;
}
