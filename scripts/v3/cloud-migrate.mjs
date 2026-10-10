// Cloudflare の Durable Object を v3 に移す（設計 §11 第 6 段階：備份 → 迁移 → 对账 → 切换）。
//
//   1. export     旧 DO（primary-v1）を丸ごと書き出す。旧 DO は移行待ちで読むだけ、何も変えない（そのまま備份として残る）。
//   2. to-sqlite  書き出しをローカルの SQLite ファイルにする。
//      その後 node scripts/v3/migrate.mjs と scripts/v3/verify-*.mjs で迁移・对账する。
//   3. package    v3 の SQLite ファイルを取り込み用の書き出しにする。
//   4. import     新しい DO（primary-v3 など、まだアカウントのないもの）に取り込み、各表の件数とハッシュを突き合わせる。
//   5. 切换：wrangler.api.json の vars に DATABASE_NAME を設定して再デプロイ。戻すときは元の名前に戻す。
//
// 保守 API はデプロイ先に MAINTENANCE_TOKEN（32 文字以上）の secret があるときだけ有効。このスクリプトは同じ値を
// 環境変数 JLPT_MAINTENANCE_TOKEN から読む。本番での実行は別途承認が必要。
//
//   node scripts/v3/cloud-migrate.mjs export    --url https://api.example --database primary-v1 --out legacy-dump.json
//   node scripts/v3/cloud-migrate.mjs to-sqlite --dump legacy-dump.json --out legacy.sqlite
//   node scripts/v3/cloud-migrate.mjs package   --db v3.sqlite --out v3-dump.json
//   node scripts/v3/cloud-migrate.mjs import    --url https://api.example --database primary-v3 --dump v3-dump.json
//   node scripts/v3/cloud-migrate.mjs status    --url https://api.example --database primary-v3
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dumpDatabase, restoreIntoEmpty, verifyDump } from '../../server/v3/dump.mjs';

const CHUNK = 256 * 1024;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function parseArgs(args, allowed) {
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    const [flag, value] = [args[i], args[i + 1]];
    if (!allowed.includes(flag) || flag in values) throw new Error(`Unknown or repeated argument ${flag}; expected ${allowed.join(' ')}`);
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    values[flag] = value;
  }
  for (const flag of allowed) if (!(flag in values)) throw new Error(`Missing ${flag}`);
  return values;
}

/** 保守 API の呼び出し。fetchImpl はテストで差し替える。 */
export function maintenanceClient({ url, database, token, fetchImpl = fetch }) {
  if (!token || token.length < 32) throw new Error('Set JLPT_MAINTENANCE_TOKEN (32+ characters, same as the MAINTENANCE_TOKEN secret)');
  if (!/^primary-v[0-9]+$/.test(database)) throw new Error('--database must look like primary-v1');
  const base = `${url.replace(/\/$/, '')}/__maintenance/${database}`;
  const call = async (path, init = {}) => {
    const response = await fetchImpl(base + path, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
    if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status} ${await response.text()}`);
    return response;
  };
  return {
    status: async () => (await call('/status')).json(),
    async exportDump() {
      const manifest = await (await call('/export', { method: 'POST' })).json();
      const pieces = [];
      for (const chunk of manifest.chunks) {
        const bytes = Buffer.from(await (await call(`/export/${manifest.id}/${chunk.index}`)).arrayBuffer());
        if (bytes.length !== chunk.bytes || sha256(bytes) !== chunk.sha256) throw new Error(`Chunk ${chunk.index} does not match its manifest entry`);
        pieces.push(bytes);
      }
      const bytes = Buffer.concat(pieces);
      if (bytes.length !== manifest.bytes || sha256(bytes) !== manifest.sha256) throw new Error('Export does not match its manifest');
      return { manifest, dump: verifyDump(JSON.parse(bytes.toString('utf8'))), bytes };
    },
    async importDump(dump) {
      const bytes = Buffer.from(JSON.stringify(verifyDump(dump)));
      const chunks = Math.ceil(bytes.length / CHUNK);
      for (let index = 0; index < chunks; index++) {
        const piece = bytes.subarray(index * CHUNK, (index + 1) * CHUNK);
        const echoed = await (await call(`/import/${index}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: piece })).json();
        if (echoed.sha256 !== sha256(piece)) throw new Error(`Chunk ${index} was stored with a different hash`);
      }
      return (await call('/import/commit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bytes: bytes.length, sha256: sha256(bytes), chunks }) })).json();
    },
  };
}

/** 書き出しの各表と、取り込み先の各表（件数・ハッシュ）の突き合わせ。 */
export function reconcile(dump, remoteTables) {
  return dump.tables.map(({ name, count, sha256: digest }) => {
    const remote = remoteTables.find((t) => t.name === name);
    return { name, expected: count, actual: remote?.count ?? null, matches: Boolean(remote) && remote.count === count && remote.sha256 === digest };
  });
}

export async function run(argv, { env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  const [command, ...rest] = argv;
  const client = (a) => maintenanceClient({ url: a['--url'], database: a['--database'], token: env.JLPT_MAINTENANCE_TOKEN, fetchImpl });
  if (command === 'export') {
    const a = parseArgs(rest, ['--url', '--database', '--out']);
    if (existsSync(a['--out'])) throw new Error(`${a['--out']} exists; choose a new file`);
    const { manifest, bytes, dump } = await client(a).exportDump();
    writeFileSync(a['--out'], bytes, { mode: 0o600 });
    log(JSON.stringify({ exported: a['--out'], sha256: manifest.sha256, bytes: manifest.bytes, tables: dump.tables.map((t) => [t.name, t.count]) }, null, 2));
  } else if (command === 'to-sqlite') {
    const a = parseArgs(rest, ['--dump', '--out']);
    if (existsSync(a['--out'])) throw new Error(`${a['--out']} exists; choose a new file`);
    const db = new DatabaseSync(a['--out']);
    restoreIntoEmpty(db, JSON.parse(readFileSync(a['--dump'], 'utf8')));
    db.close();
    log(`Wrote ${a['--out']}. Next: node scripts/v3/migrate.mjs ${a['--out']} <v3.sqlite> and the scripts/v3/verify-*.mjs checks.`);
  } else if (command === 'package') {
    const a = parseArgs(rest, ['--db', '--out']);
    if (existsSync(a['--out'])) throw new Error(`${a['--out']} exists; choose a new file`);
    const db = new DatabaseSync(a['--db'], { readOnly: true });
    const dump = dumpDatabase(db);
    db.close();
    if (!dump.tables.some((t) => t.name === 'knowledge_points')) throw new Error(`${a['--db']} is not a v3 database`);
    writeFileSync(a['--out'], JSON.stringify(dump), { mode: 0o600 });
    log(JSON.stringify({ packaged: a['--out'], tables: dump.tables.length, rows: dump.tables.reduce((n, t) => n + t.count, 0) }));
  } else if (command === 'import') {
    const a = parseArgs(rest, ['--url', '--database', '--dump']);
    const dump = verifyDump(JSON.parse(readFileSync(a['--dump'], 'utf8')));
    const c = client(a);
    await c.importDump(dump);
    const rows = reconcile(dump, (await c.status()).tables);
    log(JSON.stringify({ imported: a['--database'], reconciled: rows.every((r) => r.matches), mismatched: rows.filter((r) => !r.matches) }, null, 2));
    if (!rows.every((r) => r.matches)) throw new Error('Reconciliation failed; do not switch DATABASE_NAME');
  } else if (command === 'status') {
    const a = parseArgs(rest, ['--url', '--database']);
    log(JSON.stringify(await client(a).status(), null, 2));
  } else {
    throw new Error('Commands: export, to-sqlite, package, import, status');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exit(1); });
}
