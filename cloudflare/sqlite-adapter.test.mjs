import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindNamed } from './sqlite-adapter.mjs';

test('named parameters become positional outside string literals and comments', () => {
  const { query, values } = bindNamed("SELECT ':skip', \"@col\" FROM t WHERE a = :user AND b = @kind AND c = $user -- :ignored\nAND json_extract(x, '$.k') = :user", { user: 1, kind: 'word' });
  assert.equal(query, "SELECT ':skip', \"@col\" FROM t WHERE a = ? AND b = ? AND c = ? -- :ignored\nAND json_extract(x, '$.k') = ?");
  assert.deepEqual(values, [1, 'word', 1, 1]);
  assert.throws(() => bindNamed('SELECT :missing', {}), /missing/);
  assert.deepEqual(bindNamed("SELECT 'it''s :x' WHERE a = :a", { a: 2 }).values, [2]);
});
