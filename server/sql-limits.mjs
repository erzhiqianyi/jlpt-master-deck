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
