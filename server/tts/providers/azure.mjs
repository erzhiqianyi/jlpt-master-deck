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

export function validateRegion(region) {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(region ?? '')) throw new Error('Azure Region 请填写区域代码，例如 eastasia');
}

export async function listVoices({ apiKey, region }) {
  validateRegion(region);
  const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`, {
    headers: { 'Ocp-Apim-Subscription-Key': apiKey }, signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Azure 音色列表请求失败（${response.status}）`);
  return (await response.json()).filter((v) => v.Locale === 'ja-JP').map((v) => ({
    id: v.ShortName, name: `${v.LocalName || v.DisplayName} · ${v.Gender}`, styles: v.StyleList ?? [], roles: v.RolePlayList ?? [],
  }));
}

export async function synthesize(text, { apiKey, region, voice, style, role }) {
  validateRegion(region);
  const expression = style || role ? `<mstts:express-as style='${escapeXml(style || 'general')}'${role ? ` role='${escapeXml(role)}'` : ''}>${escapeXml(text)}</mstts:express-as>` : escapeXml(text);
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='ja-JP'><voice xml:lang='ja-JP' name='${escapeXml(voice || defaultVoice)}'>${expression}</voice></speak>`;
  const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST', signal: AbortSignal.timeout(30000),
    headers: {
      'ocp-apim-subscription-key': apiKey,
      'content-type': 'application/ssml+xml',
      'x-microsoft-outputformat': 'audio-24khz-48kbitrate-mono-mp3',
      'user-agent': 'JLPT-Master',
    },
    body: ssml,
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).trim().slice(0, 300);
    const hint = response.status === 400
      ? 'Azure 拒绝了合成请求，请检查音色、风格和角色参数。'
      : 'Azure 未返回错误详情，请稍后重试。';
    throw new Error(`Azure 发音请求失败（${response.status}）：${detail || hint}`);
  }
  return { audio: Buffer.from(await response.arrayBuffer()), mimeType: 'audio/mpeg' };
}
