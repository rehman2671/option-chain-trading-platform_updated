# Adaptive Swing v2 — Phase57 market regime × 1W/2W/4W/8W long-option premium debit envelope

**DRAFT / OFFLINE RESEARCH ONLY, stacked on Phase56. No real-money NRML authorization, no option contract trading recommendation, no new broker/GTT/order interface.**

## Why Phase57 exists

Earlier phases already research original option BID premium **runup → reversal** versus original ASK (Phase19), premium spread/depth/overnight scenario costs (Phase14), initial/trailing/fixed-hold replay (Phase8), and **full long-option premium debit / zero recovery / gap-without-fill** stress (Phase46). Repeating their computations with different names would not add evidence.

This phase instead asks a previously under-covered market-risk question: **At each entry decision, which 1W/2W/4W/8W option premium debits would a predeclared cash-loss budget permit, how large would the four-horizon combined exposure be, and which actual decision-time market regimes do these observations cover?** This is descriptive risk-envelope evaluation only; it must never silently change the Phase8 entry cohort, optimize thresholds on test data, turn missing quotes into zero returns, or choose the most profitable expiry from synthetic data.

## Offline implementation

Module: `src/server/engine/ema15m/adaptivePhase57RegimeHorizonDebitRisk.ts`.

`auditPhase57RegimeHorizonDebitRisk(input,pins)`:

- Independently SHA256-pin the **full original Phase51 input**, its separately prespecified pins, full Phase57 four-horizon cash-loss policy and the independent OOS session-date manifest. Re-run Phase51 → Phase50 original `availableAt`/observed-at entry audit, including the full **2+ OOS folds × every decision × 3 arms × 4 horizons**. Rebuild Phase8 entry-first original cohort instead of accepting a report assembled after seeing winning exits.
- Classify each held-out original trading **decision time** using the existing `analyzeAdaptiveRegime` and closed underlying-index 15-minute candles only; reject a future or unfinished index candle. Regimes are SIDEWAYS, VOLATILE, TREND_UP, TREND_DOWN and TRANSITION; missing/stale regime source is incomplete evidence, never a successful low-risk regime.
- For each original `ENTRY_OBSERVED`, require a unique **original instrument + observed-at quote**, matching the selected original entry ASK, displayed ASK quantity and source original `availableAt` within the independently predeclared entry delay. Compute the **hypothetical full cash debit loss = original ASK × original quantity + predeclared nonrecoverable fees**. This is not a broker fill; a long option can lose the entire option premium even with a stop trigger displayed.
- Compute four fixed **hypothetical option premium drawdown scenarios** (25%, 50%, 75%, 100% of *option premium*, not underlying-index points). A trade's 50-point NSE index move has no deterministic mapping to its option premium or actual spread/depth liquidity. These percentages do **not** mathematically decompose IV/vega, theta, gamma, jumps, bid queue, liquidity, or a market probability.
- Compare full-debit stress to a **separately pinned 1W/2W/4W/8W maximum INR loss budget**, plus a separate **four-horizon combined cash-loss budget per original OOS decision and strategy arm**. A losing option can reverse well before an arbitrary +100-index-point target; stop triggers do not guarantee execution.
- Strategy arms (`EMA_BASELINE`, `REGIME_FILTER`, `REGIME_AND_RANK`) are mutually compared research policies, **not three independent broker fills**. Thus combined portfolio exposure is calculated *within* a single arm/decision across all four expiry horizons, never by multiplying three arms together; it remains a hypothetical portfolio, not an executed account.
- Retain all original OOS arm × horizon attempts in denominator. Original unpriced selected L1 and original quote mismatches yield `INCOMPLETE_EVIDENCE`, not favorable zero-loss no-trade observations. A budget breach produces `DESCRIPTIVE_RISK_BUDGET_ALERT_ONLY`, not a trading prohibition plugged into a broker. A single-regime synthetic sample is labeled `DESCRIPTIVE_SINGLE_REGIME_RISK_ONLY`, not universal multi-regime robustness. `DESCRIPTIVE_MULTIREGIME_RISK_ENVELOPE_ONLY` is only a cash-exposure description, **never** an observed PnL, expected return, best-horizon ranking or statistical edge.
- All source authenticity, issuer trust, historical option tape, broker fill, overnight native stop, profitability and trade authorization flags remain hard `false`; `nativeOrderInstruction=null`.

## Regression evidence

`src/quant/tests/ema15m_adaptive_phase57_regime_horizon_debit_risk.test.ts` uses the existing **strictly synthetic**, original entry-first two-OOS-fold fixture and Phase51 pins. Ten cases check:

1. Full 24 arm × horizon attempts and source-priced entries, two original OOS days, no invented multiregime comparison from a one-regime example, and 25%–100% monotonically worsening premium-loss scenarios.
2. Predeclared individual 1W cash budget breach.
3. Hypothetical four-horizon aggregated risk exceeding a budget even while every individual horizon cap passes.
4. **Changing future option BID prices does not change originally observed entry-time cash-debit exposure**, after original source/policy rehash. This is critical for preventing hindsight survivor selection.
5. Risk threshold changed after separate prespecification fails independent pins.
6. Original option quote data changed without updating original Phase51 evidence fails nested source lock.
7. Deleted original OOS trading day—even after operator rehashes source—does not drop out of independent denominator.
8. Missing source `availableAt` fails.
9. Future index candle cannot be treated as decision-time regime evidence.
10. No claim of IV/theta shock calibration, real trade fill, best expiry, profitable strategy or NRML overnight protection.

These tests show **software invariants with fabricated options**, not real NSE/BSE historical performance.

## True market data needed next

- Independently licensed original F&O top-of-book BID/ASK, quantity/depth, broker-observable original arrival timestamps and point-in-time listed-contract master/expiry session calendar.
- Untouched multi-year or sufficiently representative multi-cycle chronological out-of-sample market-regime samples, including no-trade days, crisis/special sessions, stale quotes, contract-expiry edge cases and overnight gaps. Test sample must contain multiple actual regimes before anyone says “works across trending and sideways markets”.
- Existing Phase8/19/14/46 research should be rerun on the **same exact independently archived original OOS cohort**, with true option-premium path reversals/IV/theta/spreads/fees, overnight stop nonfills and full-premium-zero-recovery loss.
- Real broker-native NRML order/GTT/modify/cancel ACK and overnight persistence proof are independent release gates; Phase57 does not communicate with any broker.

Release blockers #17–#22 including #20 stay OPEN. All stacked PRs remain DRAFT/unmerged. Existing EMA23/50 MIS **15:15 intraday square-off unchanged**. Positional NRML **1W/2W/4W/8W has no forced 15:15 exit**, and no live NRML order/GTT/native stop is enabled.
