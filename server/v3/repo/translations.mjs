// AI による翻訳・ふりがな：対象は「テーブル:rid」で指定し、外部キーをたどって所有ユーザーを確認する。
import { SUPPORTED_LANGUAGES } from '../i18n.mjs';
import { InputError, NotFoundError, setText, nowIso } from './common.mjs';
import { validateRuby, stripRuby } from '../ruby.mjs';

const parentCache = new Map();
/** 子テーブル → 親（CASCADE の外部キー）。user_id を持つテーブルは根。 */
function structure(db, table) {
  if (parentCache.has(table)) return parentCache.get(table);
  const columns = db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all().map((c) => c.name);
  if (!columns.length) return null;
  const fk = db.prepare(`SELECT "table", "from", "to", on_delete FROM pragma_foreign_key_list('${table}')`).all()
    .find((f) => f.on_delete === 'CASCADE' && f.table !== 'users');
  const info = { root: columns.includes('user_id'), parentTable: fk?.table ?? null, parentColumn: fk?.from ?? null, parentKey: fk?.to ?? 'rid', hasCode: columns.includes('code') };
  parentCache.set(table, info);
  return info;
}

/** 行の所有ユーザーと、人が読める業務番号（根まで最初に見つかった code）。 */
export function ownerOf(db, table, rid) {
  const info = structure(db, table);
  if (!info) return null;
  const key = table === 'learning_plans' ? 'user_id' : 'rid';
  const row = db.prepare(`SELECT * FROM "${table}" WHERE ${key} = ?`).get(rid);
  if (!row) return null;
  if (info.root) return { userId: row.user_id, code: row.code ?? null };
  if (!info.parentTable) return null; // 全体共通のデータ
  const parent = ownerOf(db, info.parentTable, row[info.parentColumn]);
  return parent ? { userId: parent.userId, code: parent.code } : null;
}

function parseTarget(target) {
  const match = /^([a-z_]+):(\d+)$/.exec(String(target ?? '').trim());
  if (!match) throw new InputError(`target は「テーブル:rid」の形式で指定してください（例：knowledge_examples:12）：${target}`);
  return { table: match[1], rid: Number(match[2]) };
}

function requireOwned(db, userId, table, rid) {
  const owner = ownerOf(db, table, rid);
  if (!owner || owner.userId !== userId) throw new NotFoundError(`変更できる内容が見つかりません：${table}:${rid}`);
  return owner;
}

/** 指定言語の文字がない翻訳フィールドの一覧（学習者に見せるフィールドだけ）。 */
export function listMissingTranslations(db, userId, { language, code, limit = 50 }) {
  if (!SUPPORTED_LANGUAGES.includes(language)) throw new InputError(`未対応の言語：${language}`);
  const visible = new Set(db.prepare('SELECT owner_table || ? || field AS k FROM translatable_fields WHERE learner_visible = 1').all('\u0000').map((r) => r.k));
  const groups = db.prepare(`SELECT owner_table, owner_rid, field FROM content_translations GROUP BY owner_table, owner_rid, field
    HAVING SUM(language = ?) = 0 AND SUM(language <> 'ja') > 0 ORDER BY owner_table, owner_rid, field`).all(language);
  const wanted = code ? String(code).toUpperCase() : null;
  const items = [];
  let total = 0;
  for (const g of groups) {
    if (!visible.has(`${g.owner_table}\u0000${g.field}`)) continue;
    const owner = ownerOf(db, g.owner_table, g.owner_rid);
    if (!owner || owner.userId !== userId || (wanted && owner.code !== wanted)) continue;
    total += 1;
    if (items.length >= limit) continue;
    const existing = db.prepare('SELECT language, text FROM content_translations WHERE owner_table = ? AND owner_rid = ? AND field = ?').all(g.owner_table, g.owner_rid, g.field);
    const row = db.prepare(`SELECT * FROM "${g.owner_table}" WHERE rid = ?`).get(g.owner_rid) ?? {};
    const japanese = Object.fromEntries(Object.entries(row).filter(([k, v]) => typeof v === 'string' && v.length <= 600 && /[぀-ヿ一-鿿]/.test(v) && !/(_at|code|kind|status|language)$/.test(k)));
    items.push({ target: `${g.owner_table}:${g.owner_rid}`, field: g.field, code: owner.code, japanese,
      existing: Object.fromEntries(existing.map((e) => [e.language, e.text])) });
  }
  return { language, total, returned: items.length, items };
}

export function setTranslation(db, userId, { target, field, language, text }) {
  const { table, rid } = parseTarget(target);
  if (!db.prepare('SELECT 1 FROM translatable_fields WHERE owner_table = ? AND field = ?').get(table, field)) throw new InputError(`${table} に翻訳フィールド「${field}」はありません`);
  const owner = requireOwned(db, userId, table, rid);
  setText(db, table, rid, field, language, text, 'ai');
  return { ok: true, target, field, language, code: owner.code };
}

/** 現在の文字：翻訳テーブルの文字、または日本語の原文の列。 */
function currentText(db, table, rid, field, language) {
  const translated = db.prepare('SELECT text FROM content_translations WHERE owner_table = ? AND owner_rid = ? AND field = ? AND language = ?').get(table, rid, field, language)?.text;
  if (translated != null) return translated;
  if (language !== 'ja') return null;
  const exists = db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ? AND type = 'TEXT'`).get(field);
  return exists ? db.prepare(`SELECT "${field}" AS v FROM "${table}" WHERE rid = ?`).get(rid)?.v ?? null : null;
}

export function setRubyAnnotation(db, userId, { target, field, language = 'ja', annotatedText }) {
  const { table, rid } = parseTarget(target);
  const owner = requireOwned(db, userId, table, rid);
  const current = currentText(db, table, rid, field, language);
  if (current == null) throw new InputError(`${target} に ${language} の「${field}」の文字がありません`);
  const errors = validateRuby(annotatedText, current);
  if (errors.length) throw new InputError(errors.join('；'));
  const now = nowIso();
  db.prepare(`INSERT INTO ruby_annotations (owner_table, owner_rid, field, language, annotated_text, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'ai', ?, ?)
    ON CONFLICT (owner_table, owner_rid, field, language) DO UPDATE SET annotated_text = excluded.annotated_text, updated_at = excluded.updated_at`)
    .run(table, rid, field, language, annotatedText, now, now);
  return { ok: true, target, field, language, code: owner.code };
}

/** 有効なふりがな（原文が変わったものは返さない）。 */
export function listRubyAnnotations(db, userId, { target } = {}) {
  const rows = target
    ? db.prepare('SELECT * FROM ruby_annotations WHERE owner_table = ? AND owner_rid = ?').all(parseTarget(target).table, parseTarget(target).rid)
    : db.prepare('SELECT * FROM ruby_annotations').all();
  return rows.filter((r) => ownerOf(db, r.owner_table, r.owner_rid)?.userId === userId && stripRuby(r.annotated_text) === currentText(db, r.owner_table, r.owner_rid, r.field, r.language))
    .map((r) => ({ target: `${r.owner_table}:${r.owner_rid}`, field: r.field, language: r.language, annotatedText: r.annotated_text }));
}

const KNOWLEDGE_CHILDREN = ['knowledge_examples', 'knowledge_memory_points', 'knowledge_patterns', 'knowledge_notes', 'knowledge_comparisons'];

/** 業務番号（W12 など）から、翻訳・ふりがなを書ける対象（テーブル:rid）とフィールドの一覧を返す。 */
export function listTranslationTargets(db, userId, code) {
  const point = db.prepare('SELECT rid, code FROM knowledge_points WHERE user_id = ? AND code = ?').get(userId, String(code ?? '').toUpperCase());
  if (!point) throw new NotFoundError(`找不到知识点：${code}`);
  const fieldsOf = (table) => db.prepare('SELECT field FROM translatable_fields WHERE owner_table = ? ORDER BY field').all(table).map((r) => r.field);
  const languagesOf = (table, rid) => db.prepare('SELECT field, language FROM content_translations WHERE owner_table = ? AND owner_rid = ?').all(table, rid)
    .reduce((acc, r) => { (acc[r.field] ??= []).push(r.language); return acc; }, {});
  const targets = [{ target: `knowledge_points:${point.rid}`, position: null, fields: fieldsOf('knowledge_points'), languages: languagesOf('knowledge_points', point.rid) }];
  for (const table of KNOWLEDGE_CHILDREN) {
    for (const row of db.prepare(`SELECT rid, position FROM ${table} WHERE point_rid = ? ORDER BY position`).all(point.rid)) {
      targets.push({ target: `${table}:${row.rid}`, position: row.position, fields: fieldsOf(table), languages: languagesOf(table, row.rid) });
    }
  }
  return { code: point.code, targets };
}
