import type { ListeningQuestion } from '../types';

export type ListeningExplanationSection = { title: string; body: string; kind: 'analysis' | 'transcript' | 'translation' };

export function splitListeningExplanation(value: string): ListeningExplanationSection[] {
  const sections: ListeningExplanationSection[] = [];
  const heading = /^[ \t]*【([^】\n]{1,40})】[ \t]*$/gm;
  let previousEnd = 0;
  let previousTitle = '';
  for (const match of value.matchAll(heading)) {
    const body = value.slice(previousEnd, match.index).trim();
    if (body) sections.push({ title: previousTitle, body, kind: sectionKind(previousTitle) });
    previousTitle = match[1].trim();
    previousEnd = match.index + match[0].length;
  }
  const tail = value.slice(previousEnd).trim();
  if (tail) sections.push({ title: previousTitle, body: tail, kind: sectionKind(previousTitle) });
  return sections;
}

function sectionKind(title: string): ListeningExplanationSection['kind'] {
  if (/听力原文|聴解スクリプト|音声スクリプト|^原文$|transcript/i.test(title)) return 'transcript';
  if (/全文翻译|全文翻訳|原文翻译|原文翻訳|^翻译$|^翻訳$|translation/i.test(title)) return 'translation';
  return 'analysis';
}

type EditorContent = Pick<ListeningQuestion, 'choiceDetails' | 'explanation' | 'transcript' | 'transcriptTranslation'>;

/** Separate only recognizable legacy sections; keep every uncertain section in the overall explanation. */
export function listeningEditorContent(item: ListeningQuestion): EditorContent {
  const original = item.explanation ?? '';
  const sections = splitListeningExplanation(original);
  if (!sections.some((section) => section.title)) return {
    choiceDetails: item.choiceDetails ?? [], explanation: original,
    transcript: item.transcript ?? '', transcriptTranslation: item.transcriptTranslation ?? '',
  };
  const choiceDetails = item.choices.map((_, index) => ({
    translation: item.choiceDetails?.[index]?.translation ?? '',
    explanation: item.choiceDetails?.[index]?.explanation ?? '',
  }));
  let transcript = item.transcript ?? '';
  let transcriptTranslation = item.transcriptTranslation ?? '';
  let changed = false;
  const remaining: string[] = [];
  for (const section of sections) {
    if (section.kind === 'transcript' && (!transcript.trim() || transcript.trim() === section.body)) {
      transcript = section.body;
      changed = true;
      continue;
    }
    if (section.kind === 'translation' && (!transcriptTranslation.trim() || transcriptTranslation.trim() === section.body)) {
      transcriptTranslation = section.body;
      changed = true;
      continue;
    }
    if (/^(选项分析|選択肢分析)$/.test(section.title)) {
      const parsed = parseChoiceAnalysis(section.body, item.choices.length);
      if (parsed && parsed.every((detail, index) =>
        (!choiceDetails[index].translation || choiceDetails[index].translation === detail.translation)
        && (!choiceDetails[index].explanation || choiceDetails[index].explanation === detail.explanation))) {
        parsed.forEach((detail, index) => {
          choiceDetails[index] = { translation: detail.translation || choiceDetails[index].translation, explanation: detail.explanation };
        });
        changed = true;
        continue;
      }
    }
    remaining.push(section.title ? `【${section.title}】\n${section.body}` : section.body);
  }
  return {
    choiceDetails,
    explanation: changed ? remaining.join('\n\n') : original,
    transcript,
    transcriptTranslation,
  };
}

function parseChoiceAnalysis(body: string, count: number) {
  const headings = [...body.matchAll(/^([1-4])[.．、]\s+(.+)$/gm)];
  if (headings.length !== count || headings.some((match, index) => Number(match[1]) !== index + 1)) return null;
  const parsed = headings.map((match, index) => {
    const end = index + 1 < headings.length ? headings[index + 1].index : body.length;
    const content = body.slice(match.index! + match[0].length, end).trim();
    const translationLine = /^＝\s*(.+)$/m.exec(content);
    const translation = translationLine?.[1].trim() ?? '';
    const explanation = translationLine ? content.replace(translationLine[0], '').trim() : content;
    return { translation, explanation };
  });
  return parsed.every((detail) => detail.explanation.length > 0 && detail.translation.length <= 2000 && detail.explanation.length <= 4000)
    ? parsed : null;
}
