// 迁移上下文：读旧库、写新库、分配业务编号、写译文、记录迁移报告。
// 旧表优先读 legacy_v1_<name>（v2 迁移后保留的原表），没有时读原名表（尚未经过 v2 的库）。

export function createContext({ legacy, target, now = new Date().toISOString() }) {
  const legacyTables = new Set(legacy.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
  const report = {
    startedAt: now,
    read: {},          // 旧表 → 读取行数
    written: {},       // 新表 → 写入行数（迁移结束时统计）
    warnings: {},      // 类别 → { count, samples[] }
    unknownKeys: {},   // JSON 对象 → { 键 → 出现次数 }（未建模、被丢弃的字段）
    mapping: [],       // 旧 ID → 新编号（写入单独的文件）
  };
  const sequences = new Map(); // `${userId}\u0000${prefix}` → 下一个序号
  const ids = new Map();       // `${kind}\u0000${userId}\u0000${legacyId}` → rid

  const table = (name) => (legacyTables.has(`legacy_v1_${name}`) ? `legacy_v1_${name}` : legacyTables.has(name) ? name : null);
  const statements = new Map();
  const prepare = (sql) => {
    if (!statements.has(sql)) statements.set(sql, target.prepare(sql));
    return statements.get(sql);
  };

  const ctx = {
    legacy, target, now, report,
    /** 读取旧表全部行；表不存在时返回空数组。 */
    rows(name, order = '') {
      const t = table(name);
      if (!t) return [];
      const rows = legacy.prepare(`SELECT * FROM "${t}" ${order}`).all();
      report.read[name] = rows.length;
      return rows;
    },
    hasLegacy: (name) => Boolean(table(name)),
    /** 插入一行，返回 rid（lastInsertRowid）。 */
    insert(tableName, values) {
      const columns = Object.keys(values).filter((k) => values[k] !== undefined);
      const sql = `INSERT INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
      return Number(prepare(sql).run(...columns.map((c) => normalizeValue(values[c]))).lastInsertRowid);
    },
    /** 分配业务编号：每个用户每种前缀从 1 开始。 */
    code(userId, prefix) {
      const key = `${userId}\u0000${prefix}`;
      const no = sequences.get(key) ?? 1;
      sequences.set(key, no + 1);
      return { code: `${prefix}${no}`, no };
    },
    sequences,
    /** 旧 ID → 新 rid 的临时对照（迁移结束即丢弃，只写进报告）。 */
    remember(kind, userId, legacyId, rid, code) {
      if (legacyId == null || legacyId === '') return;
      ids.set(`${kind}\u0000${userId}\u0000${legacyId}`, rid);
      report.mapping.push({ kind, userId, legacyId: String(legacyId), rid, code: code ?? null });
    },
    lookup(kind, userId, legacyId) {
      if (legacyId == null) return null;
      return ids.get(`${kind}\u0000${userId}\u0000${legacyId}`) ?? null;
    },
    /** 写一条译文；空文字跳过。 */
    text(ownerTable, ownerRid, field, language, text, origin = 'migrated') {
      const value = typeof text === 'string' ? text.trim() : text == null ? '' : String(text).trim();
      if (!value) return;
      prepare(`INSERT INTO content_translations (owner_table, owner_rid, field, language, text, origin, verified, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (owner_table, owner_rid, field, language) DO UPDATE SET text = excluded.text`)
        .run(ownerTable, ownerRid, field, language, value, origin, origin === 'migrated' ? 1 : 0, now, now);
    },
    warn(category, sample) {
      const entry = (report.warnings[category] ??= { count: 0, samples: [] });
      entry.count += 1;
      if (entry.samples.length < 20) entry.samples.push(sample);
    },
    /** 记录 JSON 对象里没有被迁移的键。 */
    unknown(object, value, knownKeys) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      for (const key of Object.keys(value)) {
        if (knownKeys.includes(key)) continue;
        if (value[key] == null || value[key] === '' || (Array.isArray(value[key]) && !value[key].length)) continue;
        const entry = (report.unknownKeys[object] ??= {});
        entry[key] = (entry[key] ?? 0) + 1;
      }
    },
  };
  return ctx;
}

function normalizeValue(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return value;
}

export const json = (text, fallback = null) => {
  if (text == null || text === '') return fallback;
  if (typeof text === 'object') return text;
  try { return JSON.parse(text); } catch { return fallback; }
};

export const array = (value) => (Array.isArray(value) ? value : []);
export const str = (value) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
};
export const iso = (value, fallback) => {
  const text = str(value);
  if (!text) return fallback;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
};
