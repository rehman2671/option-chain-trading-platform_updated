-- Option Chain Trading Platform Database DDL
-- Migration Script 001: Initial Core Schema & High-Performance Indexes
-- Compatible with SQLite, PostgreSQL, and Cloud SQL

-- 1. Ticks Table
CREATE TABLE IF NOT EXISTS ticks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol VARCHAR(20) NOT NULL,
  spot_price REAL NOT NULL,
  india_vix REAL NOT NULL,
  volume INTEGER DEFAULT 0,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Option Chains Table
CREATE TABLE IF NOT EXISTS option_chains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol VARCHAR(20) NOT NULL,
  expiry VARCHAR(15) NOT NULL,
  strike_price REAL NOT NULL,
  option_type VARCHAR(2) NOT NULL, -- 'CE' or 'PE'
  ltp REAL NOT NULL,
  volume INTEGER DEFAULT 0,
  open_interest INTEGER DEFAULT 0,
  change_in_oi INTEGER DEFAULT 0,
  iv REAL NOT NULL,
  delta REAL NOT NULL,
  gamma REAL NOT NULL,
  theta REAL NOT NULL,
  vega REAL NOT NULL,
  buildup VARCHAR(25) NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Basket Orders Table
CREATE TABLE IF NOT EXISTS basket_orders (
  id VARCHAR(50) PRIMARY KEY,
  strategy_id VARCHAR(50) NOT NULL,
  strategy_name VARCHAR(100) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  margin_required REAL NOT NULL,
  margin_available REAL NOT NULL,
  fallback_action TEXT,
  reconciliation_status VARCHAR(25) DEFAULT 'IN_SYNC',
  legs_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Paper Positions Table
CREATE TABLE IF NOT EXISTS paper_positions (
  id VARCHAR(50) PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  strategy_name VARCHAR(100) NOT NULL,
  strike_price REAL NOT NULL,
  option_type VARCHAR(2) NOT NULL,
  action VARCHAR(4) NOT NULL,
  quantity INTEGER NOT NULL,
  entry_price REAL NOT NULL,
  current_price REAL NOT NULL,
  pnl REAL DEFAULT 0.0,
  stop_loss REAL,
  target_price REAL,
  status VARCHAR(10) DEFAULT 'OPEN',
  opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME
);

-- 5. OI Anomalies Table
CREATE TABLE IF NOT EXISTS oi_anomalies (
  id VARCHAR(50) PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  strike_price REAL NOT NULL,
  option_type VARCHAR(2) NOT NULL,
  z_score REAL NOT NULL,
  oi_change INTEGER NOT NULL,
  volume INTEGER NOT NULL,
  severity VARCHAR(10) NOT NULL,
  description TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Schema Migrations History Table
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------
-- AUTO-INDEXING STATEMENTS FOR SCALABILITY & LOW-LATENCY LOOKUPS
-- -------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_ticks_symbol_timestamp 
  ON ticks(symbol, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_option_chains_lookup 
  ON option_chains(symbol, expiry, strike_price, option_type);

CREATE INDEX IF NOT EXISTS idx_basket_orders_strategy_status 
  ON basket_orders(strategy_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_paper_positions_status 
  ON paper_positions(status, symbol);

CREATE INDEX IF NOT EXISTS idx_oi_anomalies_zscore 
  ON oi_anomalies(symbol, z_score DESC, timestamp DESC);
