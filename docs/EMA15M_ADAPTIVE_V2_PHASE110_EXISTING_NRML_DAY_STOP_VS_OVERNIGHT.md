# Phase110 — Existing NRML option native SELL SL/SL-M DAY stop versus multiweek overnight protection

**Stacked DRAFT on Phase109 PR #114. Zero broker BUY/SELL/GTT writes,
zero local journal writes, no merge, no live order release, no deployment,
no realized P&L posting and no automatic CLOSED.**

## Official broker semantics and the previously unresolved gap

[Upstox Place Order v3](https://upstox.com/developer/api-documentation/v3/place-order/)
supports native `order_type: SL` (Stop Loss Limit) and `SL-M` (Stop Loss
Market) and `validity: DAY` or `IOC`, `transaction_type: SELL`, and
`product: D`. For F&O quantities are in whole underlying units/lots.

A **direct native SELL SL/SL-M** may be broker-observable against an
existing NRML option long **without creating a new GTT ENTRY/BUY**;
this is distinct from v3 `MULTIPLE` GTT ENTRY+STOPLOSS and avoids
blindly treating a new GTT ENTRY as protection on an existing long.

But native order validity **DAY is not multi-week/overnight**.
Neither an accepted order-placement acknowledgement nor a broker-
reported `exchange_order_id` proves an exchange-native, durable,
multi-session protective STOP fill; Stop Loss Market may be subject
to exchange availability, SL/MKT restrictions, market protection and
gapping/liquidity constraints. Brokers may reject attempted order
placement; this code NEVER attempts one. Even today's observed
native order may be cancelled/rejected, expire at session close or
execute at an unfavorable price on a gap.

Official sources:
- https://upstox.com/developer/api-documentation/v3/place-order/
- https://upstox.com/developer/api-documentation/get-order-details/
- https://upstox.com/developer/api-documentation/get-order-book/
- https://upstox.com/developer/api-documentation/get-trades-by-order/
- https://upstox.com/developer/api-documentation/get-positions/
- https://upstox.com/developer/api-documentation/place-gtt-order/

## Read-only implementation

`adaptiveExistingNrmlDayStopReadOnly.ts` uses an exact durable
NRML long option (account, NSE_FO/BSE_FO contract, original BUY ID,
one lot-multiple long quantity) and an admin-selected **already
existing** native SELL stop order ID. No data from the caller is used
as a BUY execution receipt.

The pure audit checks:

- Exact existing order must be `product:D`, `SELL`, `SL` or
  `SL-M`, `DAY` validity, positive stop trigger, sensible
  SELL SL limit price at or below trigger (or zero price for SL-M),
  active broker lifecycle, and quantity = original long size
- Filled + pending conserves order quantity, pending stop quantity
  matches the unique current NRML broker net long, broker net =
  original long minus uniquely observed stop SELL trade IDs, all
  whole lots for this specific diagnostic
- Exact one native orderbook child agrees with every material detail;
  full account order census excludes independent same-contract BUY,
  competing SELL, previously filled other SELL and any same-contract
  GTT that might place another BUY or STOP
- Rejection, cancel/modify pending, missing exchange ID, unknown
  net, malformed response, duplicate trade IDs, stale book or
  unresolved same-option activity all fail closed

`reviewExistingNrmlDayStopReadOnly` pins the account and provider
authentication epoch across **two independent** detail, trade,
orderbook, full GTT, and fresh net-position GET rounds (10 broker
GETs). Only if every result exactly agrees does the report mark
`BROKER_DAY_SELL_STOP_OBSERVED_NOT_OVERNIGHT_PROTECTION`.
Even then all remaining long quantity is recorded as
`quantityWithoutIndependentlyCertifiedOvernightStop`.

SUPERADMIN-only `POST /api/ema15m/nrml-existing-day-stop-review`
accepts `positionId, expectedAccountId, stopOrderId`. It gets the
durable current NRML long's original BUY ID and quantity **server-side**
and checks position and authenticated account continuity after the
broker GETs. Static fixed reason codes and quantities are returned,
not raw original BUY/SELL IDs, private accounts, trade prices or
tokens. This is a high-read-count manual diagnostic, not a poller.

## Not certified and remaining release blockers

This does NOT approve creating, modifying, cancelling or replacing
native SELL orders, starting GTT, overnight carry, auto-exit, automatic
P&L, or opening LIVE NRML BUYs. It does not check original broker BUY
against signed multi-week exchange documents, instrument-specific
SL-M eligibility, cross-session durability, native exchange-signed
ACK, synchronized cover quantity, price limit/tick constraints,
partial exit/restart recovery or portfolio-wide risk/capital/margin.

The existence of a DAY SELL stop at the time of observation
**cannot** protect a 1W/2W/4W/8W positional strategy outside
the day session. Broker-valid persistent, risk-approved protective
exit workflow (without new ENTRY), licensed historical 1W–8W data,
realistic gap/spread/slippage/OOS evidence and human signoff remain
required. Phase90 fail-closed LIVE NRML BUY interlock stays untouched.

Tests exercise synthetic equal/different net, partial fills,
SL vs SL-M, IOC/GTC/status, duplicate child/book/trade IDs,
other same-contract BUY/SELL/GTT, rotating account/epoch,
inter-round cancels/fills and SuperAdmin route no-write invariants.
Green CI is not broker-native ACK or profitability proof.
