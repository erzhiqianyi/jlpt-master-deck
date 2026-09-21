// Acceptance tests for the controlled query layer, adapted from the A01–A30 matrix in the
// jlpt-mcp-query-v1 handoff (docs/mcp-query/schema-map.md lists which items apply here).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'jlpt-mcp-query-'));
process.env.JLPT_DB_PATH = join(dir, 'test.sqlite');
process.env.JLPT_REVIEW_DATA_PATH = join(dir, 'data');
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);

const { createUser, getDb } = await import('./storage.mjs');
const { createQueryTools, limits, _resetCursors, resultBytes } = await import('./mcp-query.mjs');
const { readRevision } = await import('./mcp-query-schema.mjs');

const db = getDb();
const alice = createUser('alice', 'password-1');
const bob = createUser('bob', 'password-2');
const tools = Object.fromEntries(createQueryTools({ getDb }).map((t) => [t.name, t]));
const as = (user) => ({ ownerId: String(user.id) });
const call = async (name, args, user = alice) => {
  const result = await tools[name].handler(args, as(user));
  return { ...result.structuredContent, isError: Boolean(result.isError), bytes: Buffer.byteLength(JSON.stringify(result)) };
};

// --- synthetic data -------------------------------------------------------------------------
const practiceQuestions = [
  { id: 'daily-A-q01', itemId: 'item-sae', kind: 'grammar', instruction: '（　）に入れるのに最もよいものを選びなさい。', prompt: '雨（　）降れば、試合は中止だ。', choices: ['さえ', 'こそ', 'まで', 'だけ'], answer: 'さえ', answerIndex: 0, correctReason: '「さえ〜ば」で最低条件を表す。' },
  { id: 'daily-A-q02', itemId: 'item-mono', kind: 'meaning', instruction: '意味として最も近いものを選びなさい。', prompt: 'ものの', choices: ['〜けれども', '〜ので', '〜なら', '〜たび'], answer: '〜けれども', answerIndex: 0, correctReason: '逆接。' },
  { id: 'daily-A-q03', itemId: 'item-mono', kind: 'kanji_to_kana', instruction: '読み方を選びなさい。', prompt: '固く', choices: ['かたく', 'かだく'], answer: 'かたく', answerIndex: 0, correctReason: '固い（かたい）。' },
  { id: 'daily-A-q04', itemId: 'item-sae', kind: 'grammar', instruction: 'x', prompt: 'long', choices: ['a', 'b'], answer: 'a', answerIndex: 0, correctReason: '日本語😀'.repeat(3000) },
];
const bobQuestions = [
  { id: 'daily-B-q01', itemId: 'item-sae', kind: 'grammar', instruction: 'x', prompt: 'bob prompt', choices: ['a', 'b'], answer: 'a', answerIndex: 0, correctReason: 'bob' },
];
const items = {
  'item-sae': { deck: 'grammar_expression', type: 'expression', jlpt_level: 'N1', original: 'さえ〜ば', grammar_point: 'さえ〜ば', meaning_zh: '只要……就……', formation: 'N／Vて＋さえいれば', usage_notes: '表示最低条件。', core_memory: '抓最低条件。', examples: [{ ja: '君さえいれば、ほかには何もいらない。', zh: '只要有你，别的什么都不需要。' }] },
  'item-mono': { deck: 'grammar_expression', type: 'expression', jlpt_level: 'N2-N1', original: 'ものの', grammar_point: 'ものの', meaning_zh: '虽然……但是……', wordbook_ids: ['wordbook-legacy', 'grammar_expression'] },
  'item-word': { deck: 'n1_vocab', type: 'word', jlpt_level: 'N2', original: '測定', reading: 'そくてい', meaning_zh: '测定', wordbook_id: 'wordbook-custom', tags: ['理系', 'N2'] },
};

function seed() {
  db.exec('DELETE FROM answers; DELETE FROM daily_practices; DELETE FROM review_items;');
  const now = '2026-09-01T00:00:00.000Z';
  const insertPractice = db.prepare('INSERT INTO daily_practices (id, user_id, practice_date, version, title, minutes, practice_json, created_at, updated_at) VALUES (?, ?, ?, 1, ?, 30, ?, ?, ?)');
  insertPractice.run('daily-A', alice.id, '2026-09-01', 'A', JSON.stringify({ id: 'daily-A', strategy: 'targeted_by_history', questions: practiceQuestions }), now, now);
  insertPractice.run('daily-B', bob.id, '2026-09-01', 'B', JSON.stringify({ id: 'daily-B', questions: bobQuestions }), now, now);
  const insertItem = db.prepare("INSERT INTO review_items (id, item_json, source, created_at, updated_at) VALUES (?, ?, 'database', ?, ?)");
  for (const [id, item] of Object.entries(items)) insertItem.run(id, JSON.stringify({ id, ...item }), now, now);
  const insertAnswer = db.prepare('INSERT INTO answers (user_id, question_id, item_id, selected, correct, answered_at) VALUES (?, ?, ?, ?, ?, ?)');
  // A06-style set: 2 correct, 2 incorrect for alice, at controlled instants (UTC).
  insertAnswer.run(alice.id, 'daily-A-q01', 'item-sae', 'さえ', 1, '2026-09-01T14:00:00.000Z'); // Tokyo 23:00 Tue Sep 1
  insertAnswer.run(alice.id, 'daily-A-q02', 'item-mono', '〜ので', 0, '2026-09-01T15:00:00.000Z'); // Tokyo 00:00 Wed Sep 2
  insertAnswer.run(alice.id, 'daily-A-q03', 'item-mono', 'かだく', 0, '2026-09-06T15:00:00.000Z'); // Tokyo 00:00 Mon Sep 7
  insertAnswer.run(alice.id, 'daily-A-q04', 'item-sae', 'a', 1, '2026-09-06T15:00:00.000Z'); // same instant as q03
  insertAnswer.run(bob.id, 'daily-B-q01', 'item-sae', 'a', 0, '2026-09-03T00:00:00.000Z');
}

beforeEach(() => { seed(); _resetCursors(); });

const all = { mode: 'all' };

// A02: field/operator typos are errors, never silently ignored.
test('A02 unknown filter field and unsupported operator are rejected before any SQL', async () => {
  const typo = await call('jlpt_query', { entity: 'attempt', filters: [{ field: 'knowlege_id', op: 'eq', value: 'x' }] });
  assert.equal(typo.error.code, 'UNKNOWN_FIELD');
  const op = await call('jlpt_query', { entity: 'attempt', filters: [{ field: 'outcome', op: 'contains', value: 'c' }] });
  assert.equal(op.error.code, 'UNSUPPORTED_OPERATOR');
  const enumValue = await call('jlpt_query', { entity: 'attempt', filters: [{ field: 'outcome', op: 'eq', value: 'partial' }] });
  assert.equal(enumValue.error.code, 'INVALID_VALUE');
  const metric = await call('jlpt_aggregate', { entity: 'attempt', metrics: ['mastery'] });
  assert.equal(metric.error.code, 'UNSUPPORTED_METRIC');
});

// A03: values are bound parameters; %, _ and quotes are literal.
test('A03 filter values cannot inject SQL and contains is literal', async () => {
  const inject = await call('jlpt_query', { entity: 'item', filters: [{ field: 'original', op: 'contains', value: "' OR 1=1 --" }] });
  assert.equal(inject.data.records.length, 0);
  const percent = await call('jlpt_query', { entity: 'item', filters: [{ field: 'original', op: 'contains', value: '%' }] });
  assert.equal(percent.data.records.length, 0);
  const literal = await call('jlpt_query', { entity: 'item', filters: [{ field: 'original', op: 'contains', value: 'さえ' }] });
  assert.deepEqual(literal.data.records.map((r) => r.id), ['item-sae']);
});

// A04: another learner's records, counts, details and cursors are invisible.
test('A04 cross-user isolation for query, aggregate, get and cursors', async () => {
  const bobRows = await call('jlpt_query', { entity: 'attempt', time: all, include_total: 'exact' }, bob);
  assert.equal(bobRows.meta.coverage.matched_records, 1);
  assert.equal(bobRows.data.records[0].id, 'daily-B-q01');
  const bobAgg = await call('jlpt_aggregate', { entity: 'attempt', time: all }, bob);
  assert.equal(bobAgg.data.groups[0].attempt_count, 1);
  const detail = await call('jlpt_get', { entity: 'question', id: 'daily-A-q01' }, bob);
  assert.equal(detail.error.code, 'NOT_FOUND');
  const page = await call('jlpt_query', { entity: 'attempt', time: all, limit: 1 });
  const stolen = await call('jlpt_query', { cursor: page.meta.page.next_cursor }, bob);
  assert.equal(stolen.error.code, 'CURSOR_INVALID');
});

// A06/A07/A08: denominators and null accuracy.
test('A06 A07 A08 accuracy uses graded denominators, is null on empty sets, and reports unique questions', async () => {
  const totals = await call('jlpt_aggregate', { entity: 'attempt', time: all, metrics: ['accuracy'] });
  const g = totals.data.groups[0];
  assert.deepEqual([g.attempt_count, g.graded_count, g.correct_count, g.incorrect_count, g.ungraded_count, g.unique_question_count, g.accuracy], [4, 4, 2, 2, 0, 4, 0.5]);
  assert.deepEqual(totals.meta.effective_query.effective_metrics.sort(), ['accuracy', 'attempt_count', 'correct_count', 'graded_count', 'incorrect_count', 'ungraded_count', 'unique_question_count']);
  const empty = await call('jlpt_aggregate', { entity: 'attempt', time: { mode: 'range', from: '2020-01-01T00:00:00Z', to: '2020-01-02T00:00:00Z' }, metrics: ['accuracy'] });
  assert.equal(empty.data.groups[0].attempt_count, 0);
  assert.equal(empty.data.groups[0].accuracy, null);
  assert.equal(empty.meta.coverage.matched_records, 0);
  const grouped = await call('jlpt_aggregate', { entity: 'attempt', time: { mode: 'range', from: '2020-01-01T00:00:00Z', to: '2020-01-02T00:00:00Z' }, group_by: ['kind'] });
  assert.deepEqual(grouped.data.groups, []);
});

// A09: half-open [from, to).
test('A09 range end is exclusive', async () => {
  const r = await call('jlpt_query', { entity: 'attempt', time: { mode: 'range', from: '2026-09-01T14:00:00Z', to: '2026-09-01T15:00:00Z' } });
  assert.deepEqual(r.data.records.map((x) => x.id), ['daily-A-q01']);
  assert.equal(r.meta.effective_query.time.from, '2026-09-01T14:00:00.000Z');
  const bad = await call('jlpt_query', { entity: 'attempt', time: { mode: 'range', from: '2026-09-01', to: '2026-09-02' } });
  assert.equal(bad.error.code, 'INVALID_VALUE');
});

// A10: Tokyo day / Monday-week buckets differ from UTC.
test('A10 day and week buckets follow the requested timezone', async () => {
  const utc = await call('jlpt_aggregate', { entity: 'attempt', time: all, group_by: ['day'] });
  assert.deepEqual(utc.data.groups.map((x) => [x.day, x.attempt_count]), [['2026-09-01', 2], ['2026-09-06', 2]]);
  const tokyo = await call('jlpt_aggregate', { entity: 'attempt', time: all, group_by: ['day'], timezone: 'Asia/Tokyo' });
  assert.deepEqual(tokyo.data.groups.map((x) => [x.day, x.attempt_count]), [['2026-09-01', 1], ['2026-09-02', 1], ['2026-09-07', 2]]);
  const week = await call('jlpt_aggregate', { entity: 'attempt', time: all, group_by: ['week'], timezone: 'Asia/Tokyo' });
  assert.deepEqual(week.data.groups.map((x) => [x.week, x.attempt_count]), [['2026-08-31', 2], ['2026-09-07', 2]]);
  assert.equal(week.meta.effective_query.effective_timezone, 'Asia/Tokyo');
  const month = await call('jlpt_aggregate', { entity: 'attempt', time: all, group_by: ['month', 'outcome'] });
  assert.equal(month.data.groups.length, 2);
  const twoTime = await call('jlpt_aggregate', { entity: 'attempt', time: all, group_by: ['day', 'week'] });
  assert.equal(twoTime.error.code, 'UNSUPPORTED_GROUP');
});

// A11: default time is echoed; explicit all is not narrowed.
test('A11 default last_days is echoed as a resolved range and all stays all', async () => {
  const defaulted = await call('jlpt_query', { entity: 'attempt' });
  assert.equal(defaulted.meta.effective_query.time.mode, 'range');
  assert.deepEqual(defaulted.meta.effective_query.time.requested, { mode: 'last_days', days: 30 });
  const everything = await call('jlpt_query', { entity: 'attempt', time: all, include_total: 'exact' });
  assert.deepEqual(everything.meta.effective_query.time, { mode: 'all' });
  assert.equal(everything.meta.coverage.matched_records, 4);
  const noTime = await call('jlpt_query', { entity: 'item', time: { mode: 'last_days', days: 3 } });
  assert.equal(noTime.error.code, 'INVALID_QUERY');
});

// A12/A13: aggregate covers the full set regardless of page size; HAVING filters groups only.
test('A12 A13 aggregate limit=1 and having do not change matched_records', async () => {
  const one = await call('jlpt_aggregate', { entity: 'attempt', time: all, group_by: ['kind'], limit: 1 });
  assert.equal(one.meta.coverage.matched_records, 4);
  assert.equal(one.data.groups.length, 1);
  assert.equal(one.meta.page.has_more, true);
  assert.equal(one.meta.coverage.groups_before_having, 3);
  const next = await call('jlpt_aggregate', { cursor: one.meta.page.next_cursor, limit: 5 });
  assert.equal(next.data.groups.length, 2);
  assert.equal(next.meta.page.has_more, false);
  const having = await call('jlpt_aggregate', { entity: 'attempt', time: all, group_by: ['kind'], having: [{ metric: 'attempt_count', op: 'gte', value: 2 }] });
  assert.deepEqual(having.data.groups.map((g) => g.kind), ['grammar']);
  assert.equal(having.meta.coverage.matched_records, 4);
  assert.equal(having.meta.coverage.groups_before_having, 3);
  assert.equal(having.meta.coverage.groups_after_having, 1);
  assert.ok(having.meta.effective_query.effective_metrics.includes('attempt_count'));
  const ordered = await call('jlpt_aggregate', { entity: 'attempt', time: all, metrics: ['accuracy'], group_by: ['kind'], order_by: [{ field: 'accuracy', direction: 'asc' }] });
  assert.deepEqual(ordered.data.groups.map((g) => [g.kind, g.accuracy]), [['kanji_to_kana', 0], ['meaning', 0], ['grammar', 1]]);
});

// A14: no invented totals.
test('A14 include_total=none reports null and not_requested', async () => {
  const r = await call('jlpt_query', { entity: 'attempt', time: all });
  assert.equal(r.meta.coverage.matched_records, null);
  assert.equal(r.meta.coverage.count_status, 'not_requested');
});

// A16: equal timestamps paginate without gaps or repeats.
test('A16 keyset pagination with equal timestamps visits every row once', async () => {
  const seen = [];
  let page = await call('jlpt_query', { entity: 'attempt', time: all, limit: 1, fields: ['question_id'] });
  seen.push(...page.data.records.map((r) => r.id));
  while (page.meta.page.has_more) {
    page = await call('jlpt_query', { cursor: page.meta.page.next_cursor });
    seen.push(...page.data.records.map((r) => r.id));
  }
  assert.deepEqual(seen.sort(), ['daily-A-q01', 'daily-A-q02', 'daily-A-q03', 'daily-A-q04']);
  assert.equal(new Set(seen).size, 4);
});

// A17/A25: the byte budget cuts the page and the cursor continues from the last emitted row.
test('A17 A25 byte-limited page continues from the last emitted row and never exceeds max_bytes', async () => {
  db.exec('DELETE FROM answers');
  const insert = db.prepare('INSERT INTO answers (user_id, question_id, item_id, selected, correct, answered_at) VALUES (?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < 40; i += 1) insert.run(alice.id, `q-${String(i).padStart(2, '0')}`, 'item', 'x'.repeat(300), 1, `2026-09-01T00:00:${String(i).padStart(2, '0')}.000Z`);
  const first = await call('jlpt_query', { entity: 'attempt', time: all, fields: ['selected'], sort: { field: 'answered_at', direction: 'asc' }, limit: 40, max_bytes: 4096 });
  assert.ok(first.bytes <= 4096, `bytes ${first.bytes}`);
  assert.equal(first.meta.page.cut_reason, 'byte_limit');
  assert.ok(first.data.records.length > 0 && first.data.records.length < 40);
  const second = await call('jlpt_query', { cursor: first.meta.page.next_cursor, max_bytes: 4096 });
  assert.equal(second.data.records[0].id, `q-${String(first.data.records.length).padStart(2, '0')}`);
  assert.ok(second.bytes <= 4096);
});

// A18: a row that cannot fit is an explicit error, not an empty page loop.
test('A18 oversized single row returns RESPONSE_TOO_LARGE', async () => {
  const r = await call('jlpt_query', { entity: 'question', filters: [{ field: 'id', op: 'eq', value: 'daily-A-q04' }], fields: ['prompt_preview'], max_bytes: 4096 });
  assert.equal(r.data.records.length, 1); // preview is bounded, so this fits...
  db.prepare('UPDATE answers SET selected = ? WHERE question_id = ?').run('あ'.repeat(3000), 'daily-A-q01');
  const big = await call('jlpt_query', { entity: 'attempt', time: all, fields: ['selected'], filters: [{ field: 'id', op: 'eq', value: 'daily-A-q01' }], max_bytes: 4096 });
  assert.equal(big.error.code, 'RESPONSE_TOO_LARGE');
});

// A19: continuation must not change the query.
test('A19 cursor continuation with new filters or entity is rejected', async () => {
  const page = await call('jlpt_query', { entity: 'attempt', time: all, limit: 1 });
  const mixed = await call('jlpt_query', { cursor: page.meta.page.next_cursor, filters: [{ field: 'outcome', op: 'eq', value: 'correct' }] });
  assert.equal(mixed.error.code, 'INVALID_QUERY');
  const entity = await call('jlpt_query', { cursor: page.meta.page.next_cursor, entity: 'item' });
  assert.equal(entity.error.code, 'INVALID_QUERY');
});

// A20: a write between pages invalidates the cursor.
test('A20 writes between pages return DATA_CHANGED via the revision triggers', async () => {
  const before = readRevision(db);
  const page = await call('jlpt_query', { entity: 'attempt', time: all, limit: 1 });
  db.prepare('UPDATE answers SET correct = 1 WHERE question_id = ?').run('daily-A-q02');
  assert.ok(readRevision(db) > before);
  const next = await call('jlpt_query', { cursor: page.meta.page.next_cursor });
  assert.equal(next.error.code, 'DATA_CHANGED');
  const agg = await call('jlpt_aggregate', { entity: 'attempt', time: all, group_by: ['kind'], limit: 1 });
  db.prepare("UPDATE review_items SET item_json = json_set(item_json, '$.jlpt_level', 'N3') WHERE id = 'item-word'").run();
  const aggNext = await call('jlpt_aggregate', { cursor: agg.meta.page.next_cursor });
  assert.equal(aggNext.error.code, 'DATA_CHANGED');
});

// A21: forged / reused cursors.
test('A21 forged and reused cursors fail without leaking state', async () => {
  const forged = await call('jlpt_query', { cursor: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' });
  assert.equal(forged.error.code, 'CURSOR_INVALID');
  const page = await call('jlpt_query', { entity: 'attempt', time: all, limit: 1 });
  await call('jlpt_query', { cursor: page.meta.page.next_cursor });
  const reused = await call('jlpt_query', { cursor: page.meta.page.next_cursor });
  assert.equal(reused.error.code, 'CURSOR_INVALID');
  const wrongTool = await call('jlpt_aggregate', { cursor: (await call('jlpt_query', { entity: 'attempt', time: all, limit: 1 })).meta.page.next_cursor });
  assert.equal(wrongTool.error.code, 'CURSOR_INVALID');
});

// A22: group explosion is an error, not a truncated ranking.
test('A22 too many groups returns QUERY_TOO_BROAD', async () => {
  const saved = limits.max_groups_materialized;
  limits.max_groups_materialized = 2;
  try {
    const r = await call('jlpt_aggregate', { entity: 'attempt', time: all, group_by: ['kind'] });
    assert.equal(r.error.code, 'QUERY_TOO_BROAD');
  } finally { limits.max_groups_materialized = saved; }
});

// A23: the deadline really aborts the statement (per-row scalar function) and the connection stays usable.
test('A23 SQL deadline aborts the statement and releases the read transaction', async () => {
  const saved = limits.sql_timeout_ms;
  limits.sql_timeout_ms = -10_000;
  try {
    const r = await call('jlpt_query', { entity: 'attempt', time: all });
    assert.equal(r.error.code, 'QUERY_TIMEOUT');
  } finally { limits.sql_timeout_ms = saved; }
  const ok = await call('jlpt_query', { entity: 'attempt', time: all });
  assert.equal(ok.ok, true);
  db.exec('BEGIN; COMMIT;'); // would throw if a transaction were still open
});

// A24: long Japanese/emoji text is chunked by code points and reassembles losslessly.
test('A24 jlpt_get chunks long explanations by code point and reassembles', async () => {
  const original = practiceQuestions[3].correctReason;
  let r = await call('jlpt_get', { entity: 'question', id: 'daily-A-q04', sections: ['prompt', 'explanation'], max_bytes: 4096 });
  const chunks = [];
  let pages = 0;
  for (;;) {
    pages += 1;
    assert.ok(r.bytes <= 4096, `bytes ${r.bytes}`);
    for (const part of r.data.parts) {
      if (part.section === 'explanation') {
        assert.equal(part.offset_chars, chunks.join('').length ? Array.from(chunks.join('')).length : 0);
        chunks.push(part.text);
      }
    }
    if (r.data.content_complete) break;
    r = await call('jlpt_get', { cursor: r.data.next_cursor, max_bytes: 4096 });
  }
  assert.ok(pages > 3);
  assert.equal(chunks.join(''), `correct_reason: ${original}`);
  assert.equal(r.data.parts.at(-1).section_complete, true);
});

// A26: every error is a well-formed payload with no SQL or paths.
test('A26 error payloads carry code, retryable, details and no internals', async () => {
  const r = await call('jlpt_query', { entity: 'attempt', limit: 1000 });
  assert.equal(r.isError, true);
  assert.equal(r.error.code, 'LIMIT_EXCEEDED');
  assert.equal(r.meta, undefined);
  assert.equal(typeof r.error.retryable, 'boolean');
  assert.ok(!JSON.stringify(r).includes('SELECT'));
  assert.ok(!JSON.stringify(r).includes('.sqlite'));
  const bytes = await call('jlpt_query', { entity: 'attempt', max_bytes: 1_000_000 });
  assert.equal(bytes.error.code, 'LIMIT_EXCEEDED');
});

// A27: answer_key / explanation follow the practice-mode rule.
test('A27 answer key is readable only after the learner answered the question', async () => {
  const answeredByBob = await call('jlpt_get', { entity: 'question', id: 'daily-B-q01', sections: ['answer_key'] }, bob);
  assert.equal(answeredByBob.data.parts[0].text, 'a');
  const prompt = await call('jlpt_get', { entity: 'question', id: 'daily-B-q01', sections: ['prompt', 'options'] }, bob);
  assert.equal(prompt.ok, true);
  db.prepare('DELETE FROM answers WHERE user_id = ? AND question_id = ?').run(bob.id, 'daily-B-q01');
  const nowGated = await call('jlpt_get', { entity: 'question', id: 'daily-B-q01', sections: ['answer_key'] }, bob);
  assert.equal(nowGated.error.code, 'FORBIDDEN');
  const answered = await call('jlpt_get', { entity: 'question', id: 'daily-A-q01', sections: ['answer_key'] });
  assert.equal(answered.data.parts[0].text, 'さえ');
  // The list never exposes answers: no such field exists.
  const list = await call('jlpt_query', { entity: 'question', fields: ['answer'] });
  assert.equal(list.error.code, 'UNKNOWN_FIELD');
});

// A28: entities without a data model say so.
test('A28 knowledge is reported unavailable, not empty', async () => {
  const d = await call('jlpt_describe', {});
  assert.equal(d.data.entities.knowledge.available, false);
  const q = await call('jlpt_query', { entity: 'knowledge' });
  assert.equal(q.error.code, 'DATASET_UNAVAILABLE');
  assert.equal(q.error.retryable, false);
});

test('describe lists fields, operators, metrics and limits from the same registry the executor uses', async () => {
  const d = await call('jlpt_describe', { entity: 'attempt' });
  assert.equal(d.data.classification_basis, 'current_question_metadata');
  assert.deepEqual(d.data.fields.outcome.values, ['correct', 'incorrect']);
  assert.ok(d.data.group_dimensions.includes('week'));
  assert.deepEqual(d.data.metrics.accuracy.companions.length, 6);
  const all = await call('jlpt_describe', {});
  assert.equal(all.data.limits.max_limit, limits.max_limit);
});

test('items expose wordbook_id (explicit, legacy wordbook_ids[0], or deck) and parsed tags', async () => {
  const r = await call('jlpt_query', { entity: 'item', fields: ['id', 'wordbook_id', 'tags'], sort: { field: 'id', direction: 'asc' } });
  const byId = Object.fromEntries(r.data.records.map((row) => [row.id, row]));
  assert.equal(byId['item-sae'].wordbook_id, 'grammar_expression');
  assert.equal(byId['item-mono'].wordbook_id, 'wordbook-legacy');
  assert.equal(byId['item-word'].wordbook_id, 'wordbook-custom');
  assert.deepEqual(byId['item-sae'].tags, []);
  assert.deepEqual(byId['item-word'].tags, ['理系', 'N2']);
  const tagged = await call('jlpt_query', { entity: 'item', fields: ['id'], filters: [{ field: 'tags', op: 'contains', value: '理系' }] });
  assert.deepEqual(tagged.data.records.map((row) => row.id), ['item-word']);
  const grouped = await call('jlpt_aggregate', { entity: 'attempt', time: all, group_by: ['wordbook_id'] });
  assert.deepEqual(grouped.data.groups.map((g) => [g.wordbook_id, g.attempt_count]).sort(), [['grammar_expression', 2], ['wordbook-legacy', 2]]);
  const got = await call('jlpt_get', { entity: 'item', id: 'item-word', sections: ['metadata'] });
  assert.equal(got.data.metadata.wordbook_id, 'wordbook-custom');
  assert.deepEqual(got.data.metadata.tags, ['理系', 'N2']);
});

test('item card exposes grammar formation, usage notes, and core memory', async () => {
  const got = await call('jlpt_get', { entity: 'item', id: 'item-sae', sections: ['card'] });
  assert.match(got.data.parts.find((part) => part.section === 'card').text, /formation: N／Vて＋さえいれば/);
  assert.match(got.data.parts.find((part) => part.section === 'card').text, /usage_notes: 表示最低条件。/);
  assert.match(got.data.parts.find((part) => part.section === 'card').text, /core_memory: 抓最低条件。/);
});

test('previews are cut on character boundaries and flagged', async () => {
  db.prepare("UPDATE review_items SET item_json = json_set(item_json, '$.meaning_zh', ?) WHERE id = 'item-word'").run('漢'.repeat(400));
  const r = await call('jlpt_query', { entity: 'item', fields: ['meaning_preview'], filters: [{ field: 'id', op: 'eq', value: 'item-word' }] });
  const row = r.data.records[0];
  assert.equal(row.meaning_zh_truncated, true);
  assert.ok(Buffer.byteLength(row.meaning_preview) <= limits.preview_bytes);
  assert.equal(row.meaning_preview.length % 1, 0);
  assert.ok(!row.meaning_preview.includes('�'));
});

test('stored timestamps all use the ISO-8601 UTC form the range comparison relies on', () => {
  const pattern = '____-__-__T__:__:__.___Z';
  for (const [table, col] of [['answers', 'answered_at'], ['daily_practices', 'created_at'], ['review_items', 'created_at']]) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${col} NOT LIKE ?`).get(pattern).c, 0, table);
  }
});

test('resultBytes measures both the text copy and structuredContent', () => {
  const payload = { ok: true, data: { x: 'あ'.repeat(100) } };
  assert.ok(resultBytes(payload) > 2 * Buffer.byteLength(JSON.stringify(payload)));
});
