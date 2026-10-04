import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

/** Same three catalog sources as MockExamCatalog. A partial/failed read is not a zero total. */
export function useMockExamCount(token: string, enabled: boolean) {
  const [count, setCount] = useState<number | undefined>();
  useEffect(() => {
    setCount(undefined);
    if (!token || !enabled) return;
    let cancelled = false;
    Promise.all([
      apiRequest<{ exams: Array<{ id: string }> }>('/api/mock-exams', { token }).then(result => result.exams.map(exam => `custom:${exam.id}`)),
      apiRequest<{ cycles: Array<{ id: string }> }>('/api/local-news-cycles', { token }).then(result => result.cycles.map(cycle => `week:${cycle.id}`)),
      apiRequest<{ exams: Array<{ id: string }> }>('/api/local-mock-exams', { token }).then(result => result.exams.map(exam => exam.id)),
    ]).then(groups => { if (!cancelled) setCount(new Set(groups.flat()).size); }).catch(() => { /* The catalog owns its retry/error UI. Omit unavailable totals. */ });
    return () => { cancelled = true; };
  }, [token, enabled]);
  return count;
}
