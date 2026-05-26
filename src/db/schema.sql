CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  wallet TEXT NOT NULL UNIQUE,
  pseudonym TEXT,
  name TEXT,
  bio TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trades (
  transaction_hash TEXT NOT NULL,
  user_wallet TEXT NOT NULL,
  username TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  condition_id TEXT NOT NULL,
  asset TEXT NOT NULL,
  outcome_index INTEGER NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  size REAL NOT NULL,
  usdc_size REAL NOT NULL,
  price REAL NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  PRIMARY KEY (transaction_hash, user_wallet, condition_id, asset, side, size, price)
);

CREATE INDEX IF NOT EXISTS idx_trades_user_ts ON trades(user_wallet, timestamp);
CREATE INDEX IF NOT EXISTS idx_trades_condition ON trades(condition_id);

CREATE TABLE IF NOT EXISTS markets (
  condition_id TEXT PRIMARY KEY,
  slug TEXT,
  closed INTEGER NOT NULL DEFAULT 0,
  winning_outcome_index INTEGER,
  resolved_at INTEGER,
  last_checked INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bets (
  transaction_hash TEXT NOT NULL,
  user_wallet TEXT NOT NULL,
  username TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  condition_id TEXT NOT NULL,
  asset TEXT NOT NULL,
  outcome_index INTEGER NOT NULL,
  size REAL NOT NULL,
  usdc_size REAL NOT NULL,
  price REAL NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  closed_via TEXT NOT NULL CHECK (closed_via IN ('sell','resolution','open')),
  realized_pnl REAL,
  is_win INTEGER,
  PRIMARY KEY (transaction_hash, user_wallet, asset, size, price)
);

CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(user_wallet);
CREATE INDEX IF NOT EXISTS idx_bets_condition ON bets(condition_id);
CREATE INDEX IF NOT EXISTS idx_bets_ts ON bets(timestamp);

CREATE TABLE IF NOT EXISTS sync_state (
  user_wallet TEXT PRIMARY KEY,
  last_timestamp INTEGER NOT NULL,
  last_run_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts_sent (
  transaction_hash TEXT NOT NULL,
  user_wallet TEXT NOT NULL,
  asset TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  percentile REAL NOT NULL,
  PRIMARY KEY (transaction_hash, user_wallet, asset)
);

CREATE TABLE IF NOT EXISTS watch_wallet_cache (
  wallet TEXT PRIMARY KEY,
  is_new INTEGER NOT NULL,
  cached_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS watch_market_cache (
  asset_id TEXT PRIMARY KEY,
  found INTEGER NOT NULL DEFAULT 1,
  condition_id TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  is_politics INTEGER NOT NULL DEFAULT 0,
  cached_at INTEGER NOT NULL
);
