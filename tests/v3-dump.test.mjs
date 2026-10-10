// 移行用の書き出し：BLOB を含めて往復でき、件数・ハッシュの改ざんを拒否し、行の順序に左右されない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { dumpDatabase, digestDatabase, restoreIntoEmpty, replaceContents, verifyDump } from '../server/v3/dump.mjs';

function source() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id) ON DELETE CASCADE, data BLOB, score REAL);
    CREATE INDEX child_parent ON child (parent_id);
    CREATE TABLE log (msg TEXT);
    CREATE TRIGGER parent_gone AFTER DELETE ON parent BEGIN INSERT INTO log VALUES ('deleted ' || OLD.name); END;`);
  db.prepare('INSERT INTO parent VALUES (?, ?)').run(1, '親');
  db.prepare('INSERT INTO child VALUES (?, ?, ?, ?)').run(10, 1, Buffer.from([0, 255, 7]), 1.5);
  db.prepare('INSERT INTO child VALUES (?, ?, ?, ?)').run(11, 1, null, null);
  return db;
}

test('a dump restores into an empty database with the same contents, blobs and indexes', () => {
  const dump = JSON.parse(JSON.stringify(dumpDatabase(source())));
  const copy = new DatabaseSync(':memory:');
  restoreIntoEmpty(copy, dump);
  assert.deepEqual(digestDatabase(copy), digestDatabase(source()));
  assert.deepEqual([...copy.prepare('SELECT data FROM child WHERE id = 10').get().data], [0, 255, 7]);
  assert.ok(copy.prepare("SELECT 1 FROM sqlite_master WHERE name = 'child_parent'").get());
  assert.equal(copy.prepare('SELECT count(*) AS n FROM log').get().n, 0, 'triggers are created after the rows');
});

test('tampered or truncated dumps are rejected', () => {
  const dump = JSON.parse(JSON.stringify(dumpDatabase(source())));
  const child = dump.tables.find((t) => t.name === 'child');
  child.rows[0][3] = 9.5;
  assert.throws(() => verifyDump(dump), /Digest mismatch in child/);
  child.rows.pop();
  assert.throws(() => verifyDump(dump), /Row count mismatch in child/);
  assert.throws(() => verifyDump({ ...dump, format: 'other' }), /Unsupported/);
});

test('replaceContents swaps the rows of existing tables and the digest ignores row order', () => {
  const target = new DatabaseSync(':memory:');
  target.exec(`CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id) ON DELETE CASCADE, data BLOB, score REAL);
    INSERT INTO parent VALUES (2, 'old'); INSERT INTO child VALUES (99, 2, NULL, NULL);`);
  const dump = dumpDatabase(source());
  dump.tables.find((t) => t.name === 'child').rows.reverse();
  target.exec('BEGIN');
  const expected = replaceContents(target, dump);
  target.exec('COMMIT');
  assert.deepEqual(digestDatabase(target, { tables: expected.map((t) => t.name) }), expected);
  assert.deepEqual(target.prepare('SELECT id FROM child ORDER BY id').all().map((r) => r.id), [10, 11]);
});
