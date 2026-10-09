import { ApiError } from './api';
import type { TtsProviderId } from '../types';

export type SpeechAudioOptions = {
  provider: Exclude<TtsProviderId, 'browser'>;
  token: string;
  cacheScope?: string;
  voice?: string;
  style?: string | null;
  role?: string | null;
};
const cacheName = 'jlpt-downloaded-speech-v1';
const listeners = new Set<() => void>();
export const subscribeSpeechDownloads = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

async function cacheRequest(text: string, options: SpeechAudioOptions) {
  const scope = options.cacheScope || options.token;
  if (!scope || typeof window === 'undefined' || !window.caches || !window.crypto?.subtle) return null;
  const input = JSON.stringify([1, scope, options.provider, options.voice || '', options.style || '', options.role || '', text.trim()]);
  const hash = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const key = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return new Request(`${window.location.origin}/__jlpt-speech-cache/${key}`);
}

export async function hasDownloadedSpeech(chunks: string[], options: SpeechAudioOptions) {
  if (!chunks.length) return false;
  try {
    const cache = await window.caches.open(cacheName);
    for (const chunk of chunks) {
      const request = await cacheRequest(chunk, options);
      if (!request || !(await cache.match(request))) return false;
    }
    return true;
  } catch { return false; }
}

// Only MP3 bytes are persisted. Cache URLs contain a digest, never credentials or text.
export async function speechAudioChunk(text: string, options: SpeechAudioOptions, signal?: AbortSignal, requireStorage = false) {
  let request: Request | null = null;
  let cache: Cache | null = null;
  try {
    request = await cacheRequest(text, options);
    if (request) {
      cache = await window.caches.open(cacheName);
      const stored = await cache.match(request);
      if (stored) { signal?.throwIfAborted(); return await stored.blob(); }
    }
  } catch (error) { if (signal?.aborted) throw error; }
  if (requireStorage && (!cache || !request)) throw new Error('当前浏览器无法保存离线语音，请允许网站使用本地存储后重试。');
  signal?.throwIfAborted();
  const response = await fetch('/api/tts/speak', {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${options.token}` },
    body: JSON.stringify({ text, provider: options.provider, voice: options.voice, style: options.style, role: options.role }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(typeof payload.error === 'string' ? payload.error : `朗读请求失败：${response.status}`, response.status);
  }
  const blob = await response.blob();
  signal?.throwIfAborted();
  if (!blob.size || !blob.type.startsWith('audio/')) throw new Error('服务器没有返回有效的朗读音频。');
  if (cache && request) {
    try {
      await cache.put(request, new Response(blob, { headers: { 'content-type': blob.type } }));
      listeners.forEach((listener) => listener());
    } catch (error) { if (requireStorage) throw error; }
  }
  signal?.throwIfAborted();
  return blob;
}
