// 多语言：语言回退链与按语言挑选译文。所有批量查询只传一个 JSON 参数（Workers 限制 100 个绑定参数）。
export const SUPPORTED_LANGUAGES = ['ja', 'zh-Hans', 'en', 'zh-Hant', 'ko', 'vi', 'id', 'th', 'my', 'ne', 'es', 'fr'];

/** 回退顺序：请求语言 → fallback 链 → zh-Hans。 */
export function languageChain(db, language) {
  const fallbacks = new Map(db.prepare('SELECT code, fallback_code FROM languages').all().map((r) => [r.code, r.fallback_code]));
  const chain = [];
  for (let code = language; code && !chain.includes(code); code = fallbacks.get(code)) chain.push(code);
  if (!chain.includes('zh-Hans')) chain.push('zh-Hans');
  return chain;
}

export function preferredLanguage(db, userId) {
  return db.prepare('SELECT explanation_language FROM user_preferences WHERE user_id = ?').get(userId)?.explanation_language ?? 'zh-Hans';
}

/**
 * 一次取出一批所属行的译文，并按语言链挑选。
 * owners: [[owner_table, owner_rid], ...]；返回 Map(`${table}:${rid}`) → { field → { text, language, isFallback, origin, verified } }。
 * 允许日语行的字段（如释义）只有请求日语时才优先取 ja；其他语言请求时 ja 排在回退链最后，作为最后手段。
 */
export function pickTexts(db, owners, language, { allLanguages = false } = {}) {
  const result = new Map();
  if (!owners.length) return result;
  const chain = languageChain(db, language);
  const rows = db.prepare(`SELECT t.owner_table, t.owner_rid, t.field, t.language, t.text, t.origin, t.verified
    FROM json_each(?) o JOIN content_translations t ON t.owner_table = json_extract(o.value, '$[0]') AND t.owner_rid = json_extract(o.value, '$[1]')`)
    .all(JSON.stringify(owners));
  for (const row of rows) {
    const key = `${row.owner_table}:${row.owner_rid}`;
    const entry = result.get(key) ?? {};
    if (allLanguages) {
      (entry[row.field] ??= {})[row.language] = row.text;
    } else {
      let rank = chain.indexOf(row.language);
      if (rank < 0 && row.language === 'ja') rank = chain.length; // 日语释义作为最后手段
      if (rank < 0) { result.set(key, entry); continue; }
      const current = entry[row.field];
      if (!current || rank < current.rank) {
        entry[row.field] = { text: row.text, language: row.language, isFallback: row.language !== language, origin: row.origin, verified: Boolean(row.verified), rank };
      }
    }
    result.set(key, entry);
  }
  if (!allLanguages) for (const entry of result.values()) for (const value of Object.values(entry)) delete value.rank;
  return result;
}
