# DEPLOYMENT, SECURITY & AUDIT SPECIFICATION (v2)

This document specifies the operational guidelines, security constraints, and auditing protocols for the PRO QUANT V2 system.

---

## 1. Deployment Topology
The system supports dual operational profiles to isolate computational loads:

### Profile A: Core / Live Ingestion & Execution Service
- **Role**: Handles real-time WebSocket market feeds from Upstox, feature calculation, regime evaluation, portfolio risk monitoring, and order execution.
- **Port**: 3000 (standard reverse proxy entry point).
- **Resource Priority**: Low-latency, deterministic event loop, no blocking file writes or synchronous CPU-heavy jobs.

### Profile B: Async Research & Simulation Worker
- **Role**: Performs heavy multi-year historical backtests, Monte Carlo simulations (10,000+ paths), walk-forward optimizations, and parameter stability sweeps.
- **Isolation**: Runs asynchronously via worker threads or separate compute tasks, ensuring live trading execution is never starved of CPU or event-loop cycles.

---

## 2. Security & Credentials Architecture
- **No Client-Side Secrets**: All broker API keys, API secrets, redirect URIs, and database connection strings reside exclusively in server-side environment variables.
- **Environment Declarations**:
  - `UPSTOX_API_KEY`: Upstox Developer App Key (Server-only).
  - `UPSTOX_API_SECRET`: Upstox Developer App Secret (Server-only).
  - `UPSTOX_REDIRECT_URI`: Broker OAuth callback URL.
  - `GEMINI_API_KEY`: AI Studio / Gemini API key for quantitative insights and explanations.
- **Readiness Check**: If credentials are unset or invalid, the system automatically falls back to paper/sandbox mode without throwing fatal boot exceptions.

---

## 3. Immutable Quantitative Auditing (Section 84 & Part B8)
All trading actions, automated risk overrides, and quantitative experiments produce structured JSON audit records:
- **Event Logging**: Captures every entry, exit, stop adjustment, thesis invalidation, and kill switch trigger with microsecond timestamps and input snapshots.
- **Decision Traceability**: Every generated order includes the ID of the winning strategy, the active regime state, expected value, and sizing formula inputs.
- **Model Drift Tracking**: Strategy health engine logs degradation in rolling win rate, Sharpe decay, and market regime transitions for post-trade review.

---

## 4. Automated Testing & Verification
The system includes full test suites covering unit logic, end-to-end integration, deterministic replay, and API contracts:

```bash
# Run all automated quantitative tests
npm test

# Run build & compilation check
npm run build

# Run TypeScript static analysis
npm run lint
```
