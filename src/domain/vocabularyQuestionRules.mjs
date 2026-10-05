export const vocabularyQuestionKinds = ['kanji_to_kana', 'kana_to_kanji', 'word_formation', 'moji_goi', 'meaning', 'usage'];

export function normalizeVocabularyQuestionKinds(settings) {
  const selected = settings?.jlptVocabularyQuestionKinds;
  if (Array.isArray(selected)) return vocabularyQuestionKinds.filter(kind => selected.includes(kind));
  return settings?.requireJlptVocabularyQuestions === true ? [...vocabularyQuestionKinds] : [];
}
