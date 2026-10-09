// 一次性：从 docs/schema-v3-design.md 现有表格提取“取值 / 示例”与“旧数据来源”，写入 server/v3/column-notes.json。
import { readFileSync, writeFileSync } from 'node:fs';

const doc = readFileSync(process.argv[2] ?? new URL('../../docs/schema-v3-design.md', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../../server/v3/schema.sql', import.meta.url), 'utf8');
const tables = new Map();
for (const m of sql.matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\n\);/g)) {
  tables.set(m[1], new Set([...m[2].matchAll(/^\s{2}(\w+)\s+(?:INTEGER|TEXT|REAL)/gm)].map((c) => c[1])));
}
const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim());
const names = (cell) => [...cell.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]);
const notes = {};
const put = (table, column, key, value) => {
  if (!value || value === '—' || !tables.get(table)?.has(column)) return;
  notes[table] ??= {};
  notes[table][column] ??= {};
  notes[table][column][key] ??= value;
};

let current = null;
let header = null;
for (const line of doc.split('\n')) {
  const heading = /^#{2,4} .*?`([a-z_]+)`/.exec(line) ?? /^`([a-z_]+)`[：（]/.exec(line);
  if (heading && tables.has(heading[1])) current = heading[1];
  if (!line.startsWith('|')) { header = null; continue; }
  const row = cells(line);
  if (!header) { header = row; continue; }
  if (row.every((c) => /^-+$/.test(c))) continue;
  const at = (label) => header.findIndex((h) => h.includes(label));
  const sourceAt = at('旧数据来源') >= 0 ? at('旧数据来源') : at('旧键名');
  const sampleAt = at('取值') >= 0 ? at('取值') : at('示例');
  const meaningAt = at('含义');
  // 多表汇总行：第一格是表名，第二格是“列：含义”
  const rowTable = names(row[0]).find((n) => tables.has(n));
  if (header[0] === '表' && rowTable) {
    for (const column of names(row[1] ?? '')) put(rowTable, column, 'source', row[sourceAt]);
    continue;
  }
  if (!current) continue;
  for (const column of names(row[0])) {
    put(current, column, 'source', row[sourceAt]);
    if (sampleAt >= 0) put(current, column, 'sample', row[sampleAt]);
    if (meaningAt >= 0 && names(row[0]).length === 1) put(current, column, 'meaning', row[meaningAt]);
  }
}
writeFileSync(new URL('../../server/v3/column-notes.json', import.meta.url), `${JSON.stringify(notes, null, 2)}\n`);
console.log(Object.keys(notes).length, 'tables,', Object.values(notes).reduce((n, t) => n + Object.keys(t).length, 0), 'columns with notes');
