import { useEffect, useState } from 'react';

/** Mobile lists append rows; desktop callers keep their existing page selection. */
export function useMobileList(total: number, resetKey: string, batchSize = 8) {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const [visible, setVisible] = useState(batchSize);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const change = () => setMobile(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => { setVisible(batchSize); }, [resetKey, batchSize]);
  useEffect(() => {
    if (!mobile || !sentinel || visible >= total) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        observer.disconnect();
        setVisible((count) => Math.min(count + batchSize, total));
      }
    }, { rootMargin: '0px 0px 80px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [mobile, sentinel, visible, total, batchSize]);
  return { mobile, visible, setSentinel };
}
