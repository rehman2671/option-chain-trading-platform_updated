# Adaptive Swing v2 — Phase 10 historical option L1 readiness and liquidity audit

**RESEARCH ONLY — no broker orders, no live/NRML activation, no change to EMA23/50 MIS 15:15 square-off.**

## Goal: market-data quality before strategy profitability claims

Phase 10 does **not** invent option historical bid/ask data, assume a 100-point NIFTY move becomes 100 option-premium points, or declare 1W/2W/4W/8W profitable. It audits how well a separately sourced and licensed historical L1 feed can support the prior entry-first walk-forward/positional work.

Real option markets can exhibit large overnight gaps, IV-driven moves, thin order-book depth, wide bid/ask spreads, receipt/event clock discrepancies and missing execution evidence. Even a correctly timestamped vendor snapshot does not guarantee a fill at displayed bid.

## New isolated module

- `src/server/engine/ema15m/adaptiveL1MarketDataQuality.ts`
- Function: `auditAdaptiveL1MarketDataQuality(input, declaredSessions, originalL1, policy)`
- Input: validated `HistoricalComparisonInput` produced by the earlier strict vendor ingestion, externally declared session windows, **original historical event/availability L1 records**, and a **pre-registered** quality policy.
- Output: `AdaptiveMarketDataQualityReport` with group cells for every **out-of-sample fold × strategy arm × 1W/2W/4W/8W expiry bucket**, and entry-first quote-path diagnostics.
- No broker HTTP, database mutation, simulated fills or trading permissions.

### What is evaluated

1. **Original source evidence consistency**: reject missing, duplicated, malformed or conflicting original L1 records. Each original source `eventAt`, `availableAt`, bid/ask/depth must match the derived replay quote. A feed event that became available later is not moved backward to a fictitious decision time. Compare original event-to-availability lag against the predeclared maximum.
2. **No survivor-only sample**: reconstruct the Phase 8 out-of-sample entry-first decision cohort with its original point-in-time ranker and fixed, predeclared exposure cooldown. Count no-signal, unavailable candidate, missing entry, and actual entry separately.
3. **Fixed-hold data window**: check quotes from the originally recorded *post-decision entry* to the policy's predeclared fixed-hold exit/grace window, not merely until an unusually favorable first profitable exit.
4. **Session coverage**: check original declared trading windows for each intersecting session. Include the first and last parts of sessions in quote-gap checks, enforce minimum observations per session, and flag quotes on dates missing from the submitted calendar. The external calendar's completeness is **not** independently authenticated.
5. **Bid/ask and depth**: calculate percent bid/ask spread from displayed midpoint, fraction of observations above a specified spread ceiling, and proportion with sufficient bid quantity measured in entire option lots. The **first** bid at/after scheduled fixed-hold due is checked for age and depth; a later favorable quote may not replace it.
6. **Overnight gap analysis**: calculate adverse option-bid changes between the last observed bid of one declared session and the first bid of the next. A large genuine adverse gap is **preserved as a risk alert**; it does not make the feed invalid or imply the originally hoped-for stop-price fill occurred.
7. **Full evidence denominator**: every fold × arm × horizon has entry, missing entry, quality-pass and incomplete-path counts. Missing/unsafe observations keep a cell `sufficientForDescriptiveQualityReview=false`. A small sample also fails the predeclared minimum.

`DESCRIPTIVE_ONLY` is the **maximum possible** audit status when all supplied synthetic/source-attested quality checks happen to pass. It is NOT a real-market performance confirmation or a production authorization. If a fold/horizon lacks examples or required quote observations, the report remains `INCOMPLETE_EVIDENCE`. `REJECTED` denotes a structurally invalid input or policy.

## Optional predeclared CLI flag

Use the existing **offline** study CLI:

```bash
# Source-artifact is mandatory for any non-synthetic dataset.
npx tsx scripts/run-adaptive-walkforward.ts \
  /secure/source-attested-verified-l1-bundle.json \
  --source-artifact /secure/original-historical-vendor-bytes.bin \
  --market-data-policy /secure/predeclared-market-quality-v1.json
```

This runs Phase 6's original-source SHA-256 check and previous ingested walk-forward research before the new quality audit. The additional policy is explicitly opt-in and separate from the Phase 7 `--exit-policy` and Phase 8 `--entry-first-policy`. CLI prints **aggregate** fold/arm/horizon metrics, quality pass/censored counts and quality-failure reason counts, **not** raw licensed per-contract L1 data.

Example `ADAPTIVE_MARKET_DATA_QUALITY_V1` configuration (**illustrative, uncalibrated and NOT trading advice**):

```json
{
  "schemaVersion": "ADAPTIVE_MARKET_DATA_QUALITY_V1",
  "minimumObservedEntriesPerArmHorizon": 20,
  "minimumL1QuotesPerDeclaredSession": 30,
  "maximumWithinSessionQuoteGapMinutes": 10,
  "maximumFixedDueExitQuoteDelayMinutes": 5,
  "maximumSourceEventToAvailabilitySeconds": 5,
  "maximumBidAskSpreadBps": 200,
  "maximumWideSpreadQuoteFraction": 0.05,
  "minimumBidDepthMultipleOfLot": 1,
  "minimumSufficientBidDepthQuoteFraction": 0.9,
  "overnightAdverseBidGapAlertPercent": 25
}
```

**Important:** `minimumObservedEntriesPerArmHorizon=20` is a *minimum descriptive* threshold, **not** proof of robust edge, statistical power or live suitability. Real historical feed density may require substantially tighter time/coverage rules and appropriate broker-tick/market-depth constraints. Parameter thresholds must be registered before looking at untouched OOS results. Cost-stress tests from Phase 5 are separate.

## Limitations and release blockers

- **No real vendor market data was supplied.** The deterministic tests construct **synthetic** date-stamped original/availability observations and intentionally corrupt quote paths, spread/depth, event lag, session coverage and exit-bid evidence. Successful tests prove the controls respond as coded, not that a strategy earns money.
- Original feed clocks are source-attested only; a matching SHA of separately retained source bytes **does not independently authenticate** the vendor or prove timestamps are truthful.
- Exchange special sessions, trading holidays and expiry changes need an independently checked official calendar. A submitter can omit a real session even if all supplied windows appear internally consistent.
- Quotes are L1 displayed values, not fill confirmations: execution queue, price impact, partial fills, cancelled/unknown native broker stops, GTT triggers, opening auction and unexpected outages are NOT resolved by this audit.
- Large observed adverse gaps and time decay/IV events remain possible even in high-density, good-spread historical options. A "quality pass" is not a "safe trade."
- The Phase 8 entry-first cohort's fixed exposure cooldown is a research policy, not a complete recreation of the current legacy EMA15M live execution. Comparison methods must be independently reviewed.
- Operational NRML execution requires separately validated broker-authoritative position/order/GTT reconciliation, persistent restart-safe transactional state, approved risk limits and human authorization. Phase 9 currently models these only with simulated broker fixtures.

All outputs explicitly set `executionAuthorized=false`, `productionSafe=false`, `empiricalProfitabilityProven=false`, `sourceAuthenticityIndependentlyVerified=false`, `exchangeCalendarIndependentlyVerified=false` and every cell `productionEligible=false`.
