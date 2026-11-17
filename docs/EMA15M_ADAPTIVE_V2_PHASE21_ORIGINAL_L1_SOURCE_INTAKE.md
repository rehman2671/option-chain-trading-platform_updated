# Adaptive Swing v2 — Phase 21 original historical option L1 source acquisition and independent delivery intake

**OFFLINE · DRAFT · NO BROKER · NO NRML ORDERS · NO MIS/15:15 CHANGE · NOT AN EXCHANGE-AUTHENTICATED DATASET OR PROFITABILITY CERTIFICATION**

## Why Phase 21 is different from another synthetic strategy rule

Phases 1–20 implement research checks: point-in-time contracts and original option L1 entries, missing next-bid exit censoring, original 1W/2W/4W/8W cohort matching, IV/theta/liquidity/overnight alerts, expiry-specific market sessions, cost and gap stress, partial +50/+70 → pre-+100 premium reversals, multi-fold loss/drawdown and multiplicity. None can establish real-market performance **until genuine licensed historical option BID/ASK + quantity files and independently trustworthy original strategy-availability timestamps arrive**.

This phase creates the first separate, practical **vendor-delivery onboarding acceptance gate**. It does not download, buy or fake the exchange data. Nor does it certify an operator's typed license ID.

## Data product due diligence before buying

**NSE Data & Analytics** differentiates (1) EOD/bhavcopy, (2) *Historical Trade Data*, and (3) *Historical Order & Trade Data* (including F&O) on its subscription page:

https://www.nseindia.com/static/market-data/eod-historical-data-subscription

NSE separately describes Level 1 as **best bid and best ask**, Level 2 as up to five bid/ask levels, and Level 3 as up to twenty. Authorized vendors may supply a suitable licensed feed, but the actual technical specification and historical availability must be confirmed in writing:

https://www.nseindia.com/static/market-data/real-time-data-subscription

**Critical:** An historical order-and-trade event stream MAY support reconstruction of an order book if every relevant add/change/cancel/trade, session state, sequence and original timestamp is present, correctly replayed, exchange-local contract mapping is complete, and an independent reviewer certifies it. It is **not automatically a native L1 BID/ASK feed**, nor is an exchange event timestamp an original past strategy client receipt timestamp. A download in November 2026 cannot prove what a bot actually received in 2024. An EOD bhavcopy or historical trade print is especially not a historical executable premium BID.

**BSE SENSEX requires separate BSE original equity-derivative notices and licensed feed records**. NSE sessions or product descriptions cannot authenticate BSE option contracts or its source licensing.

## Send this requirement to the chosen authorized data provider

Request a **licensed, legally retained, original individual index-options F&O event archive**, not screenshots or underlying 15-minute OHLC:

- Exactly named **NIFTY / BANKNIFTY / SENSEX** with exchange and segment, original as-listed and as-expired CE/PE contract IDs, original tick/lot/strike/expiry master, instrument additions/withdrawals/corrections. The four *research horizons* 1W/2W/4W/8W are **desired remaining-expiry buckets, not a guarantee that every exchange/index offered those contract types at each historical time**; absent contemporaneously listed expiries must remain ineligible.
- **Best bid, best ask, bid quantity and ask quantity at original event time**, original sequence/order-book state and full reconstruction lineage if the vendor supplies only order/trade events. Include replayed book state at opens, special sessions, cancellations/halts, restart/gap handling and quantity units vs lots. Provide the ORIGINAL archived vendor bytes, SHA256 and technical version / field dictionary.
- Source **eventAt** and independently documented **historical data-to-original-strategy availableAt** semantics. Contemporaneous captured receipt logs (where available) are different from a post-hoc simulated network latency or today's file-delivery timestamp. Without true past client receipt records, document this uncertainty and block independent original-clock claims.
- ALL trading, nontrading, special session, market-interruption and expiry-day records for the complete OOS + warm-up + full positional hold/exit history, including *losing, choppy, volatile, low depth and gap sessions*. Do not accept an archive clipped to winning decision dates.
- Legal entitlement terms confirming whether the user may **store, reproduce, run offline OOS backtests and internally audit** original data, and whether the archive may be shared with an independent reviewer. Keep invoice/account identities, entitlement details and vendor secrets **out of public GitHub, code, logs and JSON report**.
- Independently acquired **original exchange trading-calendar, holiday/emergency/special notices, instrument listing/expiry changes, official publication/effective dates**. Preserve separate original document bytes and source record IDs; a vendor-generated calendar cannot independently verify itself.

Before accepting a subscription, ask for a *representative licensed sample* whose **true best BID/ASK + displayed quantities** can be reconciled against the original option-contract catalog, sequence, source sessions and availableAt record. Do not infer native historical L1 from a product's "historical" label alone.

## Phase 21 source intake schema

`ADAPTIVE_EXTERNAL_ORIGINAL_SOURCE_INTAKE_V1` is a JSON ledger **supplied separately from**:

1. Phase 5 original verified historical bundle JSON,
2. ORIGINAL licensed vendor-feed/archive bytes,
3. Phase 15 independently supplied FULL day-by-day exchange calendar JSON,
4. separately retained ORIGINAL calendar source-document bytes,
5. the intake manifest itself.

The intake manifest's original SHA256s must match **all four distinct original files**; the bundle's declared vendor source hash and the calendar's declared original document hash must match as well.

| Manifest field | Required interpretation |
|---|---|
| `studyProtocolId`, `datasetId`, `instrument`, `exchange` | Must match the Phase 16/17 signed original study protocol and index/venue |
| `originalBundleSha256`, `originalVendorArchiveSha256` | Original exact bytes, not copied prices or an API receipt |
| `separatelySuppliedCalendarManifestSha256`, `separatelySuppliedCalendarDocumentSha256` | Different source/calendar bytes and evidence custody |
| `sourceProductCategory` | One of `CONTEMPORANEOUS_NATIVE_LEVEL1_CAPTURE`, `LICENSED_HISTORICAL_NATIVE_LEVEL1_ARCHIVE`, `HISTORICAL_ORDER_TRADE_EVENTS`, `HISTORICAL_TRADE_ONLY`, `END_OF_DAY_BHAVCOPY`, `SYNTHETIC` |
| `quoteMethod` | `ORIGINAL_NATIVE_BEST_BID_ASK_AND_BEST_LEVEL_QUANTITY`, `RECONSTRUCTED_BOOK_FROM_ALL_ORDER_MESSAGES` or `TRADE_AS_PROXY_FOR_BID_ASK` |
| `strategyAvailableAtMethod` | `CAPTURED_AT_ORIGINAL_STRATEGY_RECEIPT`, `HISTORICAL_REPLAY_ESTIMATE` or `LATER_IMPORT_OR_FILE_DOWNLOAD_TIME` |
| `entitlementDocumentReferenceId` | An OPAQUE record ID, **never** entitlement document / invoice / secret in JSON |
| `originalSourceDeliveryReferenceId` | Opaque vendor original delivery record ID |
| `contemporaneousCaptureEvidenceReferenceId` | Opaque record ID of independently inspectable ORIGINAL receipt/capture evidence; the ID alone is not proof |
| `coverageStart`, `coverageEnd`, `tradingDays[]` | Exactly ALL trading days from separate Phase 15 calendar, one each, ordered, with unique `originalDeliveryRecordId`, exact source `originalBestBidAskEvents` and `originalStrategyDecisions` counts |

The validator checks exact original file/object identity, source hash chain, known CE/PE instrument keys, timestamps and duplicate vendor source IDs, original event/available order and declared feed maximum lag, independent exchange day-by-day coverage, and exact **original option L1 row count per session and original decision count per session**.

If an exchange trading session lacks L1, the intake status remains **INCOMPLETE**. A zero-count ledger row correctly discloses the gap instead of hiding it; it does not allow treating that date as a nontrading day or a winning zero-return day.

### Minimal shape (FAKE placeholders only, do not treat as market records)

```json
{
  "schemaVersion": "ADAPTIVE_EXTERNAL_ORIGINAL_SOURCE_INTAKE_V1",
  "studyProtocolId": "EXTERNALLY_PINNED_STUDY_ID",
  "datasetId": "AUTHENTIC_USER_DATASET_ID",
  "instrument": "NIFTY",
  "exchange": "NSE",
  "originalBundleSha256": "<sha256-of-exact-bundle-bytes>",
  "originalVendorArchiveSha256": "<sha256-of-original-retained-vendor-archive>",
  "separatelySuppliedCalendarManifestSha256": "<sha256-of-independent-calendar-manifest>",
  "separatelySuppliedCalendarDocumentSha256": "<sha256-of-original-calendar-source-document>",
  "sourceProductCategory": "LICENSED_HISTORICAL_NATIVE_LEVEL1_ARCHIVE",
  "quoteMethod": "ORIGINAL_NATIVE_BEST_BID_ASK_AND_BEST_LEVEL_QUANTITY",
  "strategyAvailableAtMethod": "CAPTURED_AT_ORIGINAL_STRATEGY_RECEIPT",
  "entitlementDocumentReferenceId": "PRIVATE_ENTITLEMENT_RECORD_ID_ONLY",
  "originalSourceDeliveryReferenceId": "PRIVATE_DELIVERY_RECORD_ID_ONLY",
  "contemporaneousCaptureEvidenceReferenceId": "PRIVATE_RECEIPT_LOG_RECORD_ID_ONLY",
  "coverageStart": "YYYY-MM-DD",
  "coverageEnd": "YYYY-MM-DD",
  "tradingDays": [
    {
      "sessionDate": "YYYY-MM-DD",
      "originalDeliveryRecordId": "SOURCE_DAY_REFERENCE_ID",
      "originalBestBidAskEvents": 123,
      "originalStrategyDecisions": 1
    }
  ]
}
```

**Never copy the placeholder dates, values, assumed expiry/lot sizes or source classification into a genuine source package**. The full-day ledger must be independently reconstructed from the actual source and complete official calendar. A guessed original capture mode must not be relabeled "CAPTURED."

## Run standalone intake BEFORE complex OOS analysis

The standalone tool runs with just the original vendor and exchange source files:

```bash
npx tsx scripts/audit-adaptive-source-intake.ts \
  /secure/original-historical-bundle.json \
  --original-vendor-archive /secure/retained-licensed-option-data.bin \
  --calendar-evidence /secure/independent-full-exchange-calendar.json \
  --original-calendar-document /secure/original-exchange-circular-archive.bin \
  --source-intake-manifest /secure/original-source-intake-ledger.json
```

It requires five distinct canonical real paths (rejects symlink aliases), has size guards, never prints underlying quotes, license IDs, original contract details, sensitive documents or private keys, and returns aggregate counts plus reason codes.

**Highest outcome:** `SOURCE_DECLARATIONS_RECONCILED_EXTERNAL_AUTHENTICATION_REQUIRED`. This is **NOT** proof that the vendor, exchange, data entitlement, native L1 semantics or timestamps are real. A fabricated and perfectly internally consistent synthetic file falsely labeled non-synthetic could reach this descriptive outcome; independent identity/license/source review is still mandatory.

`INCOMPLETE_EVIDENCE` for missing trading-day quotes, trade-only or EOD data, reconstructed original receipt clocks, missing/invalid quote origin, source count mismatch, unknown contract key or fabricated source feed status.

`REJECTED` for missing original raw files, altered/original digest mismatch, in-memory manifest swapping, mismatched calendar venue/coverage, missing/duplicate daily source IDs and invalid schemas.

All outputs hardcode: `executionAuthorized=false`, `productionSafe=false`, `profitabilityProven=false`, `historicalUsageEntitlementIndependentlyVerified=false`, `originalLicensedL1IndependentlyAuthenticated=false`, `originalAvailabilityClockIndependentlyAuthenticated=false`, `exchangeIssuerIndependentlyAuthenticated=false`, `brokerNativeStopProtectionProven=false`.

## Full consolidated evidence gate

In Phase 17's full all-source preflight, the original intake JSON becomes **the tenth exact SHA256-pinned evidence file**, `policyFileSha256.originalSourceIntake` inside the immutable out-of-band research lock. Add the required argument:

```text
--original-source-intake /secure/original-source-intake-ledger.json
```

The full runner recomputes intake against the SAME original vendor archive, original bundle, separate calendar source and signed witness; it checks dataset, protocol and SHA identity across Phase 15, 16, 17 and 21 and rejects bad acquisitions before market-risk approval. Existing Phase 8–20 OOS, matched cohort, spread/depth, runup/reversal, expiry-time and fold-multiplicity checks remain mandatory. No broker route is introduced.

**External acceptance criteria remain open in GitHub #17–#22**; no user data or actual paid feed has been received, and the software cannot buy it, issue an exchange-origin certificate or approve a native NRML stop/GTT on the user's behalf.

**No automatic 15:15 NRML square-off. Existing intraday MIS square-off remains unchanged. All research PRs Draft/unmerged.**
