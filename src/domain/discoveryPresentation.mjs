/** Public presentation metadata only; never expose an author's account identity. */
export function discoveryCategories(content) {
  const result = new Set(content.categories ?? []);
  if (content.kind === 'listening') result.add('listening');
  for (const item of content.items ?? []) result.add(item.deck === 'grammar_expression' || item.type === 'grammar' ? 'grammar' : 'vocabulary');
  for (const question of content.questions ?? []) {
    const kind = question.kind ?? question.questionTypeId ?? '';
    result.add(/listening|chokai/.test(kind) ? 'listening' : /reading|dokkai/.test(kind) ? 'reading' : /grammar|bunpo/.test(kind) ? 'grammar' : 'vocabulary');
  }
  if (!result.size) {
    const title = content.title ?? '';
    if (/语法|文法|grammar/i.test(title)) result.add('grammar');
    else if (/听力|聴解|listening/i.test(title)) result.add('listening');
    else if (/阅读|読解|reading/i.test(title)) result.add('reading');
    else if (content.kind === 'wordbook' || /词汇|単語|vocab|word/i.test(title)) result.add('vocabulary');
  }
  return [...result];
}
export function discoveryPresentation(content) {
  const categories = discoveryCategories(content);
  const title = content.title ?? '';
  const cover = /時間|时间|時点|time|とき/i.test(title) ? 'clock'
    : /助词|助詞|particle/i.test(title) ? 'gold'
      : categories.includes('vocabulary') && !categories.includes('grammar') ? 'coffee'
        : categories.includes('listening') ? 'clock' : 'stairs';
  const levels = [...new Set((content.items ?? []).map(item => item.jlpt_level).filter(Boolean))];
  const level = title.match(/\bN[1-5]\b/i)?.[0]?.toUpperCase() ?? (levels.length === 1 ? levels[0] : '');
  return { categories, cover, level, coverTitle: title.split(/[：:]/).slice(-1)[0].trim() || title };
}
