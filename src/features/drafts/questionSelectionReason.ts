type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export function questionSelectionReason(question: unknown, content: unknown): { reason: string; evidence?: string } {
  const q = record(question);
  const pack = record(content);
  const diagnosis = record(pack.diagnosis);
  const entries = Array.isArray(diagnosis.evidence) ? diagnosis.evidence : Array.isArray(diagnosis.recent_wrong_answers) ? diagnosis.recent_wrong_answers : [];
  const itemId = text(q.item_id) || text(q.itemId);
  const matched = entries.map(record).filter((entry) =>
    itemId && (text(entry.itemId) || text(entry.item_id)) === itemId
    && entry.correct === false && (!q.kind || !entry.kind || q.kind === entry.kind),
  ).sort((a, b) => text(b.answeredAt).localeCompare(text(a.answeredAt)))[0];
  const rawReason = text(q.selection_reason_zh) || text(q.selection_reason) || text(q.target_reason);
  const knownReasons: Record<string, string> = {
    history_wrong_same_type: '练一练之前容易出错的同类题。',
    recent_wrong: '复习最近答错的内容，看看这次是否掌握了。',
    due_review: '这部分到了复习时间，再练一次帮助记牢。',
    weak_progress: '这部分还不够熟练，安排一道题再巩固一下。',
  };
  const reason = matched
    ? '之前这里答错了，再练一次。'
    : knownReasons[rawReason] ?? (/^\d{4}-\d{2}-\d{2}实际错题的同题型迁移$/.test(rawReason) ? `根据 ${rawReason.slice(0, 10)} 的错题，安排一道同类题再练习。` : rawReason && !/^[a-z_]+$/.test(rawReason) ? rawReason : '这道题还没有记录具体的加入理由。');
  if (!matched) return { reason };
  const timestamp = new Date(text(matched.answeredAt));
  const date = Number.isFinite(timestamp.getTime()) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric' }).format(timestamp) : '';
  const selected = text(matched.selected);
  return { reason, evidence: `${date ? `${date}：` : ''}${selected ? `曾误选「${selected}」` : '曾答错'}` };
}
