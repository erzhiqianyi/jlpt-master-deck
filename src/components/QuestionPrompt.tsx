import type { Locale } from '../types';

export function QuestionPrompt({ text, target, locale = 'zh-CN' }: { text: string; target?: string; locale?: Locale }) {
  // Legacy passage questions append the specific blank instruction to the passage.
  // Only split when that same numbered blank exists in the preceding text.
  const blankQuestion = text.match(/(【[0-9０-９]+】)\s*に入る(?:最もよい)?ものを選びなさい[。．.]?\s*$/u);
  const passage = blankQuestion ? text.slice(0, blankQuestion.index).trimEnd() : '';
  if (blankQuestion && passage.includes(blankQuestion[1])) {
    const marker = blankQuestion[1];
    const label = locale === 'zh-CN' ? `本题填写空格 ${marker}` : locale === 'ja' ? `解答する空欄 ${marker}` : `Choose an answer for blank ${marker}`;
    const parts = passage.split(marker);
    return <>
      <span className="whitespace-pre-line">{parts.map((part, index) => <span key={index}>
        {index > 0 ? <mark className="practice-active-blank" aria-label={label}>{marker}</mark> : null}
        <QuestionPrompt text={part} target={target} locale={locale} />
      </span>)}</span>
      <span className="practice-blank-instruction">{label}</span>
    </>;
  }
  if (!target) return text;
  const targetIndex = text.indexOf(target);
  if (targetIndex < 0) return text;
  return <>{text.slice(0, targetIndex)}<span className="font-semibold underline decoration-2 underline-offset-4">{target}</span>{text.slice(targetIndex + target.length)}</>;
}

