// 移行用の保守 API（既定では無効）。MAINTENANCE_TOKEN（32 文字以上の Cloudflare secret）を設定したときだけ動く。
//   POST /__maintenance/<db>/export              全表を一つのトランザクションで書き出し、256 KiB ごとに分けて 10 分保持
//   GET  /__maintenance/<db>/export/<id>/<n>     その一片
//   PUT  /__maintenance/<db>/import/<n>          取り込む書き出しの一片を置く（users が空の v3 データベースだけ）
//   POST /__maintenance/<db>/import/commit       {bytes, sha256, chunks}：検査してから一つのトランザクションで置き換え
//   GET  /__maintenance/<db>/status              各表の件数とハッシュ
// <db> は Durable Object の名前（primary-v1 など）。旧形式の DO は読むだけで、書き換えない。
import { createHash, timingSafeEqual } from 'node:crypto';
import { dumpDatabase, digestDatabase, replaceContents } from '../server/v3/dump.mjs';

export const MAINTENANCE_PATH = /^\/__maintenance\/(primary-v[0-9]+)(\/.*)$/;
const CHUNK = 256 * 1024;
const MAX_DUMP = 128 * 1024 * 1024;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });

/** Worker と DO の両方で使う：トークンが正しいか（未設定・短すぎるときは常に false）。 */
export function maintenanceAuthorized(request, env) {
  const configured = env.MAINTENANCE_TOKEN;
  const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
  return typeof configured === 'string' && configured.length >= 32 && Buffer.byteLength(token) === Buffer.byteLength(configured)
    && timingSafeEqual(Buffer.from(token), Buffer.from(configured));
}

export function createMaintenance({ db, storage, legacy }) {
  let exported = null;
  const staged = () => db.exec('CREATE TABLE IF NOT EXISTS _maintenance_import (idx INTEGER PRIMARY KEY, bytes BLOB NOT NULL)');
  return async (request, path) => {
    if (request.method === 'GET' && path === '/status') return json({ legacy, tables: storage.transactionSync(() => digestDatabase(db)) });

    if (request.method === 'POST' && path === '/export') {
      const bytes = Buffer.from(JSON.stringify(storage.transactionSync(() => dumpDatabase(db))));
      if (bytes.length > MAX_DUMP) return json({ error: 'Database too large for a single export' }, 413);
      const chunks = [];
      for (let i = 0; i < bytes.length; i += CHUNK) chunks.push(bytes.subarray(i, i + CHUNK));
      exported = { id: sha256(bytes), chunks, expiresAt: Date.now() + 10 * 60000 };
      return json({ id: exported.id, bytes: bytes.length, sha256: exported.id, expiresAt: exported.expiresAt, chunks: chunks.map((c, index) => ({ index, bytes: c.length, sha256: sha256(c) })) });
    }
    const piece = /^\/export\/([a-f0-9]{64})\/(0|[1-9][0-9]*)$/.exec(path);
    if (request.method === 'GET' && piece) {
      if (!exported || exported.id !== piece[1] || Date.now() > exported.expiresAt || Number(piece[2]) >= exported.chunks.length) return json({ error: 'Export absent or expired' }, 404);
      return new Response(exported.chunks[Number(piece[2])], { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' } });
    }

    if (path.startsWith('/import')) {
      if (legacy) return json({ error: 'This database still holds legacy data; import into a new database name' }, 409);
      if (db.prepare('SELECT count(*) AS n FROM users').get().n > 0) return json({ error: 'Target database already has accounts; refusing to overwrite' }, 409);
      const upload = /^\/import\/(0|[1-9][0-9]*)$/.exec(path);
      if (request.method === 'PUT' && upload) {
        const bytes = Buffer.from(await request.arrayBuffer());
        if (!bytes.length || bytes.length > CHUNK * 4) return json({ error: 'Chunk size out of range' }, 413);
        staged();
        db.prepare('INSERT OR REPLACE INTO _maintenance_import (idx, bytes) VALUES (?, ?)').run(Number(upload[1]), bytes);
        return json({ index: Number(upload[1]), bytes: bytes.length, sha256: sha256(bytes) });
      }
      if (request.method === 'POST' && path === '/import/commit') {
        const manifest = await request.json();
        staged();
        const pieces = db.prepare('SELECT idx, bytes FROM _maintenance_import ORDER BY idx').all();
        if (pieces.length !== manifest.chunks || pieces.some((p, i) => p.idx !== i)) return json({ error: 'Missing or extra chunks', received: pieces.map((p) => p.idx) }, 422);
        const bytes = Buffer.concat(pieces.map((p) => Buffer.from(p.bytes)));
        if (bytes.length !== manifest.bytes || sha256(bytes) !== manifest.sha256) return json({ error: 'Import bytes do not match the manifest' }, 422);
        const dump = JSON.parse(bytes.toString('utf8'));
        let result;
        try {
          result = storage.transactionSync(() => {
          const expected = replaceContents(db, dump);
          const actual = digestDatabase(db, { tables: expected.map((t) => t.name) });
          const mismatched = expected.filter((t) => { const a = actual.find((x) => x.name === t.name); return !a || a.count !== t.count || a.sha256 !== t.sha256; });
          if (mismatched.length) throw Object.assign(new Error('Imported tables differ from the dump'), { mismatched });
          const violations = db.prepare('PRAGMA foreign_key_check').all();
          if (violations.length) throw Object.assign(new Error('Foreign key violations after import'), { violations: violations.slice(0, 20) });
          db.exec('DROP TABLE _maintenance_import');
          return { tables: actual };
          });
        } catch (error) {
          // トランザクションは巻き戻っている：対象は空のまま、やり直せる。
          return json({ error: error.message, mismatched: error.mismatched, violations: error.violations }, 422);
        }
        return json({ imported: true, ...result });
      }
    }
    return json({ error: 'Unsupported maintenance route' }, 404);
  };
}
