/** node:sqlite's small synchronous interface, backed by native Durable Object SQLite. */
export function sqliteAdapter(storage) {
  const sql = storage.sql;
  const execute = (query, values = []) => sql.exec(query, ...values.map(v => typeof v === 'bigint' ? Number(v) : v));
  const db = {
    exec(query) { return execute(query); },
    prepare(query) {
      return {
        get(...values) { return execute(query, values).toArray()[0]; },
        all(...values) { return execute(query, values).toArray(); },
        run(...values) {
          execute(query, values).toArray();
          const meta = execute('SELECT changes() AS changes, last_insert_rowid() AS lastInsertRowid').one();
          return meta;
        },
      };
    },
    transactionSync(fn) { return storage.transactionSync(fn); },
    runTimedQuery(query, values, deadline) {
      // Workers SQLite has no JS scalar UDF. Keep the bound placeholder, use platform
      // execution limits, and reject late results rather than returning partial records.
      if (Date.now() > deadline) throw new Error('QUERY_TIMEOUT');
      const result = execute(query.replaceAll('mcp_deadline_ok(?)', '(? >= 0)'), [...values, deadline]).toArray();
      if (Date.now() > deadline) throw new Error('QUERY_TIMEOUT');
      return result;
    },
  };
  return db;
}
