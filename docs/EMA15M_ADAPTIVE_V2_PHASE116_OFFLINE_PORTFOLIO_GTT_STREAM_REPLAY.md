# Phase116 — Offline-only Upstox portfolio stream GTT -> LIMIT SELL -> NRML position replay

**Stacked DRAFT on Phase115 PR #120. No real socket connection,
new webhook endpoint, live BUY/SELL/GTT, broker/local writes,
automatic CLOSED, P&L settlement, merge or deployment. Phase90 LIVE
NRML BUY stays blocked; 15:15 forced square-off remains MIS-only.**

## Why add a different corroboration source?

Official [Upstox Portfolio Stream Feed](https://upstox.com/developer/api-documentation/get-portfolio-stream-feed/)
allows an OAuth/Bearer authenticated WebSocket connection to receive
order and `gtt_order` update messages and optionally positions:
`update_types=order,gtt_order,position`. It publishes a GTT parent
ID, rule's generated child `order_id`, plus order `order_ref_id`,
filled and pending quantity and a broker-reported exchange order
reference. Captured **before** the broker stops returning completed
GTT parents, these events may be useful for **descriptive linkage**
after a restart. They are NOT signed exchange contract notes or
guaranteed complete: disconnects, unseen earlier sessions and
transports can miss important events. An exchange_order_id in an
Upstox message is broker-reported, not independent venue proof.

Critically, official [Upstox webhook](https://upstox.com/developer/api-documentation/webhook/)
says its public POST receiver **should not require authentication**.
Webhook payloads can be forged and therefore must NEVER unlock
NRML live orders or infer a filled SELL. **Phase116 deliberately
creates NO public POST/webhook handler, socket client or database
collector.** It is only an offline, pure, synthetic contract audit.

## Deterministic offline validator

`adaptiveNrmlOfflinePortfolioGttStreamAudit.ts` consumes an
internally staged event bundle. It validates:

1. Exactly one pinned `expectedAccountId`, `expectedAuthEpoch`,
   NRML `NSE_FO|` or `BSE_FO|` option, original long whole lots
   and an already-known GTT ID. A stream bundle of 3–5000 locally
   sequenced records must claim an authenticated websocket transport;
   public webhook, missing/malformed or unknown event types deny.
2. A strictly increasing **local** receive sequence and capture
   timestamp across **one** session/credential generation. This is
   only recorder metadata, NOT an Upstox sequence guarantee, verified
   authenticated handshakes, proof that events were never dropped,
   or an issuer-signed historical transcript.
3. The same-option SINGLE GTT must have an `ENTRY SELL BELOW`
   rule with original long size. An allowed generated child status
   (`TRIGGERED/OPEN/COMPLETED`) must contain a stable order ID.
   `SCHEDULED` with `order_id:null` can precede generation but
   cannot be interpreted as generated, or revert after generation.
   MULTIPLE/BUY/STOPLOSS-only, another same-contract GTT, failed
   GTT or changed child ID blocks.
4. After the parent-generated child ID, order updates must be
   `order_ref_id` equal to that GTT, exact `SELL LIMIT`,
   `product:D` and option, original quantity, valid price,
   cumulative filled+pending and stable broker-reported
   `exchange_order_id`. Cancel/reject/modify-pending,
   quantity changes, decreasing filled quantity, competing
   BUY/SELL or multiple child IDs fail closed.
5. A subsequent same-option `position` event must have positive
   whole-lot net or zero and equal **original BUY – latest child
   SELL cumulative fills = child remaining pending**. Missing,
   stale, negative/short, non-whole-lot or conflicting position
   events block. A reported zero still CANNOT authorize P&L/closure.

Even a perfect synthetic replay is classified only:
`BROKER_REPORTED_WS_GTT_SELL_CHILD_NO_EXCHANGE_PROTECTION`,
with redacted static reasons, counts, observed remaining and
already-filled units. Every independent exchange stop ACK, stream
authenticity/completeness, close-only/short protection, uninterrupted
multiweek validity, fees/account margin, journal write, duplicate
SELL retry and LIVE NRML BUY flag is hardcoded **false**.

## Untested/external production prerequisites

- A reviewed production WebSocket recorder (not a public unauthenticated
  webhook) bound to a real authenticated account, connection/epoch and
  tamper-evident append-only storage, with sensitive token/log handling;
  this capability is intentionally **NOT** implemented.
- Authenticated cross-session continuity and reconciliation against
  broker GETs, original BUY/SELL trade IDs, signed exchange/contract
  notes, broker-authorized F&O GTT SELL eligibility and account-wide
  risk/short protection. Never treat event continuity as proof that
  no messages were lost during disconnect.
- Confirm whether the broker guarantees GTT ENTRY SELL merely
  closes an existing NRML F&O long. A conditional LIMIT SELL
  can gap, reject or remain unfilled; 1W–8W overnight stop
  coverage is NOT guaranteed.
- Official effective-dated calendars, licensed original options L1
  (spread/depth), true out-of-sample results, security and manual
  capital/operations/signoff (open issues #17–#22).

No operator-supplied bundle, websocket event, public webhook or
successful test is a safe or supported production release key.
The offline validator has **no server route** and **cannot**
create, retry, modify or cancel broker orders.
