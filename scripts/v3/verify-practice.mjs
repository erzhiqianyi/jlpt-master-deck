// 第 3 段階の核対：旧データの練習記録の成績、正答率、復習期限の件数が v3（の API）と一致するか。
// 用法：node scripts/v3/verify-practice.mjs <旧库.sqlite> <新库.sqlite> <对照表.mapping.tsv> [基準時刻 ISO]
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { seedReferenceData } from '../../server/v3/reference-data.mjs';
import { listAttempts } from '../../server/v3/repo/practice.mjs';
import { studyOverview } from '../../server/v3/repo/stats.mjs';

const [from, to, mappingPath, at = new Date().toISOString()] = process.argv.slice(2);
if (!from || !to || !mappingPath) { console.error('用法：node scripts/v3/verify-practice.mjs <旧库> <新库> <对照表> [基準時刻]'); process.exit(2); }
const legacy = new DatabaseSync(from, { readOnly: true });
const v3 = new DatabaseSync(to);
seedReferenceData(v3);
const tables = new Set(legacy.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
const T = (name) => (tables.has(`legacy_v1_${name}`) ? `legacy_v1_${name}` : name);
const mapping = new Map(readFileSync(mappingPath, 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t')).map(([kind, user, id, , code]) => [`${kind}\u0000${user}\u0000${id}`, code]));
const json = (text, fallback) => { try { return JSON.parse(text); } catch { return fallback; } };
const problems = [];
const checks = [];
const check = (label, expected, actual) => { checks.push({ label, expected, actual, ok: expected === actual }); if (expected !== actual) problems.push({ label, expected, actual }); };

// 1. 練習記録ごとの解答数・正解数
for (const row of legacy.prepare(`SELECT user_id, attempt_history_json FROM "${T('practice_state')}"`).all()) {
  const newAttempts = new Map(listAttempts(v3, row.user_id, { limit: 200 }).items.map((a) => [a.code, a]));
  for (const attempt of json(row.attempt_history_json, [])) {
    const code = mapping.get(`attempt\u0000${row.user_id}\u0000${attempt.id}`);
    const answers = (attempt.answers ?? []).filter((a) => a && a.selected != null);
    const fresh = code ? newAttempts.get(code) : null;
    if (!fresh) { problems.push({ label: `练习记录 ${attempt.id} 没有迁移`, expected: 'AT…', actual: null }); continue; }
    check(`${code} 作答数`, answers.length, fresh.summary.answered);
    check(`${code} 答对数`, answers.filter((a) => a.correct === true).length, fresh.summary.correct);
  }
}

// 2. 题目的最新作答（错题本、正确率）：旧的作答按对照表换成新题目（合并的副本归为同一题），每题取最新一次
for (const user of legacy.prepare(`SELECT DISTINCT user_id FROM "${T('answers')}"`).all().map((r) => r.user_id)) {
  const latest = new Map();
  let missing = 0;
  for (const r of legacy.prepare(`SELECT question_id, correct, answered_at FROM "${T('answers')}" WHERE user_id = ? AND coalesce(submission_state, 'submitted') <> 'draft' ORDER BY answered_at`).all(user)) {
    const code = mapping.get(`question\u0000${user}\u0000${r.question_id}`);
    if (!code) { missing += 1; continue; }
    latest.set(code, r.correct);
  }
  const fresh = v3.prepare("SELECT count(*) AS n, sum(correct) AS c FROM question_answer_states WHERE user_id = ? AND submission_state = 'submitted'").get(user);
  check(`用户 ${user} 最新作答题数（找不到原题 ${missing} 条，见迁移报告 answers.question_missing）`, latest.size, fresh.n);
  check(`用户 ${user} 最新作答答对数`, [...latest.values()].filter((c) => c === 1).length, fresh.c ?? 0);
}

// 3. 复习到期数（基準時刻で）
const now = new Date(at).toISOString();
for (const user of legacy.prepare(`SELECT DISTINCT user_id FROM "${T('progress')}"`).all().map((r) => r.user_id)) {
  const items = new Set([...legacy.prepare(`SELECT id FROM "${T('owned_review_items')}" WHERE user_id = ?`).all(user).map((r) => r.id)]);
  let due = 0;
  for (const r of legacy.prepare(`SELECT item_id, progress_json FROM "${T('progress')}" WHERE user_id = ?`).all(user)) {
    const p = json(r.progress_json, {});
    if (items.has(r.item_id) && p.nextReviewAt && p.nextReviewAt <= now && p.status && p.status !== 'new') due += 1;
  }
  const fresh = v3.prepare('SELECT count(*) AS n FROM review_schedules WHERE user_id = ? AND due_at <= ?').get(user, now).n;
  check(`用户 ${user} 到期复习数（${now}）`, due, fresh);
  const overview = studyOverview(v3, user);
  checks.push({ label: `用户 ${user} v3 正确率`, expected: null, actual: overview.totals.accuracy, ok: true });
}

console.log(JSON.stringify({ checked: checks.length, failed: problems.length, problems: problems.slice(0, 40), summary: checks.filter((c) => /正确率|到期/.test(c.label)) }, null, 2));
process.exit(problems.length ? 1 : 0);
