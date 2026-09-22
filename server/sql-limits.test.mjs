import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MAX_SQL_VARIABLES, withSqlVariableLimit } from './sql-limits.mjs';
import { sqliteAdapter } from '../cloudflare/sqlite-adapter.mjs';

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
