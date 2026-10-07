import type { ReactNode } from 'react';

export interface QuestionOptionsProps {
  choices:string[];selected?:number|null;answerIndex?:number;reveal?:boolean;disabled?:boolean;
  onSelect:(index:number)=>void;renderText?:(text:string,index:number)=>ReactNode;
  optionClassName?:string;presentation?:'default'|'reading';interactiveText?:boolean;
}
/** Containers authorize reveal; lookup text stays outside the answer button. */
export function QuestionOptions({choices,selected,answerIndex,reveal=false,disabled=false,onSelect,renderText=text=>text,optionClassName='',presentation='default',interactiveText=false}:QuestionOptionsProps) {
  const reading=presentation==='reading';
  return <div className={reading?'reading-choices mt-4':'question-options grid gap-3'}>{choices.map((choice,index)=>{
    const state=reveal&&answerIndex===index?'correct':selected===index?reveal?reading?'incorrect':'incorrect-selected':'selected':reading?'idle':'unanswered';
    const color=state==='correct'?'border-green-700 bg-green-50':state==='incorrect-selected'?'border-[#a34f3f] bg-[#fff0eb]':state==='selected'?'border-[#a34f3f] bg-[#faeee8]':'border-[#d8d1c8] bg-white';
    const cls=reading?'reading-choice':'study-answer-option flex min-h-14 w-full items-start gap-3 rounded-md border px-4 py-3 text-left text-base leading-7 '+color+' '+optionClassName;
    const numberClass=reading?'reading-choice-number':'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold';
    if(interactiveText) return <div key={index} data-answer-state={state} className={cls}>
      <button type="button" disabled={disabled} aria-label={`${index+1}. ${choice}`} aria-pressed={selected===index} aria-keyshortcuts={String(index+1)} onClick={()=>onSelect(index)} className={numberClass+' shrink-0'}>{index+1}</button>
      <span lang="ja" className="reading-segmented min-w-0 whitespace-pre-wrap break-words">{renderText(choice,index)}</span>
    </div>;
    return <button key={index} type="button" disabled={disabled} aria-keyshortcuts={String(index+1)} aria-pressed={selected===index}
      data-answer-state={state} onClick={()=>onSelect(index)} className={cls}>
      <span className={numberClass}>{reading?index+1:`${index+1}. `}</span>
      <span className="min-w-0 whitespace-pre-wrap break-words">{renderText(choice,index)}</span>
    </button>;
  })}</div>;
}
