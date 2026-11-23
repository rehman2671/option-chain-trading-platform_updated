# Phase122 — Original BUY-anchored NRML 1/2/4/8-week horizon vs GTT microseconds

**STACKED DRAFT on Phase121 PR #126. No actual broker BUY, SELL, GTT, cancel or modify calls; no public route, no account writes, no auto CLOSED, no P&L or deployment. LIVE NRML BUY is still blocked by Phase90. MIS-only 15:15 intraday square-off must never be used for positional NRML.**

## Why this phase exists

Phase121's auditGttNrmlSelectedHorizonExpiry compares the selected nominal weeks to the **time of review**. That is a useful conservative *new planning* horizon, but it is **not** the historical original BUY's fixed planned holding end.

A review after 7 days must not silently turn an original 4-week plan into 5 weeks. The opposite false decision is also possible: a broker-reported GTT may outlast the remaining original holding days while not outlasting a *fresh* 4-week horizon starting at review. The two views are separate diagnostics, not a substitute for signed executions or the exchange calendar.

## Pure and deliberately narrow Phase122 audit

File: src/server/engine/ema15m/adaptiveNrmlOriginalBuyAnchoredGttHorizonAudit.ts

The caller supplies **unattested** inputs:
- Exact NSE_FO or BSE_FO option instrument key, original BUY order ID, SINGLE SELL GTT ID.
- Exactly **one asserted original BUY fill**; multi-fill, averaging-in, changing lots or replacement entries are explicitly outside this phase.
- Original BUY quantity, lot size, currently asserted positive NRML net long, and exact matching broker GTT SELL quantity.
- Strict UTC original BUY execution timestamp, independent review timestamp and contract expiry assertion (YYYY-MM-DDTHH:mm:ss.sssZ).
- One of **1, 2, 4, 8 nominal calendar weeks**.

All strings are validated as real canonical UTC dates; 2000–2100 clock bounds and overflow are checked. The original holding deadline is assertedOriginalBuyExecutedAtUtc + selectedWeeks × 7 calendar days and **does not move** on restart. The rolling review-time deadline is reported solely as a comparison, never used to extend the original deadline.

The observed broker GTT must match exact instrument, exchange, product D, type SINGLE, positive quantity, SINGLE ENTRY SELL BELOW rule with positive finite trigger price, SCHEDULED and order_id: null. Both created_at and expires_at must be safe **Unix microseconds** in the expected range, ordered as created_at < expires_at. Missing timestamps and all other units fail closed. All review/expiry comparisons use the original **microsecond** values (not millisecond truncation).

## Distinct quarantine outcomes

- Missing or invalid identity, lot, current net, original single-fill scope, timestamps, exchange or rule => unavailable or inconsistent evidence.
- Broker GTT creation 1 microsecond beyond review clock => created after review, not 'already existing' by floor-to-millisecond rounding.
- Triggered/failed/cancelled GTT or a generated LIMIT SELL child => not a currently scheduled broker-side condition.
- Review at/after the original holding end => ORIGINAL_ENTRY_HOLDING_WINDOW_ALREADY_ELAPSED; **do not reset** the original BUY deadline from current review time.
- GTT expired, asserted contract expired, asserted option expiry before original holding end, or GTT expiry before original holding end => fail closed.
- GTT expires even one microsecond after asserted option expiry => inconsistent; broker-reported future expiry does not override option expiry.
- GTT created before the asserted original BUY => GTT_PREEXISTED_ASSERTED_BUY_SHORT_RISK_UNVERIFIED; it may not be safe as an orphan SELL.
- GTT created after the original BUY => GTT_CREATED_AFTER_ASSERTED_BUY_COVERAGE_GAP; even a **1-microsecond** opening interval cannot be called continuously protected.
- Only exact timestamp coincidence + favorable asserted time overlap produces ORIGINAL_BUY_ANCHORED_TEMPORAL_OVERLAP_NO_NATIVE_STOP. This is a **descriptive comparison**, not valid broker protection or release.

In every outcome, the JSON report explicitly marks all of these **false**: independently verified BUY fill/cohort/account/net; authenticated options master/calendar/clock; account-wide GTT continuity; existing-option broker SELL eligibility; signed exchange-native STOP acknowledgement; gap fill guarantee; continuous overnight protection; duplicate SELL retry; automatic CLOSED/realised P&L; LIVE NRML BUY; 15:15 NRML square-off. brokerWrites: 0, localWrites: 0. No source IDs, account IDs, option keys, order IDs, credentials or raw trading symbols appear in the output.

### Why this is not yet integrated into live position management

Phase122 is intentionally a pure offline research helper, called only from regression tests. It does **not** ingest a broker-authoritative original BUY execution or live net from Upstox, and cannot make the caller's original BUY time truthful. assertedOriginalBuyFillCount: 1 is a shape limitation, not proof of completeness; real multi-trade/partial-fill cohorts need an independently verified timestamp/quantity join.

Existing Phase121 remains a review-based planning diagnostic; Phase122 must not be used to override it as a live risk gate. A favorable Phase122 comparison must not auto-open or auto-close a position.

## Evidence still required before separate broker release

Issues #17–#22 remain open. Obtain the original licensed option L1 and depth/contract chain, effective-dated signed NSE/BSE option master/session/lot/expiry amendments, independently witnessed original BUY trade ID and executed-at time, actual Upstox-sanctioned existing NRML long option SELL protection and cross-session child/partial/restart/failure/gap evidence, untouched out-of-sample 1/2/4/8W risk and fees, plus independent capital/security/operational approval.

**Keep PR DRAFT/unmerged. No live NRML execution authorization.**
