# Phase107 — NRML protective GTT read-only evidence across one local broker auth epoch

**STACKED DRAFT on Phase106 PR #111. No merge, deployment, live BUY/SELL,
GTT create/update/cancel, realised P&L write, automatic CLOSED or
NRML 15:15 forced exit.**

## Verified API semantics and safety problem

Upstox v3 Get GTT Details returns a parent `gtt_order_id`,
parent `quantity`, and `rules[].order_id`. An untriggered scheduled
GTT can have `order_id: null`; only after an order is created might
a child order ID exist. The v2 order details response has
`order_ref_id`, `exchange_order_id`, and order quantities. These
are broker-returned identifiers, not independent exchange-signed
execution/stop guarantees.

Phase92/93 already reconcile GTT parent -> generated child -> order
book/trades -> fresh remaining NRML position, but previously the
separate async broker GETs could use different local authentication
lifecycles if the user reconnected Upstox between stages while the
`userId` remained the same. A mixed-session result cannot be trusted.

Official sources:
- https://upstox.com/developer/api-documentation/get-gtt-order-details/
- https://upstox.com/developer/api-documentation/get-order-details/
- https://upstox.com/developer/api-documentation/get-trades-by-order/

## Changes

1. `UpstoxProvider.getBrokerAuthEpoch()` now exposes the existing
   private monotonic credential lifecycle counter (introduced in Phase106),
   without exposing token bytes, token hash or personal account details.
2. `reviewNrmlGttChildReadOnly()` requires exact connected user ID,
   a valid positive local auth epoch, and six existing GET methods.
   It verifies both identity and unchanged epoch before/after the
   initial parent/orderbook/full-GTT group, before/after linked child
   order/trades, and before/after the final net-position GET.
3. Any same-account reauth, user switch, disconnect, missing/invalid
   epoch or exception discards partial evidence and produces fixed
   redacted failure codes. The audit never retries to obtain a
   retrospectively favorable combination of stale snapshots.
4. Existing Phase92/93 positive mocks now supply stable epochs.
   Twelve additional synthetic cases cover no-reauth positive
   observations, session changes at every batch, account switch,
   disconnect, absent/invalid epoch, scheduled GTT without a child,
   partial-fill 50/100 with broker-net 50, and the SUPERADMIN-only
   route remaining write-free.
5. Dedicated Node22 static/targeted checks plus broad EMA15M
   regression and production-build CI triggers.

## Strict limitations

This is **auth-generation continuity only**, not atomic multi-endpoint
Upstox data, an independently certified child exchange ACK, a
guaranteed SL fill, full broker position/account risk clearance,
an executed NRML option trade, signed contract notes, or independent
long-horizon OOS evidence. Broker-reported child exchange_order_id
must never be equated with executable overnight downside insurance;
a long option can gap or lose its full debit.

All pure report flags continue to hardcode
`independentExchangeChildAckCertified:false`,
`stopFillGuaranteed:false`, `fullAccountRiskReconciled:false`,
`brokerSnapshotsAtomic:false`, `liveNrmlBuyAuthorized:false`
and `brokerWrites:0`. MIS-only 15:15 behavior remains unchanged.
Keep Phase107 DRAFT and LIVE NRML BUY fail-closed pending outstanding
broker-native protective SELL child/quantity, capital limits, stop
mutation/restart handling, original market data, human signoff and
issues #17-22 (especially #20).
