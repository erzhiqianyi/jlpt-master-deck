// Recover option-specific reasons already present in older combined explanations.
// Never invent a reason from the fact that an option is incorrect.
export function normalizePracticeExplanations(question) {
  const combined = String(question.correctReason ?? question.explanation_zh ?? question.explanation ?? '').trim();
  const choices = question.choices ?? [];
  const markers = [...combined.matchAll(/「([^」]+)」\s*[：:]/gu)]
    .filter((match) => choices.includes(match[1]));
  const reasons = new Map(markers.map((match, index) => [
    match[1], combined.slice(match.index + match[0].length, markers[index + 1]?.index ?? combined.length).trim(),
  ]));
  const correctReason = markers.length ? combined.slice(0, markers[0].index).trim() : combined;
  const provided = question.choiceAnalysis ?? question.choice_analysis ?? [];
  const answer = question.answer ?? choices[question.answerIndex];
  return {
    ...question,
    correctReason: correctReason || combined,
    choiceAnalysis: choices.map((choice) => {
      const entry = provided.find((value) => value.choice === choice);
      const existing = String(entry?.explanation ?? entry?.explanation_zh ?? '').trim();
      const correct = choice === answer;
      return {
        choice,
        correct,
        explanation: !isEmptyReason(existing) && existing !== combined
          ? existing
          : reasons.get(choice) || (correct ? correctReason : '') || existing,
      };
    }),
  };
}

export function isEmptyReason(text) {
  const value = String(text ?? '').trim();
  return !value || /^(?:「[^」]+」)?(?:不符合本题(?:目标|语境)|是本题正确答案|是正确答案|与本题要求的词义、读音或句子结构不一致)[。！]?$/u.test(value);
}

export function assertPracticeExplanations(questions) {
  const problems = [];
  for (const [index, question] of questions.entries()) {
    if (isEmptyReason(question.correctReason) || /^正确答案是/u.test(question.correctReason)) {
      problems.push(`第 ${index + 1} 题缺少正确理由`);
    }
    for (const entry of question.choiceAnalysis ?? []) {
      if (isEmptyReason(entry.explanation)) problems.push(`第 ${index + 1} 题「${entry.choice}」缺少具体辨析`);
    }
  }
  if (problems.length) throw new Error(`解析质量校验未通过：${problems.join('；')}。请逐项说明含义或接续，以及与本题线索的具体关系。`);
}
