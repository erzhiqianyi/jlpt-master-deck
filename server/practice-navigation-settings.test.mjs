import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = mkdtempSync(join(tmpdir(), 'jlpt-navigation-'));
process.env.JLPT_DB_PATH = join(directory, 'db.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(directory, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const storage = await import('./storage.mjs');
const user = storage.createUser('navigation-settings', 'password');
after(() => { storage.getDb().close(); rmSync(directory, { recursive: true, force: true }); });
test('navigation preferences persist independently of feedback and other settings', () => {
 const initial = storage.getStudyState(user.id).settings;
 assert.equal(initial.practiceNavigation, 'auto');
 assert.equal(initial.practiceAutoAdvanceSeconds, 0.5);
 storage.saveSettings(user.id, { practiceNavigation: 'manual', practiceAutoAdvanceSeconds: 2.3 });
 storage.saveSettings(user.id, { locale: 'ja' });
 const saved = storage.getStudyState(user.id).settings;
 assert.equal(saved.practiceNavigation, 'manual');
 assert.equal(saved.practiceAutoAdvanceSeconds, 2.3);
 assert.equal(saved.feedbackMode, initial.feedbackMode);
 storage.saveSettings(user.id, { practiceNavigation: 'auto', practiceAutoAdvanceSeconds: 0 });
 assert.equal(storage.getStudyState(user.id).settings.practiceAutoAdvanceSeconds, 0);
});
test('invalid delay values are normalized to a bounded tenth of a second', () => {
 for (const [input, expected] of [[-1,0],[100,10],[0.36,0.4],['bad',0.5],[null,0.5]]) {
  const saved = storage.saveSettings(user.id, { practiceAutoAdvanceSeconds: input });
  assert.equal(saved.practiceAutoAdvanceSeconds, expected);
 }
});
