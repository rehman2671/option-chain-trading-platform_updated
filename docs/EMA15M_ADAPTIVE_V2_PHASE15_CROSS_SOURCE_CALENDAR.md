# Adaptive Swing v2 — Phase 15 separate-calendar and expiry evidence audit

**Strictly OFFLINE RESEARCH. No new broker API, live/paper orders, autonomous NRML, production execution permissions, profit certification or modification to existing EMA23/50 MIS / 15:15 intraday square-off.**

## The structural evidence hole this closes

Phase 5–14 checks validate source-attested original event/availability timestamps, L1 quote density, spreads, depth, OOS cohort survival and observed option-premium exits. Previous exchange-session logic was anchored to a **trading-session calendar inside the same vendor research bundle**.

That creates a serious blind spot: a data supplier could omit a whole exchange trading session (including one that lost money), remove the date from the vendor's own `expectedSessions` and `declaredExchangeSessions`, and still present internally well-formed records. All quotes inside the remaining vendor-listed sessions can look valid, without proving that all **actual** market dates were present.

**Phase 15 introduces a second, separately supplied date-by-date calendar manifest and raw original calendar source document**. The module compares that calendar to the historical vendor feed *without inferring NSE/BSE business days or exchange closures from a weekday algorithm*, and without trusting vendor-declared dates as a complete list.

### Critical authenticity distinction

The manifest **self-declares** `issuerName`, `originalDocumentId`, exchange and source record IDs. A separate retained document is required and must SHA256-match its declared hash. Even a perfect hash match **DOES NOT establish** that NSE/BSE issued it, that its dates are complete or correctly interpreted, that the vendor and calendar are genuinely independent, that the source holds a market-data license, or that the original strategy-time availability clocks are truthful. Those claims require **external human review against actual exchange documents and vendor contractual evidence**.

The highest possible state is:

`CROSS_SOURCE_CONSISTENT_AUTHENTICITY_UNVERIFIED`

It means only that **the supplied two data sources agree on their explicit, limited claims**. It is not a trading approval, a genuine issuer certification or proof of strategy profitability.

## Inputs and declared schema

`IndependentlySuppliedCalendarEvidence` (`ADAPTIVE_CROSS_SOURCE_CALENDAR_V1`) contains:

- `exchange`: `NSE` or `BSE`, matched to the index instrument (`NIFTY`/`BANKNIFTY` vs `SENSEX`)
- `issuerName`, `originalDocumentId` and SHA256 of a **separate original source document**
- `coverageStart`, `coverageEnd`, inclusive and bounded
- `days[]`: **exactly one row for every calendar date**, sorted with no omitted day, including weekends/holidays, market closures and actual trading dates. For `TRADING` rows include `sessionKind=REGULAR|SPECIAL`, `openAt`, `closeAt`, `sourceRecordId`. For `CLOSED` rows include closure reason, but NO trading window.
- `contractExpiries[]`: explicitly sourced instrument/expiry-date references for each expiry observed in the point-in-time original option contract catalog; each expiry date must be a source-listed **trading session**, not a guessed Friday/weekend date

**Do not fabricate calendar dates, invent holidays, carry over a fixed weekly expiry day or infer “normal” 09:15–15:30 for special sessions.** Different exchanges and contract families can have special revisions. Every row must be grounded in an externally retrieved original record and then independently reviewed.

The separate exchange-calendar manifest JSON must not be the same file as the raw source document, vendor L1 artifact, or historical replay JSON. Duplicate document and L1-source hashes are rejected. These are **independence/integrity precautions**, not cryptographic proof of issuer origin.

## What is fail-closed

- Reject corrupt/incorrect source artifact SHA256, missing original document, missing calendar dates, duplicate rows/IDs, invalid closed-day records, wrong exchange, impossible or unsorted dates and sessions
- Block vendor-declared trading sessions absent from the separate ledger, **including trading days with no source decisions at all**
- Block dates the vendor claims are trading when the supplied exchange calendar says **closed**
- Compare exact open/close event times, including **shorter/evening special sessions**, instead of default business hours
- Verify source-declared decision date sequence and the source's expected sessions; **every calendar trading date between earliest and latest observed decision must have its original strategy decision**, including test-fold dates
- Verify each OOS test-fold date range is covered; compare its expected number of trading decisions to actually observed decisions
- Verify each point-in-time listed contract expiry against an independently supplied instrument-specific expiry reference; reject uncovered/weekend/closed-day expiries
- Recheck ORIGINAL vendor L1 **eventAt and availableAt**, source chain/contract clock timestamps, and the underlying CLOSED 15m bar time against independently supplied session windows. No future quote, closed-day receipt, or unobserved opening print is silently treated as valid

This is **calendar coverage**, not a cure for missing intraday L1 ticks: Phase 10 continues to audit quote density, spreads, delays and holding-path continuity. Even two consistent files can have **both** omitted a trading date if their alleged sources were fabricated or not independently collected.

### Status values

- `REJECTED`: malformed / missing / duplicate evidence, wrong exchange, original document missing/mismatched hash, unsupported record shape
- `INCOMPLETE_EVIDENCE`: validly structured separate documents **disagree** with vendor session windows, decision coverage, option L1 clocks or listed expiry schedule
- `CROSS_SOURCE_CONSISTENT_AUTHENTICITY_UNVERIFIED`: all stated cross-checks agree, **but no actual exchange/vender identity proof exists**

All results hardcode `executionAuthorized=false`, `productionSafe=false`, `profitabilityProven=false`, `exchangeCalendarIndependentlyAuthenticated=false`, `sourceDocumentIssuerVerified=false`, `originalFeedClockIndependentlyAuthenticated=false`, `originalExpiryScheduleIndependentlyAuthenticated=false`, and `sourceDocumentLicenseIndependentlyVerified=false`.

## Offline command

Phase 15 is **opt-in** to the existing CLI and does not change any previously used flags. The historical source bundle may still be analyzed in the older modes; when Phase 15 is explicitly requested, a failed calendar report makes the command exit nonzero.

```bash
npx tsx scripts/run-adaptive-walkforward.ts \
  /secure/source-attested-original-options-L1.json \
  --source-artifact /secure/original-vendor-L1-feed.bin \
  --exchange-calendar-evidence /secure/separate-calendar-ledger.json \
  --calendar-source-document /secure/retained-original-exchange-document.pdf
```

The calendar evidence and original source document **must be both present**. For a non-synthetic historical L1 bundle, the earlier vendor source-artifact checksum gate also remains mandatory. No document bytes or licensed per-instrument L1 data are printed to stdout; the CLI emits only source document SHA256, dataset label, cross-check status, aggregate source/expected session counts, date coverage and fold coverage. SHA256 is for reproducibility, not vendor authentication.

## Tests

New `src/quant/tests/ema15m_adaptive_cross_source_calendar_audit.test.ts` includes **synthetic** missing entire vendor trading days, omitted OOS decision days with manipulated `expectedSessions`, genuine nontrading day handling, short/evening special sessions, expiry-on-closed-day errors, absent expiry references, shortened calendar coverage, L1/chain availability on closed days, wrong NSE/BSE instrument, duplicate rows/IDs, source SHA mismatch and best-case non-executable report flags.

All test dates and apparent market records are explicitly **fabricated fixtures**, not the actual official 2026 NSE/BSE calendar or proof of any Indian index option behavior.

## What must happen before actual trading

1. Independently obtain **official** exchange holiday, calendar, expiry and special-session evidence (including amendments) with clear, inspectable provenance, and authenticate that the source really issued it.
2. Independently obtain a licensed source-attested Indian options L1 historical feed with truthful original event and strategy-availability clocks, including losing/illiquid dates. Verify entitlement and source archive identity.
3. Reconcile original per-expiry contracts, bid-ask and genuine order-book depth; independently review actual broker exit/stop/GTT order state with unknown-ACK handling, overnight gaps and cancellations.
4. Re-run untouched OOS Phase 8/10/11/13/14 studies with their predeclared policies; check confidence intervals, regime sampling, missing returns, net costs and tail-risk outcomes rather than optimizing by the synthetic tests.

**This PR remains DRAFT and unmerged, with real NRML autonomous execution disabled.**
