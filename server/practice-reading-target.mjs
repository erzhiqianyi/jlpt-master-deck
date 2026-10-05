// Recover a target only from explicit authored metadata that occurs in the sentence.
export function repairReadingTarget(question) {
  if (question.kind !== 'kanji_to_kana') return question;
  const prompt = String(question.prompt ?? '');
  const target = [question.promptTarget, question.tested, question.memoryPoint]
    .map(value => typeof value === 'string' ? value.trim() : '')
    .find(value => value && /\p{Script=Han}/u.test(value) && prompt.includes(value));
  return target ? { ...question, promptTarget: target } : question;
}
