# Phase93 — Original NRML long minus broker-confirmed STOP SELL execution must equal remaining net position

**DRAFT / OFFLINE SAFETY / USER WANTS FUTURE LIVE NRML / ZERO LIVE NRML BUY AUTHORIZATION.**
Stacked on Phase92 Draft PR #97. No orders or GTT instructions were placed, amended or cancelled; no broker authentication or private production market data were accessed by these changes.

## Critical Phase92 finding

Phase92 linked a broker-reported GTT parent STOPLOSS rule to a generated child order, child order_ref_id, exchange_order_id, current order book and individual SELL trades. But it compared the **current broker net long quantity** to the **ORIGINAL long option entry quantity**, without subtracting cumulative executed SELL fills. A 100-unit original long with a GTT child SELL confirming 50 units executed could still show a seemingly coherent report while an old broker portfolio snapshot reported 100 units, although the implied remaining net exposure would be 50 units absent other legitimate trades.

This can disguise a stale broker view, an unreconciled discretionary trade, an incorrect original quantity or duplicate/partial fills. As Upstox's documented portfolio API exposes current `net_quantity`, while order details expose `filled_quantity` and `pending_quantity`, these must be reconciled conservatively rather than assumed equivalent or atomic.

Official broker API reference:
- https://upstox.com/developer/api-documentation/get-positions/
- https://upstox.com/developer/api-documentation/get-order-details/
- https://upstox.com/developer/api-documentation/get-order-book/
- https://upstox.com/developer/api-documentation/get-trades-by-order/

## Phase93 change

- Define expected remaining NRML long **for this explicitly scoped original entry and broker-reported SELL child** as:
  `expectedRemaining = originalLongQuantity - aggregateVerifiedSellFillQuantity`.
  `originalLongQuantity` is an operator-declared comparison target; it is **not independently authenticated**. The underlying original account/contract/lot and external trades remain unverified.
- Reject absent or multiple matching position rows, negative, fractional, unsafe or string-coercible noninteger net quantities. Reject cases where `net_quantity` fails to equal the expected remaining exposure, or a child claims a SELL quantity beyond the original long. Scheduled GTTs without a generated child require original net exposure (0 observed child fills).
- Report only `brokerReportedNetPositionMatchesExecutedSellRemainder:boolean`, fixed error reason codes and existing redacted booleans. Never echo account, original quantity, instrument key, child ID, GTT ID, broker raw API response or private quote. Old field `brokerReportedNetLongQuantityMatches` now means *remaining current net matches independently compared original minus broker-reported executed SELL* rather than absolute original entry at all stages.
- Cross-check exact child `orderBook` versus child order details for `order_id`, `order_ref_id`, `exchange_order_id`, instrument, NRML product, SELL side, originally listed quantity, `filled_quantity`, `pending_quantity` and status. Contradictory independent endpoint observations are flagged; DO NOT cherry-pick whichever response looks safer. OPEN/PARTIALLY FILLED/COMPLETE states with impossible cumulative or pending quantities also fail closed.
- Change `reviewNrmlGttChildReadOnly` to fetch the source GTT and ordinary order book, then child detail and trades when a generated child exists, and **only after those read requests** fetch a *fresh current broker net position*. This reduces (but cannot eliminate) a known receipt-order race where an earlier portfolio query predates a just-observed SELL fill. No polling, broker state mutation or retry-to-optimise-match occurs.

**Conservation is not certification:** This diagnostic cannot establish that the position data were atomically as-of the trade details, identify every other contract/account/manual action, prove a venue ACK or ongoing protective stop, or guarantee a future fill through an overnight gap. `independentExchangeChildAckCertified:false`, `fullAccountRiskReconciled:false`, `brokerSnapshotsAtomic:false`, `stopFillGuaranteed:false`, `liveNrmlBuyAuthorized:false` and `brokerWrites:0` remain hard-coded on every response. The Phase90 broker-facing NRML BUY gate and MIS-only 15:15 forced square-off are unchanged.

## Test plan

Existing Phase92 partial-fill synthetic fixture corrected to show 100 original → 50 executed SELL → 50 current broker net, with consistent broker order book. Eighteen additional Phase93 adversarial synthetic cases cover zero fill/unchanged net, coherent partial and full fills, stale 100 after 50 sold, wrong net, malformed/duplicate current positions, inconsistent child cumulative/pending/terminal status, contradictory order-book fill/status/venue ID, missing trades, scheduled GTT when net has already changed, read-only account-verified post-child portfolio fetch sequencing, and portfolio read failure. Combined targeted Phase79–93 tests expected **189**, subject to actual GitHub CI verification.

External release blockers #17–22, particularly #20, remain open: licensed real NSE/BSE original 1W/2W/4W/8W option BID/ASK/depth, issuer-authenticated expiry/calendar, original receipt provenance, multi-regime OOS slippage/theta/IV, broker-authoritative single protective SELL child exchange acknowledgement, cancel/modify/partial-fill/restart/gap failures, full account-wide exposure/risk caps, and separate human production approval. Stacked PR stays draft/unmerged.

NRML positional options remain eligible for multi-day/week holding in the planned live feature; no forced 15:15 NRML exit. The legacy intraday MIS schedule remains unchanged.
