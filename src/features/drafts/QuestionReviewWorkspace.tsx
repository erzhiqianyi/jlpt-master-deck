import { useConfirmation } from '../../components/confirmation';
import { questionSelectionReason } from './questionSelectionReason';
import { useState, type ReactNode } from 'react';
import type { ReviewPackDraft } from '../../types';

type Review = { kind: 'question_review'; key: string; number: number; note: string; confirmed: boolean };
export function QuestionReviewWorkspace({ draft, questions, renderQuestion, onSave, onFinalize }: {
  draft: ReviewPackDraft; questions: unknown[];
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
  const reviews = new Map<string, Review>();
  // An append-only annotation log keeps confirmations with the saved draft.
  for (const annotation of [...draft.annotations].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    try {
      const review = JSON.parse(annotation.body) as Review;
      if (review.kind === 'question_review' && typeof review.key === 'string') reviews.set(review.key, review);
    } catch { /* Older free-text annotations remain available below. */ }
  }
  const keys = questions.map((question, i) => JSON.stringify([i, question]));
  const current = Math.min(index, keys.length - 1);
  const key = keys[current];
  const selectionReason = questionSelectionReason(questions[current], draft.content);
  const review = reviews.get(key);
  const note = notes[key] ?? review?.note ?? '';
  const dirty = note !== (review?.note ?? '');
  const confirmed = (review?.confirmed ?? true) && !dirty;
  const count = keys.filter((entry) => (reviews.get(entry)?.confirmed ?? true) && (notes[entry] === undefined || notes[entry] === (reviews.get(entry)?.note ?? ''))).length;
  const archived = draft.status === 'archived';
  async function save(confirm: boolean) {
    setBusy(true); setError(''); setNotice('');
    try {
      await onSave(draft.id, JSON.stringify({ kind: 'question_review', key, number: current + 1, note, confirmed: confirm } satisfies Review));
      setNotice(confirm ? '这题已确认' : '已保存，这题暂不确认');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败，请再试一次'); }
    finally { setBusy(false); }
  }
  async function finalize() {
    if (count !== questions.length || busy) return;
    if (!(await confirm({ title: '生成最终版？', description: `已确认 ${questions.length} 题，生成后加入今日练习。`, confirmLabel: '生成最终版', cancelLabel: '再看看' }))) return;
    setBusy(true); setError('');
    try { await onFinalize(draft.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '生成失败，请再试一次'); }
    finally { setBusy(false); }
  }
  return <div className="question-review-workspace">
    <section className="question-review-main" aria-label="逐题审核">
      <nav className="gentle-question-pager" aria-label="预览题目翻页">
        <button type="button" disabled={current === 0 || busy} onClick={() => {setIndex(current - 1); setNotice('');}}>上一题</button>
        <span aria-live="polite">第 {current + 1} / {questions.length} 题</span>
        <button type="button" disabled={current === questions.length - 1 || busy} onClick={() => {setIndex(current + 1); setNotice('');}}>下一题</button>
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
      <textarea id="question-review-note" value={note} disabled={busy || archived} onChange={(event) => setNotes({...notes, [key]: event.target.value})} placeholder="例如：解释再详细一些，或选项不太自然。" />
      <button type="button" className="preview-disclosure-trigger" disabled={busy || !dirty || archived} onClick={() => save(false)}>保存批注</button>
      <p role="status">{notice || (dirty ? '还没保存，记得保存批注。' : '修改后，请重新勾选这题。')}</p>
      {error ? <p role="alert">{error}</p> : null}
      </section>
      <div className="question-review-final">
        <header><h3>整份练习</h3><span>{questions.length} 题</span></header><p>已确认 <strong>{count}</strong> / {questions.length} 题</p>
        <progress value={count} max={questions.length} aria-label="题目确认进度" />
        <button type="button" className="question-review-confirm" disabled={busy || count !== questions.length || archived} onClick={finalize}>{archived ? '已生成最终版' : busy ? '正在处理…' : '生成最终版'}</button>
        <small>全部确认后，加入今日练习。批注不会自动修改题目。</small>
      </div>
      {draft.annotations.some((entry) => !entry.body.startsWith('{"kind":"question_review"')) ? <details><summary>之前的批注</summary>{draft.annotations.filter((entry) => !entry.body.startsWith('{"kind":"question_review"')).map((entry) => <p key={entry.id}>{entry.body}</p>)}</details> : null}
    </aside>
  </div>;
}
