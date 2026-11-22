# Phase106 — Pinned broker authentication epoch across read-only historical F&O

**Stacked DRAFT on Phase105 PR #110. No merge, deployment, real brokerage
order writes, auto-CLOSED, realised net P&L or LIVE NRML BUY release.**

## Risk

Phase105 repeats Upstox account-ID checks after every historical F&O GET.
This alone cannot identify a same-account token replacement or a connect()
started before an in-flight request completes. A successful same-account
re-auth can create mixed-credential page evidence despite identical userId.
The subsequent current broker net GET can also cross this boundary.

## Implemented

- UpstoxProvider has private monotonic `historicalFoAuthEpoch` and a
  public read-only epoch accessor. Every `connect()` **initiation** and
  **completion** invalidates historical read snapshots; the no-token and
  unauthorized (401) early returns also advance the epoch.
- The historical FO adapter requires a valid positive, safe integer epoch,
  pins it after initial exact account check, and rechecks it along with
  account ID before first/page requests and after every awaited GET.
  Missing/invalid/throwing generation, disconnect, account switch and
  same-account reconnect stop review, returning only static redacted
  reasons. Any pre-existing partial pages are discarded as evidence.
- The SUPERADMIN `/api/ema15m/historical-fo-trade-review` route pins the
  same local generation before reading private ledgers and checks it
  again after the history audit, before fresh native net GET and after
  the final GET. No BUY/SELL, STOP/GTT or local position writes.
- Phase104 and Phase105 historical read test mocks now explicitly supply
  stable auth generations, with extra pre-page continuity status reads.
  New synthetic tests cover stable two-page history, same-account rotation
  during early/final pages, pre-first-page change, missing/invalid/throwing
  epoch, between-page rotation, provider disconnected connect lifecycle
  and route pinning contract.
- Node22 static compilation, focused Phase102–106 tests and broad EMA15M
  invariants/full regression/build gate run on the new stacked branch.

## Explicit non-release assertions

This epoch is **local state**, not an Upstox signed session claim.
It cannot prove broker response snapshot atomicity, independently certified
exchange order fill, unique STOP/GTT protective child ACK, covered NRML
SELL quantity, taxes/STT/GST, historical option L1 spread/depth or
1W–8W untouched OOS profitability. Same-account session refresh cannot
be treated as source proof. Even stable trades remain
`BROKER_REPORTED_MULTIDAY_TRADES_MATCH_NOT_CERTIFIED`.

15:15 forced square-off remains **MIS-only**, and future positional NRML
order routing is **blocked** pending evidence and human risk signoff.
Retain draft PR state; do not deploy.
