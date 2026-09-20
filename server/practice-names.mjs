// Recover legacy names only when the original practice can be identified uniquely.
// Saved titles are snapshots and must survive later edits or removal of a practice.
export function restorePracticeName(attempt, practices) {
  if (!attempt || attempt.title?.trim() || attempt.view !== 'daily-practice') return attempt;
  const ids = new Set(attempt.questionIds ?? []);
  const matches = practices.filter((practice) => attempt.practiceId
    ? practice.id === attempt.practiceId
    : ids.size > 0 && practice.questionIds.length === ids.size
      && practice.questionIds.every((id) => ids.has(id)));
  if (matches.length !== 1 || !matches[0].title?.trim()) return attempt;
  return { ...attempt, title: matches[0].title, practiceId: matches[0].id };
}
