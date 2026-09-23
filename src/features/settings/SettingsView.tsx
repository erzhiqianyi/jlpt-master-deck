import { NavigationCard } from '../../components/NavigationCard';
import { BookOpen, ChevronRight, Languages, LogOut, MessageSquareText, PanelTop, Settings2, Sparkles, UserRound, Bot } from 'lucide-react';
import type { ReactNode } from 'react';
import { configurableMemoryCardFields, memoryCardFieldLabels, type MemoryCardField } from '../../domain/memoryCards';
import type { DisplaySettings, Locale } from '../../types';

type SettingsViewProps = {
  labels: Record<string, string>;
  settings: DisplaySettings;
  username: string;
  authToken: string;
  activeSection?: string;
  onOpenSection?: (section: SettingsSectionId) => void;
  onLogout: () => void;
  onUpdateSettings: (settings: DisplaySettings) => void;
};

type SettingsSectionId = 'display' | 'practice' | 'memory' | 'account';

type SettingsCopy = {
  displayAndReading: string;
  kanaDisplay: string;
  practiceExperience: string;
  feedbackTiming: string;
  profileEdit: string;
  connectedAgents: string;
  connectedAgentsHint: string;
  learningLanguage: string;
  nativeLanguage: string;
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
    nativeLanguage: '母语 中文',
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
    nativeLanguage: '母語 中国語',
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
    nativeLanguage: 'Native Chinese',
  },
};

export function SettingsView({ labels, settings, username, authToken, activeSection: activeSectionValue, onOpenSection: openSection, onLogout, onUpdateSettings }: SettingsViewProps) {
  const copy = settingsPageCopy[settings.locale];
  const activeSection = isSettingsSection(activeSectionValue) ? activeSectionValue : undefined;
  const onOpenSection = openSection ?? (() => undefined);
  const profileCard = <SettingsProfileCard copy={copy} username={username} />;

  return (
    <section className="gentle-settings mobile-settings-page mobile-page-surface mx-auto min-w-0 max-w-3xl rounded-lg border border-[#dfe5dc] bg-[#fbfcf8] p-5 shadow-sm md:max-w-4xl md:border-0 md:bg-transparent md:p-0 md:shadow-none">
      <h2 className={`settings-root-title text-2xl font-semibold text-[#27312c] md:hidden${activeSection ? ' settings-detail-title' : ''}`}>{activeSection ? sectionTitle(activeSection, labels, copy, settings) : labels.settings}</h2>

      {!activeSection ? <div className="settings-home-only md:hidden">{profileCard}</div> : null}
      <div className="settings-mobile-detail md:hidden">
        {activeSection ? (
          <section className="settings-section-card settings-detail-card">
            <SettingsSectionContent section={activeSection} copy={copy} labels={labels} settings={settings} username={username} authToken={authToken} onUpdateSettings={onUpdateSettings} />
          </section>
        ) : (
          <SettingsHome copy={copy} labels={labels} settings={settings} onOpenSection={onOpenSection} />
        )}
      </div>
      {/* Desktop: every section on one page, top to bottom. No sub-pages. */}
      <div className="settings-desktop-stack hidden md:grid">
        {settingsSections.map((section) => (
          <SettingsSection key={section} id={`settings-${section}`} title={sectionTitle(section, labels, copy, settings)} icon={sectionIcon(section)}>
            <SettingsSectionContent section={section} copy={copy} labels={labels} settings={settings} username={username} authToken={authToken} onUpdateSettings={onUpdateSettings} />
          </SettingsSection>
        ))}
        <div className="settings-desktop-footer">
          <span>{labels.currentUser}: <strong>{username}</strong></span>
          <button type="button" onClick={onLogout} className="settings-logout-button"><LogOut size={18} />{labels.logout}</button>
        </div>
      </div>

      {!activeSection ? <div className="settings-logout-area md:hidden">
        <button type="button" onClick={onLogout} className="settings-logout-button">
          <LogOut size={18} />{labels.logout}
        </button>
      </div> : null}
    </section>
  );
}

const settingsSections: SettingsSectionId[] = ['display', 'practice', 'memory', 'account'];

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
  return value === 'display' || value === 'practice' || value === 'memory' || value === 'account';
}

function sectionTitle(section: SettingsSectionId, labels: Record<string, string>, copy: SettingsCopy, settings: DisplaySettings) {
  if (section === 'display') return copy.displayAndReading;
  if (section === 'practice') return copy.practiceExperience;
  if (section === 'memory') return memoryCardSettingsCopy[settings.locale].title;
  return labels.account;
}

function sectionIcon(section: SettingsSectionId, size = 22) {
  if (section === 'display') return <Settings2 size={size} />;
  if (section === 'practice') return <Sparkles size={size} />;
  if (section === 'memory') return <PanelTop size={size} />;
  return <MessageSquareText size={size} />;
}

function SettingsProfileCard({ copy, username }: { copy: SettingsCopy; username: string }) {
  return (
    <section className="settings-profile-card" aria-label={copy.profileEdit}>
      <div className="settings-avatar" aria-hidden="true">
        <UserRound size={42} />
      </div>
      <div className="min-w-0">
        <h3>{username}</h3>
        <p>{copy.profileEdit}</p>
      </div>
      <ChevronRight className="settings-profile-chevron" size={24} aria-hidden="true" />
      <div className="settings-language-pair">
        <span><BookOpen size={18} />{copy.learningLanguage}</span>
        <ChevronRight size={18} aria-hidden="true" />
        <span><Languages size={18} />{copy.nativeLanguage}</span>
      </div>
    </section>
  );
}

function SettingsHome({ copy, labels, settings, onOpenSection }: { copy: SettingsCopy; labels: Record<string, string>; settings: DisplaySettings; onOpenSection: (section: SettingsSectionId) => void }) {
  return (
    <div className="navigation-grid settings-navigation">
      <SettingsNavItem icon={<Settings2 size={22} />} title={copy.displayAndReading} subtitle={`${labels.language} · ${labels.fontSize} · ${copy.kanaDisplay}`} onClick={() => onOpenSection('display')} />
      <SettingsNavItem icon={<Sparkles size={22} />} title={copy.practiceExperience} subtitle={copy.feedbackTiming} onClick={() => onOpenSection('practice')} />
      <SettingsNavItem icon={<PanelTop size={22} />} title={memoryCardSettingsCopy[settings.locale].title} subtitle={`${memoryCardSettingsCopy[settings.locale].front} · ${memoryCardSettingsCopy[settings.locale].back}`} onClick={() => onOpenSection('memory')} />
      <SettingsNavItem icon={<MessageSquareText size={22} />} title={labels.account} subtitle={labels.currentUser} onClick={() => onOpenSection('account')} />
      <NavigationCard icon={<Bot size={22} />} title={labels.aboutTitle} description={labels.settingsAboutBody} href="#/about" />
    </div>
  );
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
          <div className="grid gap-2 sm:grid-cols-2">
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
        <div className="grid gap-2 sm:grid-cols-2">
          <SegmentButton active={settings.feedbackMode === 'immediate'} onClick={() => onUpdateSettings({ ...settings, feedbackMode: 'immediate' })}>{labels.feedbackModeImmediate}</SegmentButton>
          <SegmentButton active={settings.feedbackMode === 'batch'} onClick={() => onUpdateSettings({ ...settings, feedbackMode: 'batch' })}>{labels.feedbackModeBatch}</SegmentButton>
        </div>
      </SettingsRow>
    );
  }
  if (section === 'memory') {
    return <MemoryCardFieldSettings settings={settings} onUpdateSettings={onUpdateSettings} />;
  }
  return (
    <>
      <SettingsRow title={labels.account}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-[#68716b]">{labels.currentUser}</span>
          <span className="rounded-md bg-[#eef3ed] px-3 py-2 text-sm font-semibold text-[#31564c]">{username}</span>
        </div>
      </SettingsRow>
      <SettingsRow title={labels.aboutTitle}>
        <p className="text-sm leading-6 text-[#68716b]">{labels.settingsAboutBody}</p>
        <a href="#/about" className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-[#31564c] hover:underline">
          {labels.settingsAboutLink} →
        </a>
      </SettingsRow>
    </>
  );
}

function SettingsSection({ id, title, icon, children }: { id?: string; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="settings-section-card">
      <h3><span>{icon}</span>{title}</h3>
      <div className="settings-section-body">
        {children}
      </div>
    </section>
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
                    className={`min-h-10 rounded-md border px-2 py-2 text-left text-xs font-semibold disabled:cursor-not-allowed ${active ? 'border-[#24473f] bg-[#eef3ed] text-[#24473f]' : 'border-[#e1ddd5] bg-white text-[#68716b] hover:bg-[#f7f5ef]'}`}
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

function SettingsRow({ title, children, desktopOnly = false }: { title: string; children: ReactNode; desktopOnly?: boolean }) {
  return (
    <div className={`gap-3 py-4 md:grid md:grid-cols-[180px_minmax(0,1fr)] md:items-start ${desktopOnly ? 'hidden md:grid' : 'grid'}`}>
      <h3 className="text-sm font-semibold text-[#46514c]">{title}</h3>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function LanguageSelect({ value, onChange }: { value: Locale; onChange: (locale: Locale) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as Locale)} className="h-11 rounded-md border border-[#c8bcae] bg-white px-3 text-sm font-semibold text-[#574f48]" aria-label="Language">
      <option value="zh-CN">简体中文</option>
      <option value="ja">日本語</option>
      <option value="en">English</option>
    </select>
  );
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-[#d9d0c3] bg-white px-3 py-2 text-sm font-semibold text-[#4f5651]">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-[#24473f]" />
    </label>
  );
}

function SegmentButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`min-h-10 min-w-0 rounded-md border px-3 py-2 text-sm font-semibold break-words ${active ? 'border-[#24473f] bg-[#24473f] text-white' : 'border-[#d9d0c3] bg-white text-[#4f5651] hover:bg-[#f6eee3]'}`}>
      {children}
    </button>
  );
}
