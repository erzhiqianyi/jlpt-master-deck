import { useState } from 'react';
import { ArrowRight, BookOpenText, CalendarDays, Check, RotateCcw } from 'lucide-react';
import type { Locale } from '../../types';
import './login-landing.css';

export function LoginLanguageSelect({ locale, onChange }: { locale: Locale; onChange: (locale: Locale) => void }) {
  const label = locale === 'ja' ? '表示言語' : locale === 'en' ? 'Language' : '界面语言';
  return <label className="welcome-language"><span>{label}</span><select aria-label={label} value={locale} onChange={(event) => onChange(event.target.value as Locale)}>
    <option value="zh-CN">简体中文</option><option value="ja">日本語</option><option value="en">English</option>
  </select></label>;
}

function loginMessage(error: string, locale: Locale) {
  if (!error) return '';
  const copy = locale === 'ja'
    ? { closed: 'ログイン画面が閉じられました。もう一度お試しください。', blocked: 'ログイン画面がブロックされました。ポップアップを許可してください。', network: 'ログインサービスに接続できません。ネットワークを確認してください。', other: 'ログインできませんでした。しばらくしてからお試しください。' }
    : locale === 'en'
      ? { closed: 'The sign-in window was closed. Please try again.', blocked: 'The sign-in window was blocked. Allow pop-ups and try again.', network: 'Could not reach the sign-in service. Check your connection.', other: 'Could not sign in. Please try again later.' }
      : { closed: '登录窗口已关闭。准备好后，可以重新登录。', blocked: '浏览器拦截了登录窗口，请允许弹出窗口后重试。', network: '暂时无法连接登录服务，请检查网络后重试。', other: '暂时无法登录，请稍后重试。' };
  if (error.includes('popup-closed-by-user') || error.includes('cancelled-popup-request')) return copy.closed;
  if (error.includes('popup-blocked')) return copy.blocked;
  if (error.includes('network-request-failed')) return copy.network;
  return copy.other;
}

function landingCopy(locale: Locale) {
  if (locale === 'ja') return {
    tagline: '一日一歩 · 日本語の学び', headerNote: '学びを少しずつ積み重ねる。', eyebrow: '次に聞き取れる、読める、伝えられるように', title: '毎日の日本語学習を、', titleAccent: '見える進歩に。', description: '一つの単語を覚えることから、文章を読み、会話で伝えることまで。\n練習・メモ・復習を一か所にまとめ、今日の一歩を見つけましょう。', login: 'Google でログイン', loggingIn: 'ログイン中…', previewLink: '学習例を見る ↓', previewAria: '学習例', previewTitle: '学習の一ページ', demo: 'デモ内容 · ログイン不要', next: '次の一歩', previewFooter: '表示例です。学習記録には保存されません。', ways: '学習方法', faq: 'ご利用前に', footer: '一日一歩。自分のペースで学びましょう。', support: 'サポート・ご意見', privacy: 'プライバシーポリシー案', terms: '利用規約案',
    features: [
      { title: '今日の練習がわかる', body: '毎日の練習と分野別の課題から、取り組みやすい一歩を選べます。' },
      { title: '知識をつなげる', body: '単語・文法・例文を整理し、読解や聴解で使い方を理解します。' },
      { title: '目的を持って復習する', body: '練習履歴と間違えた問題を振り返り、必要なところをもう一度練習します。' },
    ],
    faqs: [
      { question: 'ログイン後はどこから始めますか？', answer: '「今日」で今日の練習を確認するか、「練習」で単語・文法・読解・聴解などを選んでください。' },
      { question: '学習例は記録に影響しますか？', answer: 'いいえ。学習方法を紹介する固定の表示例で、切り替えたり読んだりしても解答履歴は保存されません。' },
    ],
    examples: [
      { name: '今日の練習', eyebrow: '01 / 今日の小さな一歩から', title: '今日は一つの違いを身につける。', subtitle: '文法の使い分け · 表示例', prompt: '「に限って」と「に限り」はどう違いますか？', body: '混同しやすい表現から始め、解説を読みながら使う場面を理解します。', next: '分野別の問題を解き、間違えた問題を振り返りましょう。' },
      { name: '単語と文法', eyebrow: '02 / 出会った表現を残す', title: '概観（がいかん）', subtitle: '単語メモ · 表示例', prompt: 'まず全体を見渡し、細部を理解する。', body: '物事の全体を、大まかに見渡すこと。\n例：日本文学の歴史を概観する。', next: '読み方・意味・例文を結びつけて覚えましょう。' },
      { name: '会話表現', eyebrow: '03 / 理解から自然な発話へ', title: 'ホテルを電話で予約する', subtitle: '会話の場面 · 表示例', prompt: 'シングルルームを予約したいんですが。', body: '相手との関係や丁寧さを確認し、キーワードと会話例を参考に答えてみましょう。', next: '日付・人数・部屋の種類を確認して会話を終えましょう。' },
    ],
  };
  if (locale === 'en') return {
    tagline: 'One step a day · Learning Japanese', headerNote: 'Let your learning add up.', eyebrow: 'For the next time you listen, read and speak', title: 'Turn daily Japanese study', titleAccent: 'into visible progress.', description: 'From remembering one word to understanding an article and speaking in a conversation.\nKeep practice, notes and review together, and find one step to take today.', login: 'Sign in with Google', loggingIn: 'Signing in…', previewLink: 'See a learning example ↓', previewAria: 'Learning examples', previewTitle: 'A page from your study', demo: 'Demo content · No sign-in needed', next: 'Next step', previewFooter: 'Examples show how the app works and are not saved to your study record.', ways: 'Ways to learn', faq: 'Before you begin', footer: 'One step a day. Learn at your own pace.', support: 'Support and feedback', privacy: 'Draft privacy policy', terms: 'Draft terms',
    features: [
      { title: 'Know what to practice today', body: 'Start with daily practice or a topic, and turn studying into manageable steps.' },
      { title: 'Connect what you learn', body: 'Organize words, grammar and examples, then see them used in reading and listening.' },
      { title: 'Review with purpose', body: 'Revisit your practice history and mistakes, then focus on what needs work.' },
    ],
    faqs: [
      { question: 'Where do I start after signing in?', answer: 'Open Today to see your practice, or choose words, grammar, reading, listening or speaking topics under Practice.' },
      { question: 'Do the examples affect my study record?', answer: 'No. These fixed examples show how learning works and do not save answers when you browse them.' },
    ],
    examples: [
      { name: 'Daily practice', eyebrow: '01 / Start with one small step', title: 'Learn one distinction today.', subtitle: 'Grammar comparison · Example', prompt: 'How are 「に限って」 and 「に限り」 different?', body: 'Start with expressions that are easy to confuse, then use the explanations to understand when to use each one.', next: 'Try a topic set and review any mistakes.' },
      { name: 'Words and grammar', eyebrow: '02 / Save expressions you encounter', title: '概観（がいかん）', subtitle: 'Vocabulary note · Example', prompt: 'See the whole picture before the details.', body: '物事の全体を、大まかに見渡すこと。\n例：日本文学の歴史を概観する。', next: 'Connect the reading, meaning and example sentence.' },
      { name: 'Conversation', eyebrow: '03 / From understanding to speaking', title: 'Booking a hotel by phone', subtitle: 'Dialogue scene · Example', prompt: 'シングルルームを予約したいんですが。', body: 'Check the relationship and level of politeness, then practice your own response using the keywords and dialogue.', next: 'Confirm the date, number of guests and room type before ending the call.' },
    ],
  };
  return {
    tagline: '一日一歩 · 日本語の学び', headerNote: '让学习，慢慢积累。', eyebrow: '为下一次听懂、读懂、说清楚', title: '把每天的日语学习，', titleAccent: '变成看得见的进步。', description: '从记住一个词，到读懂一段文章、说好一段对话。\n把练习、笔记和复习放在一起，找到今天可以前进的一步。', login: '使用 Google 登录', loggingIn: '正在登录…', previewLink: '先看看学习示例 ↓', previewAria: '学习示例', previewTitle: '学习的一页', demo: '演示内容 · 无需登录', next: '下一步', previewFooter: '示例仅用于了解功能，不会写入学习记录。', ways: '学习方式', faq: '使用前了解', footer: '一日一歩。按自己的节奏学习。', support: '支持与反馈', privacy: '隐私政策草案', terms: '使用条款草案',
    features: [
      { title: '知道今天练什么', body: '从每日练习和专项主题开始，把学习拆成可以完成的一小步。' },
      { title: '把知识连起来', body: '整理单词、语法和例句，在阅读与听力中理解它们的用法。' },
      { title: '让复习有方向', body: '回看练习记录与错题，找到需要巩固的地方，再练一次。' },
    ],
    faqs: [
      { question: '登录后，从哪里开始？', answer: '先打开“今天”查看练习，或到“练习”选择单词、语法、阅读、听力和表达主题。' },
      { question: '示例会影响我的学习记录吗？', answer: '不会。这些是用于展示学习方式的固定示例，切换和浏览都不会保存答题记录。' },
    ],
    examples: [
      { name: '今日练习', eyebrow: '01 / 从今天的一小步开始', title: '今天，练会一个区别。', subtitle: '语法辨析 · 示例', prompt: '「に限って」与「に限り」有什么不同？', body: '从容易混淆的表达开始，做题后结合解析，理解使用场景。', next: '做一组专项练习，再回看错题。' },
      { name: '单词与语法', eyebrow: '02 / 把遇到的表达留下来', title: '概観（がいかん）', subtitle: '单词笔记 · 示例', prompt: '先看全貌，再理解细节。', body: '物事の全体を、大まかに見渡すこと。\n例：日本文学の歴史を概観する。', next: '结合读音、释义和例句记住这个词。' },
      { name: '对话表达', eyebrow: '03 / 从理解到自然说出口', title: '打电话预订酒店', subtitle: '对话场景 · 示例', prompt: 'シングルルームを予約したいんですが。', body: '先了解人物关系和礼貌程度，再参考关键词与完整对话，练习自己的回答。', next: '确认日期、人数和房型，再结束通话。' },
    ],
  };
}

export function LoginLanding({ error, loading, onGoogle, locale, onLocaleChange }: { error: string; loading: boolean; onGoogle: () => void; locale: Locale; onLocaleChange: (locale: Locale) => void }) {
  const [selected, setSelected] = useState(0);
  const copy = landingCopy(locale);
  const example = copy.examples[selected];
  return <main className="jlpt-welcome" lang={locale}>
    <header className="welcome-header"><a href="#" className="welcome-brand"><span><BookOpenText size={25}/></span><div>JLPT Master Deck<small>{copy.tagline}</small></div></a><div className="welcome-header-tools"><span className="welcome-header-note">{copy.headerNote}</span><LoginLanguageSelect locale={locale} onChange={onLocaleChange}/></div></header>
    <section className="welcome-hero" aria-labelledby="welcome-title">
      <div className="welcome-intro"><p className="welcome-eyebrow">{copy.eyebrow}</p><h1 id="welcome-title">{copy.title}<br/><em>{copy.titleAccent}</em></h1><p className="welcome-description">{copy.description}</p>
        <div className="welcome-actions"><button className="welcome-login" onClick={onGoogle} disabled={loading}>{loading ? copy.loggingIn : copy.login}<ArrowRight size={18}/></button><button className="welcome-preview-link" onClick={() => document.getElementById('learning-preview')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>{copy.previewLink}</button></div>
        {error ? <p role="alert" className="welcome-error">{loginMessage(error, locale)}</p> : null}
      </div>
      <section id="learning-preview" className="welcome-preview" aria-label={copy.previewAria}><header><span><BookOpenText size={17}/>{copy.previewTitle}</span><small>{copy.demo}</small></header><div className="welcome-tabs" role="tablist" aria-label={copy.previewAria}>{copy.examples.map((item, index) => <button id={`preview-tab-${index}`} key={item.name} role="tab" aria-selected={selected === index} aria-controls="preview-panel" tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={(event) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (selected + (event.key === 'ArrowRight' ? 1 : 2)) % 3; setSelected(next); document.getElementById(`preview-tab-${next}`)?.focus(); } }}>{item.name}</button>)}</div>
        <div id="preview-panel" role="tabpanel" aria-labelledby={`preview-tab-${selected}`} className="welcome-example"><small>{example.eyebrow}</small><h2>{example.title}</h2><p className="welcome-example-subtitle">{example.subtitle}</p><h3>{example.prompt}</h3><p>{example.body}</p><div className="welcome-next"><Check size={18}/><div><small>{copy.next}</small><p>{example.next}</p></div></div></div>
        <footer><span>{copy.previewFooter}</span><span>0{selected + 1} / 03</span></footer>
      </section>
    </section>
    <section className="welcome-features" aria-label={copy.ways}>{copy.features.map(({ title, body }, index) => { const Icon = [CalendarDays, BookOpenText, RotateCcw][index]; return <article key={title}><div><Icon size={20}/><small>0{index + 1}</small></div><h2>{title}</h2><p>{body}</p></article>; })}</section>
    <section className="welcome-faq" aria-label={copy.faq}>{copy.faqs.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section>
    <footer className="welcome-footer"><span>JLPT MASTER DECK</span><span>{copy.footer}</span><span><a href="/support/">{copy.support}</a> · <a href="/privacy/">{copy.privacy}</a> · <a href="/terms/">{copy.terms}</a></span></footer>
  </main>;
}
