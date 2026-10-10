import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MAX_SQL_VARIABLES, splitSqlStatements, withSqlVariableLimit } from './sql-limits.mjs';
import { sqliteAdapter } from '../cloudflare/sqlite-adapter.mjs';
import { readFileSync } from 'node:fs';
import { ACCOUNT_SCHEMA } from './v3/database.mjs';

const values = (n) => Array.from({ length: n }, (_, i) => i);
const inList = (n) => `SELECT COUNT(*) AS c FROM (SELECT 1) WHERE 1 IN (${values(n).map(() => '?').join(',')})`;

test('local databases reject more bound variables than Workers SQLite allows', () => {
  const db = withSqlVariableLimit(new DatabaseSync(':memory:'));
  assert.equal(db.prepare(inList(MAX_SQL_VARIABLES)).get(...values(MAX_SQL_VARIABLES)).c, 1);
  assert.throws(() => db.prepare(inList(MAX_SQL_VARIABLES + 1)).all(...values(MAX_SQL_VARIABLES + 1)), /too many SQL variables: 101/);
  assert.throws(() => db.prepare('SELECT :a').get(Object.fromEntries(values(101).map(i => [`a${i}`, i]))), /too many SQL variables/);
});

test('one JSON parameter carries a list of any length', () => {
  const db = withSqlVariableLimit(new DatabaseSync(':memory:'));
  const row = db.prepare('SELECT COUNT(*) AS c FROM json_each(?) WHERE value IN (SELECT value FROM json_each(?))').get(JSON.stringify(values(5000)), JSON.stringify([1, 2, 3]));
  assert.equal(row.c, 3);
});

test('the Workers adapter fails with the same guidance before reaching SQLite', () => {
  let reached = false;
  const db = sqliteAdapter({ sql: { exec: () => { reached = true; return { toArray: () => [] }; } } });
  assert.throws(() => db.prepare(inList(101)).all(...values(101)), /json_each/);
  assert.equal(reached, false);
});

test('splitSqlStatements keeps triggers, strings and comments intact', () => {
  const script = `-- a; comment
CREATE TABLE t (a TEXT DEFAULT 'x;y', b TEXT); /* block; comment */
CREATE TRIGGER tr AFTER INSERT ON t BEGIN
  UPDATE t SET b = CASE WHEN NEW.a = 'end;' THEN 'p' ELSE 'q' END WHERE rowid = NEW.rowid;
  SELECT 1;
END;
CREATE TEMP TRIGGER tt AFTER DELETE ON t BEGIN SELECT 2; END;
INSERT INTO t (a) VALUES ('end;');`;
  const parts = splitSqlStatements(script);
  assert.equal(parts.length, 4);
  assert.match(parts[1], /CREATE TRIGGER tr[\s\S]*END;$/);
  assert.match(parts[2], /^CREATE TEMP TRIGGER tt[\s\S]*END;$/);
  const db = new DatabaseSync(':memory:');
  for (const part of parts) db.exec(part);
  assert.equal(db.prepare('SELECT b FROM t').get().b, 'p');
});

test('the v3 schema runs statement by statement under the Workers size limit and matches one exec', () => {
  const schema = readFileSync(new URL('./v3/schema.sql', import.meta.url), 'utf8').replace(/^PRAGMA .*$/gm, '');
  const parts = splitSqlStatements(schema);
  assert.ok(parts.every((part) => Buffer.byteLength(part) < 100_000));
  const whole = new DatabaseSync(':memory:'); whole.exec(ACCOUNT_SCHEMA); whole.exec(schema);
  const split = new DatabaseSync(':memory:'); split.exec(ACCOUNT_SCHEMA); for (const part of parts) split.exec(part);
  const dump = (db) => db.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all().map((r) => ({ ...r }));
  assert.deepEqual(dump(split), dump(whole));
  const rows = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(({ name }) => [name, db.prepare(`SELECT count(*) AS n FROM "${name}"`).get().n]);
  assert.deepEqual(rows(split), rows(whole));
});

test('the Workers adapter binds named parameters like node:sqlite (Durable Objects only take ?)', () => {
  const local = new DatabaseSync(':memory:');
  // Stand-in for storage.sql: refuses anything but positional placeholders, as Workers SQLite does.
  const positionalOnly = { exec(query, ...values) {
    assert.doesNotMatch(query.replace(/'[^']*'/g, '').replace(/--[^\n]*/g, ''), /[:@$][A-Za-z_]/, query);
    const rows = local.prepare(query).all(...values);
    return { toArray: () => rows, one: () => rows[0] };
  } };
  const cloud = sqliteAdapter({ sql: positionalOnly });
  for (const [query, values] of [
    ['SELECT :a AS a, :a AS b, @c AS c, $d AS d', [{ a: 1, c: 'x', d: null }]],
    ["SELECT ':a' AS s, :a AS a -- :ignored\n", [{ a: 5 }]],
    ['SELECT :a AS a, :b AS b', [{ a: 1 }]],
    ['SELECT :a AS a, ? AS p', [{ a: 1 }, 9]],
    ['SELECT ? AS x, ? AS y', [1, 2]],
    ["SELECT json_extract('{\"a\":7}', '$.a') AS j, :r AS r", [{ r: 3 }]],
  ]) assert.deepEqual({ ...cloud.prepare(query).get(...values) }, { ...local.prepare(query).get(...values) }, query);
  assert.throws(() => cloud.prepare('SELECT :a').get({ a: 1, extra: 2 }), /Unknown named parameter 'extra'/);
  assert.throws(() => local.prepare('SELECT :a').get({ a: 1, extra: 2 }), /Unknown named parameter 'extra'/);
});
