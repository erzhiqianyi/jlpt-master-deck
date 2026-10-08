// Spaced-repetition scheduling shared by the browser (App.tsx) and the API (storage.mjs), so an
// answer recorded from an MCP practice session updates progress exactly like one from the web.

export function nextStatus(correct, wrong, reviewCount) {
  if (correct >= 4 && wrong <= 1 && reviewCount >= 4) {
    return 'mastered';
  }
  if (correct >= 2) {
    return 'review';
  }
  if (correct + wrong > 0) {
    return 'learning';
  }
  return 'new';
}

export function nextSchedule(current, correct, now) {
  // Extra practice before the due date records an answer without graduating the schedule.
  // Bound historical intervals before arithmetic, including already inflated cloud records.
  const previousEase = Number.isFinite(current.ease) ? Math.max(1.3, Math.min(current.ease, 3.2)) : 2.5;
  const rawInterval = current.intervalDays ?? 0;
  const previousInterval = Number.isFinite(rawInterval) ? Math.max(0, Math.min(rawInterval, 365)) : 0;
  const due = Date.parse(current.nextReviewAt);
  const healthySchedule = Number.isFinite(due) && Number.isFinite(rawInterval)
    && rawInterval >= 0 && rawInterval <= 365
    && due <= now.getTime() + 365 * 86400000;
  const early = correct && healthySchedule && due > now.getTime();
  const reviewCount = (current.reviewCount ?? 0) + 1;
  const ease = early ? previousEase : correct ? Math.min(previousEase + 0.15, 3.2) : Math.max(previousEase - 0.2, 1.3);
  const intervalDays = early ? previousInterval : correct
    ? nextCorrectInterval(previousInterval, ease)
    : 1;
  return {
    firstSeenAt: current.firstSeenAt ?? now.toISOString(),
    lastReviewedAt: now.toISOString(),
    reviewCount,
    ease,
    intervalDays,
    nextReviewAt: early ? new Date(due).toISOString() : addDays(now, intervalDays).toISOString(),
  };
}

/** Progress entry after one answer: counts, status and the next review schedule. */
export function progressAfterAnswer(current, correct, now) {
  const base = current ?? { correct: 0, wrong: 0, status: 'new' };
  const nextCorrect = base.correct + (correct ? 1 : 0);
  const nextWrong = base.wrong + (correct ? 0 : 1);
  const schedule = nextSchedule(base, correct, now);
  return {
    ...base,
    correct: nextCorrect,
    wrong: nextWrong,
    status: nextStatus(nextCorrect, nextWrong, schedule.reviewCount),
    ...schedule,
  };
}

function nextCorrectInterval(previousInterval, ease) {
  if (previousInterval === 0) return 1;
  if (previousInterval <= 1) return 3;
  return Math.min(365, Math.max(4, Math.round(Math.max(previousInterval, 3) * ease)));
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}
