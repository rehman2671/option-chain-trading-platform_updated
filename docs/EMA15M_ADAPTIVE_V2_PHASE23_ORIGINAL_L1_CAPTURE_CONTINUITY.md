# Adaptive Swing v2 — Phase 23 original L1 capture continuity and stale-BID guard

**RESEARCH ONLY • NOT REAL DATA • NO BROKER • DRAFT / UNMERGED • NO 1W–8W PROFITABILITY CLAIM**

## The remaining market problem

**One quote on every original trading day does not constitute an original historical options L1 record sufficient to evaluate premium +50/+70 reversals or a stop.** If an option BID was quoted at 9:30 AM and the next source event is 3:00 PM, its apparent recorded price path does not establish the intraday premium peak, achievable exit, option theta/IV or actual broker fill. Conversely, a quiet option contract might genuinely have **no book changes** for a while. The gap proves *insufficient observations under the predeclared study coverage policy*, not necessarily that the exchange or vendor dropped a packet.

Phase 10 already checks **entry-first selected position quote paths** and their holding-period quote gaps. Phase 23 adds a complementary **original source feed intake-level diagnostic** BEFORE the private Phase22 CSV adapter can export a candidate bundle: whole-day market-window opening/closing blind spots, quote silence, per-observed-contract/day coverage, retained vendor source sequence and original event/availability clocks.

No external original feed, original client receipt log, exchange issuer proof or licensing agreement has been supplied. All numerical fixture data are deliberately synthetic. One passing set of internal checks cannot establish genuine source completeness.

## Original packet-sequence preservation

Phase 22 previously validated per-contract/day `sourceSequence` **but discarded it** on conversion to the Phase5 `VendorExecutionL1[]` bundle. This is now fixed:

- The optional original `sourceSequence` field is copied verbatim into the derived L1 (not regenerated or re-numbered), with the source record ID, original `eventAt` and `availableAt`, BID, ASK and quantities.
- Phase5 ingestion rejects duplicate/reversed per-contract original event sequence, invalid sequence numbers, or mixed sequenced and unsequenced L1 rows within one contract/day. Unsequenced legacy source rows remain supported but **do not establish vendor packet continuity**.
- Phase22's `sameQuote` checks now include the original source sequence when reconciling pre-existing bundle L1 to CSV, so a later edited source sequence cannot silently pass a price-only comparison.
- A jump from original 100,101 to 104 means **two missing source sequence numbers only if** the original vendor documentation and a separate source-capture reviewer certify `VENDOR_ATTESTED_CONTIGUOUS_PER_INSTRUMENT_DAY`. Other markets may assign sequence numbers at a broader stream/packet scope or skip numbers for legitimate reasons. The alternative `MONOTONIC_ONLY_GAPS_UNINTERPRETABLE` avoids calling all jumps dropped market data; it **never proves no events were omitted**.

## Prespecified coverage policy, locked independently before the untouched OOS

A new `ADAPTIVE_ORIGINAL_NATIVE_L1_CAPTURE_CONTINUITY_V1` policy is a separate raw JSON file, with an exact SHA256 pin supplied OUTSIDE the input bundle:

```json
{
  "schemaVersion": "ADAPTIVE_ORIGINAL_NATIVE_L1_CAPTURE_CONTINUITY_V1",
  "minimumSourceEventsPerTradingDay": 20,
  "maximumSourceWideSilenceMinutes": 20,
  "maximumFirstSourceEventLagMinutes": 10,
  "maximumLastSourceEventLeadMinutes": 10,
  "minimumEventsPerObservedInstrumentDay": 3,
  "maximumPerInstrumentObservedSilenceMinutes": 60,
  "maximumEventToOriginalReceiptSeconds": 3,
  "originalSequenceSemantics": "MONOTONIC_ONLY_GAPS_UNINTERPRETABLE"
}
```

These are *illustrative research preflight settings only*, **not official NSE/BSE feed frequencies, approved option trading thresholds, a universal source interval or a suggested trading strategy**. A real market-data provider must document sequence scope, clock resolution, original native quote-update semantics and whether no emitted quote means an unchanged best bid/ask or a failure of capture. Fix suitable coverage settings **before examining untouched OOS results**, and maintain independent review of how interval length and illiquid option non-updates affect economic conclusions.

- `minimumSourceEventsPerTradingDay`: counts native best-BID/ASK source updates **aggregated across all instruments** for every originally declared TRADING day, including special sessions. An empty day is recorded, not discarded.
- `maximumSourceWideSilenceMinutes`: longest gap between any original option source events, including **day open → first event** and **last event → day close**, using the separately supplied original Phase15 calendar's broad day envelope (source time, not current importer wall clock). This cannot prove all contracts have updates; source-wide traffic from one liquid contract can hide omissions elsewhere.
- `maximumFirstSourceEventLagMinutes`, `maximumLastSourceEventLeadMinutes`: explicit independent open/close blind-spot thresholds. Original vendor sequence may start at an arbitrary value and cannot by itself prove that the earliest session packet was received.
- `minimumEventsPerObservedInstrumentDay`, `maximumPerInstrumentObservedSilenceMinutes`: per-contract/day original observed updates; legitimately quiet/illiquid options may fail an intentionally conservative *research marketability* threshold. These are NOT guaranteed to be packet loss.
- `maximumEventToOriginalReceiptSeconds`: additional maximum original exchange/vendor event → original strategy receipt lag, never a fabricated 0 ms or use of today's file download timestamp. Also bounded by the original bundle's predeclared max original feed latency.
- `originalSequenceSemantics`: `VENDOR_ATTESTED_CONTIGUOUS_PER_INSTRUMENT_DAY` requires every **preserved** source sequence to increment by one within a contract/day; missing/reordered/duplicated sequences create blockers. Use only with independently examined vendor documentation. `MONOTONIC_ONLY_GAPS_UNINTERPRETABLE` does not interpret numeric holes as lost quotes and cannot prove continuity.

**The word "capture" is an internal data-quality label, NOT a capture-system attestation.** Even apparently complete original event clocks and sequence IDs can be fabricated in a JSON/CSV. Independent original vendor log hashes, genuine entitlement and original capture receipts are still needed.

## Run the original L1 source coverage audit

After producing a source-bound original Phase22 candidate **in memory or on a private disk**, invoke:

```bash
npx tsx scripts/audit-adaptive-original-l1-coverage.ts \
  /secure/source-original-or-private-candidate-bundle.json \
  --calendar-evidence /secure/original-independent-exchange-calendar.json \
  --continuity-policy /secure/independently-prespecified-l1-continuity-policy.json \
  --pinned-continuity-policy-sha256 PUT_SEPARATELY_APPROVED_64_HEX_HERE
```

This emits only descriptive **per-calendar-day aggregate counts, quote silence intervals and blocker codes**. No individual option premiums, source instrument keys, entitlement IDs, original CSV rows, exchange source document bytes or passwords are output.

**Private Phase22 export now requires this audit to PASS first.** Explicitly request both continuity policy and separate SHA pin before `--private-output-bundle`:

```bash
npx tsx scripts/import-adaptive-native-l1-csv.ts \
  /secure/original-study-bundle.json \
  --original-native-l1-csv /secure/licensed-original-native-l1.csv \
  --calendar-evidence /secure/separate-original-exchange-calendar.json \
  --column-map /secure/prespecified-native-l1-column-map.json \
  --pinned-column-map-sha256 ORIGINAL_INDEPENDENT_64_HEX \
  --continuity-policy /secure/prespecified-source-capture-coverage.json \
  --pinned-continuity-policy-sha256 ORIGINAL_INDEPENDENT_64_HEX \
  --private-output-bundle /secure/derived-source-attested-candidate.json
```

Without a separately pinned original continuity policy, a Phase22 CSV-only **dry-run remains available**, but **private bundle export fails closed**. With a pinned policy, the bridge evaluates the in-memory candidate bundle **before any write**, then retains the existing Phase5 full index/contract/chain/session/availability ingestion gate, create-only output and owner-only `0600` permissions outside the Git repository.

Nothing in this optional vendor-CSV preflight replaces the later full Phase10 original entry-first option path tests, Phase15/18 original exchange/contract expiry-class session windows, Phase19 premium +50/+70 reversal study, Phase20 OOS validation or Phase21 vendor-delivery entitlement intake. No extra unsupported **11th** globally mandatory policy is imposed on non-CSV vendor archives: this scope is CSV candidate-preparation only.

## Results and boundaries

- `REJECTED`: omitted/invalid byte inputs, invalid independently pinned raw policy SHA, invalid policy field constraints, inconsistent exchange/calendar/source contract metadata.
- `INCOMPLETE_EVIDENCE`: missing original market day, thin quote density, large observed quote gaps, stale contract observations, start/end blind spot, missing/colliding original source ID/time, out-of-contract-expiry quote, invalid original event/receipt timing, or (only when vendor genuinely promises gapless per-contract semantics) original sequence gaps.
- `OBSERVED_SOURCE_COVERAGE_RECONCILED_EXTERNAL_AUTHENTICATION_REQUIRED`: the **supplied** original source quote observations and prespecified coverage thresholds agree internally. Still **NOT independently authenticated** as real NSE/BSE vendor L1 or valid historical client receipt. No source entitlement, executable fill or profitable strategy proven.

Every report hardcodes `executionAuthorized=false`, `productionSafe=false`, `sourceOriginalityIndependentlyAuthenticated=false`, `vendorSequenceSemanticsIndependentlyAuthenticated=false`, `originalReceiptClockIndependentlyAuthenticated=false`, `nativeBrokerStopOrFillProven=false`, and `profitabilityProven=false`.

### Tests

`src/quant/tests/ema15m_adaptive_original_l1_capture_continuity.test.ts` and extended Phase5/22 tests cover an internally consistent **fabricated** source, one quote per day, omitted exchange trading day, first/last market blind spots, missing source sequence numbers, altered/duplicated/reordered sequences, inconclusive monotonic-only sequence semantics, too-late availableAt, out-of-session quote, unknown original option instrument IDs, fake but hash-matched data and changed policy post-pin.

**Remaining external blockers:** licensed historical original options L1 and legal retention/use rights (#17), genuine official historical NSE/BSE calendar and expiry history (#18), independent preregistration and reviewer custody (#19), actual native broker NRML stops/order/position acknowledgments (#20), real-tail/untouched-OOS profitability and uncertainty (#21), human stacked PR/security release (#22). Keep every research PR Draft/unmerged. Do not touch the existing intraday EMA23/50 MIS 15:15 square-off; do not add any 15:15 NRML automatic sell.
