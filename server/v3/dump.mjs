// データベース全体の書き出し・読み込み（Durable Object ↔ ローカル SQLite の移行用）。
// node:sqlite と Durable Object のどちらの db でも動く（prepare().all() と exec() だけを使う）。
import { createHash } from 'node:crypto';

export const DUMP_FORMAT = 'jlpt-sqlite-dump';
export const DUMP_VERSION = 1;

/** SQLite の内部表と Durable Object の内部表は対象外。 */
const internal = (name) => name.startsWith('sqlite_') || name.startsWith('_cf_') || name.startsWith('_maintenance_');

const encode = (value) => {
  if (value instanceof ArrayBuffer) return { $blob: Buffer.from(value).toString('base64') };
  if (ArrayBuffer.isView(value)) return { $blob: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64') };
  if (typeof value === 'bigint') return Number(value);
  return value;
};
const decode = (value) => (value && typeof value === 'object' && typeof value.$blob === 'string' ? Buffer.from(value.$blob, 'base64') : value);

/** 表の内容のハッシュ（行は主キー順ではなく内容で並べ替えるので、挿入順に左右されない）。 */
export function tableDigest(columns, rows) {
  const lines = rows.map((row) => JSON.stringify(row.map(encode))).sort();
  return createHash('sha256').update(JSON.stringify(columns)).update('\n').update(lines.join('\n')).digest('hex');
}

/** sqlite_master の順（作成順）で、表・索引・トリガーの定義と全行を返す。 */
export function dumpDatabase(db, { tables: only } = {}) {
  const objects = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all()
    .filter((o) => !internal(o.name) && !internal(o.tbl_name) && (!only || only.includes(o.tbl_name)))
    .map(({ type, name, tbl_name, sql }) => ({ type, name, table: tbl_name, sql }));
  const tables = objects.filter((o) => o.type === 'table').map(({ name }) => {
    const columns = db.prepare(`SELECT name FROM pragma_table_info('${name.replaceAll("'", "''")}')`).all().map((c) => c.name);
    const list = columns.map((c) => `"${c.replaceAll('"', '""')}"`).join(', ');
    const rows = db.prepare(`SELECT ${list} FROM "${name.replaceAll('"', '""')}"`).all().map((row) => columns.map((c) => encode(row[c])));
    return { name, columns, rows, count: rows.length, sha256: tableDigest(columns, rows) };
  });
  return { format: DUMP_FORMAT, version: DUMP_VERSION, objects, tables };
}

/** 書き出しの検査：形式、件数、各表のハッシュ。 */
export function verifyDump(dump) {
  if (dump?.format !== DUMP_FORMAT || dump.version !== DUMP_VERSION) throw new Error('Unsupported dump format');
  for (const t of dump.tables) {
    if (t.rows.length !== t.count) throw new Error(`Row count mismatch in ${t.name}`);
    if (tableDigest(t.columns, t.rows) !== t.sha256) throw new Error(`Digest mismatch in ${t.name}`);
  }
  return dump;
}

const insertAll = (db, table) => {
  if (!table.rows.length) return;
  const statement = db.prepare(`INSERT INTO "${table.name.replaceAll('"', '""')}" (${table.columns.map((c) => `"${c.replaceAll('"', '""')}"`).join(', ')}) VALUES (${table.columns.map(() => '?').join(', ')})`);
  for (const row of table.rows) statement.run(...row.map(decode));
};

/** 空のローカル SQLite に書き出しを復元する：表 → 行 → 索引・トリガー（トリガーを行の後に作るので発火しない）。 */
export function restoreIntoEmpty(db, dump) {
  verifyDump(dump);
  for (const o of dump.objects.filter((x) => x.type === 'table')) db.exec(o.sql);
  for (const table of dump.tables) insertAll(db, table);
  for (const o of dump.objects.filter((x) => x.type !== 'table')) db.exec(o.sql);
}

/**
 * 既存のデータベースの中身を書き出しで置き換える（Durable Object への取り込み用）。
 * 呼び出し側が一つのトランザクションで包むこと。書き出しにない表はそのまま残す。
 */
export function replaceContents(db, dump) {
  verifyDump(dump);
  const existing = new Set(db.prepare("SELECT name FROM sqlite_master").all().map((r) => r.name));
  for (const o of dump.objects.filter((x) => x.type === 'table' && !existing.has(x.name))) db.exec(o.sql);
  db.exec('PRAGMA defer_foreign_keys = ON');
  // 先に全部消す（AFTER DELETE トリガーと CASCADE は消える行にしか効かない）、それから入れる。
  for (const table of [...dump.tables].reverse()) db.exec(`DELETE FROM "${table.name.replaceAll('"', '""')}"`);
  for (const table of dump.tables) insertAll(db, table);
  for (const o of dump.objects.filter((x) => x.type !== 'table' && !existing.has(x.name))) db.exec(o.sql);
  return dump.tables.map(({ name, count, sha256 }) => ({ name, count, sha256 }));
}

/** 各表の件数とハッシュ（取り込み後の対账用）。 */
export function digestDatabase(db, { tables: only } = {}) {
  return dumpDatabase(db, { tables: only }).tables.map(({ name, count, sha256 }) => ({ name, count, sha256 }));
}
