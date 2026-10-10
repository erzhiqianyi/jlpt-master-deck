// Cloudflare：Durable Object の SQLite 一つに v3 のデータベース全体（アカウントを含む）を置き、画像・音声は R2 に置く。
import { ensureCacheSchema, cleanupTtsCache } from '../server/tts/cache.mjs';
import { ensureTtsSchema } from '../server/tts/schema.mjs';
import { DurableObject } from 'cloudflare:workers';
import { withPlatform } from '../server/platform.mjs';
import { installV3Schema } from '../server/v3/database.mjs';
import { sqliteAdapter } from './sqlite-adapter.mjs';
import { createCopyExporter } from './copy-export.mjs';
import { requestFiles, objectKey } from './files.mjs';
import { createApiHandler } from '../server/api-handler.mjs';
import { createJlptMcp, MCP_PATHS } from '../server/mcp-app.mjs';
import { MAINTENANCE_PATH, createMaintenance, maintenanceAuthorized } from './maintenance.mjs';
import { userForToken } from '../server/accounts.mjs';
import v3Schema from '../server/v3/schema.sql';
import practiceHtml from 'jlpt:practice-html';
import reviewCardsHtml from 'jlpt:review-cards-html';
import aiHomeHtml from 'jlpt:ai-home-html';

class RouteFailure extends Error { constructor(response) { super('Request rejected'); this.response = response; } }
const MEDIA_ROOT = '/jlpt/.local/v3-media';
const MEDIA_LIMIT = 40 * 1024 * 1024;

export class JlptDatabase extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.db = sqliteAdapter(ctx.storage);
    // Explicit maintenance mode is read-only, including constructor and alarm.
    // Enabling against production requires a separately approved deployment.
    if (env.COPY_EXPORT_MODE === 'read-only') {
      this.copyExporter = createCopyExporter(this.db, ctx.storage, env);
      return;
    }
    this.firebase = JSON.parse(env.FIREBASE_CONFIG);
    if (!['apiKey','authDomain','projectId','appId'].every(key => this.firebase[key])) throw new Error('Incomplete Firebase configuration');
    this.ttsSecretKey = env.TTS_SECRETS_KEY ?? null;
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.transactionSync(() => {
        // 旧形式のデータが残っている Durable Object は自動では書き換えない（移行は別の手順）。
        this.awaitingMigration = !installV3Schema(this.db, v3Schema);
        if (this.awaitingMigration) return;
        ensureTtsSchema(this.db);
        ensureCacheSchema(this.db);
      });
      // OAuth と MCP の表（ローカルは server/api.mjs の起動時に作る）。
      if (!this.awaitingMigration) await withPlatform(this.platform(), () => createJlptMcp({ onEvent() {} }).ensureSchema());
    });
  }
  platform(files) {
    return { afterCommit: [], ttsCacheBucket: this.env.MEDIA, ttsCacheEnv: this.env, db: this.db, v3Db: this.db, files: files?.files, mediaRoot: MEDIA_ROOT,
      firebase: this.firebase, ttsSecretKey: this.ttsSecretKey, practiceHtml, reviewCardsHtml, aiHomeHtml, dataSource: 'cloudflare-sqlite',
      readMedia: async (path, limit = MEDIA_LIMIT) => {
        const object = await this.env.MEDIA.get(objectKey(path));
        if (!object) return null;
        if (object.size > limit) throw new Error('Media exceeds the transfer limit');
        return new Uint8Array(await object.arrayBuffer());
      },
    };
  }
  async fetch(request) {
    if (this.copyExporter) return this.ctx.blockConcurrencyWhile(() => this.copyExporter(request));
    const maintenance = MAINTENANCE_PATH.exec(new URL(request.url).pathname);
    if (maintenance) {
      if (!maintenanceAuthorized(request, this.env)) return new Response('Not found', { status: 404 });
      this.maintenance ??= createMaintenance({ db: this.db, storage: this.ctx.storage, legacy: Boolean(this.awaitingMigration) });
      return this.ctx.blockConcurrencyWhile(() => this.maintenance(request, maintenance[2]));
    }
    if (this.awaitingMigration) {
      return Response.json({ error: '学习数据正在迁移，请稍后再试。' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    // One database: serializing requests preserves its transaction semantics.
    return this.ctx.blockConcurrencyWhile(async () => {
      const files = requestFiles();
      const platform = this.platform(files);
      try {
        const response = await this.ctx.storage.transaction(async () => withPlatform(platform, async () => {
          const mcp = createJlptMcp({ onEvent() {}, origins: () => ({ publicOrigin: this.env.PUBLIC_ORIGIN, webOrigin: this.env.PUBLIC_ORIGIN }) });
          const result = await this.dispatch(request, mcp);
          if (result.status >= 400) throw new RouteFailure(result);
          // Uploads become visible before committing their SQL metadata; a failed upload
          // rolls back metadata. A rare commit failure may leave an unreferenced object.
          await files.upload(this.env.MEDIA);
          const pending = this.ctx.storage.kv.get('media-deletes') ?? [];
          this.ctx.storage.kv.put('media-deletes', [...new Set([...pending, ...files.deleteKeys()])]);
          return result;
        }));
        if (platform.afterCommit.length) {
          this.ctx.waitUntil(Promise.resolve().then(() => this.ctx.blockConcurrencyWhile(() => withPlatform(platform, async () => {
            for (const run of platform.afterCommit) await run();
          }))));
        }
        await this.flushDeletes();
        try { if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 86400000); }
        catch { console.warn('TTS cache maintenance scheduling failed'); }
        return response;
      } catch (error) {
        if (error instanceof RouteFailure) return error.response;
        console.error('Cloud API request failed', error.message);
        return Response.json({ error: '云端服务暂时不可用，请稍后重试。' }, { status: 503, headers: { 'cache-control':'no-store' } });
      }
    });
  }
  async flushDeletes() {
    const keys = this.ctx.storage.kv.get('media-deletes') ?? [];
    if (!keys.length) return;
    try {
      for (let offset=0;offset<keys.length;offset+=1000) await this.env.MEDIA.delete(keys.slice(offset,offset+1000));
      this.ctx.storage.kv.delete('media-deletes');
    } catch {
      await this.ctx.storage.setAlarm(Date.now()+60000);
    }
  }
  async alarm() {
    if (this.copyExporter || this.awaitingMigration) return;
    return this.ctx.blockConcurrencyWhile(async () => {
      let delay = 60000;
      try {
        await this.flushDeletes();
        const budget = { remaining: 20, deadline: Date.now() + 5000 };
        await withPlatform({ db: this.db, v3Db: this.db, ttsCacheBucket: this.env.MEDIA, ttsCacheEnv: this.env }, () => cleanupTtsCache({ budget }));
        // Continue bounded batches promptly, otherwise perform the daily sweep.
        delay = budget.remaining <= 0 || Date.now() >= budget.deadline ? 60000 : 86400000;
      } catch {
        // Catch inside the concurrency gate: an escaping error resets the DO.
        console.warn('TTS cache maintenance failed; retry scheduled');
      } finally {
        // Keep any earlier media-delete retry; also re-arm after maintenance errors.
        const next = Date.now() + delay;
        const existing = await this.ctx.storage.getAlarm();
        if (!existing || existing > next) await this.ctx.storage.setAlarm(next);
      }
    });
  }
  async dispatch(request, mcp) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      this.db.prepare('SELECT 1 AS ok').get();
      return Response.json({ ok:true, databaseReady:true, backend:'cloudflare', database:'durable-object-sqlite', media:'r2', mcp:{httpPath:mcp.paths.mcp,serverReady:true,codexConfigReady:false,commandReady:false} }, {headers:{'cache-control':'no-store'}});
    }
    if (MCP_PATHS.test(url.pathname)) return (await mcp.fetch(request)) ?? new Response('Not found',{status:404});
    // Local-only source files are intentionally not copied into the cloud deployment.
    if (url.pathname.startsWith('/api/local-')) {
      const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
      if (!userForToken(token)) return Response.json({error:'Authentication required'},{status:401});
      if (url.pathname === '/api/local-mock-exams') return Response.json({exams:[]});
      return Response.json({error:'此内容尚未同步到云端。'},{status:404});
    }
    const headers = Object.fromEntries(request.headers);
    headers.host = url.host;
    let response;
    const req = {
      method:request.method, url:url.pathname+url.search, headers,
      async *[Symbol.asyncIterator]() {
        if (!request.body) return;
        for await (const chunk of request.body) yield Buffer.from(chunk);
      },
    };
    let status=200, responseHeaders={};
    const res = { writeHead(code, values) {status=code;responseHeaders=values;}, end(body) {response=new Response(body,{status,headers:responseHeaders});} };
    await createApiHandler({mcp,mcpListener(){throw new Error('MCP request was not routed');}})(req,res);
    return response ?? new Response('Not found',{status:404});
  }
}

export default {
  fetch(request, env) {
    // 通常は DATABASE_NAME（既定 primary-v1）。保守 API だけは正しいトークンがあれば名前で選んだ DO に届く。
    const maintenance = MAINTENANCE_PATH.exec(new URL(request.url).pathname);
    if (maintenance && !maintenanceAuthorized(request, env)) return new Response('Not found', { status: 404 });
    const name = maintenance ? maintenance[1] : env.DATABASE_NAME ?? 'primary-v1';
    return env.JLPT_DATABASE.get(env.JLPT_DATABASE.idFromName(name)).fetch(request);
  },
};
