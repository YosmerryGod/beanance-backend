CREATE TABLE exchange_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exchange TEXT NOT NULL CHECK (exchange IN ('binance')),
  market_type TEXT NOT NULL CHECK (market_type IN ('usdm_futures')),
  label TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  encrypted_api_secret TEXT NOT NULL,
  encryption_version INTEGER NOT NULL DEFAULT 1,
  account_alias TEXT,
  status TEXT NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'disconnected', 'error')),
  last_verified_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_exchange_accounts_user
ON exchange_accounts(user_id, created_at);

CREATE UNIQUE INDEX idx_exchange_accounts_user_label
ON exchange_accounts(user_id, exchange, market_type, label);
