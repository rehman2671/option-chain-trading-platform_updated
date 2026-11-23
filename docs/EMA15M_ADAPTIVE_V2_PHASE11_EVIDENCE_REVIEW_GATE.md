# Adaptive Swing v2 — Phase 11 external research evidence review gate

**STRICTLY RESEARCH ONLY. No broker API, database mutation, live/paper-order dispatch, NRML activation, or change to existing EMA23/50 MIS / 15:15 square-off.**

## Goal

Phases 5–10 can produce descriptive, synthetic or source-attested reports on long-option entry-first exit experiments, bid/ask market liquidity, observed premium giveback, overnight gaps and cost stress. Those reports are **not** evidence that a trading system can safely make money. A successful unit test, SHA-256 checksum or synthetic backtest must never be promoted directly to trading authorization.

Phase 11 builds a **fail-closed, externally reviewable evidence checklist** which aggregates only internally consistent reports. It makes *no independent verification claim*. At best, it returns `EXTERNAL_REVIEW_REQUIRED`, meaning that the submitted research results may be examined by an independent human/source reviewer. The state **does not authorize any trade**. A source artifact SHA256 match is NOT a vendor signature, independent source authentication, exchange-calendar certification, original event-time attestation or a proof of legal data entitlement.

## Offline implementation

New `src/server/engine/ema15m/adaptiveResearchEvidenceGate.ts` function:

`evaluateAdaptiveResearchEvidenceGate(walkforward, l1QualityReport, entryFirstExitStudy, sourceArtifactAudit, preregisteredPolicy)`

It cross-checks:

- The dataset identity and synthetic/non-synthetic labels between Phase 5 original walk-forward and Phase 10 L1 quality reports. Synthetic data is **always blocked** from external **real-market** evidence review.
- A matching, separately retained source-artifact checksum result from Phase 6. The result remains `CHECKSUM_MATCHED_AUTHENTICITY_UNVERIFIED`; the gate always returns `sourceAuthenticityIndependentlyVerified=false`.
- A predeclared protocol ID and `prespecifiedAt` timestamp **before** the first OOS test fold. The timestamp is still self-declared and does **not** prove prior third-party registration.
- Non-overlapping dated walk-forward test folds, original fold-window consistency and the predeclared minimum test sessions/folds.
- **Decision-time market-regime diversity**, using Phase 6 closed-index-candle classifications: each OOS fold must include the predeclared minimum number of distinct trend/sideways/volatile/transition regimes, with a minimum number of actual observed decision sessions each. Regime × arm × horizon counts must reconcile to the fold's testing-session denominator. At least two regimes are mandatory, including **one directional trend** (up/down) and **one non-trending regime** (sideways/volatile/transition) with predeclared observed-session minimums. A run dominated by one favorable trending regime must not claim generalizable market behavior.
- Exactly 3 policy research arms × 4 expiry horizons per fold, with all four cost-stress scenarios and both paired policy-arm comparisons. Rejects missing/duplicated cells, missing pairs or insufficient paired decisions.
- **Phase 8 entry-first cohort, raw decision records, raw L1 path dispositions and raw exit outcomes** against Phase 10 summary cells: for each fold, arm and 1W/2W/4W/8W bucket, original decision counts, observed/missing entries, priced/unknown exits and data-quality passes must reconcile. A future missing exit cannot be silently dropped or assigned zero P&L.
- The minimum number of **complete, priced** OOS entries in every arm/horizon; no review if censoring, missing entries or poor L1 quality exceed predeclared limits.
- The original fixed-hold study's **separate**, four-way cost stresses: no unpriced entries/exits, unchanged comparable sample, maximum allowed drawdown and maximum allowed combined-cost deterioration. Cost stress on original fixed-hold survivors is not interchangeable with Phase 8 entry-first exit P&L. No strategy's profitability is inferred from it.
- A reproducible SHA256 **of aggregate summary reports and declared policy**, not a fingerprint of original licensed L1 files or a cryptographically signed/immutable artifact.

Outputs are `REJECTED` (malformed or absent inputs), `BLOCKED_INCOMPLETE_EVIDENCE` (synthetic/missing/inconsistent/underpowered evidence) and `EXTERNAL_REVIEW_REQUIRED` (internally consistent package awaiting real independent review). There is deliberately **no READY_FOR_LIVE, CERTIFIED, APPROVED or profitable status**.

Hard false flags: `executionAuthorized=false`, `productionSafe=false`, `profitabilityProven=false`, `brokerOperationalSafetyProven=false`, `sourceAuthenticityIndependentlyVerified=false`, `exchangeCalendarIndependentlyVerified=false`, `timestampProvenanceIndependentlyVerified=false`, `protocolRegistrationIndependentlyVerified=false`.

## How to run (all inputs optional except bundle; Phase 11 requires both Phase 8 and Phase 10 policies)

The original Phase 5/6 offline CLI stays intact; the Phase 11 gate is explicitly opt-in:

```bash
npx tsx scripts/run-adaptive-walkforward.ts \
  /secure/verified-source-attested-historical-l1.json \
  --source-artifact /secure/original-vendor-records.bin \
  --entry-first-policy /secure/preregistered-phase8-exits.json \
  --market-data-policy /secure/preregistered-phase10-l1-quality.json \
  --evidence-gate-policy /secure/preregistered-phase11-evidence-gate.json
```

`--evidence-gate-policy` without the Phase 8 and Phase 10 policies is rejected. A genuine historical dataset still requires separately retained source bytes whose SHA-256 matches its source manifest. Output contains only aggregate study data, horizon/arm cells, blocker codes, review checklist and aggregate summary digest; no source account IDs or raw licensed option quotes. A non-reviewable gate exits nonzero, and a reviewable package **is still not an execution approval**.

Illustrative JSON **not calibrated or recommended for live trading**:

```json
{
  "schemaVersion": "ADAPTIVE_RESEARCH_EVIDENCE_GATE_V1",
  "studyProtocolId": "EXTERNAL_RESEARCH_PROTOCOL_2026_V1",
  "prespecifiedAt": "2026-01-01T00:00:00.000Z",
  "minimumOutOfSampleFolds": 3,
  "minimumTestingSessionsPerFold": 30,
  "minimumPricedEntryFirstExitsPerCell": 20,
  "minimumStressTradesPerCell": 20,
  "minimumPairedDecisionsPerArmHorizon": 20,
  "minimumDistinctMarketRegimesPerFold": 3,
  "minimumDecisionSessionsPerObservedRegime": 10,
  "maximumMissingEntryFractionPerCell": 0.0,
  "maximumCensoredExitFractionPerCell": 0.0,
  "maximumCombinedStressDeteriorationINR": 10000,
  "maximumStressedDrawdownINR": 50000
}
```

Set protocol ID and policy values **before** inspecting untouched OOS returns; the self-declared `prespecifiedAt` only detects obvious chronological contradictions and cannot establish honest preregistration. Even 20 complete examples, 3 regimes or 3 folds are NOT proof of statistical significance or a trading edge. A regime-classifier output itself can be wrong and requires independent comparison to external market conditions. The illustrative INR risk limits cannot be copied to a real account without explicit sizing, capital, tail-risk and regulatory review.

## Mandatory independent/manual reviews AFTER this gate

1. Independently verify vendor licensing, market-data origin, original event times and strategy-time availability; compare to archives from an authoritative external source, not the derived JSON.
2. Independently verify NSE/BSE exchange calendars, holidays, special sessions and contract expiries; check that no missing losing days were omitted from the submitted source calendar.
3. Verify third-party timestamped *original* strategy/policy registration and untouched walk-forward OOS periods. A plausible `prespecifiedAt` field alone is not proof.
4. Audit genuine option depth, bid/ask spreads, opening gaps, IV/theta/time decay effects and stress exit fillability, including unknown/unpriced/partial fills and realistic fees/taxes.
5. Perform significance/uncertainty estimation with independence assumptions, selection bias, economic regime coverage, strategy robustness and full legacy EMA baseline reconstruction as appropriate.
6. Complete a **separate and explicitly approved** operational NRML broker safety architecture with account-specific restart persistence, authenticated position/order/untriggered-GTT reconciliation, protective-order cancel/replace interlocks, expiry handling and risk limits. Phase 9's paper snapshots are simulations, not broker proof.

## Honest current result

**No authentic licensed historical L1 dataset or independently signed vendor/calendar records were provided for this project.** Unit tests use synthetic and purposely forged/self-attested in-memory fixture reports to test both rejection and maximum `EXTERNAL_REVIEW_REQUIRED` mechanics. A fabricated non-synthetic test fixture receiving `EXTERNAL_REVIEW_REQUIRED` demonstrates only that structural gates work as coded—it **does not** establish actual vendor authenticity. The production action flag is permanently false.

This branch remains stacked **DRAFT**, unmerged, and does not change the existing live EMA23/50 MIS strategy.
