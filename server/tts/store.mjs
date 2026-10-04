import { getDb } from '../storage.mjs';
import { encryptSecret, decryptSecret } from './crypto.mjs';
import { ttsSecretKey } from './secret-key.mjs';
import { providerIds } from './registry.mjs';

export function ttsCredentialStatus(userId) {
  const rows = getDb().prepare('SELECT provider, updated_at FROM user_tts_credentials WHERE user_id = ?').all(userId);
  const byProvider = new Map(rows.map((row) => [row.provider, row]));
  return providerIds.map((provider) => ({
    provider,
    configured: byProvider.has(provider),
    updatedAt: byProvider.get(provider)?.updated_at ?? null,
  }));
}

export function setTtsCredential(userId, provider, credential) {
  const encrypted = encryptSecret(JSON.stringify(credential), ttsSecretKey());
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO user_tts_credentials (user_id, provider, credential_encrypted, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, provider) DO UPDATE SET credential_encrypted = excluded.credential_encrypted, updated_at = excluded.updated_at
  `).run(userId, provider, encrypted, now);
}

export function deleteTtsCredential(userId, provider) {
  getDb().prepare('DELETE FROM user_tts_credentials WHERE user_id = ? AND provider = ?').run(userId, provider);
}

export function getTtsCredential(userId, provider) {
  const row = getDb().prepare('SELECT credential_encrypted FROM user_tts_credentials WHERE user_id = ? AND provider = ?').get(userId, provider);
  if (!row) return null;
  return JSON.parse(decryptSecret(row.credential_encrypted, ttsSecretKey()));
}

// Randomized encrypted envelope doubles as a generation token; never return it to clients.
export function ttsCredentialRevision(userId, provider) {
  return getDb().prepare('SELECT credential_encrypted FROM user_tts_credentials WHERE user_id = ? AND provider = ?').get(userId, provider)?.credential_encrypted ?? null;
}
