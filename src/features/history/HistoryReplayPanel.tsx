import { useEffect, useRef, useState } from 'react';
import { answersForAttempt } from '../../domain/attemptReplay';
import { PracticePanel, PracticeReviewPanel } from '../practice/StudyPanels';
import type { DisplaySettings, Locale, PracticeAttempt, Question, VocabItem } from '../../types';

/** A replay owns its answers; prior history and other ongoing sessions are never reused. */
export function HistoryReplayPanel({ attempt, questions, items, labels, locale, settings, token, review, onSave, onRestart, onReview, onPractice, onBack }: {
  attempt: PracticeAttempt; questions: Question[]; items: VocabItem[]; labels: Record<string, string>;
  locale: Locale; settings: DisplaySettings; token: string; review: boolean;
  onSave: (attempt: PracticeAttempt) => Promise<void>; onRestart: () => void;
  onReview: () => void; onPractice: () => void; onBack: () => void;
}) {
  const [session, setSession] = useState(attempt);
  const sessionRef = useRef(attempt);
  const completionPending = useRef(false);
  const completionPromise = useRef<Promise<void> | null>(null);
  const [index, setIndex] = useState(() => Math.max(0, questions.findIndex((question) => !attempt.answers.some((answer) => answer.questionId === question.id))));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const clock = useRef(Date.now());
  const answers = answersForAttempt(session);
  const activeQuestion = questions[index];
  useEffect(() => {
    clock.current = Date.now();
    const reset = () => { clock.current = Date.now(); };
    document.addEventListener('visibilitychange', reset);
    return () => document.removeEventListener('visibilitychange', reset);
  }, [index]);

  function answerQuestion(question: Question, selected: string) {
    if (sessionRef.current.completedAt || completionPending.current) return;
    const current = sessionRef.current;
    const now = new Date();
    const previous = current.answers.find((answer) => answer.questionId === question.id);
    const next: PracticeAttempt = { ...current, answers: [
      ...current.answers.filter((answer) => answer.questionId !== question.id),
      { questionId: question.id, itemId: question.itemId, kind: question.kind, selected,
        correct: selected === question.answer, startedAt: previous?.startedAt ?? new Date(clock.current).toISOString(),
        answeredAt: now.toISOString(), elapsedMs: (previous?.elapsedMs ?? 0) + Math.max(0, now.getTime() - clock.current) },
    ] };
    clock.current = now.getTime();
    sessionRef.current = next;
    setSession(next);
    setError('');
    void onSave(next).catch((cause) => setError(cause instanceof Error ? cause.message : (locale === 'zh-CN' ? '保存失败，请重试' : locale === 'ja' ? '保存に失敗しました。再試行してください。' : 'Save failed. Please try again.')));
  }

  function complete(): Promise<void> {
    if (completionPromise.current) return completionPromise.current;
    if (sessionRef.current.completedAt) return Promise.resolve();
    const current = sessionRef.current;
    if (current.answers.length !== questions.length) return Promise.resolve();
    completionPending.current = true;
    const now = new Date().toISOString();
    const correct = current.answers.filter((answer) => answer.correct).length;
    const completed: PracticeAttempt = { ...current, completedAt: current.completedAt ?? now,
      analysisStatus: 'completed', analysisCompletedAt: now,
      summary: { total: questions.length, correct, wrong: questions.length - correct,
        accuracy: questions.length ? correct / questions.length : 0,
        elapsedMs: current.answers.reduce((total, answer) => total + answer.elapsedMs, 0) } };
    setSaving(true); setError('');
    const pending = Promise.resolve().then(() => onSave(completed)).then(() => {
      sessionRef.current = completed;
      setSession(completed);
    }).catch((cause) => {
      setError(cause instanceof Error ? cause.message : (locale === 'zh-CN' ? '保存失败，请重试' : locale === 'ja' ? '保存に失敗しました。再試行してください。' : 'Save failed. Please try again.'));
      throw cause;
    }).finally(() => {
      completionPromise.current = null;
      completionPending.current = false;
      setSaving(false);
    });
    completionPromise.current = pending;
    return pending;
  }

  return <>
    {error ? <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">{error}</p> : null}
    {review ? <PracticeReviewPanel token={token} attempt={session} questions={questions} answers={answers} items={items} labels={labels} locale={locale} showRuby={settings.showExplanationRuby} onRestart={onRestart} onBackToPractice={onPractice} />
      : <PracticePanel token={token} activeQuestion={activeQuestion} questions={questions} questionsLength={questions.length}
          activeIndex={index} answeredCount={session.answers.length} complete={session.answers.length === questions.length}
          feedbackMode="batch" answers={answers} items={items} labels={labels} questionTypeLabel={session.title ?? labels.reviewSummaryTitle}
          settings={settings} onAnswer={answerQuestion} onPrev={() => setIndex((value) => Math.max(0, value - 1))}
          onNext={() => setIndex((value) => Math.min(questions.length - 1, value + 1))} onJump={setIndex}
          onRestart={onRestart} onPracticeHome={onBack} onPrepareReview={complete} onReview={onReview}
          analysisStatus={saving ? 'processing' : session.analysisStatus === 'completed' ? 'completed' : 'idle'} />}
  </>;
}
