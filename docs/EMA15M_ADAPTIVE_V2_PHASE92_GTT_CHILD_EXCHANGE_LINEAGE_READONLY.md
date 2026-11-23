# Phase92 — Upstox native GTT STOPLOSS to generated child and exchange reference (read-only)

**DRAFT / NO LIVE NRML ORDERS / NO MERGE OR DEPLOYMENT.** Stacked on Phase91 Draft PR #96. User explicitly wants future LIVE NRML positional trading, but open issue #20 still blocks order routing and protective stop release.

## Correct official API schema vs Phase91 synthetic approximation

Upstox API v3 `GET /order/gtt?gtt_order_id=...` reports `quantity` on the **parent GTT order**; `rules[].strategy` is `ENTRY`, `TARGET` or `STOPLOSS`; `rules[].status` may be `SCHEDULED`, `TRIGGERED`, `OPEN`, `COMPLETED`, etc.; and the particular `rules[].order_id` identifies a **generated child order only after it is placed**. A scheduled broker GTT rule with `order_id:null` does **not** have an accepted exchange SELL child.

Upstox v2 `GET /order/details?order_id=...` returns child `order_id`, `order_ref_id`, `exchange_order_id`, account identity `placed_by`, `product`, `instrument_token`, `transaction_type`, `quantity`, `filled_quantity`, `pending_quantity` and `status`. Upstox v2 `GET /order/trades?order_id=...` provides matched individual broker trade records (each with `quantity`, `trade_id` and `exchange_order_id`). Official docs:
- https://upstox.com/developer/api-documentation/get-gtt-order-details/
- https://upstox.com/developer/api-documentation/get-order-details/
- https://upstox.com/developer/api-documentation/get-trades-by-order/
- https://upstox.com/developer/api-documentation/get-order-book/

**Phase91 correction:** `auditNrmlBrokerEvidence` previously checked `rules[].quantity` and did not recognise documented `SCHEDULED` / `TRIGGERED` GTT statuses. Phase92 now checks **parent `gtt.quantity`** and accepts these rule states as descriptive pending/triggered candidates. This does **not** imply an exchange ACK.

## Phase92 exact linkage

`adaptiveNrmlGttChildLineageAudit.ts` requires:
1. Exact connected broker-account ID matches the operator-specified comparison target **before querying any account-specific API**; source account must not be guessed from a local journal.
2. Exact **single** GTT parent `gtt_order_id`, NRML product `D`, instrument key, lot-multiple quantity, and exactly one `STOPLOSS` `SELL` rule. A TARGET SELL or duplicate STOPLOSS is not a valid unique protective stop lineage.
3. If `SCHEDULED` and `rules[].order_id === null`, return `SCHEDULED_GTT_NO_EXCHANGE_CHILD`; do **not** fetch a fake child and do not report an exchange ACK.
4. If generated child exists, fetch exact read-only `getOrderDetails(childId)` and `getOrderTrades(childId)`; require child `order_id` matches the STOPLOSS rule and `order_ref_id` matches the GTT parent, with matching NRML product, side SELL, instrument, quantity and nonempty broker-reported `exchange_order_id`. Compare current order book for a unique matching entry, reconcile `filled_quantity` with unique trade IDs and cumulative broker-reported executed quantities; unknown/partial/missing/cancel/modify/duplicate rows fail closed.
5. Compare reported remaining NRML long quantity against expected lot-multiple. This per-instrument snapshot is **not an account-wide risk ledger**, and Upstox GTT, order, trades and positions endpoints are not atomic.

`UpstoxProvider` now exposes exact-id GET-only `getGttOrderDetails()` and `getOrderDetails()` (null on unavailable/HTTP/network errors); no order/cancel/modify/GTT placement method is used. SUPERADMIN `POST /api/ema15m/nrml-gtt-child-review` accepts explicitly supplied comparison targets and returns redacted fixed reason codes / observed boolean counters; no account, token, instrument key, order IDs, prices or raw source records.

## Critical terminology and deployment gate

`OBSERVED_BROKER_CHILD_EXCHANGE_REFERENCE_NOT_RELEASE` is a **read-only diagnostic** in which the broker *reported* `order_ref_id`, exchange order ID, net quantity and trades coherently. It does **not** prove independently time-stamped exchange acceptance, ongoing unique protective coverage, live stop reliability, broker position ownership or executed fills beyond broker API claims. The output **always** has `independentExchangeChildAckCertified:false`, `liveNrmlBuyAuthorized:false`, `stopFillGuaranteed:false`, `brokerSnapshotsAtomic:false` and `brokerWrites:0`. Expired/completed GTT history may be inaccessible from the documented GET endpoint; do not infer historical completion from absence.

23 synthetic adversarial Phase92 tests, one additional Phase91 schema regression and prior 147 tests give **171 expected** in dedicated CI, plus TypeScript, Phase50–92 focused offline research, EMA15M invariant safety, full regression and production build. No licensed original NSE/BSE 1W–8W native option quote archive, real authenticated original client receipts, independent official exchange calendar, untouched OOS return evaluation, actual broker-authoritative native protective-stop lifecycle with time-ordered cancel/replace/restart/overnight partial fills, risk limits or human signoff has been supplied. Release issues #17–22, particularly #20, remain OPEN. Existing MIS 15:15 behavior unchanged; **no forced NRML 15:15 square-off**.

Keep PR DRAFT and unmerged; live NRML order dispatch remains blocked by Phase90's hard gate until a future separately reviewed and approved release.
