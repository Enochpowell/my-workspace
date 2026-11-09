-- Small key/value settings saved from inside the app (for example AI API keys, stored encrypted).
CREATE TABLE IF NOT EXISTS settings (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
