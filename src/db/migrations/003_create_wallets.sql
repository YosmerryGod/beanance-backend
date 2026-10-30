CREATE TABLE wallets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  address TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  encrypted_mnemonic TEXT,
  encryption_version INTEGER NOT NULL DEFAULT 1,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, address)
);

CREATE INDEX idx_wallets_user_created
ON wallets(user_id, created_at);

CREATE UNIQUE INDEX idx_wallets_one_primary_per_user
ON wallets(user_id)
WHERE is_primary = 1;
