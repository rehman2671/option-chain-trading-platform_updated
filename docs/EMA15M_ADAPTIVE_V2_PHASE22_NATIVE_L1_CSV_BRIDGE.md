# Adaptive Swing v2 — Phase 22 ORIGINAL native Level-1 CSV bridge

**OFFLINE RESEARCH ONLY · DRAFT/UNMERGED · NO BROKER · NO MIS/NRML EXECUTION · NO PROFITABILITY CLAIM**

## Why this is useful

The Phase 21 data-acquisition intake already checks whether an original historical NIFTY/BANKNIFTY/SENSEX option BID/ASK archive was independently retained, whether all trading days were covered, and whether original strategy-availability times are actually available. Until now there was no bounded import bridge for an **original vendor-native Level-1 CSV archive** into the Phase 5 source-bundle shape. Phase 22 supplies that bridge and reconciles original source prices—not a new synthetic strategy.

**It does not fetch, purchase, invent, or authenticate quotes.** The operator must obtain a license to locally retain/use the feed and a genuine original CSV, original contract catalogs / index candles / option chains, a separate complete exchange calendar and original client-receipt clock evidence. Mapping a vendor-supplied `availableAt` column is not enough to prove actual strategy client receipt: independent logs or other credible source-clock provenance must be reviewed.

## Input: four distinct original files + one independently pinned mapping SHA

1. **Original historical Phase 5 bundle JSON**, with provenance, original decision-time 15m CLOSED index candles, point-in-time as-listed CE/PE option contracts, original contract and chain capturedAt, independent source calendar reference, original source feed checksum and study fold policy. Its `executionL1` MAY be empty while importing (or may already contain all exactly matching observations to independently verify); the other content must have real original-source evidence. This bridge **does not invent** candles, Greeks, strikes, availableAt or expiries.
2. **Original licensed source-native L1 CSV bytes**, retained unmodified. The vendor archive exact SHA256 must equal `provenance.sourceArtifactSha256` in the original bundle and `originalVendorCsvSha256` in the mapping JSON.
3. **Separate full day-by-day NSE/BSE exchange calendar evidence JSON** from Phase 15, containing every CLOSED and TRADING day. Actual original exchange issuer provenance must be reviewed separately.
4. **Pinned CSV column mapping JSON**, `ADAPTIVE_NATIVE_L1_CSV_BRIDGE_V1`, whose **raw file SHA256 is independently pinned OUT OF BAND** and given through `--pinned-column-map-sha256`. A self-asserted SHA inside the same file proves nothing; the operator must preserve the approved pin separately.

The selected product must truly be an original native best bid/ask plus quantities archive or independently captured original client L1 feed. Do not rename trade prints, EOD bhavcopy or reconstructed order/trade messages as "native L1". A different vendor format such as binary order/trade events requires a dedicated audited parser and state reconstruction—not this CSV adapter.

### CSV example — field names and sample values are **synthetic illustration ONLY**

```csv
source_record_id,original_seq,instrument_key,event_at,original_client_received_at,best_bid,best_ask,bid_units,ask_units
DEMO_FAKE_001,310,NSE_FO|100001,2026-11-02T09:40:00+05:30,2026-11-02T09:40:01+05:30,99.5,100.5,650,650
DEMO_FAKE_002,311,NSE_FO|100001,2026-11-02T09:40:15+05:30,2026-11-02T09:40:16+05:30,102.0,103.0,650,650
```

- This is NOT an actual NSE contract or trade, and no real exchange session is asserted by these fake rows.
- L1 price units are INR **per option unit**, not the NIFTY underlying price or total lot premium. Quantity is **underlying units, not lots**; example: 650 means 650 underlying units, not 650 lots. Actual historical lot sizes must come from original contract masters.
- Timestamps require full ISO-8601 date/time/seconds with explicit `+05:30` offset or `Z` and an actual original exchange event and originally captured client-receipt time, never today's downloaded/file-import timestamp.
- `sourceRecordId` must be stable and unique (including across original contract/chain source IDs). `sourceSequence` must strictly increase within each contract × trading day; source event times for that contract/day must also strictly increase. This is a **declared per-instrument** sequence, not an automatic claim that vendor-global exchange packet IDs are contiguous.
- Only a genuine original, fully retained source stream can demonstrate that no option quote rows, expiring instruments or losing days were omitted. This bridge counts ALL trading days from the separately supplied calendar; a day with no option quotes remains blocked, not zero-P&L.

### Example mapping file — placeholders, never approved authenticity

```json
{
  "schemaVersion": "ADAPTIVE_NATIVE_L1_CSV_BRIDGE_V1",
  "datasetId": "USER_ORIGINAL_DATASET_ID",
  "instrument": "NIFTY",
  "exchange": "NSE",
  "originalVendorCsvSha256": "REPLACE_WITH_REAL_CSV_SHA256_64_HEX",
  "sourceProductCategory": "LICENSED_HISTORICAL_NATIVE_LEVEL1_ARCHIVE",
  "originalStrategyClockMode": "CAPTURED_AT_ORIGINAL_CLIENT_RECEIPT",
  "priceUnit": "INR_PER_OPTION_UNIT",
  "bidAskQuantityUnit": "UNDERLYING_UNITS_NOT_LOTS",
  "originalSequenceScope": "PER_INSTRUMENT_PER_TRADING_SESSION",
  "columns": {
    "sourceRecordId": "source_record_id",
    "sourceSequence": "original_seq",
    "instrumentKey": "instrument_key",
    "eventAt": "event_at",
    "originalAvailableAt": "original_client_received_at",
    "bid": "best_bid",
    "ask": "best_ask",
    "bidQty": "bid_units",
    "askQty": "ask_units"
  }
}
```

**Do NOT set** `originalStrategyClockMode=CAPTURED_AT_ORIGINAL_CLIENT_RECEIPT` just to pass the gate. It must reflect independent original historical receipt records; a post-hoc fixed-offset, reconstructed or later-imported timestamp must be declared `HISTORICAL_REPLAY_ESTIMATE` or `LATER_FILE_IMPORT` and is blocked. The parser cannot independently authenticate the stated clock mode, venue, real market, account's data entitlement or historical vendor archive.

The original raw file may contain extra provider fields, but only the precisely mapped nine fields enter the derived `VendorExecutionL1`; all licensed provider fields and original bytes stay private.

## Run one local OFFLINE validation

```bash
npx tsx scripts/import-adaptive-native-l1-csv.ts \
  /secure/original-nifty-research-bundle.json \
  --original-native-l1-csv /secure/original-vendor-native-option-l1.csv \
  --calendar-evidence /secure/independent-original-exchange-calendar.json \
  --column-map /secure/preapproved-native-l1-csv-column-map.json \
  --pinned-column-map-sha256 PUT_SEPARATELY_APPROVED_64_HEX_SHA256_HERE
```

The CLI rejects duplicate/aliased input paths, files larger than defined bounds, missing/duplicate headers, malformed RFC-style quoted CSV, invalid UTF-8, broken row widths, missing required fields, nonpositive/invalid bid/ask, bad sizes, duplicate source sequence/record/event/arrival clocks, unlisted or expired contract keys, missing trading-session quotes and raw CSV/source SHA swaps. It prints **only aggregate original-source counts, input hashes, status and blocker codes**, not licensed prices, per-tick data or source invoice/entitlement documents.

**Phase 23 safety update:** A source-wide quote presence check is NOT proof of an uninterrupted bid/ask path; the optional CSV adapter must pass a **separately SHA256-pinned source continuity policy** before exporting a private candidate bundle. See `docs/EMA15M_ADAPTIVE_V2_PHASE23_ORIGINAL_L1_CAPTURE_CONTINUITY.md`. CSV-only validation without export remains available. The source continuity policy does not replace Phase 10 entry-first holding-path quote density, independent source licensing/clock review, or Phase18 expiry-specific option hours.

**Optional** explicit private candidate export, **outside the Git repository and never overwriting any existing file**:

```bash
npx tsx scripts/import-adaptive-native-l1-csv.ts \
  /secure/original-nifty-research-bundle.json \
  --original-native-l1-csv /secure/original-vendor-native-option-l1.csv \
  --calendar-evidence /secure/independent-original-exchange-calendar.json \
  --column-map /secure/preapproved-native-l1-csv-column-map.json \
  --pinned-column-map-sha256 PUT_SEPARATELY_APPROVED_64_HEX_SHA256_HERE \
  --continuity-policy /secure/prespecified-original-L1-coverage.json \
  --pinned-continuity-policy-sha256 PUT_INDEPENDENTLY_APPROVED_64_HEX_SHA256_HERE \
  --private-output-bundle /secure/derived-candidate-research-bundle.json
```

On export, the candidate MUST also pass the **unchanged Phase 5 full index/option/chain/source-availability ingestion audit**. The file is created with `wx` (no overwrites, no symlink destinations) and owner-only mode `0600`; no generated CSV or bundle is put into GitHub or logs.

## Status and external blockers

- `REJECTED`: raw archived source checksum mismatch, wrong separately approved column-map SHA, incompatible exchange/index, conflicting existing bundle quote, malformed source/column/quantity mapping, insufficient files.
- `INCOMPLETE_EVIDENCE`: missing original source quote rows, unavailable trading-day options, synthetic or trade-only feed, non-original receipt mode, impossible original timestamps/latency, duplicate quote IDs, sequence reversals, unknown/expired original option contracts.
- `CANDIDATE_L1_ROWS_RECONCILED_EXTERNAL_AUTHENTICATION_REQUIRED`: all supplied native quote rows structurally reconcile to the separately claimed source bytes and original contract universe. **This does NOT mean authentic vendor/exchange L1, independently captured availability, licensed data rights or proven backtest profitability.** Even fabricated fake data with consistent hashes can reach this status if falsely labeled genuine.

**Import alone is never research approval.** Feed the locally derived candidate through Phase 21 `audit-adaptive-source-intake.ts`, the Phase 15–18 calendar/instrument-session checks and full Phase 17–21 consolidated audit. The derived bundle now contains transformed L1 quotes that could be used for *offline study only after* the genuine external file/circular/clock and study approvals; no live horizon selection or broker execution follows.

No real licensed data files, vendor receipt logs, original exchange documents or approved reviewer keys were provided in this development phase. Independent data acquisition and broker operations blockers remain tracked in issues #17–#22.

**All module permission flags remain false**: `executionAuthorized`, `productionSafe`, `profitabilityProven`, `historicalEntitlementIndependentlyVerified`, `vendorAndExchangeAuthenticityProven`, `historicReceiptClockAuthenticated`, `realBrokerExecutionFillsAuthenticated` and `nativeBrokerStopsInstalled`. Existing EMA23/50 MIS/15:15 untouched; NRML live disabled.
