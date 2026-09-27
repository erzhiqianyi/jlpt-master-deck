export function ensureTtsSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS user_tts_credentials (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    credential_encrypted TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, provider)
  );`);
}
