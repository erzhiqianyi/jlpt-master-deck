import { LearningList, LearningListRow } from '../../components/LearningList';
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileCheck2, Flag, Headphones, LoaderCircle, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LocalMockExam, Locale, MockExamQuestion } from '../../types';

type ExamStatus = 'intro' | 'active' | 'result';
type SavedExamState = {
  status: ExamStatus;
  answers: Record<string, number>;
  flagged: string[];
  currentIndex: number;
  startedAt?: string;
  submittedAt?: string;
};

const copy = {
  'zh-CN': {
    back: '返回模拟试题', loading: '正在读取本地模拟卷...', unavailable: '本地模拟卷无法读取。请确认本地后端正在运行。',
    original: 'Agent 写回模拟题', unverified: '未人工校验', questions: '题', minutes: '分钟', start: '开始整套考试', resume: '继续考试',
    intro: '完整试卷分为语言知识・阅读和听力两部分。开始后计时会持续运行，答案会自动保存在当前浏览器。',
    warning: '这不是官方试题或历年真题。题目与解析由外部 Agent 通过 MCP 写回，听力使用系统合成语音，请把成绩作为练习参考。',
    answered: '已答', unanswered: '未答', flagged: '标记', submit: '交卷', prev: '上一题', next: '下一题', cancel: '继续作答', confirm: '确认交卷',
    flag: '标记此题', unflag: '取消标记', confirmSubmit: '仍有题目未作答。确定现在交卷吗？', confirmDone: '确定交卷并查看成绩吗？',
    result: '模拟考试结果', score: '答对', accuracy: '正确率', review: '逐题复盘', onlyWrong: '只看错题', all: '查看全部',
    yourAnswer: '你的答案', correctAnswer: '正确答案', explanation: '解析', transcript: '听力原文', noAnswer: '未作答', restart: '重新作答',
    confirmRestart: '重新作答会清除这套试卷当前保存的答案。', confirmRestartButton: '清除并重来', timeUp: '考试时间已结束，系统已自动交卷。',
  },
  ja: {
    back: '模擬試験一覧へ戻る', loading: 'ローカル模擬試験を読み込んでいます...', unavailable: 'ローカル模擬試験を読み込めません。ローカルサーバーを確認してください。',
    original: 'AI オリジナル模擬問題', unverified: '未校閲', questions: '問', minutes: '分', start: '模擬試験を始める', resume: '試験を続ける',
    intro: '言語知識・読解と聴解の二部構成です。開始後も計時は継続し、解答はこのブラウザに自動保存されます。',
    warning: '公式問題・過去問題ではありません。問題と解説は AI 生成、聴解は合成音声です。得点は練習の目安として利用してください。',
    answered: '解答済み', unanswered: '未解答', flagged: '見直し', submit: '採点する', prev: '前へ', next: '次へ', cancel: '解答を続ける', confirm: '採点する',
    flag: '見直しに追加', unflag: '見直しを解除', confirmSubmit: '未解答の問題があります。このまま採点しますか。', confirmDone: '採点して結果を表示しますか。',
    result: '模擬試験の結果', score: '正解', accuracy: '正答率', review: '問題別の復習', onlyWrong: '誤答のみ', all: 'すべて表示',
    yourAnswer: 'あなたの解答', correctAnswer: '正解', explanation: '解説', transcript: '聴解スクリプト', noAnswer: '未解答', restart: 'もう一度解く',
    confirmRestart: '保存済みの解答を消去して、最初からやり直します。', confirmRestartButton: '消去してやり直す', timeUp: '試験時間が終了したため、自動的に採点しました。',
  },
  en: {
    back: 'Back to mock exams', loading: 'Loading the local mock exam...', unavailable: 'The local mock exam could not be loaded. Check that the local backend is running.',
    original: 'AI-original mock exam', unverified: 'Not human-reviewed', questions: 'questions', minutes: 'minutes', start: 'Start full exam', resume: 'Resume exam',
    intro: 'The full paper has Language Knowledge and Reading, followed by Listening. The clock continues after you start, and answers are saved in this browser.',
    warning: 'This is not an official or past JLPT paper. Questions and explanations are AI-generated, and listening uses synthesized speech. Treat the score as practice feedback.',
    answered: 'Answered', unanswered: 'Unanswered', flagged: 'Flagged', submit: 'Submit exam', prev: 'Previous', next: 'Next', cancel: 'Continue exam', confirm: 'Confirm submission',
    flag: 'Flag question', unflag: 'Remove flag', confirmSubmit: 'Some questions are unanswered. Submit now?', confirmDone: 'Submit the exam and view results?',
    result: 'Mock exam result', score: 'Correct', accuracy: 'Accuracy', review: 'Question review', onlyWrong: 'Wrong only', all: 'Show all',
    yourAnswer: 'Your answer', correctAnswer: 'Correct answer', explanation: 'Explanation', transcript: 'Listening transcript', noAnswer: 'Unanswered', restart: 'Restart exam',
    confirmRestart: 'Restarting clears the saved answers for this paper.', confirmRestartButton: 'Clear and restart', timeUp: 'Time expired. The exam was submitted automatically.',
  },
} satisfies Record<Locale, Record<string, string>>;

export function MockExamPanel({ examId, locale, onBack }: { examId: string; locale: Locale; onBack: () => void }) {
  const t = copy[locale];
  const storageKey = `jlpt-local-mock:${examId}`;
  const [exam, setExam] = useState<LocalMockExam | null>(null);
  const [loadingError, setLoadingError] = useState('');
  const [saved, setSaved] = useState<SavedExamState>(() => readSavedState(storageKey));
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [reviewQuestionId, setReviewQuestionId] = useState<string | null>(null);
  const [wrongOnly, setWrongOnly] = useState(true);
  const [timeUpNotice, setTimeUpNotice] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [confirmingRestart, setConfirmingRestart] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const questionSurfaceRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/local-mock-exams/${encodeURIComponent(examId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<LocalMockExam>;
      })
      .then((payload) => { if (!cancelled) setExam(payload); })
      .catch(() => { if (!cancelled) setLoadingError(t.unavailable); });
    return () => { cancelled = true; };
  }, [examId, t.unavailable]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(saved));
  }, [saved, storageKey]);

  useEffect(() => {
    if (!exam || saved.status !== 'active' || !saved.startedAt) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - new Date(saved.startedAt as string).getTime()) / 1000);
      const next = Math.max(0, exam.totalDurationMinutes * 60 - elapsed);
      setRemainingSeconds(next);
      if (next === 0) {
        setTimeUpNotice(true);
        setSaved((current) => ({ ...current, status: 'result', submittedAt: new Date().toISOString() }));
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [exam, saved.startedAt, saved.status]);

  const answeredCount = Object.keys(saved.answers).length;
  const flaggedSet = useMemo(() => new Set(saved.flagged), [saved.flagged]);
  const currentQuestion = exam?.questions[saved.currentIndex];
  const correctCount = exam?.questions.filter((item) => saved.answers[item.id] === item.answerIndex).length ?? 0;
  const reviewQuestions = exam?.questions.filter((item) => !wrongOnly || saved.answers[item.id] !== item.answerIndex) ?? [];

  useEffect(() => {
    if (saved.status !== 'active') return;
    const frame = window.requestAnimationFrame(() => questionSurfaceRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [saved.currentIndex, saved.status]);

  useEffect(() => {
    if (!exam || saved.status !== 'active' || !currentQuestion) return;
    const activeExam = exam;
    const activeQuestion = currentQuestion;

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const insideControl = Boolean(target?.closest('button, a, audio, input, textarea, select, summary'));

      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        setConfirmingSubmit(true);
        return;
      }
      if (event.key === 'Escape' && confirmingSubmit) {
        event.preventDefault();
        setConfirmingSubmit(false);
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const choiceIndex = /^[1-4]$/.test(event.key) ? Number(event.key) - 1 : -1;
      if (choiceIndex >= 0) {
        event.preventDefault();
        setSaved((current) => ({ ...current, answers: { ...current.answers, [activeQuestion.id]: choiceIndex } }));
        return;
      }
      if (insideControl && (event.key === 'Enter' || event.code === 'Space')) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setSaved((current) => ({ ...current, currentIndex: Math.max(0, current.currentIndex - 1) }));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setSaved((current) => ({ ...current, currentIndex: Math.min(activeExam.questions.length - 1, current.currentIndex + 1) }));
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSaved((current) => ({
          ...current,
          flagged: current.flagged.includes(activeQuestion.id) ? current.flagged.filter((id) => id !== activeQuestion.id) : [...current.flagged, activeQuestion.id],
        }));
      } else if (event.code === 'Space' && activeQuestion.audioUrl && audioRef.current) {
        event.preventDefault();
        if (audioRef.current.paused) void audioRef.current.play();
        else audioRef.current.pause();
      } else if (event.key === 'Enter' && saved.answers[activeQuestion.id] !== undefined) {
        event.preventDefault();
        setSaved((current) => ({ ...current, currentIndex: Math.min(activeExam.questions.length - 1, current.currentIndex + 1) }));
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmingSubmit, currentQuestion, exam, saved.answers, saved.status]);

  function startExam() {
    if (!exam) return;
    if (saved.status === 'active') return;
    setSaved({ status: 'active', answers: {}, flagged: [], currentIndex: 0, startedAt: new Date().toISOString() });
    setRemainingSeconds(exam.totalDurationMinutes * 60);
  }

  function answer(questionId: string, choiceIndex: number) {
    setSaved((current) => ({ ...current, answers: { ...current.answers, [questionId]: choiceIndex } }));
  }

  function moveTo(index: number) {
    if (!exam) return;
    setSaved((current) => ({ ...current, currentIndex: Math.max(0, Math.min(exam.questions.length - 1, index)) }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleFlag(questionId: string) {
    setSaved((current) => ({
      ...current,
      flagged: current.flagged.includes(questionId) ? current.flagged.filter((id) => id !== questionId) : [...current.flagged, questionId],
    }));
  }

  function submitExam() {
    setSaved((current) => ({ ...current, status: 'result', submittedAt: new Date().toISOString() }));
    setConfirmingSubmit(false);
  }

  function restartExam() {
    setTimeUpNotice(false);
    setWrongOnly(true);
    setConfirmingRestart(false);
    setSaved({ status: 'intro', answers: {}, flagged: [], currentIndex: 0 });
  }

  if (!exam) {
    return (
      <section className="mx-auto w-full max-w-5xl py-8">
        <button type="button" onClick={onBack} className="cute-focus inline-flex items-center gap-2 text-sm font-bold text-[#a84269]"><ArrowLeft size={17} />{t.back}</button>
        <div className="mt-5 rounded-lg border border-[#dfe5dc] bg-white p-8 text-center">
          {loadingError ? <p className="text-sm font-semibold text-[#9b435f]">{loadingError}</p> : <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#59645e]"><LoaderCircle className="animate-spin" size={18} />{t.loading}</p>}
        </div>
      </section>
    );
  }

  if (saved.status === 'intro') {
    return (
      <section className="mx-auto w-full max-w-5xl py-3 md:py-6">
        <button type="button" onClick={onBack} className="cute-focus inline-flex items-center gap-2 text-sm font-bold text-[#a84269]"><ArrowLeft size={17} />{t.back}</button>
        <div className="mt-5 overflow-hidden rounded-lg border border-[#d8e1da] bg-[#fcfdfa] shadow-sm">
          <div className="border-b border-[#e1e7df] bg-white px-5 py-6 md:px-8 md:py-8">
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded bg-[#e9f4ec] px-2.5 py-1 text-[#356146]">{exam.level}</span>
              <span className="rounded bg-[#fff1f5] px-2.5 py-1 text-[#9b435f]">{t.original}</span>
              <span className="rounded bg-[#fff7df] px-2.5 py-1 text-[#775516]">{t.unverified}</span>
            </div>
            <h1 className="mt-5 text-3xl font-black text-[#27312c] md:text-4xl">{exam.title}</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[#65706a]">{t.intro}</p>
          </div>
          <div className="grid gap-px bg-[#e1e7df] sm:grid-cols-3">
            <ExamMetric label={t.questions} value={String(exam.questions.length)} />
            <ExamMetric label={t.minutes} value={String(exam.totalDurationMinutes)} />
            <ExamMetric label={locale === 'zh-CN' ? '考试部分' : locale === 'ja' ? '試験区分' : 'Sections'} value={String(exam.sections.length)} />
          </div>
          <div className="px-5 py-6 md:px-8">
            <div className="grid gap-3 md:grid-cols-2">
              {exam.sections.map((section, index) => (
                <div key={section.id} className="rounded-md border border-[#dce4dd] bg-white p-4">
                  <p className="text-xs font-bold text-[#7a837d]">SECTION {index + 1}</p>
                  <h2 className="mt-1 text-base font-bold text-[#27312c]">{section.title}</h2>
                  <p className="mt-2 text-sm text-[#68716b]">{section.questionCount} {t.questions} · {section.durationMinutes} {t.minutes}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 flex items-start gap-2 rounded-md border border-[#ecdca8] bg-[#fffbea] p-4 text-sm leading-6 text-[#6f5b20]"><AlertTriangle className="mt-0.5 shrink-0" size={18} />{t.warning}</p>
            <button type="button" onClick={startExam} className="cute-button-primary cute-focus mt-6 inline-flex h-12 items-center gap-2 rounded-md border px-6 text-sm font-bold"><Clock3 size={18} />{t.start}</button>
          </div>
        </div>
      </section>
    );
  }

  if (saved.status === 'result') {
    const accuracy = Math.round((correctCount / exam.questions.length) * 100);
    return (
      <section className="mx-auto w-full max-w-6xl py-3 md:py-6">
        <button type="button" onClick={onBack} className="cute-focus inline-flex items-center gap-2 text-sm font-bold text-[#a84269]"><ArrowLeft size={17} />{t.back}</button>
        {timeUpNotice ? <p role="status" className="mt-4 rounded-md border border-[#ecdca8] bg-[#fffbea] p-3 text-sm font-bold text-[#6f5b20]">{t.timeUp}</p> : null}
        <div className="mt-4 rounded-lg border border-[#dce4dd] bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs font-bold text-[#9b435f]">{exam.title}</p>
              <h1 className="mt-1 text-3xl font-black text-[#27312c]">{t.result}</h1>
            </div>
            <button type="button" onClick={() => setConfirmingRestart(true)} className="inline-flex h-10 items-center gap-2 rounded-md border border-[#c9d4cc] bg-white px-4 text-sm font-bold text-[#46514c] hover:bg-[#f3f6f3]"><RotateCcw size={17} />{t.restart}</button>
          </div>
          {confirmingRestart ? (
            <div role="alert" className="mt-5 flex flex-col gap-3 rounded-md border border-[#e5cc82] bg-[#fffbea] p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-bold leading-6 text-[#6f5b20]">{t.confirmRestart}</p>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setConfirmingRestart(false)} className="h-9 rounded-md border border-[#cfc7a8] bg-white px-3 text-sm font-bold text-[#6f5b20]">{t.cancel}</button>
                <button type="button" onClick={restartExam} className="h-9 rounded-md bg-[#8a681d] px-3 text-sm font-bold text-white">{t.confirmRestartButton}</button>
              </div>
            </div>
          ) : null}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <ResultMetric label={t.score} value={`${correctCount} / ${exam.questions.length}`} />
            <ResultMetric label={t.accuracy} value={`${accuracy}%`} />
            <ResultMetric label={t.unanswered} value={String(exam.questions.length - answeredCount)} />
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {exam.sections.map((section) => {
              const sectionQuestions = exam.questions.filter((item) => item.sectionId === section.id);
              const sectionCorrect = sectionQuestions.filter((item) => saved.answers[item.id] === item.answerIndex).length;
              return <div key={section.id} className="rounded-md border border-[#e0e6e1] p-4"><p className="font-bold text-[#34423b]">{section.title}</p><p className="mt-2 text-2xl font-black text-[#31564c]">{sectionCorrect} / {sectionQuestions.length}</p></div>;
            })}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black text-[#27312c]">{t.review}</h2>
          <button type="button" onClick={() => setWrongOnly((value) => !value)} className="h-9 rounded-md border border-[#c9d4cc] bg-white px-3 text-sm font-bold text-[#46514c]">{wrongOnly ? t.all : t.onlyWrong}</button>
        </div>
        <div className="mt-3 grid gap-4">
          <LearningList locale={locale} columnLabels={locale === "ja" ? ["問題", "内容", "結果"] : locale === "en" ? ["Question", "Content", "Result"] : ["题目", "内容", "结果"]}>{reviewQuestions.map((item) => <LearningListRow key={item.id} title={item.group} description={item.prompt} locale={locale} expanded={reviewQuestionId === item.id} statusKind={saved.answers[item.id] === undefined ? 'unanswered' : saved.answers[item.id] === item.answerIndex ? 'correct' : 'incorrect'} status={saved.answers[item.id] === undefined ? t.noAnswer : saved.answers[item.id] === item.answerIndex ? (locale === 'ja' ? '正解' : locale === 'en' ? 'Correct' : '正确') : (locale === 'ja' ? '不正解' : locale === 'en' ? 'Incorrect' : '错误')} onOpen={() => setReviewQuestionId(reviewQuestionId === item.id ? null : item.id)} secondary={reviewQuestionId === item.id ? <div className="w-full"><ReviewQuestion item={item} selected={saved.answers[item.id]} t={t}/></div> : undefined}/>)}</LearningList>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-7xl py-2 md:py-4">
      <div className="sticky top-[64px] z-20 flex flex-wrap items-center justify-between gap-3 border-y border-[#dce4dd] bg-[#fffefa]/95 px-3 py-3 backdrop-blur md:top-[65px] md:rounded-md md:border">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[#34423b]">{exam.title}</p>
          <p className="mt-0.5 text-xs text-[#727d76]">{answeredCount}/{exam.questions.length} {t.answered} · {saved.flagged.length} {t.flagged}</p>
        </div>
        <div className={`inline-flex items-center gap-2 font-mono text-lg font-black tabular-nums ${remainingSeconds < 600 ? 'text-[#b43f5f]' : 'text-[#31564c]'}`}><Clock3 size={19} />{formatTime(remainingSeconds)}</div>
        <button type="button" aria-keyshortcuts="Control+Enter Meta+Enter" onClick={() => setConfirmingSubmit(true)} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#31564c] px-4 text-sm font-bold text-white hover:bg-[#24473f]"><FileCheck2 size={17} />{t.submit}</button>
      </div>
      {confirmingSubmit ? (
        <div role="alert" className="mt-3 flex flex-col gap-3 rounded-md border border-[#e5cc82] bg-[#fffbea] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold leading-6 text-[#6f5b20]">{answeredCount < exam.questions.length ? `${t.confirmSubmit} ${t.unanswered}: ${exam.questions.length - answeredCount}` : t.confirmDone}</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => setConfirmingSubmit(false)} className="h-9 rounded-md border border-[#cfc7a8] bg-white px-3 text-sm font-bold text-[#6f5b20]">{t.cancel}</button>
            <button type="button" onClick={submitExam} className="h-9 rounded-md bg-[#8a681d] px-3 text-sm font-bold text-white">{t.confirm}</button>
          </div>
        </div>
      ) : null}
      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <QuestionNavigator exam={exam} saved={saved} flaggedSet={flaggedSet} onMove={moveTo} />
        {currentQuestion ? (
          <main ref={questionSurfaceRef} tabIndex={-1} className="order-1 min-w-0 rounded-lg border border-[#dce4dd] bg-white shadow-sm outline-none lg:order-2">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e1e7df] px-4 py-4 md:px-6">
              <div>
                <p className="text-xs font-bold text-[#9b435f]">{currentQuestion.group}</p>
                <p className="mt-1 text-sm font-semibold text-[#68716b]">{saved.currentIndex + 1} / {exam.questions.length}</p>
              </div>
              <button type="button" aria-keyshortcuts="F" onClick={() => toggleFlag(currentQuestion.id)} className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-bold ${flaggedSet.has(currentQuestion.id) ? 'border-[#e5bd52] bg-[#fff7d9] text-[#775516]' : 'border-[#d4ddd6] text-[#65706a]'}`}><Flag size={16} />{flaggedSet.has(currentQuestion.id) ? t.unflag : t.flag}</button>
            </div>
            <div className="p-4 md:p-7">
              {currentQuestion.audioUrl ? <audio ref={audioRef} key={currentQuestion.id} aria-keyshortcuts="Space" className="w-full" controls preload="metadata" src={currentQuestion.audioUrl} /> : null}
              {currentQuestion.passage ? <div className="mb-6 whitespace-pre-wrap rounded-md border border-[#e1e7df] bg-[#fafbf8] p-4 text-base leading-8 text-[#34423b] md:p-6">{currentQuestion.passage}</div> : null}
              <h1 className="whitespace-pre-wrap text-lg font-bold leading-8 text-[#27312c]">{currentQuestion.prompt}</h1>
              <div className="mt-6 grid gap-3">
                {currentQuestion.choices.map((choice, choiceIndex) => {
                  const selected = saved.answers[currentQuestion.id] === choiceIndex;
                  return (
                    <button key={choiceIndex} type="button" aria-keyshortcuts={String(choiceIndex + 1)} onClick={() => answer(currentQuestion.id, choiceIndex)} className={`flex min-h-14 w-full items-start gap-3 rounded-md border px-4 py-3 text-left text-base leading-7 transition ${selected ? 'border-[#31564c] bg-[#edf6f0] text-[#24473f] ring-1 ring-[#31564c]' : 'border-[#dce4dd] bg-white text-[#3f4944] hover:bg-[#f7faf7]'}`}>
                      <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${selected ? 'border-[#31564c] bg-[#31564c] text-white' : 'border-[#bdc9c1] bg-white text-[#5d6962]'}`}>{choiceIndex + 1}</span>
                      <span>{choice}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[#e1e7df] px-4 py-4 md:px-6">
              <button type="button" aria-keyshortcuts="ArrowLeft" disabled={saved.currentIndex === 0} onClick={() => moveTo(saved.currentIndex - 1)} className="inline-flex h-10 items-center gap-2 rounded-md border border-[#cbd6ce] bg-white px-4 text-sm font-bold text-[#46514c] disabled:opacity-40"><ChevronLeft size={17} />{t.prev}</button>
              <button type="button" aria-keyshortcuts="ArrowRight Enter" disabled={saved.currentIndex === exam.questions.length - 1} onClick={() => moveTo(saved.currentIndex + 1)} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#31564c] px-4 text-sm font-bold text-white disabled:opacity-40">{t.next}<ChevronRight size={17} /></button>
            </div>
          </main>
        ) : null}
      </div>
    </section>
  );
}

function QuestionNavigator({ exam, saved, flaggedSet, onMove }: { exam: LocalMockExam; saved: SavedExamState; flaggedSet: Set<string>; onMove: (index: number) => void }) {
  return (
    <aside className="order-2 min-w-0 self-start rounded-lg border border-[#dce4dd] bg-white p-3 shadow-sm lg:order-1 lg:sticky lg:top-[142px] lg:max-h-[calc(100vh-158px)] lg:overflow-y-auto">
      {exam.sections.map((section) => (
        <div key={section.id} className="mb-4 last:mb-0">
          <p className="mb-2 text-xs font-bold leading-5 text-[#5c6962]">{section.title}</p>
          <div className="grid grid-cols-8 gap-1.5 lg:grid-cols-6">
            {exam.questions.map((item, index) => item.sectionId === section.id ? (
              <button key={item.id} type="button" title={`${index + 1}. ${item.group}`} onClick={() => onMove(index)} className={`relative aspect-square rounded border text-xs font-bold ${saved.currentIndex === index ? 'border-[#a84269] bg-[#a84269] text-white' : saved.answers[item.id] !== undefined ? 'border-[#9fc0aa] bg-[#eef7f0] text-[#31564c]' : 'border-[#d9e1db] bg-white text-[#6a756e]'}`}>
                {index + 1}
                {flaggedSet.has(item.id) ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-white bg-[#e2ad27]" /> : null}
              </button>
            ) : null)}
          </div>
        </div>
      ))}
    </aside>
  );
}

function ReviewQuestion({ item, selected, t }: { item: MockExamQuestion; selected?: number; t: Record<string, string> }) {
  const correct = selected === item.answerIndex;
  return (
    <article className={`rounded-lg border bg-white p-4 shadow-sm md:p-6 ${correct ? 'border-[#cfe2d4]' : 'border-[#eccbd4]'}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-[#7a837d]">{item.group} · {item.id}</p>
        {correct ? <CheckCircle2 size={20} className="text-[#3f7653]" /> : <AlertTriangle size={20} className="text-[#b54562]" />}
      </div>
      {item.passage ? <details className="mt-3 rounded-md bg-[#f7f9f6] p-3 text-sm leading-7 text-[#46514c]"><summary className="cursor-pointer font-bold">本文</summary><p className="mt-3 whitespace-pre-wrap">{item.passage}</p></details> : null}
      <p className="mt-4 whitespace-pre-wrap font-bold leading-7 text-[#27312c]">{item.prompt}</p>
      <div className="mt-4 grid gap-2 text-sm leading-6">
        <p><span className="font-bold text-[#6c7770]">{t.yourAnswer}: </span>{selected === undefined ? t.noAnswer : `${selected + 1}. ${item.choices[selected]}`}</p>
        <p className="text-[#31564c]"><span className="font-bold">{t.correctAnswer}: </span>{item.answerIndex + 1}. {item.choices[item.answerIndex]}</p>
      </div>
      <p className="mt-4 rounded-md bg-[#f4f7f3] p-3 text-sm leading-7 text-[#46514c]"><span className="font-bold">{t.explanation}: </span>{item.explanation}</p>
      {item.transcript ? <details className="mt-3 rounded-md border border-[#dce4dd] p-3 text-sm leading-7 text-[#46514c]"><summary className="cursor-pointer inline-flex items-center gap-2 font-bold"><Headphones size={16} />{t.transcript}</summary><p className="mt-3 whitespace-pre-wrap">{item.transcript}</p></details> : null}
    </article>
  );
}

function ExamMetric({ label, value }: { label: string; value: string }) {
  return <div className="bg-[#f8faf7] px-5 py-5 text-center"><p className="text-3xl font-black text-[#31564c]">{value}</p><p className="mt-1 text-xs font-bold text-[#6d7871]">{label}</p></div>;
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-[#dce4dd] bg-[#f8faf7] p-4"><p className="text-xs font-bold text-[#6d7871]">{label}</p><p className="mt-2 text-3xl font-black text-[#31564c]">{value}</p></div>;
}

function readSavedState(storageKey: string): SavedExamState {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as SavedExamState | null;
    if (value && ['intro', 'active', 'result'].includes(value.status)) return { ...value, answers: value.answers ?? {}, flagged: value.flagged ?? [], currentIndex: value.currentIndex ?? 0 };
  } catch {
    // Ignore malformed local state and start a clean attempt.
  }
  return { status: 'intro', answers: {}, flagged: [], currentIndex: 0 };
}

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}
