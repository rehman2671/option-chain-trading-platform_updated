# Adaptive Swing v2 — Phase 5: source-attested historical L1 + walk-forward (OFFLINE ONLY)

**NO BROKER EXECUTION. NO PROFITABILITY CERTIFICATE. NO ACTUAL HISTORICAL TRADES WERE RUN WHEN THIS CODE WAS ADDED.**

Branch is stacked on Phase 4: `research/adaptive-v2-evidence-capture`. Nothing here is wired to Paper, LIVE, NRML, MIS, the strategy dispatcher, trailing-stop placement, or the 15:15 intraday square-off.

## Why Phase 4's REST files are NOT replayable historical L1

Upstox `GET /v2/option/chain` returns present quotes, depth and Greeks, but its documented schema does **not** supply a trusted exchange event timestamp for each bid/ask. An HTTP response receipt timestamp is not an original market event time. The Upstox expired-options historical API provides OHLC/volume/OI candles but **not** historical options L1 bid/ask depth and Greeks. Neither archive can be relabeled as full historical execution pricing.

Official documentation:
- https://upstox.com/developer/api-documentation/get-pc-option-chain/
- https://upstox.com/developer/api-documentation/get-expired-historical-candle-data/

## Required source-attested input

`src/server/engine/ema15m/adaptiveVendorIngestion.ts` defines `VerifiedHistoricalBundleV1`. Prepare a **licensed or originally recorded** event-feed JSON matching this type, then keep the raw vendor files, schema mapping, acquisition receipts and license details separately for independent review. A sample shape (not actual market data):

```json
{
  "schemaVersion": "ADAPTIVE_VERIFIED_L1_BUNDLE_V1",
  "provenance": {
    "datasetId": "IDENTIFY_YOUR_DATASET",
    "vendor": "IDENTIFY_VENDOR_OR_EVENT_FEED",
    "licenseOrEntitlementReference": "INDEPENDENT_REVIEW_REFERENCE",
    "sourceArtifactSha256": "64_hex_characters_for_original_source",
    "collection": "ORIGINAL_EVENT_FEED_ARCHIVE",
    "timestampBasis": "ORIGINAL_EXCHANGE_OR_VENDOR_EVENT_TIME",
    "originalAvailabilityTimestampRecorded": true,
    "synthetic": false,
    "calendarSource": "DOCUMENTED_EXCHANGE_TRADING_CALENDAR",
    "expectedSessions": ["2026-09-01"]
  },
  "instrument": "NIFTY",
  "underlyingKey": "NSE_INDEX|Nifty 50",
  "maximumOriginalFeedLatencySeconds": 3,
  "sessions": [
    {
      "sessionDate": "2026-09-01",
      "decisionAt": "2026-09-01T06:30:00.000Z",
      "underlyingCandles": [
        "100_OR_MORE_ACTUAL_CLOSED_START_TIMESTAMPED_15M_OHLC_OBJECTS"
      ],
      "contracts": {
        "eventAt": "2026-09-01T06:25:00.000Z",
        "availableAt": "2026-09-01T06:25:01.000Z",
        "sourceRecordId": "ORIGINAL_SOURCE_REFERENCE",
        "data": ["FULL_POINT_IN_TIME_LISTED_CONTRACT_OBJECTS"]
      },
      "chains": [
        {
          "eventAt": "2026-09-01T06:26:00.000Z",
          "availableAt": "2026-09-01T06:26:01.000Z",
          "sourceRecordId": "ORIGINAL_CHAIN_SOURCE_REFERENCE",
          "data": {
            "expiry": "2026-09-09",
            "rows": ["ORIGINAL_OPTION_CHAIN_L1_AND_GREEKS_ROWS"]
          }
        }
      ]
    }
  ],
  "executionL1": [
    {
      "eventAt": "2026-09-01T06:31:00.000Z",
      "availableAt": "2026-09-01T06:31:01.000Z",
      "sourceRecordId": "ORIGINAL_EXECUTION_QUOTE_REFERENCE",
      "instrumentKey": "NSE_FO|12345",
      "bid": 99,
      "ask": 100,
      "bidQty": 100,
      "askQty": 100
    }
  ],
  "policy": {
    "holdCalendarDays": {"1W": 1, "2W": 3, "4W": 5, "8W": 10},
    "slippageBpsPerSide": 10,
    "feesAndTaxesINRPerSide": 5,
    "maxSnapshotAgeMinutes": 5,
    "maxEntryDelayMinutes": 10,
    "maxExitDelayDays": 2,
    "minCalendarDaysBeforeExpiry": 2,
    "folds": [
      {
        "trainStart": "2026-07-01",
        "trainEnd": "2026-07-31",
        "testStart": "2026-08-18",
        "testEnd": "2026-08-31"
      }
    ]
  }
}
```

**This JSON is schema illustration only.** Strings describing arrays are placeholders, NOT valid runnable market fixtures. The dates, expiry, prices, policy settings and risk levels above are illustrative, uncalibrated examples; use actual exchange calendars, actual contracts, and pre-registered holding/fee assumptions instead. The dataset must contain one real decision record per expected exchange session, 100+ historical closed 15m index bars per decision, actual listed CE/PE instrument keys/expiry/strike/lot size, dated option-chain L1/Greeks snapshots, and *independent subsequent option L1 quotes* for entry AND exit. Do not backfill missing days, invent bid/ask from LTP/OHLC, use future master contracts, or select only favorable trades.

## Anti-lookahead and quality gates

- `eventAt` is the source's original market event time; `availableAt` is when the strategy would **actually have received that event** in its original recorded feed. These are not the date when a vendor file was downloaded.
- Both clocks must be provided, ordered and within an explicit maximum original feed latency (no more than 300 seconds accepted). Decision contracts and chains must have arrived **before** `decisionAt`. Replayed option execution prices use their **original availability time**, NOT their earlier event time.
- Reject duplicate/conflicting instrument quotes at the same event time; missing session history; invalid OHLC or forming candles; bad contract identities; incorrect CE/PE/expiry; invalid bid/ask/depth; and unverified source format.
- `provenance.quoteTimestampQuality` is recorded downstream as `SOURCE_ATTESTED_EVENT_TIME`. This is a **self-declared provenance class**, not independent authentication. Analyst must inspect original feed/vendor records, licensing, capture latency and file integrity before interpreting any performance.
- Real observed illiquid quotes can cause `NO_LIQUID_CONTRACT` and remain part of sample. A malformed/missing L1 field must never be replaced with made-up liquidity.
- All train/test boundaries are chronological; the base comparison enforces an embargo spanning the maximum holding period plus exit search window to reduce outcome overlap. No use of future data for strike selection.

## Offline analysis

```bash
# No network requests and no broker tokens used.
npx tsx scripts/run-adaptive-walkforward.ts /secure/datasets/historical-option-l1.json
```

It prints a compact **aggregate-only** report with:
- Source-attested data counts and errors.
- Out-of-sample metrics for baseline, regime-filter and regime+ranked contract across 1W/2W/4W/8W expiry buckets.
- The same dated inputs under four *pre-registered* sensitivity policies: BASE; 2x charges/slippage; a 50bp bid discount plus 50bp ask markup; both stresses combined.
- Decision-paired comparison counts between baseline and alternate policies; unmatched trades disclosed rather than pretending a fair paired PnL difference.
- Realistic **bid/ask + cost adjusted** net PnL, drawdown, turnover, holding time and missing exit/entry evidence. Depth is a necessary but not sufficient fill assumption. The scenario stress is a sensitivity diagnostic, not a statistically calibrated market-impact model.

The strongest study status is `DESCRIPTIVE_ONLY`. `empiricalProfitabilityProven=false`, `productionSafe=false`, `executionAuthorized=false`, and `sourceAuthenticityIndependentlyVerified=false` are **always** returned. Insufficient evidence returns `INCOMPLETE_EVIDENCE` or `REJECTED`. Synthetic fixture test results **cannot** be represented as market performance.

## Known research limitations

- Current `EMA_BASELINE` is **nearest strike among the ranker's screened candidates**, not a faithful full legacy EMA15M broker-entry policy. Hence outputs compare research *variants*, not current real execution PnL.
- Exit policy remains fixed **calendar days**, not broker-native SL, adaptive trailing, stop fill, volatility-adjusted target, holiday-aware expiry exit or NRML rollover. No overnight risk limit is implemented as a broker instruction.
- No independent vendor authentication, official exchange-session calendar integration, order queue position, realistic depth-consuming market impact, staggered/partial fills, gap path reconstruction, Monte Carlo confidence interval, parameter search or protected OOS holdout certification yet.
- OOS folds, source assertions and a green test suite do **not** prove edge, strategy safety or readiness. Preserve and manually review raw failures, missing datasets and slippage sensitivity before considering paper positional trials.
