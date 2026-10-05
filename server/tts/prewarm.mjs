import { getDb } from '../storage.mjs';
import { currentPlatform } from '../platform.mjs';
import { synthesizeSpeech } from './index.mjs';
import { ttsCredentialStatus } from './store.mjs';
import { providersById } from './registry.mjs';

// Run only after a successful save; cloud transactions defer this until commit.
export function scheduleItemPronunciation(userId, item) {
  const platform = currentPlatform();
  const run = async () => {
    try {
      const row = getDb().prepare('SELECT settings_json FROM user_settings WHERE user_id = ?').get(userId);
      const settings = row ? JSON.parse(row.settings_json) : {};
      const provider = settings.ttsProvider;
      if (!providersById[provider] || !ttsCredentialStatus(userId).some(value => value.provider === provider && value.configured)) return;
      const text = String(item.type === 'word' ? item.reading?.trim() || item.original : item.original ?? '').trim();
      if (!text) return;
      const voice = settings.speech?.voices?.[provider] ?? {};
      // Match playback's UTF-16 chunk limit without splitting a surrogate pair.
      const chunks = []; let chunk = '';
      for (const sentence of text.match(/[^。！？\n]+[。！？\n]*|[。！？\n]+/gu) ?? []) {
        if (chunk.length + sentence.length > 450 && chunk) { chunks.push(chunk); chunk = ''; }
        for (const character of sentence) {
          if (chunk.length + character.length > 450) { chunks.push(chunk); chunk = ''; }
          chunk += character;
        }
      }
      if (chunk.trim()) chunks.push(chunk);
      for (const text of chunks) await synthesizeSpeech(userId, { provider, text, voice: voice.voice, style: voice.style, role: voice.role });
    } catch {
      // No secrets or study text in logs; normal playback can retry later.
      console.warn('Automatic item pronunciation generation failed');
    }
  };
  if (platform?.afterCommit) platform.afterCommit.push(run);
  else void Promise.resolve().then(run);
}
