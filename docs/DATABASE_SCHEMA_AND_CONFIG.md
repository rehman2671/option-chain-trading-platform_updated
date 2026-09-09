# QUANTITATIVE DATABASE SCHEMA & CONFIGURATION REGISTRY

This document describes the schema specifications, statutory costs, and configuration parameters for the PRO QUANT V2 trading and research system.

---

## 1. Relational & Time-Series Database Schemas

### 1.1 `market_feature_snapshots`
Stores sub-second feature vectors derived from tick and option chain data.
```sql
CREATE TABLE IF NOT EXISTS market_feature_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL,
  underlying VARCHAR(16) NOT NULL,
  spot_price NUMERIC(10, 2) NOT NULL,
  atm_iv NUMERIC(6, 2) NOT NULL,
  iv_rank NUMERIC(5, 2) NOT NULL,
  pcr_oi NUMERIC(6, 3) NOT NULL,
  pcr_vol NUMERIC(6, 3) NOT NULL,
  call_wall_strike NUMERIC(10, 2) NOT NULL,
  put_wall_strike NUMERIC(10, 2) NOT NULL,
  max_pain NUMERIC(10, 2) NOT NULL,
  net_gamma NUMERIC(14, 4) NOT NULL,
  vwap NUMERIC(10, 2) NOT NULL,
  rsi_14 NUMERIC(5, 2) NOT NULL,
  atr_14 NUMERIC(8, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_features_underlying_ts ON market_feature_snapshots(underlying, timestamp DESC);
```

### 1.2 `market_regime_logs`
Historical record of regime classifications and confidence scores.
```sql
CREATE TABLE IF NOT EXISTS market_regime_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL,
  underlying VARCHAR(16) NOT NULL,
  primary_regime VARCHAR(32) NOT NULL,
  secondary_regime VARCHAR(32) NOT NULL,
  volatility_regime VARCHAR(32) NOT NULL,
  confidence NUMERIC(4, 3) NOT NULL,
  rationale TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_regime_underlying_ts ON market_regime_logs(underlying, timestamp DESC);
```

### 1.3 `strategy_tournament_rankings`
Snapshot of tournament leaderboard rankings across each cycle.
```sql
CREATE TABLE IF NOT EXISTS strategy_tournament_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL,
  underlying VARCHAR(16) NOT NULL,
  strategy_id VARCHAR(64) NOT NULL,
  rank INT NOT NULL,
  score NUMERIC(5, 2) NOT NULL,
  regime_fit_score NUMERIC(5, 2) NOT NULL,
  expected_value VARCHAR(16) NOT NULL,
  recommendation VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tournament_ts ON strategy_tournament_rankings(underlying, timestamp DESC);
```

### 1.4 `order_execution_audit`
Immutable execution logs with full slippage and fill analytics.
```sql
CREATE TABLE IF NOT EXISTS order_execution_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(64) UNIQUE NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  underlying VARCHAR(16) NOT NULL,
  symbol VARCHAR(64) NOT NULL,
  strategy_id VARCHAR(64) NOT NULL,
  order_type VARCHAR(16) NOT NULL,
  side VARCHAR(8) NOT NULL,
  requested_price NUMERIC(10, 2) NOT NULL,
  fill_price NUMERIC(10, 2) NOT NULL,
  quantity INT NOT NULL,
  slippage_points NUMERIC(6, 2) NOT NULL,
  broker_order_id VARCHAR(64),
  execution_mode VARCHAR(16) NOT NULL -- 'PAPER', 'SHADOW', 'LIVE'
);
```

---

## 2. Statutory Costs & Friction Model (Indian Markets)
All backtesting and live P&L calculators strictly incorporate standard Indian brokerage, exchange turnover, and statutory charges:
- **Brokerage**: Fixed ₹20 per executed order (or 0.05%, whichever is lower).
- **STT (Securities Transaction Tax)**:
  - Options (Sell Side): 0.0625% on premium turnover.
  - Options (Exercised): 0.125% on intrinsic settlement value.
  - Futures (Sell Side): 0.0125% on contract turnover.
- **Exchange Turnover Charges (NSE)**:
  - Options: 0.05% of premium turnover.
  - Futures: 0.0019% of contract turnover.
- **SEBI Turnover Charges**: ₹10 per crore (0.0001%).
- **Stamp Duty**: 0.003% on buy side premium.
- **GST**: 18% applied on (Brokerage + Exchange Turnover + SEBI charges).

---

## 3. Quant Configuration Registry
The parameters in `QuantConfigRegistry` govern all live and research operations:
- `MAX_CAPITAL_RISK_PER_TRADE_PCT`: Default `1.5%` (Hard ceiling: `2.5%`).
- `MAX_DAILY_DRAWDOWN_LIMIT_PCT`: Default `3.0%` (Triggers immediate Portfolio Kill Switch).
- `MIN_DATA_QUALITY_SCORE`: Default `70/100` (Trades blocked below this threshold).
- `MIN_REGIME_CONFIDENCE`: Default `0.60` (Transitions to No-Trade condition below 60%).
- `DEFAULT_EXECUTION_MODE`: `PAPER` (Switchable to `SHADOW` or `LIVE` upon user confirmation).
