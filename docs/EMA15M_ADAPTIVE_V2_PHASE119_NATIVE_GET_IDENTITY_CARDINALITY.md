# Phase119 — Native Upstox GTT/orderbook/trade/position account GET cardinality and identity

**STACKED DRAFT on Phase118 PR #123. Read-only diagnostics,
no broker BUY/SELL or GTT writes, no local P&L/position journal
writes, no automatic order retry or CLOSED, no merge/deploy.
LIVE NRML BUY remains blocked and 15:15 square-off remains MIS-only.**

## Why source shape matters

Earlier Phase112–118 read-only risk audits require a **complete
full-account GTT and current-day orderbook list**, plus exact
per-order trade rows and a unique NRML option net. A generic HTTP
200 with `{status:"success",data:[...]}` is insufficient to
prove those rows are structurally usable: duplicate order IDs,
malformed unrelated same-contract GTTs, wrong-GTT exact lookups,
replayed trade IDs or truncated 10k account lists must not be
treated as proof that no second SELL/BUY is pending.

New pure `adaptiveUpstoxNativeReadCardinalityGuard.ts` applies
read-only validation at the actual UpstoxProvider boundary:

- **Exact GTT ID**: 0 (historical completed GTT may be
  inaccessible) or exactly 1 valid GTT with matching requested
  `gtt_order_id`; 2+, wrong ID, malformed contract, product,
  type/rules/status → UNKNOWN `null`, not `[]`.
- **Full current GTT list**: under 10,000 rows, unique valid
  `gtt_order_id`, contract/product/type/quantity/rules and
  rule side/status. A malformed unrelated row blocks account-wide
  no-competing-GTT claims, rather than silently ignoring it.
- **Full current-day native orderbook**: under 10,000 rows,
  unique order IDs and valid instrument, product, BUY/SELL, status,
  quantity and `filled+pending <= original`. Duplicate/unknown
  order status or invalid row → `null`.
- **Per-order executions**: fewer than 5,000 rows, every
  `order_id` must match the *requested child*, all trade IDs
  unique, valid contract/product/side, nonzero fill quantity/price
  and a broker-reported exchange order ID. Other order IDs, bad
  venue reference or duplicate trade ID → `null`.
- **Full broker positions**: under 10,000 rows, valid contract,
  product, integer net and unique instrument/product combination.
  Official Upstox `/v2/portfolio/short-term-positions` returns the
  remaining net under `quantity`, not necessarily `net_quantity`.
  This adapter creates a **read-only `net_quantity` alias** only when
  the native `quantity` is a safe integer; if both are provided,
  they **must agree exactly**, otherwise return unknown/null.
  A valid negative short in an *unrelated instrument* is allowed
  as a structural row; existing Phase96 exact instrument/product
  resolver still rejects target short, duplicate or missing rows.
- **Native per-order trade token formats**: official Upstox example
  shows a legacy numeric `instrument_token` even though current
  position and contract catalogs use `SEGMENT|token`. The source
  validator may retain this *unresolved* numeric token, but **NEVER**
  silently equates it to the original NSE_FO/BSE_FO contract.
  Phase113 independent child-trade/exact-option matching must fail
  closed absent independently authenticated mapping.

A genuinely successful `[]` from an array endpoint remains `[]`,
but does NOT certify a completed GTT, absence of earlier trading
days, zero account exposure or permission to retry/cancel a SELL.
Malformed response/source → `null`. The new array caps detect
**locally apparent** over-cap/truncation ambiguity; they cannot
prove that an upstream broker account list with fewer rows was
actually exhaustive. All snapshots remain non-atomic.

## Actual integration and CI

`UpstoxProvider` now invokes these pure checks for
`getGttOrders`, `getGttOrderDetails`, `getOrderBook`,
`getOrderTrades`, `getVerifiedNrmlPositionRows`, and
`getVerifiedLivePositionQuantity`. Phase118 local
account/token/auth-epoch fences and per-GET 12-second abort
deadlines stay intact.

`ema15m_adaptive_phase119_native_get_cardinality.test.ts`
exercises **actual** UpstoxProvider GET methods with a
process-local fake `fetch`, no live credentials, no network
and no native broker POST. It includes valid/empty and malformed
exact GTT, duplicate/invalid GTT list, duplicate/invalid orderbook,
wrong order/trade IDs, over-cap trade list, bad/duplicate target
net, valid unrelated short and no-live-order invariants. Earlier
Phase117 expected raw malformed positions to be structurally usable;
the regression now explicitly allows `null` for this fail-closed
response instead of insisting on an unsafe raw array.

Node22 dedicated focused Phase90/101/104/107–119 and
broad EMA15M TypeScript/invariant/full-regression/production
build run on the final head. Green CI is mock/test correctness,
not a broker or venue signed trade certificate or investment
profitability proof.

## Still blocked

Exact GTT `ENTRY SELL BELOW` eligibility/close-only semantics
for an already-filled NRML NSE_FO/BSE_FO long; independent
exchange-native 1W–8W protective ACK; gap and limit order
non-fill; broker partial/cancel/reconnect; signed historical
order/contract notes, original NSE/BSE expiry/lot calendars,
licensed original option L1 bid/ask/depth, untouched OOS,
realised fees/margin and independent security/risk/operational
approval (issues #17–#22).

Official Upstox read-only source docs:
- https://upstox.com/developer/api-documentation/get-gtt-order-details/
- https://upstox.com/developer/api-documentation/get-order-book/
- https://upstox.com/developer/api-documentation/get-trades-by-order/
- https://upstox.com/developer/api-documentation/get-positions/

No real broker orders, GTT writes or forced NRML 15:15 exit added.
Keep DRAFT/unmerged.
