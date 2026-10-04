import { SpeechPreferences } from './SpeechPreferences';
import './SettingsView.css';
import { useConfirmation } from '../../components/confirmation';
import { NavigationCard } from '../../components/NavigationCard';
import { BookOpen, ChevronRight, Languages, LogOut, MessageSquareText, PanelTop, Settings2, Sparkles, UserRound, Bug, Volume2, Search } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { configurableMemoryCardFields, memoryCardFieldLabels, type MemoryCardField } from '../../domain/memoryCards';
import { stopSpeech, speak, fetchTtsProviders, fetchTtsCredentials, saveTtsCredential, deleteTtsCredential, type TtsProviderDescriptor, type TtsCredentialStatus } from '../../lib/tts';
import type { DisplaySettings, Locale } from '../../types';

type SettingsViewProps = {
  labels: Record<string, string>;
  settings: DisplaySettings;
  username: string;
  authToken: string;
  activeSection?: string;
  onOpenSection?: (section: SettingsSectionId) => void;
  onSearch?: () => void;
  onLogout: () => void;
  onUpdateSettings: (settings: DisplaySettings) => void;
};

type SettingsSectionId = 'display' | 'practice' | 'memory' | 'pronunciation' | 'account';

type SettingsCopy = {
  displayAndReading: string;
  kanaDisplay: string;
  practiceExperience: string;
  feedbackTiming: string;
  profileEdit: string;
  connectedAgents: string;
  connectedAgentsHint: string;
  learningLanguage: string;
  interfaceLanguage: string;
  pronunciationClearTitle: string;
  pronunciationClearBody: string;
  mcpInspector: string;
  mcpInspectorHint: string;
  pronunciation: string;
  pronunciationHint: string;
  pronunciationProvider: string;
  pronunciationBrowser: string;
  pronunciationConfigured: string;
  pronunciationNotConfigured: string;
  pronunciationSave: string;
  pronunciationSaving: string;
  pronunciationClear: string;
  pronunciationTest: string;
  pronunciationSaveAndTest: string;
  pronunciationTesting: string;
  pronunciationTestSuccess: string;
  pronunciationTestFailed: string;
};

const settingsPageCopy: Record<Locale, SettingsCopy> = {
  'zh-CN': {
    displayAndReading: '显示与阅读',
    kanaDisplay: '假名显示',
    practiceExperience: '练习体验',
    feedbackTiming: '反馈时机',
    profileEdit: '学习档案',
    connectedAgents: '已连接的 Agent',
    connectedAgentsHint: 'MCP · OAuth 授权 · 断开连接',
    learningLanguage: '学习 日本语',
    interfaceLanguage: '界面语言',
    pronunciationClearTitle: '清除朗读配置？',
    pronunciationClearBody: '将清除该服务商保存的凭据。再次使用前需要重新配置。',
    mcpInspector: 'MCP 调试工具',
    mcpInspectorHint: '本地开发 · 查看 Schema、授权与调试工具调用',
    pronunciation: '发音朗读',
    pronunciationHint: '朗读服务商 · 自备 API Key',
    pronunciationProvider: '朗读服务商',
    pronunciationBrowser: '浏览器内置朗读（免费，无需配置）',
    pronunciationConfigured: '已配置 ✓',
    pronunciationNotConfigured: '未配置',
    pronunciationSave: '保存',
    pronunciationSaving: '保存中…',
    pronunciationClear: '清除',
    pronunciationTest: '测试朗读',
    pronunciationSaveAndTest: '保存并测试',
    pronunciationTesting: '测试中…',
    pronunciationTestSuccess: '测试成功，已完成播放。',
    pronunciationTestFailed: '测试失败：',
  },
  ja: {
    displayAndReading: '表示と読みやすさ',
    kanaDisplay: 'ふりがな表示',
    practiceExperience: '練習体験',
    feedbackTiming: 'フィードバックのタイミング',
    profileEdit: '学習プロフィール',
    connectedAgents: '接続済みエージェント',
    connectedAgentsHint: 'MCP · OAuth 認可 · 接続解除',
    learningLanguage: '学習 日本語',
    interfaceLanguage: '表示言語',
    pronunciationClearTitle: '読み上げ設定を削除しますか？',
    pronunciationClearBody: 'このサービスの保存済み認証情報を削除します。再利用するには設定が必要です。',
    mcpInspector: 'MCP デバッグツール',
    mcpInspectorHint: 'ローカル開発 · スキーマ・認可・ツール呼び出しを確認',
    pronunciation: '発音読み上げ',
    pronunciationHint: '読み上げサービス · 自分の API Key',
    pronunciationProvider: '読み上げサービス',
    pronunciationBrowser: 'ブラウザ内蔵読み上げ（無料・設定不要）',
    pronunciationConfigured: '設定済み ✓',
    pronunciationNotConfigured: '未設定',
    pronunciationSave: '保存',
    pronunciationSaving: '保存中…',
    pronunciationClear: '削除',
    pronunciationTest: '読み上げをテスト',
    pronunciationSaveAndTest: '保存してテスト',
    pronunciationTesting: 'テスト中…',
    pronunciationTestSuccess: 'テスト成功。再生が完了しました。',
    pronunciationTestFailed: 'テスト失敗：',
  },
  en: {
    displayAndReading: 'Display and Reading',
    kanaDisplay: 'Kana Display',
    practiceExperience: 'Practice Experience',
    feedbackTiming: 'Feedback Timing',
    profileEdit: 'Learning Profile',
    connectedAgents: 'Connected Agents',
    connectedAgentsHint: 'MCP · OAuth consent · Disconnect',
    learningLanguage: 'Learning Japanese',
    interfaceLanguage: 'App language',
    pronunciationClearTitle: 'Clear speech configuration?',
    pronunciationClearBody: 'This removes the saved credentials for this provider. You will need to configure it again before using it.',
    mcpInspector: 'MCP Inspector',
    mcpInspectorHint: 'Local development · Inspect schemas, authorization and tool calls',
    pronunciation: 'Pronunciation',
    pronunciationHint: 'Speech provider · your own API key',
    pronunciationProvider: 'Speech provider',
    pronunciationBrowser: "Browser's built-in speech (free, no setup)",
    pronunciationConfigured: 'Configured ✓',
    pronunciationNotConfigured: 'Not configured',
    pronunciationSave: 'Save',
    pronunciationSaving: 'Saving…',
    pronunciationClear: 'Clear',
    pronunciationTest: 'Test speech',
    pronunciationSaveAndTest: 'Save and test',
    pronunciationTesting: 'Testing…',
    pronunciationTestSuccess: 'Test succeeded. Playback completed.',
    pronunciationTestFailed: 'Test failed: ',
  },
};

export function SettingsView({ labels, settings, username, authToken, activeSection: activeSectionValue, onOpenSection: openSection, onLogout, onUpdateSettings, onSearch }: SettingsViewProps) {
  const copy = settingsPageCopy[settings.locale];
  const activeSection = isSettingsSection(activeSectionValue) ? activeSectionValue : undefined;
  const onOpenSection = openSection ?? ((section: SettingsSectionId) => { window.location.hash = `#/settings/${section}`; });

  return (
    <section className="gentle-settings settings-template" aria-label={activeSection ? sectionTitle(activeSection, labels, copy, settings) : labels.settings}>
      <h2 className="sr-only">{activeSection ? sectionTitle(activeSection, labels, copy, settings) : labels.settings}</h2>
      {!activeSection ? <div className="settings-home-only"><SettingsProfileCard copy={copy} username={username} locale={settings.locale} /></div> : null}
      <div className="settings-mobile-detail settings-unified-content">
        {activeSection ? (
          <section id={`settings-${activeSection}`} className="settings-section-card settings-detail-card" aria-label={sectionTitle(activeSection, labels, copy, settings)}>
            <SettingsSectionContent section={activeSection} copy={copy} labels={labels} settings={settings} username={username} authToken={authToken} onUpdateSettings={onUpdateSettings} />
          </section>
        ) : (
          <SettingsHome copy={copy} labels={labels} settings={settings} onOpenSection={onOpenSection} onSearch={onSearch} />
        )}
      </div>
      {!activeSection || activeSection === 'account' ? <div className="settings-logout-area">
        <button type="button" onClick={onLogout} className="settings-logout-button">
          <LogOut size={18} />{labels.logout}
        </button>
      </div> : null}
    </section>
  );
}

const memoryCardSettingsCopy: Record<Locale, {
  title: string;
  body: string;
  front: string;
  back: string;
  exampleNote: string;
}> = {
  'zh-CN': {
    title: '记忆卡内容',
    body: '分别选择正面和背面显示的学习内容。当前卡片没有的字段会自动跳过。',
    front: '卡片正面',
    back: '卡片背面',
    exampleNote: '单词和语法共用这一套字段；与原词相同的读音会自动隐藏。图片可在词条详情页上传。',
  },
  ja: {
    title: '記憶カードの内容',
    body: '表面と裏面に表示する学習内容を個別に選択します。データがない項目は自動的に省略されます。',
    front: 'カード表面',
    back: 'カード裏面',
    exampleNote: '単語と文法は同じ項目を共有します。原語と同じ読み方は自動的に省略されます。画像は項目の詳細ページで追加できます。',
  },
  en: {
    title: 'Memory card content',
    body: 'Choose learning fields for the front and back independently. Missing fields are skipped automatically.',
    front: 'Card front',
    back: 'Card back',
    exampleNote: 'Vocabulary and grammar share these fields; a reading identical to the entry is hidden automatically. Add images on the entry detail page.',
  },
};

function isSettingsSection(value: string | undefined): value is SettingsSectionId {
  return value === 'display' || value === 'practice' || value === 'memory' || value === 'pronunciation' || value === 'account';
}

function sectionTitle(section: SettingsSectionId, labels: Record<string, string>, copy: SettingsCopy, settings: DisplaySettings) {
  if (section === 'display') return copy.displayAndReading;
  if (section === 'practice') return copy.practiceExperience;
  if (section === 'memory') return memoryCardSettingsCopy[settings.locale].title;
  if (section === 'pronunciation') return copy.pronunciation;
  return labels.account;
}

function SettingsProfileCard({ copy, username, locale }: { copy: SettingsCopy; username: string; locale: Locale }) {
  return (
    <section className="settings-profile-card" aria-label={copy.profileEdit}>
      <div className="settings-avatar" aria-hidden="true">
        <UserRound size={42} />
      </div>
      <div className="min-w-0">
        <h3>{username}</h3>
        <p>{copy.profileEdit}</p>
      </div>
      <div className="settings-language-pair">
        <span><BookOpen size={18} />{copy.learningLanguage}</span>
        <span className="settings-language-divider" aria-hidden="true">·</span>
        <span><Languages size={18} />{copy.interfaceLanguage} · { { 'zh-CN': '简体中文', ja: '日本語', en: 'English' }[locale]}</span>
      </div>
    </section>
  );
}

function SettingsHome({ copy, labels, settings, onOpenSection, onSearch }: { copy: SettingsCopy; labels: Record<string, string>; settings: DisplaySettings; onOpenSection: (section: SettingsSectionId) => void; onSearch?: () => void }) {
  const t = (zh: string, ja: string, en: string) => settings.locale === 'zh-CN' ? zh : settings.locale === 'ja' ? ja : en;
  return (
    <div className="settings-navigation">
      <section className="settings-nav-group" aria-label={t('学习偏好', '学習の設定', 'Learning preferences')}>
        <h3>{t('学习偏好', '学習の設定', 'Learning preferences')}</h3>
        <SettingsNavItem icon={<Settings2 size={22} />} title={copy.displayAndReading} subtitle={`${labels.language} · ${labels.fontSize} · ${copy.kanaDisplay}`} onClick={() => onOpenSection('display')} />
        <SettingsNavItem icon={<Sparkles size={22} />} title={copy.practiceExperience} subtitle={copy.feedbackTiming} onClick={() => onOpenSection('practice')} />
        <SettingsNavItem icon={<PanelTop size={22} />} title={memoryCardSettingsCopy[settings.locale].title} subtitle={`${memoryCardSettingsCopy[settings.locale].front} · ${memoryCardSettingsCopy[settings.locale].back}`} onClick={() => onOpenSection('memory')} />
        <SettingsNavItem icon={<Volume2 size={22} />} title={copy.pronunciation} subtitle={copy.pronunciationHint} onClick={() => onOpenSection('pronunciation')} />
      </section>
      <section className="settings-nav-group" aria-label={t('账户与帮助', 'アカウントとヘルプ', 'Account and help')}>
        <h3>{t('账户与帮助', 'アカウントとヘルプ', 'Account and help')}</h3>
        <SettingsNavItem icon={<UserRound size={22} />} title={labels.account} subtitle={labels.currentUser} onClick={() => onOpenSection('account')} />
        <AiSettingsBlock labels={labels} />
        {onSearch ? <SettingsNavItem icon={<Search size={22} />} title={t('搜索所有学习内容', '学習内容を検索', 'Search all learning materials')} subtitle={t('词汇、语法、题目与记录', '語彙・文法・問題・記録', 'Vocabulary, grammar, questions and records')} onClick={onSearch} /> : null}
        <McpInspectorLink copy={copy} />
      </section>
    </div>
  );
}

function AiSettingsBlock({ labels }: { labels: Record<string, string> }) {
  return <section className="settings-ai-block" aria-label={labels.aboutTitle}>
    <a href="#/about">
      <img src="/study-companion.png" width="76" height="76" alt="" />
      <span><strong>{labels.aboutTitle}</strong><small>{labels.settingsAboutLink}</small></span>
      <ChevronRight size={20} aria-hidden="true" />
    </a>
  </section>;
}

function McpInspectorLink({ copy }: { copy: SettingsCopy }) {
  if (!import.meta.env.DEV || !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return null;
  return <NavigationCard icon={<Bug size={22} />} title={copy.mcpInspector} description={copy.mcpInspectorHint} href="/api/jlpt/mcp/inspector" />;
}

function SettingsNavItem({ icon, title, subtitle, onClick }: { icon: ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return <NavigationCard icon={icon} title={title} description={subtitle} onOpen={onClick} />;
}

function SettingsSectionContent({ section, copy, labels, settings, username, authToken, onUpdateSettings }: {
  section: SettingsSectionId;
  copy: SettingsCopy;
  labels: Record<string, string>;
  settings: DisplaySettings;
  username: string;
  authToken: string;
  onUpdateSettings: (settings: DisplaySettings) => void;
}) {
  if (section === 'display') {
    return (
      <>
        <SettingsRow title={labels.language}>
          <LanguageSelect value={settings.locale} onChange={(locale) => onUpdateSettings({ ...settings, locale })} />
        </SettingsRow>
        <SettingsRow title={labels.fontSize}>
          <div className="grid max-w-xl grid-cols-3 gap-2" role="group" aria-label={labels.fontSize}>
            <SegmentButton active={settings.fontSize === 'small'} onClick={() => onUpdateSettings({ ...settings, fontSize: 'small' })}>{labels.fontSizeSmall}</SegmentButton>
            <SegmentButton active={settings.fontSize === 'standard'} onClick={() => onUpdateSettings({ ...settings, fontSize: 'standard' })}>{labels.fontSizeStandard}</SegmentButton>
            <SegmentButton active={settings.fontSize === 'large'} onClick={() => onUpdateSettings({ ...settings, fontSize: 'large' })}>{labels.fontSizeLarge}</SegmentButton>
          </div>
        </SettingsRow>
        <SettingsRow title={copy.kanaDisplay}>
          <div className="settings-toggle-list">
            <Toggle checked={settings.showReviewRuby} label={labels.reviewRuby} onChange={(checked) => onUpdateSettings({ ...settings, showReviewRuby: checked })} />
            <Toggle checked={settings.showExplanationRuby} label={labels.explanationRuby} onChange={(checked) => onUpdateSettings({ ...settings, showExplanationRuby: checked })} />
          </div>
        </SettingsRow>
      </>
    );
  }
  if (section === 'practice') {
    return (
      <SettingsRow title={copy.feedbackTiming}>
        <div className="settings-feedback-options" role="group" aria-label={copy.feedbackTiming}>
          <SegmentButton active={settings.feedbackMode === 'immediate'} onClick={() => onUpdateSettings({ ...settings, feedbackMode: 'immediate' })}>{labels.feedbackModeImmediate}</SegmentButton>
          <SegmentButton active={settings.feedbackMode === 'batch'} onClick={() => onUpdateSettings({ ...settings, feedbackMode: 'batch' })}>{labels.feedbackModeBatch}</SegmentButton>
        </div>
      </SettingsRow>
    );
  }
  if (section === 'memory') {
    return <MemoryCardFieldSettings settings={settings} onUpdateSettings={onUpdateSettings} />;
  }
  if (section === 'pronunciation') {
    return <PronunciationSettings copy={copy} settings={settings} authToken={authToken} onUpdateSettings={onUpdateSettings} />;
  }
  return (
    <>
      <SettingsRow title={labels.account}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-[#68716b]">{labels.currentUser}</span>
          <span className="rounded-md bg-[#eef3ed] px-3 py-2 text-sm font-semibold text-[#31564c]">{username}</span>
        </div>
      </SettingsRow>

    </>
  );
}

function MemoryCardFieldSettings({ settings, onUpdateSettings }: { settings: DisplaySettings; onUpdateSettings: (settings: DisplaySettings) => void }) {
  const copy = memoryCardSettingsCopy[settings.locale];
  const update = (side: 'front' | 'back', field: MemoryCardField) => {
    const key = side === 'front' ? 'memoryCardFrontFields' : 'memoryCardBackFields';
    const current = settings[key];
    const selected = current.includes(field);
    if (selected && current.length === 1) return;
    const next = selected ? current.filter((item) => item !== field) : [...current, field];
    onUpdateSettings({ ...settings, [key]: next });
  };
  return (
    <div className="grid gap-4">
      <p className="m-0 text-sm leading-6 text-[#68716b]">{copy.body}</p>
      <Toggle checked={settings.memoryCardWordSpacing} label={{ 'zh-CN': '日语分词显示', 'zh-TW': '日語分詞顯示', ja: '日本語を単語ごとに表示', en: 'Space Japanese words' }[settings.locale]} onChange={(checked) => onUpdateSettings({ ...settings, memoryCardWordSpacing: checked })} />
      <p className="m-0 text-xs leading-5 text-[#7d837e]">{{ 'zh-CN': '在日语词语之间留出间隔，方便点词查询和选词。', 'zh-TW': '在日語詞語之間留出間隔，方便點詞查詢和選詞。', ja: '単語の間に余白を入れ、選択や辞書検索をしやすくします。', en: 'Add space between Japanese words for easier selection and lookup.' }[settings.locale]}</p>
      {(['front', 'back'] as const).map((side) => {
        const selected = side === 'front' ? settings.memoryCardFrontFields : settings.memoryCardBackFields;
        return (
          <details key={side} className="gentle-details"><summary>{side === 'front' ? copy.front : copy.back} · {selected.length}</summary><fieldset className="pb-4">
            <legend className="px-1 text-sm font-semibold text-[#46514c]">{side === 'front' ? copy.front : copy.back}</legend>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {configurableMemoryCardFields.map((field) => {
                const active = selected.includes(field);
                const lastSelected = active && selected.length === 1;
                return (
                  <button
                    key={field}
                    type="button"
                    aria-pressed={active}
                    disabled={lastSelected}
                    onClick={() => update(side, field)}
                    className={`min-h-11 rounded-md border px-2 py-2 text-left text-xs font-semibold disabled:cursor-not-allowed ${active ? 'border-[#24473f] bg-[#eef3ed] text-[#24473f]' : 'border-[#e1ddd5] bg-white text-[#68716b] hover:bg-[#f7f5ef]'}`}
                  >
                    <span aria-hidden="true" className="mr-1">{active ? '✓' : '○'}</span>{memoryCardFieldLabels[settings.locale][field]}
                  </button>
                );
              })}
            </div>
          </fieldset></details>
        );
      })}
      <p className="m-0 text-xs leading-5 text-[#7d837e]">{copy.exampleNote}</p>
    </div>
  );
}

function PronunciationSettings({ copy, settings, authToken, onUpdateSettings }: {
  copy: SettingsCopy; settings: DisplaySettings; authToken: string; onUpdateSettings: (settings: DisplaySettings) => void;
}) {
  const confirm = useConfirmation();
  const actionPending = useRef(false);
  const [providers, setProviders] = useState<TtsProviderDescriptor[]>([]);
  const [credentials, setCredentials] = useState<TtsCredentialStatus[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);
  const [testText, setTestText] = useState('こんにちは。日本語の発音をテストしています。');
  useEffect(() => () => stopSpeech(), []);
  const [testSuccess, setTestSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchTtsProviders(authToken), fetchTtsCredentials(authToken)]).then(([providerResult, credentialResult]) => {
      if (cancelled) return;
      setProviders(providerResult.providers);
      setCredentials(credentialResult.credentials);
    }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [authToken]);

  const statusFor = (providerId: string) => credentials.find((entry) => entry.provider === providerId);

  async function handleSave(provider: TtsProviderDescriptor) {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusyProvider(provider.id); setError(''); setTestSuccess(false);
    try {
      const result = await saveTtsCredential(authToken, provider.id, drafts[provider.id] ?? {});
      setCredentials(result.credentials);
      setDrafts((current) => ({ ...current, [provider.id]: {} }));
    } catch (err) { setError(err instanceof Error ? err.message : '保存失败，请重试。'); }
    finally { actionPending.current = false; setBusyProvider(null); }
  }

  async function handleTest(provider: TtsProviderDescriptor) {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusyProvider(provider.id); setTesting(true); setError(''); setTestSuccess(false);
    try {
      const draft = drafts[provider.id] ?? {};
      if (Object.values(draft).some((value) => value.trim())) {
        const result = await saveTtsCredential(authToken, provider.id, draft);
        setCredentials(result.credentials);
        setDrafts((current) => ({ ...current, [provider.id]: {} }));
      }
      await speak(testText, { provider: provider.id, token: authToken, ...settings.speech?.voices?.[provider.id], rate: settings.speech?.rate });
      setTestSuccess(true);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setError(copy.pronunciationTestFailed + (err instanceof Error ? err.message : String(err)));
    } finally {
      actionPending.current = false; setBusyProvider(null); setTesting(false);
    }
  }

  async function handleClear(provider: TtsProviderDescriptor) {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusyProvider(provider.id); setError(''); setTestSuccess(false);
    try {
      if (!(await confirm({ title: copy.pronunciationClearTitle, description: `${provider.name}: ${copy.pronunciationClearBody}`, confirmLabel: copy.pronunciationClear, cancelLabel: { 'zh-CN': '取消', ja: 'キャンセル', en: 'Cancel' }[settings.locale], danger: true }))) return;
      const result = await deleteTtsCredential(authToken, provider.id);
      setCredentials(result.credentials);
      setDrafts((current) => ({ ...current, [provider.id]: {} }));
    } catch (err) { setError(err instanceof Error ? err.message : '清除失败，请重试。'); }
    finally { actionPending.current = false; setBusyProvider(null); }
  }

  return (
    <>
      <SettingsRow title={copy.pronunciationProvider}>
        <select
          aria-label={copy.pronunciationProvider}
          disabled={busyProvider !== null}
          value={settings.ttsProvider}
          onChange={(event) => { setError(''); setTestSuccess(false); onUpdateSettings({ ...settings, ttsProvider: event.target.value as DisplaySettings['ttsProvider'] }); }}
          className="h-11 max-w-full rounded-md border border-[#c8bcae] bg-white px-3 text-sm font-semibold text-[#574f48]"
        >
          <option value="browser">{copy.pronunciationBrowser}</option>
          {settings.ttsProvider !== 'browser' && !providers.some((provider) => provider.id === settings.ttsProvider) ? <option value={settings.ttsProvider}>{settings.ttsProvider}</option> : null}
          {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
        </select>
      </SettingsRow>
      <SpeechPreferences settings={settings} token={authToken} provider={providers.find((entry) => entry.id === settings.ttsProvider)} credentialVersion={statusFor(settings.ttsProvider)?.updatedAt} onChange={(next) => { stopSpeech(); setTestSuccess(false); onUpdateSettings(next); }} />
      <label className="grid gap-2 py-3">{settings.locale === 'ja' ? '試聴テキスト' : settings.locale === 'en' ? 'Test text' : '试听文本'}<textarea className="rounded-md border border-[#c8d1c8] p-3" value={testText} maxLength={2000} disabled={testing} onChange={(event) => { setTestText(event.target.value); setTestSuccess(false); }} /></label>
      {testing && <button type="button" className="min-h-10 px-3 underline" onClick={stopSpeech}>{settings.locale === 'ja' ? '停止' : settings.locale === 'en' ? 'Stop' : '停止播放'}</button>}
      {settings.ttsProvider === 'browser' && <button type="button" disabled={testing || !testText.trim()} onClick={async () => { setTesting(true); setError(''); setTestSuccess(false); try { await speak(testText, { provider: 'browser', token: authToken, ...settings.speech?.voices?.browser, rate: settings.speech?.rate }); setTestSuccess(true); } catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(String(cause)); } finally { setTesting(false); } }} className="min-h-11 rounded-md border px-3">{testing ? copy.pronunciationTesting : copy.pronunciationTest}</button>}
      {providers.filter((provider) => provider.id === settings.ttsProvider).map((provider) => {
        const status = statusFor(provider.id);
        const draft = drafts[provider.id] ?? {};
        const hasDraft = Object.values(draft).some((value) => value.trim());
        const completeDraft = provider.credentialFields.every((field) => draft[field.key]?.trim());
        return (
          <SettingsRow key={provider.id} title={provider.name}>
            <div className="grid gap-2">
              <span className={`w-fit rounded-md px-2 py-1 text-xs font-semibold ${status?.configured ? 'bg-[#eef3ed] text-[#24473f]' : 'bg-[#f3efe6] text-[#8a7f6f]'}`}>
                {status?.configured ? copy.pronunciationConfigured : copy.pronunciationNotConfigured}
              </span>
              {provider.credentialFields.map((field) => (
                <input
                  key={field.key}
                  disabled={busyProvider !== null}
                  type={field.secret ? 'password' : 'text'}
                  placeholder={field.label}
                  aria-label={`${provider.name} ${field.label}`}
                  value={draft[field.key] ?? ''}
                  onChange={(event) => { setTestSuccess(false); setError(''); setDrafts((current) => ({ ...current, [provider.id]: { ...current[provider.id], [field.key]: event.target.value } })); }}
                  className="h-11 max-w-full rounded-md border border-[#c8bcae] bg-white px-3 text-sm"
                />
              ))}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busyProvider !== null || !Object.values(draft).some((value) => value.trim())} onClick={() => handleSave(provider)} className="min-h-11 rounded-md border border-[#24473f] bg-[#24473f] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {busyProvider === provider.id && !testing ? copy.pronunciationSaving : copy.pronunciationSave}
                </button>
                <button type="button" disabled={busyProvider !== null || !testText.trim() || (hasDraft ? !completeDraft : !status?.configured)} onClick={() => handleTest(provider)} className="min-h-11 rounded-md border border-[#24473f] bg-white px-3 py-2 text-sm font-semibold text-[#24473f] disabled:opacity-60">
                  {testing && busyProvider === provider.id ? copy.pronunciationTesting : hasDraft ? copy.pronunciationSaveAndTest : copy.pronunciationTest}
                </button>
                {status?.configured && (
                  <button type="button" disabled={busyProvider !== null} onClick={() => handleClear(provider)} className="min-h-11 rounded-md border border-[#d9d0c3] bg-white px-3 py-2 text-sm font-semibold text-[#4f5651] disabled:opacity-60">
                    {copy.pronunciationClear}
                  </button>
                )}
              </div>
            </div>
          </SettingsRow>
        );
      })}
      {testSuccess && <p role="status" className="text-sm text-[#24473f]">{copy.pronunciationTestSuccess}</p>}
      {error && <p role="alert" className="text-sm text-[#a43727]">{error}</p>}
    </>
  );
}

function SettingsRow({ title, children, desktopOnly = false }: { title: string; children: ReactNode; desktopOnly?: boolean }) {
  return (
    <div className={`settings-row${desktopOnly ? ' settings-row-extra' : ''}`}>
      <h3 className="text-sm font-semibold text-[#46514c]">{title}</h3>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function LanguageSelect({ value, onChange }: { value: Locale; onChange: (locale: Locale) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as Locale)} className="h-11 max-w-full rounded-md border border-[#c8bcae] bg-white px-3 text-sm font-semibold text-[#574f48]" aria-label="Language">
      <option value="zh-CN">简体中文</option>
      <option value="ja">日本語</option>
      <option value="en">English</option>
    </select>
  );
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="settings-toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="settings-switch" role="switch" />
    </label>
  );
}

function SegmentButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`min-h-11 min-w-0 rounded-md border px-3 py-2 text-sm font-semibold break-words ${active ? 'border-[#24473f] bg-[#24473f] text-white' : 'border-[#d9d0c3] bg-white text-[#4f5651] hover:bg-[#f6eee3]'}`}>
      {children}
    </button>
  );
}
