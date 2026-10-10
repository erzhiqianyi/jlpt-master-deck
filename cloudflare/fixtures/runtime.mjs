import { cachedSpeech } from '../../server/tts/cache.mjs';
import { withPlatform } from '../../server/platform.mjs';
import { restoreIntoEmpty } from '../../server/v3/dump.mjs';
// Local integration-test entry only. Production always bundles api-worker.mjs.
import { JlptDatabase } from '../api-worker.mjs';
const fetchProduction = JlptDatabase.prototype.fetch;
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
      await this.ctx.blockConcurrencyWhile(() => withPlatform({ db: this.db, v3Db: this.db, ttsCacheBucket: this.env.MEDIA, ttsSecretKey: 'fixture-secret' }, async () => {
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
      return this.ctx.blockConcurrencyWhile(() => withPlatform({ db: this.db, v3Db: this.db, ttsCacheBucket: this.env.MEDIA, ttsSecretKey: 'fixture-secret' }, async () => {
        let generated = false;
        const result = await cachedSpeech(1, { text: 'fixture' }, async () => { generated = true; return { audio: Buffer.from('fixture-audio'), mimeType: 'audio/mpeg' }; });
        return Response.json({ generated, audio: result.audio.toString() });
      }));
    }
    if (new URL(request.url).pathname === '/__load-raw') {
      // テスト用：この DO の中身を渡された書き出しで丸ごと置き換える（旧形式の DO を作るため）。
      const dump = await request.json();
      return this.ctx.blockConcurrencyWhile(async () => {
        this.ctx.storage.transactionSync(() => {
          this.db.exec('PRAGMA defer_foreign_keys = ON');
          for (const { type, name } of this.db.prepare("SELECT type, name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY rowid DESC").all()) this.db.exec(`DROP ${type.toUpperCase()} IF EXISTS "${name}"`);
          restoreIntoEmpty(this.db, dump);
        });
        return new Response('loaded');
      });
    }
    if (new URL(request.url).pathname === '/__make-legacy') {
      // 旧形式のデータだけが残った Durable Object を作る（次の起動で移行待ちになる）。
      return this.ctx.blockConcurrencyWhile(async () => {
        this.db.exec('DROP TABLE knowledge_points; CREATE TABLE IF NOT EXISTS owned_review_items (user_id INTEGER, id TEXT)');
        return new Response('legacy');
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
