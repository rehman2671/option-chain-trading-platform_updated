# Adaptive Swing v2 — Phase 6: Source-artifact, exchange-session and market-regime evidence gates

> Strictly **OFFLINE / RESEARCH-ONLY**. No NRML trading orders, broker-native stops, broker GTT operations, trailing automation, expiry exits, or changes to current MIS 15:15 square-off. Phase 6 is a stacked Draft PR on Phase 5. Green CI is not historical profitability evidence.

## What was missing after Phase 5?

Even an internally consistent vendor JSON can claim event timestamps and SHA256 without proving either. Declared trading calendars can omit holidays, after-hours quotes or entire losing sessions. An aggregate out-of-sample PnL also can hide that a strategy trades only one market regime. Phase 6 adds *defensive checks* and transparent summaries, not verified market performance or a new trading signal.

### 1. Original artifact checksum gate

A **non-synthetic** run of the offline CLI now requires a separately retained original vendor/event-feed artifact whose SHA-256 matches `provenance.sourceArtifactSha256`. This original artifact must not be the derived JSON bundle being evaluated.

```bash
# Authenticated/paid vendor extraction, license review, source archiving and
# declaration of its SHA256 are external/manual prerequisites.
npx tsx scripts/run-adaptive-walkforward.ts \
  /secure/research/derived-historical-option-l1.json \
  --source-artifact /secure/research/original-vendor-archive.bin

# Synthetic test input may run without an original vendor artifact.
npx tsx scripts/run-adaptive-walkforward.ts \
  /secure/research/synthetic-fixture.json
```

A checksum mismatch, absent original artifact, or accidentally supplying the **same file** for both inputs rejects the CLI run. File size is limited to 50 MB per input in this initial offline tool. The SHA256 confirms byte consistency against a declared digest; **it is not a signature, proof of vendor/exchange origin, licensing, correct market timestamps, or that sourceRecordIds identify genuine evidence**. The study keeps `sourceAuthenticityIndependentlyVerified=false` in all circumstances.

### 2. Declared exchange-session window consistency

Every **non-synthetic** `VerifiedHistoricalBundleV1` now needs `declaredExchangeSessions`, a chronological, deduplicated array of source-referenced session windows:

```json
"declaredExchangeSessions": [
  {
    "sessionDate": "2026-09-01",
    "openAt": "2026-09-01T03:45:00.000Z",
    "closeAt": "2026-09-01T10:00:00.000Z",
    "sourceRecordId": "OFFICIAL_CALENDAR_SOURCE_DATE_REFERENCE"
  }
]
```

**These times are a sample structure, not verified live exchange hours.** Use an authentic exchange calendar for each symbol, dated session and special/holiday timetable. Do **not** guess weekdays or construct the calendar from dates for which successful quotes were captured.

The declared calendar must include **all warm-up candle dates**, every decision day, chain event/arrival and **all future observed bid/ask entry/exit quote dates**. A 15-minute bar must end within the declared trading session, not merely begin before close. Execution/chain event and original arrival times must both be inside corresponding windows. Missing or incorrect windows, invalid intraday quotes and duplicate archive source record IDs are rejected. Contract-catalog snapshots may originate outside market trading hours, but they must have arrived before the relevant decision. No automatic after-hours fill assumption.

The software checks the *consistency* of externally supplied windows, not authenticity of that exchange calendar. A forged calendar could still pass and needs independent review.

### 3. Regime-aware untouched out-of-sample reporting

Phase 5's `runAdaptiveWalkForwardStudy()` now includes `marketRegimeAudit`. It derives each decision's regime solely from historical **closed 15-minute index candles** and groups actual already-priced OOS trades by `TREND_UP`, `TREND_DOWN`, `SIDEWAYS`, `VOLATILE`, `TRANSITION` (and unavailable labels).

For each fold, policy arm and 1W/2W/4W/8W expiry horizon, the descriptive breakdown provides:

- Observed decision sessions in that regime, priced closed trade count, observed PnL and average observed PnL.
- Null PnL for regimes without priced closed trades. No fabricated flat or favorable fill; unpriced entry/exit counts remain in original fold metrics.
- A small-sample warning: `adequateSampleForDescriptiveUse` remains false until at least 20 priced trades in that cell **and** full-price-evidence requirement for that arm/horizon. This is NOT statistical significance.

All regime-audit outputs explicitly keep `causalEffectEstablished=false`, `sourceAuthenticityVerified=false` and `executionAuthorized=false`. OOS breakdowns are NOT used to tune and re-evaluate on those same OOS dates. No adaptive exits or volatility-based position management are implemented by this report.

## Still blocked

1. Supply independent **licensed real historical option L1 bid/ask/depth, point-in-time Greeks/contract identifiers**, including genuine quote **original availability clocks** and later exit observations; verify raw vendor evidence and declared exchange-session calendar.
2. Run repeated, untouched OOS windows with real market data and examine missing-data incidence, liquidity shocks, spreads, overlapping positions, holiday/special-session logic, 1W/2W/4W/8W expiry buckets, separate trend/chop regimes, fee sensitivity and enough observations for uncertainty analysis.
3. The existing baseline remains the *nearest strike in the ranker's screened pool*, NOT a fully faithful historic replica of live EMA broker execution. A positive result, if any, does not establish an implementable trading edge.
4. Independently implement and sandbox-test a persistent broker-authoritative NRML positional lifecycle, native protective stop reconciliation, overnight gap stress, policy-based exits and expiry management only after research and operational approval.

No actual broker tokens, paid vendor market data or true historical profit results are created by this PR.
