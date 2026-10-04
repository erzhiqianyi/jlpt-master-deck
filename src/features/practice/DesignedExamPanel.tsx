import './practice-layout.css';
import { conciseEvidence } from './practicePresentation';
import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { LearningCatalog } from '../../components/LearningCatalog';
import { LearningListRow } from '../../components/LearningList';
import { apiRequest } from '../../lib/api';
import { canScoreExamQuestion, examSessionKey, examSessionScore, readExamAttempt } from '../../domain/mockExam.mjs';
import { ExamAudio } from './ExamAudio';
import type { DesignedExam, ExamSession } from './mockExamTypes';
import type { Locale, NewsCycleData } from '../../types';

const copy = {
  'zh-CN': { retry: '重试', more: '详细解析与参考', back: '返回模拟考试', parts: '内容安排', loading: '正在读取试卷…', unavailable: '这份试卷暂时无法读取。', missing: '找不到这部分内容。', questions: '题', done: '已交卷', ongoing: '作答中', ready: '未开始', start: '开始作答', submit: '交卷', confirm: '确认交卷', cancel: '继续作答', confirmText: '交卷后显示答案与解析，未答题计为未答。', previous: '上一题', next: '下一题', result: '本次结果', correct: '答对', answered: '已答', excluded: '题暂不判分', noQuestions: '暂无可判分题目。', explanation: '解析', answer: '正确答案', source: '查看来源', minutes: '分钟', untimed: '不限时', saved: '作答进度保存在当前浏览器。', storageError: '浏览器无法保存进度，请勿关闭页面。', remaining: '剩余', restart: '重新作答', restartConfirm: '清除本次答案并重新开始？', imported: '由原新闻材料按日期整理；保留原题和来源，未新增人工审核。', draft: '试卷内容由作者提供。', audioLoading: '加载音频…', audioError: '音频暂时无法播放。', noScore: '本题材料或答案尚未就绪，暂不判分。' },
  ja: { retry: '再試行', more: '詳しい解説と参考', back: '模擬試験へ戻る', parts: '構成', loading: '読み込み中…', unavailable: '試験を読み込めません。', missing: 'パートが見つかりません。', questions: '問', done: '提出済み', ongoing: '解答中', ready: '未開始', start: '開始', submit: '提出', confirm: '提出する', cancel: '続ける', confirmText: '提出後に正解と解説を表示します。未解答は未解答として記録します。', previous: '前へ', next: '次へ', result: '結果', correct: '正解', answered: '解答済み', excluded: '問は採点対象外', noQuestions: '採点できる問題がありません。', explanation: '解説', answer: '正解', source: '出典', minutes: '分', untimed: '時間制限なし', saved: '解答はこのブラウザに保存されます。', storageError: '保存できません。ページを閉じないでください。', remaining: '残り', restart: 'もう一度', restartConfirm: '解答を消去して再開しますか？', imported: '既存のニュース教材を日付別に表示しています。追加の人手レビューは行っていません。', draft: '問題は作成者が提供しています。', audioLoading: '音声読み込み中…', audioError: '音声を再生できません。', noScore: '教材または正解の確認待ちのため採点しません。' },
  en: { retry: 'Retry', more: 'Detailed explanation and references', back: 'Back to mock exams', parts: 'Sessions', loading: 'Loading exam…', unavailable: 'This exam could not be loaded.', missing: 'Session not found.', questions: 'questions', done: 'Submitted', ongoing: 'In progress', ready: 'Not started', start: 'Start', submit: 'Submit', confirm: 'Confirm submission', cancel: 'Continue', confirmText: 'Answers and explanations appear after submission. Unanswered questions stay unanswered.', previous: 'Previous', next: 'Next', result: 'Results', correct: 'Correct', answered: 'Answered', excluded: 'questions excluded from scoring', noQuestions: 'No scorable questions yet.', explanation: 'Explanation', answer: 'Correct answer', source: 'View source', minutes: 'minutes', untimed: 'Untimed', saved: 'Progress is saved in this browser.', storageError: 'Progress cannot be saved. Keep this page open.', remaining: 'Remaining', restart: 'Try again', restartConfirm: 'Clear this attempt and start again?', imported: 'Previous news material grouped by date. Original questions and sources retained; no new human review performed.', draft: 'Content is supplied by the author.', audioLoading: 'Loading audio…', audioError: 'Audio is unavailable.', noScore: 'Materials or answers are not ready; this question is excluded from scoring.' },
};

type Attempt = { revision: string; answers: Record<string, number>; submitted: boolean; startedAt?: string };
function readLocalAttempt(key: string, questions: ExamSession['questions']): Attempt {
  // Accessing localStorage itself may throw when browser storage is unavailable.
  try { return readExamAttempt(localStorage, key, questions) as Attempt; }
  catch { return readExamAttempt({ getItem: () => null }, key, questions) as Attempt; }
}
export function DesignedExamPanel({ selection, userId, token, locale, onOpen }: { selection: string; userId: number; token: string; locale: Locale; onOpen: (id?: string) => void }) {
  const [kind, id, ...sessionParts] = selection.split(':');
  const sessionId = sessionParts.join(':');
  const parent = `${kind}:${id}`;
  const t = copy[locale];
  const [exam, setExam] = useState<DesignedExam | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setExam(null); setFailed(false);
    const request = kind === 'week'
      ? apiRequest<NewsCycleData>(`/api/local-news-cycle?id=${encodeURIComponent(id)}`, { token }).then(data => ({
        id, title: id, revision: 1, description: t.imported,
        sessions: data.days.map(day => ({ id: day.date, title: day.date, scheduledDate: day.date, questions: day.questions.map(q => ({
          id: q.id, prompt: [q.prompt, q.question].filter(Boolean).join('\n'), passage: q.passage,
          choices: q.choices, answerIndex: q.answerIndex, explanation: q.explanation_zh, sourceUrl: q.source_url, type: q.official_type,
          audioUrl: q.audio?.previewUrl, scoringReady: q.scoring_ready !== false && (q.module !== 'listening' || (q.audio?.import_ready === true && Boolean(q.audio?.timecode) && Boolean(q.audio?.previewUrl))),
        })) })),
      }))
      : apiRequest<{ exam: DesignedExam }>(`/api/mock-exams/${encodeURIComponent(id)}`, { token }).then(payload => payload.exam);
    request.then(value => { if (!cancelled) setExam(value); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [kind, id, token, t, reload]);
  if (!exam) return <section><button className="gentle-direct-link" onClick={() => onOpen()}>{t.back}</button><p role="status">{failed ? t.unavailable : t.loading}</p>{failed ? <button type="button" className="practice-primary-action" onClick={() => setReload(value => value + 1)}>{t.retry}</button> : null}</section>;
  const session = exam.sessions.find(part => part.id === sessionId);
  if (sessionId) return session ? <ExamSessionPanel key={`${userId}:${parent}:${sessionId}:${exam.revision}`} session={session} storageKey={examSessionKey(userId, parent, sessionId)} locale={locale} token={token} onBack={() => onOpen(parent)} />
    : <section><button className="gentle-direct-link" onClick={() => onOpen(parent)}>{t.parts}</button><p>{t.missing}</p></section>;
  const results = exam.sessions.map(part => {
    const attempt = readLocalAttempt(examSessionKey(userId, parent, part.id), part.questions);
    return { part, attempt, score: examSessionScore(part.questions, attempt.answers) };
  });
  const submitted = results.filter(row => row.attempt.submitted);
  return <LearningCatalog title={exam.title} locale={locale} items={results} onBack={() => onOpen()}
    notice={<>{exam.description || t.draft}<p>{t.done} {submitted.length} / {results.length}{submitted.length ? ` · ${t.correct} ${submitted.reduce((n, row) => n + row.score.correct, 0)} / ${submitted.reduce((n, row) => n + row.score.total, 0)}` : ''}</p></>}
    columnLabels={locale === 'ja' ? ['パート', '問題数・時間', '状態'] : locale === 'en' ? ['Session', 'Questions / time', 'Status'] : ['内容安排', '题数与时长', '状态']}
    searchText={({ part }) => `${part.title} ${part.scheduledDate ?? ''} ${part.description ?? ''}`}
    renderRow={({ part, attempt, score }) => <LearningListRow key={part.id} title={part.title} description={`${part.scheduledDate ? `${part.scheduledDate} · ` : ''}${part.questions.length} ${t.questions} · ${part.durationMinutes ? `${part.durationMinutes} ${t.minutes}` : t.untimed}`}
      status={attempt.submitted ? `${t.done} · ${score.correct}/${score.total}` : attempt.startedAt ? t.ongoing : t.ready} locale={locale} onOpen={() => onOpen(`${parent}:${part.id}`)} />} />;
}

function ExamSessionPanel({ session, storageKey, locale, token, onBack }: { session: ExamSession; storageKey: string; locale: Locale; token: string; onBack: () => void }) {
  const t = copy[locale];
  const [attempt, setAttempt] = useState<Attempt>(() => readLocalAttempt(storageKey, session.questions));
  const [index, setIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const score = examSessionScore(session.questions, attempt.answers);
  const question = session.questions[index];
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(attempt)); setStorageError(false); } catch { setStorageError(true); }
  }, [storageKey, attempt]);
  useEffect(() => {
    if (!session.durationMinutes || !attempt.startedAt || attempt.submitted) return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((Date.parse(attempt.startedAt!) + session.durationMinutes! * 60000 - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) { setAttempt(current => ({ ...current, submitted: true })); setConfirming(false); }
    };
    tick(); const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [session.durationMinutes, attempt.startedAt, attempt.submitted]);
  const scorable = question && canScoreExamQuestion(question);
  const started = Boolean(attempt.startedAt) || attempt.submitted;
  return <section className="news-focus practice-designed-exam">
    <header className="news-focus-header"><button className="news-focus-back" onClick={onBack} aria-label={t.parts}><ArrowLeft size={20}/></button><div><p>{t.parts}</p><h1>{session.title}</h1></div></header>
    <div className="practice-designed-summary px-4 py-3"><p>{session.description}</p><p role={storageError ? 'alert' : undefined} className="text-sm">{storageError ? t.storageError : t.saved}</p>
      <p>{t.answered} {score.answered} / {score.total}{score.excluded ? ` · ${score.excluded} ${t.excluded}` : ''}{remaining !== null && !attempt.submitted ? ` · ${t.remaining} ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : ''}</p>
      {attempt.submitted ? <p role="status"><strong>{t.result} · {t.correct} {score.correct} / {score.total}</strong></p> : null}
      {!started ? <><p>{session.durationMinutes ? `${session.durationMinutes} ${t.minutes}` : t.untimed}</p><button type="button" className="practice-primary-action" disabled={!score.total} onClick={() => { if (score.total > 0) setAttempt(current => ({ ...current, startedAt: new Date().toISOString() })); }}>{t.start}</button>{!score.total ? <p>{t.noQuestions} <button type="button" className="practice-text-action" onClick={onBack}>{t.parts}</button></p> : null}</> : null}
    </div>
    {started && question ? <>
      <nav className="news-focus-filters px-4" aria-label={t.questions}>{session.questions.map((q, i) => <button key={q.id} type="button" aria-current={index === i ? 'true' : undefined} onClick={() => setIndex(i)}>{i + 1}{Number.isInteger(attempt.answers[q.id]) ? ' ✓' : ''}</button>)}</nav>
      <article className="px-4 py-5 md:px-7">
        {question.type ? <p className="text-sm">{question.type}</p> : null}
        {question.audioUrl ? question.audioUrl.startsWith('/api/') ? <ExamAudio src={question.audioUrl} token={token} loading={t.audioLoading} unavailable={t.audioError}/> : <audio controls preload="none" src={question.audioUrl}/> : null}
        {question.passage ? <div className="mt-4 whitespace-pre-wrap border-l-4 border-[#31564c] bg-[#f4f6f1] px-5 py-4 leading-8">{question.passage}</div> : null}
        <h2 className="my-5 whitespace-pre-wrap text-xl leading-9">{question.prompt}</h2>
        {!scorable ? <p role="status">{t.noScore}</p> : null}
        <div className="grid gap-3">{question.choices.map((choice, i) => <button key={i} type="button" disabled={attempt.submitted || !scorable} aria-pressed={attempt.answers[question.id] === i}
          onClick={() => setAttempt(current => ({ ...current, answers: { ...current.answers, [question.id]: i } }))}
          className={`study-answer-option rounded-lg border p-4 text-left ${attempt.submitted && scorable && question.answerIndex === i ? 'border-green-700 bg-green-50' : attempt.answers[question.id] === i ? 'border-[#a84269] bg-[#fff0f5]' : 'border-[#d8d1c8] bg-white'}`}>
          {i + 1}. {choice}
        </button>)}</div>
        {attempt.submitted && scorable ? <div className="practice-designed-answer mt-5 space-y-3 border-t pt-4"><strong>{t.answer}: {question.answerIndex + 1}. {question.choices[question.answerIndex]}</strong><h3>{t.explanation}</h3><p className="whitespace-pre-wrap">{conciseEvidence(question.explanation).summary}</p>
          <details key={question.id}><summary>{t.more}</summary><p className="whitespace-pre-wrap">{question.explanation}</p>
          {question.choiceExplanations?.map((text, i) => <p key={i}>{i + 1}. {text}</p>)}
          {question.translation ? <p className="whitespace-pre-wrap">{question.translation}</p> : null}{question.transcript ? <p className="whitespace-pre-wrap">{question.transcript}</p> : null}
          {question.sourceUrl ? <a className="gentle-direct-link" href={question.sourceUrl} target="_blank" rel="noreferrer">{question.sourceLabel || t.source}</a> : null}
          </details>
        </div> : null}
      </article>
      <nav className="news-focus-pagination"><button type="button" disabled={index === 0} onClick={() => setIndex(i => i - 1)}><ArrowLeft size={16}/>{t.previous}</button><button type="button" disabled={index === session.questions.length - 1} onClick={() => setIndex(i => i + 1)}>{t.next}<ChevronRight size={16}/></button></nav>
      <div className="px-4 py-5">{attempt.submitted ? <button type="button" className="gentle-direct-link" onClick={() => { if (window.confirm(t.restartConfirm)) { setAttempt({ revision: attempt.revision, answers: {}, submitted: false }); setRemaining(null); setIndex(0); } }}>{t.restart}</button>
        : confirming ? <div role="group" aria-label={t.confirm}><p>{t.confirmText}</p><button type="button" className="gentle-direct-link mr-4" onClick={() => { setAttempt(current => ({ ...current, submitted: true })); setConfirming(false); }}>{t.confirm}</button><button type="button" onClick={() => setConfirming(false)}>{t.cancel}</button></div>
          : <button type="button" className="gentle-direct-link" onClick={() => setConfirming(true)}>{t.submit}</button>}</div>
    </> : null}
  </section>;
}
