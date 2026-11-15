# EMA15M Adaptive Swing v2 — Phase 1 & 2 (RESEARCH ONLY)

Branch: `codex`. **The existing live/paper EMA23/50 execution rules are NOT changed by this phase.**

## What is running

The protected API `GET /api/ema15m/adaptive-preview?instrument=NIFTY` returns a market
regime assessment; when a directional research candidate exists, it also fetches
verified Upstox-listed option contracts and read-only option-chain quotes for
1W/2W/4W/8W *expiry buckets*. `bias=BULLISH|BEARISH` previews a hypothetical
CE/PE scenario even when the market is marked NO_TRADE. It never authorizes
or sends broker BUY/SELL orders. The dashboard's **Adaptive Research (Preview)**
tab shows this data on demand.

Allowed symbols: NIFTY, BANKNIFTY, SENSEX. Authenticated access is required.
No credentials, TOTP codes, or broker tokens are exposed in the response.

### Closed-candle market regime heuristics

- Requires at least 100 valid, closed, unique 15m OHLC candles.
- Invalid OHLC and incomplete candles are rejected; stale/future history is
  marked STALE_DATA (a 72-hour ceiling accommodates most weekends).
- Calculates EMA23/50 direction, ATR14, 20-candle directional efficiency,
  and 5-bar vs 45-bar volatility shocks.
- Builds 1h closes only from **four consecutive full 15m exchange-session**
  candles. Daily closes require a near-complete exchange session.
- Market regimes: INSUFFICIENT_DATA, STALE_DATA, SIDEWAYS, VOLATILE,
  TREND_UP, TREND_DOWN and TRANSITION. Choppy/shocked/unconfirmed trends return
  NO_TRADE for automatic directional research.
- Higher-timeframe contradiction blocks directional research, and missing
  daily information is disclosed. These parameters have **not** been calibrated
  or validated out of sample. NO_TRADE is a research classification, not an
  emergency broker exit instruction.

### Expiry and strike ranking

- Broker contracts: `GET /v2/option/contract` for the underlying instrument.
- Broker option chain: `GET /v2/option/chain` for each of at most four actual
  listed expiry dates. The expected request shape and option data fields are
  defined in official Upstox documentation:
  https://upstox.com/developer/api-documentation/get-option-contracts/
  https://upstox.com/developer/api-documentation/get-pc-option-chain/
- Approximate maturity buckets: 1W = 5–11 DTE, 2W = 10–20 DTE,
  4W = 21–39 DTE, 8W = 42–77 DTE. These are research labels, **not planned
  holding periods or guarantees**. Missing listed expiry => UNAVAILABLE,
  not a fictional option symbol.
- Requires exact broker instrument key, listed expiry and strike, positive
  bid/ask and book quantities, positive volume/OI, valid CE/PE Delta sign,
  absolute Delta 0.35–0.85 and quoted spread at most 8%.
- Score is a transparent **unvalidated heuristic**: 42% Delta proximity to
  0.60, 33% quoted spread, 12.5% relative traded volume and 12.5% OI.
  Scores are not probabilities or predictions. Theta and IV are surfaced for
  analysis; they are **not** interpreted as "cheap/rich" without historical
  IV rank and a comparable Greek time unit.
- Missing option-chain rows or inconsistent underlying spot price are rejected.
  Since the chain API doesn't carry verified snapshot timestamps here,
  `snapshotAgeVerified=false` ALWAYS. Never feed this output directly into
  real-money order authorization. No price or Greeks is synthesized.

## Critical existing-strategy mismatch STILL NOT FIXED HERE

The current EMA15M order dispatcher still uses intraday-oriented defaults:
Paper MIS, Live MIS by default, +100-point trailing activation and the 15:15 IST
forced exit. This phase deliberately does NOT change that trading behavior or
turn it into positional 1/2/4/8-week holding. The research preview cannot
change SL, target, square-off or any product/order settings.

## Before enabling Adaptive Swing positional trading

1. Construct a properly dated, consolidated index + historical option
   bid/ask/Greeks dataset across expiries; reject incomplete or cherry-picked
   histories. Apply transaction costs, slippage, IV crush, theta, and overnight
   gaps. Use walk-forward and untouched out-of-sample testing.
2. Compare current EMA23/50 baseline against regime gating and contract
   ranking by net expectancy, max drawdown, turnover, missed trends,
   holding duration and liquidity constraints.
3. Implement an explicit NRML positional state machine, multi-day restart
   recovery, rollover/expiry-risk exits, stop protection, and authorized
   broker-native overnight risk handling. Never simply delete 15:15 exits
   while orders can still be intraday MIS.
4. Ensure Paper and Live remain independent. Do not enable LIVE adaptive
   execution based only on this research heuristic or a green CI run.
5. Validate broker contracts, quote freshness, margin, exchange calendar and
   GTT/SL cancellation behavior in an approved test environment before
   any funded autonomous activation.

This phase is a **read-only research tool**, not a proven profitable strategy.
