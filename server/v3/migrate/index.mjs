// 旧数据 → v3：读旧库（只读），写一个新的 v3 数据库文件，返回迁移报告。
import { readFileSync } from 'node:fs';
import { migrateMarket } from './market.mjs';
import { createContext } from './context.mjs';
import { typeIdFor } from './normalize.mjs';
import { migrateUsersSettings, migrateMedia, migrateWordbooks, migrateCaptures } from './basics.mjs';
import { loadItems, migrateKnowledge, linkSourceDrafts } from './knowledge.mjs';
import { createBank, addReadingQuestions, addListeningQuestions } from './questions.mjs';
import { migrateDrafts, migratePracticeSets, addSnapshots, migrateActivity, migratePlansReports } from './activity.mjs';

// 原样保留的表（账户、OAuth、语音服务凭据与缓存、市场）
export const CARRY_OVER_TABLES = ['users', 'sessions', 'agent_clients', 'agent_codes', 'agent_access_tokens', 'agent_refresh_tokens',
  'user_tts_credentials', 'tts_audio_cache', 'firebase_identities'];

const SCHEMA = new URL('../schema.sql', import.meta.url);

/** 复制原样保留的表：结构（含索引、触发器）和数据。 */
function copyCarryOver(legacy, target, report) {
  const objects = legacy.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").all();
  for (const name of CARRY_OVER_TABLES) {
    const table = objects.find((o) => o.type === 'table' && o.name === name);
    if (!table) continue;
    target.exec(table.sql);
    const columns = legacy.prepare(`PRAGMA table_info("${name}")`).all().map((c) => `"${c.name}"`);
    const insert = target.prepare(`INSERT INTO "${name}" (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);
    let n = 0;
    for (const row of legacy.prepare(`SELECT ${columns.join(', ')} FROM "${name}"`).iterate()) { insert.run(...Object.values(row)); n += 1; }
    report.carriedOver[name] = n;
    for (const extra of objects.filter((o) => o.tbl_name === name && o.type !== 'table')) target.exec(extra.sql);
  }
  if (!target.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()) {
    target.exec('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL)');
  }
}

export function migrateLegacyToV3({ legacy, target, now = new Date().toISOString() }) {
  target.exec('PRAGMA foreign_keys = OFF');
  target.exec('BEGIN');
  const ctx = createContext({ legacy, target, now });
  ctx.report.carriedOver = {};
  try {
    copyCarryOver(legacy, target, ctx.report);
    target.exec(readFileSync(SCHEMA, 'utf8'));
    migrateUsersSettings(ctx);
    migrateMedia(ctx);
    const itemsByUser = loadItems(ctx);
    migrateWordbooks(ctx, itemsByUser);
    migrateCaptures(ctx);
    const bank = createBank(ctx);
    migrateKnowledge(ctx, itemsByUser, bank);
    const linkDraftQuestions = migrateDrafts(ctx, bank);
    linkSourceDrafts(ctx, itemsByUser);
    const linkPractice = migratePracticeSets(ctx, bank);
    addSnapshots(ctx, bank);
    addReadingQuestions(ctx, bank);
    addListeningQuestions(ctx, bank);
    bank.materialize();
    linkDraftQuestions();
    linkPractice(typeIdFor);
    const questionsByRid = new Map();
    for (const copy of bank.copies) if (copy.resolved) questionsByRid.set(copy.resolved.questionRid, copy.resolved);
    migrateActivity(ctx, questionsByRid);
    migratePlansReports(ctx);
    migrateMarket(ctx);
    const sequence = target.prepare('INSERT INTO id_sequences (user_id, prefix, next_no) VALUES (?, ?, ?)');
    for (const [key, next] of ctx.sequences) { const [userId, prefix] = key.split('\u0000'); sequence.run(Number(userId), prefix, next); }
    target.exec('COMMIT');
  } catch (error) {
    target.exec('ROLLBACK');
    throw error;
  }
  target.exec('PRAGMA foreign_keys = ON');
  const violations = target.prepare('PRAGMA foreign_key_check').all();
  ctx.report.foreignKeyViolations = violations.length;
  if (violations.length) ctx.report.foreignKeySamples = violations.slice(0, 20);
  for (const { name } of target.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
    ctx.report.written[name] = target.prepare(`SELECT count(*) AS n FROM "${name}"`).get().n;
  }
  ctx.report.finishedAt = new Date().toISOString();
  return ctx.report;
}
