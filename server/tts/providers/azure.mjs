export const id = 'azure';
export const name = 'Azure Speech';
export const requiresApiKey = true;
export const credentialFields = [
  { key: 'apiKey', label: 'API Key', secret: true },
  { key: 'region', label: 'Region（如 japaneast）', secret: false },
];
export const voices = ['ja-JP-NanamiNeural', 'ja-JP-KeitaNeural'];
export const defaultVoice = 'ja-JP-NanamiNeural';

function escapeXml(text) {
  return text.replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char]);
}

export async function synthesize(text, { apiKey, region, voice }) {
  if (!region) throw new Error('Azure Speech 需要填写 Region');
  const ssml = `<speak version='1.0' xml:lang='ja-JP'><voice xml:lang='ja-JP' name='${voice || defaultVoice}'>${escapeXml(text)}</voice></speak>`;
  const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'ocp-apim-subscription-key': apiKey,
      'content-type': 'application/ssml+xml',
      'x-microsoft-outputformat': 'audio-24khz-48kbitrate-mono-mp3',
    },
    body: ssml,
  });
  if (!response.ok) throw new Error(`Azure 发音请求失败（${response.status}）：${(await response.text().catch(() => '')).slice(0, 300)}`);
  return { audio: Buffer.from(await response.arrayBuffer()), mimeType: 'audio/mpeg' };
}
