CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  avatar_url TEXT,
  password_hash TEXT,
  google_id TEXT UNIQUE,
  auth_provider TEXT NOT NULL CHECK (auth_provider IN ('email', 'google', 'both')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_created_at ON users(created_at);
