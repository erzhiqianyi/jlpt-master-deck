import { ensureBankMaterialSchema } from '../server/bank-materials.mjs';
import { ensureQuestionBankSchema } from '../server/question-bank.mjs';
import {ensureLearningEventSchema} from '../server/learning-events.mjs';
import { ensureCacheSchema, cleanupTtsCache } from '../server/tts/cache.mjs';
import { DurableObject } from 'cloudflare:workers';
import { withPlatform } from '../server/platform.mjs';
import { sqliteAdapter } from './sqlite-adapter.mjs';
import { requestFiles, objectKey } from './files.mjs';
import { createApiHandler } from '../server/api-handler.mjs';
import { shareCover, listeningShareAudio } from '../server/market.mjs';
import { createJlptMcp, MCP_PATHS } from '../server/mcp-app.mjs';
import { userForToken, materialAudioForUser, listeningAudioForUser, listeningRecordingAudioForUser, itemImageForUser } from '../server/storage.mjs';
import { migrateReviewItemOwnership } from '../server/review-item-ownership.mjs';
import { ensureReferenceSchema } from '../server/references.mjs';
import { ensureQuerySchema } from '../server/mcp-query-schema.mjs';
import { ensureDailySummarySchema } from '../server/daily-summary.mjs';
import { ensureCardReviewSchema } from '../server/card-review-history.mjs';
import { ensureItemSchema } from '../server/item-schema.mjs';
import schema from './migrations/0001.sql';
import practiceCompletionSchema from './migrations/0002_practice_completion_stats.sql';
import practiceHtml from 'jlpt:practice-html';
import reviewCardsHtml from 'jlpt:review-cards-html';
import aiHomeHtml from 'jlpt:ai-home-html';

class RouteFailure extends Error { constructor(response) { super('Request rejected'); this.response = response; } }

export class JlptDatabase extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.db = sqliteAdapter(ctx.storage);
    this.firebase = JSON.parse(env.FIREBASE_CONFIG);
    if (!['apiKey','authDomain','projectId','appId'].every(key => this.firebase[key])) throw new Error('Incomplete Firebase configuration');
    this.ttsSecretKey = env.TTS_SECRETS_KEY ?? null;
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.transactionSync(() => {
        this.db.exec('CREATE TABLE IF NOT EXISTS cloud_schema_version (version INTEGER PRIMARY KEY)');
        if (!this.db.prepare('SELECT version FROM cloud_schema_version WHERE version=1').get()) {
          this.db.exec(schema);
          this.db.prepare('INSERT INTO cloud_schema_version(version) VALUES(1)').run();
        }
        migrateCloudSchemaV2(this.db);
        migrateCloudSchemaV3(this.db);
        migrateCloudSchemaV4(this.db);
        migrateCloudSchemaV6(this.db);
        migrateCloudReadingRuby(this.db);
        for (const table of ['reading_questions', 'listening_questions']) {
          if (!this.db.prepare(`PRAGMA table_info(${table})`).all().some(column => column.name === 'japanese_annotations_json')) {
            this.db.exec(`ALTER TABLE ${table} ADD COLUMN japanese_annotations_json TEXT NOT NULL DEFAULT '[]'`);
          }
        }
        if (!this.db.prepare('SELECT version FROM cloud_schema_version WHERE version=7').get()) {
          this.db.exec(practiceCompletionSchema);
          this.db.exec('INSERT INTO cloud_schema_version(version) VALUES(7)');
        }
        ensureCardReviewSchema(this.db);
        ensureLearningEventSchema(this.db);
        ensureDailySummarySchema(this.db);
        ensureQuestionBankSchema(this.db);
        ensureBankMaterialSchema(this.db);
        this.db.exec('INSERT OR IGNORE INTO cloud_schema_version(version) VALUES(5)');
        migrateReviewItemOwnership(this.db);
        ensureItemSchema(this.db);
        ensureQuerySchema(this.db);
        ensureReferenceSchema(this.db);
        ensureCacheSchema(this.db);
      });
    });
  }
  async fetch(request) {
    // The existing app has one database. Serializing requests preserves its transaction
    // semantics and prevents overlapping authenticated requests from sharing adapters.
    return this.ctx.blockConcurrencyWhile(async () => {
      const files = requestFiles();
      const platform = { afterCommit: [], ttsCacheBucket: this.env.MEDIA, ttsCacheEnv: this.env, db: this.db, files: files.files, firebase: this.firebase, ttsSecretKey: this.ttsSecretKey, practiceHtml, reviewCardsHtml, aiHomeHtml, dataSource: 'cloudflare-sqlite',
        readMedia: async (path, limit) => {
          const object = await this.env.MEDIA.get(objectKey(path));
          if (!object) return null;
          if (object.size > limit) throw new Error('Audio exceeds the 25 MB MCP transfer limit');
          return new Uint8Array(await object.arrayBuffer());
        },
      };
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
    return this.ctx.blockConcurrencyWhile(async () => {
      let delay = 60000;
      try {
        await this.flushDeletes();
        const budget = { remaining: 20, deadline: Date.now() + 5000 };
        await withPlatform({ db: this.db, ttsCacheBucket: this.env.MEDIA, ttsCacheEnv: this.env }, () => cleanupTtsCache({ budget }));
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
      return Response.json({ ok:true, databaseReady:true, reviewDataReady:true, backend:'cloudflare', database:'durable-object-sqlite', media:'r2', mcp:{httpPath:mcp.paths.mcp,serverReady:true,codexConfigReady:false,commandReady:false} }, {headers:{'cache-control':'no-store'}});
    }
    if (MCP_PATHS.test(url.pathname)) return (await mcp.fetch(request)) ?? new Response('Not found',{status:404});
    // Local-only source files are intentionally not copied into this empty cloud deployment.
    if (url.pathname.startsWith('/api/local-')) {
      const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
      if (!userForToken(token)) return Response.json({error:'Authentication required'},{status:401});
      if (url.pathname === '/api/local-mock-exams') return Response.json({exams:[]});
      return Response.json({error:'此内容尚未同步到云端。'},{status:404});
    }
    const cover = /^\/api\/market\/([^/]+)\/cover$/.exec(url.pathname);
    if (cover && request.method === 'GET') {
      let asset;
      try { asset = shareCover(cover[1],url.searchParams.has('revision')?Number(url.searchParams.get('revision')):undefined); } catch { return new Response('Not found', { status: 404 }); }
      const object = await this.env.MEDIA.get(objectKey(asset.path));
      if (!object) return new Response('Not found', { status: 404 });
      return new Response(object.body, { headers: { 'content-type': asset.mime, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
    }
    const audio = /^\/api\/(listening-questions|listening-recordings)\/([^/]+)\/audio$/.exec(url.pathname);
    const sharedAudio = /^\/api\/market\/([^/]+)\/audio$/.exec(url.pathname);
    if (sharedAudio && request.method === 'GET') {
      const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
      const user = userForToken(token);
      if (!user) return Response.json({error:'Authentication required'},{status:401});
      let row;
      try { row = listeningShareAudio(user.id, sharedAudio[1]); }
      catch { return new Response('Not found',{status:404}); }
      const object = await this.env.MEDIA.get(objectKey(row.audio_path));
      if (!object) return new Response('Not found',{status:404});
      return new Response(object.body,{headers:{'content-type':row.audio_mime,'content-length':String(object.size),'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
    }
    const materialAudio = /^\/api\/materials\/([^/]+)\/versions\/(\d+)\/audio$/.exec(url.pathname);
    if ((audio || materialAudio) && request.method === 'GET') {
      const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
      let userId;
      if (mcp.carriesToken(request)) {
        let grant;
        try { grant = await mcp.authenticate(request); }
        catch { return Response.json({error:'Authentication required'},{status:401}); }
        if (!grant) return Response.json({error:'Authentication required'},{status:401});
        if (!grant.scopes.includes('audio:read')) return Response.json({error:'Audio access not granted'},{status:403});
        userId = Number(grant.ownerId);
      } else {
        userId = userForToken(token)?.id;
      }
      if (!userId) return Response.json({error:'Authentication required'},{status:401});
      const row = materialAudio ? materialAudioForUser(userId,decodeURIComponent(materialAudio[1]),Number(materialAudio[2])) : (audio[1] === 'listening-questions' ? listeningAudioForUser : listeningRecordingAudioForUser)(userId, audio[2]);
      if (!row) return new Response('Not found',{status:404});
      const object = await this.env.MEDIA.get(objectKey(row.audio_path));
      if (!object) return new Response('Not found',{status:404});
      return new Response(object.body,{headers:{'content-type':row.audio_mime,'content-length':String(object.size),'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
    }
    const image = /^\/api\/item-images\/([^/]+)$/.exec(url.pathname);
    if (image && request.method === 'GET') {
      const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
      const user = userForToken(token);
      if (!user) return Response.json({error:'Authentication required'},{status:401});
      const row = itemImageForUser(user.id, image[1]);
      if (!row) return new Response('Not found',{status:404});
      const object = await this.env.MEDIA.get(objectKey(row.image_path));
      if (!object) return new Response('Not found',{status:404});
      return new Response(object.body,{headers:{'content-type':row.mime,'content-length':String(object.size),'cache-control':'private, max-age=86400','x-content-type-options':'nosniff'}});
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

function migrateCloudSchemaV4(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS user_tts_credentials (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    credential_encrypted TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, provider)
  );
  INSERT OR IGNORE INTO cloud_schema_version(version) VALUES(4);`);
}

function migrateCloudSchemaV6(db) {
  const columns = (table) => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
  for (const [table, column, definition] of [
    ['listening_questions', 'choice_details_json', "TEXT NOT NULL DEFAULT '[]'"],
    ['listening_audio_assets', 'transcript', "TEXT NOT NULL DEFAULT ''"],
    ['listening_audio_assets', 'transcript_translation', "TEXT NOT NULL DEFAULT ''"],
  ]) {
    if (!columns(table).has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  db.exec('INSERT OR IGNORE INTO cloud_schema_version(version) VALUES(6)');
}

function migrateCloudSchemaV3(db) {
  // Existing databases do not replay 0001.sql when its contents change.
  // Create the audio registry before reference backfills access it.
  db.exec(`CREATE TABLE IF NOT EXISTS listening_audio_assets (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    audio_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, sha256)
  );
  INSERT OR IGNORE INTO cloud_schema_version(version) VALUES(3);`);
}

function migrateCloudSchemaV2(db) {
  const columns = (table) => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
  const addColumn = (table, name, definition) => {
    if (!columns(table).has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  addColumn('listening_questions', 'question_type_id', "TEXT NOT NULL DEFAULT 'listening-task'");
  addColumn('listening_questions', 'library_number', 'INTEGER');
  addColumn('listening_questions', 'audio_asset_id', 'TEXT');
  addColumn('reading_questions', 'tags_json', "TEXT NOT NULL DEFAULT '[]'");
  addColumn('reading_questions', 'explanation_nodes_json', "TEXT NOT NULL DEFAULT '[]'");
  addColumn('reading_questions', 'translation_lines_json', "TEXT NOT NULL DEFAULT '[]'");
  addColumn('reading_questions', 'passage_translation', "TEXT NOT NULL DEFAULT ''");
  addColumn('reading_questions', 'choice_explanations_json', "TEXT NOT NULL DEFAULT '[]'");
  addColumn('reading_questions', 'reading_analysis_json', "TEXT NOT NULL DEFAULT '{}'");
  addColumn('learning_captures', 'target_deck', 'TEXT');
  addColumn('learning_captures', 'target_wordbook_id', 'TEXT');
  if (!db.prepare('SELECT version FROM cloud_schema_version WHERE version=2').get()) {
    db.prepare('INSERT INTO cloud_schema_version(version) VALUES(2)').run();
  }
}

export default {
  fetch(request, env) {
    return env.JLPT_DATABASE.get(env.JLPT_DATABASE.idFromName('primary-v1')).fetch(request);
  },
};

function migrateCloudReadingRuby(db) {
  if (db.prepare('SELECT version FROM cloud_schema_version WHERE version=8').get()) return;
  if (!db.prepare('PRAGMA table_info(reading_questions)').all().some((column) => column.name === 'ruby_terms_json')) {
    db.exec("ALTER TABLE reading_questions ADD COLUMN ruby_terms_json TEXT NOT NULL DEFAULT '[]'");
  }
  db.exec('INSERT INTO cloud_schema_version(version) VALUES(8)');
}
