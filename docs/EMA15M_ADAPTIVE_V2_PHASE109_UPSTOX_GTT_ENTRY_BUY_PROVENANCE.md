# Phase109 — Official v3 GTT MULTIPLE ENTRY/STOPLOSS linked to original durable NRML BUY

**Stacked DRAFT on Phase108 PR #113. No merge, live order submission,
GTT placement/modification/cancellation, settlement, automatic CLOSED or
deployment. NRML LIVE BUY release remains blocked; 15:15 forced
square-off is MIS-only.**

## Critical live broker contract mismatch discovered

Upstox [Place GTT Order](https://upstox.com/developer/api-documentation/place-gtt-order/)
requires exactly one `ENTRY` rule for SINGLE, and for MULTIPLE a
nonduplicate 2–3-rule sequence including `ENTRY`, then exit
`STOPLOSS` or `TARGET`. `ENTRY` BUY means a **new order when the
GTT entry condition triggers**. It cannot safely be treated as an
automatic protective attachment to an already separately executed
NRML BUY. A second GTT ENTRY could double exposure, and the original
BUY order ID is not retroactively a generated GTT ENTRY child.

[Get GTT Details](https://upstox.com/developer/api-documentation/get-gtt-order-details/)
returns `type`, parent `quantity`, `product`,
`instrument_token`, and per-rule `strategy`, `status`,
`trigger_type`, `trigger_price`, `transaction_type`,
`order_id`. `rules[].order_id` may be null until a native child is
generated; having a GTT parent ID is not an exchange stop ACK.

Consequently, Phase92–108's synthetic one-rule STOPLOSS parent
fixtures cannot establish an official live GTT entry-or-stop
schema and **must not** be used as live release evidence.

## What Phase109 implements (GET-only)

- New `adaptiveNrmlGttEntryBuyProvenance.ts` pure validator:
  - Exact account/position/GTT and NSE_FO or BSE_FO NRML instrument,
    whole lots and original long size
  - Parent `type:'MULTIPLE'`, `product:'D'`, quantity, 2–3
    unique strategies, exactly one ENTRY BUY and STOPLOSS SELL,
    positive trigger prices and required exit `IMMEDIATE` trigger type
  - ENTRY's broker-generated `rules[].order_id` MUST equal the
    immutable original BUY order ID, with an executed ENTRY lifecycle
  - Native original BUY details must be filled and match account-scoped
    immutable exchange order ID, instrument, product, side and whole qty
  - Every native original BUY `trade_id`, size, price and exchange
    ref must exactly match the local durable BUY trade ledger
  - Scheduled STOPLOSS with null order ID stays **no exchange child**;
    triggered broker child ID is only broker-reported, not an
    independent stop certificate
- Async read-only validator pins account and local broker auth epoch
  across first GTT GET, the broker original BUY details/trade GET pair
  and final GTT GET. Drift, disconnect, account switch, invalid/missing
  session, missing current-day broker trades or historical gaps
  fail closed. It avoids querying original BUY details if the GTT
  ENTRY child does not match it in the first place.
- SUPERADMIN `POST /api/ema15m/nrml-gtt-entry-provenance-review`
  accepts `positionId, expectedAccountId, gttOrderId`. It reads the
  durable original BUY receipt/trade IDs from the SQLite journal
  (NOT from caller-controlled trade rows), verifies position/attempt
  linkage before requests, and re-reads that journal and the pinned
  auth epoch after broker GETs. No broker or local writes, no
  identifiers/prices returned to the caller.
- Dedicated Phase109 adversarial synthetic tests plus prior Phase92–108
  and Phase101 regression, TypeScript, broad EMA15M and build CI.

## Non-release and design implications

Even a positive GTT ENTRY+BUY match only shows broker-reported
consistency. It cannot prove genuine exchange acceptance of protective
STOPLOSS, covered SELL quantity, perpetual stop validity, spread/gap
execution, account risk capital, margin, exchange/segment eligibility,
EDIS/other SELL authorization, taxes, signed contracts, licensed
historical 1W–8W option L1 data or untouched OOS profitability.

The docs' placement-schema requirements are **not** broker-validation
of actual `NSE_FO`/`BSE_FO` availability; Upstox may reject
an instrument or token type in live trading. No request to
`POST /v3/order/gtt/place` is made.

**Key next decision:** design a separately broker-supported
protective **exit for an existing filled option long**, without
silently submitting a second ENTRY; resolve this with broker-native
official validation and independent human risk/operations review before
any real capital. Issue #20 and the other pending release blocks
remain open. No green synthetic CI grants permission to trade.
