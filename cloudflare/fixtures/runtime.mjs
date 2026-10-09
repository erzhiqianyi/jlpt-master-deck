import { cachedSpeech } from '../../server/tts/cache.mjs';
import { withPlatform } from '../../server/platform.mjs';
// Local integration-test entry only. Production always bundles api-worker.mjs.
import { JlptDatabase } from '../api-worker.mjs';
const fetchProduction = JlptDatabase.prototype.fetch;
JlptDatabase.prototype.fetch = async function(request) {
    if (new URL(request.url).pathname === '/__capture-seed') {
      return this.ctx.blockConcurrencyWhile(() => {
        const insert = this.db.prepare(`INSERT INTO learning_captures (id,user_id,body,category,context,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`);
        for (let index = 0; index < 12; index++) insert.run(`capture-${String(index).padStart(2, '0')}`, 1, `capture ${index}`, 'word', 'source context', 'inbox', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');
        for (const [id, owner, category, status] of [
          ['grammar', 1, 'grammar', 'inbox'], ['processed', 1, 'word', 'processed'],
          ['archived', 1, 'word', 'archived'], ['other', 2, 'word', 'inbox'],
        ]) insert.run(id, owner, id, category, '', status, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z');
        return Response.json({ ids: Array.from({ length: 12 }, (_, index) => `capture-${String(index).padStart(2, '0')}`).reverse() });
      });
    }
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
        this.db.exec('DROP TABLE listening_audio_assets; DELETE FROM cloud_schema_version WHERE version=3;');
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
