import { assertSqlVariables } from '../server/sql-limits.mjs';

// Durable Object SQLite only binds positional `?`. node:sqlite also binds named parameters
// (:name, @name, $name) from an object, which the v3 repositories use; rewrite them to `?`.
const placeholders = new Map();
function parsePlaceholders(query) {
  let parsed = placeholders.get(query);
  if (parsed) return parsed;
  let text = '', last = 0;
  const names = [];
  for (let i = 0; i < query.length; i++) {
    const c = query[i];
    const skip = (close, from = i + 1) => { const end = query.indexOf(close, from); i = end === -1 ? query.length : end + close.length - 1; };
    if (c === "'" || c === '"' || c === '`') skip(c);
    else if (c === '[') skip(']');
    else if (c === '-' && query[i + 1] === '-') skip('\n');
    else if (c === '/' && query[i + 1] === '*') skip('*/', i + 2);
    else if (c === '?') { names.push(null); while (/[0-9]/.test(query[i + 1] ?? '')) i++; }
    else if ((c === ':' || c === '@' || c === '$') && /[A-Za-z_]/.test(query[i + 1] ?? '') && !/[A-Za-z0-9_]/.test(query[i - 1] ?? '')) {
      let end = i + 1;
      while (/[A-Za-z0-9_]/.test(query[end] ?? '')) end++;
      names.push(query.slice(i + 1, end));
      text += query.slice(last, i) + '?';
      last = end;
      i = end - 1;
    }
  }
  parsed = { sql: names.some((n) => n !== null) ? text + query.slice(last) : query, names };
  if (placeholders.size > 2000) placeholders.clear();
  placeholders.set(query, parsed);
  return parsed;
}

/** Bind like node:sqlite: a leading plain object supplies named values (missing → NULL, unknown → error). */
export function positionalBinding(query, values) {
  const [first] = values;
  const named = first !== null && typeof first === 'object' && !ArrayBuffer.isView(first) && !Array.isArray(first);
  const { sql, names } = parsePlaceholders(query);
  if (!named) return { sql, values };
  const known = new Set(names.filter((n) => n !== null));
  for (const key of Object.keys(first)) if (!known.has(key)) throw new Error(`Unknown named parameter '${key}'`);
  const rest = values.slice(1);
  let next = 0;
  return { sql, values: names.map((name) => (name === null ? rest[next++] : first[name] ?? null)) };
}

/** node:sqlite's small synchronous interface, backed by native Durable Object SQLite. */
export function sqliteAdapter(storage) {
  const sql = storage.sql;
  const execute = (query, values = []) => {
    assertSqlVariables(query, values);
    const bound = positionalBinding(query, values);
    return sql.exec(bound.sql, ...bound.values.map(v => typeof v === 'bigint' ? Number(v) : v === undefined ? null : v));
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
