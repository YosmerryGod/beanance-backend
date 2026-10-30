CREATE TABLE IF NOT EXISTS market_agg_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  trade_id INTEGER NOT NULL,
  price REAL NOT NULL,
  quantity REAL NOT NULL,
  quote_volume REAL NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  trade_time INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(symbol, trade_id)
);

CREATE INDEX IF NOT EXISTS idx_market_agg_trades_symbol_time
ON market_agg_trades(symbol, trade_time DESC);

CREATE TABLE IF NOT EXISTS market_cvd_state (
  symbol TEXT PRIMARY KEY,
  cumulative_delta REAL NOT NULL DEFAULT 0,
  buy_quote_volume REAL NOT NULL DEFAULT 0,
  sell_quote_volume REAL NOT NULL DEFAULT 0,
  last_trade_id INTEGER,
  last_trade_time INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS market_liquidity_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  last_update_id INTEGER NOT NULL,
  captured_at INTEGER NOT NULL,
  bids_json TEXT NOT NULL,
  asks_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_market_liquidity_symbol_time
ON market_liquidity_snapshots(symbol, captured_at DESC);
