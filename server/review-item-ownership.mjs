// Preserve the legacy library, but give every account present at migration time an
// independent copy. The marker and copies commit together; later accounts start empty.
export function migrateReviewItemOwnership(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS owned_review_items (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      item_json TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'database',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, id)
    );
    CREATE TABLE IF NOT EXISTS review_item_migrations (name TEXT PRIMARY KEY);
  `);
  if (db.prepare('SELECT name FROM review_item_migrations WHERE name = ?').get('account-copies-v1')) return;
  db.exec(`
    INSERT OR IGNORE INTO owned_review_items (user_id, id, item_json, source, created_at, updated_at)
    SELECT u.id, r.id,
      CASE WHEN COALESCE(json_extract(r.item_json, '$.wordbook_id'), json_extract(r.item_json, '$.wordbook_ids[0]'), '') LIKE 'wordbook-%'
        AND NOT EXISTS (SELECT 1 FROM wordbooks w WHERE w.user_id = u.id AND w.id = COALESCE(json_extract(r.item_json, '$.wordbook_id'), json_extract(r.item_json, '$.wordbook_ids[0]')))
      THEN json_set(r.item_json, '$.wordbook_id', json_extract(r.item_json, '$.deck'))
      ELSE r.item_json END,
      r.source, r.created_at, r.updated_at
    FROM users u CROSS JOIN review_items r
    WHERE NOT EXISTS (SELECT 1 FROM user_review_items i WHERE i.user_id = u.id AND i.id = r.id);
    INSERT INTO review_item_migrations(name) VALUES ('account-copies-v1');
  `);
}
