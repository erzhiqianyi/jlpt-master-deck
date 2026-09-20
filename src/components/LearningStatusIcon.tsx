import { Archive, BookOpen, CheckCheck, Circle, CircleCheck, CircleDashed, CircleX, Clock3, FileCheck2, FileClock, Pencil, RotateCcw, SkipForward } from 'lucide-react';

const statusIcons = {
  new: CircleDashed, pending: Circle, learning: BookOpen, review: RotateCcw,
  mastered: CheckCheck, completed: CircleCheck, skipped: SkipForward,
  missed: Clock3, correct: CircleCheck, incorrect: CircleX, unanswered: CircleDashed,
  draft: FileClock, needs_revision: Pencil, approved: FileCheck2,
  inbox: FileClock, processed: FileCheck2, archived: Archive,
} as const;
export type LearningStatus = keyof typeof statusIcons;

export function LearningStatusIcon({ kind, label }: { kind: LearningStatus; label: string }) {
  const Icon = statusIcons[kind];
  return <span className={`learning-status-icon is-${kind}`} role="img" aria-label={label} title={label}><Icon size={20} aria-hidden="true"/></span>;
}
