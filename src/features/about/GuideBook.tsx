import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, Lightbulb, MapPin } from 'lucide-react';
import type { Locale } from '../../types';
import { aiCapabilities, type AiCapabilityId } from '../../data/aiCapabilities';
import { guideLesson } from './guideLessons';
import './guideBook.css';

type T = (zh: string, ja: string, en: string) => string;
const capabilityIds = aiCapabilities('zh-CN').map(item => item.id);
export function isGuideSection(value?: string) {
  return !!value && (['mcp', 'connect', 'guide', 'results', 'automation'].includes(value) || capabilityIds.some(id => value === `guide-${id}`));
}
export function guideTitle(section: string, locale: Locale) {
  const t: T = (zh, ja, en) => locale === 'zh-CN' ? zh : locale === 'ja' ? ja : en;
  if (section === 'mcp') return t('认识 MCP', 'MCP を知る', 'Understand MCP');
  if (section === 'connect') return t('接入与验证', '接続と確認', 'Connect and verify');
  if (section === 'results') return t('查看学习成果', '学習成果を確認', 'Check your results');
  if (section === 'automation') return t('定时任务与自动化', '定期タスクと自動化', 'Scheduled tasks');
  const capability = aiCapabilities(locale).find(item => section === `guide-${item.id}`);
  return capability?.title ?? t('图解使用指南', '図解ガイド', 'Illustrated guide');
}

export function GuideBook({ section, locale, username }: { section: string; locale: Locale; username: string }) {
  const t: T = (zh, ja, en) => locale === 'zh-CN' ? zh : locale === 'ja' ? ja : en;
  const capabilities = aiCapabilities(locale);
  const selected = capabilities.find(item => `guide-${item.id}` === section) ?? capabilities[0];
  const isUsage = section === 'guide' || section.startsWith('guide-');
  const chapter = isUsage ? 'guide' : section;
  const chapters = [
    ['mcp', t('认识 MCP', 'MCP を知る', 'Understand MCP')],
    ['connect', t('接入 AI', 'AI を接続', 'Connect an AI')],
    ['guide', t('第一次使用', 'はじめての活用', 'Your first workflow')],
    ['results', t('查看结果', '結果を確認', 'Check results')],
  ];
  const chapterNumber = chapters.findIndex(([id]) => id === chapter) + 1;
  const lesson = guideLesson(selected.id, locale);
  const titles: Record<string, string> = {
    mcp: t('图解：AI 如何用上你的学习数据', '図解：AI と学習データのつながり', 'How AI connects to your learning'),
    connect: t('接上 AI，再验证一次', 'AI を接続して、確認しよう', 'Connect your AI, then verify it'),
    guide: selected.id === 'capture' ? t('图解：让 AI 帮你整理学习笔记', '図解：AI と学習メモを整理する', 'Let AI organize your study notes') : selected.title,
    results: t('AI 做完以后，去哪里看？', 'AI の作業結果は、どこで見る？', 'Where do the results go?'),
    automation: t('试成功的事，让它定时做', 'できたことを、定期タスクに', 'Schedule a workflow that works'),
  };
  const intros: Record<string, string> = {
    mcp: t('你说出学习需求，AI 通过 MCP 调用这个应用提供的工具，把需要的内容读出来，把整理好的成果存回去。', '学習の要望を伝えると、AI が MCP 経由でこのアプリのツールを使い、必要な内容を読み、成果を保存します。', 'Describe your learning need. Through MCP, AI can use this app’s tools to read relevant data and save its work.'),
    connect: t('不用给网页安装一个 AI。把本站的 MCP 地址添加到你常用的客户端，授权后，先做一次只读检查。', 'Web に AI を入れる必要はありません。MCP の URL をクライアントに追加し、認可してから読み取りを確認します。', 'Add this site’s MCP URL to your AI client, authorize access and test a read-only request.'),
    guide: selected.id === 'capture' ? t('这一节，通过一个具体例子，看懂如何用自然语言提出需求，再通过 MCP 把成果保存到学习记录和单词本中。', '具体例を通して、自然文の依頼を学習メモや単語帳に保存する流れを見てみましょう。', 'Follow a concrete example: turn a plain-language request into saved learning notes and entries.' ) : selected.body,
    results: t('聊天回复是过程，网页里的内容才是可继续学习的成果。按产出类型找到对应页面，再核对内容是否真的保存。', 'チャットの返答から、Web に保存された学習成果へ。種類ごとの保存先で内容を確認しましょう。', 'Find the saved result on the appropriate page and check the content before continuing your study.'),
    automation: t('先手动跑通，再设置时间。定时执行由你的 AI 客户端或调度工具负责，JLPT Master Deck 负责提供数据与保存结果。', 'まず手動で成功させてから時刻を設定。定期実行は AI 側が担当し、このアプリはデータと保存先を提供します。', 'Test manually before scheduling. Your AI client runs the schedule; JLPT Master Deck supplies data and stores results.'),
  };
  const outcome = isUsage ? lesson.outcome : chapter === 'mcp' ? t('分清 AI、MCP 与网页的分工', 'AI・MCP・Web の役割がわかる', 'Understand the roles of AI, MCP and this app') : chapter === 'connect' ? t('完成授权，并验证一次读取', '認可と読み取りを確認', 'Authorize and verify one read') : chapter === 'results' ? t('找到并核对实际保存的结果', '保存された結果を確認', 'Find and check saved results') : t('设置一个可检查的定时流程', '確認できる定期タスクを設定', 'Set up a verifiable scheduled workflow');
  return <section className="handbook">
    <nav className="handbook-toc" aria-label={t('使用指南章节', 'ガイドの章', 'Guide chapters')}>
      <a href="#/about" className="handbook-back"><ArrowLeft size={15} />{t('AI 助手', 'AI アシスタント', 'AI assistant')}</a>
      <strong>{t('使用指南', '使い方ガイド', 'User guide')}</strong>
      {chapters.map(([id, label], i) => <a key={id} href={`#/about/${id}`} aria-current={chapter === id ? 'page' : undefined}><span>{String(i + 1).padStart(2, '0')}</span>{label}</a>)}
      <a className="handbook-extra" href="#/about/automation" aria-current={chapter === 'automation' ? 'page' : undefined}>{t('进阶 · 定时任务', '応用 · 定期タスク', 'Next · Scheduled tasks')}</a>
    </nav>
    <article className="handbook-article">
      <header><p className="handbook-eyebrow">{chapterNumber ? `CHAPTER ${String(chapterNumber).padStart(2, '0')}` : 'NEXT STEP'}</p><h1>{titles[chapter]}</h1><p className="handbook-intro">{intros[chapter]}</p></header>
      <aside className="handbook-outcome"><Lightbulb size={25} /><strong>{t('读完你会', 'この章でできること', 'You will learn to')}</strong><p><Check size={18} />{outcome}</p><span>{t('小小的一步，积累成进步。', '小さな一歩が、大きな力に。', 'Small steps, lasting progress.')}</span></aside>
      <FlowFigure t={t} asset={chapter === 'connect' || chapter === 'mcp' ? 'connection' : isUsage && selected.id === 'media' ? 'media' : chapter === 'results' || (isUsage && ['analyze', 'practice', 'drafts'].includes(selected.id)) ? 'practice' : 'learning'} labels={chapter === 'connect' ? [t('添加 MCP 地址', 'URL を追加', 'Add the MCP URL'), t('登录并授权', 'ログインして認可', 'Sign in and authorize'), t('读取一次验证', '読み取りを確認', 'Verify one read')] : chapter === 'mcp' ? [t('你提出学习需求', 'あなたが依頼', 'You describe a task'), t('AI 通过 MCP 操作', 'AI が MCP で操作', 'AI uses MCP tools'), t('成果保存在网页', '成果を Web に保存', 'Results live in the app')] : chapter === 'results' ? [t('核对 AI 回复', '返答を確認', 'Check the response'), t('打开对应页面', '保存先を開く', 'Open the destination'), t('检查并继续学习', '確認して学習', 'Review and study')] : chapter === 'automation' ? [t('先手动试一次', '手動で試す', 'Test manually'), t('在客户端设定时', 'AI 側で時刻設定', 'Schedule in your client'), t('检查每次的产出', '実行結果を確認', 'Check each result')] : [t('你提出需求', 'あなたが依頼', 'Describe your need'), t('AI 读取并整理', 'AI が読み、整理', 'AI reads and organizes'), t('查看保存的成果', '保存結果を確認', 'Check the saved result')]} />
      {isUsage ? <>
        <label className="handbook-case-picker">{t('选择使用场景', '活用シーンを選択', 'Choose a workflow')}<select value={selected.id} onChange={event => { window.location.hash = event.target.value === 'capture' ? '#/about/guide' : `#/about/guide-${event.target.value}`; }}>{capabilities.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <Block title={t('先试一次', 'まず試してみよう', 'Try it once')}><p>{t('在已接入的 AI 中发送下面的示例。把本子名称、数量和范围换成自己的。', '接続済みの AI に送信し、帳の名前・数量・範囲を自分用に調整します。', 'Send this to your connected AI, adjusting the book name, count and scope.')}</p><CopyPrompt text={selected.id === 'capture' ? t('把「〜ならでは」整理成语法记录，加上接续、中文释义、例句和易混点；先检查是否已有记录，再保存到我的语法本，并告诉我保存位置。', '「〜ならでは」を接続・意味・例文・注意点付きで整理して。既存項目を確認し、文法帳に保存して場所を教えて。', 'Organize 〜ならでは with its pattern, meaning, examples and common confusions. Check existing entries, save it to my grammar book and report the destination.') : selected.prompts[0]} t={t} /></Block>
        <Block title={t('它会怎样完成这件事', 'どう進める？', 'How the workflow works')}><ol className="handbook-steps">{lesson.steps.map((step, i) => <li key={step}><span>{i + 1}</span><p>{step}</p></li>)}</ol><p className="handbook-note">{t('会用到的数据：', '使うデータ：', 'Data used: ')}{selected.reads}</p></Block>
        {selected.id === 'capture' && <Block title={t('保存后是什么样', '保存後のイメージ', 'What a saved entry looks like')}><div className="handbook-example"><span>{t('示例 · 并非你的真实记录', 'サンプル・実際の記録ではありません', 'Example · not a real saved record')}</span><h3>〜ならでは</h3><dl><dt>{t('接续', '接続', 'Pattern')}</dt><dd>{t('名词＋ならでは', '名詞＋ならでは', 'Noun + ならでは')}</dd><dt>{t('意思', '意味', 'Meaning')}</dt><dd>{t('只有……才有的；……所特有的', 'それに特有のよさや特徴', 'Unique to; only possible with')}</dd><dt>{t('例句', '例文', 'Example')}</dt><dd>京都ならではの風景を楽しんだ。</dd></dl></div></Block>}
        <Block title={t('在哪里查看结果？', '結果はどこに？', 'Where to find it')}><p>{selected.result}</p><a className="handbook-text-link" href={selected.id === 'capture' ? '#/grammar/wordbooks' : selected.href}><MapPin size={17} />{t('打开结果所在页面', '保存先のページを開く', 'Open the destination')}<ArrowRight size={16} /></a><p className="handbook-note">{lesson.check}</p></Block>
        <details className="handbook-details"><summary>{t('还可以这样说', 'こんな頼み方も', 'More ways to ask')}</summary>{selected.prompts.slice(1).map(prompt => <CopyPrompt key={prompt} text={prompt} t={t} />)}</details>
      </> : chapter === 'connect' ? <ConnectChapter t={t} username={username} /> : chapter === 'mcp' ? <>
        <Block title={t('MCP 是什么？', 'MCP とは？', 'What is MCP?')}><p>{t('MCP（Model Context Protocol）是一套让 AI 使用外部工具的连接方式。对你来说，它像一座桥：AI 负责理解你的话，本站提供查询、整理和保存学习内容的工具。', 'MCP は AI が外部ツールを使うための接続方式です。AI が依頼を理解し、このアプリが学習内容の検索・整理・保存を支えます。', 'MCP is a protocol for connecting AI to external tools. AI interprets your request; this app supplies tools for reading and saving learning content.')}</p></Block>
        <Block title={t('接入前后，有什么区别？', '接続すると何が変わる？', 'What changes when you connect?')}><dl className="handbook-compare"><div><dt>{t('接入前', '接続前', 'Before')}</dt><dd>{t('AI 可以解释单词，但聊天中的答案需要你自己整理、复制到网页。', 'AI の説明を、自分で整理して Web にコピーします。', 'You organize and copy chat explanations into the app yourself.')}</dd></div><div><dt>{t('接入后', '接続後', 'After')}</dt><dd>{t('你可以要求 AI 读取已有词条、补充内容并保存；网页继续负责练习与复习。', '既存項目を読んで補足・保存するよう AI に頼めます。練習・復習は Web で。', 'Ask AI to read, enrich and save entries. Continue practicing and reviewing on the website.')}</dd></div></dl></Block>
        <Block title={t('授权决定它能做什么', '認可が操作範囲を決める', 'Authorization sets the scope')}><p>{t('连接时使用你自己的本站账号，授权页会说明可访问的范围。只读权限适合查询与分析；保存或发布需要对应写入权限。你可以在「已接入的 AI」中撤销授权。', '自分のアカウントで認可し、アクセス範囲を確認します。読み取りと保存は異なる権限です。接続済み AI から取り消せます。', 'Authorize with your account and review the access scope. Reading and writing require different permissions. Revoke access under Connected AI.')}</p><a className="handbook-text-link" href="#/about/agents">{t('管理已接入的 AI', '接続済み AI を管理', 'Manage connected AI')}<ArrowRight size={16} /></a></Block>
      </> : chapter === 'results' ? <>
        <Block title={t('按成果类型找入口', '成果ごとの保存先', 'Find the right destination')}><div className="handbook-results">{capabilities.filter(item => item.id !== 'schedule').map(item => <a href={item.href} key={item.id}><strong>{item.title}</strong><span>{item.result}</span><ArrowRight size={17} /></a>)}</div></Block>
        <Block title={t('回复说完成了，但网页里没有？', '完了したのに見つからない？', 'The result is missing?')}><ol className="handbook-steps">{[t('先检查是否是同一个账号，以及目标本子和筛选条件是否正确。', '同じアカウント・保存先・絞り込みか確認します。', 'Check the account, destination book and active filters.'), t('请 AI 返回实际保存结果、标题和目标位置；检查工具是否报错或缺少写入权限。', '実際の保存結果・名前・場所を確認し、ツールエラーや権限不足も調べます。', 'Ask for the actual save result, title and destination. Check tool errors and write access.'), t('刷新对应页面再看。草稿、已发布练习和聊天文本是不同结果，需要分别确认。', 'ページを再読み込み。ドラフト・公開済み練習・チャットを区別します。', 'Refresh the destination. Drafts, published practice and chat text are different results.')].map((text, i) => <li key={text}><span>{i + 1}</span><p>{text}</p></li>)}</ol></Block>
      </> : <AutomationChapter t={t} locale={locale} />}
      <footer className="handbook-pagination"><a href="#/about">{t('返回 AI 助手', 'AI アシスタントへ', 'Back to AI assistant')}</a>{chapterNumber > 0 && chapterNumber < 4 ? <a href={`#/about/${chapters[chapterNumber][0]}`}>{t('下一章：', '次の章：', 'Next: ')}{chapters[chapterNumber][1]}<ArrowRight size={17} /></a> : <a href="#/about/connect">{t('查看接入步骤', '接続手順を見る', 'See connection steps')}<ArrowRight size={17} /></a>}</footer>
    </article>
  </section>;
}
function Block({ title, children }: { title: string; children: ReactNode }) { return <section className="handbook-block"><h2>{title}</h2>{children}</section>; }
function FlowFigure({ t, asset, labels }: { t: T; asset: string; labels: string[] }) {
  return <figure className="handbook-figure"><img src={`/images/ai-guide/${asset}-flow.png`} alt={labels.join(' → ')} width="1536" height="640" /><figcaption>{labels.map((label, i) => <div key={label}><span>{i + 1}</span><strong>{label}</strong></div>)}</figcaption><p>{t('流程示意 · 实际操作在已接入的 AI 客户端中进行', '流れの図解・操作は接続した AI クライアントで行います', 'Illustrated flow · actions happen in your connected AI client')}</p></figure>;
}
export function CopyPrompt({ text, t }: { text: string; t: T }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    clearTimeout(timer.current);
    try { await navigator.clipboard.writeText(text); setStatus('copied'); timer.current = setTimeout(() => setStatus('idle'), 2500); }
    catch { setStatus('failed'); }
  }
  return <div className="handbook-copy"><p>{text}</p><button type="button" onClick={() => void copy()}>{status === 'copied' ? <Check size={17} /> : <Copy size={17} />}{status === 'copied' ? t('已复制', 'コピー済み', 'Copied') : t('复制', 'コピー', 'Copy')}</button><span role="status" className={status === 'failed' ? 'handbook-copy-error' : 'sr-only'}>{status === 'failed' ? t('复制失败，请选中文字手动复制。', 'コピーできません。テキストを選択してコピーしてください。', 'Copy failed. Select the text and copy it manually.') : status === 'copied' ? t('已复制到剪贴板', 'コピーしました', 'Copied to clipboard') : ''}</span></div>;
}
function ConnectChapter({ t, username }: { t: T; username: string }) {
  const [client, setClient] = useState('Claude');
  const url = `${window.location.origin}/api/jlpt/mcp`;
  return <>
    <Block title={t('1. 复制本站 MCP 地址', '1. MCP の URL をコピー', '1. Copy the MCP URL')}><p>{t('这是工具服务的地址，不是网页首页。远程客户端需要能够访问这个地址；本机 localhost 地址不能直接供云端客户端连接。', 'これは Web のトップではなくツールの URL です。クラウド側から localhost には接続できません。', 'This is the tool endpoint, not the homepage. Cloud clients cannot reach a localhost address.')}</p><CopyPrompt text={url} t={t} /></Block>
    <Block title={t('2. 在你的客户端添加', '2. クライアントに追加', '2. Add it in your client')}><div className="handbook-client-tabs" role="group" aria-label={t('选择 AI 客户端', 'AI を選ぶ', 'Choose a client')}>{['Claude', 'ChatGPT', 'Claude Code', 'Codex'].map(name => <button type="button" aria-pressed={name === client} onClick={() => setClient(name)} key={name}>{name}</button>)}</div>
      {client === 'Codex' ? <><p>{t('在终端添加 HTTP 服务，然后单独完成 OAuth 登录。', 'ターミナルで HTTP サーバーを追加し、OAuth ログインを行います。', 'Add the HTTP server in your terminal, then complete OAuth login.')}</p><CopyPrompt text={`codex mcp add jlpt --url ${url}`} t={t} /><CopyPrompt text="codex mcp login jlpt" t={t} /></> : client === 'Claude Code' ? <><p>{t('在终端添加服务；进入 Claude Code 后用 /mcp 查看连接并完成认证。', 'サーバーを追加し、Claude Code の /mcp で接続と認証を確認します。', 'Add the server, then use /mcp inside Claude Code to review the connection and authenticate.')}</p><CopyPrompt text={`claude mcp add --transport http jlpt ${url}`} t={t} /></> : <p>{client === 'Claude' ? t('在设置中找到 Connectors（连接器），添加自定义连接器，名称填 JLPT Master Deck，远程 MCP URL 填上面的完整地址，然后连接。入口名称和可用性以你的客户端为准。', '設定の Connectors からカスタム接続を追加し、名前と上の URL を入力して接続します。利用可否はクライアントで確認してください。', 'In Settings → Connectors, add a custom connector named JLPT Master Deck with the full remote MCP URL, then connect. Availability depends on your client.') : t('在支持自定义 MCP 的 ChatGPT 账号中启用开发者模式，再到 Plugins 页面点加号，填入名称和 MCP 地址；连接后，在会话的工具选择器中启用它。工作区管理员可能限制此功能。', 'カスタム MCP 対応アカウントで開発者モードを有効にし、Plugins ページの追加ボタンから名前と URL を登録。会話で有効にします。管理者の制限も確認してください。', 'With an account that supports custom MCP, enable developer mode and add a connection from the plus button on the Plugins page using the name and URL. Enable it in the conversation’s tool picker. Workspace policies may restrict access.')}</p>}
      <p className="handbook-source">{t('客户端官方说明：', '公式手順：', 'Official instructions: ')}<a href={client === 'Codex' ? 'https://developers.openai.com/codex/mcp' : client === 'ChatGPT' ? 'https://developers.openai.com/apps-sdk/deploy/connect-chatgpt' : client === 'Claude Code' ? 'https://code.claude.com/docs/en/mcp' : 'https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp'} target="_blank" rel="noreferrer">{client}<ArrowRight size={13} /></a></p>
    </Block>
    <Block title={t('3. 确认账号与授权范围', '3. アカウントと認可範囲を確認', '3. Review the account and permissions')}><p>{t(`在本站授权页确认账号（当前为 ${username}），阅读访问范围后允许连接。保存学习内容需要相应的写入权限。`, `認可ページでアカウント（現在 ${username}）とアクセス範囲を確認します。保存には書き込み権限が必要です。`, `On the consent page, check the account (currently ${username}) and access scope. Saving content needs the corresponding write permission.`)}</p></Block>
    <Block title={t('4. 先读一次，确认真的接好了', '4. 読み取りを試して確認', '4. Verify with a read-only request')}><CopyPrompt text={t('请通过 JLPT Master Deck 读取我的单词本列表，告诉我本子名称；这次不要新增或修改数据。如果没有本子，请如实告诉我。', 'JLPT Master Deck で私の単語帳一覧を読み、名前を教えて。今回は変更しないで。なければそのまま教えて。', 'Use JLPT Master Deck to list my wordbook names without changing anything. If none exist, say so.')} t={t} /><p>{t('能列出真实本子或明确返回空列表，并且没有工具错误，才算这次读取成功。只看到客户端名称出现在授权列表，还不能证明工具调用成功。', '実際の一覧または空の結果がエラーなく返れば成功。認可一覧に名前があるだけでは動作確認にはなりません。', 'A real list or an explicit empty result without tool errors verifies the read. An authorization entry alone does not verify tool use.')}</p></Block>
    <details className="handbook-details"><summary>{t('连接失败时怎么排查', '接続できないとき', 'Troubleshooting')}</summary><p>{t('找不到入口：查看客户端套餐与工作区权限。无法连接：检查地址是否以 /api/jlpt/mcp 结尾、是否能从客户端访问。提示未授权：重新完成登录。能读不能写：核对授权范围。没有本子：先新建一个，再读取验证。', '入口がない場合はプランや管理者設定、接続失敗は URL と到達性、認可エラーは再ログイン、書き込み失敗は権限を確認します。', 'Missing setup entry: check plan and workspace access. Connection failure: check the endpoint and reachability. Unauthorized: sign in again. Read works but write fails: review permissions.')}</p></details>
  </>;
}
function AutomationChapter({ t, locale }: { t: T; locale: Locale }) {
  const lesson = guideLesson('schedule' as AiCapabilityId, locale);
  return <><Block title={t('从一个小任务开始', '小さなタスクから', 'Start with one small task')}><CopyPrompt text={t('每天早上 7 点（Asia/Tokyo），通过 JLPT Master Deck 用到期的 N1 单词生成 10 道读音题，带答案与解析，保存为练习草稿。词条不足时报告实际数量，不要编造来源。只有执行失败或需要我处理时通知我。', '毎朝 7 時（Asia/Tokyo）、JLPT Master Deck の期限が来た N1 語彙で読み問題を 10 問、解答・解説付きでドラフト保存。不足は報告し、失敗か対応が必要なときだけ通知して。', 'Every day at 7 AM Asia/Tokyo, use due N1 words in JLPT Master Deck to draft 10 reading questions with answers and explanations. Report insufficient sources. Notify me only on failure or when action is needed.')} t={t} /></Block><Block title={t('设置与检查', '設定と確認', 'Set up and verify')}><ol className="handbook-steps">{lesson.steps.map((step, i) => <li key={step}><span>{i + 1}</span><p>{step}</p></li>)}</ol><p className="handbook-note">{lesson.check}</p></Block><Block title={t('第一次运行后，核对这三项', '初回に確認すること', 'After the first run')}><p>{t('执行时间是否符合你的时区；草稿是否真的保存；题量与来源是否符合要求。若客户端没有定时功能，可以继续手动运行同一段提示词，或使用你已有的调度工具。', '時刻・タイムゾーン、実際の保存、数量と出典を確認。定期機能がなければ手動か既存のスケジューラーを使えます。', 'Verify the timezone, saved draft, question count and source. If your client cannot schedule, run the same prompt manually or use an existing scheduler.')}</p><a className="handbook-text-link" href="#/drafts">{t('打开练习草稿', '練習ドラフトを開く', 'Open practice drafts')}<ArrowRight size={16} /></a></Block></>;
}
