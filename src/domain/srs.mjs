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
  const previousEase = current.ease ?? 2.5;
  const previousInterval = current.intervalDays ?? 0;
  const reviewCount = (current.reviewCount ?? 0) + 1;
  const ease = correct ? Math.min(previousEase + 0.15, 3.2) : Math.max(previousEase - 0.2, 1.3);
  const intervalDays = correct
    ? nextCorrectInterval(reviewCount, previousInterval, ease)
    : 1;
  return {
    firstSeenAt: current.firstSeenAt ?? now.toISOString(),
    lastReviewedAt: now.toISOString(),
    reviewCount,
    ease,
    intervalDays,
    nextReviewAt: addDays(now, intervalDays).toISOString(),
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

function nextCorrectInterval(reviewCount, previousInterval, ease) {
  if (reviewCount <= 1) {
    return 1;
  }
  if (reviewCount === 2) {
    return 3;
  }
  return Math.max(4, Math.round(Math.max(previousInterval, 3) * ease));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
