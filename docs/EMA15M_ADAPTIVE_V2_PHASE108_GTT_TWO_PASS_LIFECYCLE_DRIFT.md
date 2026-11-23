# Phase108 — Read-only two-pass NRML GTT / child lifecycle drift quarantine

**STACKED DRAFT on Phase107 PR #112.** No merge, no live BUY/SELL
placement, stop/GTT creation, modification, cancellation, ledger settlement,
automatic CLOSED or deployment. MIS-only 15:15 square-off unchanged;
NRML positional overnight carrying must **not** be forcibly squared off.

## Why this matters

Phase92–107 can reconcile one broker-reported active GTT STOPLOSS child,
trade IDs and fresh remaining NRML net exposure under a stable local
authentication epoch. However the endpoints are not atomic. Between
GTT GET, child order GET and portfolio net GET, a parent can expire,
be cancelled, have trigger price/quantity modified, replace the child,
encounter duplicate SELLs or receive new partial fills. A once-clean
observation must not be retained as a protective stop certificate.

Official API documentation:
- [Upstox v3 Get GTT Order Details](https://upstox.com/developer/api-documentation/get-gtt-order-details/) specifies parent `quantity`, STOPLOSS `rules[]`, rule status, trigger price and `rules[].order_id`, which can be **null** until generated; completed GTTs may not be retrievable from this GET.
- [Upstox order status appendix](https://upstox.com/developer/api-documentation/appendix/order-status/) defines `cancel pending` and `modify pending` as unresolved in-flight states.
- [Get Order Status](https://upstox.com/developer/api-documentation/get-order-details/) returns order state, filled/pending quantities and broker-reported exchange order ID.
- [Get Order Book](https://upstox.com/developer/api-documentation/get-order-book/) exposes current-day order lifecycle, not an independent historical exchange-signed stop ACK.

## Official v3 GTT structure caveat (live release BLOCKER)

The official [Place GTT Order](https://upstox.com/developer/api-documentation/place-gtt-order/)
API is more constrained than many **synthetic** Phase92–108 fixtures:
a SINGLE GTT must contain an ENTRY rule, while STOPLOSS follows an ENTRY
on a MULTIPLE GTT. The current v3 request docs state TARGET/STOPLOSS
`trigger_type: IMMEDIATE`, a strictly positive trigger price, and SELL
leg authorization requirements including EDIS for applicable delivery
sales. Real F&O eligibility, valid native schema and required broker
authorization **have not been demonstrated** by the fixtures. The
read-only drift review does not place or certify a standalone live
STOPLOSS rule, nor does it verify that a multi-leg GTT ENTRY maps to
the immutable original NRML BUY trade. This is an additional hard
research/release blocker, not permission to enable NRML orders.

## Implementation

`reviewNrmlStopLifecycleTwoPassReadOnly` runs only through authorized
read-only broker GETs:

1. Authenticate exact expected broker ID and local positive auth epoch.
2. GET exact GTT parent; privately fingerprint parent identity, product,
   quantity, expiry, all rules, STOPLOSS status, trigger prices,
   trailing-gap, order ID and other rule dispositions. Never emit IDs.
3. Run Phase107 bounded parent -> full account order/GTT -> exact child/trade
   -> fresh NRML net reconciliation; check account and auth epoch.
4. Repeat the entire independent Phase107 read-only reconciliation and
   re-check local account/auth generation after it.
5. GET the GTT parent again; ensure its private fingerprint is unchanged
   and both pass summaries agree on SELL fill amount, net conservation,
   child/order reference, same-contract competing order counts and
   GTT scheduled-versus-triggered state.
6. Return fixed redacted states for session rotation, missing/expired parent,
   cancellation/replacement, changed trigger price, new competing orders,
   changed child fills/net, incomplete broker snapshots or transport faults.

The SUPERADMIN `POST /api/ema15m/nrml-stop-lifecycle-review` route
takes exact account/option/GTT/lot-multiple scope and never persists
or places any broker order. It is a **manual high-read-cost diagnostic**,
not a continuous poller. The two passes are not guaranteed simultaneous.

For a stable scheduled GTT, the result remains
`SCHEDULED_GTT_NO_EXCHANGE_CHILD_NOT_PROTECTED`. For a stable
triggered-child observation, the result remains
`STABLE_BROKER_CHILD_OBSERVATION_NOT_PROTECTIVE_ACK`.
The reported remaining long is purely broker-reported
`expected long minus matched SELL fill`; **all** remaining units are
marked `quantityWithoutIndependentProtectiveAck`, because no external
verified protective child ACK is available. Neither same-account
read consistency nor an `exchange_order_id` establishes executable
overnight downside protection.

## Tests and non-release

Seventeen synthetic adversarial tests cover stable/scheduled/partial/full
position, changed trigger or GTT/child ID, missing expired parent, partial
execution between passes, cancel/modify/rejected, duplicate GTT candidates,
same-account reauth, account switch, missing auth generation, transport
secrets and SUPERADMIN route. Run Node22 TypeScript and Phase92–108
targeted offline tests plus broader EMA15M full regression and build.

Still missing: genuinely independent native exchange protective-child ACK,
quantity coverage through cancel/replace/partial fill/restart, broker
account-wide risk capital/margin and kill switch, multi-week authentic
options L1 history and untouched OOS, signed contract notes and taxes,
security/legal/risk signoff (especially issue #20). No actual order
execution or profitability is inferred from green CI.
