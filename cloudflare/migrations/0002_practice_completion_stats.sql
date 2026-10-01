CREATE TABLE IF NOT EXISTS practice_completion_stats (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES daily_practices(id) ON DELETE CASCADE,
  completed_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, practice_id)
);
CREATE TABLE IF NOT EXISTS practice_completion_receipts (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL,
  practice_id TEXT NOT NULL REFERENCES daily_practices(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, attempt_id)
);
CREATE TRIGGER IF NOT EXISTS increment_practice_completion AFTER INSERT ON practice_completion_receipts
BEGIN
  INSERT INTO practice_completion_stats (user_id, practice_id, completed_count)
  VALUES (NEW.user_id, NEW.practice_id, 1)
  ON CONFLICT(user_id, practice_id) DO UPDATE SET completed_count = completed_count + 1;
END;
