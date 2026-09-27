import { apiRequest, ApiError } from './api';
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

let currentAudio: HTMLAudioElement | null = null;

// The 'browser' provider needs no key or backend call; it reads aloud on-device for free.
export async function speak(text: string, { provider, token, voice }: { provider: TtsProviderId; token: string; voice?: string }) {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (provider === 'browser') {
    if (!('speechSynthesis' in window)) throw new Error('当前浏览器不支持朗读功能');
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(trimmed);
    utterance.lang = 'ja-JP';
    window.speechSynthesis.speak(utterance);
    return;
  }
  const response = await fetch('/api/tts/speak', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ text: trimmed, provider, voice }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(typeof payload.error === 'string' ? payload.error : `朗读请求失败：${response.status}`, response.status);
  }
  const url = URL.createObjectURL(await response.blob());
  currentAudio?.pause();
  currentAudio = new Audio(url);
  currentAudio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
  await currentAudio.play();
}
