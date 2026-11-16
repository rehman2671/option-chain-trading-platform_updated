# Adaptive Swing v2 — Phase 13 matched original vs hysteresis OOS positional exits

> **OFFLINE RESEARCH ONLY:** no live/paper/NRML order execution, no broker stop creation, no changes to the current EMA23/50 MIS strategy or its 15:15 intraday square-off. No market edge is established by synthetic tests.

## Question this phase answers

Phase 12 can reduce noisy raw direction flips, but less churn **does not mean greater option-premium profitability**. Filtering often misses profitable reversals; an unstable regime filter may also skip losing entries. We must compare both outcomes using the **same original point-in-time index decisions and option bid/ask universe** without using future exit prices for selecting trades.

Phase 13 is a direct research-level evaluation of the existing Phase 8 **entry-first / separately censored next-L1-bid exit** methodology under two strategy variants:

1. **ORIGINAL**: the unchanged Phase 8 EMA baseline, regime-filter and regime-and-ranker research arms. They retain their own predeclared fixed-hold/exposure cooldowns.
2. **HYSTERESIS**: the *same* three arms and expiry buckets, but an additional Phase 12 advisory must match CE or PE on that original decision. The filtered cohort is **rebuilt independently** from all original OOS decisions, with its own cooldown calendar. A baseline trade filtered out by Phase 12 does not reserve/occupy the filtered arm's position slot on later dates.

Both operate on the **same original** 1W/2W/4W/8W chain selections, quoted ASK entries, next observed bid exit rules, synthetic/supplied transaction costs and predeclared exit policy. No lookahead: Phase 12 advisories are recalculated solely from already closed underlying 15m bars available at the original decision timestamp. The two future exit paths are observed **only after** their independent entry cohorts have been recorded.

## Why independent cooldown matters

Suppose baseline buys a NIFTY CE on Monday with a two-day predeclared exposure reservation, but the hysteresis filter says `NO_TRADE`. If the Wednesday market signal qualifies, the filtered strategy must be able to consider it; it cannot inherit Monday's baseline cooldown. Simply taking the baseline list and removing filtered entries would introduce an artificial exclusion and wrong P&L denominators.

Implementation therefore extends `buildAdaptiveEntryFirstCohort` and `runAdaptiveEntryFirstExitStudy` with an **optional, strictly point-in-time advisory map** keyed by `foldIndex|horizon|decisionAt`. Calls without the map retain original Phase 8 behavior. Filtered calls create new independent fixed cooldowns and apply Phase 12's `NO_TRADE` advisory **before** looking at entry option L1 or any future exit price.

## What is measured

For every walk-forward test fold × original arm × 1W/2W/4W/8W bucket:

- Total original OOS decision count, separately observed entries and missing entries for each variant.
- `bothEntered`, `originalOnlyEntries`, `stabilizedOnlyEntries`, `neitherEntered`, so the **full decision denominator always reconciles** (including skipped and untradeable snapshots).
- Actual historical-replay next-bid exit evidence status: `PRICED_EXIT`, `EXIT_UNPRICED` and `PATH_INCOMPLETE` for each variant, never assigning zero P&L to missing quotes.
- `skippedOriginalWinnersObserved`, `skippedOriginalLosersObserved`, `skippedOriginalUnpriced`: diagnostic **counterfactual opportunity cost** after the original-only trades were enrolled and priced. This is deliberately not a forward-looking trade selection rule.
- Separate complete-cohort hypothetical net P&L figures only when **every observed entry exit is priced** and no required entry evidence is missing. Otherwise results are `null`. Full strategy P&L is not reconstructed from a cherry-picked set of complete winners.
- `matchedCompleteNetDeltaINR` only when both variants entered on the same original decision and both their exits have complete price evidence, with at least the predeclared number of such pairs; if any paired exit is censored, the matched sample comparison is `null`.
- Flags for insufficient pairs, missing price evidence, inconsistent raw decision/exit identifiers and improperly reconciled Phase 8 summary metrics.

**Two different comparisons must not be confused:** "both entered on same decision" is a paired **selection-time** comparison; "complete-cohort net P&L" includes separate entrants/nonentrants and therefore different exposure calendars. Neither is statistical significance, an independently authenticated causal estimate, nor a broker executable fill.

## Implementation

- `src/server/engine/ema15m/adaptiveEntryFirstCohort.ts`: optional advisory keyed by fold, expiry horizon and decision time; new `HYSTERESIS_NEW_ENTRY_BLOCKED` disposition, while default behavior is preserved.
- `src/server/engine/ema15m/adaptiveEntryFirstExitStudy.ts`: optional advisory passed to Phase 8 exit-price/censor replay.
- `src/server/engine/ema15m/adaptiveHysteresisMatchedOos.ts`: independently produces ORIGINAL and HYSTERESIS cohorts using all OOS decisions and the same predeclared Phase 8 option exit rules. Computes decision, miss, pair, censor and descriptive P&L reconciliations. Every authorization/profit/vendor/broker flag is false.
- `src/quant/tests/ema15m_adaptive_hysteresis_matched_oos.test.ts`: synthetic adversarial tests for independent cooldowns, skipped winning and losing trades, below-stop overnight gaps, missing future bid evidence, unchanged legacy Phase 8 defaults, and non-authorizing flags.
- Existing `scripts/run-adaptive-walkforward.ts`: opt-in `--matched-hysteresis-policy <policy.json>` alongside the mandatory `--entry-first-policy` and `--hysteresis-policy`. For non-synthetic data the earlier `--source-artifact` matching SHA256 remains mandatory.

### Offline example

```bash
npx tsx scripts/run-adaptive-walkforward.ts \
  /secure/historical-source-attested-bundle.json \
  --source-artifact /secure/separately-retained-original-feed.bin \
  --entry-first-policy /secure/prespecified-phase8-exit-policy.json \
  --hysteresis-policy /secure/prespecified-phase12-hysteresis-policy.json \
  --matched-hysteresis-policy /secure/prespecified-phase13-match-policy.json
```

Illustrative Phase 13 policy (**arbitrary research minima, NOT empirically validated**):

```json
{
  "schemaVersion": "ADAPTIVE_HYSTERESIS_MATCHED_OOS_V1",
  "minimumJointlyPricedPairsPerCell": 20,
  "maximumUnpricedExitFractionPerCell": 0,
  "maximumMissingEntryFractionPerCell": 0
}
```

This command prints fold × arm × horizon aggregate counts and price-evidence flags, not raw licensed option quotes. `DESCRIPTIVE_ONLY` is the **highest possible** status for fully observed source-attested/synthetic data, never a live approval; incomplete/missing paths remain `INCOMPLETE_EVIDENCE`.

## Still unresolved and not claimed

- No authentic licensed NSE/BSE/Upstox historical options L1 feed or independently checked exchange session/expiry calendar has been supplied. Synthetic test outcomes are not real trading results.
- A source SHA256 checksum matches bytes, **not** vendor origin or original feed-clock truth. Broker displayed bid/depth is not an actual queue-position or stop-order fill.
- Phase 13 uses the Phase 8 same predeclared exit model, not independent real overnight stop protection. Actual native broker stop confirmation, restart reconciliation and partial orders remain future separate operational work.
- The Phase 12 directional filter is sampled at the original observed **session decision**, not on every 15m candle throughout the session. Retrospectively filling unobserved 15m decisions would fabricate a strategy.
- Option-premium moves depend on liquidity, bid/ask spread, IV, delta, gamma, theta, expiry and overnight gaps. NIFTY +100 underlying index points do not imply a +100 premium-point target or a guaranteed 100-point gain.
- These descriptive comparisons do not establish a statistically significant edge, eliminate selection bias, validate exchange-calendar completeness, estimate true capital/margin constraints, or prove live order execution.

**Research-only, Draft PR, no main/MIS/live NRML modification.**
