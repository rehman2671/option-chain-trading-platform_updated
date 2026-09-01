# Manual Testing Checklist — Hybrid Practice & Kite Live Modes

This document provides step-by-step verification instructions for testing **Delta Chain** in both **Practice Mode** (free Yahoo Spot + NSE Option Chain) and **Live Mode** (Zerodha Kite Connect REST/WebSocket).

---

## Section A — Practice Mode Testing (`DATA_PROVIDER=practice`)

> **Goal:** Validate that the application functions completely for backtesting, strategy building, paper trading, and analytics without needing any broker credentials or paid API keys.

### A.1 Startup & Health Check
- [ ] Set `DATA_PROVIDER=practice` in `.env` (or leave as default).
- [ ] Start application server: `npm run dev`.
- [ ] Query system health endpoint:
  ```bash
  curl http://localhost:3000/api/system/health
  ```
- [ ] Verify `mode` is `"PRACTICE"`.
- [ ] Verify `connectionStatus.subSources.yahooSpot` is `true` and `nseOptionChain` is `true`.
- [ ] Verify database `rowCounts` reflect SQLite table records.

### A.2 Real Spot Price Verification (Yahoo Finance)
- [ ] Open Option Chain tab for `NIFTY`.
- [ ] Confirm Spot Price matches live NIFTY index on Yahoo Finance within standard ~15s delay (e.g., ~24,800+).
- [ ] Switch symbol to `BANKNIFTY`, `RELIANCE`, `TCS`, `HDFCBANK`.
- [ ] Confirm spot prices update dynamically without returning fixed or fabricated constants.

### A.3 Option Chain Data Verification (NSE Endpoint)
- [ ] Inspect strike rows around ATM for `NIFTY`.
- [ ] Confirm Call (CE) and Put (PE) LTP, Open Interest (OI), Change in OI, and Volume are populated from NSE's official option chain endpoint.
- [ ] Confirm Black-Scholes Greeks ($\Delta, \Gamma, \Theta, \nu$) are computed dynamically using the real spot price and calculated implied volatility (IV).
- [ ] Confirm OI Buildup tags (Long Buildup, Short Covering, etc.) reflect real change in price and change in OI.

### A.4 Structural Safety Guard Verification (Paper Execution Only)
- [ ] Set `DRY_RUN=false` in `.env` while keeping `DATA_PROVIDER=practice`.
- [ ] Restart server and attempt to submit a Basket Order from the **Basket Orders** tab.
- [ ] Verify order execution succeeds as a paper order and logs:
  `[PRACTICE MODE] Paper order execution. No real orders sent to exchange.`
- [ ] Confirm that NO attempt is made to call Zerodha `placeOrder` or broker APIs.
- [ ] Check SQLite table `paper_positions` to confirm paper trade persistence:
  ```sql
  SELECT * FROM paper_positions ORDER BY opened_at DESC;
  ```

### A.5 Active View Polling Load Reduction
- [ ] Inspect server console logs during UI navigation.
- [ ] Confirm that active viewed symbol/expiry receives high-frequency updates (every 3s), while non-active background symbols poll at reduced frequency (every 30s).
- [ ] Verify changing expiry in dropdown triggers `POST /api/system/active-view` and updates active polling target.

---

## Section B — Live Mode Testing (`DATA_PROVIDER=kite`)

> **Goal:** Validate real-time WebSocket streaming, Zerodha Kite Connect session management, live market feed, real margin calculations, and sequenced basket order execution.

### B.1 Credentials Setup & Authentication
- [ ] Set environment variables in `.env`:
  ```env
  DATA_PROVIDER=kite
  KITE_API_KEY=your_api_key
  KITE_API_SECRET=your_api_secret
  KITE_ACCESS_TOKEN=your_daily_access_token
  DRY_RUN=true # Start in Dry Run mode first
  ```
- [ ] Navigate to `http://localhost:3000/api/kite/callback` or complete Zerodha OAuth login flow.
- [ ] Verify access token generation page displays token cleanly and provides step-by-step guidance.

### B.2 System Health & WebSocket Connection
- [ ] Query system health endpoint:
  ```bash
  curl http://localhost:3000/api/system/health
  ```
- [ ] Confirm `mode` is `"LIVE"`.
- [ ] Confirm `connectionStatus.overallConnected` is `true`.
- [ ] Confirm `websocket.enabled` is `true` and `websocket.connected` is `true`.

### B.3 Real-Time Ticker Streaming
- [ ] Open Option Chain tab.
- [ ] Observe live price updates for NIFTY / BANKNIFTY / stock underlyings.
- [ ] Confirm ticks arrive via `KiteTicker` WebSocket without needing full page reloads.
- [ ] Confirm tick records are inserted into SQLite `ticks` table.

### B.4 Real Pre-Trade Margin Gate Check
- [ ] Navigate to **Basket Orders** tab.
- [ ] Build a 4-leg Iron Condor or Straddle strategy.
- [ ] Click **Check Margin Requirement**.
- [ ] Confirm Zerodha `orderMargins` / `basketMargins` API is invoked and returns real SPAN + Exposure margin requirements and hedge benefit discounts.
- [ ] Confirm safety cushion calculation matches configured cushion percentage (default 12%).

### B.5 Sequenced Basket Execution (Dry Run vs Real Execution)
- [ ] **Dry Run Test (`DRY_RUN=true`):**
  - Execute Basket Order.
  - Confirm order sequence places risk-reducing Long (BUY) legs before Short (SELL) legs.
  - Confirm execution logs verify simulated fills with zero exchange risk.
- [ ] **Real Live Execution Test (`DRY_RUN=false`):**
  - *Caution:* Only perform during active market hours with deliberate small test orders.
  - Execute Basket Order.
  - Confirm real Zerodha `order_id` is returned for each leg.
  - Confirm order status polling (`COMPLETE` / `REJECTED`) reconciles state into SQLite `basket_orders`.

---

## Section C — Fail-Closed Safety Verification

- [ ] Unset `KITE_ACCESS_TOKEN` while `DATA_PROVIDER=kite`.
- [ ] Observe system behavior:
  - App displays explicit disconnected banner: *"Broker disconnected — live data unavailable"*.
  - Option chain cells show explicit unavailable / disconnected state — NO fabricated or constant numbers.
  - Pre-trade margin gate blocks execution with recommendation: *"ORDER BLOCKED: Broker not connected"*.

---

## Section D — Paper Trading & Multi-Leg Strategy Lifecycle (Phase M)

> **Goal:** Validate end-to-end multi-leg paper trading strategy creation, multi-leg grouping, real-time MTM calculations with strict contract availability gates, individual & group square-off triggers, and capital reset.

### D.1 Multi-Leg Strategy Execution from Strategy Builder
- [ ] Navigate to **Strategy Builder** tab for `NIFTY`.
- [ ] Load a multi-leg preset (e.g., Short Straddle or Iron Condor) or manually select 2–4 legs.
- [ ] Verify each leg has valid `currentLtp` populated as `entryPrice`.
- [ ] Click **Paper Trade Strategy**.
- [ ] Confirm inline banner displays success with generated `Group ID` (e.g., `group-1738...`).
- [ ] Confirm leg selection in builder is cleared on successful execution.

### D.2 Paper Trading Terminal & Grouped Position Tracking
- [ ] Navigate to **Paper Trading** terminal tab.
- [ ] Confirm active positions are displayed cleanly grouped under their `strategyGroupId` and `strategyName`.
- [ ] Verify each leg displays its custom `legLabel` (e.g., `SELL CE 24800`), `entryPrice`, `currentPrice`, `lotSize`, and `pnl`.
- [ ] Confirm portfolio summary shows accurate Total MTM (P&L), Realized P&L, Used Virtual Margin (calculated via SPAN/Basket engine), and Available Virtual Margin.

### D.3 MTM Fail-Closed Gate & Real-Time Price Engine
- [ ] Observe position MTM updates as tick/option chain data streams.
- [ ] Verify MTM update loop skips calculation (`isAvailable = false`) if `contract.available` or `contract.ltpAvailable` is not strictly `true`.
- [ ] Confirm P&L for BUY legs is `(currentPrice - entryPrice) * quantity` and for SELL legs is `(entryPrice - currentPrice) * quantity`.

### D.4 Stop-Loss and Target Price Auto-Exits
- [ ] Set a tight Stop-Loss or Target Price on an open position.
- [ ] Trigger price movement in market feed.
- [ ] Confirm position status updates to `CLOSED` with `exitPrice` set to `currentPrice` and `close_reason` logged as `'Stop Loss Hit'` or `'Target Price Hit'`.

### D.5 Individual Leg and Group Square Off
- [ ] Click **Square Off Leg** on an individual leg in an open group.
- [ ] Verify only that leg closes with `status = 'CLOSED'` while remaining legs stay `OPEN`.
- [ ] Click **Square Off Entire Group** on a multi-leg strategy group.
- [ ] Verify all open legs in the group transition to `CLOSED` in a single transaction with `exit_price` recorded in SQLite `paper_positions`.

### D.6 Account Virtual Capital Reset
- [ ] Click **Reset Paper Account** button in Paper Trading terminal.
- [ ] Confirm confirmation prompt appears.
- [ ] Confirm virtual capital resets to ₹10,00,000, all open and closed positions are deleted from SQLite `paper_positions`, and portfolio summary reflects clean zero state.

