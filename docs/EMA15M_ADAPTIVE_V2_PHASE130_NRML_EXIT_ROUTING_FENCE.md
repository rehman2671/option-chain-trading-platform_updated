# Phase130 — Deny legacy NRML broker SELL in automatic and generic EMA exit paths

**Status: stacked DRAFT research on Phase129 PR #134, unmerged and undeployed. No real Upstox orders executed. The legacy intraday MIS live-exit workflow remains available subject to its other existing risk gates.**

## Runtime risk addressed

Even though the Phase90 new NRML BUY gate is closed, an older/externally sourced existing NRML option long can still appear in the local EMA live-position table. Prior `LiveExecutionService.monitorLivePositions()` evaluated its stop/target/trailing state and could call `requestLiveExit()` automatically; the generic `requestLiveExit` path also accepted NRML and would place a real market SELL using a local position and asynchronously queried broker state. Because original NRML option BUY/GTT child history, exact close-only/no-short permission, overnight session protection and independently authenticated historical account exposures are not certified, that routing must NOT be silently treated as an approved positional exit.

## Phase130 safety implementation

- Pure `assessEmaBrokerExitProductGate(product)` accepts exactly MIS, rejects NRML with explicit existing-long/net/GTT-child/no-short and release message and rejects any unknown/blank/corrupted product. There are no environment, operator or CI boolean override switches.
- Pure `isMisLiveAutoExitCandidate(position)` accepts only exact OPEN MIS positions. `monitorLivePositions()` skips NRML and unknown positions before option quote reads, automatic stop/target/trailing SELL requests and local live P&L/trailing writes.
- An existing NRML/unknown position in the automatic reversal path blocks BEFORE `requestLiveExit(existingLivePos.id)` and BEFORE any replacement BUY submission. No automatic reversal may use a legacy NRML market SELL.
- The generic `requestLiveExit()` checks the product gate immediately after loading the existing live position and BEFORE any entry-order, broker orderbook, GTT, position net, durable CAS or broker `placeOrder()` call. It fails closed even when its caller supplied reason `MANUAL`, `OPPOSITE_CROSSOVER`, `SL_HIT`, `TRAILING_SL_HIT` or `TARGET_HIT`. No automatic fallback `pos.productType || 'MIS'` is allowed in the SELL placement parameters.
- The existing forced-squareoff flow already uses `isMisForcedSquareOffEligible` and remains strictly MIS-only. Existing MIS manual and automatic stop/target SELLs still go through all prior broker-side reconciliations and post-claim read checks. They are NOT proof of fill/stop or a profitable strategy.
- Adversarial tests call the actual service with fake DB and provider quote methods: NRML or unknown positions must not fetch quotes, submit exits, claim durable SELLs or write position P&L. Mixed MIS+NRML polling must still request the MIS-only stop exit through a stubbed broker-exit method. This is mock testing, NOT live broker acceptance proof.

## Manual operations / release

This branch deliberately blocks **platform** broker SELL routing for NRML, including a platform manual-exit request. It does not close a real option position and must not be used as advice to leave an actual market exposure unmanaged. If an account already holds an NRML option, designated staff should use the actual authenticated broker's own position/order interfaces and approved close-only instructions, after reconciling outstanding GTT/SELL children; the software does not have independently reviewed permission to invent an automated duplicate SELL.

Outstanding external blockers #17–#22: licensed original-time option L1, original NSE/BSE issuer calendar/lot/expiry and amendment ledger, independent original broker BUY/SELL execution history and GTT-child proof, verified close-only no-short acceptance and overnight/gap behavior in a sanctioned broker test environment, realistic 1/2/4/8-week untouched OOS premiums/fees/stress, and human capital/ops/security release. **No LIVE NRML BUY, positional square-off at 15:15, automatic SELL, position CLOSED/P&L or broker mutation is authorized by this phase.**

Keep this PR **DRAFT/unmerged/undeployed** until complete independent review; CI green is necessary, not proof of live safety.