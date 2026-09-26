-- 回答IDの一意制約で通信再試行時の二重登録を防止する。
CREATE TABLE IF NOT EXISTS survey_responses (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  response_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS survey_rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
