// v3 阶段 4：收集箱、录音、学习计划、每日总结、AI 草稿。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.JLPT_V3_DB_PATH = join(mkdtempSync(join(tmpdir(), 'v3-activity-')), 'v3.sqlite');
const { migrateLegacyToV3 } = await import('../server/v3/migrate/index.mjs');
const { seedReferenceData } = await import('../server/v3/reference-data.mjs');
const { ensureUser } = await import('../server/v3/database.mjs');
const { createWordbook } = await import('../server/v3/repo/wordbooks.mjs');
const { createKnowledge } = await import('../server/v3/repo/knowledge.mjs');
const { createQuestionGroup } = await import('../server/v3/repo/questions.mjs');
const { submitReview } = await import('../server/v3/repo/reviews.mjs');
const { startAttempt, submitAnswer } = await import('../server/v3/repo/practice.mjs');
const { rateCard } = await import('../server/v3/repo/cards.mjs');
const { storeMedia } = await import('../server/v3/repo/media.mjs');
const inbox = await import('../server/v3/repo/inbox.mjs');
const recordings = await import('../server/v3/repo/recordings.mjs');
const plans = await import('../server/v3/repo/plans.mjs');
const reports = await import('../server/v3/repo/reports.mjs');
const drafts = await import('../server/v3/repo/drafts.mjs');
const { updateSettings } = await import('../server/v3/repo/settings.mjs');

function freshDb() {
  const legacy = new DatabaseSync(':memory:');
  legacy.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL)');
  const db = new DatabaseSync(':memory:');
  migrateLegacyToV3({ legacy, target: db });
  db.exec('PRAGMA foreign_keys = ON');
  seedReferenceData(db);
  ensureUser(db, { id: 1, username: 'learner' });
  ensureUser(db, { id: 2, username: 'other' });
  createWordbook(db, 1, { title: '词汇' });
  createKnowledge(db, 1, { kind: 'word', wordbook: 'WB1', expression: '遅刻', reading: 'ちこく', pos: 'noun', meaning: '迟到' });
  return db;
}
const kanji = (status) => ({ typeId: 'vocabulary-kanji-reading', status, questions: [{ prompt: '会議に遅刻した。', marks: [{ kind: 'target', start: 3, end: 5 }],
  options: ['ちこく', 'ちごく', 'じこく', 'ちきょく'].map((text, i) => ({ text, correct: i === 0, analysis: i ? '不对' : '对' })), explanation: [{ kind: 'basis', body: '读作ちこく' }], knowledge: [{ code: 'W1' }] }] });

test('inbox captures are created, filed and isolated per learner', () => {
  const db = freshDb();
  const capture = inbox.createCapture(db, 1, { body: '開校', category: 'word', context: '新闻', wordbook: 'WB1' });
  assert.equal(capture.code, 'IN1');
  assert.equal(capture.wordbook, 'WB1');
  assert.equal(inbox.listCaptures(db, 1, { status: 'inbox' }).total, 1);
  assert.equal(inbox.setCaptureStatus(db, 1, 'IN1', 'processed').status, 'processed');
  assert.equal(inbox.listCaptures(db, 2).total, 0);
  assert.throws(() => inbox.createCapture(db, 1, { body: 'x', category: 'nope' }), /category/);
});

test('recordings keep the reference transcript and receive an AI analysis', () => {
  const db = freshDb();
  const audio = storeMedia(db, 1, { base64: Buffer.from('ID3-a').toString('base64'), mime: 'audio/mpeg' });
  const group = createQuestionGroup(db, 1, { typeId: 'listening-basic-shadowing', materials: [{ role: 'audio', kind: 'audio', mediaId: audio, transcript: 'おはようございます。' }], questions: [{ prompt: '聞いて繰り返してください。' }] });
  const rec = recordings.createRecording(db, 1, { question: group.questions[0].code, audioBase64: Buffer.from('webm-bytes').toString('base64'), mime: 'audio/webm;codecs=opus' });
  assert.equal(rec.status, 'pending');
  assert.equal(rec.referenceTranscript, 'おはようございます。');
  assert.equal(recordings.claimRecording(db, 1, rec.code).status, 'analyzing');
  const done = recordings.saveRecordingAnalysis(db, 1, rec.code, { transcript: 'おはよございます', summary: '整体清楚', strengths: ['语调自然'], improvements: ['长音「よう」要拉长'], nextPractice: '再跟读三遍' });
  assert.equal(done.status, 'completed');
  assert.deepEqual(done.improvements.map((x) => x.text), ['长音「よう」要拉长']);
  assert.equal(recordings.listRecordings(db, 1, { status: 'completed' }).length, 1);
  assert.deepEqual(recordings.deleteRecording(db, 1, rec.code), { deleted: rec.code });
});

test('a study plan keeps completed tasks when it is regenerated', () => {
  const db = freshDb();
  const profile = plans.savePlanProfile(db, 1, { examName: 'JLPT 2026年12月', level: 'N1', examDate: '2026-12-06', studyDaysPerWeek: 6, dailyMinutes: 60,
    materials: [{ title: '新完全マスター 語彙', module: 'vocabulary', currentPosition: '第3課' }] });
  assert.equal(profile.status, 'profile_only');
  assert.equal(profile.profile.materials[0].title.text, '新完全マスター 語彙');
  const plan = plans.saveGeneratedPlan(db, 1, { goal: '12 月合格', phases: [{ startDate: '2026-10-10', endDate: '2026-11-10', focus: '词汇', points: ['每天 30 词'] }],
    tasks: [{ date: '2026-10-10', module: 'vocabulary', minutes: 30, material: 0, title: '第3課' }, { date: '2026-10-11', module: 'grammar', minutes: 30, title: '文法 1' }] });
  assert.equal(plan.status, 'ready');
  assert.equal(plan.tasks.length, 2);
  assert.equal(plans.setTaskStatus(db, 1, plan.tasks[0].code, 'completed').status, 'completed');
  assert.equal(plans.savePlanProfile(db, 1, { dailyMinutes: 90 }).status, 'needs_refresh');
  const again = plans.saveGeneratedPlan(db, 1, { tasks: [{ date: '2026-10-12', module: 'reading', minutes: 40, title: '読解' }] });
  assert.deepEqual(again.tasks.map((t) => t.status), ['completed', 'pending'], '完成的任务保留');
  assert.ok(plans.planContext(db, 1).stats.knowledge.total >= 1);
});

test('daily reports count answers on the server and keep the AI text', () => {
  const db = freshDb();
  const group = createQuestionGroup(db, 1, kanji());
  submitReview(db, 1, group.code, { verdict: 'pass', summary: 'ok' });
  updateSettings(db, 1, { dailySource: { timeZone: 'Asia/Tokyo' } });
  const attempt = startAttempt(db, 1, { questions: [group.questions[0].code] });
  const wrong = attempt.items[0].question.options.find((o) => o.text === 'じこく');
  const answeredAt = '2026-10-09T03:00:00.000Z';
  submitAnswer(db, 1, attempt.code, { question: group.questions[0].code, selectedOptionId: wrong.id, eventId: 'e1', answeredAt });
  rateCard(db, 1, { code: 'W1', rating: 'hard', eventId: 'c1', reviewedAt: answeredAt });
  const context = reports.reportContext(db, 1, { date: '2026-10-09' });
  assert.equal(context.figures.totals.total, 1);
  assert.equal(context.figures.wrongAnswers[0].selected, 'じこく');
  assert.equal(context.figures.ratings.hard, 1);
  const report = reports.upsertReport(db, 1, { date: '2026-10-09', summary: '读音清浊需要注意。', weaknesses: [{ label: '清浊', detail: '「刻」不浊' }],
    confusions: [{ topic: '遅刻と時刻', knowledge: ['W1'], questions: [group.questions[0].code] }], recommendations: [{ type: 'card_review', title: '复习 W1' }] });
  assert.equal(report.totals.incorrect, 1);
  assert.equal(report.summary.text, '读音清浊需要注意。');
  assert.equal(report.confusions[0].knowledge[0].code, 'W1');
  assert.equal(report.wrongAnswers[0].correctAnswer, 'ちこく');
  assert.equal(reports.listReports(db, 1)[0].date, '2026-10-09');
  updateSettings(db, 1, { dailySource: { window: 'last_hours', hours: 720 } });
  const daily = reports.dailyPracticeContext(db, 1);
  assert.equal(daily.wrongAnswers.length, 1);
  assert.equal(daily.cards[0].code, 'W1');
});

test('drafts are commented, approved and published only when every group passed review', () => {
  const db = freshDb();
  const group = createQuestionGroup(db, 1, kanji('draft'));
  const draft = drafts.createDraft(db, 1, { title: '今日の弱点', description: '清浊', objectives: ['区分清浊'], sections: [{ title: '読み', questions: [group.questions[0].code] }], minutes: 10 });
  assert.equal(draft.code, 'DR1');
  assert.equal(draft.sections[0].questions[0].groupStatus, 'draft');
  assert.equal(drafts.addDraftComment(db, 1, 'DR1', '再加一题').comments[0].code, 'DC1');
  assert.throws(() => drafts.publishDraft(db, 1, 'DR1'), /没有通过审查/);
  submitReview(db, 1, group.code, { verdict: 'pass', summary: 'ok' });
  const published = drafts.publishDraft(db, 1, 'DR1', { date: '2026-10-10' });
  assert.equal(published.practice, 'DP1');
  const after = drafts.getDraft(db, 1, 'DR1');
  assert.equal(after.status, 'approved');
  assert.deepEqual(after.published, ['DP1']);
  assert.equal(drafts.listDrafts(db, 1)[0].questionCount, 1);
  assert.equal(drafts.listDrafts(db, 2).length, 0);
});
