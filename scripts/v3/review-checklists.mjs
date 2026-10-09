// docs/question-type-specifications.md から題型ごとの審査清単（任務・結構と内容の審査・解析の型・技巧）を抜き出し、
// server/v3/review-checklists.mjs を生成する。仕様書を直したら再実行する。--check で生成物が最新か確かめる。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const doc = readFileSync(join(root, 'docs/question-type-specifications.md'), 'utf8');
const common = /## 共通契约\n\n([\s\S]*?)\n## /.exec(doc)[1].trim();
const types = {};
for (const match of doc.matchAll(/^## (.+?) `([a-z-]+)`\n\n任务：(.+)\n\n([\s\S]*?)(?=\n## )/gm)) {
  const [, name, typeId, task, table] = match;
  const row = (label) => new RegExp(`^\\|${label}\\|(.+)\\|$`, 'm').exec(table)?.[1].trim() ?? null;
  types[typeId] = { name, task: task.trim(), checks: row('结构硬校验与内容审查'), explanation: row('解析模板'), tip: row('技巧'), knowledge: row('知识关联') };
}
// 听力基础训练は v3 で 4 題型に分かれた
for (const id of ['listening-basic-discrimination', 'listening-basic-dictation', 'listening-basic-shadowing', 'listening-basic-free']) types[id] = types['listening-basic-training'];
delete types['listening-basic-training'];
const output = `// 自動生成：node scripts/v3/review-checklists.mjs（元は docs/question-type-specifications.md）。手で直さない。\nexport const COMMON_REVIEW_CONTRACT = ${JSON.stringify(common)};\nexport const REVIEW_CHECKLISTS = ${JSON.stringify(types, null, 2)};\n`;
const target = join(root, 'server/v3/review-checklists.mjs');
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== output) { console.error('server/v3/review-checklists.mjs が仕様書と一致しません。node scripts/v3/review-checklists.mjs を実行してください'); process.exit(1); }
  console.log('審査清単は仕様書と一致');
} else {
  writeFileSync(target, output);
  console.log(`${Object.keys(types).length} 題型`);
}
