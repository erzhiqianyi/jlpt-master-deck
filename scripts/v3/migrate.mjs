// 用法：node scripts/v3/migrate.mjs <旧库.sqlite> <新库.sqlite> [报告目录]
// 只读旧库，写一个全新的 v3 数据库文件；报告写入报告目录（默认与新库同目录）。
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { migrateLegacyToV3 } from '../../server/v3/migrate/index.mjs';

const [from, to, reportDir = dirname(to ?? '.')] = process.argv.slice(2);
if (!from || !to) { console.error('用法：node scripts/v3/migrate.mjs <旧库.sqlite> <新库.sqlite> [报告目录]'); process.exit(2); }
if (!existsSync(from)) { console.error(`找不到旧库：${from}`); process.exit(2); }
if (existsSync(to)) rmSync(to);
const legacy = new DatabaseSync(from, { readOnly: true });
const target = new DatabaseSync(to);
const started = performance.now();
const report = migrateLegacyToV3({ legacy, target });
report.durationMs = Math.round(performance.now() - started);
report.source = from;
mkdirSync(reportDir, { recursive: true });
const stem = basename(to).replace(/\.sqlite$/, '');
const { mapping, ...summary } = report;
writeFileSync(join(reportDir, `${stem}.report.json`), `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(join(reportDir, `${stem}.mapping.tsv`), ['kind\tuser_id\tlegacy_id\trid\tcode', ...mapping.map((m) => [m.kind, m.userId, m.legacyId, m.rid, m.code ?? ''].join('\t'))].join('\n') + '\n');
console.log(JSON.stringify({ durationMs: report.durationMs, foreignKeyViolations: report.foreignKeyViolations, knowledge: report.knowledge, questions: report.questions, activity: report.activity,
  warnings: Object.fromEntries(Object.entries(report.warnings).map(([k, v]) => [k, v.count])) }, null, 2));
