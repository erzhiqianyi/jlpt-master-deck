export const id = 'google-cloud';
export const name = 'Google Cloud';
export const requiresApiKey = true;
export const credentialFields = [{ key: 'apiKey', label: 'API Key', secret: true }];
export const voices = ['ja-JP-Neural2-B', 'ja-JP-Neural2-C', 'ja-JP-Neural2-D', 'ja-JP-Standard-A'];
export const defaultVoice = 'ja-JP-Neural2-B';

export async function synthesize(text, { apiKey, voice }) {
  const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'ja-JP', name: voice || defaultVoice },
      audioConfig: { audioEncoding: 'MP3' },
    }),
  });
  if (!response.ok) throw new Error(`Google 发音请求失败（${response.status}）：${(await response.text().catch(() => '')).slice(0, 300)}`);
  const data = await response.json();
  return { audio: Buffer.from(data.audioContent, 'base64'), mimeType: 'audio/mpeg' };
}
