# Phase123 — Offline NRML original BUY multi-fill cohort / anchored GTT carry horizon

**STACKED DRAFT on Phase122 PR #127. No native broker calls (including GET), trade/GTT placement, cancel/replace, local position/P&L writes or deployment. LIVE NRML BUY stays blocked by Phase90. 15:15 forced square-off stays MIS-only.**

## Problem

Phase122's original executed-at anchor was intentionally limited to a single asserted BUY fill. Real original BUY orders can produce multiple partial execution IDs. Individual fills need not be whole contract lots even when the completed order and remaining position are lot-consistent. A later review must not reset the original 1/2/4/8 calendar-week holding deadline.

## Phase123 pure offline input

`adaptiveOriginalBuyMultiFillGttHorizonAudit.ts` accepts:
- Exact NRML NSE_FO or BSE_FO instrument key, original BUY order ID, expected broker exchange order ID, existing SINGLE SELL GTT ID, total original quantity, lot size and asserted remaining positive NRML long.
- Caller-supplied original BUY order detail plus full broker orderbook snapshot, exact per-order BUY trade rows (unique trade IDs, exact option/order/exchange ref, BUY/D, price, quantity), one NRML net position and current GTT parent snapshot.
- A **separately normalized but UNATTESTED** per-trade `executedAtUtc` canonical UTC-millisecond timestamp. This field is **not** claimed to be a native broker API field or a signed exchange timestamp. It must be obtained and independently bound to actual trade IDs; missing data rejects.
- Explicit review UTC time, **asserted** effective-dated option contract-expiry UTC, and selected 1, 2, 4, or 8 calendar weeks.

The complete order's quantity and fully-filled status must match the orderbook entry exactly once. Per-order trades must be bounded, uniquely identified, match order/exchange ID and contract/side/product, sum to the original order quantity, have safe integral-paise amounts, and match the completed BUY's weighted premium within 1 paise. The asserted remaining positive NRML net must be an exact position and not exceed the original whole-lot quantity. None of these caller-supplied rows prove historical completeness or exchange-signature authenticity.

## Conservative horizon and session rules

Earliest original BUY execution + nominal 7/14/28/56 calendar days fixes the conservative holding end. The last BUY fill and first-to-last fill span are reported separately. Review-time + the same selected weeks is a **diagnostic** that must not restart the original holding window.

Because this branch has **no issuer-authenticated session ledger**, it only tests whether earliest and latest BUY fill timestamps fall on different **IST local calendar dates**; this is not a genuine NSE/BSE session classification. Cross-local-date fills get quarantined until official effective-dated trading-session and per-trade chronology evidence is supplied.

A broker-reported GTT must match the exact option segment, D product, one SINGLE ENTRY SELL BELOW rule, positive trigger, scheduled state with no child, remaining NRML net and safe increasing Unix microsecond creation/expiry values. Quarantine any GTT created before first original BUY (potential orphan SELL), during a partial-fill interval (quantity continuity unknown), or after latest fill (opening exposure gap), even if the horizon dates otherwise overlap. Creation 1 microsecond after review, expiry 1 microsecond after asserted option contract expiry, expiry before original BUY holding end, an elapsed holding window, triggered child or a conflicting position all fail closed.

Only an exact favorable **temporal** overlap returns `EARLIEST_BUY_MULTI_FILL_TEMPORAL_OVERLAP_UNVERIFIED`. It is not a protective STOP, broker approval, risk limit, verified expiry master or guarantee that any triggered LIMIT SELL fills through an overnight gap.

## Immutable safety conclusions

All results hardcode **false**: independently signed BUY execution timestamps/trade IDs, broker account-wide completeness, net authorization, historical GTT protected-quantity continuity, native exchange STOP ACK, no-short close-only permission, overnight/gap fill, licensed original options L1 and effective-dated exchange expiry certification, independent 1–8-week OOS/fees, automatic CLOSED, realized P&L, duplicate SELL retry, 15:15 NRML square-off, LIVE NRML BUY and any broker/order/GTT write authorization. Every result has brokerWrites=0 and localWrites=0, no account or instrument identifiers, raw symbols or credentials.

## Explicit external blockers before independent production release

Existing issues #17–#22 remain OPEN. Require original licensed option bid/ask/depth, issuer-authenticated NSE/BSE instrument/expiry/lot/session change history (including special sessions and date-specific cutoff rules), independently witnessed per-trade original BUY timestamps, original BUY fills across sessions, actual broker-sanctioned NRML close-only/no-short SELL GTT and exchange/venue child/trade ACKs across partial fills/overnights, late triggers, stale data/reconnect, 1/2/4/8W untouched OOS gap/fees/stress, capital and independent operational/security authorization.

**Do not merge/deploy or turn on LIVE NRML trading as a consequence of the temporal audit or green CI.**