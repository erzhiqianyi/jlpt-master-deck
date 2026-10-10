import { SpeechPreferences } from './SpeechPreferences';
import './SettingsView.css';
import { useConfirmation } from '../../components/confirmation';
import { NavigationCard } from '../../components/NavigationCard';
import { BookOpen, ChevronRight, Languages, LogOut, PanelTop, Settings2, Sparkles, UserRound, Bug, Volume2, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createV3Client } from '../../v3/client';
import { FONT_SCALES, fontSizeOf, type CardTemplate, type KnowledgeKind, type V3Settings, type V3SettingsPatch } from '../../v3/types';
import { stopSpeech, speak, fetchTtsProviders, fetchTtsCredentials, saveTtsCredential, deleteTtsCredential, type TtsProviderDescriptor, type TtsCredentialStatus } from '../../lib/tts';
import type { Locale } from '../../types';

// 与服务端 languages 表一致（语言自称）
const EXPLANATION_LANGUAGES: Array<[string, string]> = [
  ['zh-Hans', '简体中文'], ['zh-Hant', '繁體中文'], ['en', 'English'], ['ja', '日本語'], ['ko', '한국어'], ['vi', 'Tiếng Việt'],
  ['id', 'Bahasa Indonesia'], ['th', 'ไทย'], ['my', 'မြန်မာ'], ['ne', 'नेपाली'], ['es', 'Español'], ['fr', 'Français'],
];

type SettingsViewProps = {
  labels: Record<string, string>;
  settings: V3Settings;
  username: string;
  authToken: string;
  activeSection?: string;
  onOpenSection?: (section: SettingsSectionId) => void;
  onSearch?: () => void;
  onLogout: () => void;
  onUpdateSettings: (patch: V3SettingsPatch) => void;
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
  const copy = settingsPageCopy[settings.uiLanguage];
  const activeSection = isSettingsSection(activeSectionValue) ? activeSectionValue : undefined;
  const onOpenSection = openSection ?? ((section: SettingsSectionId) => { window.location.hash = `#/settings/${section}`; });

  return (
    <section className="gentle-settings settings-template" aria-label={activeSection ? sectionTitle(activeSection, labels, copy, settings) : labels.settings}>
      <h2 className="sr-only">{activeSection ? sectionTitle(activeSection, labels, copy, settings) : labels.settings}</h2>
      {!activeSection ? <div className="settings-home-only"><SettingsProfileCard copy={copy} username={username} locale={settings.uiLanguage} /></div> : null}
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
}> = {
  'zh-CN': {
    title: '记忆卡内容',
    body: '按类别选择记忆卡模板，模板决定正面和背面显示的内容。当前卡片没有的字段会自动跳过。',
    front: '卡片正面',
    back: '卡片背面',
  },
  ja: {
    title: '記憶カードの内容',
    body: '種類ごとに記憶カードのテンプレートを選びます。テンプレートが表面と裏面の内容を決めます。データがない項目は自動的に省略されます。',
    front: 'カード表面',
    back: 'カード裏面',
  },
  en: {
    title: 'Memory card content',
    body: 'Choose a memory card template for each kind; the template decides what the front and back show. Missing fields are skipped automatically.',
    front: 'Card front',
    back: 'Card back',
  },
};

function isSettingsSection(value: string | undefined): value is SettingsSectionId {
  return value === 'display' || value === 'practice' || value === 'memory' || value === 'pronunciation' || value === 'account';
}

function sectionTitle(section: SettingsSectionId, labels: Record<string, string>, copy: SettingsCopy, settings: V3Settings) {
  if (section === 'display') return copy.displayAndReading;
  if (section === 'practice') return copy.practiceExperience;
  if (section === 'memory') return memoryCardSettingsCopy[settings.uiLanguage].title;
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

function SettingsHome({ copy, labels, settings, onOpenSection, onSearch }: { copy: SettingsCopy; labels: Record<string, string>; settings: V3Settings; onOpenSection: (section: SettingsSectionId) => void; onSearch?: () => void }) {
  const t = (zh: string, ja: string, en: string) => settings.uiLanguage === 'zh-CN' ? zh : settings.uiLanguage === 'ja' ? ja : en;
  return (
    <div className="settings-navigation">
      <section className="settings-nav-group" aria-label={t('学习偏好', '学習の設定', 'Learning preferences')}>
        <h3>{t('学习偏好', '学習の設定', 'Learning preferences')}</h3>
        <SettingsNavItem icon={<Settings2 size={22} />} title={copy.displayAndReading} subtitle={`${labels.language} · ${labels.fontSize} · ${copy.kanaDisplay}`} onClick={() => onOpenSection('display')} />
        <SettingsNavItem icon={<Sparkles size={22} />} title={copy.practiceExperience} subtitle={copy.feedbackTiming} onClick={() => onOpenSection('practice')} />
        <SettingsNavItem icon={<PanelTop size={22} />} title={memoryCardSettingsCopy[settings.uiLanguage].title} subtitle={`${memoryCardSettingsCopy[settings.uiLanguage].front} · ${memoryCardSettingsCopy[settings.uiLanguage].back}`} onClick={() => onOpenSection('memory')} />
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
  settings: V3Settings;
  username: string;
  authToken: string;
  onUpdateSettings: (patch: V3SettingsPatch) => void;
}) {
  if (section === 'display') {
    return (
      <>
        <SettingsRow title={labels.language}>
          <LanguageSelect value={settings.uiLanguage} onChange={(locale) => onUpdateSettings({ uiLanguage: locale })} />
        </SettingsRow>
        <SettingsRow title={labels.fontSize}>
          <div className="grid max-w-xl grid-cols-3 gap-2" role="group" aria-label={labels.fontSize}>
            <SegmentButton active={fontSizeOf(settings.fontScale) === 'small'} onClick={() => onUpdateSettings({ fontScale: FONT_SCALES.small })}>{labels.fontSizeSmall}</SegmentButton>
            <SegmentButton active={fontSizeOf(settings.fontScale) === 'standard'} onClick={() => onUpdateSettings({ fontScale: FONT_SCALES.standard })}>{labels.fontSizeStandard}</SegmentButton>
            <SegmentButton active={fontSizeOf(settings.fontScale) === 'large'} onClick={() => onUpdateSettings({ fontScale: FONT_SCALES.large })}>{labels.fontSizeLarge}</SegmentButton>
          </div>
        </SettingsRow>
        <SettingsRow title={copy.kanaDisplay}>
          <div className="settings-toggle-list">
            <Toggle checked={settings.showReviewRuby} label={labels.reviewRuby} onChange={(checked) => onUpdateSettings({ showReviewRuby: checked })} />
            <Toggle checked={settings.showExplanationRuby} label={labels.explanationRuby} onChange={(checked) => onUpdateSettings({ showExplanationRuby: checked })} />
            <Toggle checked={settings.showRomaji !== false} label={{ 'zh-CN': '读音旁显示罗马音', ja: '読みの横にローマ字を表示', en: 'Show romaji next to readings' }[settings.uiLanguage]} onChange={(checked) => onUpdateSettings({ showRomaji: checked })} />
          </div>
        </SettingsRow>
        <SettingsRow title={{ 'zh-CN': '释义与解析的语言', ja: '意味・解説の言語', en: 'Language for meanings and explanations' }[settings.uiLanguage]}>
          <div className="grid max-w-xl gap-2">
            <select className="settings-select" value={settings.explanationLanguage} onChange={(event) => onUpdateSettings({ explanationLanguage: event.target.value })}>
              {EXPLANATION_LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
            <p className="text-sm text-[#74646b]">{{ 'zh-CN': '没有该语言的译文时，依次回退到其他语言显示。可以让你的 AI 通过 MCP 补齐译文。', ja: '翻訳がない場合は他の言語で表示します。MCP 経由で AI に翻訳を補ってもらえます。', en: 'Missing translations fall back to another language. Your AI can fill them in through MCP.' }[settings.uiLanguage]}</p>
          </div>
        </SettingsRow>
      </>
    );
  }
  if (section === 'practice') {
    return (
      <>
      <SettingsRow title={{ 'zh-CN': '单词添加规则', ja: '単語追加のルール', en: 'Vocabulary save rules' }[settings.uiLanguage]}>
        <fieldset className="grid gap-3">
          <legend className="mb-3 text-sm">{{ 'zh-CN': '希望生成的 JLPT 語彙题型', ja: '生成する JLPT 語彙の問題形式', en: 'JLPT vocabulary question types to generate' }[settings.uiLanguage]}</legend>
          {([
            ['vocabulary-kanji-reading', '漢字読み（汉字读音）'], ['vocabulary-orthography', '表記（假名选汉字）'],
            ['vocabulary-word-formation', '語形成（构词）'], ['vocabulary-context', '文脈規定（语境填空）'],
            ['vocabulary-paraphrase', '言い換え類義（近义替换）'], ['vocabulary-usage', '用法（词语用法）'],
          ] as const).map(([kind, title]) => <label key={kind} className="flex min-h-11 items-center gap-3">
            <input type="checkbox" checked={settings.questionKinds.includes(kind)} onChange={(event) => {
              const selected = event.target.checked ? [...settings.questionKinds, kind] : settings.questionKinds.filter((entry) => entry !== kind);
              onUpdateSettings({ questionKinds: selected });
            }} />
            <span>{settings.uiLanguage === 'zh-CN' ? title : title.split('（')[0]}</span>
          </label>)}
        </fieldset>
        <p className="text-xs leading-5 text-[#7d837e]">{{ 'zh-CN': 'MCP 添加或更新单词时，每个勾选题型至少须提供一道完整题目；全部不选则不校验。', ja: 'MCP で単語を保存する際、選択した形式ごとに完全な問題が1問以上必要です。未選択なら検証しません。', en: 'MCP word saves require at least one complete question for each selected type. Select none to skip validation.' }[settings.uiLanguage]}</p>
      </SettingsRow>
      <DailyPracticeSourceSettings settings={settings} onChange={onUpdateSettings} />
      <SettingsRow title={copy.feedbackTiming}>
        <div className="settings-feedback-options" role="group" aria-label={copy.feedbackTiming}>
          <SegmentButton active={settings.feedbackMode === 'immediate'} onClick={() => onUpdateSettings({ feedbackMode: 'immediate' })}>{labels.feedbackModeImmediate}</SegmentButton>
          <SegmentButton active={settings.feedbackMode === 'batch'} onClick={() => onUpdateSettings({ feedbackMode: 'batch' })}>{labels.feedbackModeBatch}</SegmentButton>
        </div>
      </SettingsRow>
      <SettingsRow title={{ 'zh-CN': '答题后切换', ja: '解答後の移動', en: 'After selecting an answer' }[settings.uiLanguage]}>
        <div className="settings-feedback-options" role="group" aria-label={{ 'zh-CN': '答题后切换', ja: '解答後の移動', en: 'After selecting an answer' }[settings.uiLanguage]}>
          <SegmentButton active={settings.practiceNavigation !== 'manual'} onClick={() => onUpdateSettings({ practiceNavigation: 'auto' })}>{{ 'zh-CN': '自动跳转', ja: '自動で移動', en: 'Automatic' }[settings.uiLanguage]}</SegmentButton>
          <SegmentButton active={settings.practiceNavigation === 'manual'} onClick={() => onUpdateSettings({ practiceNavigation: 'manual' })}>{{ 'zh-CN': '手动切换', ja: '手動で移動', en: 'Manual' }[settings.uiLanguage]}</SegmentButton>
        </div>
        {settings.practiceNavigation !== 'manual' && <label className="flex min-h-11 items-center gap-3 mt-3">
          <span>{{ 'zh-CN': '自动跳转等待（秒）', ja: '移動までの待ち時間（秒）', en: 'Delay before advancing (seconds)' }[settings.uiLanguage]}</span>
          <input type="number" min={0} max={10} step={0.1} key={settings.autoAdvanceSeconds} defaultValue={settings.autoAdvanceSeconds} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} onBlur={(event) => {
            if (event.target.value === '' || !Number.isFinite(event.target.valueAsNumber)) return;
            onUpdateSettings({ autoAdvanceSeconds: Math.round(Math.max(0, Math.min(10, event.target.valueAsNumber)) * 10) / 10 });
          }} />
        </label>}
        <p className="text-xs leading-5 text-[#7d837e]">{{ 'zh-CN': '用于整组反馈模式。0 秒表示立即跳转；逐题反馈模式下，阅读解析后手动切换。', ja: 'まとめて答え合わせする場合に適用。0秒ならすぐ移動します。1問ずつ答え合わせする場合は、解説を読んで手動で移動します。', en: 'Applies when reviewing at the end. Set 0 for immediate navigation. With per-question feedback, advance manually after reading the explanation.' }[settings.uiLanguage]}</p>
      </SettingsRow>
      </>
    );
  }
  if (section === 'memory') {
    return <MemoryCardFieldSettings settings={settings} authToken={authToken} onUpdateSettings={onUpdateSettings} />;
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

const TEMPLATE_FIELD_LABELS: Record<Locale, Record<string, string>> = {
  'zh-CN': { expression: '词条', reading: '读音', romaji: '罗马音', meaning: '释义', meaning_ja: '日语释义', paraphrase: '言い換え', example: '例句', memory_point: '记忆要点', image: '记忆图', pattern: '句型', note: '补充' },
  ja: { expression: '見出し語', reading: '読み', romaji: 'ローマ字', meaning: '意味', meaning_ja: '日本語の意味', paraphrase: '言い換え', example: '例文', memory_point: '覚え方', image: '記憶イメージ', pattern: '文型', note: '補足' },
  en: { expression: 'Entry', reading: 'Reading', romaji: 'Romaji', meaning: 'Meaning', meaning_ja: 'Japanese definition', paraphrase: 'Paraphrase', example: 'Example', memory_point: 'Memory point', image: 'Memory image', pattern: 'Pattern', note: 'Note' },
};
const TEMPLATE_KIND_LABELS: Record<Locale, Record<KnowledgeKind, string>> = {
  'zh-CN': { word: '单词', grammar: '语法', name: '人名' }, ja: { word: '単語', grammar: '文法', name: '人名' }, en: { word: 'Words', grammar: 'Grammar', name: 'Names' },
};

/** 記憶カードは種類（単語・文法・人名）ごとに模板を選ぶ。保存先は v3。 */
function MemoryCardFieldSettings({ settings, authToken, onUpdateSettings }: { settings: V3Settings; authToken?: string; onUpdateSettings: (patch: V3SettingsPatch) => void }) {
  const copy = memoryCardSettingsCopy[settings.uiLanguage];
  const client = useMemo(() => (authToken ? createV3Client(authToken) : null), [authToken]);
  const [templates, setTemplates] = useState<CardTemplate[]>([]);
  const [chosen, setChosen] = useState<Record<KnowledgeKind, string | null> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!client) return;
    Promise.all([client.cardTemplates(), client.settings()])
      .then(([list, current]) => { setTemplates(list); setChosen(current.cardTemplates); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [client]);
  const choose = (kind: KnowledgeKind, code: string) => {
    if (!client) return;
    setChosen((current) => (current ? { ...current, [kind]: code } : current));
    client.updateSettings({ cardTemplates: { [kind]: code } })
      .then((next) => { setChosen(next.cardTemplates); onUpdateSettings({ cardTemplates: next.cardTemplates }); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };
  const fieldText = (fields: CardTemplate['front']) => fields.map((f) => TEMPLATE_FIELD_LABELS[settings.uiLanguage][f.field] ?? f.field).join(' · ');
  return (
    <div className="grid gap-4">
      <p className="m-0 text-sm leading-6 text-[#68716b]">{copy.body}</p>
      <Toggle checked={settings.cardWordSpacing} label={{ 'zh-CN': '日语分词显示', 'zh-TW': '日語分詞顯示', ja: '日本語を単語ごとに表示', en: 'Space Japanese words' }[settings.uiLanguage]} onChange={(checked) => onUpdateSettings({ cardWordSpacing: checked })} />
      <p className="m-0 text-xs leading-5 text-[#7d837e]">{{ 'zh-CN': '在日语词语之间留出间隔，方便点词查询和选词。', 'zh-TW': '在日語詞語之間留出間隔，方便點詞查詢和選詞。', ja: '単語の間に余白を入れ、選択や辞書検索をしやすくします。', en: 'Add space between Japanese words for easier selection and lookup.' }[settings.uiLanguage]}</p>
      {error ? <p className="m-0 text-sm font-semibold text-[#8f3d2e]">{error}</p> : null}
      {(['word', 'grammar', 'name'] as const).map((kind) => (
        <fieldset key={kind} className="grid gap-2">
          <legend className="px-1 text-sm font-semibold text-[#46514c]">{TEMPLATE_KIND_LABELS[settings.uiLanguage][kind]}</legend>
          {templates.filter((t) => t.kind === kind).map((template) => {
            const active = chosen?.[kind] === template.code;
            return (
              <button key={template.code} type="button" aria-pressed={active} onClick={() => choose(kind, template.code)}
                className={`grid gap-1 rounded-md border px-3 py-2 text-left ${active ? 'border-[#24473f] bg-[#eef3ed] text-[#24473f]' : 'border-[#e1ddd5] bg-white text-[#46514c] hover:bg-[#f7f5ef]'}`}>
                <span className="text-sm font-bold"><span aria-hidden="true" className="mr-1">{active ? '✓' : '○'}</span>{template.name?.text ?? template.code}</span>
                {template.description ? <span className="text-xs leading-5 text-[#68716b]">{template.description.text}</span> : null}
                <span className="text-xs leading-5 text-[#7d837e]">{copy.front}：{fieldText(template.front)}　{copy.back}：{fieldText(template.back)}</span>
              </button>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

function PronunciationSettings({ copy, settings, authToken, onUpdateSettings }: {
  copy: SettingsCopy; settings: V3Settings; authToken: string; onUpdateSettings: (patch: V3SettingsPatch) => void;
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
      await speak(testText, { provider: provider.id, token: authToken, ...settings.speech.voices[provider.id], rate: settings.speech.rate });
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
      if (!(await confirm({ title: copy.pronunciationClearTitle, description: `${provider.name}: ${copy.pronunciationClearBody}`, confirmLabel: copy.pronunciationClear, cancelLabel: { 'zh-CN': '取消', ja: 'キャンセル', en: 'Cancel' }[settings.uiLanguage], danger: true }))) return;
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
          value={settings.speech.provider}
          onChange={(event) => { setError(''); setTestSuccess(false); onUpdateSettings({ speech: { provider: event.target.value } }); }}
          className="h-11 max-w-full rounded-md border border-[#c8bcae] bg-white px-3 text-sm font-semibold text-[#574f48]"
        >
          <option value="browser">{copy.pronunciationBrowser}</option>
          {settings.speech.provider !== 'browser' && !providers.some((provider) => provider.id === settings.speech.provider) ? <option value={settings.speech.provider}>{settings.speech.provider}</option> : null}
          {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
        </select>
      </SettingsRow>
      <SpeechPreferences settings={settings} token={authToken} provider={providers.find((entry) => entry.id === settings.speech.provider)} credentialVersion={statusFor(settings.speech.provider)?.updatedAt} onChange={(next) => { stopSpeech(); setTestSuccess(false); onUpdateSettings(next); }} />
      <label className="grid gap-2 py-3">{settings.uiLanguage === 'ja' ? '試聴テキスト' : settings.uiLanguage === 'en' ? 'Test text' : '试听文本'}<textarea className="rounded-md border border-[#c8d1c8] p-3" value={testText} maxLength={2000} disabled={testing} onChange={(event) => { setTestText(event.target.value); setTestSuccess(false); }} /></label>
      {testing && <button type="button" className="min-h-10 px-3 underline" onClick={stopSpeech}>{settings.uiLanguage === 'ja' ? '停止' : settings.uiLanguage === 'en' ? 'Stop' : '停止播放'}</button>}
      {settings.speech.provider === 'browser' && <button type="button" disabled={testing || !testText.trim()} onClick={async () => { setTesting(true); setError(''); setTestSuccess(false); try { await speak(testText, { provider: 'browser', token: authToken, ...settings.speech?.voices?.browser, rate: settings.speech?.rate }); setTestSuccess(true); } catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(String(cause)); } finally { setTesting(false); } }} className="min-h-11 rounded-md border px-3">{testing ? copy.pronunciationTesting : copy.pronunciationTest}</button>}
      {providers.filter((provider) => provider.id === settings.speech.provider).map((provider) => {
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

function DailyPracticeSourceSettings({ settings, onChange }: { settings: V3Settings; onChange: (patch: V3SettingsPatch) => void }) {
  const source = settings.dailySource;
  const value = { ...source, window: source.window ?? 'previous_day', hours: source.hours ?? 24, timeZone: source.timeZone ?? 'Asia/Tokyo', runAt: source.runAt ?? '07:00' };
  const update = (patch: V3SettingsPatch['dailySource']) => onChange({ dailySource: patch });
  const copy = settings.uiLanguage === 'ja' ? ['毎日の練習のデータ源', '解答履歴', 'カード復習', '前日', '直近の時間', '時間数', 'タイムゾーン', 'AI 実行時刻', '自分の AI クライアントで時刻とタイムゾーンを設定してください。MCP は設定とデータを提供します。カード復習は既存の問題のみ使い、問題のないカードは省きます。', '忘れた', '難しい', '覚えている', '簡単'] : settings.uiLanguage === 'en' ? ['Daily practice sources', 'Answer history', 'Card reviews', 'Previous day', 'Recent hours', 'Hours', 'Time zone', 'AI run time', 'Configure scheduling in your own AI client using this time and zone. MCP supplies preferences and data. Card reviews reuse existing questions and skip cards without questions.', 'Forgot', 'Hard', 'Remembered', 'Easy'] : ['每日练习的数据来源', '答题记录', '卡片复习记录', '前一天', '过去若干小时', '小时数', '时区', 'AI 执行时间', '请在自己的 AI 客户端按此时间和时区配置定时任务。MCP 提供设置与数据。卡片复习只复用自带题目，没有题库的卡片跳过。', '忘记', '困难', '记得', '轻松'];
  return <SettingsRow title={copy[0]}><div className="grid gap-3">
    <Toggle label={copy[1]} checked={value.answers} onChange={answers => update({ answers })} />
    <Toggle label={copy[2]} checked={value.cardReviews} onChange={cardReviews => update({ cardReviews })} />
    <div className="grid grid-cols-2 gap-3">{(['forgot','hard','remembered','easy'] as const).map((rating,i) => <label key={rating} className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={!value.cardReviews} checked={value.ratings.includes(rating)} onChange={e => update({ ratings: e.target.checked ? [...value.ratings, rating] : value.ratings.filter(r => r !== rating) })} /> {copy[i+9]}</label>)}</div>
    <select className="min-h-11 max-w-full rounded-md border border-[#c8bcae] bg-white px-3" aria-label={copy[0]} value={value.window} onChange={e => update({ window: e.target.value })}><option value="previous_day">{copy[3]}</option><option value="last_hours">{copy[4]}</option></select>
    {value.window === 'last_hours' && <label>{copy[5]} <input className="min-h-11 w-24 rounded-md border border-[#c8bcae] bg-white px-3" type="number" min={1} max={720} value={value.hours} onChange={e => update({ hours: Math.max(1, Math.min(720, Number(e.target.value) || 24)) })} /></label>}
    <label>{copy[6]} <select className="min-h-11 w-full max-w-full rounded-md border border-[#c8bcae] bg-white px-3" value={value.timeZone} onChange={e => update({ timeZone: e.target.value })}>{[...new Set([value.timeZone, 'Asia/Tokyo', ...Intl.supportedValuesOf('timeZone')])].map(zone => <option key={zone}>{zone}</option>)}</select></label>
    <label>{copy[7]} <input className="min-h-11 rounded-md border border-[#c8bcae] bg-white px-3" type="time" value={value.runAt} onChange={e => update({ runAt: e.target.value })} /></label>
    <p className="text-xs leading-5 text-[#7d837e]">{copy[8]}</p>
  </div></SettingsRow>;
}
