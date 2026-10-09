// 数据访问的公共工具：业务编号、译文写入、输入校验。
import { SUPPORTED_LANGUAGES } from '../i18n.mjs';

export class InputError extends Error {
  constructor(message, details) {
    super(message);
    this.statusCode = 400;
    this.details = details;
  }
}
export class NotFoundError extends Error {
  constructor(message) { super(message); this.statusCode = 404; }
}
export class ConflictError extends Error {
  constructor(message) { super(message); this.statusCode = 409; }
}

export const nowIso = () => new Date().toISOString();

/** 分配下一个业务编号（每个用户每种前缀递增，不复用）。 */
export function nextCode(db, userId, prefix) {
  const row = db.prepare(`INSERT INTO id_sequences (user_id, prefix, next_no) VALUES (?, ?, 2)
    ON CONFLICT (user_id, prefix) DO UPDATE SET next_no = next_no + 1 RETURNING next_no`).get(userId, prefix);
  const no = row.next_no - 1;
  return { code: `${prefix}${no}`, no };
}

/** 写一个字段某种语言的文字；text 为空时删除该语言的行。 */
export function setText(db, ownerTable, ownerRid, field, language, text, origin = 'manual') {
  if (!SUPPORTED_LANGUAGES.includes(language)) throw new InputError(`不支持的语言：${language}`);
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value) {
    db.prepare('DELETE FROM content_translations WHERE owner_table = ? AND owner_rid = ? AND field = ? AND language = ?').run(ownerTable, ownerRid, field, language);
    return;
  }
  const now = nowIso();
  db.prepare(`INSERT INTO content_translations (owner_table, owner_rid, field, language, text, origin, verified, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (owner_table, owner_rid, field, language) DO UPDATE SET text = excluded.text, origin = excluded.origin, verified = excluded.verified, updated_at = excluded.updated_at`)
    .run(ownerTable, ownerRid, field, language, value, origin, origin === 'ai' ? 0 : 1, now, now);
}

// ---------- 输入校验 ----------
export function oneOf(value, allowed, label, { optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw new InputError(`${label} 必填`);
  }
  if (!allowed.includes(value)) throw new InputError(`${label} 只能是 ${allowed.join(' / ')}，收到「${value}」`);
  return value;
}
export function text(value, label, { optional = true, max = 20000 } = {}) {
  if (value === undefined || value === null) {
    if (optional) return null;
    throw new InputError(`${label} 必填`);
  }
  if (typeof value !== 'string') throw new InputError(`${label} 应为文字`);
  const trimmed = value.trim();
  if (!trimmed && !optional) throw new InputError(`${label} 不能为空`);
  if (trimmed.length > max) throw new InputError(`${label} 过长（最多 ${max} 字）`);
  return trimmed || null;
}
export function list(value, label, { max = 200 } = {}) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new InputError(`${label} 应为数组`);
  if (value.length > max) throw new InputError(`${label} 最多 ${max} 项`);
  return value;
}
export function bool(value, label, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new InputError(`${label} 应为 true / false`);
  return value;
}
export function number(value, label, { min, max, optional = true, integer = false } = {}) {
  if (value === undefined || value === null) {
    if (optional) return null;
    throw new InputError(`${label} 必填`);
  }
  const n = Number(value);
  if (!Number.isFinite(n) || (integer && !Number.isInteger(n))) throw new InputError(`${label} 应为${integer ? '整数' : '数字'}`);
  if ((min !== undefined && n < min) || (max !== undefined && n > max)) throw new InputError(`${label} 应在 ${min}–${max} 之间`);
  return n;
}
export const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
