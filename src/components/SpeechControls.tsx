import { Volume2, Square, Pause, Play, LoaderCircle } from 'lucide-react';
import { createContext, useContext, useEffect, useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { DisplaySettings } from '../types';
import { speak, stopSpeech, pauseSpeech, resumeSpeech, subscribeSpeech, speechSnapshot } from '../lib/tts';

const SpeechContext = createContext<{ settings: DisplaySettings; token: string } | null>(null);
export function SpeechProvider({ settings, token, children }: { settings: DisplaySettings; token: string; children: ReactNode }) {
  useEffect(() => {
    window.addEventListener('hashchange', stopSpeech);
    document.addEventListener('play', stopSpeech, true);
    return () => { window.removeEventListener('hashchange', stopSpeech); document.removeEventListener('play', stopSpeech, true); stopSpeech(); };
  }, [token]);
  return <SpeechContext.Provider value={{ settings, token }}>{children}</SpeechContext.Provider>;
}
export function useSpeech() { return useContext(SpeechContext); }
export function SpeechControls({ text, label, auto = false, iconOnly = false }: { text: string; label?: string; auto?: boolean; iconOnly?: boolean }) {
  const context = useSpeech();
  const owner = useId();
  const state = useSyncExternalStore(subscribeSpeech, speechSnapshot, speechSnapshot);
  const [error, setError] = useState('');
  const locale = context?.settings.locale ?? 'zh-CN';
  const words = locale === 'ja' ? ['読み上げ', '停止', '一時停止', '再開', '準備中…'] : locale === 'en' ? ['Read aloud', 'Stop', 'Pause', 'Resume', 'Loading…'] : ['朗读', '停止', '暂停', '继续', '加载中…'];
  const active = state.owner === owner && state.status !== 'idle';
  async function play() {
    if (!context) return;
    setError('');
    const { settings, token } = context;
    try { await speak(text, { provider: settings.ttsProvider, token, ...settings.speech?.voices?.[settings.ttsProvider], rate: settings.speech?.rate, owner }); }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  useEffect(() => {
    setError('');
    if (auto) void play();
    return () => { if (speechSnapshot().owner === owner) stopSpeech(); };
    // Changing text/card ends its playback; preference changes apply to the next play.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, auto, owner]);
  if (!context || !text.trim()) return null;
  return <span className="inline-flex max-w-full flex-wrap items-center gap-2 text-sm font-normal" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
    <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-[#c8d1c8] px-3 text-[#31564c]" title={active ? words[1] : label ?? words[0]} aria-label={active ? words[1] : label ?? words[0]} onClick={active ? stopSpeech : () => void play()}>
      {active ? state.status === 'loading' ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Square size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
      {!iconOnly && (active ? state.status === 'loading' ? `${words[4]} · ${words[1]}` : words[1] : label ?? words[0])}
    </button>
    {active && state.status !== 'loading' && <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 px-2" title={state.status === 'paused' ? words[3] : words[2]} aria-label={state.status === 'paused' ? words[3] : words[2]} onClick={() => { if (state.status === 'paused') void resumeSpeech().catch((cause) => { setError(String(cause)); stopSpeech(); }); else pauseSpeech(); }}>
      {state.status === 'paused' ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}{!iconOnly && (state.status === 'paused' ? words[3] : words[2])}
    </button>}
    {error && <span role="alert" className="text-red-700">{error}</span>}
  </span>;
}
