import { useEffect, useRef, useState } from 'react';
import { Timer } from 'lucide-react';
import type { Locale } from '../types';

// The parent keys this component by the practice session to reset the clock.
export function PracticeTimer({ locale, running = true }: { locale: Locale; running?: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const accumulated = useRef(0);
  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now();
    const update = () => setElapsed(accumulated.current + Math.max(0, Date.now() - startedAt));
    update();
    const interval = window.setInterval(update, 1000);
    return () => {
      window.clearInterval(interval);
      accumulated.current += Math.max(0, Date.now() - startedAt);
      setElapsed(accumulated.current);
    };
  }, [running]);
  const seconds = Math.floor(elapsed / 1000);
  const duration = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const label = locale === 'ja' ? '経過時間' : locale === 'en' ? 'Elapsed time' : '用时';
  return <span role="timer" aria-label={`${label} ${duration}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#eef4ef] px-3 py-2 text-sm font-semibold text-[#31564c]">
    <Timer size={16} aria-hidden="true" /><span>{label}</span><span className="tabular-nums">{duration}</span>
  </span>;
}
