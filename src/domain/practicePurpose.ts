import type { DailyPractice, DraftSummary } from '../types';

// Older topic packs share the daily-practice store; their source draft preserves the topic.
export function isTopicDraft(draft: Pick<DraftSummary, 'title'>) {
  return !/^(?:\d{4}-\d{2}-\d{2}|\d{1,2}月\d{1,2}日).*?(?:復習|复习|弱点强化|每日|练习)/u.test(draft.title);
}

export function topicDraftForPractice(practice: DailyPractice, drafts: DraftSummary[]) {
  const draft = drafts.find((draft) => draft.id === practice.sourceDraftId);
  return draft && isTopicDraft(draft) ? draft : undefined;
}
