import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { transaction } from './platform.mjs';
import { withSqlVariableLimit } from './sql-limits.mjs';
test('nested writes commit with their owner transaction and roll back independently when caught',()=>{
 const db=withSqlVariableLimit(new DatabaseSync(':memory:'));db.exec('CREATE TABLE t(id INTEGER)');
 try {
  transaction(db,()=>{
   db.prepare('INSERT INTO t VALUES(?)').run(1);
   assert.throws(()=>transaction(db,()=>{db.prepare('INSERT INTO t VALUES(?)').run(2);throw new Error('inner');}),/inner/);
   transaction(db,()=>db.prepare('INSERT INTO t VALUES(?)').run(3));
  });
  assert.deepEqual(db.prepare('SELECT id FROM t ORDER BY id').all().map(r=>r.id),[1,3]);
  assert.throws(()=>transaction(db,()=>{transaction(db,()=>db.prepare('INSERT INTO t VALUES(?)').run(4));throw new Error('outer');}),/outer/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM t').get().n,2);
 } finally {db.close();}
});
