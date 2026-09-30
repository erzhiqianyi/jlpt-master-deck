import type { ListeningQuestion, ProgressEntry } from '../types';

export function listeningAudioRouteId(item: ListeningQuestion) {
  return item.audioReference ?? item.audioAssetId ?? item.id;
}

export function listeningAudioGroupForRoute(questions: ListeningQuestion[], routeId: string) {
  const selected = questions.find((item) => [item.id, item.reference, item.audioAssetId, item.audioReference].includes(routeId));
  if (!selected) return [];
  const assetKey = selected.audioAssetId ?? `${selected.audioFileName}|${selected.audioSize}`;
  return questions.filter((item) => (item.audioAssetId ?? `${item.audioFileName}|${item.audioSize}`) === assetKey)
    .sort((a, b) => (a.libraryNumber ?? Number.MAX_SAFE_INTEGER) - (b.libraryNumber ?? Number.MAX_SAFE_INTEGER)
      || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

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
