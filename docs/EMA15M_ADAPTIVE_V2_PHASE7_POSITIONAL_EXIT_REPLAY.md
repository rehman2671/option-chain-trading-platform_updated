# Adaptive Swing v2 — Phase 7: Market-responsive positional exit **research**

**Research only, NOT NRML live trading or a broker trailing-stop engine.**

Phase 7 is stacked on Phase 6's source/checksum/exchange-session evidence gates. Existing intraday **MIS** and the **15:15 square-off** remain completely unchanged. The new code has **no order router, broker API, GTT calls, persistent NRML state, SL placement, modification, or live position changes**.

## Motivation: what if +50–70 points turn around before +100?

A fixed +100-point underlying-index target is **not** a universal exit rule for option contracts with different expiries. Option premium also depends on implied volatility, time decay, delta/gamma, liquidity and spreads; an underlying move of 50 points is not automatically a gain of 50 option-premium points. We therefore evaluate **explicit, pre-registered long-option PREMIUM** rules across 1W/2W/4W/8W horizons rather than treating an arbitrary NIFTY index move as realizable option profit.

The Phase 7 experimental policies (all user/researcher-supplied; no default optimization):
- **Initial premium-risk threshold:** entry **ask** times `(1 - initialStopFraction)`.
- **Trail activation:** only after *observed option bid* reaches entry **ask** times `(1 + trailActivationFraction)`.
- **Profit giveback threshold:** after activation, a monotone trailing floor `max(previous floor, observed peak bid * (1 - trailingGivebackFraction))`, never lowered on later prices.
- **Early time cap:** `maxHoldCalendarDays` per contract-expiry bucket. This is an actual position holding cap, separate from 1W/2W/4W/8W *time-to-expiry* bucket selection.

Every rule is expressed in observed option premium, **not underlying index points**. No option-premium ATR is fabricated from L1 quotes. Future research can separately incorporate actual time-aligned option OHLC/volatility observations or measured IV/Greeks, without treating LTP as executable bid.

## Safe timeline and hypothetical exit evidence

For each original *already-priced* out-of-sample fixed-hold trade:
1. Require the **same exact instrument** bid/ask recorded at original entry and fixed exit times. Require a declared exchange trading calendar that covers the holding period, and a predeclared minimum number of option L1 quotes per session, minimum intermediate quotes and maximum within-session quote gap.
2. Process chronological **original strategy-available L1** quotes. The trailing floor used to test the current quote was locked at an **earlier** observation; the current quote can only raise the stop for **future** observations.
3. If current observed bid is at/below the preexisting premium floor, or an explicit holding-time cap has elapsed, record a trigger. **Never assume a fill at stop/threshold price, the same quote, or theoretical mid.**
4. Try pricing a hypothetical exit using the **next independent L1 quote after the trigger**, within a configured trigger-to-next-quote delay and with displayed bid depth for the *entire* assumed lot. Price it at that next **bid**, subtracting original policy slippage/fees. If no valid next quote, keep `TRIGGER_UNPRICED` with **null** hypothetical PnL. A price crossing overnight is *not* filled at the last protected level; this can create a gap loss.
5. If no early threshold fires, retain the original comparator's prepriced `ORIGINAL_FIXED_HOLD` exit only. Report trade-level hypothetical PnL differences **against identical prepriced entries**, and an out-of-sample cell aggregate if the input has enough evidence.

The next L1 bid and displayed depth still do NOT guarantee broker execution: no queue position, spread dynamics, order price impact, liquidity after a market order, SL protection under broker outage or cross-session GTT lifecycle is simulated. A native overnight SL can also slip or fail to fill near its trigger.

**Important selection limitation:** Because Phase 3's original comparison already excludes unpriced fixed-hold entries/exits, this Phase 7 secondary analysis cannot reconstruct strategies that were excluded. Its paired sample is **survivorship biased**. `comparable=false` unless the original arm/horizon has complete evidence, all original priced trades have replayable early exits, and at least 20 priced trades. Twenty is not statistically sufficient to claim a reliable edge. No strategy parameter search/tuning on OOS dates is allowed.

## Run it — separately predeclared policy file

The optional CLI flag `--exit-policy` reads a JSON file with the same fields as `AdaptiveExitReplayPolicy` in `src/server/engine/ema15m/adaptivePositionalExitReplay.ts`. File structure, using **illustrative uncalibrated examples, NOT recommendations**:

```json
{
  "schemaVersion": "ADAPTIVE_OPTION_EXIT_REPLAY_V1",
  "horizonRules": {
    "1W": {"initialStopFraction": 0.20, "trailActivationFraction": 0.15, "trailingGivebackFraction": 0.10, "maxHoldCalendarDays": 3},
    "2W": {"initialStopFraction": 0.20, "trailActivationFraction": 0.20, "trailingGivebackFraction": 0.10, "maxHoldCalendarDays": 6},
    "4W": {"initialStopFraction": 0.25, "trailActivationFraction": 0.25, "trailingGivebackFraction": 0.15, "maxHoldCalendarDays": 12},
    "8W": {"initialStopFraction": 0.30, "trailActivationFraction": 0.30, "trailingGivebackFraction": 0.20, "maxHoldCalendarDays": 25}
  },
  "minQuotesPerDeclaredSession": 10,
  "minIntermediateQuotes": 20,
  "maxSameSessionQuoteGapMinutes": 30,
  "maxTriggerToNextQuoteMinutes": 5
}
```

Choose these parameters *before* inspecting untouched OOS returns and examine sensitivity across market regimes. They are unvalidated research hypotheses; wider stop tolerances on longer expiries are **not assumed safer**.

```bash
# Offline synthetic-only experiment (if its JSON declares session windows).
npx tsx scripts/run-adaptive-walkforward.ts \
  /secure/synthetic-vendor-bundle.json \
  --exit-policy /secure/policies/predeclared-exits.json

# Real market data additionally requires original vendor bytes and matching
# SHA256; exchange calendar and source event clocks still need manual review.
npx tsx scripts/run-adaptive-walkforward.ts \
  /secure/derived-historical-l1.json \
  --source-artifact /secure/original-vendor-feed.bin \
  --exit-policy /secure/policies/predeclared-exits.json
```

Output prints the OOS **aggregate** reason counts and comparison cells. Missing path/trigger evidence leads to `INCOMPLETE_EVIDENCE`, which exits nonzero; no fabricated net gains are filled in. CLI source-checksum controls from Phase 6 remain in force.

## Research and release blockers

- Authentic *continuous enough* historical option L1 event-time bid/ask/depth paths, exact contract master, original feed availability clocks and independently checked exchange-session calendars are required. Phase 4 REST receipt archives do **not** qualify.
- Need deep periods covering trend/chop/reversals, IV spikes, expiry weeks and overnight gaps. Stress changing spreads, slippage, low market depth, taxes and gap losses; determine unbiased selection of eligible trades, not just original complete-exit subset.
- Fixed historical PnL comparator is still a **ranker-screened** nearest-strike baseline, not a faithful recreation of every old EMA broker rule.
- **Real** NRML live lifecycle remains blocked: no verified persistent position inventory across restarts, broker-authenticated native protection, quantity reconciliation, protective-order cancel/replace race handling, circuit breakers, exchange holiday expiry management or operator approval.

Every API here reports `executionAuthorized=false`, `productionSafe=false`, `historicalSourceAuthenticated=false` and `empiricalProfitabilityProven=false`. No broker order API is called.
