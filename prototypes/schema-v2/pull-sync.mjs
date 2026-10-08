// 用 iOS 同步接口把线上数据拉到本地（只读取，不修改学习数据）。
//   JLPT_SESSION_TOKEN=... node prototypes/schema-v2/pull-sync.mjs --out .local/sync-pull-20261008
// token 只从环境变量读取，不写入文件、不打印。注意：POST /api/sync 与 iOS 正常同步一样，
// 会在线上写一行同步缓存（study_sync_snapshots / transfers，1 小时到 90 天后自动清理）。
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function pullSync({ origin, token, fetchImpl = fetch, maxPages = 2000 }) {
  const call = async (path, body) => {
    const response = await fetchImpl(`${origin}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`${path} 返回 ${response.status}${response.status === 401 ? '（token 无效或已过期）' : ''}`);
    return response.json();
  };
  const status = await call('/api/sync/status');
  const collections = {};
  let page = null, pages = 0, total = 0;
  do {
    const result = await call('/api/sync', { cursor: null, page });   // cursor=null：要求完整快照
    if (result.restart) { page = null; continue; }                      // 分页缓存过期，从头再来
    total = result.total;
    for (const change of result.changes) {
      if (change.deleted) continue;
      (collections[change.collection] ??= {})[change.id] = change.value;
    }
    page = result.nextPage;
    if (++pages > maxPages) throw new Error('分页次数异常');
  } while (page);
  const counts = Object.fromEntries(Object.entries(collections).map(([name, rows]) => [name, Object.keys(rows).length]));
  const received = Object.values(counts).reduce((a, b) => a + b, 0);
  if (received !== total) throw new Error(`收到 ${received} 条，服务端报告 ${total} 条`);
  return { status, collections, counts, total, pages };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
  const out = arg('out');
  const origin = arg('origin', 'https://jlpt.erzhiqian.cc');
  const token = process.env.JLPT_SESSION_TOKEN;
  if (!out) throw new Error('需要 --out 新目录');
  if (!token) throw new Error('需要环境变量 JLPT_SESSION_TOKEN');
  if (existsSync(out)) throw new Error(`${out} 已存在，请指定新目录，避免覆盖之前的数据`);
  const result = await pullSync({ origin, token });
  mkdirSync(out, { recursive: true, mode: 0o700 });
  const save = (name, value) => writeFileSync(join(out, name), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  save('records.json', result.collections);
  save('status.json', result.status);
  save('summary.json', { origin, pulledAt: new Date().toISOString(), total: result.total, pages: result.pages, counts: result.counts });
  console.log(JSON.stringify({ out, total: result.total, pages: result.pages, counts: result.counts }, null, 2));
}
