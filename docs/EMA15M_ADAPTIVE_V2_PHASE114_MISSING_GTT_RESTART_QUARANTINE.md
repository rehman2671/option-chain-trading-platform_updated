# Phase114 — Missing completed SINGLE SELL GTT / orphan SELL child restart quarantine

**Stacked DRAFT on Phase113 PR #118. Read-only manual diagnostic;
zero real broker BUY/SELL/GTT writes, zero local state writes, no
auto-closure, no P&L settlement, no deployment, no merge, and no
LIVE NRML BUY release. The MIS 15:15 square-off remains MIS-only.**

## Why it matters

Official [Upstox GET GTT](https://upstox.com/developer/api-documentation/get-gtt-order-details/)
does not return completed GTT orders. Its absent parent may have
completed, expired, cancelled, triggered or become unavailable.
Also current-day native [orderbook](https://upstox.com/developer/api-documentation/get-order-book/)
cannot supply a multiweek original option-long execution history.
A GTT missing after restart therefore **does not** mean the SELL
completed, the long is flat, a protective stop exists or another
SELL can be placed safely. Even a current broker net reported as
zero cannot authenticate original BUY and SELL trades/fees/charges
or authorize the durable CLOSED/P&L journal.

A GTT SINGLE ENTRY SELL BELOW is a **broker-side conditional
limit-order trigger**, not an independently signed exchange
stop-loss. It can leave a pending limit SELL unfilled after gaps
or generate extra short risk when the long changes.

## Two-pass read-only restart audit

`adaptiveNrmlMissingGttRestartQuarantine.ts` accepts one server-side
durable original NRML long account, F&O instrument, lot-multiple
quantity, original BUY ID and already-existing GTT ID.

Each of two passes calls **four independent broker GETs**:
- Exact current GTT parent
- Full current broker GTT account list
- Full current-day broker orderbook
- Current broker NRML positions

It pins the same live Upstox account and local session-generation
through both passes; missing GET, reconnect, changed GTT status,
quantity, same-contract orders or net all fail closed. Snapshots are
still non-atomic. The pure read-only audit classifies:

- **GTT missing, long net remains** → manual historical order/trade
  verification; no automatic new SELL
- **GTT missing, broker net zero** → cannot mark durable position CLOSED
  or settle P&L without historical SELL receipt and independent checks
- **GTT missing but current orderbook contains SELL with
  `order_ref_id` equal to GTT** → orphan SELL child, manual review
- **GTT present SCHEDULED, no generated child** → broker condition
  only, zero native exchange stop ACK; if GTT quantity exceeds the
  reduced long, explicitly quarantine oversell risk
- **GTT triggered with generated child ID** → require Phase113
  generated child details, unique trade IDs and native net
  reconciliation; do not infer SELL completed from parent
- **GTT cancelled, failed, expired, unknown or mismatched** → manual
  broker historical verification, not auto replace or retry
- **Multiple candidate GTT children, competing active BUY/SELL,
  independent SELL fills, duplicate GTT, changing broker account or
  historical/position ambiguity** → block and reconcile manually.

All results are redacted static reason codes and counts, with
`duplicateSellRetryAuthorized:false`,
`cancelOrReplaceStopAuthorized:false`,
`closedPositionWriteAuthorized:false`,
`realisedPnlWriteAuthorized:false`,
`nativeExchangeProtectiveStopCertified:false`,
`liveNrmlBuyAuthorized:false`, `brokerWrites:0`,
`localWrites:0`.

## SuperAdmin-only manual endpoint

`POST /api/ema15m/nrml-single-sell-gtt-restart-quarantine-review`

Only accepts `positionId`, `expectedAccountId`,
`gttOrderId`. The original BUY order, quantity, option contract,
unique same-account journal position, BUY executions/weighted premium
are read server-side from the immutable SQLite journal and rechecked
after broker GETs. No caller-controlled order instructions, fills,
prices or claim of native exchange stop ACK.

Synthetic adversarial tests: absent GTT with long/flat broker net,
orphan SELL child after parent disappearance, cancelled/trailing
statuses, parent/child mismatch, current same-contract BUY/SELL/GTT,
partially reduced NRML long with oversized scheduled SELL,
duplicate/invalid native net, two-pass drift/reauth, malformed broker
lists, static secret redaction and route no-write invariants.

## Remaining real release blockers

This cannot restore missing cross-session broker GETs, independently
authenticate historical NSE/BSE option executions, certify venue
acceptance of protective stops, prevent broker-side asynchronous
oversell, cancel/replace pending children safely, guarantee stop
fills after gaps, prove exact F&O contract eligible for SELL GTT,
reconcile account capital/margin or sign off the licensed original
1W–8W options OOS. Issues #18–#22 remain pending, especially #20
broker-native protection and #21 honest untouched OOS. Green CI
is synthetic test success, not profitable/production-safe trading.

Never dispatch another BUY or SELL or auto CLOSE in response to this
audit. Human broker operations and independent risk approval required.
