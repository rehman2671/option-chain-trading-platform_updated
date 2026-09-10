# Option Chain Trading Platform (DeltaChain AI)

Institutional-grade multi-asset algorithmic trading, quantitative analytics, options Greeks engine, and execution ecosystem for Indian markets (**NSE Indices**, **Stock Derivatives**, and **MCX Commodities**).

---

## 🌟 Executive Overview

DeltaChain AI is an end-to-end trading workstation combining high-frequency market data streaming, mathematical quantitative analytics, automated strategy execution, and multi-leg risk management. 

* **Full-Stack Architecture**: Modern TypeScript stack powered by Express, Vite, React 19, and Tailwind CSS.
* **Dual Database Engine**: Robust SQLite persistence configured with Write-Ahead Logging (WAL) mode, ACID transactions, chunked cleanup pruning, and automated schema migrations.
* **Ultra-Low Latency Streaming**: Upstox API v3 Protobuf WebSocket binary stream (`MarketDataFeedV3.proto`) with sub-second tick ingestion and seamless fallback feeds.
* **Zero-Manual Daily Authentication**: Automated morning TOTP authentication loop for Upstox API v3 eliminating manual browser logins.
* **Institutional Quant Suite**: Real-time strategy tournament ranking, regime classification, net dealer gamma exposure (GEX), 3D IV surfaces, and automated position defense.
* **AI Market Narrator**: Server-side Google Gemini AI integration for live market sentiment decomposition, strike-level risk alerts, and macro commentary.
* **Security & Fail-Fast Hardening**: Strict environment-variable-only secrets enforcement (`JWT_SECRET`, `UPSTOX_*`, `TELEGRAM_*`, `GEMINI_API_KEY`) with no insecure hardcoded fallbacks.

---

## 🏗️ Architecture & Technology Stack

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           REACT 19 FRONTEND                             │
│  Tailwind CSS • Recharts • Lightweight Charts • Lucide Icons • Context  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ HTTP / REST & SSE / WebSocket
┌────────────────────────────────────▼────────────────────────────────────┐
│                    EXPRESS + VITE FULL-STACK SERVER                     │
│                        (port 3000 / host 0.0.0.0)                       │
├───────────────────┬───────────────────┬─────────────────────────────────┤
│  QUANT ENGINE     │  EXECUTION ENGINE │       MARKET FEED ENGINE        │
│  • Regime Filter  │  • Auto Runner    │  • Upstox V3 Protobuf WS        │
│  • Gamma (GEX)    │  • Paper Terminal │  • Yahoo / NSE Fallback Feed    │
│  • Tournament     │  • Basket Router  │  • Fast-Poll Shock Detector     │
│  • Risk / Monte   │  • Margin SPAN    │  • Canonical Instrument Config  │
├───────────────────┴───────────────────┴─────────────────────────────────┤
│                          PERSISTENCE & SECURITY                         │
│   SQLite (WAL Mode) • Auto-Indexes • Chunked Pruner • JWT Auth • TOTP   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🧩 The 12 Core Application Modules

DeltaChain AI features a modular interface organized into 12 dedicated functional views accessible via the navigation header:

### 1. 🧭 AI Platform (5 Trading Pillars)
A unified multi-asset trading console structured across 5 distinct trading horizons:
* **Pillar 1: Equity Intraday**: Scalping and breakout models combining VWAP, SuperTrend, dynamic ATR trailing bands, and order-book momentum.
* **Pillar 2: Swing Trading**: Multi-day delivery setups based on Relative Strength (RS), 20/50 EMA pullbacks, and institutional volume expansion.
* **Pillar 3: Long-Term & Positional**: Fundamental quality filters, balance sheet growth metrics, and systematic compounding portfolios.
* **Pillar 4: F&O Derivatives**: Advanced options income strategies (Iron Condors, Short Straddles, Calendar Spreads, Delta-Neutral adjustments).
* **Pillar 5: MCX Commodities**: Institutional commodity trading engine covering **Crude Oil**, **Gold**, **Silver**, **Natural Gas**, and **Copper** with contract lot sizes, tick movements, and expiry rollover management.

### 2. 🧠 Quant Intelligence Engine
A comprehensive quantitative trading architecture inspired by institutional hedge funds:
* **Market Regime Classification**: Identifies market states (*Bullish Trending*, *Bearish Trending*, *Mean-Reverting / Rangebound*, *Volatile Expansion*, *Quiet Drift*) using volatility, trend strength, and Hurst exponents.
* **Net Dealer Gamma Exposure (GEX)**: Calculates aggregate gamma per strike, pinpointing **Gamma Flip Levels** and critical market maker hedging acceleration zones.
* **3D Volatility Surface & Skew**: Real-time Implied Volatility smile, term structure, skew curvature, and 25-delta risk reversals.
* **Institutional Option Flow**: Algorithmic detector for smart-money blocks, sweep orders, and aggressive strike accumulation.
* **Real-Time Strategy Tournament**: Continuously evaluates and ranks candidate strategies based on real-time market regime, expected value, and risk-adjusted metrics.
* **No-Trade Filter Engine**: Automatically halts execution when edge deteriorates due to high bid-ask spreads, low liquidity, or event binary risk.
* **Adaptive Position Defense**:
  * *Dynamic Delta Hedger*: Adjusts underlying or option wings to neutralize delta risk.
  * *Roll Engine*: Manages time-decay rollouts and strike adjustments.
  * *Profit Lock Engine*: Tiered trailing profit protection.
  * *Recovery Engine*: Repairs broken wings into synthetic iron flies or calendar structures.
* **Research & Statistical Validation**:
  * *Monte Carlo Simulation*: Generates 1,000+ path permutations to assess ruin probability and drawdown distributions.
  * *Walk-Forward Optimization*: Validates strategy stability across in-sample and out-of-sample periods.
  * *Overfit Detection*: Calculates Probability of Backtest Overfitting (PBO) and Deflated Sharpe Ratio.

### 3. 📻 15-Minute EMA Strategy Engine
An institutional trend-following system optimized for high-probability setups:
* **23 EMA / 50 EMA Analytical Model**: Strictly triggered upon confirmed 15-minute candle closes across NIFTY 50, BANK NIFTY, and SENSEX.
* **Deterministic Simulated Crossover**: Built-in test sandbox to verify Bullish/Bearish signal detection, payload generation, and notification delivery without waiting for market hours.
* **Automated Notification Dispatch**: Real-time trade alert delivery via Telegram bot channels and custom Webhooks.
* **Automated Paper Execution**: 1-click or automated bridge into the Paper Trading Terminal with pre-calculated stop-loss, risk:reward targets, and lot sizing.
* **Optimized MTM Engine**: Transaction-batched Mark-to-Market P&L calculations and single-query SQL aggregation for paper trade summaries.

### 4. 📊 Real-Time Option Chain & Greeks
* **Supported Underlyings**:
  * Major Indices: **NIFTY 50**, **BANK NIFTY**, **FIN NIFTY**, **MIDCP NIFTY**, **SENSEX**.
  * Top F&O Stocks: **RELIANCE**, **TCS**, **HDFC BANK**, **TATA MOTORS**, **INFY**, **SBIN**, **ICICI BANK**.
  * MCX Commodities: **GOLD**, **CRUDE OIL**, **SILVER**, **NATURAL GAS**, **COPPER**.
* **Deterministic Black-Scholes Formula**:
  * High-precision calculation of Delta ($\Delta$), Gamma ($\Gamma$), Theta ($\Theta$), Vega ($\nu$), and Rho ($\rho$).
  * Implied Volatility (IV) resolved via fast Newton-Raphson numerical bisection.
* **Chain Visualization**: Real-time Put-Call Ratio (PCR), Max Pain strike calculation, volume/OI heatmaps, In-The-Money (ITM) / Out-of-The-Money (OTM) shading, and multi-expiry picker.

### 5. 🥞 Strategy Builder & Dynamic Payoff Graph
* **Multi-Leg Visual Builder**: Construct custom option strategies up to 8 legs with Buy/Sell actions, Call/Put types, and customizable quantities.
* **Pre-Built Strategy Templates**: Instant 1-click generation of:
  * Bull Call Spread / Bear Put Spread
  * Bull Put Spread / Bear Call Spread
  * Short Straddle / Long Straddle
  * Short Strangle / Long Strangle
  * Iron Condor / Iron Butterfly
  * Jade Lizard / Ratio Spreads
* **Dynamic Payoff Diagram**: Interactive SVG chart mapping net P&L across a wide underlying spot price range.
* **Risk Metrics**: Instant display of Breakeven Points, Maximum Profit, Maximum Loss, Net Debit/Credit, and Margin Requirement.

### 6. 📈 Open Interest (OI) & Skew Analytics
* **OI Change Distribution**: Visual breakdown of fresh Call/Put writing vs. short covering across strikes.
* **Historical PCR Dynamics**: Tracks PCR trends to identify overbought/oversold inflection points.
* **Institutional Anomaly Scanner**: Flags abnormal volume-to-OI spikes and unusual block transactions.
* **Event-Reactive Fast-Poll**: Automatically accelerates polling frequency to sub-second intervals upon detecting sudden spot price shocks.

### 7. ⚡ Basket Orders Manager
* **Atomic Multi-Leg Routing**: Executes multi-leg combinations simultaneously to eliminate leg-out execution risk.
* **Margin Optimization**: Leverages exchange-grade SPAN + Exposure margin calculations, reflecting cross-margin hedging benefits.
* **Order Reconciliation**: Real-time status tracking (*PENDING*, *EXECUTED*, *REJECTED*, *CANCELLED*).

### 8. 🤖 Autonomous Strategy Runner
* **Rule-Based Algorithmic Execution**: Configurable automated strategy runners that trigger entries and exits based on quantitative signals.
* **Risk Circuit Breakers**:
  * Daily Maximum Drawdown cutoff.
  * Consecutive Loss breaker.
  * Master Emergency Kill Switch with instant market-wide position liquidation.

### 9. 🎮 Paper Trading Virtual Terminal
* **Isolated Virtual Accounts**: ₹10,00,000 default virtual capital per user.
* **Multi-Leg Lifecycle Tracking**: Groups legs into coherent strategy entities (e.g., "Iron Condor #102").
* **Live Mark-to-Market (MTM)**: Continuous real-time P&L updates based on streaming tick quotes with transaction-level write batching.
* **Safe Pagination**: Paginated portfolio position queries (`limit` and `offset` support with upper bounds) for high-volume historical trade review.
* **Group Square-Off**: Close all legs of a complex spread simultaneously with a single click.

### 10. ⏳ Quantitative Backtester
* **Multi-Leg Historical Testing**: Simulate complex options and directional strategies over historical intraday and EOD datasets.
* **Performance Reporting**: Comprehensive analytics including Equity Curves, Maximum Drawdown, Sharpe Ratio, Sortino Ratio, Profit Factor, and Win/Loss Ratios.
* **Execution Realism**: Accounts for slippage, bid-ask spreads, and statutory transaction costs.

### 11. 🧠 AI Market Narrator (Gemini Integration)
* **Real-Time Context Synthesis**: Translates complex options math and flow data into natural, human-readable commentary using Google Gemini models.
* **Risk Warnings**: Identifies dangerous gamma exposure clusters and potential short-squeeze triggers.
* **Macroeconomic Alignment**: Synthesizes market action in the context of RBI policy, global indices, and corporate earnings.

### 12. 🗄️ Database & Schema Portal
* **Automated SQLite Engine**: Fast transactional disk storage running in WAL mode with auto-applied migrations.
* **Interactive Schema Inspector**: View live database tables, indexes, column constraints, and active connections.
* **Performance Indexes**: Pre-configured compound indexes for zero-lag querying across millions of ticks and paper trades.
* **DDL Export**: 1-click export of SQL schemas for external deployment or backup.

---

## ⚡ Recent Architecture & Performance Improvements

The platform has recently undergone substantial core optimizations:

1. **Multi-User `activeView` Session Isolation**:
   * Migrated server-side symbol tracking from a global variable to a session-keyed `Map` with automatic TTL expiration (30-minute stale cleanup).
   * Prevents cross-tab and multi-user view interference in high-concurrency environments.

2. **Database Performance & Chunked Pruning**:
   * **Chunked Batch Pruning**: Implemented chunked deletions (1,000 rows per loop) in `pruneOldSnapshots` to prevent long table locks during snapshot compaction.
   * **Non-Blocking WAL Compaction**: Automated 2-minute compactor prevents file bloating while preserving market feed write throughput.
   * **Compound Indexes**: Added auto-indexes on `ema_paper_trades (status, net_pnl)`, `ema_paper_trades (status, exit_timestamp)`, `ticks (timestamp)`, and `option_chains (created_at)`.
   * **Query Clamping & Safety**: Applied strict bounds to all data endpoints (`getHistoricalTicks`, `loadAllPaperPositions`, `getAutonomousLogs`, `getEma15mSignals`, `getEmaNotificationLogs`) to prevent unbounded queries from exhausting container memory.
   * **SQL Aggregation**: Refactored `getEmaPaperTradingSummary` from in-memory array filtering to a single optimized SQLite aggregate query.

3. **High-Frequency MTM Batching**:
   * Replaced per-trade single updates with atomic SQLite transaction batching (`batchUpdateEmaPaperTrades`), reducing I/O friction during rapid market tick bursts.

4. **Canonical Instrument Single Source of Truth**:
   * Consolidated duplicate hardcoded symbol lists into `src/shared/marketConfig.ts`, defining complete contract specs, lot sizes, step sizes, and asset classifications for all 16 supported instruments.

5. **Security Hardening**:
   * Removed insecure fallback strings from `JWT_SECRET` and Telegram notification credentials.
   * Server performs fail-fast verification on startup to ensure all critical environment variables are declared.

---

## 🔌 Broker Integration Guide

DeltaChain AI exclusively supports **Upstox API v3** for live market data and trading.

### Upstox API v3 (High-Speed Protobuf Streaming)

DeltaChain AI implements Upstox's latest **Protobuf V3 WebSocket API** for streaming market ticks with sub-second latency:

1. **Create an Upstox Developer App**:
   * Navigate to the [Upstox Developer Portal](https://service.upstox.com/developer/).
   * Create an application and obtain your `API Key` and `API Secret`.
   * Set the Redirect URL to: `http://localhost:3000/api/upstox/callback` (or your production URL).

2. **Automated Morning TOTP Login (Zero-Manual Daily Token)**:
   * To automatically regenerate the access token daily without browser login, configure your Upstox credentials in `.env`:
     ```env
     UPSTOX_API_KEY="your_api_key"
     UPSTOX_API_SECRET="your_api_secret"
     UPSTOX_REDIRECT_URI="http://localhost:3000/api/upstox/callback"
     UPSTOX_MOBILE_NO="your_registered_mobile_no"
     UPSTOX_PIN="your_6_digit_pin"
     UPSTOX_TOTP_SECRET="your_authenticator_totp_secret_key"
     ```
   * The platform's internal scheduler automatically executes the TOTP login sequence at market open.

3. **Manual 1-Click Browser Login**:
   * Alternatively, click the **"CONNECT UPSTOX"** button in the top navigation bar.
   * Authorize with Upstox, and you will be redirected back to the active session.

---

## 📡 REST API Reference

The server exposes comprehensive RESTful endpoints under `/api/*`:

| Category | Endpoint | Method | Description |
|---|---|---|---|
| **System** | `/api/health` | `GET` | System heartbeat, uptime, and timestamp |
| **System** | `/api/system/health` | `GET` | Detailed engine subsystem status |
| **System** | `/api/system/margin` | `GET` | Current user available margin and source |
| **Market Data** | `/api/option-chain` | `GET` | Live option chain with Black-Scholes Greeks |
| **Market Data** | `/api/anomalies` | `GET` | Detected open interest anomalies & volume spikes |
| **Market Data** | `/api/event-reactive-state`| `GET` | Market shock state and institutional bias |
| **Upstox** | `/api/upstox/status` | `GET` | Upstox OAuth session and token validity |
| **Upstox** | `/api/upstox/streamer-status`| `GET` | Protobuf V3 WebSocket connection & tick metrics |
| **Upstox** | `/api/upstox/login` | `GET` | Initiates Upstox OAuth authorization flow |
| **5 Pillars** | `/api/platform/taxonomy` | `GET` | Metadata for the 5 trading pillars |
| **5 Pillars** | `/api/platform/signals` | `GET` | Active algorithmic signals across all pillars |
| **5 Pillars** | `/api/platform/execute-signal`| `POST` | Dispatches signal directly to execution engine |
| **15m EMA** | `/api/ema15m/status` | `GET` | 15m EMA engine state and active instruments |
| **15m EMA** | `/api/ema15m/candles` | `GET` | Historical 15m candlestick feed with EMA values |
| **15m EMA** | `/api/ema15m/signals` | `GET` | Historical crossover signals (`limit` clamped) |
| **15m EMA** | `/api/ema15m/paper-trades` | `GET/POST`| Manages 15m EMA automated paper positions |
| **15m EMA** | `/api/ema15m/paper-summary`| `GET` | Fast single-query SQL aggregation of paper P&L |
| **15m EMA** | `/api/ema15m/trigger-mock` | `POST` | Simulates test bullish/bearish crossover |
| **Quant** | `/api/quant/health` | `GET` | Quant intelligence engine health check |
| **Quant** | `/api/quant/regime` | `GET` | Current market regime classification |
| **Quant** | `/api/quant/gamma-exposure` | `GET` | Net dealer gamma (GEX) profile & flip levels |
| **Quant** | `/api/quant/iv-surface` | `GET` | 3D IV surface, skew, and smile metrics |
| **Quant** | `/api/quant/tournament` | `GET` | Live strategy tournament ranking |
| **Quant** | `/api/quant/monte-carlo` | `POST` | Run 1,000+ path Monte Carlo risk simulation |
| **Quant** | `/api/quant/walk-forward` | `POST` | Run Walk-Forward statistical optimization |
| **Paper Trading**| `/api/paper-trading/portfolio`| `GET` | Virtual capital ledger, positions (`limit`/`offset`) |
| **Paper Trading**| `/api/paper-trading/start` | `POST` | Opens new paper positions / multi-leg orders |
| **Paper Trading**| `/api/paper-trading/close/:id`| `POST` | Closes single paper leg with indexed retrieval |
| **Paper Trading**| `/api/paper-trading/close-group`| `POST`| Squares off an entire multi-leg strategy group |
| **Paper Trading**| `/api/paper-trading/reset` | `POST` | Resets virtual account back to initial ₹10 Lakhs |
| **Basket** | `/api/basket/execute` | `POST` | Executes multi-leg basket orders |
| **Basket** | `/api/basket/list` | `GET` | Retrieves basket execution history |
| **Autonomous**| `/api/autonomous/status` | `GET` | Autonomous runner state and circuit breakers |
| **Autonomous**| `/api/autonomous/logs` | `GET` | Execution logs with bounded limit |
| **Autonomous**| `/api/autonomous/kill-switch`| `POST` | Emergency trigger to close all active strategies |
| **Backtester** | `/api/backtest/run` | `POST` | Executes historical options backtest |
| **AI Narrator**| `/api/ai/narrate` | `POST` | Generates Gemini AI market narrative commentary |
| **Database** | `/api/db/schema` | `GET` | SQLite table definitions, indexes, and stats |
| **Database** | `/api/db/export-ddl` | `GET` | Exports complete database DDL schema |

---

## 🔒 Security, Authentication & Multi-Tenancy

* **Session Management**: Secure, HTTP-only JWT cookies ensure session persistence and CSRF protection.
* **Google OAuth 2.0**: Optional 1-click Google Sign-In (`GOOGLE_CLIENT_ID`).
* **Email Verification**: Transactional email verification and password reset via Hostinger SMTP.
* **Guest & Practice Mode**: Full platform access available in guest mode with isolated in-memory/session state.
* **Server-Side API Keys**: Broker secrets (`UPSTOX_API_SECRET`, `UPSTOX_TOTP_SECRET`) and AI keys (`GEMINI_API_KEY`) reside strictly on the server and are never exposed to the client.
* **Fail-Fast Startup**: System verifies required credentials on boot and logs clear instructions if any secret is missing.

---

## 🚀 Getting Started

### Prerequisites
* **Node.js**: Version 18.x or higher (Node 20+ recommended)
* **Package Manager**: `npm`

### Environment Configuration
Copy `.env.example` to `.env` and configure your API credentials:
```bash
cp .env.example .env
```

### Installation
Install project dependencies:
```bash
npm install
```

### Running Development Server
Start the full-stack development server (Express backend + Vite client on port `3000`):
```bash
npm run dev
```
Open your browser and navigate to:
```
http://localhost:3000
```

### Production Build & Launch
Compile the production bundle and start the server:
```bash
npm run build
npm run start
```

---

## ⌨️ Keyboard Shortcuts & Pro-Tips

* **Toggle Header / Focus Mode (`H`)**: Press `H` anytime to instantly collapse the navigation bar and expand charts and option chains to maximum screen height.
* **Sticky Header Pin**: Use the **"Frozen (Sticky)"** toggle in the top bar to keep market tickers and critical indicators pinned while scrolling deep option chains.
* **Fast Market Refresh**: Press the refresh icon or use automated fast-poll to capture instant quotes during high-volatility events.

---

## 📜 License
Private & Proprietary. Developed for algorithmic options trading and institutional quantitative research.
