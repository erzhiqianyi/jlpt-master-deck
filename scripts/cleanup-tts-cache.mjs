// Local Node maintenance only. Uses the configured local DB/cache directory.
import { cleanupTtsCache } from '../server/tts/cache.mjs';
import { getDb } from '../server/accounts.mjs';
try { console.log(JSON.stringify({ removed: await cleanupTtsCache() })); }
finally { getDb().close(); }
