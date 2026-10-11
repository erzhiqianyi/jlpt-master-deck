// 線上移行（第 6 段階）の手順を手元で行う道具。線上に触るのは export / import / check だけで、どれも移行モードの Worker が必要。
// 手順（docs/cloud-v3-migration.md）：
//   1. export  旧い DO を表ごとに書き出す（件数を照らし合わせる）
//   2. build   書き出しから旧データベースを作り直し、v3 に移行して照合する（scripts/v3/verify-migration.mjs）
//   3. import  v3 データベースを新しい空の DO に書き込む
//   4. check   新しい DO の件数と外部キーを手元の v3 データベースと照らし合わせる
// 用法：
//   JLPT_MIGRATION_TOKEN=… node scripts/v3/cloud-migration.mjs export --origin https://… --out <dir>
//   node scripts/v3/cloud-migration.mjs build --dump <dir> --out <v3.sqlite>
//   JLPT_MIGRATION_TOKEN=… node scripts/v3/cloud-migration.mjs import --origin https://… --db <v3.sqlite>
//   JLPT_MIGRATION_TOKEN=… node scripts/v3/cloud-migration.mjs check --origin https://… --db <v3.sqlite>
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { migrateLegacyToV3 } from '../../server/v3/migrate/index.mjs';
import { seedReferenceData } from '../../server/v3/reference-data.mjs';
import { ACCOUNT_SCHEMA } from '../../server/v3/database.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PAGE = 500;
const MAX_BATCH_BYTES = 2 * 1024 * 1024;
const quote = (name) => `"${String(name).replaceAll('"', '""')}"`;

function client({ origin, token, fetch = globalThis.fetch }) {
  if (!token || token.length < 32) throw new Error('JLPT_MIGRATION_TOKEN (32+ characters) is required');
  const call = async (path, init = {}) => {
    const response = await fetch(new URL(path, origin).toString(), { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
    const text = await response.text();
    if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status} ${text.slice(0, 300)}`);
    return JSON.parse(text);
  };
  return { get: (path) => call(path), post: (path, body) => call(path, { method: 'POST', body: JSON.stringify(body) }) };
}

/** 1. 旧い DO を書き出す：manifest.json と tables/<表>.json。件数が合わなければ失敗。 */
export async function exportDump({ origin, token, out, fetch }) {
  const api = client({ origin, token, fetch });
  if (existsSync(out)) throw new Error(`Output exists: ${out}`);
  mkdirSync(join(out, 'tables'), { recursive: true });
  const manifest = await api.get('/__migration/manifest');
  if (manifest.format !== 'jlpt-do-dump') throw new Error('Not a migration export endpoint');
  for (const table of manifest.tables) {
    const rows = [];
    let after = 0;
    for (;;) {
      const page = await api.get(`/__migration/rows?table=${encodeURIComponent(table.name)}&limit=${PAGE}&after=${after}`);
      rows.push(...page.rows);
      if (page.next == null) break;
      after = page.next;
    }
    if (rows.length !== table.count) throw new Error(`${table.name}: exported ${rows.length}, expected ${table.count}`);
    writeFileSync(join(out, 'tables', `${encodeURIComponent(table.name)}.json`), JSON.stringify(rows));
  }
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { tables: Object.fromEntries(manifest.tables.map((t) => [t.name, t.count])) };
}

/** 書き出しから旧データベースを作り直す。 */
export function restoreDump(dump, file) {
  const manifest = JSON.parse(readFileSync(join(dump, 'manifest.json'), 'utf8'));
  if (existsSync(file)) rmSync(file);
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  for (const table of manifest.tables) {
    db.exec(table.sql);
    const rows = JSON.parse(readFileSync(join(dump, 'tables', `${encodeURIComponent(table.name)}.json`), 'utf8'));
    const insert = db.prepare(`INSERT INTO ${quote(table.name)} (${table.columns.map(quote).join(', ')}) VALUES (${table.columns.map(() => '?').join(', ')})`);
    for (const row of rows) insert.run(...table.columns.map((c) => row[c] ?? null));
    const n = db.prepare(`SELECT count(*) AS n FROM ${quote(table.name)}`).get().n;
    if (n !== table.count) throw new Error(`${table.name}: restored ${n}, expected ${table.count}`);
  }
  for (const sql of manifest.indexes) { try { db.exec(sql); } catch { /* 移行には使わない索引 */ } }
  db.exec('COMMIT');
  db.close();
  return manifest;
}

/** 2. 旧データベースを作り直して v3 に移行し、照合する。 */
export function buildV3({ dump, out, verify = true }) {
  const legacyFile = `${out}.legacy.sqlite`;
  restoreDump(dump, legacyFile);
  if (existsSync(out)) rmSync(out);
  const legacy = new DatabaseSync(legacyFile, { readOnly: true });
  const target = new DatabaseSync(out);
  const { mapping, ...report } = migrateLegacyToV3({ legacy, target });
  // 起動時と同じもの：アカウントの表と参照データ
  target.exec(ACCOUNT_SCHEMA);
  seedReferenceData(target);
  target.close();
  legacy.close();
  // 照合（verify-migration.mjs）は <名前>.report.json と同じ名前の .mapping.tsv を読む
  const stem = out.replace(/\.sqlite$/, '');
  const reportFile = `${stem}.report.json`;
  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(`${stem}.mapping.tsv`, ['kind\tuser_id\tlegacy_id\trid\tcode', ...mapping.map((m) => [m.kind, m.userId, m.legacyId, m.rid, m.code ?? ''].join('\t'))].join('\n') + '\n');
  if (report.foreignKeyViolations) throw new Error(`v3 database has ${report.foreignKeyViolations} foreign key violations (see ${reportFile})`);
  let verification = null;
  if (verify) {
    const result = spawnSync(process.execPath, [join(ROOT, 'scripts/v3/verify-migration.mjs'), legacyFile, out, reportFile], { encoding: 'utf8' });
    verification = { ok: result.status === 0, output: result.stdout.trim() };
    if (!verification.ok) throw new Error(`Reconciliation failed:\n${result.stdout}\n${result.stderr}`);
  }
  return { legacy: legacyFile, report: reportFile, verification };
}

function localSchema(db) {
  const objects = db.prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
  return [...objects.filter((o) => o.type === 'table'), ...objects.filter((o) => o.type !== 'table')];
}

/** 3. v3 データベースを新しい空の DO に書き込む。 */
export async function importV3({ origin, token, db: file, fetch }) {
  const api = client({ origin, token, fetch });
  const db = new DatabaseSync(file, { readOnly: true });
  const objects = localSchema(db);
  await api.post('/__migration/schema', { statements: objects.map((o) => o.sql) });
  const counts = {};
  for (const { name } of objects.filter((o) => o.type === 'table')) {
    const columns = db.prepare(`PRAGMA table_info(${quote(name)})`).all().map((c) => c.name);
    let batch = [];
    let bytes = 0;
    const flush = async () => { if (batch.length) await api.post('/__migration/rows', { table: name, columns, rows: batch }); batch = []; bytes = 0; };
    for (const row of db.prepare(`SELECT ${columns.map(quote).join(', ')} FROM ${quote(name)}`).iterate()) {
      for (const value of Object.values(row)) if (value instanceof Uint8Array) throw new Error(`${name}: binary values are not supported by the import channel`);
      const size = Buffer.byteLength(JSON.stringify(row));
      if (batch.length && (batch.length >= PAGE || bytes + size > MAX_BATCH_BYTES)) await flush();
      batch.push(row); bytes += size;
    }
    await flush();
    counts[name] = db.prepare(`SELECT count(*) AS n FROM ${quote(name)}`).get().n;
  }
  db.close();
  return counts;
}

/** 4. 新しい DO の件数と外部キーを手元と照らし合わせる。 */
export async function checkV3({ origin, token, db: file, fetch }) {
  const api = client({ origin, token, fetch });
  const remote = await api.get('/__migration/check');
  const db = new DatabaseSync(file, { readOnly: true });
  const mismatches = [];
  for (const { name } of localSchema(db).filter((o) => o.type === 'table')) {
    const expected = db.prepare(`SELECT count(*) AS n FROM ${quote(name)}`).get().n;
    if (remote.tables[name] !== expected) mismatches.push({ table: name, expected, actual: remote.tables[name] ?? null });
  }
  db.close();
  return { ok: !mismatches.length && remote.foreignKeyViolations === 0, mismatches, foreignKeyViolations: remote.foreignKeyViolations };
}

function args(list) {
  const values = {};
  for (let i = 0; i < list.length; i += 2) {
    if (!list[i]?.startsWith('--') || list[i + 1] == null) throw new Error(`Bad argument: ${list[i]}`);
    values[list[i].slice(2)] = list[i + 1];
  }
  return values;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [command, ...rest] = process.argv.slice(2);
  const options = args(rest);
  const token = process.env.JLPT_MIGRATION_TOKEN;
  const run = {
    export: () => exportDump({ origin: options.origin, token, out: options.out }),
    build: () => buildV3({ dump: options.dump, out: options.out }),
    import: () => importV3({ origin: options.origin, token, db: options.db }),
    check: () => checkV3({ origin: options.origin, token, db: options.db }),
  }[command];
  if (!run) { console.error('Commands: export, build, import, check (see the header of this file)'); process.exit(2); }
  try {
    const result = await run();
    console.log(JSON.stringify(result, null, 2));
    if (result?.ok === false) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
