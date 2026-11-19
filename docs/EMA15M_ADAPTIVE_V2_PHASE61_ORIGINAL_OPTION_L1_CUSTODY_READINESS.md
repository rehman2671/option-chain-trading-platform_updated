# Adaptive Swing v2 — Phase61 owner-custodied original option L1 archive readiness

**DRAFT / OFFLINE RESEARCH ONLY / stacked on Phase60 Draft PR #65. This phase creates source INTEGRITY evidence, not source AUTHENTICITY. No broker, GTT, live NRML orders, positional 15:15 square-off, or real-data licensing inference.**

## Why Phase61 is needed

Phase60 measures whether predeclared 1W / 2W / 4W / 8W research has enough *original* test-date folds, independent decision-time regimes, source-available option paths, correctly listed expiry windows, first-next-session gaps and holding-to-expiry buffer. The original two-date, one-regime fixture cannot establish statistically meaningful duration suitability. Phase60 still consumes a normalized historical option source. Self-supplied normalized records, archive hashes and claimed source timestamps cannot prove that data was actually recorded and licensed by an exchange/vendor.

Phase61 introduces an explicit **owner-private raw-custody envelope to normalized-source comparison**, with an audit that must remain skeptical even after all local bytes match. It does NOT replace an original exchange/vendor-native signed transport feed, independently verified entitlement, original receive clock proof, or unbiased OOS market-performance study.

## Implemented source archive package

The offline function `auditPhase61OriginalL1CustodyReadiness(input,pins)` lives in `src/server/engine/ema15m/adaptivePhase61OriginalL1CustodyIntake.ts`.

It first checks separate independent SHA256 pins over the complete original Phase60 input/pins and all four **owner-supplied original bytes**:

1. **Option L1 JSONL custody envelope**, each line with `sourceRecordId`, fixed `sourceSequence`, original `instrumentKey`, `observedAt`, `availableAt`, `bid`, `ask`, `bidQty`, `askQty`. This is an *operator-normalized JSONL envelope* — **NOT authentic vendor-native capture bytes**. Compare every record, **in original source order**, with the complete historical `executionQuotes` used by original Phase50/51; reject omitted/extra rows, duplicate record IDs, wrong selected instrument, altered prices, one-sided/crossed markets, invalid lot quantities, quotes unavailable before their original event and re-ordered per-instrument event/arrival sequences. No skip/zero-fill for missing original quotes.
2. **Original point-in-time contract catalog snapshot** for every historical decision. Exact archived byte-decoded contents must match all original decision-date catalogue `instrument_key`, expiry, lot size, option type, `contractsCapturedAt` and metadata values. Mere matching does not establish an exchange-authorized issuer or official listings.
3. **Original extended holding/exits calendar snapshot**, including session records after the final OOS entry date. Compare all the archived calendar fields exactly with Phase58 source. Byte identity does not authenticate official NSE/BSE session or expiry master.
4. **Opaque owner-claimed licence/entitlement document bytes**. A separately supplied SHA256 proves local byte custody only. The file might be wholly fictitious; code MUST never claim verified broker/exchange license/issuer/entitlement.

The Phase61 audit independently reruns **Phase60 → Phase59 → Phase58 → Phase57 → Phase51/50 → Phase8** on original full cohort. If any nested source, original OOS decision denominator, option quote, stop-path, or contract/expiry proof is incomplete, the result fails closed. Even a fully matched owner-private archive returns only `DESCRIPTIVE_OPERATOR_CUSTODIED_DATA_INTEGRITY_ONLY`, with `independentVendorSignedRawTransportValidated=false`, `independentlyLicensedFnoHistoricalL1Verified=false`, `officialContractCatalogAndExpiryIssuerValidated=false`, `exchangeSessionCalendarIssuerValidated=false`, `independentlyTrustedSourceAvailableAtClock=false`, `qualifiedProfitabilityOrBestHorizonRankingProven=false`, `executionAuthorized=false`, `productionSafe=false`, and `nativeOrderInstruction=null`.

**Important limitation:** The test fixture produces the JSONL and all pins from synthetic normalized records. An operator can likewise construct matching source files after the fact; this custody stage cannot differentiate those from historical exports. The raw vendor-native file and external issuer or license evidence must be independently validated in a future phase, if obtainable. A green local hash check cannot substitute independent provenance.

## Synthetic test and CI

`src/quant/tests/ema15m_adaptive_phase61_raw_l1_custody_readiness.test.ts` checks 10 cases:

- Full original quote-by-quote custody, catalog and calendar matching for two synthetic original OOS decisions × 3 arms × 4 expiry horizons; expected descriptive data custody with no issuer trust.
- Original archive byte mutation without a new independent pin is immediately invalid.
- Altered option ASK even after the operator rehashes the archive must differ from the original Phase50 source.
- Duplicated original raw source record identifiers fail.
- Removed quote rows cannot reduce the independent full-quote denominator.
- Fake independently pinned contract expiry or last holding-session calendar does not reconcile.
- Self-asserted licence document bytes can be changed/rehashed while **independent licence verification stays permanently false**.
- Missing original OOS day after operator source rehash fails nested Phase60.
- Original premium-reversal and gap tests remain downside/insufficient real data evidence, not a profitable strategy.

CI `.github/workflows/adaptive-phase61-original-l1-custody.yml` runs TypeScript, the Phase38 genuine offline OpenSSL CRL test, and Phase61 synthetic tests. The existing combined focused and EMA full safety/build workflows must still pass separately before a merge. The previous Phase60 full safety check had **785/786 tests pass**, one failure because Phase38's **mock CRL lastUpdate/nextUpdate** had fixed November dates that aged beyond the 24-hour window. This branch repairs only that **test fixture** by deriving mock CRL dates from the independently pinned assessment instant. It **does not loosen the production CRL freshness validator**. Passing Phase38 isolated tests alone cannot substitute the complete full regression.

## Private manual CLI

`scripts/audit-adaptive-phase61-original-l1-custody.ts` consumes two owner-0600 JSON files in owner-0700 non-symlink directories, run in an externally enforced network-isolated environment. Input contains the nested Phase60 original dossier, independent pins and four `Base64` owner-private archives as described above:

```bash
npx tsx scripts/audit-adaptive-phase61-original-l1-custody.ts \
  --approve-isolated-offline-review \
  --private-phase61-original-source-archive-package /private/phase61-source-archive.json \
  --independent-phase61-source-archive-byte-pins /private/phase61-byte-pins.json
```

The CLI emits redacted aggregate record counts and source/trading safety flags only. It does not print raw option quotes, instrument IDs, licence documents, private file paths, account credentials, or original source byte strings. The process enforces local file ownership/modes but **does not itself enforce network isolation or filesystem snapshot immutability**.

## Actual evidence required next

An independent external market-data source must provide licensed **original vendor-native BID/ASK and available-at receipt evidence** with source authentication, official listed contract/expiry master and session dates, preservation of all no-trade/unknown days, realistic depth/spread/IV/theta costs and untouched multi-regime chronological OOS option paths. Separate real broker-native NRML stop/GTT placement, cancellation/replacement, gap and exchange ACK/overnight persistence proof is mandatory before any production execution.

Issues #17–#22, especially #20, stay OPEN. Stacked PRs stay DRAFT/unmerged. Existing EMA23/50 MIS 15:15 intraday square-off unchanged. Positional **NRML 1W/2W/4W/8W is never force-closed at 15:15** and Phase61 adds **no live orders, GTT writes or positional stop writer**.
