import { ArrowRight, BarChart3, BookOpenCheck, Bot, ClipboardPenLine, Database, Flame, ListChecks, ShieldCheck, Target } from 'lucide-react';

const primaryActions = [
  {
    icon: BookOpenCheck,
    title: '今日复习',
    promise: '打开就知道今天先做什么',
    detail: '词汇、文法、阅读、听力会按当前状态排出优先级。',
    href: '#/home/questions',
    cta: '开始今天任务',
    tone: 'bg-[#edf8f1] border-[#b9d9c6] text-[#24483b]',
  },
  {
    icon: ClipboardPenLine,
    title: '记录错题',
    promise: '不会的题先留下来',
    detail: '把错题、难句、听力卡点放进自己的复习队列。',
    href: '#/capture',
    cta: '保存一个难点',
    tone: 'bg-[#fff2f6] border-[#e3b8cb] text-[#63354e]',
  },
  {
    icon: BarChart3,
    title: '薄弱点',
    promise: '知道下次该补哪里',
    detail: '做完练习后回看错因、模块趋势和下一步安排。',
    href: '#/insights',
    cta: '查看学习状态',
    tone: 'bg-[#eef5ff] border-[#bdd0eb] text-[#2d496d]',
  },
];

const productHighlights = [
  {
    icon: Target,
    title: '不用再到处找题',
    text: '你做错过、卡住过的内容，会变成下一次复习的重点。',
  },
  {
    icon: ListChecks,
    title: '打开就能开始',
    text: '首页会直接告诉你今天先复习什么，碎片时间也能推进。',
  },
  {
    icon: Flame,
    title: '昨天不会的，今天继续补',
    text: '错题和薄弱点会留下记录，下一轮复习不会从零开始。',
  },
];

const aiIntro = [
  {
    icon: Bot,
    title: '网页和 AI 各管一半',
    text: '网页负责记录、练习、判分和进度；Claude、ChatGPT、Claude Code 或 Codex 通过 MCP 读取你的学习数据，帮你整理词条、分析弱点、出题和排计划，结果写回网页。',
  },
  {
    icon: Database,
    title: '数据只属于你',
    text: '本地优先：学习记录和复习进度先存在你自己的账号里。AI 只能访问授权时那个账号的数据，看不到其他用户。',
  },
  {
    icon: ShieldCheck,
    title: '写入有边界',
    text: '授权按范围区分：只读、写入学习记录、写入题库，授权页会一一列出。AI 生成的复习材料先进草稿，不会直接覆盖题库；发布是你在网页里点的。随时可以断开，令牌立即失效。',
  },
];

function ActionCard({
  icon: Icon,
  title,
  promise,
  detail,
  href,
  cta,
  tone,
}: {
  icon: typeof BookOpenCheck;
  title: string;
  promise: string;
  detail: string;
  href: string;
  cta: string;
  tone: string;
}) {
  return (
    <a href={href} className={`group grid min-h-[220px] content-between rounded-lg border p-5 transition hover:-translate-y-0.5 hover:shadow-lg ${tone}`}>
      <div>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-white/75">
          <Icon size={25} />
        </div>
        <p className="text-sm font-semibold opacity-75">{title}</p>
        <h2 className="mt-2 text-2xl font-bold leading-tight">{promise}</h2>
        <p className="mt-3 text-sm leading-6 opacity-80">{detail}</p>
      </div>
      <span className="mt-5 inline-flex w-fit items-center gap-2 rounded-md bg-white/80 px-3 py-2 text-sm font-semibold">
        {cta} <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
      </span>
    </a>
  );
}

function MiniPhonePreview() {
  return (
    <div className="mx-auto w-full max-w-[260px] rounded-[28px] border-8 border-[#1d2522] bg-white p-3 shadow-2xl">
      <div className="mx-auto mb-3 h-4 w-20 rounded-full bg-[#1d2522]" />
      <div className="rounded-lg bg-[#f4faf6] p-3">
        <p className="text-xs font-semibold text-[#2d5c4e]">今日任务</p>
        <p className="mt-1 text-2xl font-bold text-[#1f312c]">18 分钟</p>
        <p className="mt-1 text-xs text-[#64706a]">先完成最容易掉分的项目</p>
      </div>
      <div className="mt-3 space-y-2">
        <div className="rounded-md border border-[#e5eee8] p-2">
          <p className="text-xs font-semibold text-[#26332f]">文法复习</p>
          <div className="mt-2 h-2 rounded-full bg-[#e8eee9]">
            <div className="h-2 w-2/3 rounded-full bg-[#2f9a6f]" />
          </div>
        </div>
        <div className="rounded-md border border-[#f0e3ea] p-2">
          <p className="text-xs font-semibold text-[#63354e]">错题回看</p>
          <p className="mt-1 text-xs text-[#6b5d64]">3 题需要再做一次</p>
        </div>
      </div>
    </div>
  );
}

export function PublicIntroPanel() {
  return (
    <main className="min-h-[100dvh] bg-[#f7f8f4] text-[#25312d]">
      <header className="fixed left-0 right-0 top-0 z-20 border-b border-white/30 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-8">
          <a href="#/about" className="text-sm font-bold text-[#21332d]">JLPT Review</a>
          <a href="#/home/questions" className="inline-flex items-center gap-2 rounded-md bg-[#d95f8a] px-4 py-2 text-sm font-semibold text-white shadow-sm">
            登录开始 <ArrowRight size={15} />
          </a>
        </div>
      </header>

      <section className="relative min-h-[82vh] overflow-hidden pt-20">
        <img
          src="/promotions/jlpt-review-hero.png"
          alt="JLPT Review 应用展示"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/78 to-white/10" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 pb-8 pt-10 md:grid-cols-[minmax(0,560px)_280px] md:justify-between md:px-8 md:pt-16">
          <div className="max-w-xl">
            <p className="text-sm font-semibold text-[#2d6b55]">JLPT 备考，每天先做最该做的题</p>
            <h1 className="mt-3 text-4xl font-black leading-tight text-[#1f2e2a] md:text-5xl">
              <span className="block">错题不再白做，</span>
              <span className="block">每天复习接得上。</span>
            </h1>
            <p className="mt-5 text-base leading-8 text-[#40504a] md:text-lg">
              把不会的词、文法、阅读和听力问题，整理成今天能完成的复习任务。
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#/home/questions" className="inline-flex items-center gap-2 rounded-md bg-[#2f6f58] px-5 py-3 text-sm font-semibold text-white shadow-md">
                开始今日复习 <ArrowRight size={16} />
              </a>
              <a href="#/capture" className="inline-flex items-center gap-2 rounded-md border border-[#bbcfc6] bg-white/80 px-5 py-3 text-sm font-semibold text-[#2d5549]">
                先记录一条错题
              </a>
            </div>
          </div>
          <MiniPhonePreview />
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-10 grid max-w-6xl gap-4 px-4 pb-8 md:grid-cols-3 md:px-8">
        {primaryActions.map((action) => (
          <ActionCard key={action.title} {...action} />
        ))}
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-10 md:grid-cols-3 md:px-8">
        {productHighlights.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex gap-3 border-t border-[#d9dfda] py-5">
            <Icon size={20} className="mt-0.5 shrink-0 text-[#2f6f58]" />
            <div>
              <h2 className="text-sm font-bold text-[#25312d]">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-[#58625d]">{text}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 md:px-8">
        <div className="rounded-2xl border border-[#d9e6de] bg-white p-6 md:p-8">
          <p className="text-sm font-semibold text-[#2d6b55]">接入 AI</p>
          <h2 className="mt-2 text-2xl font-black leading-tight text-[#1f2e2a] md:text-3xl">把它接进你常用的 AI，它就能替你动手</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#40504a]">一句话让 AI 整理词条、分析错题、出今日练习、排备考计划，还能设成定时任务自动跑。登录后在「AI 助手」里三步接好。</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {aiIntro.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-xl bg-[#f4faf6] p-4">
                <Icon size={20} className="text-[#2f6f58]" />
                <h3 className="mt-3 text-sm font-bold text-[#25312d]">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-[#58625d]">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
