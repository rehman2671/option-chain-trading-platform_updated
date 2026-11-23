# Phase118 — In-flight native GET local broker identity fencing

**STACKED DRAFT on Phase117 PR #122. Research read-only hardening,
no live broker order/GTT writes, no automatic EXIT/CLOSED/P&L,
no deployments/merges. LIVE NRML BUY remains blocked. 15:15 forced
square-off still applies only to MIS and not NRML positional holdings.**

## Issue: stale response from another credential session

Research audits already pin broker account and local authentication epoch
across two broker GET sweeps. But the lower-level `UpstoxProvider`
previously **returned the parsed success response to callers** even if
the local account, bearer token or auth epoch changed while that
specific HTTP GET was still in flight.

A delayed old-account response must NOT be supplied as a verified
current-account native order, current GTT, current D portfolio,
current trade or historical FO execution source. The higher-level
two-pass checks are retained, but must not be the only boundary.

## Actual provider changes

Private `captureRiskReadIdentity()` records the exact authenticated
local `userId`, bearer token and monotonic local auth epoch just before
the GET. It returns unavailable if disconnected, missing account,
missing token or nonpositive/malformed auth epoch. It is **not** an
independent broker authentication or venue receipt.

Private `currentRiskReadIdentity()` compares all three fields and
connection state **after full HTTP JSON decode**. Any mismatch returns
`null` instead of prior-account/native success. The sensitive
token is not included in returned diagnostics, console logs or URLs.

Applied to the actual upstream GET methods:
1. Unique broker NRML net (`getVerifiedLivePositionQuantity`)
2. Raw verified native NRML position rows
3. Full account current GTT list
4. Exact GTT parent by ID
5. Generated exchange child order details
6. Full native current-day order book
7. Bounded paginated historical F&O trade report
8. Per-order generated trade executions

Every one of the eight upstream GETs now has a
`AbortSignal.timeout(12_000)` deadline. A hung broker HTTP response
returns unavailable/null after abort instead of blocking the diagnostic
indefinitely. Tests require all eight GETs to carry the signal and
verify an AbortError returns null. This does not certify broker
order execution, independent venue ACK or account-wide atomicity.

GET endpoints remain GET-only and return `null` on HTTP failures,
invalid JSON or stale-account responses; genuine successful array
sources may be empty, but must not be confused with unavailable.

## No-real-network adversarial tests

`ema15m_adaptive_phase118_native_get_session_fence.test.ts` uses
actual `UpstoxProvider` with an entirely local fake fetch transport.
For each of eight GETs, verify stable session success, then delay
the fake HTTP response and rotate token, account ID, auth epoch,
connection state or disconnect/reconnect; old response must be null.
Also pause after receiving HTTP headers but before JSON decode and
rotate the account. A local authenticated session recorder sequence
is still not an independent broker signature. No real credentials,
web requests, GTT placements, exchange orders or external tokens.

Phase117 remains the HTTP 401/403/429/5xx + malformed schema/log
redaction contract; Phase118 only adds the stale-result boundary.
Node22 focused and broad EMA15M tests still run on the actual branch.

## Still open

Even perfectly fenced and green synthetic GETs cannot certify the
official eligibility of GTT SINGLE `ENTRY SELL BELOW` for a
specific existing filled Indian F&O NRML option, independently
venue-acknowledged persistent protective orders, no-short
close-only behavior, price gap fill, EDIS/SELL authorization,
multi-session complete trade history, capital/margin limits or
realized costs. Original licensed options L1, effective-dated
exchange calendars, untouched OOS 1–8W and independent reviewers
remain open GitHub blockers #17–#22.

See official Upstox GET order/GTT/trades docs for ephemeral
broker-reported evidence; a current GTT/child order reference
does NOT provide exchange-native overnight stop coverage.
No live BUY/SELL order or GTT mutation is implemented.
