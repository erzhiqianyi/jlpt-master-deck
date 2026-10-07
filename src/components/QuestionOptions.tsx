import type { ReactNode } from 'react';

/** Containers control submission and permission; content controls option order. */
export function QuestionOptions({ choices, selected, answerIndex, reveal = false, disabled = false, onSelect, renderText = text => text }: {
  choices: string[]; selected?: number | null; answerIndex?: number; reveal?: boolean; disabled?: boolean;
  onSelect: (index: number) => void; renderText?: (text: string) => ReactNode;
}) {
  return <div className="question-options grid gap-3">{choices.map((choice, index) => {
    const state = reveal && answerIndex === index ? 'correct' : selected === index ? reveal ? 'incorrect-selected' : 'selected' : 'unanswered';
    const color = state === 'correct' ? 'border-green-700 bg-green-50' : state === 'incorrect-selected' ? 'border-[#a34f3f] bg-[#fff0eb]' : state === 'selected' ? 'border-[#a34f3f] bg-[#faeee8]' : 'border-[#d8d1c8] bg-white';
    return <button key={index} type="button" disabled={disabled} aria-keyshortcuts={String(index + 1)} aria-pressed={selected === index}
      data-answer-state={state} onClick={() => onSelect(index)}
      className={'study-answer-option flex min-h-14 w-full items-start gap-3 rounded-md border px-4 py-3 text-left text-base leading-7 ' + color}>
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold">{index + 1}. </span>
      <span className="min-w-0 whitespace-pre-wrap break-words">{renderText(choice)}</span>
    </button>;
  })}</div>;
}
