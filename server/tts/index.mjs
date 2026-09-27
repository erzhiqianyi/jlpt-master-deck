import { providersById, listProviderDescriptors } from './registry.mjs';
import { ttsCredentialStatus, setTtsCredential, deleteTtsCredential, getTtsCredential } from './store.mjs';

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

export async function synthesizeSpeech(userId, { provider, text, voice }) {
  const descriptor = descriptorFor(provider);
  const trimmed = String(text ?? '').trim();
  if (!trimmed) throw new Error('缺少要朗读的文本');
  if (trimmed.length > 500) throw new Error('文本过长（最多 500 字）');
  const credential = getTtsCredential(userId, provider) ?? {};
  if (descriptor.requiresApiKey && !credential.apiKey) {
    const error = new Error(`尚未配置 ${descriptor.name} 的 API Key`);
    error.statusCode = 400;
    throw error;
  }
  return descriptor.synthesize(trimmed, { ...credential, voice });
}
