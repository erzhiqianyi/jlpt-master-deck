import { cachedSpeech } from '../../server/tts/cache.mjs';
import { withPlatform } from '../../server/platform.mjs';
// Local integration-test entry only. Production always bundles api-worker.mjs.
import { JlptDatabase } from '../api-worker.mjs';
const fetchProduction = JlptDatabase.prototype.fetch;
const dispatchProduction = JlptDatabase.prototype.dispatch;
// 旧エンジンの読解・聴解の問題は REST から作れなくなった（作成は v3 の題庫）。録音や R2 音声の確認用に、本番と同じトランザクション・アップロード経路の中で直接作る。
JlptDatabase.prototype.dispatch = async function(request, mcp) {
  const { pathname } = new URL(request.url);
  if (['/__seed-listening', '/__seed-reading', '/__delete-listening'].includes(pathname)) {
    const storage = await import('../../server/storage.mjs');
    const body = await request.json();
    const userId = Number(request.headers.get('x-test-user') ?? 1);
    if (pathname === '/__delete-listening') return Response.json({ ok: storage.deleteListeningQuestion(userId, body.id) });
    const question = pathname === '/__seed-listening' ? storage.createListeningQuestion(userId, body) : storage.createReadingQuestion(userId, body);
    return Response.json({ question }, { status: 201 });
  }
  return dispatchProduction.call(this, request, mcp);
};
JlptDatabase.prototype.fetch = async function(request) {
    if (new URL(request.url).pathname === '/__tts-cache-alarm-recovery') {
      const original = this.db.prepare;
      await this.ctx.storage.deleteAlarm();
      let failed = false;
      this.db.prepare = query => { if (query.includes('DISTINCT user_id')) { failed = true; throw new Error('fixture maintenance failure'); } return original(query); };
      try { await this.alarm(); } catch { failed = true; } finally { this.db.prepare = original; }
      const next = await this.ctx.storage.getAlarm();
      return Response.json({ failed, retrySoon: next > Date.now() && next <= Date.now() + 61000 });
    }
    if (new URL(request.url).pathname === '/__tts-cache-batches') {
      await this.ctx.blockConcurrencyWhile(() => withPlatform({ db: this.db, ttsCacheBucket: this.env.MEDIA, ttsSecretKey: 'fixture-secret' }, async () => {
        for (let id = 100; id < 125; id++) await cachedSpeech(id, 'batch', async () => ({ audio: Buffer.from('fixture'), mimeType: 'audio/mpeg' }));
        this.db.exec('UPDATE tts_audio_cache SET created = 0, accessed = 0');
      }));
      await this.alarm();
      const first = this.db.prepare('SELECT count(*) AS n FROM tts_audio_cache').get().n;
      await this.alarm();
      return Response.json({ first, remaining: this.db.prepare('SELECT count(*) AS n FROM tts_audio_cache').get().n });
    }
    if (new URL(request.url).pathname === '/__tts-cache-expire') {
      this.db.exec('UPDATE tts_audio_cache SET created = 0, accessed = 0');
      await this.alarm();
      return Response.json({ remaining: this.db.prepare('SELECT count(*) AS n FROM tts_audio_cache').get().n, alarm: Boolean(await this.ctx.storage.getAlarm()) });
    }
    if (new URL(request.url).pathname === '/__tts-cache') {
      return this.ctx.blockConcurrencyWhile(() => withPlatform({ db: this.db, ttsCacheBucket: this.env.MEDIA, ttsSecretKey: 'fixture-secret' }, async () => {
        let generated = false;
        const result = await cachedSpeech(1, { text: 'fixture' }, async () => { generated = true; return { audio: Buffer.from('fixture-audio'), mimeType: 'audio/mpeg' }; });
        return Response.json({ generated, audio: result.audio.toString() });
      }));
    }
    if (new URL(request.url).pathname === '/__legacy-audio-schema') {
      return this.ctx.blockConcurrencyWhile(async () => {
        // 新结构下 listening_audio_assets 是兼容视图（数据在 media_files），只有旧结构才模拟缺表
        if (this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='listening_audio_assets'").get()) {
          this.db.exec('DROP TABLE listening_audio_assets; DELETE FROM cloud_schema_version WHERE version=3;');
        }
        this.db.exec('DROP TRIGGER increment_practice_completion; DROP TABLE practice_completion_receipts; DROP TABLE practice_completion_stats; DELETE FROM cloud_schema_version WHERE version=7;');
        return new Response('legacy schema restored');
      });
    }
    if (new URL(request.url).pathname === '/__large-sync-seed') {
      return this.ctx.blockConcurrencyWhile(async () => {
        const now = '2026-10-07';
        this.db.prepare('INSERT OR IGNORE INTO users VALUES(?,?,?,?,?)').run(3,'test-3','','',now);
        this.db.prepare('INSERT OR IGNORE INTO sessions VALUES(?,?,?,?)').run('test-3',3,now,now);
        for (let index = 0; index < 12; index++) {
          const id = `large-${index}`;
          const item = { id, deck:'grammar_expression',type:'grammar',original:'範囲',input_at:'2026-10-07T00:00:00Z',meaning_zh:'日本語😀'.repeat(20000) };
          this.db.prepare('INSERT INTO owned_review_items VALUES(?,?,?,?,?,?)').run(3,id,JSON.stringify(item),'fixture',now,now);
        }
        return new Response('seeded');
      });
    }
    if (new URL(request.url).pathname === '/__seed') {
      return this.ctx.blockConcurrencyWhile(async () => {
        for (const id of [1,2]) {
          this.db.prepare('INSERT OR IGNORE INTO users VALUES(?,?,?,?,?)').run(id,`test-${id}`,'','','2026-09-21');
          this.db.prepare('INSERT OR IGNORE INTO sessions VALUES(?,?,?,?)').run(`test-${id}`,id,'2026-09-21','2026-09-21');
        }
        return new Response('seeded');
      });
    }
    if (request.headers.get('x-test-fail-upload')) {
      const bucket=this.env.MEDIA;
      this.env.MEDIA={put(){throw new Error('Injected upload failure');}};
      try {return await fetchProduction.call(this, request);} finally {this.env.MEDIA=bucket;}
    }
    return fetchProduction.call(this, request);
};
export { JlptDatabase };
export { default } from '../api-worker.mjs';
