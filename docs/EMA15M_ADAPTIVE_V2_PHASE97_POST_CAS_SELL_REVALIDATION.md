# Phase97 — Post-CAS broker SELL revalidation against local journal and broker GETs

**DRAFT / stacked on Phase96 PR #101 / no real broker writes or release.** The required future LIVE positional NRML feature remains fail-closed for new broker BUYs under Phase90. Existing MIS-only 15:15 forced-squareoff behavior is preserved; never force positional NRML flat at 15:15.

## Concrete race found

The existing `LiveExecutionService.requestLiveExit()` verified current option net position and checked the Upstox ordinary order book and GTT list before calling `dbEngine.claimEmaLiveExit(positionId)`, a durable CAS from `OPEN` / `EXIT_FAILED` into `EXIT_REQUESTED`. The surrounding read-only network GETs may take time. Between the early checks and later SELL dispatch, another worker, a broker-native stop, a manual BUY/SELL, or portfolio change may make the originally observed remaining quantity, broker order book or GTT state stale.

The durable CAS does prevent two workers sharing SQLite from *claiming the same eligible row*, but by itself cannot guarantee the broker-source data originally read before that CAS is still valid. A live SELL cannot safely be based only on the pre-CAS reads.

## Change

1. Add pure `assessPostClaimExitJournal()` to verify exactly **one** current durable position, status `EXIT_REQUESTED`, **no broker exit ID**, unchanged account, instrument key, product, lot, original quantity, previously confirmed SELL fills, entry attempt ID and remaining request size. Reject missing or unfinished/UNKNOWN/originally unfilled entry BUY journal. A last-minute journal change after the CAS must **not** be silently incorporated into the old intended SELL quantity.
2. Add `reviewPostClaimBrokerSell()` that obtains a **new broker ordinary order book**, checks unresolved SELLs (including CANCEL PENDING), obtains a **new GTT list** and checks dormant or triggered SELL rules, and **then** obtains a fresh current exact-contract native net quantity. The net must still exactly match the original long minus previously confirmed SELL fills and the requested remaining SELL size. Every read failure or missing method returns a redacted fixed blocker; no alternative source, cached value, mock zero or automatic retry is allowed.
3. Wire both helpers into the **actual existing broker-facing `requestLiveExit()`** only **after** `claimEmaLiveExit` and broker connectivity checks, with this sequence:

   `CAS -> local post-CAS check -> broker order-book GET -> GTT GET -> net-position GET -> local final check -> existing placeOrder(SELL remainingQty)`

4. If either post-CAS local check or any broker recheck fails, the position **remains EXIT_REQUESTED**, the diagnostic `exitReason` is updated to a fixed `POST_CLAIM_SELL_RECHECK_QUARANTINED` reason, and the function returns unsuccessful **without calling broker placeOrder**. The in-process pending marker is released, but the **durable CAS remains claimed**, so another worker cannot reissue a SELL against the same unresolved position. A manual, independently verified broker reconciliation is required before any separate retry.
5. The existing `assessBrokerRemainingSellQuantity()` still sizes the actual SELL from **remaining**, not original, option quantity (Phase95). `UpstoxProvider.getVerifiedLivePositionQuantity()` still demands an exact unique native portfolio row (Phase96). The Phase90 new NRML BUY release remains hard-blocked, and the Phase95 restart quarantine remains read-only.

## Scope / inherent limits

This patch **reduces** stale evidence risk but cannot make disparate broker API endpoints atomic, freeze manual/external orders, prevent a native GTT from triggering after the final GET, prove exchange acceptance or guarantee exit fills through market gaps. There is still a short time-of-check/time-of-use interval before the broker SELL; actual live deployment needs broker-native protective SELL authority, covered quantity reconciliation, order/transaction streams and controlled lifecycle integration. It does **not** automatically place, cancel or replace stops; it deliberately does not turn an unknown ACK into a permitted retry. Strict entry-journal checks may also block legacy MIS exits with incomplete local history; those require manual broker reconciliation, not fabricated correctness.

The result only signals that a read-only recheck succeeded **for the snapshots received**; it is not independent stop coverage certification, an exchange execution receipt, full account-wide risk signoff, or verified profitability. Issues #17–22, especially #20, stay release blockers (licensed original 1W–8W NSE/BSE option BID/ASK/depth, official expiry/calendar, untouched OOS, authenticated original strategy receipts, real broker native STOP/GTT child exchange ACK/cancel-replace/fill/restart/gap evidence, capital controls, manual review).

## Synthetic validation

Twenty-seven new adversarial Phase97 tests cover: stable CAS journal and exact original fully filled BUY; missing/duplicate positions, EXIT_PENDING/OPEN status, broker exit ID appearing, local quantity/product/account/lot/filled count changes, unverified entry BUY, post-CAS new SELL, pending manual BUY or cross-product order, new GTT, broker net changing between checks, missing broker GETs, cancellation-pending, transport exceptions, prior partial 50/100 SELL and no broker write. Previous Phase79–96 targeted suite expected **264 synthetic cases**; dedicated Phase97 total **291 expected**, subject to actual GitHub CI output. TypeScript static, focused Phase50–97 and broad EMA15M invariant-safety/full regression/production build must each pass on the final commit before consideration of merging.

**Never enable live NRML, merge, deploy or infer production safety from green synthetic CI.**
