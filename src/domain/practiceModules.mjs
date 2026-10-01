const vocabularyKinds = new Set(['moji_goi', 'meaning', 'kana_to_kanji', 'kanji_to_kana', 'word_formation', 'usage']);

export function practiceModules(questions = [], fallback = '') {
  const modules = new Set();
  for (const question of questions) {
    const kind = String(question?.module ?? question?.kind ?? question?.type ?? '').toLowerCase();
    if (/listening|聴解|听力|聽力/.test(kind)) modules.add('listening');
    else if (/reading|読解|阅读|閱讀/.test(kind)) modules.add('reading');
    else if (/grammar|文法|语法|語法/.test(kind)) modules.add('grammar');
    else if (vocabularyKinds.has(kind) || /vocabulary|漢字|表記|語形成|文脈|言い換え|類義|用法|語彙|单词|単語/.test(kind)) modules.add('vocabulary');
  }
  if (!modules.size && fallback) {
    if (/听力|聴解|聽力|listening/i.test(fallback)) modules.add('listening');
    if (/阅读|読解|閱讀|reading/i.test(fallback)) modules.add('reading');
    if (/语法|文法|語法|grammar/i.test(fallback)) modules.add('grammar');
    if (/单词|単語|词汇|語彙|漢字|汉字|vocabulary/i.test(fallback)) modules.add('vocabulary');
  }
  return [...modules];
}
