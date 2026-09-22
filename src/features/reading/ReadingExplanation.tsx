import type { Locale, ReadingQuestion } from '../../types';

const copy = {
  'zh-CN': { translation: '全文翻译', correct: '正确答案解析', choices: '每个选项逐项分析', evidence: '原文依据', errors: '干扰项类型', overall: '总解析', overview: '文章分析', summary: '文章主旨', structure: '文章结构', sentenceTranslation: '原文・中文逐句对照', legacy: '补充解析', answer: '正确答案', option: '选项', noAnalysis: '尚未补充此选项的解析', noError: '未标注类型' },
  ja: { translation: '全文訳', correct: '正解の解説', choices: '選択肢ごとの解説', evidence: '本文の根拠', errors: '誤答の種類', overall: '全体の解説', overview: '文章の分析', summary: '要旨', structure: '構成', sentenceTranslation: '本文と中国語訳', legacy: '補足解説', answer: '正解', option: '選択肢', noAnalysis: 'この選択肢の解説はまだありません', noError: '未分類' },
  en: { translation: 'Full translation', correct: 'Correct answer explained', choices: 'Choice-by-choice analysis', evidence: 'Passage evidence', errors: 'Distractor types', overall: 'Overall explanation', overview: 'Passage analysis', summary: 'Summary', structure: 'Structure', sentenceTranslation: 'Japanese / Chinese translation', legacy: 'Additional explanation', answer: 'Correct answer', option: 'Choice', noAnalysis: 'No analysis for this choice yet', noError: 'Not classified' },
};

export function ReadingExplanation({ item, locale }: { item: ReadingQuestion; locale: Locale }) {
  const labels = copy[locale];
  const choices = item.choiceExplanations ?? [];
  const correct = choices[item.answerIndex];
  const analysis = item.readingAnalysis;
  const nodes = item.explanationNodes ?? [];
  const lines = item.translationLines ?? [];
  const hasChoices = choices.length > 0;
  const hasEvidence = choices.some((choice) => choice.evidence) || Boolean(analysis?.keySentences?.length);
  return <section className="reading-explanation mt-6" aria-label={labels.overall}>
    <section className="reading-answer-section">
      <h4>{labels.correct}</h4>
      <p className="font-semibold">{labels.answer}：{item.answerIndex + 1}. {item.choices[item.answerIndex]}</p>
      {correct?.translation ? <p className="reading-translation">{correct.translation}</p> : null}
      {correct?.analysis ? <p>{correct.analysis}</p> : null}
      {item.explanation ? <div className="mt-4"><h5 className="font-semibold">{labels.overall}</h5><p>{item.explanation}</p></div> : null}
    </section>
    {item.passageTranslation || lines.length ? <details className="reading-answer-section">
      <summary>{labels.translation}</summary>
      {item.passageTranslation ? <p>{item.passageTranslation}</p> : null}
      {lines.length ? <details className="mt-4"><summary>{labels.sentenceTranslation}</summary>
        {lines.map((line, index) => <div key={index} className="reading-translation-line"><p lang="ja">{line.ja}</p><p className="reading-translation">{line.zh}</p></div>)}
      </details> : null}
    </details> : null}
    {analysis?.summary || analysis?.structure ? <details className="reading-answer-section">
      <summary>{labels.overview}</summary>
      {analysis.summary ? <div className="mt-3"><h5 className="font-semibold">{labels.summary}</h5><p>{analysis.summary}</p></div> : null}
      {analysis.structure ? <div className="mt-3"><h5 className="font-semibold">{labels.structure}</h5><p>{analysis.structure}</p></div> : null}
    </details> : null}
    {hasChoices ? <details className="reading-answer-section" open>
      <summary>{labels.choices}</summary>
      {item.choices.map((text, index) => <details key={index} className="reading-choice-analysis">
        <summary>{index + 1}. {text}{index === item.answerIndex ? `（${labels.answer}）` : ''}</summary>
        {choices[index]?.translation ? <p className="reading-translation">{choices[index].translation}</p> : null}
        <p>{choices[index]?.analysis || labels.noAnalysis}</p>
      </details>)}
    </details> : null}
    {hasEvidence ? <details className="reading-answer-section">
      <summary>{labels.evidence}</summary>
      {analysis?.keySentences?.map((sentence, index) => <blockquote key={index} lang="ja">{sentence}</blockquote>)}
      {choices.map((choice, index) => choice.evidence ? <div key={index} className="mt-4"><h5 className="font-semibold">{labels.option} {index + 1}</h5><p>{choice.evidence}</p></div> : null)}
    </details> : null}
    {hasChoices ? <details className="reading-answer-section">
      <summary>{labels.errors}</summary>
      <dl>{choices.map((choice, index) => index !== item.answerIndex ? <div key={index} className="reading-error-type"><dt>{labels.option} {index + 1}</dt><dd>{choice.errorType || labels.noError}</dd></div> : null)}</dl>
    </details> : null}
    {nodes.length ? <details className="reading-answer-section"><summary>{labels.legacy}</summary>
      {nodes.map((node, index) => <details key={index} className="mt-3" open={index === 0}><summary>{node.title}</summary><p>{node.body}</p></details>)}
    </details> : null}
  </section>;
}
