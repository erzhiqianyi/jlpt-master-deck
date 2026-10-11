import { cachedSpeech } from '../../server/tts/cache.mjs';
import { withPlatform } from '../../server/platform.mjs';
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
    if (new URL(request.url).pathname === '/__legacy-database') {
      // 旧形式のデータだけが入った Durable Object（移行前の本番）を作る
      return this.ctx.blockConcurrencyWhile(async () => {
        this.ctx.storage.transactionSync(() => {
          this.db.exec('PRAGMA defer_foreign_keys = ON');
          for (const { name } of this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY rowid DESC").all()) this.db.exec(`DROP TABLE IF EXISTS "${name}"`);
          this.db.exec('CREATE TABLE cloud_schema_version (version INTEGER PRIMARY KEY); INSERT INTO cloud_schema_version VALUES (1);');
        });
        return new Response('legacy');
      });
    }
    if (new URL(request.url).pathname === '/__legacy-seed') {
      // 移行前の本番と同じ形の旧データ（export モードの DO に入れる）
      return this.ctx.blockConcurrencyWhile(async () => {
        this.ctx.storage.transactionSync(() => {
          this.db.exec(`
            CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL);
            CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL);
            CREATE TABLE cloud_schema_version (version INTEGER PRIMARY KEY);
            CREATE TABLE user_settings (user_id INTEGER, settings_json TEXT, updated_at TEXT);
            CREATE TABLE owned_review_items (user_id INTEGER, id TEXT, item_json TEXT, source TEXT, created_at TEXT, updated_at TEXT);
            CREATE TABLE learning_captures (id TEXT PRIMARY KEY, user_id INTEGER, body TEXT, category TEXT, context TEXT, status TEXT, created_at TEXT, updated_at TEXT);
            INSERT INTO cloud_schema_version VALUES (1);
          `);
          this.db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run(1, 'legacy-learner', '', '', '2026-09-01T00:00:00Z');
          this.db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run('legacy-session-token', 1, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z');
          this.db.prepare('INSERT INTO user_settings VALUES (?, ?, ?)').run(1, JSON.stringify({ locale: 'ja', fontSize: 'large' }), '2026-09-02T00:00:00Z');
          for (const [id, original, reading, meaning] of [['w-1', '遅刻', 'ちこく', '迟到'], ['w-2', '概観', 'がいかん', '概观']]) {
            this.db.prepare('INSERT INTO owned_review_items VALUES (1, ?, ?, ?, ?, ?)').run(id, JSON.stringify({ id, deck: 'n1_vocab', type: 'vocabulary', original, reading, part_of_speech: '名詞', meaning_zh: meaning }), 'mcp', '2026-09-03T00:00:00Z', '2026-09-03T00:00:00Z');
          }
          this.db.prepare('INSERT INTO learning_captures VALUES (?, 1, ?, ?, ?, ?, ?, ?)').run('cap-1', '裁量', 'word', '新聞', 'inbox', '2026-09-04T00:00:00Z', '2026-09-04T00:00:00Z');
        });
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
