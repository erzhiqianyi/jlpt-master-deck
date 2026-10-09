// 練習（v3）を 1 問ずつ解く画面。答えるたびにサーバーへ送り、結果（正解・解説・訳）は答えた問題だけ表示する。
// 即時フィードバックでないとき（feedbackMode = batch）は、練習を終えるまで結果を隠す。
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Locale } from '../../types';
import type { V3Client } from '../../v3/client';
import type { Attempt, AttemptItem, PracticeGroup } from '../../v3/types';
import { MarkedText, MediaView, textOf } from '../question-bank/QuestionBank';
import { practiceText } from './practiceText';

/** 選択肢の並びを練習記録と問題ごとに固定してから混ぜる。 */
function seededOrder<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const newEventId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

type Props = { client: V3Client; locale: Locale; code: string; feedback: 'immediate' | 'batch'; onExit: () => void; onRetry?: (questions: string[]) => void };

export function PracticeRunner({ client, locale, code, feedback, onExit, onRetry }: Props) {
  const t = practiceText(locale);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shownAt, setShownAt] = useState(() => Date.now());
  useEffect(() => {
    let live = true;
    client.attempt(code).then((a) => {
      if (!live) return;
      setAttempt(a);
      const first = a.items.findIndex((i) => !i.answer && i.question);
      setIndex(first >= 0 ? first : 0);
    }).catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [client, code]);
  useEffect(() => setShownAt(Date.now()), [index]);

  const submit = useCallback(async (item: AttemptItem, answer: { selectedOptionId?: number; answerText?: string; recordingId?: number }) => {
    if (!attempt || !item.question) return;
    setBusy(true); setError('');
    try {
      const result = await client.submitAnswer(attempt.code, { question: item.question.code, ...answer, eventId: newEventId(), startedAt: new Date(shownAt).toISOString(), elapsedMs: Date.now() - shownAt });
      setAttempt((current) => current && ({ ...current, summary: result.summary, groups: { ...current.groups, ...result.groups },
        items: current.items.map((x) => (x.position === result.item.position ? result.item : x)) }));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }, [attempt, client, shownAt]);

  const finish = async () => {
    if (!attempt) return;
    if (attempt.items.some((i) => i.question && !i.answer) && !window.confirm(t.finishConfirm)) return;
    setBusy(true);
    try { setAttempt(await client.completeAttempt(attempt.code)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  if (!attempt) return <section className="library"><p className={error ? 'library-error' : 'library-empty'}>{error || t.loading}</p></section>;
  if (attempt.completedAt) return <AttemptSummary attempt={attempt} locale={locale} client={client} onExit={onExit} onRetry={onRetry} />;
  const item = attempt.items[index];
  const total = attempt.items.length;
  const showResult = feedback === 'immediate';
  return (
    <section className="library practice-runner">
      <nav className="library-detail-nav">
        <button type="button" onClick={onExit}>{t.backToHub}</button>
        <span>{t.questionOf(index + 1, total)} · {attempt.summary.answered}/{total}</span>
        <span className="library-detail-arrows">
          <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label={t.previous}>←</button>
          <button type="button" disabled={index >= total - 1} onClick={() => setIndex(index + 1)} aria-label={t.next}>→</button>
        </span>
      </nav>
      <div className="practice-progress" aria-hidden="true">{attempt.items.map((x) => (
        <span key={x.position} data-state={x.answer ? (showResult ? (x.answer.correct === false ? 'wrong' : 'right') : 'answered') : x.position === index ? 'current' : 'open'} />
      ))}</div>
      {item?.question ? (
        <QuestionCard key={item.position} item={item} group={attempt.groups[item.question.group]} attemptCode={attempt.code} client={client} locale={locale}
          showResult={showResult} busy={busy} onAnswer={(answer) => void submit(item, answer)} />
      ) : <p className="library-empty">—</p>}
      {error ? <p className="library-error">{error}</p> : null}
      <div className="library-row-actions practice-actions">
        {index < total - 1 ? <button type="button" className="library-button" onClick={() => setIndex(index + 1)}>{t.next}</button> : null}
        <button type="button" disabled={busy} onClick={() => void finish()}>{t.finish}</button>
      </div>
    </section>
  );
}

/** 1 問：題組の素材、問題文、選択肢（または入力欄）、答えたあとの結果。 */
export function QuestionCard({ item, group, attemptCode, client, locale, showResult, busy, onAnswer }: {
  item: AttemptItem; group?: PracticeGroup; attemptCode: string; client: V3Client; locale: Locale; showResult: boolean; busy?: boolean;
  onAnswer?: (answer: { selectedOptionId?: number; answerText?: string; recordingId?: number }) => void;
}) {
  const t = practiceText(locale);
  const q = item.question!;
  const [typed, setTyped] = useState('');
  const options = useMemo(() => (group?.shuffleOptions ? seededOrder(q.options, `${attemptCode}:${q.code}`) : q.options), [group, q, attemptCode]);
  const answered = Boolean(item.answer);
  const result = showResult ? item.result : null;
  const spoken = options.length > 0 && options.every((o) => !o.text && !o.mediaId);
  const choice = q.options.length > 0;
  const groupMaterials = group?.materials ?? [];
  return (
    <article className="practice-card">
      {group?.instruction ? <p lang="ja" className="practice-instruction">{group.instruction}</p> : null}
      {group?.context ? <p lang="ja" className="library-muted">{group.context}</p> : null}
      {groupMaterials.map((m) => (
        <div key={m.role} className="practice-material">
          {textOf(m.title) ? <h3>{textOf(m.title)}</h3> : null}
          {m.mediaId && m.kind ? <MediaView client={client} id={m.mediaId} kind={m.kind === 'audio' ? 'audio' : 'image'} /> : null}
          {m.body ? <p className="library-pre bank-passage"><MarkedText text={m.body} marks={q.marks.filter((x) => x.material === m.role)} /></p> : null}
          {result && m.transcript ? <details className="bank-details" open><summary>{t.transcript}</summary><p lang="ja" className="library-pre">{m.transcript}</p>
            {textOf(m.transcriptTranslation) ? <p className="library-pre library-muted">{textOf(m.transcriptTranslation)}</p> : null}</details> : null}
          {result && textOf(m.bodyTranslation) ? <details className="bank-details"><summary>{t.translation}</summary><p className="library-pre library-muted">{textOf(m.bodyTranslation)}</p></details> : null}
        </div>
      ))}
      {q.promptMediaId && !groupMaterials.some((m) => m.mediaId === q.promptMediaId) ? <MediaView client={client} id={q.promptMediaId} kind="audio" /> : null}
      {q.prompt ? <p className="bank-prompt"><MarkedText text={q.prompt} marks={q.marks.filter((x) => !x.material)} /></p> : null}
      {result && textOf(result.translation) ? <p className="library-muted">{textOf(result.translation)}</p> : null}

      {choice ? (
        <ol className="practice-options">
          {options.map((o, i) => {
            const chosen = item.answer?.selectedOptionId === o.id;
            const state = result ? (o.id === result.correctOptionId ? 'correct' : chosen ? 'wrong' : '') : chosen ? 'chosen' : '';
            const analysis = result?.options.find((x) => x.id === o.id);
            return (
              <li key={o.id}>
                <button type="button" data-state={state} disabled={answered || busy} onClick={() => onAnswer?.({ selectedOptionId: o.id })}>
                  <span className="bank-option-number">{i + 1}</span>
                  <span className="bank-option-body">
                    <span lang="ja">{o.text ?? ''}</span>
                    {o.mediaId ? <MediaView client={client} id={o.mediaId} kind={spoken ? 'audio' : 'image'} /> : null}
                    {analysis && textOf(analysis.translation) ? <span className="library-muted bank-option-note">{textOf(analysis.translation)}</span> : null}
                    {analysis && textOf(analysis.analysis) ? <span className="bank-option-note library-pre">{textOf(analysis.analysis)}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : item.answer ? (
        <p><span className="library-label">{t.yourAnswer}</span><span lang="ja">{item.answer.answerText ?? (item.answer.recordingId ? '🎙' : '—')}</span></p>
      ) : group?.answerMode === 'recording' ? (
        <Recorder client={client} question={q.code} locale={locale} busy={busy} onRecorded={(recordingId) => onAnswer?.({ recordingId })} onSkip={() => onAnswer?.({})} />
      ) : (
        <form className="practice-text-answer" onSubmit={(e) => { e.preventDefault(); onAnswer?.({ answerText: typed }); }}>
          <textarea lang="ja" rows={3} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t.answerPlaceholder} aria-label={t.answerPlaceholder} />
          <button type="submit" className="library-button" disabled={busy || !typed.trim()}>{t.submit}</button>
        </form>
      )}

      {answered && !showResult ? <p className="library-muted">{t.resultHidden}</p> : null}
      {answered && result ? (
        <div className="practice-result" data-correct={item.answer?.correct == null ? 'none' : String(item.answer.correct)}>
          <strong>{item.answer?.correct == null ? t.notScored : item.answer.correct ? t.correct : t.wrong}</strong>
          {result.expectedText ? <p><span className="library-label">{t.expected}</span><span lang="ja">{result.expectedText}</span></p> : null}
          {result.explanation.length ? (
            <dl className="library-notes">{result.explanation.map((s, i) => <div key={i}><dt>{textOf(s.title) || t.explanation}</dt><dd className="library-pre">{textOf(s.body)}</dd></div>)}</dl>
          ) : null}
          {result.evidence.length ? <ul className="library-bullets">{result.evidence.map((e, i) => <li key={i} lang="ja">「{e.quote}」</li>)}</ul> : null}
        </div>
      ) : null}
    </article>
  );
}

function AttemptSummary({ attempt, locale, client, onExit, onRetry }: { attempt: Attempt; locale: Locale; client: V3Client; onExit: () => void; onRetry?: (questions: string[]) => void }) {
  const t = practiceText(locale);
  const wrong = attempt.items.filter((i) => i.answer?.correct === false && i.question).map((i) => i.question!.code);
  return (
    <section className="library practice-runner">
      <nav className="library-detail-nav"><button type="button" onClick={onExit}>{t.backToHub}</button></nav>
      <header className="library-detail-head">
        <span className="library-code">{attempt.code}{attempt.practice ? ` · ${attempt.practice}` : ''}</span>
        <h1>{t.summary}</h1>
        <p className="library-detail-meaning">{t.score(attempt.summary.correct, attempt.summary.scored)}</p>
        {wrong.length && onRetry ? <div className="library-row-actions"><button type="button" className="library-button" onClick={() => onRetry(wrong)}>{t.retryWrong}（{wrong.length}）</button></div> : null}
      </header>
      {attempt.items.map((item) => item.question ? (
        <section key={item.position} className="library-section">
          <h2>{t.questionOf(item.position + 1, attempt.items.length)} · {item.question.code}</h2>
          <QuestionCard item={item} group={attempt.groups[item.question.group]} attemptCode={attempt.code} client={client} locale={locale} showResult />
        </section>
      ) : null)}
    </section>
  );
}

/** 跟読の録音：ブラウザで録音してアップロードし、その録音を解答として送る。 */
function Recorder({ client, question, locale, busy, onRecorded, onSkip }: { client: V3Client; question: string; locale: Locale; busy?: boolean; onRecorded: (id: number) => void; onSkip: () => void }) {
  const t = practiceText(locale);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const supported = typeof window !== 'undefined' && 'MediaRecorder' in window && Boolean(navigator.mediaDevices?.getUserMedia);
  const start = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const next = new MediaRecorder(stream);
      next.ondataavailable = (e) => chunks.push(e.data);
      next.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: next.mimeType || 'audio/webm' });
        setUploading(true);
        try {
          const base64 = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, '')); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
          const recording = await client.uploadRecording({ question, audioBase64: base64, mime: blob.type });
          onRecorded(recording.id);
        } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setUploading(false); }
      };
      next.start();
      setRecorder(next);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="practice-recorder">
      {supported ? (recorder?.state === 'recording'
        ? <button type="button" className="library-button" onClick={() => { recorder.stop(); setRecorder(null); }}>■ {t.submit}</button>
        : <button type="button" className="library-button" disabled={busy || uploading} onClick={() => void start()}>● {t.recordStart}</button>)
        : <p className="library-muted">{t.recordingLater}</p>}
      <button type="button" disabled={busy || uploading} onClick={onSkip}>{t.skip}</button>
      {uploading ? <span className="library-muted">{t.uploadingRecording}</span> : null}
      {error ? <p className="library-error">{error}</p> : null}
    </div>
  );
}
