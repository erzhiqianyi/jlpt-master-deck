import type { LearningCapture, PracticeAttempt, ProgressState, StudyDailySummary } from '../../types';

export function InsightsPanel({ labels, captures, attempts, progress, summaries, embedded = false }: {
  labels: Record<string, string>;
  captures: LearningCapture[];
  attempts: PracticeAttempt[];
  progress: ProgressState;
  summaries: StudyDailySummary[];
  embedded?: boolean;
}) {
  const completedAttempts = attempts.filter((attempt) => attempt.summary);
  const answered = completedAttempts.reduce((sum, attempt) => sum + (attempt.summary?.total ?? 0), 0);
  const correct = completedAttempts.reduce((sum, attempt) => sum + (attempt.summary?.correct ?? 0), 0);
  const mastered = Object.values(progress).filter((item) => item.status === 'mastered').length;
  const recent = summaries.slice(0, 7).reverse();
  const maxAttempted = Math.max(1, ...recent.map((item) => item.attempted));

  return (
    <section className={embedded ? 'py-6' : 'mx-auto w-full max-w-4xl py-2 md:py-5'}>
      {!embedded ? <><p className="text-sm font-semibold text-[#7d6032]">{labels.insightsEyebrow}</p><h1 className="mt-1 text-2xl font-semibold text-[#27312c]">{labels.insightsTitle}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#68716b]">{labels.insightsBody}</p></> : null}

      <div className="mt-6 grid grid-cols-2 border-y border-[#d7dfd6] py-4 sm:grid-cols-4">
        <Metric label={labels.insightsPending} value={String(captures.filter((capture) => capture.status === 'inbox').length)} />
        <Metric label={labels.insightsAnswered} value={String(answered)} />
        <Metric label={labels.accuracy} value={answered ? `${Math.round((correct / answered) * 100)}%` : '-'} />
        <Metric label={labels.mastered} value={String(mastered)} />
      </div>

      <section className="pt-7">
        <h2 className="text-lg font-semibold text-[#27312c]">{labels.insightsRecent}</h2>
        {recent.length ? (
          <div className="mt-4 space-y-3">
            {recent.map((day) => (
              <div key={day.date} className="grid grid-cols-[5.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
                <span className="text-[#68716b]">{day.date.slice(5)}</span>
                <div className="h-2 overflow-hidden rounded bg-[#e6ebe6]"><div className="h-full rounded bg-[#6f947c]" style={{ width: `${Math.max(day.attempted ? 8 : 0, (day.attempted / maxAttempted) * 100)}%` }} /></div>
                <strong className="text-right text-[#34413b]">{day.attempted}</strong>
                {!!day.cardReviews?.totalReviews && <span className="col-span-3 text-xs text-[#68716b]">{labels.insightsCardReviews ?? '卡片复习'}：{day.cardReviews.totalReviews} 次 · {day.cardReviews.uniqueCards} 张</span>}
              </div>
            ))}
          </div>
        ) : <p className="mt-4 text-sm text-[#7a807b]">{labels.insightsNoData}</p>}
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border-l border-[#dfe5df] px-4 first:border-l-0"><p className="text-xs text-[#707a74]">{label}</p><p className="mt-1 text-2xl font-semibold text-[#27312c]">{value}</p></div>;
}
