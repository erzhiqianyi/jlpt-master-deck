import { AsyncLocalStorage } from 'node:async_hooks';

// Request-scoped adapters keep cloud instances isolated while local Node keeps its existing storage.
const scope = new AsyncLocalStorage();
export const currentPlatform = () => scope.getStore();
export const withPlatform = (platform, callback) => scope.run(platform, callback);

export function transaction(db, callback) {
  if (db.transactionSync) return db.transactionSync(callback);
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = callback();
    db.exec('COMMIT');
    return value;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
