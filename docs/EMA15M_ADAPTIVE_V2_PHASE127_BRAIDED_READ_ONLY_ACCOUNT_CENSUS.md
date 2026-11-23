# Phase127 — Eight-read braided account order / GTT / NRML position TOCTOU quarantine

**Stacked Draft on Phase126 PR #131. OFFLINE only. NO Upstox GET or order/GTT mutations, no automatic exit, no realized P&L, no LIVE NRML BUY, and no NRML 15:15 forced square-off.**

## Design goal

Phase125 verifies two supposedly identical original BUY per-order trade payloads. Phase126 additionally verifies current-day orderbook, remaining NRML net and two active GTT parent lists. However a non-atomic series of broker GET calls can miss an order placed, SELL child fill, GTT trigger or net change *between* GETs. The actual broker GETs are not performed by this module. An operator supplies four read-only response receipts per pass, across two passes, including their claimed account, auth epoch, request ID and canonical UTC capture time.

Each pass strictly follows ORDER_BOOK → GTT_ORDERS → POSITIONS → ORDER_BOOK; both passes are sequential and must fall after the original Phase125 BUY trade captures, before the shared review clock, with bounded pass and total observation durations. All eight receipt IDs must be distinct from one another and from the Phase125 original per-order BUY reads. Source account/auth epoch must remain the same across every receipt. These source fields are **caller assertions**, not authentic broker identity, network provenance, synchronized clocks or exchange signatures.

## Strict snapshot comparison

Pure TypeScript module: `src/server/engine/ema15m/adaptiveBraidedNrmlAccountReadsReadOnly.ts`. It validates whole, bounded, strict read-only arrays, their unique native order IDs / GTT parent IDs / instrument-product position keys, and ALL source row fields (canonical key order, independent of outer list ordering). Cyclic objects, non-finite fields, oversized rows, malformed or missing data fail closed.

- Orderbook before and after EACH GTT/position GET must match exactly, or return ORDERBOOK_CHANGED_WITHIN_FIRST_OR_SECOND_PASS. This catches observed in-flight native child fills, extra SELLs, cancel-pending state, quantity edits and other TOCTOU shifts; it does NOT prove changes absent between individual timestamps.
- Both passes must agree on the entire current-day orderbook, all current GTT parent rows and the entire position census. GTT/position/order drift is separately quarantined, even when the original BUY trade receipts agree.
- Braided GTT/order/position sets must also match the matching caller-supplied Phase125/126 account sources, otherwise BRAID_SOURCE_DIFFERS_FROM_PHASE125_126_ACCOUNT_CENSUS.
- Only after eight-source reconciliation does the audit run Phase126. Existing Phase126 conflicts (other active/pending/filled BUY or SELL, extra conditional GTT, missing original BUY in current-day book, old original trade claimed as today, net conflict or GTT ambiguity) remain quarantined.
- At best a stable snapshot returns EIGHT_SOURCE_READ_BRAID_STABLE_SAME_SECOND_GTT_UNRESOLVED or EIGHT_SOURCE_READ_BRAID_STABLE_NOT_HISTORICALLY_ATTESTED. Neither says the SELL GTT is an exchange-native stop or a protected quantity; historical risk and overnight gaps remain UNKNOWN.

## Nonclaims / blockers

Official Upstox orderbook is current trading day scoped. Completed GTT parents cannot be read by the normal active GTT endpoint. Two sets of apparently consistent current snapshots do not constitute broker/exchange attestation, historical trade/order continuity, expiry/lot/issuer calendar certification or sanctioned close-only/no-short SELL protection. The module includes no real HTTP, storage or private instrument/account data in its output. All independent risk/live/order/P&L/retry/overnight-stop booleans are FALSE; brokerWrites=0 and localWrites=0.

Source references: https://upstox.com/developer/api-documentation/get-order-book/ and https://upstox.com/developer/api-documentation/get-gtt-order-details/ and https://upstox.com/developer/api-documentation/get-trades-by-order/ .

Issues #17–#22 remain OPEN: original licensed option L1 bid/ask/depth, authentic time-versioned NSE/BSE exchange sessions and contract/expiry/lot master, independent original broker trade execution timestamps, complete cross-session SELL/GTT native child/partial-fill/restart proof and gap risk, untouched realistic 1/2/4/8-week OOS costs/drawdown, legal/risk/security/operator review and human release authorization. Keep all research PRs **DRAFT**, unmerged and undeployed. **Never flip LIVE NRML** based on passing CI.