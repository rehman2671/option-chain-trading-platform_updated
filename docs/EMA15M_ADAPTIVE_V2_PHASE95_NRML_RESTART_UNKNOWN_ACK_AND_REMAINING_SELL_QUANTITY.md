# Phase95 — NRML restart quarantine and remaining-position live SELL sizing

**DRAFT · stacked on Phase94 PR #99 · no live NRML BUY release, no broker writes made during development/tests.** The operator's long-term goal includes **LIVE positional NRML 1W/2W/4W/8W CE/PE** options and must not inherit an automatic MIS 15:15 square-off. Phase90 real NRML BUY gate remains fail-closed until genuine broker-native stop/position/expiry/risk evidence is reviewed independently.

## Actual execution bug found and corrected

In the existing broker-facing `LiveExecutionService.requestLiveExit()`, code had already calculated

`remainingQty = originalPositionQty - previouslyConfirmedSellFills`

and demanded a fresh broker net matching that remainder, **but then still submitted `placeOrder({quantity: pos.quantity, transactionType:'SELL'})`** using the original position quantity. For an original 100 option contracts with an earlier confirmed 50-contract partial exit, a new 100-contract SELL would exceed the 50 still held. Matching broker net did not prevent the bad SELL sizing. This is a concrete live-order quantity defect and can affect MIS as well as any manually held legacy NRML position.

Phase95 introduces `adaptiveLiveSellQuantityGuard.ts` and uses its output **directly** at the broker order boundary:

- Strict positive integer original quantity and lot-size; nonnegative safe cumulative confirmed exit fills; remaining must be positive and a whole lot multiple.
- Fresh broker-reported net must be an exact **number**, equal to `remaining`. Null, string-coerced, missing, mismatched, negative, fractional, overfilled or stale broker quantity rejects **before** broker placement.
- Broker SELL call receives `quantity: remainingQty`, **not** original `pos.quantity`, and the audit event records both original and remaining quantity.
- If there were earlier confirmed SELL fills, even an immediate COMPLETE response for this new remaining SELL is **not marked a newly fully reconciled CLOSED position**. It stays `EXIT_PENDING` until the reconciler validates cumulative original order lineage/partial fills and total P&L. No profitability claim is inferred.
- This is a targeted correctness fix of the existing legacy SELL path, **not an NRML live activation**. Non-atomic broker snapshots, partial fills during network requests, or erroneous broker receipts can still produce risk; manual broker monitoring is essential.

## Durable restart/read-only diagnostic

A process can crash, lose an HTTP response, or restart after broker accepted an order but before a durable response ID is recorded. **Absence from a current order book is NOT proof that a submitted SELL was rejected**. A fresh duplicate SELL may over-exit the position, while scheduled GTTs can later trigger without appearing as exchange children.

New `adaptiveNrmlRestartQuarantine.ts`:
- Reads the durable live NRML position journal (account, instrument key, product `NRML`, original quantity, `exitFilledQuantity`, `exitBrokerOrderId`, status, lot size), original entry BUY attempt, and separately fetched broker connection, current portfolio net, full order book and full GTT list.
- Scopes to a single authenticated broker account and exact NRML option, rejects duplicated active local positions, missing/unresolved entry attempt, mismatched saved quantity, stale broker net or wrong product.
- Uses the existing deterministic **`emaBrokerOrderTag('SELL', durablePositionId)`** to identify potential source orders without inventing matching orders from timestamps/strike/quantity alone. A tag or journaled order ID missing, duplicated, unknown or present without durable acknowledgement remains unresolved.
- Counts *possible* existing/filled SELLs, pending BUYs and GTT SELL rules, including `CANCEL PENDING`, `SCHEDULED`, `TRIGGERED` and transport errors. No data feed can prove absence of all past orders solely from current endpoints.
- All reports set `duplicateSellRetryAuthorized:false`, `liveNrmlBuyAuthorized:false`, `independentExchangeStopAckCertified:false`, `brokerSnapshotFreshnessCertified:false`, `manualReconciliationRequired:true` and `brokerWrites:0`. Apparent clean snapshots return **`RESTART_OBSERVED_ONLY_QUARANTINED`**, never a safe automatic retry.
- New superadmin-only `POST /api/ema15m/nrml-restart-review` accepts a durable `positionId` and expected broker account, fetches actual durable OPEN/EXIT_REQUESTED/EXIT_PENDING/EXIT_FAILED/PARTIALLY_CLOSED positions and entry attempt from the server's local database, confirms the selected journal's NRML account, and calls only the broker's **read-only** connection, full order-book, GTT and portfolio GET helpers. The response exposes bounded counts/static reasons but **never raw account, option key, order IDs or access tokens**. HTTP failures yield a generic incomplete/unavailable report, not permission to trade.
- Operator input for expected account is a **comparison target**, not an independently signed proof of broker account ownership. Different network GET endpoints are non-atomic. The module **does not persist a new stop lifecycle journal**, place/cancel/modify any order, or claim recovery from arbitrary old/expired broker GTT history.

## Tests and remaining blockers

29 new synthetic Phase95 tests cover original-vs-remaining SELL quantity; prior exit 50/100; stale net, unavailable broker, wrong lot, unknown IDs, duplicate deterministic tags, local duplicate positions, unresolved entry BUY, pending GTT outside exchange orderbook, cancelled partial SELL, failed/missing broker source, connected-account isolation, read order and zero mock broker writes. With Phase94's 212 expected tests, dedicated Phase95 suite expects **241 synthetic tests**; exact CI counts must be checked on final commit, plus TypeScript static, Phase50–95 focused and EMA15M full regression/safety/build.

**Live NRML remains OFF at the order gate.** Before real-money release: independently certified broker-native protective SELL/GTT child exchange acknowledgement, unique covered quantity over the full lifecycle, real Upstox-sanctioned test environment for cancel/partial/unknown ACK/restart/overnight gaps, separate durable account-wide ledger and kill switch, exchange calendar/expiry and lawful original option L1 evidence, genuine multi-regime untouched OOS evaluation and explicit human release approvals. Existing release issues #17–22 (especially #20) remain open. Do not merge, deploy or claim safety based on synthetic CI. Existing MIS 15:15 forced exit is unchanged; NRML positional holding never receives a forced 15:15 exit.
