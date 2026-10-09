import { Volume2, Square, Pause, Play, LoaderCircle, Download, Check } from 'lucide-react';
import { createContext, useContext, useEffect, useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { V3Settings } from '../v3/types';
import type { TtsProviderId } from '../types';
import { subscribeSpeechDownloads } from '../lib/speechAudio';
import { speak, stopSpeech, pauseSpeech, resumeSpeech, subscribeSpeech, speechSnapshot, downloadSpeech, speechDownloaded } from '../lib/tts';

const SpeechContext = createContext<{ settings: V3Settings; token: string; cacheScope?: string } | null>(null);
export function SpeechProvider({ settings, token, cacheScope, children }: { settings: V3Settings; token: string; cacheScope?: string; children: ReactNode }) {
  useEffect(() => {
    window.addEventListener('hashchange', stopSpeech);
    document.addEventListener('play', stopSpeech, true);
    return () => { window.removeEventListener('hashchange', stopSpeech); document.removeEventListener('play', stopSpeech, true); stopSpeech(); };
  }, [token]);
  return <SpeechContext.Provider value={{ settings, token, cacheScope }}>{children}</SpeechContext.Provider>;
}
export function useSpeech() { return useContext(SpeechContext); }
export function SpeechControls({ text, label, auto = false, iconOnly = false, downloadable = false }: { text: string; label?: string; auto?: boolean; iconOnly?: boolean; downloadable?: boolean }) {
  const context = useSpeech();
  const owner = useId();
  const state = useSyncExternalStore(subscribeSpeech, speechSnapshot, speechSnapshot);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadController] = useState(() => ({ current: null as AbortController | null }));
  const locale = context?.settings.uiLanguage ?? 'zh-CN';
  const words = locale === 'ja' ? ['読み上げ', '停止', '一時停止', '再開', '準備中…'] : locale === 'en' ? ['Read aloud', 'Stop', 'Pause', 'Resume', 'Loading…'] : ['朗读', '停止', '暂停', '继续', '加载中…'];
  const active = state.owner === owner && state.status !== 'idle';
  async function play() {
    if (!context) return;
    setError('');
    const { settings, token, cacheScope } = context;
    try { await speak(text, { provider: settings.speech.provider as TtsProviderId, token, cacheScope, ...settings.speech?.voices?.[settings.speech.provider], rate: settings.speech?.rate, owner }); }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  const provider = context?.settings.speech.provider;
  const voice = provider ? context?.settings.speech?.voices?.[provider] : undefined;
  useEffect(() => {
    let cancelled = false;
    setSaved(false);
    setDownloading(false);
    const refresh = () => {
      if (!context || !downloadable) return;
      void speechDownloaded(text, { provider: context.settings.speech.provider as TtsProviderId, token: context.token, cacheScope: context.cacheScope, ...voice }).then((value) => { if (!cancelled) setSaved(value); });
    };
    refresh();
    const unsubscribe = subscribeSpeechDownloads(refresh);
    return () => { cancelled = true; unsubscribe(); downloadController.current?.abort(); };
    // Only the synthesis identity affects the saved audio, not playback speed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, downloadable, provider, voice?.voice, voice?.style, voice?.role, context?.token, context?.cacheScope]);
  async function download() {
    if (!context || downloading || saved) return;
    const operation = new AbortController(); downloadController.current = operation;
    setError(''); setDownloading(true);
    try {
      await downloadSpeech(text, { provider: context.settings.speech.provider as TtsProviderId, token: context.token, cacheScope: context.cacheScope, ...voice }, operation.signal);
      if (!operation.signal.aborted) setSaved(true);
    } catch (cause) { if (!operation.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (downloadController.current === operation) { downloadController.current = null; setDownloading(false); } }
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
    {downloadable && provider !== 'browser' && <button type="button" disabled={downloading || saved} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-2 text-[#31564c]" aria-label={locale === 'ja' ? saved ? 'ダウンロード済み' : '音声をダウンロード' : locale === 'en' ? saved ? 'Audio saved offline' : 'Download audio' : saved ? '语音已下载' : '下载语音'} title={locale === 'ja' ? saved ? 'ダウンロード済み' : '音声をダウンロード' : locale === 'en' ? saved ? 'Audio saved offline' : 'Download audio' : saved ? '语音已下载' : '下载语音'} onClick={() => void download()}>
      {downloading ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : saved ? <Check size={18} aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
    </button>}
    {error && <span role="alert" className="text-red-700">{error}</span>}
  </span>;
}
