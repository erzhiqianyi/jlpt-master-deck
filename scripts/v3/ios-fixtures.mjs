// iOS の単体テスト用データを作る：サーバーの同期 API の実際の出力（Swift のモデルで読めるか確かめる）と、
// 復習間隔の計算結果（src/domain/reviewSchedule.mjs と Swift の移植が同じになるか確かめる）。
// 用法：node scripts/v3/ios-fixtures.mjs   → apple/Tests/GeneratedFixtures.swift を書き直す
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.JLPT_V3_DB_PATH = join(mkdtempSync(join(tmpdir(), 'ios-fixtures-')), 'v3.sqlite');
const { migrateLegacyToV3 } = await import('../../server/v3/migrate/index.mjs');
const { seedReferenceData } = await import('../../server/v3/reference-data.mjs');
const { ensureUser } = await import('../../server/v3/database.mjs');
const { createWordbook } = await import('../../server/v3/repo/wordbooks.mjs');
const { createKnowledge } = await import('../../server/v3/repo/knowledge.mjs');
const { createQuestionGroup } = await import('../../server/v3/repo/questions.mjs');
const { createPracticeSet } = await import('../../server/v3/repo/practice.mjs');
const { syncOverview, syncKnowledge, syncPractice, applyEvents } = await import('../../server/v3/repo/sync.mjs');
const { scheduleAfterAnswer, scheduleAfterRating } = await import('../../src/domain/reviewSchedule.mjs');

const legacy = new DatabaseSync(':memory:');
legacy.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL)');
const db = new DatabaseSync(':memory:');
migrateLegacyToV3({ legacy, target: db });
db.exec('PRAGMA foreign_keys = ON');
seedReferenceData(db);
ensureUser(db, { id: 1, username: 'learner' });
createWordbook(db, 1, { title: '词汇' });
createKnowledge(db, 1, { kind: 'word', wordbook: 'WB1', expression: '捉える', reading: 'とらえる', pos: 'verb_2', jlptLevel: 'N1', meaning: '抓住', meaningJa: 'つかむ。',
  explanation: '把握要点。', tags: ['动词'], examples: [{ sentence: '要点を捉える。', translation: '抓住要点。' }], memoryPoints: ['捉＝抓'] });
createKnowledge(db, 1, { kind: 'grammar', wordbook: 'WB1', expression: '〜ざるを得ない', meaning: '不得不', patterns: [{ pattern: 'ない形＋ざるを得ない', meaning: '不得不' }] });
createQuestionGroup(db, 1, { typeId: 'vocabulary-kanji-reading', status: 'ready', questions: [{ prompt: '要点を捉える。', marks: [{ kind: 'target', start: 3, end: 5 }],
  options: ['とらえる', 'そろえる', 'ささえる', 'たたえる'].map((text, i) => ({ text, correct: i === 0, analysis: i ? '不对' : '对' })), explanation: [{ kind: 'basis', body: '读作とらえる' }], knowledge: [{ code: 'W1' }] }] });
createPracticeSet(db, 1, { kind: 'daily', title: '今日', sections: [{ title: '読み', questions: ['QV1'] }] });
applyEvents(db, 1, [{ eventId: 'r1', type: 'MemoryRated', knowledge: 'W1', rating: 'hard', occurredAt: '2026-10-01T00:00:00Z' }]);

const overview = syncOverview(db, 1);
const knowledge = syncKnowledge(db, 1, { limit: 50 });
const practice = syncPractice(db, 1, 'DP1');

// 復習間隔：いろいろな現在の予定 × 評価・正誤
const now = new Date('2026-10-10T00:00:00Z');
const starts = [null,
  { status: 'learning', reviewCount: 1, ease: 2.5, intervalDays: 0, dueAt: '2026-10-09T00:00:00.000Z', firstSeenAt: '2026-10-01T00:00:00.000Z', lastReviewedAt: '2026-10-08T00:00:00.000Z' },
  { status: 'review', reviewCount: 2, ease: 2.35, intervalDays: 1, dueAt: '2026-10-09T12:00:00.000Z', firstSeenAt: '2026-10-01T00:00:00.000Z', lastReviewedAt: '2026-10-08T00:00:00.000Z' },
  { status: 'review', reviewCount: 3, ease: 2.6, intervalDays: 3, dueAt: '2026-10-12T00:00:00.000Z', firstSeenAt: '2026-10-01T00:00:00.000Z', lastReviewedAt: '2026-10-09T00:00:00.000Z' },
  { status: 'review', reviewCount: 5, ease: 1.35, intervalDays: 17, dueAt: '2026-10-01T00:00:00.000Z', firstSeenAt: '2026-08-01T00:00:00.000Z', lastReviewedAt: '2026-09-14T00:00:00.000Z' },
  { status: 'mastered', reviewCount: 9, ease: 3, intervalDays: 300, dueAt: '2026-10-01T00:00:00.000Z', firstSeenAt: '2025-01-01T00:00:00.000Z', lastReviewedAt: '2025-12-05T00:00:00.000Z' },
];
const cases = [];
for (const start of starts) {
  for (const rating of ['forgot', 'hard', 'remembered', 'easy']) cases.push({ start, rating, expected: scheduleAfterRating(start, rating, now) });
  for (const correct of [true, false]) cases.push({ start, correct, expected: scheduleAfterAnswer(start, correct, now) });
}

const literal = (value) => `#"""\n${JSON.stringify(value)}\n"""#`;
const swift = `// 生成ファイル：node scripts/v3/ios-fixtures.mjs（手で直さない）
enum GeneratedFixtures {
    static let now = "${now.toISOString()}"
    static let overview = ${literal(overview)}
    static let knowledge = ${literal(knowledge)}
    static let practice = ${literal(practice)}
    static let scheduleCases = ${literal(cases)}
}
`;
writeFileSync(new URL('../../apple/Tests/GeneratedFixtures.swift', import.meta.url), swift);
console.log(`apple/Tests/GeneratedFixtures.swift：${cases.length} 个间隔用例`);
