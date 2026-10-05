import { useConfirmation } from '../../components/confirmation';
import { questionSelectionReason } from './questionSelectionReason';
import { useRef, useState, type ReactNode } from 'react';
import type { ReviewPackDraft } from '../../types';
import { getQuestionReviews, isQuestionConfirmed, questionReviewKey, type QuestionReview } from './questionReviewState';

export function QuestionReviewWorkspace({ draft, questions, renderQuestion, onSave, onFinalize, topic = false }: {
  draft: ReviewPackDraft; questions: unknown[]; topic?: boolean;
  renderQuestion: (index: number) => ReactNode;
  onSave: (id: string, body: string) => Promise<void>;
  onFinalize: (id: string) => Promise<void>;
}) {
  const confirm = useConfirmation();
  const [index, setIndex] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const actionPending = useRef(false);
  const navigationDialog = useRef<HTMLDialogElement>(null);
  // An append-only annotation log keeps confirmations with the saved draft.
  const reviews = getQuestionReviews(draft.annotations);
  const keys = questions.map(questionReviewKey);
  const current = Math.min(index, keys.length - 1);
  const key = keys[current];
  const selectionReason = questionSelectionReason(questions[current], draft.content);
  const review = reviews.get(key);
  const note = notes[key] ?? review?.note ?? '';
  const dirty = note !== (review?.note ?? '');
  const confirmed = isQuestionConfirmed(key, reviews, notes);
  const count = keys.filter((entry) => isQuestionConfirmed(entry, reviews, notes)).length;
  const archived = draft.status === 'archived';
  async function save(confirm: boolean) {
    if (actionPending.current || archived || !keys.length) return;
    actionPending.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      await onSave(draft.id, JSON.stringify({ kind: 'question_review', key, number: current + 1, note, confirmed: confirm } satisfies QuestionReview));
      setNotice(confirm ? '这题已确认' : '已保存，这题暂不确认');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败，请再试一次'); }
    finally { actionPending.current = false; setBusy(false); }
  }
  async function confirmAll() {
    if (actionPending.current || archived || count === questions.length) return;
    actionPending.current = true;
    setBusy(true); setError(''); setNotice('');
    let saved = 0;
    try {
      for (const [number, entry] of keys.entries()) {
        if (isQuestionConfirmed(entry, reviews, notes)) continue;
        await onSave(draft.id, JSON.stringify({ kind: 'question_review', key: entry, number: number + 1, note: notes[entry] ?? reviews.get(entry)?.note ?? '', confirmed: true } satisfies QuestionReview));
        saved += 1;
        setNotice(`正在确认：已保存 ${saved} 题…`);
      }
      setNotice('全部题目已确认，可以生成最终版。');
    } catch (cause) {
      setError(`已保存 ${saved} 题的确认。${cause instanceof Error ? cause.message : '保存失败'}，请重试。`);
    } finally { actionPending.current = false; setBusy(false); }
  }
  async function finalize() {
    if (!questions.length || count !== questions.length || actionPending.current || archived) return;
    actionPending.current = true;
    setBusy(true); setError('');
    try {
      if (!(await confirm({ title: '生成最终版？', description: `已确认 ${questions.length} 题，生成后${topic ? '保存为专项练习' : '加入今日练习'}。`, confirmLabel: '生成最终版', cancelLabel: '再看看' }))) return;
      await onFinalize(draft.id);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : '生成失败，请再试一次'); }
    finally { actionPending.current = false; setBusy(false); }
  }
  const questionNumbers = keys.map((entry, number) => {
    const checked = isQuestionConfirmed(entry, reviews, notes);
    return <button key={entry} type="button" disabled={busy} aria-current={number === current ? 'step' : undefined}
      aria-label={`第 ${number + 1} 题，${checked ? '已确认' : '待确认'}`}
      className={checked ? 'is-confirmed' : ''}
      onClick={() => { setIndex(number); setNotice(''); setError(''); navigationDialog.current?.close(); }}>
      {number + 1}{checked ? <span aria-hidden="true">✓</span> : null}
    </button>;
  });
  if (!questions.length) return <p role="status">暂无可审核的题目。</p>;
  return <div className="question-review-workspace">
    <nav className="question-review-navigation" aria-label="题目导航">
      <h2>题目导航</h2>
      <p>已确认 {count} / {questions.length} 题</p>
      <div className="question-review-number-grid">
        {questionNumbers}
      </div>
      <small>✓ 已确认 · 点击题号跳转</small>
    </nav>
    <dialog ref={navigationDialog} className="question-review-navigation-dialog" aria-label="选择题目">
      <header><h2>题目导航</h2><button type="button" onClick={() => navigationDialog.current?.close()}>关闭</button></header>
      <p>已确认 {count} / {questions.length} 题</p>
      <div className="question-review-number-grid">{questionNumbers}</div>
    </dialog>
    <section className="question-review-main" aria-label="逐题审核">
      <nav className="gentle-question-pager" aria-label="预览题目翻页">
        <button type="button" disabled={current === 0 || busy} onClick={() => {setIndex(current - 1); setNotice(''); setError('');}}>上一题</button>
        <span className="question-review-desktop-position" aria-live="polite">第 {current + 1} / {questions.length} 题</span>
        <button type="button" className="question-review-navigation-trigger" aria-haspopup="dialog" disabled={busy} onClick={() => navigationDialog.current?.showModal()}>第 {current + 1} / {questions.length} 题 ▾</button>
        <button type="button" disabled={current === questions.length - 1 || busy} onClick={() => {setIndex(current + 1); setNotice(''); setError('');}}>下一题</button>
      </nav>
      <div className="question-review-section-heading"><h2>看题目</h2>
      <label className="question-review-check">
        <input type="checkbox" checked={confirmed} disabled={busy || archived} onChange={(event) => save(event.target.checked)} />
        <span>{busy ? '正在保存…' : '确认这题'}</span>
      </label></div>
      {renderQuestion(current)}
      <section className="question-selection-reason" aria-label="为什么加入这道题">
        <h4>为什么加入这道题</h4>
        <p>{selectionReason.reason}</p>
        {selectionReason.evidence ? <small>{selectionReason.evidence}</small> : null}
      </section>
    </section>
    <aside className="question-review-sidebar" aria-label="批注与最终版">
      <section className="question-review-annotation" aria-label="本题批注">
      <header><h3>写批注</h3><span>第 {current + 1} 题</span></header>
      <label htmlFor="question-review-note">这题哪里需要调整？</label>
      <textarea id="question-review-note" value={note} disabled={busy || archived} onChange={(event) => { const value = event.target.value; setNotes((currentNotes) => ({ ...currentNotes, [key]: value })); setNotice(''); setError(''); }} placeholder="例如：解释再详细一些，或选项不太自然。" />
      <button type="button" className="preview-disclosure-trigger" disabled={busy || !dirty || archived} onClick={() => save(false)}>保存批注</button>
      <p role="status">{notice || (dirty ? '还没保存，记得保存批注。' : confirmed ? '这题已确认。修改后请重新确认。' : '阅读后，请勾选确认这题。')}</p>
      {error ? <p role="alert">{error}</p> : null}
      </section>
      <div className="question-review-final">
        <header><h3>整份练习</h3><span>{questions.length} 题</span></header><p>已确认 <strong>{count}</strong> / {questions.length} 题</p>
        <progress value={count} max={questions.length} aria-label="题目确认进度" />
        <button type="button" className="question-review-confirm-all" disabled={busy || count === questions.length || archived} onClick={confirmAll}>{count === questions.length ? '全部已确认' : '一键确认全部'}</button>
        <button type="button" className="question-review-confirm" disabled={busy || count !== questions.length || archived} onClick={finalize}>{archived ? '已生成最终版' : busy ? '正在处理…' : '生成最终版'}</button>
        <small>全部确认后，{topic ? '保存为专项练习' : '加入今日练习'}。批注不会自动修改题目。</small>
      </div>
      {draft.annotations.some((entry) => !entry.body.startsWith('{"kind":"question_review"')) ? <details><summary>之前的批注</summary>{draft.annotations.filter((entry) => !entry.body.startsWith('{"kind":"question_review"')).map((entry) => <p key={entry.id}>{entry.body}</p>)}</details> : null}
    </aside>
  </div>;
}
