# Adaptive Swing v2 — Phase 12 closed-candle market-regime hysteresis

**Strictly research-only and OFFLINE. Existing EMA23/50 MIS intraday execution, its 15:15 square-off, broker APIs and any NRML order/protective-stop management are UNCHANGED.**

## Market-behavior problem

A directional signal that changes as the underlying index wiggles can generate whipsaws: the system sees BULLISH, switches to BEARISH, then switches back—even when the actual listed option premium, bid/ask spread and open interest haven't supported a fill. This is dangerous in 1W/2W/4W/8W positional research, because time decay, gap risk, IV and option liquidity are distinct from underlying NIFTY index points.

Phase 12 builds **a source-decision-time, closed-underlying-candle HYSTERESIS advisory**. It deliberately separates:

- **Raw candidate direction**: CE/PE/NO_TRADE, recomputed only at original decision time from underlying 15m bars whose *bar-close* time has passed, using the existing Phase 2/6 multi-timeframe regime classifier. No forming bar or future confirmation is used.
- **Last confirmed market direction**: only a research classification, **NOT** a real open position, broker signal or automatic exit.
- **Permission to consider a NEW entry**: a separate advisory. Opposite trends still pending confirmation, shocks, neutral/choppy transitions, cooldowns, missed source trading sessions and stale evidence all force **NO_TRADE** for **new entries**. Existing positions are NOT automatically liquidated.

## Hysteresis rules and anti-churn behavior

One policy rule is predeclared for each option expiry horizon (`1W`, `2W`, `4W`, `8W`). Each rule has:

- `initialConfirmations`: minimum consecutive **original observed decision sessions** with the same closed-bar directional trend for a first advisory.
- `oppositeConfirmations`: distinct confirmations before the informational confirmed direction can reverse; opposite single-session noise does not flip the state.
- `minimumDwellObservedDecisions`: minimum number of observed decision sessions following confirmation before an opposite confirmed switch is considered. No churning on short-lived reversal.
- `freezeObservedDecisionsAfterShock`: after a volatility-shock classification, block fresh entries for additional observed decisions, and reset pending confirmation.
- `cooldownObservedDecisionsAfterReversal`: even after an opposite direction is confirmed, no immediate replacement BUY is recommended.
- **Reconfirmation after uncertainty**: after a nontrending/sideways regime, volatility freeze, an attempted opposite trend, or reversal cooldown, even the **same previously confirmed direction** must produce fresh consecutive decision observations before new-entry research is unblocked.

This does **not** mean all 15-minute candle closes are continuously sampled. The Phase 5 historical dataset contains **one explicit strategy decision snapshot per exchange session**, with closed 15m underlying history. Confirmations count actual sequenced *decision sessions*, not 15-minute bar counts, ordinary calendar weekdays or unobserved intraday ticks. A richer intraday decision capture would be needed to study intra-session reaction frequency.

The per-horizon settings are hypotheses—not automatically optimized from OOS profits. A longer 8W horizon may require more evidence to filter noise, but **there is no proof that it is statistically optimal** until authentic multi-regime historical data is available.

### Missing/session/stale safeguards

- Mandatory strictly sorted, externally declared original exchange-session windows, with unique source references. The exact original session ordinal is used: if a declared trading session between two sampled decisions has no observation, **signal confirmation resets**, not silently bridging across a missing day. A holiday is not invented or inferred.
- `latestClosedCandleEndAt` must be no later than decision time; the predeclared maximum age limits stale underlying inputs. The last completed bar must close inside the decision's own declared exchange session. Duplicated/nonmonotonic original decisions, future bars and unexpected candle clocks do not qualify as confirmation.
- Overnight carried trend classifications never amount to holding a live position; there is **no 15:15 square-off**, auto stop/rollover, or broker instruction.
- `NO_TRADE` is an entry-advisory block, **not an automatic sell**. Real protective option-premium risk controls still require broker-authoritative, separately approved NRML implementation.

## Implemented modules and CLI

- `src/server/engine/ema15m/adaptiveRegimeHysteresis.ts`
  - `emptyAdaptiveHysteresisState()`
  - `applyAdaptiveHysteresisObservation(state, sourceObservation, horizonRule, maxAgeMinutes)` pure state machine
  - `validateAdaptiveHysteresisPolicy(policy)`
  - `replayAdaptiveRegimeHysteresis(historicalInput, declaredSessions, policy)` recomputes regime snapshots from old closed-candle decisions and summarizes out-of-sample changes
- `src/quant/tests/ema15m_adaptive_regime_hysteresis.test.ts`: synthetic anti-whipsaw tests for isolated flips, opposite run confirmation, minimum dwell, post-reversal cooldown, shock freeze, same-side revalidation, missed source-declared sessions, stale/future/repeated candle evidence, separate 1W/8W confirmation requirements, no live-authorization flags.
- Offline `scripts/run-adaptive-walkforward.ts` accepts a separate opt-in `--hysteresis-policy`; the existing Phase 5–11 flags and research results remain intact.

Example command (**non-synthetic historical source additionally needs its separately retained SHA256-matching artifact, checked for integrity not authenticity**):

```bash
npx tsx scripts/run-adaptive-walkforward.ts \
  /secure/verified-historical-l1-bundle.json \
  --source-artifact /secure/separately-retained-original-feed.bin \
  --hysteresis-policy /secure/predeclared-regime-hysteresis.json
```

Example **synthetic hypothesis policy, NOT validated or recommended for live options**:

```json
{
  "schemaVersion": "ADAPTIVE_REGIME_HYSTERESIS_V1",
  "maximumClosedCandleAgeMinutes": 30,
  "horizonRules": {
    "1W": {"initialConfirmations": 2, "oppositeConfirmations": 3, "minimumDwellObservedDecisions": 4, "freezeObservedDecisionsAfterShock": 1, "cooldownObservedDecisionsAfterReversal": 1},
    "2W": {"initialConfirmations": 3, "oppositeConfirmations": 4, "minimumDwellObservedDecisions": 5, "freezeObservedDecisionsAfterShock": 1, "cooldownObservedDecisionsAfterReversal": 1},
    "4W": {"initialConfirmations": 4, "oppositeConfirmations": 5, "minimumDwellObservedDecisions": 6, "freezeObservedDecisionsAfterShock": 2, "cooldownObservedDecisionsAfterReversal": 2},
    "8W": {"initialConfirmations": 5, "oppositeConfirmations": 6, "minimumDwellObservedDecisions": 8, "freezeObservedDecisionsAfterShock": 2, "cooldownObservedDecisionsAfterReversal": 2}
  }
}
```

The CLI prints only research-fold aggregates: number of observed decisions, raw opposite-direction flips, **confirmed** opposite-direction changes, shock/cooldown blocks and new-entry advisories, without revealing instrument-level options L1 or asserting any P&L improvement. These counts do not directly compare against the Phase 8 strategy's original entry cohort and must NOT be interpreted as trade results or a profitability improvement.

## Remaining blockers

1. Licensed authentic market data for NIFTY/BANKNIFTY/SENSEX original 15m decision-time index and option L1, independent feed availability verification, full official calendar, and expiry history. No real dataset supplied.
2. True historical **each-15m-close** decision capture would be needed for more granular hysteresis research. This phase uses original *one-per-session* decision timestamps, never invented intermediate decisions.
3. Independent statistical OOS comparison between unchanged initial Phase 8 arm and a **predeclared** stabilized-arm cohort (with matched decisions, options, costs and censored exits). Filtering noise *can also miss profitable reversals*; fewer flips does not imply higher PnL.
4. Real broker-authoritative order and position reconciliation, protective stop lifecycle, overnight gap stress, operator approvals and restart-safe NRML controls as separated in Phase 9.

All reports permanently state `executionAuthorized=false`, `productionSafe=false`, `brokerProtectionInstalled=false`, `empiricalProfitabilityProven=false`, `sourceAuthenticityIndependentlyVerified=false` and `calendarIndependentlyAuthenticated=false`.

**Draft/unmerged, research only. No change to MIS's 15:15 automatic square-off.**
