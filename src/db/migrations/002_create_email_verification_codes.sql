CREATE TABLE email_verification_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT NOT NULL COLLATE NOCASE,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'change_password')),
  password_hash TEXT,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_email_verification_lookup
ON email_verification_codes(email, purpose, created_at);

CREATE INDEX idx_email_verification_user
ON email_verification_codes(user_id, purpose);
