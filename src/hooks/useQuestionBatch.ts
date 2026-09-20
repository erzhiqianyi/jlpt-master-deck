import { useEffect, useMemo, useState } from 'react';
import { buildQuestions, type QuestionReference } from '../domain/questions';
import type { Locale, Question, VocabItem } from '../types';

export const QUESTION_BATCH_SIZE = 20;

// Keep only the current, previous and next batch. The index remains lightweight.
export function useQuestionBatch(items: VocabItem[], index: QuestionReference[], activeIndex: number, locale: Locale, enabled: boolean) {
  const source = useMemo(() => ({ items, index, locale }), [items, index, locale]);
  const [cache, setCache] = useState<{ source: typeof source; questions: Map<string, Question> } | null>(null);
  const current = index[activeIndex % Math.max(index.length, 1)];
  const question = cache?.source === source && current ? cache.questions.get(current.id) : undefined;

  useEffect(() => {
    if (!enabled || !index.length) return;
    let cancelled = false;
    const position = activeIndex % index.length;
    const start = Math.floor(position / QUESTION_BATCH_SIZE) * QUESTION_BATCH_SIZE;
    const currentBatch = index.slice(start, start + QUESTION_BATCH_SIZE);
    const neighbors = [
      ...index.slice(Math.max(0, start - QUESTION_BATCH_SIZE), start),
      ...index.slice(start + QUESTION_BATCH_SIZE, start + QUESTION_BATCH_SIZE * 2),
    ];
    const retainedIds = new Set([...currentBatch, ...neighbors].map((entry) => entry.id));
    const retained = new Map(cache?.source === source
      ? [...cache.questions].filter(([id]) => retainedIds.has(id)) : []);
    const load = (entries: QuestionReference[]) => {
      const missing = entries.filter((entry) => !retained.has(entry.id));
      if (!missing.length) return;
      const ids = new Set(missing.map((entry) => entry.id));
      for (const value of buildQuestions(items, locale, Infinity, new Set(missing.map((entry) => entry.itemId)))) {
        if (ids.has(value.id)) retained.set(value.id, value);
      }
    };
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      load(currentBatch);
      setCache({ source, questions: new Map(retained) });
    }, 0);
    // Let the active question paint before preloading neighboring batches.
    const prefetch = window.setTimeout(() => {
      if (cancelled) return;
      load(neighbors);
      setCache({ source, questions: new Map(retained) });
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(prefetch); };
    // Cache updates must not restart the prefetch timers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, activeIndex, enabled]);

  return { question, loading: enabled && index.length > 0 && !question };
}
