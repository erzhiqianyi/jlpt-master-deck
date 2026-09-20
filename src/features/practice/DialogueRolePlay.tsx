import { useEffect, useRef, useState } from 'react';
import { dialogueGuidance, dialogueSummaries, type DialogueRegister } from '../../data/dialogueGuidance';
import type { DialoguePractice } from '../../data/dialoguePractice';

const registers: { value: DialogueRegister; label: string }[] = [
  { value: 'plain', label: '普通体' },
  { value: 'polite', label: '礼貌体（です・ます）' },
  { value: 'mixed', label: '根据对象或场合切换' },
];
const primaryButton = 'cute-button-primary min-h-11 rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40';
const secondaryButton = 'min-h-11 rounded-full border border-[#f0c9d4] bg-white px-4 py-2 text-sm font-bold text-[#a84269] hover:bg-[#fff0f5]';

export function DialogueRolePlay({ item, sceneIndex }: { item: DialoguePractice; sceneIndex: number }) {
  const guide = dialogueGuidance[item.id];
  const [simulating, setSimulating] = useState(false);
  const [roleName, setRoleName] = useState(guide.roles[0].name);
  const [visibleCount, setVisibleCount] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const role = guide.roles.find((entry) => entry.name === roleName)!;
  const next = item.turns[visibleCount];
  const ownTurn = next?.[0].split('→')[0] === roleName;
  const finished = visibleCount === item.turns.length;

  useEffect(() => {
    if (!simulating || !next || ownTurn) return;
    const timer = window.setTimeout(() => setVisibleCount((count) => Math.min(count + 1, item.turns.length)), 1000);
    return () => window.clearTimeout(timer);
  }, [simulating, visibleCount, roleName, next, ownTurn, item.turns.length]);

  useEffect(() => {
    const panel = chatRef.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [visibleCount, showHint, simulating]);

  function restart() {
    setVisibleCount(0);
    setShowHint(false);
  }

  function changeRole(name: string) {
    setRoleName(name);
    restart();
  }

  return (
    <div className="mt-5 min-w-0">
      {!simulating ? (
        <div className="dialogue-study-content">
          <section className="dialogue-study-overview" aria-label="场景要点" style={guide.illustration ? undefined : { gridTemplateColumns: 'minmax(0, 1fr)' }}>
            <div>
              <p className="dialogue-study-lead">{dialogueSummaries[item.id]}</p>
              <p className="dialogue-study-register"><span>语体</span>{new Set(guide.roles.map((entry) => entry.register)).size === 1
                ? `双方用${registers.find((register) => register.value === guide.roles[0].register)!.label}`
                : guide.roles.map((entry) => `${entry.name}：${registers.find((register) => register.value === entry.register)!.label}`).join('；')}</p>
            </div>
            {guide.illustration && <div role="img" aria-label={guide.illustration} className="dialogue-study-illustration" style={{ aspectRatio: '3 / 4', backgroundImage: 'url(/images/dialogue-scenes.png)', backgroundSize: '400% 200%', backgroundPosition: `${(sceneIndex % 4) * 100 / 3}% ${Math.floor(sceneIndex / 4) * 100}%` }} />}
          </section>
          <details className="dialogue-study-details">
            <summary>场景与表达说明</summary>
            <div>
              <p lang="ja">{item.scene}</p>
              <p><strong>任务：</strong>{item.task}</p>
              {guide.roles.map((entry) => <p key={entry.name}><strong>{entry.name}：</strong>{entry.reason}</p>)}
              <p><strong>开场：</strong>{item.opening}</p>
              <p><strong>收尾：</strong>{item.closing}</p>
            </div>
          </details>
          <section className="dialogue-study-keywords" aria-label="关键词">
            <h3>关键词</h3>
            <dl>{guide.keywords.map(([word, meaning]) => <div key={word}><dt lang="ja">{word}</dt><dd>{meaning}</dd></div>)}</dl>
          </section>
          <div className="dialogue-study-action">
            <button type="button" className={primaryButton} onClick={() => { restart(); setSimulating(true); }}>开始模拟练习</button>
            <span>选角色，开口说一遍</span>
          </div>
          <section className="dialogue-study-transcript" aria-label="完整参考对话">
            <h3>参考对话</h3>
            <ol>{item.turns.map(([speaker, text], index) => <li key={index}><span className="dialogue-study-speaker">{speaker}</span><p lang="ja">{text}</p></li>)}</ol>
          </section>
        </div>
      ) : null}

      {simulating ? (
        <section className="dialogue-chat" aria-label="分角色模拟对话">
          <header className="dialogue-chat-header">
            <button type="button" className={secondaryButton} onClick={() => setSimulating(false)}>返回参考</button>
            <label>我扮演<select aria-label="选择模拟角色" value={roleName} onChange={(event) => changeRole(event.target.value)}>{guide.roles.map((entry) => <option key={entry.name}>{entry.name}</option>)}</select></label>
          </header>
          <div className="dialogue-chat-context">
            {guide.illustration && <div role="img" aria-label={guide.illustration} style={{ aspectRatio: '3 / 4', backgroundImage: 'url(/images/dialogue-scenes.png)', backgroundSize: '400% 200%', backgroundPosition: `${(sceneIndex % 4) * 100 / 3}% ${Math.floor(sceneIndex / 4) * 100}%` }} />}
            <div style={guide.illustration ? undefined : { width: 'auto', flexShrink: 1 }}><strong>{guide.roles.filter((entry) => entry.name !== roleName).map((entry) => entry.name).join('、')} 与你对话</strong><p>{registers.find((entry) => entry.value === role.register)!.label} · {visibleCount} / {item.turns.length} 句</p><small>对方按参考台词接话，轮到你时停下。</small></div>
          </div>
          <div className="dialogue-chat-messages" ref={chatRef} role="log" aria-label="模拟对话记录" aria-live="polite" tabIndex={0}>
            <p className="dialogue-chat-start">对话开始</p>
            {item.turns.slice(0, visibleCount).map(([speaker, text], index) => {
              const mine = speaker.split('→')[0] === roleName;
              return <div key={index} className={`dialogue-chat-turn${mine ? ' is-mine' : ''}`}>
                <span className="dialogue-chat-avatar" aria-hidden="true">{speaker.split('→')[0].slice(0, 1)}</span>
                <div><span className="dialogue-chat-name">{speaker}{mine ? '（你 · 参考表达）' : ''}</span><p lang="ja" className="dialogue-chat-bubble">{text}</p></div>
              </div>;
            })}
            {next && !ownTurn ? <p className="dialogue-chat-waiting">{next[0]}正在接话…</p> : null}
            {finished ? <p className="dialogue-chat-start">对话结束 · 换个角色再试试</p> : null}
          </div>
          <div className="dialogue-chat-composer">
            {ownTurn && next ? <>
              <p className="dialogue-chat-prompt">轮到你了{next[0].includes('→') ? `，对${next[0].split('→')[1]}说` : ''}</p>
              <p className="dialogue-chat-keywords">{guide.keywords.map(([word]) => word).join(' · ')}</p>
              {showHint ? <p className="dialogue-chat-hint" lang="ja">{next[1]}</p> : null}
              <div className="dialogue-chat-actions">
                <button type="button" className={primaryButton} onClick={() => { setVisibleCount((count) => Math.min(count + 1, item.turns.length)); setShowHint(false); }}>我说完了，让对方接话</button>
                <button type="button" className={secondaryButton} aria-expanded={showHint} onClick={() => setShowHint(!showHint)}>{showHint ? '收起参考' : '看看怎么说'}</button>
              </div>
            </> : <p className="dialogue-chat-prompt" role="status">{finished ? '这段对话练完了。' : '听听对方怎么回应。'}</p>}
            <button type="button" className="dialogue-chat-restart" onClick={restart}>重新开始</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
