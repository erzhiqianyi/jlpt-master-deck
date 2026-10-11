import { assertSqlVariables } from '../server/sql-limits.mjs';

const isNamed = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && !ArrayBuffer.isView(value) && !(value instanceof ArrayBuffer);

/**
 * node:sqlite binds an object to :name / @name / $name parameters; Workers SQLite only takes
 * positional ones. Rewrite each named parameter outside string literals and identifiers to ?.
 */
export function bindNamed(query, named, rest = []) {
  let out = '';
  const values = [];
  for (let i = 0; i < query.length;) {
    const ch = query[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < query.length && !(query[j] === ch && query[j + 1] !== ch)) j += query[j] === ch ? 2 : 1;
      out += query.slice(i, j + 1); i = j + 1; continue;
    }
    if (ch === '-' && query[i + 1] === '-') { const j = query.indexOf('\n', i); const end = j < 0 ? query.length : j; out += query.slice(i, end); i = end; continue; }
    const match = /^[:@$]([A-Za-z_][A-Za-z0-9_]*)/.exec(query.slice(i, i + 80));
    if (match && !/[A-Za-z0-9_]/.test(query[i - 1] ?? '')) {
      if (!Object.hasOwn(named, match[1])) throw new Error(`Missing named parameter: ${match[1]}`);
      out += '?'; values.push(named[match[1]]); i += match[0].length; continue;
    }
    if (ch === '?') values.push(rest.shift());
    out += ch; i += 1;
  }
  return { query: out, values };
}

/** node:sqlite's small synchronous interface, backed by native Durable Object SQLite. */
export function sqliteAdapter(storage) {
  const sql = storage.sql;
  const execute = (text, args = []) => {
    const { query, values } = isNamed(args[0]) ? bindNamed(text, args[0], args.slice(1)) : { query: text, values: args };
    assertSqlVariables(query, values);
    return sql.exec(query, ...values.map(v => typeof v === 'bigint' ? Number(v) : v));
  };
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
