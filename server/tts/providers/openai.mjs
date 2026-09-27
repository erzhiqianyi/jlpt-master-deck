export const id = 'openai';
export const name = 'OpenAI';
export const requiresApiKey = true;
export const credentialFields = [{ key: 'apiKey', label: 'API Key', secret: true }];
export const voices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
export const defaultVoice = 'alloy';

export async function synthesize(text, { apiKey, voice }) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: voice || defaultVoice, input: text, response_format: 'mp3' }),
  });
  if (!response.ok) throw new Error(`OpenAI 发音请求失败（${response.status}）：${(await response.text().catch(() => '')).slice(0, 300)}`);
  return { audio: Buffer.from(await response.arrayBuffer()), mimeType: 'audio/mpeg' };
}
