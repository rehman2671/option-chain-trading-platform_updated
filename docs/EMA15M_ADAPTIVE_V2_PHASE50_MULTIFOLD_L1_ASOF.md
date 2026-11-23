# Adaptive Swing v2 Phase50 — multi-fold original option L1 available-at coverage

**DRAFT / offline-only / stacked on Phase49. No real source feed imported, no independent licensed vendor attestation, no performance proof, no broker order, no NRML or GTT writes.**

## Exact unresolved evidence problem

The Phase48/49 four-path join can cover the specific four original option paths supplied by an operator, even if those paths are a tiny, potentially cherry-picked fragment of the available market and strategy decisions. A single test day cannot support stability across 1W/2W/4W/8W option horizons, regimes, expiry schedules or volatility conditions.

A second causal issue: the original Phase8 entry-first algorithm selects option quotes in **source event-time order**, but an original quote can arrive after a later event-time quote, or after the policy entry deadline. The historical replay therefore needs an independently checked, original-availability-first as-of audit before its selected entries can count as descriptively source-backed.

Phase50 is a narrow **research-only gate**, not a strategy change, feed importer, or real-market backtest.

## New behavior

- Pure `auditPhase50MultifoldL1AsOfCoverage(input, pins)` first pins the **entire original historical source dataset** SHA256, study ID, chronological fold count, full fold-indexed OOS decision manifest SHA256 and expected test decision / 12-way arm-horizon attempt denominator. The caller supplies these values separately *before* examining OOS market paths. Self-consistent pins do not authenticate the source.
- Re-run the unmodified Phase8 original OOS entry-first cohort, never trust a supplied report. Retain all **fold × OOS decision × 3 arms (EMA_BASELINE, REGIME_FILTER, REGIME_AND_RANK) × 4 horizons** (1W/2W/4W/8W), including no-signal, insufficient history, missing listed contract, filtered entry, cooldown, expiry buffer and missing chosen-contract quotes.
- For each original selected contract and decision-time entry window, inspect **every** original L1 quote, including depth-insufficient observations, not just the winning entry tick. Reject unknown, retroactive or excessive (`availableAt - observedAt`) source availability against separately predeclared maximum lag. Each original observed entry must match the **first quantity-qualified L1 that was actually available within the locked entry deadline**, not merely the earliest source event quote.
- If a second event-time quote arrived earlier than the first event-time quote, report `EVENT_ORDER_DIFFERS_FROM_SOURCE_AVAILABLE_ENTRY_ORDER` and **INCOMPLETE_EVIDENCE**. If the selected L1 was received late, missing, clock-invalid or ordered after the entry deadline, it stays unavailable or unpriced. Do not substitute another attractive contract or invent a price/fill.
- Require prespecified minimum **at least two distinct OOS folds and two different test-session dates**, plus a declared minimum observed-entry count. A one-day/four-path synthetic demonstration is insufficient.
- Report fold/arm/horizon coverage cells, exact source-available attempt count, **unique** observed quote keys, reuse across arms, invalid source clocks, late quotes and missing selected contracts. No PnL/win-rate from these missing original source options.

Passing internal sample only returns `DESCRIPTIVE_MULTIFOLD_SOURCE_COVERAGE_ONLY`; it is an internal syntactic as-of coverage condition. It does **not** establish correct market data licensing, true event/availability timestamps, approved instrument masters, executable fill, OOS profitability or broker stop continuity. All `executionAuthorized`, `productionSafe`, `originalLicensedL1IndependentlyAuthenticated`, `vendorHistoricalLicenseIndependentlyVerified`, `trueOriginalAvailableAtVerified`, `unbiasedMultiFoldProfitabilityProven` and `brokerStopAckOrOvernightProtectionVerified` remain **false**, with `nativeOrderInstruction=null`.

## Synthetic CI tests

`src/quant/tests/ema15m_adaptive_phase50_multifold_l1_asof.test.ts` replays the existing fabricated historical chain, original contract catalog and option L1 with **two separate embargo-valid** OOS test days. Adversarial tests cover:
1. one test fold cannot falsely become multi-fold evidence;
2. missing source quotes for the originally chosen contract do not disappear;
3. missing or retroactive `availableAt` fails even when prices are unchanged;
4. event-time versus source-availability-time selection disagreement fails;
5. entry quotes arriving only after the declared deadline fail;
6. tampering historical source bytes and the pinned OOS-session denominator fails;
7. repeated arm references to the same original quote never count as independent observations.

These are synthetic software invariants, **not** an actual data-backed Indian-market options study.

## Manual private no-egress review

Two pre-existing owner `0600` JSON files in owner `0700` absolute real directories, with no symlink and operator-enforced network isolation:

```bash
npx tsx scripts/audit-adaptive-phase50-multifold-l1-asof.ts \
  --approve-isolated-offline-review \
  --private-multifold-original-option-l1 /private/phase50-original-oos.json \
  --independent-prespecified-multifold-pins /private/phase50-independent-pins.json
```

The first file is a `Phase50MultifoldInput` containing the complete `HistoricalComparisonInput`, including unchanged OOS decision-time closed candles, contemporaneous option chains/catalog, source event-time plus original source `availableAt`, BID/ASK/depth and declared folds. The second is a separately prespecified `Phase50IndependentPins` including original SHA256, OOS session manifest hash, denominators, minimum folds/days/entries and maximum permitted original availability lag. CLI emits only redacted aggregate counts/status and negative-proof flags. Neither original option keys, quotes nor private source paths are printed.

Private manual exit code 0 only means internal coverage of the supplied material, **not** licensed market-data rights, independently authenticated source, all-market sessions, paper/live profit, or real executable orders.

## Still blocked

Authentic, appropriately licensed original historical index-option BID/ASK+depth with issuer timestamps and verified as-of availability; independent session/expiry/lot-size amendments and entitlement verification; robust unseen chronological OOS datasets with original sampled candidates including delisted/dead contracts, full IV/theta and transaction costs, multi-market gap and zero-recovery downside; independent native broker order/GTT ACK/cancel/replace and overnight stop continuity.

Keep existing release issues #17–#22 including #20 OPEN. Do not merge for trading or connect a broker. EMA23/50 **MIS** intraday 15:15 squareoff remains unchanged. **NRML positional** 1W/2W/4W/8W has **no forced 15:15 exit** and no new live order activity.
