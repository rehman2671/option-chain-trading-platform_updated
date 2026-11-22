# Phase117 — Real Upstox GET transport fail-closed, raw order schema and log redaction

**STACKED DRAFT on Phase116 PR #121. No live broker requests in
tests, no API order/GTT writes, no auto-closure, no profit claims,
no deployment/merge or Live NRML BUY release.**

## Prior engineering gap

The Phase107–116 risk audits used synthetic native API replies and
fake broker interfaces. The real UpstoxProvider has these read-only
methods, but an HTTP status 200 alone **must not be assumed to mean
a valid broker order, trade, GTT, or position**:

- `getGttOrders()` and `getGttOrderDetails(gttId)` are GET
  `/v3/order/gtt`.
- `getOrderDetails(orderId)` is GET `/v2/order/details`.
- `getOrderTrades(orderId)` is GET `/v2/order/trades`.
- `getOrderBook()` is GET `/v2/order/retrieve-all`.
- `getVerifiedNrmlPositionRows()` and
  `getVerifiedLivePositionQuantity(..., 'NRML')` use GET
  `/v2/portfolio/short-term-positions`.

These methods already return `null` on HTTP/JSON errors. A genuinely
successful response with a valid empty account list may be `[]`.
**Do not convert an API failure to `[]` and then infer absent
same-contract orders/GTTs or an NRML position safely flat.**

Sources: [GTT GET](https://upstox.com/developer/api-documentation/get-gtt-order-details/),
[orderbook](https://upstox.com/developer/api-documentation/get-order-book/),
[order details](https://upstox.com/developer/api-documentation/get-order-details/),
[per-order trades](https://upstox.com/developer/api-documentation/get-trades-by-order/),
[positions](https://upstox.com/developer/api-documentation/get-positions/).

## Actual provider changes

- `getOrderTrades(orderId)` now rejects missing, excessive,
  slash/newline or malformed order IDs **before any network GET**
  rather than accepting any nonempty string.
- Native `getOrderDetails(orderId)` now requires a matching exact
  broker order ID, contract instrument token, product/side/type,
  status and safe-integer original/filled/pending conservation.
  HTTP 200 with `data: {}`, wrong `order_id`, negative/oversized
  quantity or malformed status is **unavailable**, not an ACK.
  Even valid broker-reported `exchange_order_id` remains NOT an
  independently authenticated protective stop/venue fill.
- Native read-path catch blocks no longer emit the raw error,
  bearer token or order reference to server logs. Read-only
  GTT/orderbook/positions/order-trades/order-history errors produce
  fixed static messages. No changes to broker order-write methods.

## Contract tests — zero real requests

`src/quant/tests/ema15m_adaptive_phase117_upstox_read_transport_contract.test.ts`
instantiates the **actual** UpstoxProvider and replaces
`globalThis.fetch` with a process-local deterministic stub, while
using **fake, nonworking** token/account/order identifiers. It
restores the original function after every scenario and rejects
any non-GET request. No live auth/connect or public network.

Tests exercise the provider code against:

- Upstox-like raw order/parent/child/trades/positions success;
  request paths and exact lookup IDs, all seven GETs, same account
  and local auth epoch.
- HTTP `401/403/429/500/503`, network exception, malformed JSON,
  invalid broker `status`, null/wrong payload, false-success
  `data:{}`, returned wrong order ID or impossible quantities.
- Correct distinction between authenticated `[]` and
  unknown `null`; an empty broker position list never certifies
  a zero net, independently approved exit or stop.
- Duplicate/other-product/short/nonwhole/invalid quantities in
  the unique native NRML net resolver.
- A broker GET transport error passed to the Phase114 missing
  GTT quarantine must return a **source-incomplete** state, never
  an absent-GTT verdict or permission to retry a SELL.
- No raw fake token/child identifier in captured warning/error
  logs when a network exception deliberately contains both.

Node22 CI runs Phase117 provider contract plus Phase90/101/104/
107–116 prior NRML non-release tests. Broad EMA15M full regression,
invariants and production build are separate branch/PR gates.
No CI success certifies live market state, 1W–8W profitability
or independently signed venue acknowledgments.

## Still external release blockers

Official Upstox API eligibility for a **SINGLE GTT SELL ENTRY BELOW**
that can reliably CLOSE, and cannot accidentally SHORT, an existing
filled `NSE_FO`/`BSE_FO` NRML option long; per-contract
broker-sanctioned tests across overnight/partial/restart/cancel;
licensed original options L1 bid/ask/depth and untouched OOS;
authenticated original exchange calendars and expiry master;
independent account-wide risk/fees/capital, key custody,
security/legal/reviewer/operations signoffs (issues #17–#22).

In particular, an Upstox DAY SL/SL-M does not establish 1–8W
overnight exchange stop continuity and a scheduled broker-side
GTT LIMIT SELL cannot guarantee an exit after an overnight gap.
**Live NRML BUY remains blocked. No native broker writes or
15:15 NRML forced square-off are introduced.** Keep DRAFT/unmerged.
