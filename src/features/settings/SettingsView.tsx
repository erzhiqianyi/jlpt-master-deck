import { BookOpen, ChevronRight, Languages, LogOut, MessageSquareText, PanelTop, Settings2, Sparkles, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { configurableMemoryCardFields, type MemoryCardField } from '../../domain/memoryCards';
import type { DisplaySettings, Locale } from '../../types';

type SettingsViewProps = {
  labels: Record<string, string>;
  settings: DisplaySettings;
  username: string;
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
    learningLanguage: '学习 日本语',
    nativeLanguage: '母语 中文',
  },
  ja: {
    displayAndReading: '表示と読みやすさ',
    kanaDisplay: 'ふりがな表示',
    practiceExperience: '練習体験',
    feedbackTiming: 'フィードバックのタイミング',
    profileEdit: '学習プロフィール',
    learningLanguage: '学習 日本語',
    nativeLanguage: '母語 中国語',
  },
  en: {
    displayAndReading: 'Display and Reading',
    kanaDisplay: 'Kana Display',
    practiceExperience: 'Practice Experience',
    feedbackTiming: 'Feedback Timing',
    profileEdit: 'Learning Profile',
    learningLanguage: 'Learning Japanese',
    nativeLanguage: 'Native Chinese',
  },
};

export function SettingsView({ labels, settings, username, activeSection: activeSectionValue, onOpenSection: openSection, onLogout, onUpdateSettings }: SettingsViewProps) {
  const copy = settingsPageCopy[settings.locale];
  const activeSection = isSettingsSection(activeSectionValue) ? activeSectionValue : undefined;
  const onOpenSection = openSection ?? (() => undefined);
  const profileCard = <SettingsProfileCard copy={copy} username={username} />;

  return (
    <section className="gentle-settings mobile-settings-page mobile-page-surface mx-auto max-w-3xl min-w-0 rounded-lg border border-[#dfe5dc] bg-[#fbfcf8] p-5 shadow-sm md:p-6">
      <h2 className={`settings-root-title text-2xl font-semibold text-[#27312c]${activeSection ? ' settings-detail-title' : ''}`}>{activeSection ? sectionTitle(activeSection, labels, copy, settings) : labels.settings}</h2>

      {!activeSection ? <div className="settings-home-only md:hidden">{profileCard}</div> : null}
      <div className="settings-mobile-detail md:hidden">
        {activeSection ? (
          <section className="settings-section-card settings-detail-card">
            <SettingsSectionContent section={activeSection} copy={copy} labels={labels} settings={settings} username={username} onUpdateSettings={onUpdateSettings} />
          </section>
        ) : (
          <SettingsHome copy={copy} labels={labels} settings={settings} onOpenSection={onOpenSection} />
        )}
      </div>
      <div className="settings-desktop-content hidden md:block">
        {!activeSection ? (
          <>
            {profileCard}
            <SettingsHome copy={copy} labels={labels} settings={settings} onOpenSection={onOpenSection} />
          </>
        ) : (
          <SettingsSection title={sectionTitle(activeSection, labels, copy, settings)} icon={sectionIcon(activeSection)}>
            <SettingsSectionContent section={activeSection} copy={copy} labels={labels} settings={settings} username={username} onUpdateSettings={onUpdateSettings} />
          </SettingsSection>
        )}
      </div>

      {!activeSection ? <div className="settings-logout-area">
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
  fieldLabels: Record<MemoryCardField, string>;
}> = {
  'zh-CN': {
    title: '记忆卡内容',
    body: '分别选择正面和背面显示的学习内容。当前卡片没有的字段会自动跳过。',
    front: '卡片正面',
    back: '卡片背面',
    exampleNote: '例句固定显示在背面，不需要在这里选择。',
    fieldLabels: {
      original: '原词 / 语法', reading: '读音', jlpt_level: 'JLPT 等级', part_of_speech: '词性',
      meaning: '释义', meaning_ja: '日文释义', paraphrase_ja: '日文换言', core_memory: '记忆点', explanation_zh: '详细解析',
      analysis: '补充分析', grammar_forms: '接续形式', grammar_features: '语法特征', base_form: '基本形', conjugations: '活用',
      collocations: '常用搭配', comparisons: '比较辨析', usage_register: '使用语域', exam_register_zh: '考试提示', everyday_alternatives: '日常替代表达',
      notes: '备注', tags: '标签', source_grammar_point: '来源语法点', source_chat_summary: '学习来源摘要',
    },
  },
  ja: {
    title: '記憶カードの内容',
    body: '表面と裏面に表示する学習内容を個別に選択します。データがない項目は自動的に省略されます。',
    front: 'カード表面',
    back: 'カード裏面',
    exampleNote: '例文は常に裏面に表示されるため、ここで選択する必要はありません。',
    fieldLabels: {
      original: '語句 / 文法', reading: '読み方', jlpt_level: 'JLPT レベル', part_of_speech: '品詞',
      meaning: '意味', meaning_ja: '日本語の意味', paraphrase_ja: '日本語の言い換え', core_memory: '記憶ポイント', explanation_zh: '詳しい解説',
      analysis: '補足分析', grammar_forms: '接続形式', grammar_features: '文法の特徴', base_form: '基本形', conjugations: '活用',
      collocations: 'よく使う組み合わせ', comparisons: '比較・使い分け', usage_register: '使用場面', exam_register_zh: '試験ポイント', everyday_alternatives: '日常表現',
      notes: 'メモ', tags: 'タグ', source_grammar_point: '出典文法項目', source_chat_summary: '学習元の要約',
    },
  },
  en: {
    title: 'Memory card content',
    body: 'Choose learning fields for the front and back independently. Missing fields are skipped automatically.',
    front: 'Card front',
    back: 'Card back',
    exampleNote: 'Example sentences always appear on the back and do not need to be selected here.',
    fieldLabels: {
      original: 'Word / grammar', reading: 'Reading', jlpt_level: 'JLPT level', part_of_speech: 'Part of speech',
      meaning: 'Meaning', meaning_ja: 'Japanese definition', paraphrase_ja: 'Japanese paraphrase', core_memory: 'Memory point', explanation_zh: 'Detailed explanation',
      analysis: 'Additional analysis', grammar_forms: 'Connection forms', grammar_features: 'Grammar features', base_form: 'Base form', conjugations: 'Conjugations',
      collocations: 'Collocations', comparisons: 'Comparisons', usage_register: 'Usage register', exam_register_zh: 'Exam tip', everyday_alternatives: 'Everyday alternatives',
      notes: 'Notes', tags: 'Tags', source_grammar_point: 'Source grammar point', source_chat_summary: 'Learning source summary',
    },
  },
};

function isSettingsSection(value: string | undefined): value is SettingsSectionId {
  return value === 'display' || value === 'practice' || value === 'memory' || value === 'account';
}

function sectionTitle(section: SettingsSectionId, labels: Record<string, string>, copy: SettingsCopy, settings: DisplaySettings) {
  if (section === 'display') return copy.displayAndReading;
  if (section === 'practice') return copy.practiceExperience;
  if (section === 'memory') return memoryCardSettingsCopy[settings.locale].title;
  return `${labels.account} / ${labels.aboutTitle}`;
}

function sectionIcon(section: SettingsSectionId) {
  if (section === 'display') return <Settings2 size={22} />;
  if (section === 'practice') return <Sparkles size={22} />;
  if (section === 'memory') return <PanelTop size={22} />;
  return <MessageSquareText size={22} />;
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
    <div className="settings-section-list mt-5">
      <SettingsNavItem icon={<Settings2 size={22} />} title={copy.displayAndReading} subtitle={`${labels.language} · ${labels.fontSize} · ${copy.kanaDisplay}`} onClick={() => onOpenSection('display')} />
      <SettingsNavItem icon={<Sparkles size={22} />} title={copy.practiceExperience} subtitle={copy.feedbackTiming} onClick={() => onOpenSection('practice')} />
      <SettingsNavItem icon={<PanelTop size={22} />} title={memoryCardSettingsCopy[settings.locale].title} subtitle={`${memoryCardSettingsCopy[settings.locale].front} · ${memoryCardSettingsCopy[settings.locale].back}`} onClick={() => onOpenSection('memory')} />
      <SettingsNavItem icon={<MessageSquareText size={22} />} title={`${labels.account} / ${labels.aboutTitle}`} subtitle={labels.currentUser} onClick={() => onOpenSection('account')} />
    </div>
  );
}

function SettingsNavItem({ icon, title, subtitle, onClick }: { icon: ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button type="button" className="settings-nav-item" onClick={onClick}>
      <span className="settings-nav-icon">{icon}</span>
      <span className="settings-nav-copy">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      <ChevronRight size={22} aria-hidden="true" />
    </button>
  );
}

function SettingsSectionContent({ section, copy, labels, settings, username, onUpdateSettings }: {
  section: SettingsSectionId;
  copy: SettingsCopy;
  labels: Record<string, string>;
  settings: DisplaySettings;
  username: string;
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

function SettingsSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="settings-section-card">
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
                    <span aria-hidden="true" className="mr-1">{active ? '✓' : '○'}</span>{copy.fieldLabels[field]}
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
