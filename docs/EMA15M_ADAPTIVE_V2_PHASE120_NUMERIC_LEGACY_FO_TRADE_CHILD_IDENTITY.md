# Phase120 — Corroborate legacy numeric Upstox trade token with exact generated F&O SELL child

**Stacked DRAFT on Phase119 PR #124. Read-only, ZERO broker/local writes,
no automatic CLOSED or realized P&L, no LIVE NRML BUY, no merge/deploy.
MIS-only 15:15 square-off remains unchanged.**

## Verified official API mismatch

Official [Upstox Get Order Trades](https://upstox.com/developer/api-documentation/get-trades-by-order/)
sample uses a *legacy numeric* `instrument_token` such as `151064324`,
while [Get Order Details](https://upstox.com/developer/api-documentation/get-order-details/)
and [Get Positions](https://upstox.com/developer/api-documentation/get-positions/)
return a modern `NSE_FO|...` or `BSE_FO|...` contract key. These values
**must not** be equated by stripping prefixes or guessing suffixes.
The earlier Phase113 reviewer required every generated child trade
to have exactly the modern instrument key, so valid numeric legacy
responses were unconditionally quarantined.

## Strict broker-sourced same-child cross-check only

Phase120 updates the existing pure read-only Phase113 generated SELL
child reviewer to accept a numeric token **only as unverified broker
corroboration**, if ALL of the following are already established:

- Exact persisted original BUY and NRML long option; original
  GTT **SINGLE ENTRY SELL BELOW** with generated child order ID
- Exact `NSE_FO`/`BSE_FO` GTT exchange segment, corresponding
  child/trade `NFO`/`BFO` venue
- Same exact `order_id` and broker-reported `exchange_order_id`
  between generated child order details and per-child trade
- Same exact valid nonempty `trading_symbol` on child/trade
  (and aliases `tradingsymbol` agree where present)
- Child order is `LIMIT SELL`, numeric trade explicitly
  `order_type: LIMIT`, `SELL`, product `D`
- Optional `order_ref_id` never contradicts original GTT
- Individual trade IDs remain unique, fills sum exactly to
  child `filled_quantity`, broker remaining NRML net equals
  original long minus child SELL fills and child pending
- Original/current GTT, child orderbook and broker net still
  agree across **two authenticated read passes** with a pinned
  same-account auth epoch

If a legacy token is present and corroborated, the redacted
`brokerReportedLegacyTradeTokenCorroborated` field is true.
`legacyNumericInstrumentTokenIndependentlyMapped` is ALWAYS
false, even after a stable two-pass result, and the caller
receives only broker-reported, descriptive child evidence.
Wrong exchange, missing/contradicting symbols, generated child
order ID/exchange ref/side/quantity or reauth fails closed.

## Non-release guarantees

This is **not** an authenticated mapping between native instrument
token versions, a venue-signed trade confirmation, proof that
the SELL originated from the GTT rather than some broker-side
state, exchange-native protective stop, guaranteed gap fill,
complete historical account order audit or permission to close
the durable position. All flags for LIVE NRML BUY, duplicate
SELL retry, local CLOSED/P&L writes, short prevention,
independent execution and protective-stop certification remain
false. The upstream order/GTT history is current-day-only and
completed GTTs may disappear. Missing/cancelled parent remains
Phase114/115 manual quarantine.

Phase120 focused test cases exercise actual realistic separate
NFO child/trade exchange fields, modern/numeric mixed trades,
missing or changed alias/venue, duplicate SELL fills and
two-pass broker fixtures. No actual broker order, GET or write
is made in those unit tests. Broad EMA15M CI is separate.

## External blocker matrix — unchanged

Issues #17–#22 require licensed original-time options L1,
effective-dated exchange calendars/lot/expiry, preregistered
untouched OOS and +50–70 point reversals, broker-sanctioned
existing-long F&O GTT SELL eligibility/close-only, signed
exchange/contract execution records, independent account
capital/risk/security/operations approvals.

**Green CI is not profitable or production-safe trading. Keep
Draft PR unmerged, LIVE NRML BUY interlock hard closed.**
