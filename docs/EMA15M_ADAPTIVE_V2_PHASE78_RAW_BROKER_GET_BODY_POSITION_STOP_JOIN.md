# Phase78 — Private offline raw read-only GET body ↔ claimed NRML stop join

**DRAFT · OFFLINE RESEARCH / RECONCILIATION ONLY · stacked on Phase77 Draft PR #82.** No broker GET is initiated by Phase78, no live NRML orders, GTT/stop creation, modification or cancellation, no positional 15:15 square-off, no contract/expiry ranking, no OOS profitability proof, and no approval to trade.

## Why this increment exists

Phase77 can reconcile **operator-transcribed** order event history with an operator-transcribed current position + open-sell-order list. A fabricated or stale copy can still be internally consistent. Earlier Phase29 includes an explicitly authorized **GET-only** Upstox archive capture (profile, positions, orders, GTTs, day-trades); Phase26/27 audit response structure but do **not** authenticate the broker source. Phase78 supplies a missing offline *cross-source join*: exact frozen **decoded HTTP response-body bytes** of the five books, the Phase29 structured snapshot, and Phase77 claimed state must agree. **A hash, TLS-looking file or user-generated independent pin is not a broker signature** and does not prove the GET occurred as claimed.

A small Phase77 instrument-token syntax fix accepts Upstox-style `NSE_FO|...` and `BSE_FO|...` in addition to existing synthetic identifiers without relaxing account or order-ID grammar.

## Pure audit interface

`src/server/engine/ema15m/adaptivePhase78RawBrokerReadOnlyJoin.ts` exports `auditPhase78RawBrokerReadOnlyJoin(input, pins)`. Input contains:

- Phase77 original hypothetical risk position, operator copied broker claim, and original order event history (all remain subject to Phase77 re-audit).
- **Private**, original Phase29 `SensitiveReadOnlyCaptureArchive`: separately captured profile response base64, complete point-in-time positions, orders, GTTs and trades frame, plus each original decoded JSON response-body base64. Never upload real account IDs, response bodies, tokens, trade IDs or report attachments to the public repository.
- Separate declared policy and independently supplied SHA-256 pins for exact unmodified Phase77 input, Phase29 frame, policy and **all five** raw decoded JSON bodies. Pins only catch changes relative to the provided pins. They are NOT external authenticity or a source-licence grant.

Strict validation: canonical base64, bounded 90 KB per body, fatal UTF-8 decode, successful JSON shape, full fixed-path GET books, operator-asserted unfiltered capture, no absent/duplicate books, exact decoded-body-to-structured-frame equality; profile user ID/active D product/stop order type checks; causal snapshot/as-of clocks, cross-book skew, restart freshness, account/instrument/product/lot/declared expiry scope; raw NRML net quantity equals Phase77 claimed current lots × lot size; **all** nonterminal SELL orders on same contract must match exactly one claimed current stop; raw native `SL`/`SL-M` must still be `trigger pending` with matched order ID, pending quantity, original order size, and cumulative fill. Any duplicate stop, unknown open SELL, unrecognized GTT status, current GTT, orphan day SELL trade, missing fill or unmatched raw order fails closed. Cross-book snapshots are non-atomic and day order/trade books cannot establish overnight exchange stop continuity.

Output uses redacted integer counts and fixed reason codes: `INVALID_EVIDENCE`, `BLOCKED_OR_UNKNOWN`, or at best `DESCRIPTIVE_BYTES_AND_CLAIMS_CONSISTENT_NOT_AUTHENTICATED`. It never returns account identifiers, instrument keys, broker order IDs or original response bytes. Every output continues to say source authentication, real broker stop/exchange ACK, fill/profit, release and production safety are **FALSE**; `nativeOrderInstruction=null`.

## Validation

Synthetic test fixture deliberately constructs fake profile/position/orders/GTT/day-trades bodies; this is **not actual Upstox data**. Adversarial tests include: original byte mutation, rehashing just original bytes while changing the structured frame, mismatched actual order ID/lot/depth, MIS substituted for NRML, duplicate current SELL, active GTT, orphan or unlinked trade, causally unsafe clocks, stale post-restart books, profile account mismatch, source missing/duplicated, upstream Phase77 invalidity and redaction. Separate dedicated workflow and broad focused/full regressions must pass. Green CI validates software invariants only.

## Unresolved external gates

The real Phase29 GET-only capture requires owner-authorized analytics credentials, permitted static egress and the actual private client environment. Phase78 does **not** request those credentials or use that network. No original authenticated broker response bytes or independent source identity evidence were supplied; historical broker day books may be incomplete for past overnight stop transitions. Real legally licensed original 1W/2W/4W/8W best BID/ASK/depth tape, official exchange point-in-time F&O lot/expiry/trading-day master, original decision-time quote receipts, untouched multi-cycle regime OOS and empirical theta/IV/gap/slippage studies are also missing. Broker-native NRML/GTT registration→trigger→child exchange ACK→fill/reject/cancel lifecycle plus restart, stale quote, partial-fill, rate-limit and market-gap rehearsal must be validated separately in an authorized broker-sanctioned environment.

Release blockers #17–#22 (especially #20) remain OPEN. Phase78 remains **Draft / unmerged**, existing EMA23/50 MIS intraday 15:15 behavior unchanged, and 1W–8W positional NRML has no forced 15:15 exit or live order routing.
