// Local integration-test entry only. Production always bundles api-worker.mjs.
import { JlptDatabase } from '../api-worker.mjs';
const fetchProduction = JlptDatabase.prototype.fetch;
JlptDatabase.prototype.fetch = async function(request) {
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
