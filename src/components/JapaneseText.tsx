import type { JapaneseAnnotation } from '../types';
import { useSpeech } from './SpeechControls';

/** Shared renderer for Japanese in the native app's embedded exam page. */
export function JapaneseText({ text, annotations = [], ruby = false, targetSpan }: { text: string; annotations?: JapaneseAnnotation[]; ruby?: boolean;targetSpan?:{start:number;end:number;text:string} }) {
  const settings = useSpeech()?.settings;
  // Exam callers reveal study styling together with the answer, never while answering.
  const display = ruby ? settings?.japaneseDisplay : undefined;
  const annotation = annotations.find(a => a.text === text && a.tokens.every(t => t.surface) && a.tokens.map(t => t.surface).join('') === text);
  const tokens: JapaneseAnnotation['tokens'] = annotation?.tokens ?? Array.from(new Intl.Segmenter('ja', { granularity: 'word' }).segment(text), s => ({ surface: s.segment }));
  const target=targetSpan&&Number.isInteger(targetSpan.start)&&Number.isInteger(targetSpan.end)&&targetSpan.start>=0&&targetSpan.end>targetSpan.start&&targetSpan.end<=text.length&&!/\p{Cs}/u.test(targetSpan.text)&&text.slice(targetSpan.start,targetSpan.end)===targetSpan.text?targetSpan:undefined;
  if (!display?.segmented && !ruby && !target) return <>{text}</>;
  let offset=0;
  return <>{tokens.map((token, i) => {
    const start=offset;offset+=token.surface.length;
    const pos = token.pos;
    const style = pos && display?.segmented ? display.styles[pos as keyof typeof display.styles] : undefined;
    const reading = token.reading;
    const gap = display?.segmented && i > 0 && /[\p{L}\p{N}]$/u.test(tokens[i - 1].surface) && /^[\p{L}\p{N}]/u.test(token.surface) && (Boolean(annotation) || /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(tokens[i - 1].surface + token.surface));
    const tokenStyle=style?.mode==='text'?{color:style.color}:style?.mode==='underline'?{textDecoration:'underline',textDecorationColor:style.color,textUnderlineOffset:'0.2em'}:undefined;
    const surface=target&&start<target.end&&offset>target.start?<>{token.surface.slice(0,Math.max(0,target.start-start))}<span className="underline decoration-2 underline-offset-4">{token.surface.slice(Math.max(0,target.start-start),Math.min(token.surface.length,target.end-start))}</span>{token.surface.slice(Math.min(token.surface.length,target.end-start))}</>:token.surface;
    return <span key={i}>{gap ? '\u2009' : ''}<span style={tokenStyle}>{ruby && settings?.showExplanationRuby && reading && /\p{Script=Han}/u.test(token.surface) ? <ruby>{surface}<rt>{reading}</rt></ruby> : surface}</span></span>;
  })}</>;
}
