# Adaptive Swing v2 — Phase 14 matched options premium, cost, depth & overnight gap stress

**RESEARCH ONLY. Draft/unmerged. No broker order, live/paper NRML activation, protective stop/GTT, deployment, or modification to existing EMA23/50 MIS / 15:15 square-off.**

## The practical question

If the Phase 12 hysteresis filter reduces market-state whipsaws, does it still help after REALISTIC option-premium friction and hard-to-fill bid depth? The answer cannot be inferred from underlying NIFTY +100 index points or an assumed stop-fill price, and the synthetic test examples prove no market edge.

Phase 14 extends the Phase 13 **two independently selected, entry-first research cohorts**: the unchanged EMA baseline/other research arms and the hysteresis-filtered variants. Both independently reserve exposure with their original predeclared fixed cooldown; a baseline-only trade does NOT occupy the filtered model's slot.

The replays recompute the entry-first cohorts **before** applying any future stress. The same per-instrument ORIGINAL ASK entry and *first next original-availability-time L1 BID after the previously observed stop/trail/time trigger* are fixed for all scenarios. Changing slippage/spread costs cannot select a different candidate, recalculate the stop, search for a later favorable quote, or re-enroll profitable survivors.

## 4 predeclared scenario interpretations

| Scenario | Entry price | Exit price | Fees / original slippage | Displayed depth |
|---|---|---|---|---|
| `UNCHANGED_P8_COSTS` | Original ASK | First post-trigger original BID | Unchanged Phase 8 policy | One complete option lot |
| `DOUBLE_ORIGINAL_COSTS` | Original ASK | Same BID | 2 × original fixed fees and 2 × original slippage bps | One lot |
| `WIDEN_ENTRY_ASK_AND_EXIT_BID` | Hypothetically higher ASK (horizon-specific bps) | Hypothetically lower first BID (horizon-specific bps) | Original fees/slippage | One lot |
| `COMBINED_OVERNIGHT_GAP_AND_DEPTH` | Higher ASK | Lower first BID, with **additional lower-BID haircut only if an overnight trigger was actually observed** | Doubled original fees/slippage | Horizon-specific minimum ASK and BID available quantity, in whole lots |

**These additional bps are analyst-defined hypothetical adverse sensitivity—not actually observed bid/ask quotes or real fills.** When displayed historical entry ASK or first post-trigger BID lacks the predeclared depth for the stressed lot size, that trade becomes **CENSORED**. No hypothetical execution at stop threshold, no hidden later quote replacement. A wide bid/ask spread is not the same thing as guaranteed slippage, and L1 bid quantity cannot prove queue priority or partial fills.

All four scenarios retain exactly the same original decision × arm × horizon sample. The Phase 8 exit trigger and current premium quote remain unchanged across scenarios, making stress an exposure/cost sensitivity rather than a full re-optimized strategy. Every unpriced original exit remains unpriced. No intrabar reconstructed stop, interpolated opening price, fake premium target or 15:15 NRML close.

## What the report contains

For each original walk-forward test fold × `EMA_BASELINE` / `REGIME_FILTER` / `REGIME_AND_RANK` × **1W / 2W / 4W / 8W** × scenario, output includes:

- Original OOS decisions and independently enrolled ORIGINAL/HYSTERESIS entries; all original-only, filtered-only, jointly-entered and neither-entered categories cross-checked against Phase 13.
- ORIGINAL and HYSTERESIS scenario-priced vs censored exits, source mismatches, additional depth blocks, and skipped original opportunities that *later* priced as winners/losers under each adverse scenario. These hindsight labels never affect entries.
- The original Phase 8 net P&L reproduced from each unchanged, source quote matched first next BID and original slippage/fees. A mismatch in the raw source price or the Phase 13 base cell blocks descriptive review.
- Complete cohort stressed hypothetical P&L only if **every enrolled exit is priceable**, **no required entry L1 is missing** and no additional depth constraint censors a trade. Otherwise P&L is `null`—**not zero** and never quietly dropped from denominator.
- Jointly selected decision-pair net delta only if both first-next-bid outcomes are stressed-priceable, none of the joint exits is censored, and the separately predeclared paired minimum is met.
- Per-horizon `maximumCombinedStressDeteriorationINR`, applied to each variant's complete BASE → COMBINED sample. If the observed descriptive sensitivity exceeds its declared cap, mark the fold/arm/horizon **insufficient for stress review**; this is not an actual risk budget for broker trading.
- Horizon summary of source-declared gap-triggered entries, stressed depth-blocked exits, and cells with complete observation evidence.

`DESCRIPTIVE_ONLY` is the highest possible result for complete synthetic or internally consistent source-attested data. It means **not profitable, not vendor authenticated, not statistically significant and not ready for live**. `INCOMPLETE_EVIDENCE` means missing original prices, stressed liquidity constraints, underpowered paired samples or policy limits prevent full review. `REJECTED` marks malformed policy/data or failed phase predecessor.

## Files and offline CLI

- `src/server/engine/ema15m/adaptiveMatchedPremiumCostDepthStress.ts` — deterministic readonly research-only scenario reviewer, with original quote reproduction and no order or network side effects.
- `src/quant/tests/ema15m_adaptive_matched_premium_cost_depth_stress.test.ts` — adverse synthetic fixture checks (completeness, cost monotonicity, overnight gap haircuts, two-lot depth censor, missing next bid, INR deterioration limits, one-per-expiry fold accounting).
- `scripts/run-adaptive-walkforward.ts` — **opt-in** `--premium-stress-policy`; requires Phase 8 `--entry-first-policy`, Phase 12 `--hysteresis-policy` and Phase 13 `--matched-hysteresis-policy`.

```bash
npx tsx scripts/run-adaptive-walkforward.ts \
  /secure/source-attested-historical-option-l1-bundle.json \
  --source-artifact /secure/original-vendor-feed-bytes.bin \
  --entry-first-policy /secure/predeclared-phase8-exit.json \
  --hysteresis-policy /secure/predeclared-phase12-hysteresis.json \
  --matched-hysteresis-policy /secure/predeclared-phase13-matched.json \
  --premium-stress-policy /secure/predeclared-phase14-cost-depth.json
```

Example **unvalidated research sensitivity parameters**; they are not recommended as Indian option trading settings or real margin/risk limits:

```json
{
  "schemaVersion": "ADAPTIVE_MATCHED_PREMIUM_COST_DEPTH_STRESS_V1",
  "minimumJointlyStressedPricedPairsPerCell": 20,
  "horizonRules": {
    "1W": {"addedEntryAskBps": 100, "addedExitBidBps": 100, "additionalOvernightBidHaircutBps": 1000, "minimumAskDepthLots": 2, "minimumBidDepthLots": 2, "maximumCombinedStressDeteriorationINR": 10000},
    "2W": {"addedEntryAskBps": 100, "addedExitBidBps": 100, "additionalOvernightBidHaircutBps": 1000, "minimumAskDepthLots": 2, "minimumBidDepthLots": 2, "maximumCombinedStressDeteriorationINR": 10000},
    "4W": {"addedEntryAskBps": 100, "addedExitBidBps": 100, "additionalOvernightBidHaircutBps": 1000, "minimumAskDepthLots": 2, "minimumBidDepthLots": 2, "maximumCombinedStressDeteriorationINR": 10000},
    "8W": {"addedEntryAskBps": 100, "addedExitBidBps": 100, "additionalOvernightBidHaircutBps": 1000, "minimumAskDepthLots": 2, "minimumBidDepthLots": 2, "maximumCombinedStressDeteriorationINR": 10000}
  }
}
```

The command prints **aggregate fold/arm/horizon/scenario outcomes**, not raw licensed option L1. Use true predeclared scenarios for untouched OOS evaluation; these are sensitivity tests, not synthetic price-generator alpha.

## Limitations and release blockers

1. **No authentic licensed historical Indian index option L1 bid/ask feed was supplied.** Existing synthetic test quote paths cannot prove the market actually exhibits the stress parameters or the strategy is profitable.
2. A source checksum authenticates file integrity only, **not** the vendor, event/availability clocks, holiday/expiry changes, exchange market session completeness or licensed data origin.
3. Option displayed top-of-book quantity does not establish executable size in real markets; queue position, actual spread, partial fills, broker order latency and unknown/failed protective GTT must be reconciled with independent broker-native evidence.
4. A calendar-day positional hold may span overnight/weekend/holiday shocks. Additional haircuts are conservative *what-if* bps, not forecasts of actual opening gaps or a valid intraday 15:15 close.
5. Fewer hysteresis trades can mean **missed winners** as well as avoided losses. A complete paired scenario sample is not sufficient to claim statistical significance, causal benefit or live net profitability. New evidence is required before choosing 1W vs 2W vs 4W vs 8W for actual trading.

Every status hardcodes `executionAuthorized=false`, `productionSafe=false`, `profitabilityProven=false`, `brokerFillsAuthenticated=false`, `nativeProtectionInstalled=false`, `originalMarketDataIndependentlyAuthenticated=false`, `exchangeCalendarIndependentlyVerified=false` and `scenarioPricesAreObservedTrades=false`.

**Keep this branch as a Draft PR, stacked on Phase 13, and keep the existing MIS/15:15 behavior unchanged.**
