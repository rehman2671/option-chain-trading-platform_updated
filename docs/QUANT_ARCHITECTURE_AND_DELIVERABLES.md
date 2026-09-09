# QUANT INTELLIGENCE MODULE — ARCHITECTURE & DELIVERABLES (v2)

This document formalizes the autonomous quantitative trading, statistical research, and adaptive recovery architecture implemented in `src/quant/`.

---

## 1. High-Level Architecture
The module operates as an independent, non-intrusive quantitative layer wrapping the existing platform:

```text
               Upstox Market Data (WebSocket / REST)
                              │
                              ▼
                  Data Intelligence Layer
         (DataQualityEngine, ContractMaster, ExpiryResolver)
                              │
                              ▼
                     Feature Engine (12)
      (Price, Volume, OI, IV, Greeks, Futures, Time Features)
                              │
                              ▼
                     Intelligence Layer
   ┌──────────────────────────┼──────────────────────────┐
   │                          │                          │
   ▼                          ▼                          ▼
Regime Engine           IV Surface Engine          Option Flow & Gamma
(17 Regimes)            (Skew, Fly, Term)          (Walls, Unwinding)
   │                          │                          │
   └──────────────────────────┼──────────────────────────┘
                              │
                              ▼
                     Multi-Timeframe Engine (14)
          (8-Timeframe Confluence: 1m to Daily/Weekly)
                              │
                              ▼
                   Strategy Tournament (23)
       (Expectancy, Profit Factor, Sharpe, Max DD, OOS, Monte Carlo)
                              │
                              ▼
                    Meta & Decision Engine (71)
            ┌─────────────────┴─────────────────┐
            ▼                                   ▼
       TRADE ACTION                         NO TRADE (24)
            │                                   │
            ▼                                   ▼
  Strike Selection (25) &                Capital Preserved
  Expiry Selection (26) &                Safe Default (83)
  Position Sizing (27)
            │
            ▼
    Portfolio Risk & Stress Engine (28-29)
            │
            ▼
   Execution Adapter (Paper / Shadow / Live)
            │
            ▼
  Adaptive Position Monitor & Recovery Engine (30-32)
  (HOLD / REDUCE / EXIT / HEDGE / ROLL / CONVERT / REVERSE)
```

---

## 2. Directory Structure (`src/quant/`)
```text
src/quant/
├── adapters/            # Upstox WebSocket/REST, Position, Margin, Order adapters
├── api/                 # REST API router (61 comprehensive quantitative endpoints)
├── audit/               # Audit logger for immutable decisions and experiments
├── config/              # Centralized configuration registry with statutory defaults
├── data/                # DataQualityEngine, ContractMaster, ExpiryResolver, HistoricalStore
├── decision/            # Tournament, MetaStrategy, Strike/Expiry, Sizing, NoTrade, Shadow
├── events/              # Centralized QuantEventBus (EventEmitter pattern)
├── features/            # Comprehensive 30+ feature generation engine
├── intelligence/        # Regimes, Multi-Timeframe, IV Surface, Flow, Gamma, Analogues
├── learning/            # StrategyHealth, ModelDrift, Calibration, ContinuousResearch
├── position/            # PositionMonitor, Recovery, Conversion, Hedge, Roll, ProfitLock
├── research/            # Backtest, WalkForward, MonteCarlo, QualityGates, TimeOfDay, Stability
├── risk/                # PortfolioRisk, StressEngine, DrawdownController, KillSwitch
├── signals/             # Quantitative signal generator
├── strategies/          # Canonical strategies across 5 core families
├── tests/               # Unit, Integration, Replay, and API Contract test suite
└── types.ts             # Shared TypeScript type definitions
```

---

## 3. Strategy Families & Canonical Library
1. **Directional**: Long Call, Long Put, Bull Call Spread, Bear Put Spread.
2. **Neutral**: Iron Condor, Iron Fly, Short Straddle, Short Strangle, Butterfly.
3. **Volatility**: Long Straddle, Calendar Spreads, Diagonals, Ratio Backspreads.
4. **Adaptive**: VWAP + OI Breakouts, Dynamic Delta Hedge, Gamma Scalping.

---

## 4. Multi-Timeframe Confluence (Section 14)
The engine analyzes 8 simultaneous timeframes:
- **1m, 3m, 5m, 15m, 30m, 1h, Daily, Weekly**
- Measures trend alignment, momentum acceleration, VWAP equilibrium, market structure (HH/HL/LH/LL), volatility state, and open interest accumulation.
- Computes an aggregate **Multi-Timeframe Confluence Score (0–100)** and categorical consensus (`STRONG_BULLISH` to `STRONG_BEARISH`).

---

## 5. Strike, Expiry & Sizing Optimization (Sections 25–27)
- **Strike Selection**: Optimizes based on Delta (ATM/Wings), Open Interest call/put walls, and Expected Move bands.
- **Dynamic Expiry**: Evaluates 0DTE, 1DTE, weekly, and monthly expiries factoring in theta bleed velocity and gamma sensitivity.
- **Position Sizing**: Risk-budgeted allocation via Quarter-Kelly fraction, ATR stop scaling, and drawdown dampeners. Prevents martingale or loss-chasing.

---

## 6. Research Quality Gates (Section 89)
To be approved for production, all strategies must pass 11 mandatory statistical gates:
1. Sample Size $\ge 100$ trades
2. Net Profitability $> 0$ INR
3. Positive Expectancy $\ge +0.20R$
4. Maximum Drawdown $\le 20\%$
5. Net Profit Factor $\ge 1.30$
6. Annualized Sharpe Ratio $\ge 1.00$
7. Walk-Forward Windows Passed $\ge 4$
8. Out-of-Sample Sharpe Retention $\ge 70\%$
9. Monte Carlo Ruin Probability $\le 1.0\%$
10. Parameter Stability Plateau Width $\ge 60\%$
11. Data Quality Score $\ge 85/100$
