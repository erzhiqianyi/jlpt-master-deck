import type { ReactNode } from 'react';
import { QuestionOptions } from './QuestionOptions';
import './question-renderer.css';

/** Rendering is shared; authorization, scoring, timers and navigation belong
 * to the calling practice/library container. No reveal is inferred from mode. */
export interface QuestionRendererProps {
  questionId: string;
  questionTypeId?: string;
  instruction?: ReactNode;
  prompt: ReactNode;
  promptClassName?: string;
  materials?: ReactNode;
  taskConditions?: string[];
  choices: string[];
  selected?: number | null;
  answerIndex?: number;
  reveal?: boolean;
  disabled?: boolean;
  paused?: boolean;
  onSelect: (index: number) => void;
  renderText?: (text: string,index:number) => ReactNode;
  optionPresentation?: 'default'|'reading';
  interactiveText?:boolean;
  optionClassName?: string;
  feedback?: ReactNode;
  freeResponse?: { value:string; onChange:(value:string)=>void; label:string };
}
export function QuestionRenderer({questionId,questionTypeId,instruction,prompt,promptClassName='',materials,taskConditions=[],choices,selected,answerIndex,reveal=false,disabled=false,paused=false,onSelect,renderText,optionClassName,optionPresentation,interactiveText,feedback,freeResponse}:QuestionRendererProps) {
  return <section className="question-renderer" data-question-id={questionId} data-question-type={questionTypeId} data-paused={paused || undefined}>
    {materials ? <div className="question-renderer-materials">{materials}</div> : null}
    {instruction ? <div className="question-renderer-instruction">{instruction}</div> : null}
    {taskConditions.length ? <ul className="question-renderer-conditions">{taskConditions.map((condition,index)=><li key={index}>{condition}</li>)}</ul> : null}
    <div className={'question-renderer-prompt '+promptClassName}>{prompt}</div>
    {freeResponse ? <label className="question-renderer-response">{freeResponse.label}<textarea value={freeResponse.value} disabled={disabled||paused} onChange={event=>freeResponse.onChange(event.target.value)} /></label> :
      <QuestionOptions choices={choices} selected={selected} answerIndex={answerIndex} reveal={reveal} disabled={disabled||paused} onSelect={onSelect} renderText={renderText} optionClassName={optionClassName} presentation={optionPresentation} interactiveText={interactiveText} />}
    {reveal && feedback ? <div className="question-renderer-feedback">{feedback}</div> : null}
  </section>;
}
