import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Bot, ChevronRight, CircleCheck, PlugZap } from 'lucide-react';
import type { AuthUser, Locale } from '../../types';
import { ConnectedAgents, fetchAgentGrants, type AgentGrant } from '../agents/ConnectedAgents';
import { GuideBook, guideTitle, isGuideSection } from './GuideBook';

type T = (zh: string, ja: string, en: string) => string;
export type AboutSection = 'agents' | 'connect' | 'automation' | 'mcp' | 'guide' | 'results' | `guide-${string}`;
export const aboutSections: AboutSection[] = ['agents', 'connect', 'automation', 'mcp', 'guide', 'results'];
export function isAboutSection(value: string | undefined): value is AboutSection {
  return value === 'agents' || isGuideSection(value);
}
export function aboutSectionTitle(section: AboutSection, locale: Locale) {
  return section === 'agents' ? (locale === 'zh-CN' ? '已接入的 AI' : locale === 'ja' ? '接続済みの AI' : 'Connected AI') : guideTitle(section, locale);
}
export function AboutPanel({ user, locale, authToken, section }: { labels: Record<string, string>; user: AuthUser; locale: Locale; authToken: string; section?: string }) {
  const t: T = (zh, ja, en) => locale === 'zh-CN' ? zh : locale === 'ja' ? ja : en;
  if (section === 'agents') return <SubPage t={t} title={aboutSectionTitle('agents', locale)}><AgentsSection t={t} authToken={authToken} /></SubPage>;
  if (isGuideSection(section)) return <GuideBook key={section} section={section!} locale={locale} username={user.username} />;
  return <section className="ai-guide min-w-0">
    <header className="handbook-home-heading"><span>AI × JLPT</span><h1>{t('让学习，有个好帮手', '学習に、頼れる相棒を', 'A helping hand for your studies')}</h1><p>{t('在你常用的 AI 里提出需求，在这里积累学习成果。', 'いつもの AI に頼んで、ここに学びを蓄えましょう。', 'Ask your usual AI. Keep your learning here.')}</p></header>
    <ConnectionStatus t={t} authToken={authToken} />
    <a className="handbook-entry cute-focus" href="#/about/guide"><div><span className="handbook-eyebrow">{t('图解使用指南', '図解ガイド', 'ILLUSTRATED GUIDE')}</span><h2>{t('接入后，可以做什么？', '接続したら、何ができる？', 'What can you do once connected?')}</h2><p>{t('从整理第一条笔记，到生成练习、分析错题。看懂流程，复制示例，跟着做一次。', '最初のメモから練習・誤答分析まで。図解と例文で一緒に試しましょう。', 'From your first note to practice and review. Follow the diagrams and try an example.')}</p><strong>{t('打开图解指南', 'ガイドを開く', 'Open the guide')} <ChevronRight size={18} /></strong></div><img src="/images/ai-guide/learning-flow.png" alt="" /></a>
    <nav className="handbook-home-links" aria-label={t('接下来', '次のステップ', 'Next steps')}>
      {[
        ['mcp', t('01 认识 MCP', '01 MCP を知る', '01 Understand MCP'), t('AI 如何连接你的学习数据', 'AI と学習データのつながり', 'How AI connects to your learning')],
        ['connect', t('02 接入与验证', '02 接続と確認', '02 Connect and verify'), t('复制地址、授权、试一次读取', 'URL・認可・読み取り確認', 'Copy, authorize, test a read')],
        ['automation', t('进阶：定时自动跑', '応用：定期実行', 'Next: scheduled tasks'), t('把已经试成功的流程设成定时任务', '成功した手順を定期タスクに', 'Schedule a workflow you have tested')],
      ].map(([id, title, body]) => <a className="cute-focus" href={`#/about/${id}`} key={id}><strong>{title}</strong><span>{body}</span><ChevronRight size={18} /></a>)}
    </nav>
  </section>;
}
function ConnectionStatus({ t, authToken }: { t: T; authToken: string }) {
  const [grants, setGrants] = useState<AgentGrant[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setGrants(null); setFailed(false);
    fetchAgentGrants(authToken).then((list) => { if (!cancelled) setGrants(list); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [authToken]);

  if (failed) return <section className="ai-guide-status-card"><p>{t('暂时无法读取接入状态，请刷新后重试。', '接続状態を取得できません。再読み込みしてください。', 'Unable to load connection status. Please reload to retry.')}</p><a href="#/about/agents">{t('查看授权管理', '認可の管理', 'Manage connections')}</a></section>;
  if (grants === null) {
    return <section className="ai-guide-status-card" aria-busy="true"><p className="ai-guide-status-title">{t('正在检查接入状态…', '接続状態を確認中…', 'Checking connection…')}</p></section>;
  }
  const active = grants.filter((grant) => !grant.expired);
  if (active.length === 0) {
    return (
      <section className="ai-guide-status-card is-empty" aria-label={t('接入状态', '接続状態', 'Connection status')}>
        <span className="ai-guide-status-badge"><PlugZap size={16} aria-hidden="true" />{t('还没有接入', '未接続', 'Not connected yet')}</span>
        <p className="ai-guide-status-title">{t('还没有 AI 在用这个应用', 'まだ AI が接続されていません', 'No AI is using this app yet')}</p>
        <p className="ai-guide-status-body">{t('添加 MCP 地址并完成授权，再用一次只读查询确认连接。', 'MCP の URL を追加して認可し、読み取りを一度試して接続を確認します。', 'Add the MCP URL, authorize access and verify a read-only request.')}</p>
        <a href="#/about/connect" className="ai-guide-status-cta">{t('接入 AI', 'AI を接続する', 'Connect an AI')}<ChevronRight size={16} aria-hidden="true" /></a>
      </section>
    );
  }
  const latest = active.map((grant) => grant.lastUsedAt).filter(Boolean).sort().at(-1) ?? '';
  return (
    <section className="ai-guide-status-card is-connected" aria-label={t('接入状态', '接続状態', 'Connection status')}>
      <span className="ai-guide-status-badge"><CircleCheck size={16} aria-hidden="true" />{t('已接入', '接続済み', 'Connected')}</span>
      <p className="ai-guide-status-title">{t(`${active.length} 个 AI 已获授权`, `${active.length} 件の AI が認可済みです`, `${active.length} authorized AI client${active.length === 1 ? '' : 's'}`)}</p>
      <ul className="ai-guide-status-chips">{active.map((grant) => <li key={grant.id}><Bot size={14} aria-hidden="true" />{grant.name}</li>)}</ul>
      <p className="ai-guide-status-body">{t('最近一次使用：', '最終使用：', 'Last used: ')}{latest ? formatTime(latest) : t('尚无调用记录', 'まだ利用履歴はありません', 'No tool use recorded yet')}</p>
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

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
