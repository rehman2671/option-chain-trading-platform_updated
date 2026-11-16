# Adaptive Swing v2 Phase 8 — entry-first OOS cohort and censored positional exit research

**Strictly RESEARCH ONLY. No broker order APIs, live/paper order activation, native GTT or NRML stop management, or changes to MIS / the 15:15 automatic square-off.**

## Why Phase 7 was vulnerable to an optimistic sample

Phase 3's historical comparator records a trade only when it finds BOTH a forward entry and fixed-hold exit quote. Phase 7 replay then examines only those already-priced trades. An illiquid, gapping or otherwise difficult instrument with a **missing future exit quote** may be excluded from the replay. Excluding such trades can dramatically overstate a protection rule's apparent benefit.

Phase 8 introduces a **different, entry-first OOS cohort**. It records every OOS decision × three policy arms × 1W/2W/4W/8W buckets, first classifying: no trade signal, insufficient/stale index history, missing contract/quote, pre-expiry buffer violation, predeclared exposure cooldown, or observed executable entry. It then follows **every observed entry** to a priced or censored outcome, regardless of whether a future fixed-hold exit was present.

This does not retroactively validate the old Phase 7 comparison. Both versions remain reported separately for methodological transparency.

## Design and anti-lookahead rules

1. **Decision time**: Only fully CLOSED historical 15-minute index bars and source-available contracts and option-chain snapshots that preceded the decision may enter the ranker. A predeclared maximum chain age is enforced. No tomorrow's instrument master or future liquidity in contract selection.
2. **Entry-first**: For the ranker's chosen point-in-time contract, require an ASK quote recorded **after** the decision within the predeclared entry delay, with bid/ask displayed quantity at least one actual lot. This entry is included in the cohort even if no future exit quote exists.
3. **Fixed exposure cooldown**: Once an entry is enrolled, this arm/horizon refrains from new entries until the predeclared fixed-hold + allowed exit window. It does NOT peek at profitable exits to determine when to reopen entry eligibility. This conservative, fixed exposure policy is different from Phase 3's exit-time cooldown.
4. **Exit path**: From entry onward, use recorded original-availability-time bid/ask L1. Initial premium-risk threshold, high-water trailing floor and horizon holding caps reuse the **predeclared Phase 7 policy**. The current observed quote can raise the trailing floor only for **later** observations. Stop/hold trigger prices are NOT broker fills.
5. **Next quote only**: After an observed threshold breach or holding-time trigger, a hypothetical sale can use only the NEXT observed bid, within a specified quote delay, with enough displayed bid quantity. Report the gap-loss at this actual next bid, never at an assumed stop or midpoint. Broker/queue fills remain unverified.
6. **Censor insufficient evidence**: If a path does not contain enough quotes, a declared session is missing, a within-session gap or boundary gap is too large, no exit is observed, or the next bid lacks depth, preserve the original entry and mark `PATH_INCOMPLETE` or `EXIT_UNPRICED`, with **null** PnL.
7. **Full denominator**: For every fold × arm × horizon report test-decision count, entry count, missing entries, closed/priced count, censored count, observed-only aggregate, and **null full-cohort PnL when any outcome lacks evidence**. No zero for unknown exits. The descriptive comparison eligibility flag requires 20+ priced entries and full evidence; it is NOT a significance test.

## How to run

The original offline dataset bundle must satisfy prior vendor-clock, source-evidence and exchange-session policies. Real, non-synthetic input must pass the Phase 6 independent retained source-artifact SHA256 check. The bundle's `declaredExchangeSessions` must cover all warm-up candles, entries and potential exits; submitted calendars and source records still require human authenticity review.

```bash
# Uses the SAME shape as Phase 7's ADAPTIVE_OPTION_EXIT_REPLAY_V1
# policy, but is a separately specified Phase 8 experiment.
npx tsx scripts/run-adaptive-walkforward.ts \
  /secure/derived-historical-l1.json \
  --source-artifact /secure/original-vendor-source.bin \
  --entry-first-policy /secure/policies/entry-first-v1.json

# Optional: compare BOTH Phase 7 priced-survivor and Phase 8 entry-first
# research summaries (not apples-to-apples policy PnL).
npx tsx scripts/run-adaptive-walkforward.ts \
  /secure/derived-historical-l1.json \
  --source-artifact /secure/original-vendor-source.bin \
  --exit-policy /secure/policies/predeclared-phase7.json \
  --entry-first-policy /secure/policies/entry-first-v1.json
```

Only aggregate and cohort/censor counts are printed by the CLI, not raw licensed quote paths. The Phase 8 option `--entry-first-policy` is explicit; it does not change the meaning of existing `--exit-policy` (Phase 7).

**Example hypothesis policy, uncalibrated, NOT a trading recommendation:** `initialStopFraction=0.20`, `trailActivationFraction=0.20`, `trailingGivebackFraction=0.10`, `maxHoldCalendarDays=2`, `minQuotesPerDeclaredSession=2`, `minIntermediateQuotes=2`, `maxSameSessionQuoteGapMinutes=15`, `maxTriggerToNextQuoteMinutes=5`. Real L1 research needs substantially denser data than permissive synthetic test settings.

## What still needs verification

- No real vendor options-L1 dataset has been supplied; automated tests use **synthetic** fixtures, not 1W/2W/4W/8W market results.
- A complete calendar must be independently verified, including exchange holidays, special sessions and expiry cutoffs. A source-provided calendar alone cannot prove completeness.
- Interval gaps can hide path-dependent intrabar moves; the engine declares its maximum allowed gap but does not prove that a bid was continuously tradable.
- Even a next observed bid with enough L1 depth is NOT a guaranteed execution. Exchange queue priority, broker stop confirmation, partial fills, latency, rejected orders, opening auction gaps and tax/brokerage variation need separate conservative validation.
- The `EMA_BASELINE` arm is still closest strike among the ranker's screened candidates, not an exact replication of the current legacy intraday order engine.
- Empirical edge, full OOS holdout and operational NRML readiness remain **unverified**. The status `DESCRIPTIVE_ONLY` means a complete **source-attested** supplied sample, not approval to trade.

This PR preserves hard false flags `executionAuthorized=false`, `productionSafe=false`, `brokerStopProtectionInstalled=false`, and `profitabilityProven=false` regardless of simulated PnL.
