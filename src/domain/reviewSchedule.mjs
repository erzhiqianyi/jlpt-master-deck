// 復習の間隔（v3 の review_schedules）。サーバー・Web・iOS が同じ規則を使う。
// 正誤の回数は持たない（決定 3）：状態は間隔と復習回数から決める。
// schedule：{ status, reviewCount, ease, intervalDays, dueAt, firstSeenAt, lastReviewedAt }（未学習は null）

const DAY = 86400000;
const clampEase = (ease) => Math.max(1.3, Math.min(Number.isFinite(ease) ? ease : 2.5, 3.0));
const clampInterval = (days) => Math.max(0, Math.min(Number.isFinite(days) ? days : 0, 365));
const addDays = (date, days) => new Date(date.getTime() + days * DAY);

/** 間隔と復習回数から状態：3 週間以上かつ 4 回以上で習得、1 日以上で復習中、それ以外は学習中。 */
export function statusOf(intervalDays, reviewCount) {
  if (intervalDays >= 21 && reviewCount >= 4) return 'mastered';
  if (intervalDays >= 1) return 'review';
  return 'learning';
}

/** 正解の次の間隔。 */
function grow(previous, ease) {
  if (previous < 1) return 1;
  if (previous <= 1) return 3;
  return Math.min(365, Math.max(4, Math.round(Math.max(previous, 3) * ease)));
}

/**
 * 問題に答えたあとの予定。期限前の正解は予定を進めない（早めの練習で間隔が伸びすぎないように）。
 * 間違えたら翌日にもう一度。
 */
export function scheduleAfterAnswer(current, correct, now = new Date()) {
  const previous = clampInterval(current?.intervalDays ?? 0);
  const ease = clampEase(current?.ease ?? 2.5);
  const due = Date.parse(current?.dueAt ?? '');
  const early = Boolean(current) && correct && Number.isFinite(due) && due > now.getTime();
  const reviewCount = (current?.reviewCount ?? 0) + 1;
  const nextEase = early ? ease : correct ? clampEase(ease + 0.15) : clampEase(ease - 0.2);
  const intervalDays = early ? previous : correct ? grow(previous, nextEase) : 1;
  return {
    status: correct ? statusOf(intervalDays, reviewCount) : 'learning',
    reviewCount, ease: Math.round(nextEase * 100) / 100, intervalDays,
    dueAt: early ? new Date(due).toISOString() : addDays(now, intervalDays).toISOString(),
    firstSeenAt: current?.firstSeenAt ?? now.toISOString(), lastReviewedAt: now.toISOString(),
  };
}

const RATING_EASE = { forgot: -0.2, hard: -0.05, remembered: 0.05, easy: 0.15 };

/**
 * カードの自己評価のあとの予定。初回は 忘れた 10 分・難しい 1 日・覚えた 3 日・簡単 7 日、
 * それ以降は前回の間隔から伸ばす（難しい ×1.2、覚えた ×易しさ、簡単 ×易しさ×1.3）。
 */
export function scheduleAfterRating(current, rating, now = new Date()) {
  if (!(rating in RATING_EASE)) throw new Error(`unknown rating: ${rating}`);
  const previous = clampInterval(current?.intervalDays ?? 0);
  const ease = clampEase((current?.ease ?? 2.5) + RATING_EASE[rating]);
  const reviewCount = (current?.reviewCount ?? 0) + 1;
  let intervalDays;
  if (rating === 'forgot') intervalDays = 0;
  else if (rating === 'hard') intervalDays = Math.max(1, Math.round(previous * 1.2));
  else if (rating === 'remembered') intervalDays = previous < 1 ? 3 : Math.min(365, Math.max(previous + 1, Math.round(previous * ease)));
  else intervalDays = previous < 1 ? 7 : Math.min(365, Math.max(previous + 2, Math.round(previous * ease * 1.3)));
  const dueAt = rating === 'forgot' ? new Date(now.getTime() + 10 * 60000) : addDays(now, intervalDays);
  return {
    status: rating === 'forgot' ? 'learning' : statusOf(intervalDays, reviewCount),
    reviewCount, ease: Math.round(ease * 100) / 100, intervalDays, dueAt: dueAt.toISOString(),
    firstSeenAt: current?.firstSeenAt ?? now.toISOString(), lastReviewedAt: now.toISOString(),
  };
}
