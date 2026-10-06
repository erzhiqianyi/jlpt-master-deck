import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = mkdtempSync(join(tmpdir(), 'jlpt-font-scale-'));
process.env.JLPT_DB_PATH = join(directory, 'db.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(directory, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const storage = await import('./storage.mjs');
const user = storage.createUser('font-scale-settings', 'password');
after(() => { storage.getDb().close(); rmSync(directory, { recursive: true, force: true }); });
test('font multiplier survives saving and subsequent unrelated settings updates', () => {
 storage.saveSettings(user.id, { fontScale: 1.7 });
 storage.saveSettings(user.id, { locale: 'ja' });
 assert.equal(storage.getStudyState(user.id).settings.fontScale, 1.7);
});
test('multiplier is bounded to 0.8 through 2 and old font sizes remain readable', () => {
 for (const [input, expected] of [[0.1, 0.8], [3, 2], [1.26, 1.3]]) {
  assert.equal(storage.saveSettings(user.id, { fontScale: input }).fontScale, expected);
 }
 const legacy = storage.saveSettings(user.id, { fontScale: null, fontSize: 'large' });
 assert.equal(legacy.fontSize, 'large');
 assert.equal(legacy.fontScale, undefined);
});
