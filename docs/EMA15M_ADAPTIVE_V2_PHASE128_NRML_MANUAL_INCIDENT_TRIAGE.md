# Phase128 — HALT-ONLY offline NRML manual incident triage

**Stacked research DRAFT on Phase127 PR #132. This module is a pure read-only diagnostic; it does NOT engage an operational kill switch, contact a human, transmit an order, cancel/replace GTT, send SELL, apply MIS 15:15 exits to NRML, or write CLOSED/P&L. No live NRML release.**

## Why Phase128

Phase127 can compare 8 unverified operator-supplied full-account Upstox GET-shaped order/GTT/position snapshots around an original option BUY, but even consistent snapshots do not reveal every historical GTT child, exact native trade execution instant, a proven protective STOP, complete historical active orders or guaranteed overnight exits. Manual response to broker reconnect, partial entry fills, unknown SELL ACK, missing GTT parents and gaps must not be converted into automated emergency SELL/retry instructions that could short an existing NRML option long.

## Bounded input, fail-closed conclusions

New pure function `triageNrmlOfflineIncidentReadOnly()` takes the entire Phase127 raw `BraidedAccountInput`, never a caller-forged favorable report. It re-runs the Phase127 audit and requires an `ADAPTIVE_NRML_PHASE128_HALT_TRIAGE_V1` envelope, canonical UTC assessment time, bounded 1–120-second freshness, a validated original NRML LONG-only claim and explicitly `OPERATOR_SUPPLIED_UNATTESTED` capture. Explicit incident types are regular read review, reconnect, restart, BUY partial fill, unknown SELL-child ACK, overnight gap, missing GTT parent, expiry approaching.

- Stale, future or premature review clock returns `BROKER_SNAPSHOT_STALE_OR_REVIEW_IN_FUTURE`, without reinterpreting a current long or active stop.
- Any Phase127 account/epoch mismatch, order-book before/after change, GTT/child/position drift, missing historical original BUY, duplicate ID, malformed GET-shaped record or Phase126 competing SELL source returns `BROKER_ORDER_GTT_POSITION_OR_AUTH_SCOPE_CONFLICT`. No automatic SELL retries or protective stop assertions.
- When a special restart/reconnect/partial-fill/UNKNOWN-ACK/gap/expiry incident is reported and raw source checks have not already failed, return `PARTIAL_FILL_UNKNOWN_ACK_RESTART_OR_GAP_MANUAL_RESPONSE`; a human must independently inspect broker positions, all active orders and GTT parent and child fills.
- Even a stable account/broker snapshot with same-second original BUY and GTT ordering returns `CURRENT_EVIDENCE_AMBIGUOUS_MANUAL_RECONCILIATION`; stable non-signed data is never a release certificate. Last possible descriptive label `STABLE_BUT_UNATTESTED_HUMAN_ONLY_REVIEW` also blocks all writes.

Every output includes only fixed reason/action codes, an age and the Phase127 state, NOT broker tokens, account/order/trade IDs or raw source. Recommended actions: manually freeze NEW NRML entries, never retry SELL/cancel/replace on a stale snapshot, never auto-mark CLOSED/realised P&L, never force positional NRML at 15:15, contact designated broker/risk operator for conflicts, independently verify complete source and preserve private evidence. **These are operator suggestions only, not executed actions.**

All outcomes set operatorFreezeActuallyEngaged=false, account actually authenticated=false, independent stop ACK/close-only/overnight gap/fees/OOS/calendar/human approval=false, LIVE NRML BUY/auto SELL/duplicate SELL retry/P&L writes=false and brokerWrites=0/localWrites=0. Existing Phase90 actual `LiveExecutionService` product gate remains unchanged and blocks new NRML BUY. MIS legacy separate functionality is unchanged.

## External release gates

Independent issues #17–#22 remain OPEN. Acquire licensed native option L1 archives, historical effective-dated NSE/BSE sessions/contract/lot/expiry changes, broker/exchange-signed original BUY and child/partial SELL histories, real Upstox F&O option-specific close-only/no-short and restart/overnight gap behavior, untouched original 1W/2W/4W/8W OOS risk/cost analysis, operator-owned REAL kill-switch procedure and explicit human security/ops/risk release. A read-only test harness is not an operational kill switch.

Keep PR DRAFT/unmerged/undeployed. Passing CI cannot certify profitability or authorize live NRML.