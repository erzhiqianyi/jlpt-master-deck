import { ChevronLeft, ChevronRight, PlayCircle } from 'lucide-react';
import { useState } from 'react';
import { dialoguePractices } from '../../data/dialoguePractice';
import { DialogueRolePlay } from './DialogueRolePlay';

export function DialoguePracticePanel() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const selected = activeIndex === null ? null : dialoguePractices[activeIndex];

  if (!selected || activeIndex === null) return (
    <section className="topic-library" aria-label="对话题目列表">
      <div className="topic-library-filters"><span>{dialoguePractices.length} 题</span></div>
      <ul className="topic-library-rows">
        {dialoguePractices.map((item, index) => <li key={item.id}>
          <button className="topic-library-row" type="button" onClick={() => setActiveIndex(index)}>
            <span className="topic-library-icon is-ready"><PlayCircle size={26} aria-hidden="true" /></span>
            <span className="topic-library-copy"><strong>{item.title}</strong><small>{item.task}</small></span>
            <span className="topic-library-action">开始<ChevronRight size={18} aria-hidden="true" /></span>
          </button>
        </li>)}
      </ul>
    </section>
  );

  return (
    <section className="cute-practice-card practice-swipe-surface dialogue-study-page min-w-0 border px-4 pb-6 pt-4 md:p-5" aria-label="对话练习">
      <div className="practice-question-section">
        <div className="practice-question-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-[#f0d4dd] pb-4">
          <p className="text-sm font-bold text-[#a84269]">对话练习</p>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <button type="button" aria-label="上一题" disabled={activeIndex === 0} onClick={() => setActiveIndex(activeIndex - 1)} className="flex h-11 w-11 items-center justify-center rounded-full border border-[#f0c9d4] bg-white text-[#a84269] hover:bg-[#fff0f5] disabled:opacity-40"><ChevronLeft size={18} /></button>
            <button type="button" aria-label={`题目列表：${activeIndex + 1} / ${dialoguePractices.length}`} onClick={() => setActiveIndex(null)} className="practice-progress-button flex min-h-10 min-w-24 flex-col items-center justify-center rounded-2xl bg-[#fff0f5] px-2 py-1 text-[#a84269] transition hover:bg-[#ffe6ef] md:min-w-32 md:px-3"><span className="journal-number text-sm font-black">{activeIndex + 1} / {dialoguePractices.length}</span></button>
            <button type="button" aria-label="下一题" disabled={activeIndex === dialoguePractices.length - 1} onClick={() => setActiveIndex(activeIndex + 1)} className="flex h-11 w-11 items-center justify-center rounded-full border border-[#f0c9d4] bg-white text-[#a84269] hover:bg-[#fff0f5] disabled:opacity-40"><ChevronRight size={18} /></button>
          </div>
        </div>
        <div className="mt-4" key={selected.id}>
          <h2 className="text-2xl font-black text-[#3d3036]">{selected.title}</h2>
          <DialogueRolePlay key={selected.id} item={selected} sceneIndex={activeIndex} />
        </div>
      </div>
    </section>
  );
}
