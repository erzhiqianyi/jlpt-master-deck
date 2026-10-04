import { cachedSpeech } from './cache.mjs';
import { providersById, listProviderDescriptors } from './registry.mjs';
import { ttsCredentialStatus, setTtsCredential, deleteTtsCredential, getTtsCredential, ttsCredentialRevision } from './store.mjs';

export { listProviderDescriptors, ttsCredentialStatus, deleteTtsCredential };

function descriptorFor(provider) {
  const descriptor = providersById[provider];
  if (!descriptor) throw new Error(`未知的发音服务商：${provider}`);
  return descriptor;
}

export function saveTtsCredential(userId, provider, credential) {
  const descriptor = descriptorFor(provider);
  const cleaned = {};
  for (const field of descriptor.credentialFields) {
    const value = String(credential?.[field.key] ?? '').trim();
    if (field.secret && !value) throw new Error(`请填写 ${field.label}`);
    cleaned[field.key] = value;
  }
  setTtsCredential(userId, provider, cleaned);
  return ttsCredentialStatus(userId);
}

export async function synthesizeSpeech(userId, { provider, text, voice, style, role }) {
  const descriptor = descriptorFor(provider);
  const trimmed = String(text ?? '').trim();
  if (!trimmed) throw new Error('缺少要朗读的文本');
  if (trimmed.length > 500) throw new Error('文本过长（最多 500 字）');
  const credential = getTtsCredential(userId, provider) ?? {};
  const revision = ttsCredentialRevision(userId, provider);
  if (descriptor.requiresApiKey && !credential.apiKey) {
    const error = new Error(`尚未配置 ${descriptor.name} 的 API Key`);
    error.statusCode = 400;
    throw error;
  }
  const options = { ...credential, voice: voice || descriptor.defaultVoice, style: style || '', role: role || '' };
  // Include the full credential in the HMAC input: rotation invalidates old entries;
  // no secret or plaintext is stored in object names or cache metadata.
  const identity = { version: 1, revision, provider, model: provider === 'openai' ? 'gpt-4o-mini-tts' : 'provider-default',
    format: provider === 'azure' ? 'audio-24khz-48kbitrate-mono-mp3' : 'mp3', text: trimmed, options };
  return cachedSpeech(userId, identity, () => descriptor.synthesize(trimmed, options), { validate() {
    if (ttsCredentialRevision(userId, provider) !== revision) {
      const error = new Error('语音凭据已变更，请重试'); error.statusCode = 409; throw error;
    }
  } });
}

export async function listSpeechVoices(userId, provider) {
  const descriptor = descriptorFor(provider);
  if (!descriptor.listVoices) return descriptor.voices.map((id) => ({ id, name: id, styles: [], roles: [] }));
  const credential = getTtsCredential(userId, provider);
  if (!credential?.apiKey) throw new Error('请先保存语音配置，再加载音色');
  return descriptor.listVoices(credential);
}
