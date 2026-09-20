import { LearningCatalog } from '../../components/LearningCatalog';
import { LearningList, LearningListRow } from '../../components/LearningList';
import { ArrowLeft, BookOpen, CalendarDays, CheckCircle2, ChevronRight, ExternalLink, Headphones, LoaderCircle, Newspaper, PlayCircle, ShieldCheck, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { apiRequest } from '../../lib/api';
import type { Locale, NewsCycleCatalogData, NewsCycleData, NewsCycleDay, NewsCycleModule, NewsCycleQuestion, NewsCycleSummary } from '../../types';

const moduleOrder: Array<NewsCycleModule | 'all'> = ['all', 'vocabulary', 'grammar', 'listening', 'reading'];
const copy = {
  'zh-CN': {
    title: 'N1 新闻练习', subtitle: '按星期整理的日本新闻练习草稿', notice: '个人学习 · 原新闻来源 · 尚未写入正式题库', loading: '正在读取新闻练习...', unavailable: '新闻练习暂时无法读取，请确认本地后端和个人知识库目录。', empty: '还没有可预览的新闻周期。', date: '日期', coverage: '题型覆盖', sources: '新闻源', questions: '题目', audio: '原音频', audioLoading: '正在加载原音频...', status: '状态', open: '查看详情', all: '全部', vocabulary: '文字・词汇', grammar: '语法', listening: '听力', reading: '阅读', draft: '待审校', playable: '可播放', needsReview: '待听检', back: '返回新闻列表', choose: '选择答案', submit: '确认答案', correct: '回答正确', answer: '正确答案', source: '查看新闻来源', rewritten: '阅读材料为学习用改写', personal: '来源内容仅供个人学习', noAudio: '这道听力题还没有经过验证的本地原音频。', timecode: '建议区间', questionList: '题目列表', cycle: '本周周期', days: '天', total: '题', audioReady: '题可播放原音频', reviewPending: '道听力题待听检', monday: '周一', tuesday: '周二', wednesday: '周三', thursday: '周四', friday: '周五', saturday: '周六', sunday: '周日',
    weeks: '历史周期', weekList: '周列表', weekSubtitle: '选择一个新闻周，再查看每天的练习内容', week: '周期', range: '日期范围', latest: '最新', openWeek: '查看本周', backWeeks: '返回周列表', completed: '已全部转正', formal: '正式题', formalProgress: '已转正', practiceWeek: '练习本周', practiceDay: '练习当天', weekPractice: '本周完整练习', practiceProgress: '已完成', partialNotice: '题已转正，其余仍为个人学习草稿',
  },
  ja: {
    title: 'N1 ニュース練習', subtitle: '曜日ごとに整理した日本ニュースの練習下書き', notice: '個人学習用・元ニュース出典・正式問題集には未登録', loading: 'ニュース練習を読み込んでいます...', unavailable: 'ニュース練習を読み込めません。', empty: 'プレビューできるニュース周期はありません。', date: '日付', coverage: '問題形式', sources: 'ニュース源', questions: '問題', audio: '元音声', audioLoading: '元音声を読み込んでいます...', status: '状態', open: '詳細を見る', all: 'すべて', vocabulary: '文字・語彙', grammar: '文法', listening: '聴解', reading: '読解', draft: '要確認', playable: '再生可', needsReview: '音声確認待ち', back: '一覧へ戻る', choose: '答えを選ぶ', submit: '答えを確認', correct: '正解', answer: '正解', source: 'ニュース出典', rewritten: '読解文は学習用に書き換え', personal: '個人学習用', noAudio: '確認済みのローカル元音声がありません。', timecode: '推奨区間', questionList: '問題一覧', cycle: '今週', days: '日', total: '問', audioReady: '問は元音声を再生可能', reviewPending: '問は音声確認待ち', monday: '月', tuesday: '火', wednesday: '水', thursday: '木', friday: '金', saturday: '土', sunday: '日',
    weeks: '過去の周期', weekList: '週一覧', weekSubtitle: 'ニュース週を選んで、曜日ごとの練習を確認します', week: '周期', range: '期間', latest: '最新', openWeek: 'この週を見る', backWeeks: '週一覧へ戻る', completed: 'すべて正式登録済み', formal: '正式問題', formalProgress: '正式登録', practiceWeek: '今週を練習', practiceDay: 'この日を練習', weekPractice: '今週の全問題', practiceProgress: '完了', partialNotice: '問を正式登録済み・残りは個人学習用下書き',
  },
  en: {
    title: 'N1 News Practice', subtitle: 'Japanese news practice drafts organized by weekday', notice: 'Personal study · original sources · not in the formal question bank', loading: 'Loading news practice...', unavailable: 'News practice is unavailable. Check the local backend and personal knowledge directory.', empty: 'No news cycle is available.', date: 'Date', coverage: 'Coverage', sources: 'Sources', questions: 'Questions', audio: 'Original audio', audioLoading: 'Loading original audio...', status: 'Status', open: 'View details', all: 'All', vocabulary: 'Vocabulary', grammar: 'Grammar', listening: 'Listening', reading: 'Reading', draft: 'Needs review', playable: 'Playable', needsReview: 'Audio review', back: 'Back to news list', choose: 'Choose an answer', submit: 'Check answer', correct: 'Correct', answer: 'Answer', source: 'Open news source', rewritten: 'Reading passage rewritten for study', personal: 'For personal study', noAudio: 'No verified local original audio is available for this listening question.', timecode: 'Suggested segment', questionList: 'Question list', cycle: 'Weekly cycle', days: 'days', total: 'questions', audioReady: 'questions with original audio', reviewPending: 'listening questions need review', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
    weeks: 'Past cycles', weekList: 'Week list', weekSubtitle: 'Choose a news week, then open its daily practice', week: 'Cycle', range: 'Date range', latest: 'Latest', openWeek: 'View week', backWeeks: 'Back to week list', completed: 'All published', formal: 'Formal', formalProgress: 'Published', practiceWeek: 'Practice week', practiceDay: 'Practice day', weekPractice: 'Full weekly practice', practiceProgress: 'Completed', partialNotice: 'questions published; the rest remain personal-study drafts',
  },
};

export function NewsCyclePanel({ locale, token, selection, onOpenCycle, onOpenDay, onPracticeCycle, onBack }: { locale: Locale; token: string; selection?: string; onOpenCycle: (cycleId: string) => void; onOpenDay: (cycleId: string, date: string) => void; onPracticeCycle: (cycleId: string) => void; onBack: () => void }) {
  const t = copy[locale];
  const [activeCycleId, activeDate] = selection?.split(':') ?? [];
  const [catalog, setCatalog] = useState<NewsCycleCatalogData | null>(null);
  const [data, setData] = useState<NewsCycleData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    apiRequest<NewsCycleCatalogData>('/api/local-news-cycles', { token })
      .then((payload) => { if (!cancelled) setCatalog(payload); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : t.unavailable); });
    return () => { cancelled = true; };
  }, [t.unavailable, token]);

  useEffect(() => {
    if (!activeCycleId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setData(null);
    setError('');
    apiRequest<NewsCycleData>(`/api/local-news-cycle?id=${encodeURIComponent(activeCycleId)}`, { token })
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : t.unavailable); });
    return () => { cancelled = true; };
  }, [activeCycleId, t.unavailable, token]);

  if (error) return <EmptyState icon={<Newspaper size={32} />} title={t.unavailable} detail={error} />;
  if (!catalog || (activeCycleId && !data)) return <div className="flex min-h-72 items-center justify-center gap-3 text-sm font-semibold text-[#68716b]"><LoaderCircle className="animate-spin" size={20} />{t.loading}</div>;
  if (!activeCycleId) return <NewsDailyIndex locale={locale} token={token} cycles={catalog.cycles} onOpen={onOpenDay} />;
  if (activeDate === 'practice') return <NewsWeekPractice locale={locale} token={token} data={data} onBack={() => onOpenCycle(activeCycleId)} />;
  const activeDay = activeDate ? data.days.find((day) => day.date === activeDate) : undefined;
  if (activeDate && activeDay) return <NewsDayDetail locale={locale} token={token} day={{ ...activeDay, questions: activeDay.questions.map((question) => ({ ...question, formalQuestionId: catalog.cycles.find((cycle) => cycle.id === activeCycleId)?.formalPracticeQuestionIds.find((id) => id === `${question.id}-formal`) })) }} onBack={onBack} />;
  return <NewsDayCatalog locale={locale} cycleId={activeCycleId} data={data} onOpen={(date) => onOpenDay(activeCycleId, date)} onPractice={() => onPracticeCycle(activeCycleId)} onBack={onBack} />;
}

function NewsDailyIndex({ locale, token, cycles, onOpen }: { locale: Locale; token: string; cycles: NewsCycleSummary[]; onOpen: (cycleId: string, date: string) => void }) {
  const t = copy[locale];
  const [days, setDays] = useState<Array<{ cycleId: string; day: NewsCycleDay }> | null>(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const [visibleCount, setVisibleCount] = useState(6);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!mobile || !days || visibleCount >= days.length || !target) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        observer.disconnect();
        setVisibleCount((count) => Math.min(count + 6, days.length));
      }
    }, { rootMargin: '0px 0px 80px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [mobile, days, visibleCount]);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setDays(null);
    setVisibleCount(6);
    setPage(0);
    Promise.all(cycles.map(async (cycle) => {
      const payload = await apiRequest<NewsCycleData>(`/api/local-news-cycle?id=${encodeURIComponent(cycle.id)}`, { token });
      return payload.days.map((day) => ({ cycleId: cycle.id, day }));
    })).then((rows) => {
      if (!cancelled) setDays(rows.flat().sort((a, b) => b.day.date.localeCompare(a.day.date)));
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [cycles, token, retry]);
  const text = locale === 'zh-CN'
    ? { title: '新闻学习', intro: '选一天，直接开始练习。', notice: '学习草稿，答案与解析仍需核对。', previous: '上一页', next: '下一页', retry: '重新加载' }
    : locale === 'ja'
      ? { title: 'ニュース学習', intro: '日付を選んで練習を始めましょう。', notice: '学習用の下書きです。解答と解説は確認が必要です。', previous: '前へ', next: '次へ', retry: '再読み込み' }
      : { title: 'News learning', intro: 'Choose a day to start practicing.', notice: 'Study drafts; answers and explanations need checking.', previous: 'Previous', next: 'Next', retry: 'Retry' };
  if (failed) return <div><p>{t.unavailable}</p><button className="gentle-direct-link" onClick={() => setRetry((value) => value + 1)}>{text.retry}</button></div>;
  if (!days) return <p role="status">{t.loading}</p>;
  const pageCount = Math.max(1, Math.ceil(days.length / 6));
  return <LearningCatalog title={text.title} items={days} locale={locale} notice={text.notice} searchText={({ day }) => `${day.date} ${weekday(day.date, t)}`} renderRow={({ cycleId, day }) => <LearningListRow key={`${cycleId}:${day.date}`} title={`${formatDate(day.date, locale)} · ${weekday(day.date, t)}`} description={`${day.questionCount} ${t.total} · ${day.sourceCount} ${t.sources}`} locale={locale} onOpen={() => onOpen(cycleId, day.date)}/>}/>;
}

function NewsWeekCatalog({ locale, cycles, onOpen, onPractice }: { locale: Locale; cycles: NewsCycleSummary[]; onOpen: (cycleId: string) => void; onPractice: (questionId: string) => void }) {
  const t = copy[locale];
  if (!cycles.length) return <EmptyState icon={<Newspaper size={32} />} title={t.empty} />;
  const totalQuestions = cycles.reduce((sum, cycle) => sum + cycle.totalQuestions, 0);
  const totalAudio = cycles.reduce((sum, cycle) => sum + cycle.audioCount, 0);
  const totalFormal = cycles.reduce((sum, cycle) => sum + cycle.formalQuestionCount, 0);
  return <section className="overflow-hidden rounded-2xl border border-[#dccfc0] bg-[#fffdf8] shadow-sm">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e7ddd1] bg-[#fbf7ef] px-4 py-5 md:px-6">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#a84269]">{t.weekList}</p><h1 className="mt-1 text-2xl font-black text-[#2f3934]">{t.title}</h1><p className="mt-1 text-sm text-[#68716b]">{t.weekSubtitle}</p></div>
      <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${totalFormal ? 'border-[#b9d2c0] bg-[#edf6ee] text-[#315f45]' : 'border-[#e2c98a] bg-[#fff8df] text-[#775516]'}`}><ShieldCheck size={17} />{totalFormal ? `${totalFormal} ${t.partialNotice}` : t.notice}</div>
    </header>
    <div className="grid grid-cols-2 border-b border-[#e7ddd1] bg-white md:grid-cols-4">
      <SummaryMetric label={t.weeks} value={String(cycles.length)} />
      <SummaryMetric label={t.questions} value={`${totalQuestions} ${t.total}`} />
      <SummaryMetric label={t.audio} value={`${totalAudio} ${t.playable}`} />
      <SummaryMetric label={t.formal} value={`${totalFormal} ${t.total}`} />
    </div>
    <LearningList>{cycles.map((cycle) => <LearningListRow key={cycle.id} inlineActions title={cycleLabel(cycle.id, locale)} description={formatRange(cycle.range, locale)} status={`${cycle.totalQuestions} ${t.total}`} locale={locale} onOpen={() => onOpen(cycle.id)} secondary={<button type="button" aria-label={t.practiceWeek} title={t.practiceWeek} onClick={() => onPractice(cycle.id)}><PlayCircle size={20} aria-hidden="true"/></button>}/>)}</LearningList>
  </section>;
}

function NewsWeekPractice({ locale, token, data, onBack }: { locale: Locale; token: string; data: NewsCycleData; onBack: () => void }) {
  const t = copy[locale];
  const allQuestions = useMemo(() => data.days.flatMap((day) => day.questions), [data.days]);
  const [module, setModule] = useState<NewsCycleModule | 'all'>('all');
  const [activeId, setActiveId] = useState(allQuestions[0]?.id ?? '');
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submittedIds, setSubmittedIds] = useState<string[]>([]);
  const filtered = useMemo(() => module === 'all' ? allQuestions : allQuestions.filter((question) => question.module === module), [allQuestions, module]);
  const active = filtered.find((question) => question.id === activeId) ?? filtered[0];
  const moduleCounts = useMemo(() => ({
    vocabulary: allQuestions.filter((question) => question.module === 'vocabulary').length,
    grammar: allQuestions.filter((question) => question.module === 'grammar').length,
    listening: allQuestions.filter((question) => question.module === 'listening').length,
    reading: allQuestions.filter((question) => question.module === 'reading').length,
  }), [allQuestions]);
  const sourceCount = useMemo(() => new Set(allQuestions.map((question) => question.source_id)).size, [allQuestions]);
  const audioCount = allQuestions.filter((question) => question.audio?.previewUrl).length;

  function selectModule(next: NewsCycleModule | 'all') {
    const nextQuestions = next === 'all' ? allQuestions : allQuestions.filter((question) => question.module === next);
    setModule(next);
    setActiveId(nextQuestions[0]?.id ?? '');
  }

  return <section className="overflow-hidden rounded-2xl border border-[#dccfc0] bg-[#fffdf8] shadow-sm">
    <header className="flex flex-wrap items-center gap-3 border-b border-[#e7ddd1] bg-[#fbf7ef] px-4 py-4 md:px-6"><button type="button" onClick={onBack} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#ead1dc] bg-white text-[#a84269] hover:bg-[#fff0f5]" aria-label={t.back}><ArrowLeft size={19} /></button><div className="min-w-0 flex-1"><p className="text-xs font-bold text-[#a84269]">{t.weekPractice}</p><h1 className="truncate text-xl font-black text-[#2f3934]">{formatRange(data.summary?.range, locale)} · {allQuestions.length} {t.total}</h1></div><div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-[#68716b]"><span>{t.practiceProgress} {submittedIds.length} / {allQuestions.length}</span><span className="inline-flex items-center gap-1"><Newspaper size={16} />{sourceCount} {t.sources}</span><span className="inline-flex items-center gap-1"><Headphones size={16} />{audioCount} {t.playable}</span></div></header>
    <nav className="flex gap-2 overflow-x-auto border-b border-[#e7ddd1] bg-white px-4 py-3 md:px-6" aria-label={t.coverage}>{moduleOrder.map((value) => <button type="button" key={value} onClick={() => selectModule(value)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold ${module === value ? 'border-[#31564c] bg-[#31564c] text-white' : 'border-[#cbd6cf] bg-white text-[#46514c] hover:bg-[#f2f6f1]'}`}>{t[value]} <span className="ml-1 opacity-75">{value === 'all' ? allQuestions.length : moduleCounts[value]}</span></button>)}</nav>
    {active ? <div className="grid min-h-[620px] md:grid-cols-[18rem_minmax(0,1fr)]"><aside className="border-b border-[#e7ddd1] bg-[#fbfaf6] md:border-r md:border-b-0"><div className="border-b border-[#e7ddd1] px-4 py-3 text-xs font-bold text-[#68716b]">{t.questionList} · {filtered.length}</div><div className="flex max-h-[680px] overflow-x-auto md:block md:overflow-y-auto">{filtered.map((question, index) => <button type="button" key={question.id} onClick={() => setActiveId(question.id)} className={`grid min-w-[14rem] grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 border-r border-[#ece4d8] px-3 py-3 text-left md:w-full md:min-w-0 md:border-r-0 md:border-b ${question.id === active.id ? 'bg-[#edf4ef] shadow-[inset_3px_0_0_#31564c]' : 'bg-white hover:bg-[#fbf8f2]'}`}><span className="font-mono text-xs font-bold text-[#987986]">{String(index + 1).padStart(3, '0')}</span><span className="min-w-0"><strong className="block truncate text-sm text-[#34443c]">{question.official_type}</strong><small className="mt-1 block truncate text-xs text-[#7a6a70]">{formatDate(question.date, locale)} · {question.source_id}</small></span>{submittedIds.includes(question.id) ? <CheckCircle2 size={16} className="text-[#315f45]" /> : question.audio?.previewUrl ? <Volume2 size={15} className="text-[#315f45]" /> : <BookOpen size={15} className="text-[#a84269]" />}</button>)}</div></aside><QuestionDetail key={active.id} question={active} locale={locale} token={token} selected={answers[active.id] ?? null} submitted={submittedIds.includes(active.id)} onSelect={(index) => setAnswers((current) => ({ ...current, [active.id]: index }))} onSubmit={() => setSubmittedIds((current) => current.includes(active.id) ? current : [...current, active.id])} /></div> : <EmptyState icon={<BookOpen size={30} />} title={t.empty} />}
  </section>;
}

function NewsDayCatalog({ locale, cycleId, data, onOpen, onPractice, onBack }: { locale: Locale; cycleId: string; data: NewsCycleData; onOpen: (date: string) => void; onPractice: () => void; onBack: () => void }) {
  const t = copy[locale];
  if (!data.days.length) return <EmptyState icon={<Newspaper size={32} />} title={t.empty} />;
  const total = data.summary?.total_questions ?? data.days.reduce((sum, day) => sum + day.questionCount, 0);
  return <section className="overflow-hidden rounded-2xl border border-[#dccfc0] bg-[#fffdf8] shadow-sm">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e7ddd1] bg-[#fbf7ef] px-4 py-5 md:px-6">
      <div className="flex items-start gap-3"><button type="button" onClick={onBack} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#ead1dc] bg-white text-[#a84269] hover:bg-[#fff0f5]" aria-label={t.backWeeks}><ArrowLeft size={19} /></button><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#a84269]">{cycleLabel(cycleId, locale)}</p><h1 className="mt-1 text-2xl font-black text-[#2f3934]">{formatRange(data.summary?.range, locale)}</h1><p className="mt-1 text-sm text-[#68716b]">{t.subtitle}</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={onPractice} className="inline-flex items-center gap-2 rounded-lg bg-[#31564c] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#24473f]"><PlayCircle size={18} />{t.practiceWeek} · {total}</button><div className="inline-flex items-center gap-2 rounded-lg border border-[#e2c98a] bg-[#fff8df] px-3 py-2 text-xs font-semibold text-[#775516]"><ShieldCheck size={17} />{t.notice}</div></div>
    </header>
    <div className="grid grid-cols-2 border-b border-[#e7ddd1] bg-white md:grid-cols-4">
      <SummaryMetric label={t.cycle} value={`${data.days.length} ${t.days}`} />
      <SummaryMetric label={t.questions} value={`${total} ${t.total}`} />
      <SummaryMetric label={t.audio} value={`${data.summary?.direct_audio_question_count ?? data.days.reduce((sum, day) => sum + day.audioCount, 0)} ${t.audioReady}`} />
      <SummaryMetric label={t.needsReview} value={`${data.summary?.needs_audio_review_count ?? 0} ${t.reviewPending}`} />
    </div>
    <LearningList>{data.days.map((day) => <LearningListRow key={day.date} title={`${weekday(day.date, t)} · ${formatDate(day.date, locale)}`} description={`${day.questionCount} ${t.total} · ${day.sourceCount} ${t.sources}`} locale={locale} onOpen={() => onOpen(day.date)}/>)}</LearningList>
  </section>;
}

const reviewLabels = {
  'zh-CN': { needs_review: '待审核', rejected: '需修改', approved: '审核通过 · 待入库', published: '已入库', all: '全部状态', details: '审核详情', missing: '尚无人工审核记录', pending: '待确认', pass: '通过', fail: '需修改', not_applicable: '不适用', source_accuracy: '新闻来源与事实', answer_uniqueness: '答案唯一且正确', japanese_naturalness: '日语表达自然', distractor_quality: '错误选项合理', jlpt_n1_fit: '符合 N1 难度', type_fidelity: '符合题型要求', copyright_access: '原创改写与来源使用', audio_alignment: '原音频与题目对应', workflow: '核对来源、题目、答案和解析；听力需听完对应区间。逐项通过后记录人工审核，再校验并入库。确认答案仅用于试答。', legacy: '已在题库，但缺少完整人工审核记录，仍需补审。' },
  ja: { needs_review: '要確認', rejected: '要修正', approved: '承認済み・登録待ち', published: '登録済み', all: 'すべての状態', details: 'レビュー詳細', missing: '人による確認記録なし', pending: '未確認', pass: '合格', fail: '要修正', not_applicable: '対象外', source_accuracy: '出典と事実', answer_uniqueness: '正解の一意性', japanese_naturalness: '日本語の自然さ', distractor_quality: '誤答の質', jlpt_n1_fit: 'N1 の難度', type_fidelity: '問題形式', copyright_access: '出典利用と独自性', audio_alignment: '音声との一致', workflow: '出典、問題、正解、解説を確認し、聴解は該当区間を聞きます。全項目を確認後、レビューを記録し、検証して正式登録します。解答確認は試答です。', legacy: '登録済みですが、人による確認記録が不足しています。' },
  en: { needs_review: 'Needs review', rejected: 'Needs revision', approved: 'Approved · awaiting import', published: 'Imported', all: 'All statuses', details: 'Review details', missing: 'No human review recorded', pending: 'Pending', pass: 'Pass', fail: 'Fail', not_applicable: 'Not applicable', source_accuracy: 'Source accuracy', answer_uniqueness: 'Unique correct answer', japanese_naturalness: 'Natural Japanese', distractor_quality: 'Distractor quality', jlpt_n1_fit: 'N1 difficulty', type_fidelity: 'Question format', copyright_access: 'Original adaptation and source use', audio_alignment: 'Audio alignment', workflow: 'Check the source, question, answer and explanation; listen to the exact audio segment. Record human approval after every check, then validate and import. Checking an answer is only a trial.', legacy: 'Already imported, but a complete human review record is missing.' },
};
const reviewCheckKeys = ['source_accuracy', 'answer_uniqueness', 'japanese_naturalness', 'distractor_quality', 'jlpt_n1_fit', 'type_fidelity', 'copyright_access', 'audio_alignment'] as const;
function newsReviewStatus(question: NewsCycleQuestion) {
  if (question.formalQuestionId) return 'published';
  if (question.quality_review?.status === 'rejected') return 'rejected';
  const review = question.quality_review;
  if (review?.status === 'approved' && review.reviewer && review.reviewed_at && Array.isArray(review.machine_issues) && !review.machine_issues.length && reviewCheckKeys.every((key) => key === 'audio_alignment' && question.module !== 'listening' ? review.checks?.[key] === 'not_applicable' || review.checks?.[key] === 'pass' : review.checks?.[key] === 'pass')) return 'approved';
  return 'needs_review';
}
function NewsReviewDetails({ question, locale }: { question: NewsCycleQuestion; locale: Locale }) {
  const r = reviewLabels[locale];
  const review = question.quality_review;
  return <details className="news-review-details"><summary>{r.details}</summary>
    <p>{r.workflow}</p>
    {!review ? <p>{question.formalQuestionId ? r.legacy : r.missing}</p> : null}
    <p><strong>{copy[locale].answer}: {question.answerIndex + 1} · {question.choices[question.answerIndex]}</strong></p>
    <p>{question.explanation_zh}</p>
    {question.composition_note ? <p>{question.composition_note}</p> : null}
    <dl>{reviewCheckKeys.filter((key) => key !== 'audio_alignment' || question.module === 'listening').map((key) => <div key={key}><dt>{r[key]}</dt><dd>{r[review?.checks?.[key] ?? 'pending']}</dd></div>)}</dl>
    {question.review_note_zh ? <p>{question.review_note_zh}</p> : null}
    {review?.notes_zh ? <p>{review.notes_zh}</p> : null}
    {review?.machine_issues?.length ? <ul>{review.machine_issues.map((issue, index) => <li key={index}>{typeof issue === 'string' ? issue : JSON.stringify(issue)}</li>)}</ul> : null}
    {review?.reviewer ? <p>{review.reviewer} · {review.reviewed_at}</p> : null}
  </details>;
}

function NewsDayDetail({ locale, token, day, onBack }: { locale: Locale; token: string; day: NewsCycleDay; onBack: () => void }) {
  const t = copy[locale];
  const r = reviewLabels[locale];
  const [reviewFilter, setReviewFilter] = useState<'all' | ReturnType<typeof newsReviewStatus>>('all');
  const [module, setModule] = useState<NewsCycleModule | 'all'>('all');
  const [activeId, setActiveId] = useState(day.questions[0]?.id ?? '');
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submittedIds, setSubmittedIds] = useState<string[]>([]);
  const directoryButton = useRef<HTMLButtonElement>(null);
  const filtered = useMemo(() => day.questions.filter((question) => (module === 'all' || question.module === module) && (reviewFilter === 'all' || newsReviewStatus(question) === reviewFilter)), [day.questions, module, reviewFilter]);
  const active = filtered.find((question) => question.id === activeId) ?? filtered[0];
  const index = filtered.findIndex((question) => question.id === active?.id);
  const text = locale === 'zh-CN' ? { previous: '上一题', next: '下一题', directory: '选题', close: '收起选题' } : locale === 'ja' ? { previous: '前の問題', next: '次の問題', directory: '問題を選ぶ', close: '一覧を閉じる' } : { previous: 'Previous', next: 'Next', directory: 'Choose question', close: 'Close list' };
  function openQuestion(question: NewsCycleQuestion) {
    setActiveId(question.id);
    setDirectoryOpen(false);
    directoryButton.current?.focus();
  }
  return <section className="news-focus">
    <header className="news-focus-header">
      <button type="button" onClick={onBack} className="news-focus-back" aria-label={t.back}><ArrowLeft size={20} /></button>
      <div><p>{t.title}</p><h1>{formatDate(day.date, locale)} · {weekday(day.date, t)}</h1></div>
    </header>
    <div className="news-focus-toolbar">
      <span aria-live="polite">{filtered.length ? index + 1 : 0} / {filtered.length}{module !== 'all' ? ` · ${t[module]}` : ''}</span>
      <button ref={directoryButton} type="button" aria-expanded={directoryOpen} aria-controls="news-question-directory" onClick={() => setDirectoryOpen((value) => !value)}>{directoryOpen ? text.close : text.directory}</button>
    </div>
    {directoryOpen ? <div id="news-question-directory" className="news-focus-directory">
      <label className="news-review-filter">{t.status}<select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as typeof reviewFilter)}>{(['all', 'needs_review', 'rejected', 'approved', 'published'] as const).map((status) => <option key={status} value={status}>{r[status]} · {day.questions.filter((question) => status === 'all' || newsReviewStatus(question) === status).length}</option>)}</select></label>
      <nav className="news-focus-filters" aria-label={t.coverage}>{moduleOrder.map((value) => <button type="button" key={value} aria-pressed={module === value} onClick={() => { setModule(value); }}>
        {t[value]} · {value === 'all' ? day.questions.length : day.moduleCounts[value]}
      </button>)}</nav>
      <nav className="news-focus-questions" aria-label={t.questionList}>{filtered.map((question, questionIndex) => <button type="button" key={question.id} aria-current={question.id === active?.id ? 'true' : undefined} onClick={() => openQuestion(question)}>
        <span>{questionIndex + 1}</span><span>{question.official_type}<small className="block text-xs opacity-70">{r[newsReviewStatus(question)]}</small></span>{submittedIds.includes(question.id) ? <CheckCircle2 size={16} aria-label={t.practiceProgress} /> : null}
      </button>)}</nav>
    </div> : null}
    {active ? <>
      <QuestionDetail key={active.id} question={active} locale={locale} token={token} selected={answers[active.id] ?? null} submitted={submittedIds.includes(active.id)} onSelect={(value) => setAnswers((current) => ({ ...current, [active.id]: value }))} onSubmit={() => setSubmittedIds((current) => current.includes(active.id) ? current : [...current, active.id])} />
      <nav className="news-focus-pagination" aria-label={t.questionList}>
        <button type="button" disabled={index <= 0} onClick={() => openQuestion(filtered[index - 1])}><ArrowLeft size={16} />{text.previous}</button>
        <button type="button" disabled={index >= filtered.length - 1} onClick={() => openQuestion(filtered[index + 1])}>{text.next}<ChevronRight size={16} /></button>
      </nav>
    </> : <EmptyState icon={<BookOpen size={30} />} title={t.empty} />}
  </section>;
}

function QuestionDetail({ question, locale, token, selected, submitted, onSelect, onSubmit }: { question: NewsCycleQuestion; locale: Locale; token: string; selected: number | null; submitted: boolean; onSelect: (index: number) => void; onSubmit: () => void }) {
  const t = copy[locale];
  const scoringReady = question.scoring_ready !== false && (question.module !== 'listening' || (question.audio?.import_ready === true && Boolean(question.audio?.timecode) && Boolean(question.audio?.previewUrl)));
  submitted = submitted && scoringReady;
  return <article className="min-w-0 px-4 py-5 md:px-7 md:py-6"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="rounded bg-[#eaf3ec] px-2 py-1 text-xs font-bold text-[#315f45]">{t[question.module]}</span><strong className="text-sm text-[#46514c]">{question.official_type}</strong></div><span className="rounded-full bg-[#fff8df] px-2.5 py-1 text-xs font-semibold text-[#775516]">{reviewLabels[locale][newsReviewStatus(question)]}</span></div>
    <NewsReviewDetails question={question} locale={locale} />
    {question.audio?.previewUrl ? <div className="mt-5 rounded-xl border border-[#e2c98a] bg-[#fff8df] p-3"><div className="mb-2 flex items-center justify-between text-xs font-semibold text-[#775516]"><span className="inline-flex items-center gap-2"><Headphones size={16} />{t.audio}</span><span>{t.timecode} {question.audio.timecode ?? '—'}</span></div><AuthenticatedAudio src={question.audio.previewUrl} token={token} loading={t.audioLoading} unavailable={t.noAudio} /></div> : question.module === 'listening' ? <div className="mt-5 rounded-lg border border-[#e4d8ca] bg-[#f7f3ed] px-3 py-2 text-xs font-semibold text-[#7b6653]">{t.noAudio}</div> : null}
    {question.passage ? <div className="mt-5 border-l-4 border-[#31564c] bg-[#f4f6f1] px-5 py-4 font-serif text-[15px] leading-8 text-[#2f3934]">{question.passage}</div> : null}
    <div className="mt-6">{question.question ? <p className="text-xs font-semibold leading-6 text-[#7a6a70]">{question.prompt}</p> : null}<h2 className="mt-2 whitespace-pre-line font-serif text-xl font-bold leading-9 text-[#2f3934]"><HighlightedPrompt text={question.question ?? question.prompt} target={question.target} /></h2></div>
    {!scoringReady ? <p role="status" className="mt-5 rounded-lg bg-[#fff8df] px-4 py-3 text-sm text-[#775516]">{locale === 'zh-CN' ? (question.review_note_zh ?? '这道听力题尚未完成音频与答案核验，暂不判分。') : locale === 'ja' ? '音声と正解の確認が終わるまで、採点は行いません。' : 'Scoring is unavailable until the audio and answer have been checked.'}</p> : null}
    <div className="mt-5 grid gap-3">{question.choices.map((choice, index) => { const correct = submitted && index === question.answerIndex; const wrong = submitted && selected === index && index !== question.answerIndex; return <button type="button" key={`${question.id}-${index}`} disabled={submitted || !scoringReady} onClick={() => onSelect(index)} className={`grid min-h-14 grid-cols-[2rem_minmax(0,1fr)_1.25rem] items-center gap-3 rounded-lg border px-3 py-3 text-left ${correct ? 'border-[#5f8b68] bg-[#edf6ee] text-[#315f45]' : wrong ? 'border-[#b85c5c] bg-[#fff0f0] text-[#973f3f]' : selected === index ? 'border-[#a84269] bg-[#fff0f5] text-[#713047]' : 'border-[#d8d1c8] bg-white text-[#3d4742] hover:border-[#aebfb5] hover:bg-[#f7faf7]'}`}><span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-current text-xs font-bold">{index + 1}</span><strong className="text-sm leading-6">{choice}</strong>{correct ? <CheckCircle2 size={19} /> : null}</button>; })}</div>
    {submitted ? <div className={`mt-5 rounded-lg border-l-4 px-4 py-3 ${selected === question.answerIndex ? 'border-[#5f8b68] bg-[#edf6ee]' : 'border-[#b85c5c] bg-[#fff0f0]'}`}><strong className="text-sm text-[#34443c]">{selected === question.answerIndex ? t.correct : `${t.answer}: ${question.answerIndex + 1}`}</strong><p className="mt-1 text-sm leading-6 text-[#55615b]">{question.explanation_zh}</p>{question.composition_note ? <p className="mt-2 text-xs leading-5 text-[#775516]">{question.composition_note}</p> : null}</div> : null}
    <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#e7ddd1] pt-4"><div className="flex flex-wrap items-center gap-3"><a href={question.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[#a84269] hover:underline">{t.source}<ExternalLink size={14} /></a><span className="text-xs text-[#7a6a70]">{question.source_rewrite ? t.rewritten : t.personal}</span></div><button type="button" disabled={!scoringReady || selected === null || submitted} onClick={() => { if (scoringReady) onSubmit(); }} className="rounded-full bg-[#31564c] px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{t.submit}</button></footer>
  </article>;
}

function AuthenticatedAudio({ src, token, loading, unavailable }: { src: string; token: string; loading: string; unavailable: string }) {
  const [audioUrl, setAudioUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    setAudioUrl('');
    setError('');
    fetch(src, { headers: token ? { authorization: `Bearer ${token}` } : {}, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : unavailable);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, token, unavailable]);

  if (error) return <p className="text-xs font-semibold text-[#973f3f]">{unavailable}</p>;
  if (!audioUrl) return <div className="flex h-10 items-center gap-2 text-xs font-semibold text-[#775516]"><LoaderCircle className="animate-spin" size={16} />{loading}</div>;
  return <audio className="h-10 w-full" controls preload="metadata" src={audioUrl} />;
}

function HighlightedPrompt({ text, target }: { text: string; target?: string }) { if (!target || !text.includes(target)) return text; const parts = text.split(target); return parts.map((part, index) => <span key={`${part}-${index}`}>{part}{index < parts.length - 1 ? <mark className="mx-1 rounded-sm border-b-[3px] border-[#a84269] bg-[#fff0a8] px-1 font-black text-[#713047]">{target}</mark> : null}</span>); }
function ModulePills({ day, t }: { day: NewsCycleDay; t: Record<string, string> }) { return <div className="flex flex-wrap gap-1.5">{(['vocabulary', 'grammar', 'listening', 'reading'] as NewsCycleModule[]).map((module) => <span key={module} className="rounded-full bg-[#f2f6f1] px-2 py-1 text-xs font-semibold text-[#46514c]">{t[module]} {day.moduleCounts[module]}</span>)}</div>; }
function CycleModulePills({ cycle, t }: { cycle: NewsCycleSummary; t: Record<string, string> }) { return <div className="flex flex-wrap gap-1.5">{(['vocabulary', 'grammar', 'listening', 'reading'] as NewsCycleModule[]).map((module) => <span key={module} className="rounded-full bg-[#f2f6f1] px-2 py-1 text-xs font-semibold text-[#46514c]">{t[module]} {cycle.moduleCounts[module]}</span>)}</div>; }
function CycleStatus({ cycle, t }: { cycle: NewsCycleSummary; t: Record<string, string> }) { const complete = cycle.formalQuestionCount >= cycle.totalQuestions && cycle.totalQuestions > 0; const partial = cycle.formalQuestionCount > 0; return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${complete || partial ? 'bg-[#eaf3ec] text-[#315f45]' : 'bg-[#fff8df] text-[#775516]'}`}>{complete ? t.completed : partial ? `${t.formalProgress} ${cycle.formalQuestionCount} / ${cycle.totalQuestions}` : t.draft}</span>; }
function SummaryMetric({ label, value }: { label: string; value: string }) { return <div className="border-r border-b border-[#ece4d8] px-4 py-3 last:border-r-0 md:border-b-0"><span className="block text-xs font-semibold text-[#7a6a70]">{label}</span><strong className="mt-1 block text-base text-[#2f3934]">{value}</strong></div>; }
function EmptyState({ icon, title, detail }: { icon: ReactNode; title: string; detail?: string }) { return <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-[#dccfc0] bg-[#fffdf8] p-8 text-center text-[#68716b]">{icon}<strong className="text-base text-[#34443c]">{title}</strong>{detail ? <p className="max-w-xl text-sm">{detail}</p> : null}</div>; }
function formatDate(value: string, locale: Locale) { return new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US', { month: 'long', day: 'numeric' }).format(new Date(`${value}T00:00:00+09:00`)); }
function formatRange(range: { from: string; to: string } | undefined, locale: Locale) { return range ? `${formatDate(range.from, locale)} — ${formatDate(range.to, locale)}` : '—'; }
function cycleLabel(id: string, locale: Locale) { const match = /^(\d{4})-W(\d{2})$/.exec(id); if (!match) return id; if (locale === 'ja') return `${match[1]}年 第${Number(match[2])}週`; if (locale === 'en') return `Week ${Number(match[2])}, ${match[1]}`; return `${match[1]} 年第 ${Number(match[2])} 周`; }
function weekday(value: string, t: Record<string, string>) { return [t.sunday, t.monday, t.tuesday, t.wednesday, t.thursday, t.friday, t.saturday][new Date(`${value}T00:00:00+09:00`).getDay()]; }
