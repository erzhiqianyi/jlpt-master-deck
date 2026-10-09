import { useEffect, useState } from 'react';
import type { V3Settings, V3SettingsPatch } from '../../v3/types';
import { fetchSpeechVoices, type SpeechVoice, type TtsProviderDescriptor } from '../../lib/tts';

export function SpeechPreferences({ settings, token, provider, credentialVersion, onChange }: {
  settings: V3Settings; token: string; provider?: TtsProviderDescriptor; credentialVersion?: string | null;
  onChange: (patch: V3SettingsPatch) => void;
}) {
  const [voices, setVoices] = useState<SpeechVoice[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const t = (zh: string, ja: string, en: string) => settings.uiLanguage === 'ja' ? ja : settings.uiLanguage === 'en' ? en : zh;
  const prefs = settings.speech;
  const providerId = prefs.provider;
  const choice: Partial<V3Settings['speech']['voices'][string]> = prefs.voices[providerId] ?? {};
  const selected = voices.find((voice) => voice.id === (choice.voice || provider?.defaultVoice));
  const change = (value: V3SettingsPatch['speech']) => onChange({ speech: value });
  const choose = (value: typeof choice) => change({ voices: { [providerId]: { voice: '', style: null, role: null, ...choice, ...value } } });
  useEffect(() => {
    let cancelled = false;
    setError(''); setVoices([]); setLoading(false);
    if (providerId === 'browser') {
      const load = () => setVoices((window.speechSynthesis?.getVoices() ?? []).filter((voice) => voice.lang.startsWith('ja')).map((voice) => ({ id: voice.voiceURI, name: voice.name, styles: [], roles: [] })));
      load(); window.speechSynthesis?.addEventListener('voiceschanged', load);
      return () => window.speechSynthesis?.removeEventListener('voiceschanged', load);
    }
    if (providerId === 'azure' && !credentialVersion) return;
    setLoading(true);
    fetchSpeechVoices(token, providerId).then((result) => { if (!cancelled) setVoices(result.voices); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [providerId, token, credentialVersion, refresh]);
  const selectClass = 'min-h-11 max-w-full rounded-md border border-[#c8d1c8] bg-white px-3';
  return <div className="grid gap-3 border-t border-[#ded8cf] pt-4">
    <label className="grid gap-1">{t('日语音色', '日本語の音声', 'Japanese voice')}
      <select className={selectClass} value={choice.voice ?? ''} disabled={loading} onChange={(event) => choose({ voice: event.target.value, style: '', role: '' })}>
        <option value="">{t('默认音色', '既定の音声', 'Default voice')}</option>
        {choice.voice && !voices.some((voice) => voice.id === choice.voice) && <option value={choice.voice}>{choice.voice}</option>}
        {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
      </select>
    </label>
    {providerId === 'azure' && <div className="text-sm"><button type="button" disabled={loading || !credentialVersion} className="min-h-10 underline" onClick={() => setRefresh((value) => value + 1)}>{loading ? t('加载中…', '読み込み中…', 'Loading…') : t('刷新区域音色', '音声一覧を更新', 'Refresh regional voices')}</button>{!credentialVersion && <p>{t('先保存 API Key 和区域，即可加载可用音色。', 'API Key とリージョンを保存してください。', 'Save the API key and region to load voices.')}</p>}</div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {selected && [['style', selected.styles, t('风格', 'スタイル', 'Style')], ['role', selected.roles, t('角色', 'ロール', 'Role')]].map(([key, options, title]) => (options as string[]).length > 0 ? <label key={key as string} className="grid gap-1">{title as string}<select className={selectClass} value={choice[key as 'style' | 'role'] ?? ''} onChange={(event) => choose({ [key as string]: event.target.value })}><option value="">{t('默认', '既定', 'Default')}</option>{(options as string[]).map((option) => <option key={option} value={option}>{option === 'chat' ? t('聊天', '会話', 'Chat') : option === 'cheerful' ? t('欢快', '明るい', 'Cheerful') : option === 'customerservice' ? t('客服', 'カスタマーサービス', 'Customer service') : option}</option>)}</select></label> : null)}
    <label className="grid gap-1">{t('播放语速', '再生速度', 'Playback speed')} · {prefs.rate ?? 1}×<input aria-label={t('播放语速', '再生速度', 'Playback speed')} type="range" min="0.5" max="1.5" step="0.1" value={prefs.rate ?? 1} onChange={(event) => change({ rate: Number(event.target.value) })} /></label>
    <label className="grid gap-1">{t('卡片自动朗读', 'カードの自動読み上げ', 'Card autoplay')}<select className={selectClass} value={prefs.cardAuto ?? 'off'} onChange={(event) => change({ cardAuto: event.target.value as 'off' | 'front' | 'back' })}><option value="off">{t('关闭（手动播放）', 'オフ（手動）', 'Off (manual)')}</option><option value="front">{t('显示卡片时', 'カード表示時', 'When shown')}</option><option value="back">{t('翻面后', '裏面を表示した時', 'After revealing')}</option></select></label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={prefs.grammarAuto ?? false} onChange={(event) => change({ grammarAuto: event.target.checked })} />{t('语法卡片也启用自动朗读', '文法カードも自動で読み上げる', 'Also autoplay grammar cards')}</label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={prefs.includeExample ?? false} onChange={(event) => change({ includeExample: event.target.checked })} />{t('自动朗读时接着读第一条例句', '最初の例文も続けて読み上げる', 'Include the first example in autoplay')}</label>
  </div>;
}
