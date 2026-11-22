# Phase115 — Missing completed SELL GTT, historical F&O trade IDs and fresh NRML broker net

**Stacked DRAFT on Phase114 PR #119. Read-only manual research,
zero broker or SQLite writes, no live NRML BUY, no SELL/GTT creation
or retry, no automatic CLOSED, no realized P&L, no deployment/merge.
MIS 15:15 forced square-off unchanged.**

## Existing gap

Official Upstox [Get GTT](https://upstox.com/developer/api-documentation/get-gtt-order-details/)
does NOT return completed GTTs. [Native order details](https://upstox.com/developer/api-documentation/get-order-details/)
and today's orderbook do not retain order evidence indefinitely. A
missing original SELL-GTT parent after restart is not proof that its
limit SELL was generated or filled. If the original long was reduced,
creating another full-quantity SELL can open an unwanted short.

Official [historical FO trade reports](https://upstox.com/developer/api-documentation/get-historical-trades/)
contain trade_id, original date, option_type, expiry, exchange,
strike, underlying, side, quantity and price; for F&O they do
**not** consistently include the original order_id or
instrument_token. The historical API reports broker account trading
activity, **not exchange-signed contract notes**, venue stop ACK,
independent closure or complete account margin/taxes. It currently
supports the last three financial years; our Phase104 importer
intentionally narrows a single original 1–8W option hold to a
**bounded 120-calendar-day, at most 20-page** read to fail closed
on oversized/unknown pagination.

## Implementation

`adaptiveNrmlMissingGttHistoricalExitJoin.ts` composes two
independently implemented READ-ONLY diagnostic sources:

1. **Phase114** — exact account, native NRML net and missing GTT
   two-pass restart review (or orphan SELL child in today's book)
2. **Phase104** — authenticated, complete bounded-paginated original
   `FO` historical rows for every immutable BUY and SELL
   `trade_id`, option contract/expiry/strike/date/side/quantity/price
3. **Fresh broker net GET** after historical reads, which must equal
   both the Phase114 net and `original long - immutable SELL fills`

Even if all match, the result is explicitly
`BROKER_REPORTED_HISTORICAL_BUY_SELL_MATCH_NO_GTT_CLOSE_CERTIFICATE`.
It says **descriptive broker report agreement, NOT independently
certified GTT child linkage or broker/exchange settlement**.
A missing historical row, extra same-contract trade, nonwhole lot,
changed broker net, inaccessible GTT, unknown auth epoch or
uncorrelated generated child fails closed. If the GTT parent remains
retrievable and references a child, the separate Phase113 order
details/trades/net review is required first; no retrospective link
from FO history is invented.

### SUPERADMIN manual diagnostic

`POST /api/ema15m/nrml-missing-gtt-historical-sell-review`
accepts `positionId, expectedAccountId, gttOrderId`.
It requires a unique **EXIT_PENDING** NRML F&O durable long,
original filled BUY receipt plus immutable BUY and SELL execution
trade IDs and a prior durable SELL child observation. It does not
accept caller-supplied fills, option price, contract, history records
or synthetic broker acknowledgment.

Internally: pin same account and both the local broker and
historical FO auth epochs, run Phase114 two-pass GTT/portfolio read,
require parent missing, run Phase104 sequential full FO pagination,
fetch fresh NRML net, repeat Phase114 full two-pass audit, and
reject changed GTT/net, account/auth epochs or immutable BUY/SELL
journal. Report only fixed redacted reasons, counts and remaining
net—not credentials, original contract/order/trade IDs.

This high-GET-count endpoint is a **manual research diagnostic**
and is NOT a background poller, automatic recovery process or
order replacement/close route.

## Hard blockers

Every report returns
`automaticPositionClosureAuthorized:false`,
`realisedPnlWriteAuthorized:false`,
`duplicateSellRetryAuthorized:false`,
`gttCancelOrReplaceAuthorized:false`,
`liveNrmlBuyAuthorized:false`, `brokerWrites:0`,
`localWrites:0`.

Real persistent native protection for a separately filled option
long remains unverified. Absent exchange-signed child trade and
contract-note evidence, broker close-only semantics, cross-session
original order history, EDIS/SELL authorization, margin/tax/fees,
late fills, expiry, historical L1 data and human risk/statistical
review prevent release, even when historic trade_id rows all
appear to match.

Sources: Phase104 historical full-page audit, Phase114 restart
quarantine, original BUY/SELL durable journal, official Upstox
GET GTT and FO historical trade API. Green synthetic CI cannot
replace signed execution or profitable OOS evidence.
