# Phase105 — Historical FO GET broker-account continuity (read-only)

**Stacked DRAFT on Phase104 PR #109. No merge, deploy, broker writes,
realised P&L/CLOSED mutation, NRML live BUY release or positional 15:15 exit.**

## Defect being addressed

The Phase104 historical FO read-only collector authenticated the broker
account only *before* its first asynchronous page fetch. Between awaited
pagination GET requests an operator/session could disconnect or switch the
active Upstox account. If the collector trusted the old account identity,
it could join pages from different session contexts and claim a
broker-reported historical trade-ID match.

Historical trade-ID matching is not exchange-certified even without
this race. The Upstox FO historical endpoint does not reliably return
original order IDs or option instrument tokens. No settled net P&L,
taxes, charges or position-closure authority can be inferred.

## Change

1. Before page one, continue requiring the exact expected connected
   account. After **every awaited historical FO page GET**, re-read
   `getLiveConnectionStatus()` and require the same account ID and
   connected=true **before consuming that page or fetching the next**.
2. A disconnection, different ID, absent ID or throwing status method
   fails closed with the fixed,
   redacted `BROKER_ACCOUNT_CHANGED_DURING_HISTORICAL_FO_GET` reason.
   Do not turn this event into an empty page or a partial fill.
3. The existing pagination count/snapshot integrity checks, immutable
   original BUY/SELL trade-ID and option contract matching, optional
   latest native broker-net verification in the SUPERADMIN route and
   all Phase90 NRML live release blocks are unchanged.
4. Synthetic adversarial tests cover stable two-page account,
   mid-pagination switch, disconnect after last page, thrown status
   failure and missing identity after the response. The Phase104
   positive mock call sequence now requires status rechecks.
5. Dedicated Node22/TypeScript + Phase102–105 tests and broader
   EMA15M safety CI run on the Phase105 stacked branch.

## Remaining limitations

**Source GETs are not atomic snapshots.** A status check after each GET
cannot independently prove that a bearer token belonged to the same
account for the entire network operation; it only adds a fail-closed
local session-continuity barrier. No real broker credentials were used
by these tests. This is not a signed venue trade certificate, signed
contract note, independently verified brokerage/STT/GST, proof of an
exchange-ACKed protective stop child or a live NRML release.

Genuine broker child-exchange ACK and covered stop quantity, partial
fill / cancel / replace, restart, UNKNOWN orders, overnight gap, capital
controls, untouched 1W–8W OOS original option data and independent
human risk/security/legal signoff remain required. Keep PRs DRAFT.

Expected Phase79–104 targeted count 482 + five Phase105 cases = **487**
(subject to actual GitHub Actions results, not an assertion of green CI).
The documented 15:15 forced square-off remains **MIS-only**.
