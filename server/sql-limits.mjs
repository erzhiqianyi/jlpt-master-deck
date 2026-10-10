// Workers (Durable Object) SQLite binds at most 100 variables per statement; local node:sqlite
// allows 32766, so an over-long `IN (?, ?, ...)` would pass locally and fail only in production.
// Enforce the production limit everywhere. Pass variable-length lists as one JSON parameter
// and expand them with `json_each(?)` instead.
export const MAX_SQL_VARIABLES = 100;

export function assertSqlVariables(sql, values) {
  const [first] = values;
  const count = first && typeof first === 'object' && !ArrayBuffer.isView(first)
    ? Object.keys(first).length + values.length - 1
    : values.length;
  if (count > MAX_SQL_VARIABLES) {
    throw new Error(`too many SQL variables: ${count} bound, limit is ${MAX_SQL_VARIABLES}. Pass lists as one JSON parameter with json_each(?). SQL: ${sql.replace(/\s+/g, ' ').slice(0, 200)}`);
  }
}

/** Wrap a node:sqlite DatabaseSync so every statement is held to the production variable limit. */
export function withSqlVariableLimit(db) {
  const guarded = new Set(['get', 'all', 'run', 'iterate']);
  return new Proxy(db, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (key !== 'prepare') return typeof value === 'function' ? value.bind(target) : value;
      return (sql, ...rest) => {
        const statement = target.prepare(sql, ...rest);
        return new Proxy(statement, {
          get(stmt, name) {
            const method = Reflect.get(stmt, name, stmt);
            if (typeof method !== 'function') return method;
            if (!guarded.has(name)) return method.bind(stmt);
            return (...values) => {
              assertSqlVariables(sql, values);
              return method.apply(stmt, values);
            };
          },
        });
      };
    },
  });
}

// Workers SQLite also rejects a single exec() longer than 100 KB (SQLITE_TOOBIG); the v3 schema
// alone is larger. Split a script into its statements so each one can be sent on its own.
// Handles quotes, comments, and trigger bodies (BEGIN … END, with CASE … END inside).
export function splitSqlStatements(script) {
  const statements = [];
  let start = 0, depth = 0, trigger = null, word = '';
  const flush = (end) => { const text = script.slice(start, end).trim(); if (text) statements.push(text); start = end; };
  const keyword = (w) => {
    const upper = w.toUpperCase();
    if (trigger === null) trigger = upper === 'CREATE' ? 'maybe' : false;
    else if (trigger === 'maybe' && upper !== 'TEMP' && upper !== 'TEMPORARY') trigger = upper === 'TRIGGER';
    if (trigger !== true) return;
    if (upper === 'BEGIN' || upper === 'CASE') depth++;
    else if (upper === 'END') depth--;
  };
  for (let i = 0; i < script.length; i++) {
    const c = script[i];
    if (/[A-Za-z_]/.test(c)) { word += c; continue; }
    if (word) { keyword(word); word = ''; }
    if (c === "'" || c === '"' || c === '`') { const close = script.indexOf(c, i + 1); i = close === -1 ? script.length : close; continue; }
    if (c === '[') { const close = script.indexOf(']', i + 1); i = close === -1 ? script.length : close; continue; }
    if (c === '-' && script[i + 1] === '-') { const close = script.indexOf('\n', i); i = close === -1 ? script.length : close; continue; }
    if (c === '/' && script[i + 1] === '*') { const close = script.indexOf('*/', i + 2); i = close === -1 ? script.length : close + 1; continue; }
    if (c === ';' && depth <= 0) { flush(i + 1); trigger = null; depth = 0; }
  }
  if (word) keyword(word);
  flush(script.length);
  return statements.filter((s) => s.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '').trim());
}
