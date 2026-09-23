import { CheckSquare, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useConfirmation } from './confirmation';

/** Rows with a `selectId` gain a checkbox while a list is in batch mode. */
export type ListSelection = {
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  setMany: (ids: string[], checked: boolean) => void;
};

export type BatchAction = {
  key: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  /** Danger actions always confirm; others confirm only when a message is given. */
  confirm?: (count: number) => string;
  /** Enabled only when at least one selected row qualifies. */
  appliesTo?: (id: string) => boolean;
  /** Receives every selected id at once, for actions that are not per-row requests. */
  runAll?: (ids: string[]) => Promise<void>;
  /** Called once per selected id; failures are counted instead of aborting the rest. */
  run?: (id: string) => Promise<unknown>;
  /** Runs once after the per-row requests, e.g. to refresh a list. */
  after?: () => Promise<void>;
  /** Extra controls rendered before the button (e.g. a target picker). */
  control?: ReactNode;
  disabled?: boolean;
};

type Text = { manage: string; done: string; selected: (count: number, total: number) => string; selectAll: (total: number) => string; clear: string; processing: string; result: (ok: number, failed: number) => string; confirmTitle: string; cancel: string; selectRow: (label: string) => string };

export function batchText(locale = 'zh-CN'): Text {
  if (locale === 'ja') return { manage: '一括操作', done: '完了', selected: (count, total) => `${count} / ${total} 件を選択`, selectAll: (total) => `すべて選択（${total}）`, clear: '選択解除', processing: '処理中…', result: (ok, failed) => failed ? `${ok} 件完了、${failed} 件失敗しました` : `${ok} 件を処理しました`, confirmTitle: '一括操作の確認', cancel: 'キャンセル', selectRow: (label) => `選択: ${label}` };
  if (locale === 'en') return { manage: 'Bulk edit', done: 'Done', selected: (count, total) => `${count} of ${total} selected`, selectAll: (total) => `Select all (${total})`, clear: 'Clear', processing: 'Working…', result: (ok, failed) => failed ? `${ok} done, ${failed} failed` : `${ok} updated`, confirmTitle: 'Confirm bulk action', cancel: 'Cancel', selectRow: (label) => `Select ${label}` };
  return { manage: '批量管理', done: '完成', selected: (count, total) => `已选 ${count} / ${total} 项`, selectAll: (total) => `全选（${total}）`, clear: '清除选择', processing: '处理中…', result: (ok, failed) => failed ? `已完成 ${ok} 项，${failed} 项失败` : `已处理 ${ok} 项`, confirmTitle: '确认批量操作', cancel: '取消', selectRow: (label) => `选择：${label}` };
}

/** Selection state for one list; ids that disappear from the list are dropped automatically. */
export function useListBatch(ids: string[]) {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const idKey = ids.join('\u0000');
  useEffect(() => {
    const available = new Set(idKey ? idKey.split('\u0000') : []);
    setSelected((current) => [...current].every((id) => available.has(id)) ? current : new Set([...current].filter((id) => available.has(id))));
  }, [idKey]);
  const toggle = useCallback((id: string) => setSelected((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  }), []);
  const setMany = useCallback((values: string[], checked: boolean) => setSelected((current) => {
    const next = new Set(current);
    values.forEach((id) => checked ? next.add(id) : next.delete(id));
    return next;
  }), []);
  const clear = useCallback(() => setSelected(new Set()), []);
  const exit = useCallback(() => { setActive(false); setSelected(new Set()); }, []);
  const selection = useMemo<ListSelection | undefined>(() => active ? { selected, toggle, setMany } : undefined, [active, selected, toggle, setMany]);
  return { active, setActive, exit, selected, ids, toggle, setMany, clear, selection };
}

export type ListBatch = ReturnType<typeof useListBatch>;

export function BatchManageButton({ batch, locale }: { batch: ListBatch; locale?: string }) {
  const text = batchText(locale);
  return <button type="button" className="list-batch-toggle" aria-pressed={batch.active} onClick={() => batch.active ? batch.exit() : batch.setActive(true)}>
    <CheckSquare size={16} aria-hidden="true"/><span>{batch.active ? text.done : text.manage}</span>
  </button>;
}

/** Sticky toolbar shown while a list is in batch mode. */
export function BatchActionBar({ batch, actions, locale }: { batch: ListBatch; actions: BatchAction[]; locale?: string }) {
  const text = batchText(locale);
  const confirm = useConfirmation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!batch.active) return null;
  const selectedIds = batch.ids.filter((id) => batch.selected.has(id));
  const allSelected = batch.ids.length > 0 && selectedIds.length === batch.ids.length;

  async function execute(action: BatchAction) {
    const targets = action.appliesTo ? selectedIds.filter(action.appliesTo) : selectedIds;
    if (!targets.length || busy) return;
    const description = action.confirm?.(targets.length) ?? (action.danger ? `${action.label}: ${targets.length}` : '');
    if (description && !(await confirm({ title: text.confirmTitle, description, confirmLabel: action.label, cancelLabel: text.cancel, danger: action.danger }))) return;
    setBusy(true);
    setMessage('');
    const done: string[] = [];
    try {
      if (action.runAll) {
        await action.runAll(targets);
        done.push(...targets);
      } else if (action.run) {
        // Sequential requests keep ordering stable and avoid bursts against per-row endpoints.
        for (const id of targets) {
          try { await action.run(id); done.push(id); } catch { /* counted below; the row stays selected for a retry */ }
        }
      }
      if (done.length) await action.after?.();
    } catch {
      // A failed refresh does not undo requests that already succeeded.
    } finally {
      setBusy(false);
    }
    batch.setMany(done, false);
    setMessage(text.result(done.length, targets.length - done.length));
  }

  return <div className="list-batch-bar" role="toolbar" aria-label={text.manage}>
    <div className="list-batch-summary">
      <span role="status">{busy ? text.processing : message || text.selected(selectedIds.length, batch.ids.length)}</span>
      <button type="button" disabled={!batch.ids.length || busy} onClick={() => allSelected ? batch.clear() : batch.setMany(batch.ids, true)}>{allSelected ? text.clear : text.selectAll(batch.ids.length)}</button>
    </div>
    <div className="list-batch-actions">
      {actions.map((action) => {
        const applicable = action.appliesTo ? selectedIds.some(action.appliesTo) : selectedIds.length > 0;
        return <span key={action.key} className="list-batch-action">
          {action.control}
          <button type="button" className={action.danger ? 'is-danger' : undefined} disabled={busy || action.disabled || !applicable} onClick={() => void execute(action)}>{action.icon}<span>{action.label}</span></button>
        </span>;
      })}
      <button type="button" className="list-batch-exit" aria-label={text.done} title={text.done} disabled={busy} onClick={batch.exit}><X size={18} aria-hidden="true"/></button>
    </div>
  </div>;
}
