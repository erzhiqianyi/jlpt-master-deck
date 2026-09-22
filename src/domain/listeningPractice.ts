import type { ListeningQuestion, ProgressEntry } from '../types';

export function listeningPracticeKey(item: ListeningQuestion) {
  return `listening-audio:${item.audioAssetId ?? `${item.audioFileName}|${item.audioSize}`}`;
}

export function recordListeningPractice(previous: ProgressEntry | undefined, sessionId: string, now: string): ProgressEntry {
  if (previous?.lastPracticeSessionId === sessionId) return previous;
  return {
    ...previous,
    correct: previous?.correct ?? 0,
    wrong: previous?.wrong ?? 0,
    status: 'learning',
    reviewCount: (previous?.reviewCount ?? 0) + 1,
    firstSeenAt: previous?.firstSeenAt ?? now,
    lastReviewedAt: now,
    lastPracticeSessionId: sessionId,
  };
}
