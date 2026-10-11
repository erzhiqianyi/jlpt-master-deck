// 線上移行（第 6 段階）の通り道。普段は無効で、Worker を MIGRATION_MODE と MIGRATION_TOKEN（32 文字以上）付きで出したときだけ使える。
//   export：旧い Durable Object をそのまま（アカウント・OAuth・暗号化された読み上げの鍵を含む）表ごとに読み出す。読むだけ。
//   import：手元で v3 に移行したデータベースを、空の新しい Durable Object に書き込む。旧い DO には触らない（切り戻し先として残る）。
// 通常の API・MCP・アラームは両方のモードで止まる。
import { timingSafeEqual } from 'node:crypto';

const MAX_ROWS = 500;
const MAX_BODY = 4 * 1024 * 1024;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const quote = (name) => `"${String(name).replaceAll('"', '""')}"`;

/** Durable Object の内部表と SQLite の内部表は対象外。 */
export function userTables(db) {
  return db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY rowid").all();
}
function columnsOf(db, table) { return db.prepare(`PRAGMA table_info(${quote(table)})`).all().map((c) => c.name); }
function hasRowid(sql) { return !/WITHOUT\s+ROWID\s*;?\s*$/i.test(sql ?? ''); }

/** 表ごとの件数（移行の前後で照らし合わせる）。 */
export function tableCounts(db) {
  return Object.fromEntries(userTables(db).map((t) => [t.name, db.prepare(`SELECT count(*) AS n FROM ${quote(t.name)}`).get().n]));
}

export function createMigrationHandler(db, storage, env) {
  const mode = env.MIGRATION_MODE;
  const configured = env.MIGRATION_TOKEN;
  const authorized = (request) => {
    const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
    return typeof configured === 'string' && configured.length >= 32 && Buffer.byteLength(token) === Buffer.byteLength(configured)
      && timingSafeEqual(Buffer.from(token), Buffer.from(configured));
  };
  const readBody = async (request) => {
    const text = await request.text();
    if (text.length > MAX_BODY) throw Object.assign(new Error('Request too large'), { status: 413 });
    return text ? JSON.parse(text) : {};
  };

  return async (request) => {
    if (!authorized(request)) return json({ error: 'Migration authorization required' }, 403);
    const url = new URL(request.url);
    try {
      if (url.pathname === '/__migration/status' && request.method === 'GET') {
        return json({ mode, tables: tableCounts(db) });
      }
      if (mode === 'export') {
        if (url.pathname === '/__migration/manifest' && request.method === 'GET') {
          const objects = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY rowid").all();
          return json({
            format: 'jlpt-do-dump', version: 1, exportedAt: new Date().toISOString(),
            tables: userTables(db).map((t) => ({ name: t.name, sql: t.sql, columns: columnsOf(db, t.name), rowid: hasRowid(t.sql), count: db.prepare(`SELECT count(*) AS n FROM ${quote(t.name)}`).get().n })),
            indexes: objects.filter((o) => o.type === 'index').map((o) => o.sql),
          });
        }
        if (url.pathname === '/__migration/rows' && request.method === 'GET') {
          const table = url.searchParams.get('table');
          const entry = userTables(db).find((t) => t.name === table);
          if (!entry) return json({ error: 'Unknown table' }, 404);
          const limit = Math.min(MAX_ROWS, Math.max(1, Number(url.searchParams.get('limit')) || MAX_ROWS));
          const columns = columnsOf(db, table).map(quote).join(', ');
          if (hasRowid(entry.sql)) {
            // rowid の順に読むので、読んでいるあいだに増えても重ならない（export モードでは通常の書き込みは止まっている）
            const after = Number(url.searchParams.get('after') ?? 0);
            const rows = db.prepare(`SELECT rowid AS __rowid, ${columns} FROM ${quote(table)} WHERE rowid > ? ORDER BY rowid LIMIT ?`).all(after, limit);
            const next = rows.length === limit ? rows.at(-1).__rowid : null;
            return json({ rows: rows.map(({ __rowid, ...row }) => row), next });
          }
          const offset = Number(url.searchParams.get('after') ?? 0);
          const rows = db.prepare(`SELECT ${columns} FROM ${quote(table)} ORDER BY 1 LIMIT ? OFFSET ?`).all(limit, offset);
          return json({ rows, next: rows.length === limit ? offset + rows.length : null });
        }
        return json({ error: 'Export mode is read-only' }, 405);
      }
      if (mode === 'import') {
        if (url.pathname === '/__migration/schema' && request.method === 'POST') {
          if (userTables(db).length) return json({ error: 'Target database is not empty' }, 409);
          const { statements } = await readBody(request);
          if (!Array.isArray(statements) || !statements.length) return json({ error: 'statements required' }, 400);
          storage.transactionSync(() => { for (const sql of statements) db.exec(String(sql)); });
          return json({ tables: userTables(db).map((t) => t.name) });
        }
        if (url.pathname === '/__migration/rows' && request.method === 'POST') {
          const { table, columns, rows } = await readBody(request);
          if (!userTables(db).some((t) => t.name === table)) return json({ error: 'Unknown table' }, 404);
          if (!Array.isArray(columns) || !columns.length || columns.length > 100) return json({ error: 'columns must have 1–100 names' }, 400);
          if (!Array.isArray(rows) || rows.length > MAX_ROWS) return json({ error: `rows must be an array of at most ${MAX_ROWS}` }, 400);
          const known = new Set(columnsOf(db, table));
          if (columns.some((c) => !known.has(c))) return json({ error: 'Unknown column' }, 400);
          const insert = `INSERT INTO ${quote(table)} (${columns.map(quote).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
          storage.transactionSync(() => {
            db.exec('PRAGMA defer_foreign_keys = ON');
            for (const row of rows) db.prepare(insert).run(...columns.map((c) => row[c] ?? null));
          });
          return json({ inserted: rows.length });
        }
        if (url.pathname === '/__migration/check' && request.method === 'GET') {
          const violations = db.prepare('PRAGMA foreign_key_check').all();
          return json({ tables: tableCounts(db), foreignKeyViolations: violations.length, samples: violations.slice(0, 20) });
        }
        return json({ error: 'Unsupported import route' }, 404);
      }
      return json({ error: 'Unknown migration mode' }, 400);
    } catch (error) {
      return json({ error: error.message }, error.status ?? 422);
    }
  };
}
