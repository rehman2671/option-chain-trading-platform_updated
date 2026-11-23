# Phase113 — Existing NRML single-SELL GTT triggered LIMIT child and unique execution IDs

**Stacked DRAFT on Phase112 PR #117. SuperAdmin manual read-only
audit, no broker BUY/SELL or GTT write, no local journal write,
no auto-CLOSED or realised-P&L posting, no deployment/merge and
no live NRML BUY release. MIS 15:15 square-off unchanged.**

## Why this is a distinct diagnostic

The [Upstox v3 GTT GET](https://upstox.com/developer/api-documentation/get-gtt-order-details/)
reports per-rule `order_id` only **after a rule produces an order**.
A SINGLE `ENTRY SELL BELOW` can generate a **LIMIT SELL** child.
The rule itself is a broker-side conditional instruction, **not**
an active exchange-native stop-loss order. A GTT LIMIT SELL may not
fill after a fast gap, can be rejected or remain partly unfilled.
Upstox's [GTT Place API](https://upstox.com/developer/api-documentation/place-gtt-order/)
says generated orders are LIMIT orders, and the GET endpoint **does
not return completed GTTs**. Thus an absent GTT parent after an
overnight trigger is **NOT** proof of full exit, nor permission to
place another SELL.

Official native GET endpoints:
- https://upstox.com/developer/api-documentation/get-order-details/
- https://upstox.com/developer/api-documentation/get-trades-by-order/
- https://upstox.com/developer/api-documentation/get-order-book/
- https://upstox.com/developer/api-documentation/get-positions/

## Implemented

`adaptiveExistingNrmlSingleSellGttChildFillReview.ts`
verifies a single original immutable NRML long's exact full-lot
contract, a SINGLE GTT ENTRY SELL BELOW, a generated `rules[].order_id`
and exact read-only `GET /v2/order/details` child. The child must be
`LIMIT`, `D`, `SELL`, same option, original quantity, and its
`order_ref_id` must equal the GTT parent. Broker exchange_order_id is
**broker-reported**, not independently signed.

The pure audit requires:
- A unique generated SELL child in the entire current-day orderbook,
  no duplicate rows, and matching side, product, price, size,
  pending/filled conservation, status and venue reference.
- OPEN/PARTIALLY FILLED/COMPLETE statuses only, with correct open
  pending and full completion quantities. Cancel/reject/modify pending
  or unknown status blocks. It does NOT retry or modify.
- Every child execution must have a unique `trade_id`, matching
  `order_id`, GTT reference when present, exchange ref,
  option contract, D, SELL, exact quantity, and positive premium price.
  Sum of unique execution quantities must equal child fill.
- Fresh native broker net must be unique D exposure and exactly
  `original long - child executed SELL quantity = pending SELL
  quantity`, whole lot or flat. Other BUY, competing active SELL,
  other filled SELL or same-contract GTT block; terminal zero-fill
  unrelated SELL doesn't imply independent protection.
- Parent GTT and full account GTT list must reconcile. Missing
  completed parent is an explicit **unknown** state, never
  automatically CLOSED.

Two-pass async wrapper pins the authenticated account and local auth
epoch, reads parent GTT, **generated child only when a proper rule
points to one**, order details, child trades, full account orderbook,
full GTT list and net. Re-reads parent at the end of each batch to
reject parent mutation; repeats and checks the entire evidence set
before returning any broker-observation state. All sources are
non-atomic; snapshots do not certify venue execution.

SUPERADMIN manual `POST /api/ema15m/nrml-single-sell-gtt-child-fill-review`
requires `positionId`, `expectedAccountId`, `gttOrderId`.
It checks same-account **unique durable NRML position**, immutable
original BUY receipt and trade IDs with weighted original entry
premium before native GETs, then repeats the durable position/BUY
journal and auth checks afterwards. No raw account/order IDs, trade
IDs, prices or tokens return in reports.

Synthetic adversarial tests cover zero/partial/full fills, split
trade IDs, duplicates, invalid exchange refs, wrong original BUY/GTT
scope, missing GTT parent, cancelled/pending orders, malformed native
net, competing independent order/GTT, authentication reconnect,
within-/between-pass changes and route write invariants.

## Still blocked — this is NOT a production exit lifecycle

- A broker-reported LIMIT SELL ACK is not exchange-hosted protective
  STOP ACK; no guarantee of stop fill after a gap.
- Broker current-day GETs are not authenticated historical trade
  completeness, particularly once GTT completed or across restart.
- A GTT SELL may create a short if the original long changes between
  snapshots; no race-free broker close-only semantics is verified.
- Not a replacement for risk-approved cancel/replace, partial-fill
  oversell prevention under concurrency, full account portfolio
  capital/margin, contract expiry, EDIS/authorisation and human signoff.
- Cannot infer that broker permits API SINGLE GTT SELL for every
  F&O option merely because its parent schema exists.
- Licensed original options L1 data, realistic slippage/transaction
  costs, untouched OOS 1W–8W and all other release blockers remain.

**All `liveNrmlBuyAuthorized`, `automaticPositionClosureAuthorized`,
`realisedPnlWriteAuthorized`, independent venue ACK and broker write
flags stay false.** There is no real order placement here.
