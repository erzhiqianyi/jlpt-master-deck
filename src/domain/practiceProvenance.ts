export type PracticeQuestionOrigin = 'ai_generated' | 'textbook_original';

type SourceQuestion = { source_origin?: string; source_reference?: string };

export function practiceQuestionOrigin(question?: SourceQuestion): PracticeQuestionOrigin | null {
  if (question?.source_origin === 'ai_generated') return 'ai_generated';
  if (question?.source_origin === 'textbook_original' && question.source_reference?.trim()) return 'textbook_original';
  return null;
}

export function practiceQuestionSourceLabel(question?: SourceQuestion): string {
  const origin = practiceQuestionOrigin(question);
  return origin === 'ai_generated' ? 'AI 生成' : origin === 'textbook_original' ? '教材原题' : '来源待确认';
}

export function practiceSourceSummary(questions: SourceQuestion[]): string {
  const counts = { textbook_original: 0, ai_generated: 0, unknown: 0 };
  for (const question of questions) {
    const origin = practiceQuestionOrigin(question);
    if (origin) counts[origin] += 1;
    else counts.unknown += 1;
  }
  return [
    counts.textbook_original ? `教材原题 ${counts.textbook_original}` : '',
    counts.ai_generated ? `AI 生成 ${counts.ai_generated}` : '',
    counts.unknown ? `来源待确认 ${counts.unknown}` : '',
  ].filter(Boolean).join(' · ') || '来源待确认';
}
