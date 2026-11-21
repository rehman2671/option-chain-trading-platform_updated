# Phase90 — Support LIVE NRML as an explicit platform objective, without unsafe premature orders

**Stacked DRAFT, engineering only.** Phase90 follows Phase89 Draft PR #94. The operator has explicitly requested **LIVE NRML positional options support**, not merely paper/offline research. We therefore expose that request and resolve an existing dangerous interlock, while keeping real NRML BUYs **BLOCKED** until the actual operational release prerequisites in issues #17–#22, particularly #20, are independently demonstrated and authorised.

## Critical defects discovered in current broker-facing EMA execution

1. Existing `LiveExecutionService` recognises `settings.upstoxProductType` of either `MIS` or `NRML` and its Upstox `placeOrder()` call could send either product as a **real MARKET BUY** when the generic `liveBrokerExecutionEnabled` toggle was enabled, despite no demonstrated native NRML protective stop/GTT child ACK or restart recovery.
2. Its existing `checkForcedIntradaySquareOff()` checked the clock then iterated **all** open live positions, not just MIS. A positional NRML long option intended for 1, 2, 4 or 8 weeks could consequently receive an unintended **15:15 forced MARKET SELL**. That is not acceptable for the requested strategy.
3. The server's existing global `live-trading/toggle` response stated that the live broker was armed without distinguishing MIS from NRML or verifying stop release.

## Implemented, without live trading activation

- Pure, side-effect-free `adaptiveNrmlLiveReleaseInterlock.ts` provides `getNrmlLiveStatus()`, `assessEmaLiveProductGate()` and `isMisForcedSquareOffEligible()`.
- An authorised operator can read `GET /api/ema15m/nrml-live-status` (SUPERADMIN) to see `NRML_LIVE_REQUESTED_RELEASE_BLOCKED`, `requested:true` when NRML product is selected, `nrmlOrderRoutingAuthorized:false`, and the exact external audit blockers. No accounts, tokens, raw vendor data, positions or stop instructions are returned.
- The broker-facing EMA `validatePreTrade()` **rejects NRML** even when the generic live toggle is on. A separate **early guard before async broker contract lookup** in `attemptLiveSignalInternal()` returns `PRE_TRADE_REJECTED`, filled quantity 0, no position creation. A product choice is frozen before awaiting broker I/O to avoid a mid-flight setting switch turning an MIS order into NRML. Unknown products reject.
- Admin `POST /api/ema15m/settings` and `POST /api/ema15m/live-trading/toggle` reject simultaneously arming generic live and NRML, returning HTTP 409 with the safe status. Operators can express their NRML preference without claiming a live release.
- The existing 15:15 **MIS** forced-squareoff job now selects **only `OPEN` positions with exact `productType:'MIS'`**. NRML, unknown product, EXIT_PENDING, CLOSED etc. are excluded even if global live mode is enabled. Existing MIS safety and forced-squareoff time remain unchanged.

The early guard does **not** install a real stop/GTT, place BUY/SELL orders, edit broker positions, demonstrate data entitlement or prove profitability. It intentionally prevents new NRML live BUYs until separately certified broker-native protection can be integrated. Existing manual broker positions, unknown fills and the current intraday MIS flow require independent operational review; this patch must not be construed as proof of their safety.

## Before any actual live NRML activation

Require independently and broker-authoritatively verified connected account and exact NRML option instrument/expiry/lot, available funds and risk exposure, *unique* native protective SELL/stop/GTT child exchange ACK with acknowledged lot/remaining quantity, partial and no-fill reconciliation, cancel-replace state, timeout/duplicate orders, server restart recovery, broker-sanctioned test-environment rehearsal, operator kill switch and hard capital/daily/overnight risk caps. Verify lawful original L1/contract/calendar data provenance and untouched multi-regime OOS including IV/theta/spread/slippage and adverse 50–70-to-100 premium reversals, plus legal/regulatory and manual release review. One self-declared boolean or developer environment flag cannot be accepted as proof. Even native GTT stop trigger does **not** guarantee an exit fill through an overnight gap. NRML is positional: **no forced 15:15 exit**; expiry cutoff must use authenticated instrument-specific exchange windows.

## Validation

12 offline synthetic tests cover NRML desired status despite global toggle, invalid/bypass requests, unchanged MIS product gate, exact MIS-only 15:15 eligibility under mixed actual product/status objects, fake "stop verified" self-claims, and zero broker calls in status checks. Dedicated Phase90 TypeScript/test workflow and full EMA15M safety/full regression/production build plus Phase50–90 focused research must pass before any merge review. This is still Draft/unmerged, not an enabled broker mode.

**Release blocker:** issue #20 remains OPEN. No live NRML order routing has been enabled. Human review and real broker native-stop evidence are required before lifting the interlock in a future, separately tested and approved release.
