import { useState } from 'react';
import { ArrowRight, BookOpenText, CalendarDays, Check, RotateCcw } from 'lucide-react';
import './login-landing.css';

const examples = [
  { name: '今日练习', eyebrow: '01 / 从今天的一小步开始', title: '今天，练会一个区别。', subtitle: '语法辨析 · 示例', prompt: '「に限って」与「に限り」有什么不同？', body: '从容易混淆的表达开始，做题后结合解析，理解使用场景。', next: '做一组专项练习，再回看错题。' },
  { name: '单词与语法', eyebrow: '02 / 把遇到的表达留下来', title: '概観（がいかん）', subtitle: '单词笔记 · 示例', prompt: '先看全貌，再理解细节。', body: '物事の全体を、大まかに見渡すこと。\n例：日本文学の歴史を概観する。', next: '结合读音、释义和例句记住这个词。' },
  { name: '对话表达', eyebrow: '03 / 从理解到自然说出口', title: '打电话预订酒店', subtitle: '对话场景 · 示例', prompt: 'シングルルームを予約したいんですが。', body: '先了解人物关系和礼貌程度，再参考关键词与完整对话，练习自己的回答。', next: '确认日期、人数和房型，再结束通话。' },
];
function loginMessage(error: string) {
  if (!error) return '';
  if (error.includes('popup-closed-by-user') || error.includes('cancelled-popup-request')) return '登录窗口已关闭。准备好后，可以重新登录。';
  if (error.includes('popup-blocked')) return '浏览器拦截了登录窗口，请允许弹出窗口后重试。';
  if (error.includes('network-request-failed')) return '暂时无法连接登录服务，请检查网络后重试。';
  return '暂时无法登录，请稍后重试。';
}
export function LoginLanding({ error, loading, onGoogle }: { error: string; loading: boolean; onGoogle: () => void }) {
  const [selected, setSelected] = useState(0);
  const example = examples[selected];
  return <main className="jlpt-welcome">
    <header className="welcome-header"><a href="#" className="welcome-brand"><span><BookOpenText size={25}/></span><div>JLPT Master Deck<small>一日一歩 · 日本語の学び</small></div></a><span className="welcome-header-note">让学习，慢慢积累。</span></header>
    <section className="welcome-hero" aria-labelledby="welcome-title">
      <div className="welcome-intro"><p className="welcome-eyebrow">为下一次听懂、读懂、说清楚</p><h1 id="welcome-title">把每天的日语学习，<br/><em>变成看得见的进步。</em></h1><p className="welcome-description">从记住一个词，到读懂一段文章、说好一段对话。<br/>把练习、笔记和复习放在一起，找到今天可以前进的一步。</p>
        <div className="welcome-actions"><button className="welcome-login" onClick={onGoogle} disabled={loading}>{loading ? '正在登录…' : '使用 Google 登录'}<ArrowRight size={18}/></button><button className="welcome-preview-link" onClick={() => document.getElementById('learning-preview')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>先看看学习示例 ↓</button></div>
        {error ? <p role="alert" className="welcome-error">{loginMessage(error)}</p> : null}
      </div>
      <section id="learning-preview" className="welcome-preview" aria-label="学习示例"><header><span><BookOpenText size={17}/>学习的一页</span><small>演示内容 · 无需登录</small></header><div className="welcome-tabs" role="tablist" aria-label="学习示例">{examples.map((item, index) => <button id={`preview-tab-${index}`} key={item.name} role="tab" aria-selected={selected === index} aria-controls="preview-panel" tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={(event) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (selected + (event.key === 'ArrowRight' ? 1 : 2)) % 3; setSelected(next); document.getElementById(`preview-tab-${next}`)?.focus(); } }}>{item.name}</button>)}</div>
        <div id="preview-panel" role="tabpanel" aria-labelledby={`preview-tab-${selected}`} className="welcome-example"><small>{example.eyebrow}</small><h2>{example.title}</h2><p className="welcome-example-subtitle">{example.subtitle}</p><h3>{example.prompt}</h3><p>{example.body}</p><div className="welcome-next"><Check size={18}/><div><small>下一步</small><p>{example.next}</p></div></div></div>
        <footer><span>示例仅用于了解功能，不会写入学习记录。</span><span>0{selected + 1} / 03</span></footer>
      </section>
    </section>
    <section className="welcome-features" aria-label="学习方式">{[{ icon: CalendarDays, title: '知道今天练什么', body: '从每日练习和专项主题开始，把学习拆成可以完成的一小步。' }, { icon: BookOpenText, title: '把知识连起来', body: '整理单词、语法和例句，在阅读与听力中理解它们的用法。' }, { icon: RotateCcw, title: '让复习有方向', body: '回看练习记录与错题，找到需要巩固的地方，再练一次。' }].map(({ icon: Icon, title, body }, index) => <article key={title}><div><Icon size={20}/><small>0{index + 1}</small></div><h2>{title}</h2><p>{body}</p></article>)}</section>
    <section className="welcome-faq" aria-label="使用前了解"><details><summary>登录后，从哪里开始？</summary><p>先打开“今天”查看练习，或到“练习”选择单词、语法、阅读、听力和表达主题。</p></details><details><summary>示例会影响我的学习记录吗？</summary><p>不会。这些是用于展示学习方式的固定示例，切换和浏览都不会保存答题记录。</p></details></section>
    <footer className="welcome-footer"><span>JLPT MASTER DECK</span><span>一日一歩。按自己的节奏学习。</span></footer>
  </main>;
}
