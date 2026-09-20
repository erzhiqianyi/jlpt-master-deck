import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, BarChart3, BookMarked, Bot, CalendarClock, CalendarDays, Check, ChevronRight, CircleCheck, ClipboardList, Copy, Headphones, Inbox, PlugZap, Sparkles, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AuthUser, Locale } from '../../types';
import { ConnectedAgents, fetchAgentGrants, type AgentGrant } from '../agents/ConnectedAgents';
import { aiCapabilities, type AiCapability, type AiCapabilityId } from '../../data/aiCapabilities';

const mcpUrl = () => `${window.location.origin}/api/jlpt/mcp`;

type T = (zh: string, ja: string, en: string) => string;

export type AboutSection = 'agents' | 'connect' | 'automation';
export const aboutSections: AboutSection[] = ['agents', 'connect', 'automation'];
export function isAboutSection(value: string | undefined): value is AboutSection {
  return aboutSections.includes(value as AboutSection);
}

export function aboutSectionTitle(section: AboutSection, locale: Locale) {
  const t: T = (zh, ja, en) => locale === 'zh-CN' ? zh : locale === 'ja' ? ja : en;
  if (section === 'agents') return t('已接入的 AI', '接続済みの AI', 'Connected AI');
  if (section === 'connect') return t('怎么接入', '接続のしかた', 'How to connect');
  return t('定时任务与自动化', '定期タスクと自動化', 'Scheduled tasks');
}

/**
 * AI assistant entry. The main page proves whether an AI is connected and shows what it can do;
 * managing connections, the connect steps and scheduling live on sub pages (#/about/<section>).
 */
export function AboutPanel({ user, locale, authToken, section }: { labels: Record<string, string>; user: AuthUser; locale: Locale; authToken: string; section?: string }) {
  const t: T = (zh, ja, en) => locale === 'zh-CN' ? zh : locale === 'ja' ? ja : en;
  if (isAboutSection(section)) {
    return (
      <SubPage t={t} title={aboutSectionTitle(section, locale)}>
        {section === 'agents' ? <AgentsSection t={t} authToken={authToken} /> : null}
        {section === 'connect' ? <ConnectSection t={t} user={user} /> : null}
        {section === 'automation' ? <AutomationSection t={t} /> : null}
      </SubPage>
    );
  }
  return <AboutHome t={t} locale={locale} authToken={authToken} />;
}

function AboutHome({ t, locale, authToken }: { t: T; locale: Locale; authToken: string }) {
  const capabilities = aiCapabilities(locale);
  const links: { section: AboutSection; icon: LucideIcon; title: string; body: string }[] = [
    { section: 'agents', icon: Bot, title: t('已接入的 AI', '接続済みの AI', 'Connected AI'), body: t('查看哪些 AI 正在用这个应用，随时断开。', 'どの AI がこのアプリを使っているか確認し、いつでも切断。', 'See which AI clients use this app and disconnect any time.') },
    { section: 'connect', icon: PlugZap, title: t('怎么接入', '接続のしかた', 'How to connect'), body: t('Claude、ChatGPT、Claude Code、Codex 的接入步骤。', 'Claude / ChatGPT / Claude Code / Codex での接続手順。', 'Steps for Claude, ChatGPT, Claude Code and Codex.') },
    { section: 'automation', icon: CalendarClock, title: t('定时任务与自动化', '定期タスクと自動化', 'Scheduled tasks'), body: t('让 AI 按时间表自动出题、整理、写报告。', '時間どおりに出題・整理・レポートを自動で。', 'Have the AI write questions, organize and report on a timetable.') },
  ];

  return (
    <section className="ai-guide min-w-0">
      <ConnectionStatus t={t} authToken={authToken} />

      <h2 className="ai-guide-section-title">{t('接入后可以做什么', '接続したらできること', 'What it can do once connected')}</h2>
      <div className="ai-guide-capabilities">
        {capabilities.map((capability) => <CapabilityCard key={capability.id} capability={capability} labels={{ say: t('可以这样说', 'こう頼める', 'Try saying'), reads: t('它会先读', '先に読むもの', 'It reads'), result: t('结果在', '結果の場所', 'Result lands in') }} />)}
      </div>

      <nav className="ai-guide-links" aria-label={t('更多', 'その他', 'More')}>
        {links.map(({ section, icon: Icon, title, body }) => (
          <a key={section} href={`#/about/${section}`} className="ai-guide-link cute-focus">
            <span className="ai-guide-link-icon"><Icon size={20} aria-hidden="true" /></span>
            <span className="ai-guide-link-text"><strong>{title}</strong><span>{body}</span></span>
            <ChevronRight size={18} aria-hidden="true" className="ai-guide-link-chevron" />
          </a>
        ))}
      </nav>
    </section>
  );
}

/** Proof that the app is (or is not yet) plugged into an AI: live grants from the server. */
function ConnectionStatus({ t, authToken }: { t: T; authToken: string }) {
  const [grants, setGrants] = useState<AgentGrant[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchAgentGrants(authToken).then((list) => { if (!cancelled) setGrants(list); }).catch(() => { if (!cancelled) setGrants([]); });
    return () => { cancelled = true; };
  }, [authToken]);

  if (grants === null) {
    return <section className="ai-guide-status-card" aria-busy="true"><p className="ai-guide-status-title">{t('正在检查接入状态…', '接続状態を確認中…', 'Checking connection…')}</p></section>;
  }
  const active = grants.filter((grant) => !grant.expired);
  if (active.length === 0) {
    return (
      <section className="ai-guide-status-card is-empty" aria-label={t('接入状态', '接続状態', 'Connection status')}>
        <span className="ai-guide-status-badge"><PlugZap size={16} aria-hidden="true" />{t('还没有接入', '未接続', 'Not connected yet')}</span>
        <p className="ai-guide-status-title">{t('还没有 AI 在用这个应用', 'まだ AI が接続されていません', 'No AI is using this app yet')}</p>
        <p className="ai-guide-status-body">{t('复制一个地址、在 AI 客户端里添加、点一次「允许」，三步就接好。', 'URL をコピーして AI クライアントに追加し、「許可」を押すだけ。3 ステップで完了。', 'Copy one URL, add it in your AI client and approve once — three steps.')}</p>
        <a href="#/about/connect" className="ai-guide-status-cta">{t('接入 AI', 'AI を接続する', 'Connect an AI')}<ChevronRight size={16} aria-hidden="true" /></a>
      </section>
    );
  }
  const latest = active.map((grant) => grant.lastUsedAt || grant.createdAt).sort().at(-1) ?? '';
  return (
    <section className="ai-guide-status-card is-connected" aria-label={t('接入状态', '接続状態', 'Connection status')}>
      <span className="ai-guide-status-badge"><CircleCheck size={16} aria-hidden="true" />{t('已接入', '接続済み', 'Connected')}</span>
      <p className="ai-guide-status-title">{t(`${active.length} 个 AI 正在用这个应用`, `${active.length} 件の AI がこのアプリを使用中`, `${active.length} AI client${active.length === 1 ? '' : 's'} using this app`)}</p>
      <ul className="ai-guide-status-chips">{active.map((grant) => <li key={grant.id}><Bot size={14} aria-hidden="true" />{grant.name}</li>)}</ul>
      <p className="ai-guide-status-body">{t('最近一次使用：', '最終使用：', 'Last used: ')}{formatTime(latest)}</p>
      <a href="#/about/agents" className="ai-guide-status-cta">{t('管理已接入的 AI', '接続済みの AI を管理', 'Manage connected AI')}<ChevronRight size={16} aria-hidden="true" /></a>
    </section>
  );
}

function SubPage({ t, title, children }: { t: T; title: string; children: ReactNode }) {
  return (
    <section className="ai-guide min-w-0">
      <a href="#/about" className="ai-guide-back hidden md:inline-flex"><ArrowLeft size={16} aria-hidden="true" />{t('AI 助手', 'AI アシスタント', 'AI assistant')}</a>
      <h1 className="ai-guide-subtitle">{title}</h1>
      {children}
    </section>
  );
}

function AgentsSection({ t, authToken }: { t: T; authToken: string }) {
  return (
    <>
      <p className="ai-guide-lead">{t('这里列出通过授权接入的每一个 AI 客户端。断开后它持有的令牌立即失效，需要重新授权才能再用。', '認可を経て接続した AI クライアントの一覧です。切断するとトークンは即時無効になり、再認可が必要になります。', 'Every AI client that connected through the consent page. Disconnecting kills its token immediately; it must approve again to reconnect.')}</p>
      <section className="ai-guide-card" aria-label={t('已接入的 AI', '接続済みの AI', 'Connected AI')}>
        <ConnectedAgents authToken={authToken} showEndpoint={false} />
      </section>
      <p className="ai-guide-note">{t('想再接一个？', 'もう 1 つ接続する？', 'Want to add another?')} <a href="#/about/connect">{t('查看接入步骤 →', '接続手順を見る →', 'See the connect steps →')}</a></p>
    </>
  );
}

function ConnectSection({ t, user }: { t: T; user: AuthUser }) {
  const [copied, setCopied] = useState(false);
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard may be unavailable */ }
  }
  const url = mcpUrl();
  const clients: { name: string; how: ReactNode }[] = [
    { name: 'Claude / ChatGPT', how: t('在客户端的「连接器 / Connectors」里添加自定义 MCP，填入上面的地址。', 'クライアントの「コネクタ」でカスタム MCP を追加し、上の URL を入力。', 'Add a custom MCP connector in the client’s Connectors settings and paste the URL above.') },
    { name: 'Claude Code', how: <code>claude mcp add --transport http jlpt {url}</code> },
    { name: 'Codex', how: <code>codex mcp add jlpt --url {url}</code> },
  ];
  const usage = [
    t('接好后直接用自然语言说要做什么，不用记命令。上面「可以这样说」里的句子都能直接用。', '接続後は自然文で頼むだけ。コマンドを覚える必要はなく、「こう頼める」の例文がそのまま使えます。', 'Once connected, just say what you want in plain language — every “Try saying” example works as is.'),
    t('提到「我的单词本」「今日练习」「草稿」这类词，AI 会自动读取这个应用里的数据再动手。', '「私の単語帳」「今日の練習」「ドラフト」といった言葉を出すと、AI はこのアプリのデータを読んでから作業します。', 'Mention “my wordbook”, “today’s practice” or “drafts” and the AI reads this app’s data before acting.'),
    t('写入的内容会立刻出现在网页里：词条进单词本，题目进今日练习，复习包进草稿。', '書き込まれた内容はすぐに Web に反映されます。項目は単語帳へ、問題は今日の練習へ、復習パックはドラフトへ。', 'Whatever it writes shows up here right away: entries in wordbooks, questions in today’s practice, review packs in Drafts.'),
  ];
  return (
    <>
      <section className="ai-guide-card" aria-label={t('连接', '接続', 'Connect')}>
        <h2><PlugZap size={20} aria-hidden="true" />{t('三步接入', '3 ステップで接続', 'Connect in three steps')}</h2>
        <ol className="ai-guide-steps">
          <li>
            <strong>{t('复制 MCP 地址', 'MCP の URL をコピー', 'Copy the MCP URL')}</strong>
            <div className="ai-guide-url"><code>{url}</code><button type="button" onClick={() => void copy(url)}>{copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}{copied ? t('已复制', 'コピー済み', 'Copied') : t('复制', 'コピー', 'Copy')}</button></div>
          </li>
          <li>
            <strong>{t('在 AI 客户端里添加', 'AI クライアントに追加', 'Add it in your AI client')}</strong>
            <dl className="ai-guide-clients">{clients.map((client) => <div key={client.name}><dt>{client.name}</dt><dd>{client.how}</dd></div>)}</dl>
          </li>
          <li>
            <strong>{t('在弹出的授权页点「允许」', '表示される認可ページで「許可」', 'Approve on the consent page')}</strong>
            <p>{t(`客户端第一次连接时会打开本站的授权页，用当前账号（${user.username}）确认后即可使用。授权页会列出它能访问的范围。`, `初回接続時にこのサイトの認可ページが開きます。現在のアカウント（${user.username}）で確認すれば利用できます。アクセス範囲は認可ページに表示されます。`, `On first connection the client opens this site’s consent page; approve as ${user.username} and you are set. The page lists what it may access.`)}</p>
          </li>
        </ol>
      </section>
      <section className="ai-guide-card" aria-label={t('怎么用', '使い方', 'How to use it')}>
        <h2><Sparkles size={20} aria-hidden="true" />{t('接好以后怎么用', '接続後の使い方', 'Using it once connected')}</h2>
        <ul className="ai-guide-points">{usage.map((point) => <li key={point}>{point}</li>)}</ul>
      </section>
      <p className="ai-guide-note">{t('接好后回到', '接続できたら', 'Connected? Go back to')} <a href="#/about">{t('AI 助手 →', 'AI アシスタントへ →', 'AI assistant →')}</a></p>
    </>
  );
}

function AutomationSection({ t }: { t: T }) {
  const examples = [
    { when: t('每天 7:00', '毎日 7:00', 'Daily 07:00'), what: t('用到期单词和薄弱点出 20 题，发布成今日练习', '期限の単語と弱点から 20 問作り、今日の練習として公開', 'Make 20 questions from due words and weak points, publish as today’s practice') },
    { when: t('每天 22:00', '毎日 22:00', 'Daily 22:00'), what: t('把今天新记的待整理记录补成完整词条', '今日のメモを完全な項目に仕上げる', 'Expand today’s captures into full entries') },
    { when: t('每周日 20:00', '毎週日曜 20:00', 'Sunday 20:00'), what: t('统计本周正确率，写一份弱点报告，生成下周复习包草稿', '今週の正答率を集計して弱点レポートを書き、来週の復習パックをドラフトに', 'Summarize the week’s accuracy, write a weak-point report, draft next week’s review pack') },
    { when: t('每月 1 日', '毎月 1 日', 'Monthly, 1st'), what: t('对照考试日期重排备考计划', '試験日に合わせて学習計画を組み直す', 'Re-plan against the exam date') },
  ];
  const ways: { name: string; body: string; code?: string }[] = [
    {
      name: t('Claude 的定时任务', 'Claude の定期タスク', 'Claude scheduled tasks'),
      body: t('在 Claude 里接好这个应用的连接器后，直接说「每天早上 7 点帮我出今日练习」，Claude 会创建一个定时任务，到点自动执行并把结果写回这里。', 'Claude にこのアプリのコネクタを接続したら、「毎朝 7 時に今日の練習を作って」と頼むだけ。定期タスクが作られ、時間になると自動で実行してここに書き戻します。', 'With this app connected in Claude, say “every morning at 7 make today’s practice”. Claude creates a scheduled task that runs on time and writes the result back here.'),
    },
    {
      name: t('Claude Code 的 /schedule', 'Claude Code の /schedule', 'Claude Code /schedule'),
      body: t('在 Claude Code 里输入 /schedule，描述频率和要做的事，就会生成一个按 cron 运行的例程；它会通过已添加的 jlpt MCP 操作这个应用。', 'Claude Code で /schedule と入力し、頻度と内容を伝えると cron で動くルーチンが作られます。追加済みの jlpt MCP 経由でこのアプリを操作します。', 'Type /schedule in Claude Code, describe the cadence and the job, and it creates a cron-driven routine that works through the jlpt MCP you added.'),
      code: '/schedule 每天早上 7 点：用我到期的单词出 20 道题，发布成今日练习',
    },
    {
      name: t('自己的 cron / 计划任务', '自前の cron', 'Your own cron'),
      body: t('任何能定时跑命令的地方都行：用 Claude Code 的非交互模式跑一句提示词即可。', 'コマンドを定期実行できる環境ならどこでも。Claude Code の非対話モードでプロンプトを 1 行実行するだけです。', 'Anything that runs commands on a timer works: run one prompt through Claude Code’s non-interactive mode.'),
      code: '0 7 * * * claude -p "用我到期的单词出 20 道题，发布成今天的练习" --allowedTools "mcp__jlpt__*"',
    },
  ];
  const tips = [
    t('自动生成的复习包会先进草稿，不会直接改题库；今日练习则会直接出现在首页。', '自動生成された復習パックはまずドラフトへ入り、問題庫を直接変更しません。今日の練習はホームに直接表示されます。', 'Auto-generated review packs land in Drafts and never touch the bank directly; today’s practice appears on the home page.'),
    t('定时任务用的是同一个授权，在「已接入的 AI」里断开，它就停了。', '定期タスクも同じ認可を使います。「接続済みの AI」で切断すれば止まります。', 'Scheduled runs use the same grant — disconnect it under “Connected AI” and they stop.'),
    t('提示词写得越具体越稳：说清数量、范围（哪个单词本、哪个级别）和产出（发布成今日练习 / 存成草稿）。', 'プロンプトは具体的なほど安定します。数量・範囲（どの単語帳、どのレベル）・成果物（今日の練習として公開 / ドラフト保存）を明記。', 'Specific prompts run more reliably: state the count, the scope (which wordbook, which level) and the output (publish as today’s practice / save as draft).'),
  ];
  return (
    <>
      <p className="ai-guide-lead">{t('接入的 AI 不只是等你开口——把它要做的事排进时间表，练习、整理和报告就会自己跑。', '接続した AI は頼まれるのを待つだけではありません。やることを時間表に入れれば、練習・整理・レポートが自動で回ります。', 'A connected AI doesn’t have to wait for you. Put its jobs on a timetable and practice, tidying and reports run on their own.')}</p>
      <section className="ai-guide-card" aria-label={t('可以自动做的事', '自動化できること', 'What to automate')}>
        <h2><CalendarClock size={20} aria-hidden="true" />{t('可以自动做的事', '自動化できること', 'What to automate')}</h2>
        <dl className="ai-guide-schedule">{examples.map((example) => <div key={example.when}><dt>{example.when}</dt><dd>{example.what}</dd></div>)}</dl>
      </section>
      <section className="ai-guide-card" aria-label={t('怎么设置', '設定方法', 'How to set it up')}>
        <h2><Bot size={20} aria-hidden="true" />{t('三种设置方式', '3 つの設定方法', 'Three ways to set it up')}</h2>
        <ol className="ai-guide-steps">
          {ways.map((way) => (
            <li key={way.name}>
              <strong>{way.name}</strong>
              <p>{way.body}</p>
              {way.code ? <pre className="ai-guide-code"><code>{way.code}</code></pre> : null}
            </li>
          ))}
        </ol>
      </section>
      <section className="ai-guide-card" aria-label={t('提示', 'ヒント', 'Tips')}>
        <h2><Sparkles size={20} aria-hidden="true" />{t('几个提示', 'ヒント', 'Tips')}</h2>
        <ul className="ai-guide-points">{tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
      </section>
    </>
  );
}

const capabilityIcons: Record<AiCapabilityId, LucideIcon> = { capture: Inbox, wordbooks: BookMarked, analyze: BarChart3, practice: Target, plan: CalendarDays, drafts: ClipboardList, media: Headphones, schedule: CalendarClock };

function CapabilityCard({ capability, labels }: { capability: AiCapability; labels: { say: string; reads: string; result: string } }) {
  const Icon = capabilityIcons[capability.id];
  return (
    <article className="ai-guide-capability">
      <h3><Icon size={20} aria-hidden="true" />{capability.title}</h3>
      <p>{capability.body}</p>
      <dl className="ai-guide-capability-facts">
        <div><dt>{labels.reads}</dt><dd>{capability.reads}</dd></div>
        <div><dt>{labels.result}</dt><dd>{capability.result}</dd></div>
      </dl>
      <blockquote><span>{labels.say}</span>{capability.prompts.map((prompt) => <q key={prompt}>{prompt}</q>)}</blockquote>
    </article>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
