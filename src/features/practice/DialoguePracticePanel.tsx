import { LearningCatalog } from '../../components/LearningCatalog';
import { LearningList, LearningListRow } from '../../components/LearningList';
import { ChevronLeft, ChevronRight, PlayCircle } from 'lucide-react';
import { useState } from 'react';
import { dialoguePractices } from '../../data/dialoguePractice';
import { DialogueRolePlay } from './DialogueRolePlay';

export function DialoguePracticePanel() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const selected = activeIndex === null ? null : dialoguePractices[activeIndex];

  if (!selected || activeIndex === null) return (
    <LearningCatalog columnLabels={["对话", "任务", null]} title="对话练习" items={dialoguePractices} searchText={(item) => `${item.title} ${item.task}`} onBack={() => { window.location.hash = '#/mixed/tips'; }} renderRow={(item) => <LearningListRow key={item.id} title={item.title} description={item.task} onOpen={() => { setActiveIndex(dialoguePractices.indexOf(item)); }}/>}/>

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
