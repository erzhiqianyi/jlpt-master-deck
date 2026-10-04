import { useCallback, useEffect, useRef, useState } from 'react';
import animation from './mascot-animation.json';

type Action = keyof typeof animation.states;
const frameURL = (action: Action, frame: number) => `/mascot/frames/${action}/${String(frame).padStart(2, '0')}.png`;

/** A single timeline owns all poses; image failures retain the original static entry. */
export function useStudyCompanion(displayed = true) {
  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(() => typeof window === 'undefined' ? true : window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true);
  const [visible, setVisible] = useState(() => typeof document !== 'undefined' && document.visibilityState !== 'hidden');
  const [pose, setPose] = useState<{ action: Action; index: number }>({ action: 'idle', index: 0 });
  const active = useRef<Action>('idle');
  const completion = useRef<(() => void) | null>(null);
  const failed = useRef(false);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media?.matches ?? true);
    const visibility = () => setVisible(document.visibilityState !== 'hidden');
    media?.addEventListener?.('change', change);
    document.addEventListener('visibilitychange', visibility);
    return () => { media?.removeEventListener?.('change', change); document.removeEventListener('visibilitychange', visibility); completion.current = null; };
  }, []);

  useEffect(() => {
    if (reduced || failed.current) return;
    let cancelled = false;
    const images: HTMLImageElement[] = [];
    let loaded = 0;
    for (const action of Object.keys(animation.states) as Action[]) {
      for (let i = 0; i < 6; i++) {
        const img = new window.Image();
        images.push(img);
        img.onload = () => { loaded++; if (!cancelled && !failed.current && loaded === 18) setReady(true); };
        img.onerror = () => { failed.current = true; if (!cancelled) setReady(false); };
        img.src = frameURL(action, i);
      }
    }
    return () => { cancelled = true; images.forEach(img => { img.onload = null; img.onerror = null; }); };
  }, [reduced]);

  const finish = useCallback(() => {
    active.current = 'idle';
    setPose({ action: 'idle', index: 0 });
    const callback = completion.current;
    completion.current = null;
    callback?.();
  }, []);

  useEffect(() => {
    if (!displayed) {
      if (active.current !== 'idle') {
        active.current = 'idle';
        completion.current = null;
        setPose({ action: 'idle', index: 0 });
      }
      return;
    }
    if (!visible) return; // Resume this pose, without a background navigation or catch-up burst.
    if (!ready || reduced) { if (active.current !== 'idle') finish(); return; }
    const sequence = animation.states[pose.action].sequence;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === 'hidden') return;
      if (pose.index + 1 < sequence.length) setPose({ action: pose.action, index: pose.index + 1 });
      else if (pose.action === 'idle') setPose({ action: 'idle', index: 0 });
      else finish();
    }, sequence[pose.index].durationMs);
    return () => window.clearTimeout(timer);
  }, [pose, ready, reduced, visible, displayed, finish]);

  const play = useCallback((action: Exclude<Action, 'idle'>, callback?: () => void) => {
    if (active.current !== 'idle') return;
    if (!ready || reduced) { callback?.(); return; }
    active.current = action;
    completion.current = callback ?? null;
    setPose({ action, index: 0 });
  }, [ready, reduced]);
  const onError = () => { failed.current = true; setReady(false); };
  return {
    play,
    image: <img src={ready && !reduced ? frameURL(pose.action, animation.states[pose.action].sequence[pose.index].frame) : '/study-companion.png'} alt="" width="72" height="72" onError={onError} data-mascot-action={ready && !reduced ? pose.action : 'static'} style={{ objectFit: 'contain', width: 72, height: 72 }} />,
  };
}

/** Only fresh revealed feedback celebrates; opening saved answers stays still. */
export function AnswerCelebration({ correct }: { correct: boolean }) {
  const companion = useStudyCompanion(correct);
  const previous = useRef(correct);
  useEffect(() => {
    if (correct && !previous.current) companion.play('celebrate');
    previous.current = correct;
  }, [correct, companion.play]);
  return correct ? <span aria-hidden="true" className="practice-companion-feedback">{companion.image}</span> : null;
}
