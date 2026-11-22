# Phase112 — Read-only existing NRML option SINGLE GTT with ENTRY SELL / BELOW

**Stacked DRAFT on Phase111 PR #116. Research only. No Upstox writes,
GTT placement/amendment/cancel, new BUY, live SELL, ledger mutation,
auto-CLOSED, realised P&L or production deployment.**

## Correction to Phase109–111: GTT ENTRY is not always BUY

The official [Upstox v3 GTT Place API](https://upstox.com/developer/api-documentation/place-gtt-order/)
says that SINGLE GTT has **one ENTRY rule**, and ENTRY can create
a **BUY OR SELL** order. A LONG option may plausibly use an ENTRY
`SELL` with `BELOW` premium trigger as a broker-side
**conditional exit**, without placing another BUY.

By contrast, a MULTIPLE GTT with `ENTRY BUY` + `STOPLOSS SELL`
is a linked entry-and-exit strategy and **cannot** automatically
attach its newly generated BUY to an independently executed original
NRML BUY.

Upstox [Help Center on existing positions](https://upstox.com/help-center/how-are-good-till-triggered-gtt-stop-loss-or-target-percentages-calculated-261061/)
describes GTT on existing positions/holdings. **That help article
does not establish** API-side NSE_FO/BSE_FO instrument eligibility,
SELL authorization, short-selling prevention, GTT limit-order
market protection or an externally authenticated native stop.
Confirm the exact workflow with Upstox before implementing writes.
Upstox official API warns that a triggered GTT generates a
**LIMIT order**, which can be rejected, gap past the trigger, or
stay unfilled. The GTT condition may remain valid up to one year,
but an expiry timestamp is not continuity proof.

Useful docs:
- https://upstox.com/developer/api-documentation/place-gtt-order/
- https://upstox.com/developer/api-documentation/get-gtt-order-details/
- https://upstox.com/developer/api-documentation/get-order-book/
- https://upstox.com/developer/api-documentation/get-positions/
- https://upstox.com/developer/api-documentation/get-order-details/

## Phase112 read-only inspection

`adaptiveExistingNrmlSingleSellGttReadOnly.ts` audits only an
**already existing** broker GTT. It does not build/order/dispatch
one. Unique durable NRML F&O option long, filled original BUY,
account ID, whole-lot original quantity, and 1/2/4/8-week horizon
come from the server-side journal and SUPERADMIN request.
The independent BUY order is not treated as a GTT ENTRY child.

For one authenticated broker session (account and monotonic local
auth epoch), perform **two** read batches, each calling these GETs:

1. Exact `GET /v3/order/gtt?gtt_order_id=...`
2. Full account `GET /v3/order/gtt`
3. Current `GET /v2/order/retrieve-all` (broker orderbook)
4. Current NRML net `GET /v2/portfolio/short-term-positions`

The pure scope audit checks:
- Exactly one selected parent, `type:SINGLE`, `product:D`,
  exact `NSE_FO|` or `BSE_FO|` instrument, quantity equal to the
  unique current positive whole-lot NRML net (no greater than the
  immutable original BUY).
- Exactly one `ENTRY` rule: `SELL`, `BELOW`, positive
  2-decimal premium trigger, `status:SCHEDULED`,
  **`order_id:null`**. BUY, STOPLOSS-only, MULTIPLE, triggered,
  pending, cancelled, expired or unknown statuses fail closed.
- Full GTT list exact corroboration and no second same-contract GTT;
  complete original BUY in current orderbook is acceptable but
  unrelated BUY, pending SELL, other SELL executions and malformed
  full-account rows are not.
- Parent broker `created_at`/`expires_at` are validated as
  **microsecond Unix timestamps**, with expiry covering all planned
  calendar weeks, and no improbable validity longer than 366 days.
  **This is not exchange-master expiry or exchange trading-calendar
  certification.**
- Both batches and auth epochs must match exactly, otherwise reject
  changed trigger, quantity, fills, orderbook/GTTs or account change.
  No polling retries and no claim of atomic broker snapshots.

Stable result:
`SCHEDULED_BROKER_SIDE_SELL_CONDITION_NO_NATIVE_STOP`.
A scheduled broker-side rule has **no generated exchange child**;
when triggered it requires a different child/trade/net lineage
audit. Any observation remains **non-atomic broker-reported
condition only**, with zero independently certified native stop
cover and zero guaranteed gap fill.

## SUPERADMIN endpoint and prerequisites

`POST /api/ema15m/nrml-existing-single-sell-gtt-review`

Inputs: `positionId`, `expectedAccountId`, `gttOrderId`,
`horizonWeeks` (1,2,4,8). No caller-controlled fills, debit
premium, execution trade IDs, transaction type, STOP trigger
or broker write commands. The endpoint reads the immutable original
BUY receipt and trades from SQLite, validates quantity, exact trade
IDs and weighted premium, gets an authenticated broker session,
runs the GET-only research audit and rechecks durable journal and
broker epoch before returning redacted static states and counts.
No raw account identifiers, order references, option symbols,
broker exchange IDs, trade receipts or tokens are returned.

## Release blockers

The v3 GTT `ENTRY: SELL` is **not** the same as
`STOPLOSS` strategy; API documentation does not certify
that one such SELL can safely close the exact existing NRML long,
rather than opening a short after a position change. Nor does a
conditional GTT remain an exchange-hosted, continuously live
protective stop overnight. Verify F&O option-specific eligibility,
EDIS or other SELL authorization, trigger/tick/protection policy,
full account exposure, how to prevent duplicate active SELL/GTT
orders, partial fills/cancel-replace/restart, price gaps,
expiry/exchange trading sessions, native venue order acknowledgement,
fees, taxes, historical 1W–8W strategy OOS and human risk limits.

**LIVE NRML BUY release remains disabled** under the Phase90
interlock. Existing MIS 15:15 square-off behavior is unchanged;
NRML is NOT forcibly squared off at 15:15. Green CI is not
live broker/exchange confirmation or strategy profitability.
