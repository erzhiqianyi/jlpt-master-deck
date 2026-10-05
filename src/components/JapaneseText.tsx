import type { JapaneseAnnotation } from '../types';
import { useSpeech } from './SpeechControls';

/** Shared renderer for Japanese in the native app's embedded exam page. */
export function JapaneseText({ text, annotations = [], ruby = false }: { text: string; annotations?: JapaneseAnnotation[]; ruby?: boolean }) {
  const settings = useSpeech()?.settings;
  const display = settings?.japaneseDisplay;
  const annotation = annotations.find(a => a.text === text && a.tokens.every(t => t.surface) && a.tokens.map(t => t.surface).join('') === text);
  const tokens: JapaneseAnnotation['tokens'] = annotation?.tokens ?? Array.from(new Intl.Segmenter('ja', { granularity: 'word' }).segment(text), s => ({ surface: s.segment }));
  if (!display?.segmented && !ruby) return <>{text}</>;
  return <>{tokens.map((token, i) => {
    const pos = token.pos;
    const style = pos && display?.segmented ? display.styles[pos as keyof typeof display.styles] : undefined;
    const reading = token.reading;
    const gap = display?.segmented && i > 0 && /[\p{L}\p{N}]$/u.test(tokens[i - 1].surface) && /^[\p{L}\p{N}]/u.test(token.surface) && (Boolean(annotation) || /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(tokens[i - 1].surface + token.surface));
    return <span key={i}>{gap ? '\u2009' : ''}<span style={style?.mode === 'text' ? { color: style.color } : style?.mode === 'underline' ? { textDecoration: 'underline', textDecorationColor: style.color, textUnderlineOffset: '0.2em' } : undefined}>{ruby && settings?.showExplanationRuby && reading && /\p{Script=Han}/u.test(token.surface) ? <ruby>{token.surface}<rt>{reading}</rt></ruby> : token.surface}</span></span>;
  })}</>;
}
