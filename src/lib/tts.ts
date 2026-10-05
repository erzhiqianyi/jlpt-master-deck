import { apiRequest } from './api';
import { speechAudioChunk, hasDownloadedSpeech } from './speechAudio';
import type { TtsProviderId } from '../types';

export type TtsCredentialField = { key: string; label: string; secret: boolean };
export type TtsProviderDescriptor = {
  id: Exclude<TtsProviderId, 'browser'>;
  name: string;
  requiresApiKey: boolean;
  credentialFields: TtsCredentialField[];
  voices: string[];
  defaultVoice: string;
};
export type TtsCredentialStatus = { provider: string; configured: boolean; updatedAt: string | null };

export function fetchTtsProviders(token: string) {
  return apiRequest<{ providers: TtsProviderDescriptor[] }>('/api/tts/providers', { token });
}

export function fetchTtsCredentials(token: string) {
  return apiRequest<{ credentials: TtsCredentialStatus[] }>('/api/tts/credentials', { token });
}

export function saveTtsCredential(token: string, provider: string, credential: Record<string, string>) {
  return apiRequest<{ credentials: TtsCredentialStatus[] }>(`/api/tts/credentials/${encodeURIComponent(provider)}`, { method: 'PUT', token, body: credential });
}

export function deleteTtsCredential(token: string, provider: string) {
  return apiRequest<{ credentials: TtsCredentialStatus[] }>(`/api/tts/credentials/${encodeURIComponent(provider)}`, { method: 'DELETE', token });
}

export type SpeechVoice = { id: string; name: string; styles: string[]; roles: string[] };
export function fetchSpeechVoices(token: string, provider: string) {
  return apiRequest<{ voices: SpeechVoice[] }>(`/api/tts/voices?provider=${encodeURIComponent(provider)}`, { token });
}
export type SpeechOptions = { provider: TtsProviderId; token: string; voice?: string; style?: string; role?: string; rate?: number; owner?: string; cacheScope?: string };
let controller: AbortController | null = null;
let currentAudio: HTMLAudioElement | null = null;
let state = { owner: '', status: 'idle' as 'idle' | 'loading' | 'playing' | 'paused' };
const listeners = new Set<() => void>();
export const speechSnapshot = () => state;
export const subscribeSpeech = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function update(status: typeof state.status, owner = state.owner) { state = { status, owner }; listeners.forEach((listener) => listener()); }
export function stopSpeech() {
  controller?.abort(); controller = null;
  currentAudio?.pause(); currentAudio = null;
  if (typeof window !== 'undefined') { window.speechSynthesis?.cancel(); window.speechSynthesis?.resume(); }
  update('idle', '');
}
export function pauseSpeech() {
  if (state.status !== 'playing') return;
  currentAudio?.pause(); window.speechSynthesis?.pause(); update('paused');
}
export async function resumeSpeech() {
  if (state.status !== 'paused') return;
  await currentAudio?.play(); window.speechSynthesis?.resume(); update('playing');
}
export function splitSpeechText(text: string): string[] {
  const chunks: string[] = [];
  let chunk = '';
  for (const sentence of text.trim().match(/[^。！？\n]+[。！？\n]*|[。！？\n]+/gu) ?? []) {
    if (chunk.length + sentence.length > 450 && chunk) { chunks.push(chunk); chunk = ''; }
    for (const char of sentence) {
      if (chunk.length + char.length > 450) { chunks.push(chunk); chunk = ''; }
      chunk += char;
    }
  }
  if (chunk.trim()) chunks.push(chunk);
  return chunks;
}

// Resolves when the entire sequence finishes. Aborting rejects and prevents stale playback.
export async function speak(text: string, options: SpeechOptions) {
  stopSpeech();
  if (typeof document !== 'undefined') document.querySelectorAll('audio, video').forEach((media) => (media as HTMLMediaElement).pause());
  const operation = new AbortController(); controller = operation;
  const { signal } = operation;
  const rate = Math.min(1.5, Math.max(0.5, options.rate || 1));
  try {
    for (const chunk of splitSpeechText(text)) {
      signal.throwIfAborted();
      update('loading', options.owner ?? '');
      if (options.provider === 'browser') {
        if (!('speechSynthesis' in window)) throw new Error('当前浏览器不支持朗读功能');
        await new Promise<void>((resolve, reject) => {
          const utterance = new SpeechSynthesisUtterance(chunk);
          utterance.lang = 'ja-JP'; utterance.rate = rate;
          utterance.voice = window.speechSynthesis.getVoices().find((voice) => voice.voiceURI === options.voice) ?? null;
          const abort = () => finish(signal.reason);
          const finish = (error?: unknown) => { signal.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
          utterance.onend = () => finish();
          utterance.onerror = (event) => finish(new Error(`朗读失败：${event.error}`));
          signal.addEventListener('abort', abort, { once: true });
          window.speechSynthesis.speak(utterance); update('playing');
        });
      } else {
        const blob = await speechAudioChunk(chunk, { ...options, provider: options.provider }, signal);
        const url = URL.createObjectURL(blob);
        try {
          await new Promise<void>((resolve, reject) => {
            const audio = new Audio(url); currentAudio = audio; audio.playbackRate = rate;
            const abort = () => { audio.pause(); finish(signal.reason); };
            const finish = (error?: unknown) => { signal.removeEventListener('abort', abort); audio.onended = null; audio.onerror = null; error ? reject(error) : resolve(); };
            audio.onended = () => finish(); audio.onerror = () => finish(new Error('音频播放失败，请重试'));
            signal.addEventListener('abort', abort, { once: true });
            audio.play().then(() => { if (!signal.aborted) update('playing'); }).catch(finish);
          });
        } finally { URL.revokeObjectURL(url); }
      }
    }
  } finally {
    if (controller === operation) { controller = null; currentAudio = null; update('idle', ''); }
  }
}

export async function downloadSpeech(text: string, options: SpeechOptions, signal?: AbortSignal) {
  if (options.provider === 'browser') throw new Error('系统内置语音不提供音频下载，请选择已配置的云端朗读服务。');
  for (const chunk of splitSpeechText(text)) {
    signal?.throwIfAborted();
    await speechAudioChunk(chunk, { ...options, provider: options.provider }, signal, true);
  }
}
export function speechDownloaded(text: string, options: SpeechOptions) {
  return options.provider === 'browser' ? Promise.resolve(false) : hasDownloadedSpeech(splitSpeechText(text), { ...options, provider: options.provider });
}
