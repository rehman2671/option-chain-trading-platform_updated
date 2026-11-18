# Adaptive Swing v2 Phase44 — Offline protective-order modification, cancellation and replacement gap ledger

**DRAFT / unmerged / manual-only research. No genuine Upstox order history, broker-native ACK, exchange-signed cancellation/replacement, live account, actual NRML stop, protected overnight holding, or licensed original L1 data was collected. All tests are synthetic.**

## Why Phase44 exists

Phase43 verifies internal consistency of an operator-archived GTT trigger, child order history, trade rows and a separately signed *external reviewer claim*. Broker reported exchange_order_id is **NOT** an independently authenticated exchange ACK. It did not reconstruct the next **modify pending → modified → open** and **cancel pending → cancelled → new order request → open** transitions. Those are important risk boundaries: during cancellation/replacement or pending modification, a positional stop may be absent, unavailable or uncertain.

Upstox order history is a ONE-trading-day source, not a historical multiweek event repository:
- https://upstox.com/developer/api-documentation/get-order-history/
- https://upstox.com/developer/api-documentation/appendix/order-status/
- https://upstox.com/developer/api-documentation/get-order-details/
- https://upstox.com/developer/api-documentation/get-gtt-order-details/
- https://upstox.com/developer/api-documentation/webhook/

Upstox documents that webhook/postback endpoints are public POST endpoints without the API request's Bearer authentication. Merely having a captured webhook JSON is not cryptographic broker-origin authentication. Phase44 neither opens a webhook endpoint nor makes broker requests.

## Phase44 implementation

Source: src/server/engine/ema15m/adaptiveUpstoxPhase44StopMutationLedger.ts

Main public function auditPhase44StopMutationLedger(archive,independentPins) is **pure offline data validation** and cannot write broker orders or GTT.

1. **Re-runs real Phase43 verification** over the complete original operator-archived triggered-GTT child order and its separate Ed25519 reviewer claim. The precursor must be a broker-REPORTED **OPEN** child with unresolved exposure, NOT a completed sale. It cannot be promoted by a fake cached PASS object. Requires exact separately pinned hashes of Phase43 source and Phase43 pins and account/GTT/instrument/day identity.
2. **Requires a same-day GET /v2/order/history archive per affected child order** (up to 5 order records). All order IDs, broker-reported exchange order IDs, and full original JSON archives are SHA256 pinned. A domain-separated hash chain over the ordered archived order snapshots must end at a separately pinned digest. Source itself remains operator supplied, unauthenticated.
3. The original child must contain Phase43's **exact prefix of order-history events** so a later archive cannot silently rewrite what Phase43 previously reviewed. Its newly appended mutation events must not be backdated to before the Phase43 signed review. The snapshots must be chronological, in the exact same IST trading date, captured after prior recorded snapshots, with no malformed IDs, order types or unknown status.
4. Conservative order state machine: order request received → validation/open pending → broker-reported open; from open, **modify pending** with a strictly newer request number must receive **modified** with the same request number AND a later **open** reconfirmation. Otherwise block. From open, **cancel pending** must receive **cancelled** with the same request number. Otherwise block. Unresolved *not modified*, *not cancelled*, rejected status, changed broker-reported exchange ID, missing open/confirmations, duplicate terminal events or illegal transitions block.
5. Tracks monotonically nondecreasing cumulative filled quantity, safe positive whole quantities, exact NFO/BFO instrument/trading symbol, delivery broker product D (which does NOT independently prove NRML product authorization), SELL, stop order type SL or SL-M, and exact broker-reported exchange order ID for every post-open event. **No native order is considered installed.** Any final COMPLETE requires full filled quantity. A COMPLETE child is a filled exit, not a standing protective order.
6. For **cancelled old order → replacement new order**, original order must end in a confirmed cancellation. Replacement must be created and broker-reported OPEN after the cancellation, same trading session, different independently pinned order/exchange ID, and exactly match **unfilled residual** original position quantity. If old order has 10 of 65 reported fills, next order must be 55; an order of 65 would over-cover and is rejected. Records a strictly positive time interval between broker-reported cancellation and replacement's reported OPEN; even this number is not proof of exact real-world unprotected duration.
7. A final cancelled order without replacement, mutation with pending state, replaced order without prior cancellation, impossible request count, out-of-order timestamps or fills, different session, missing original predecessor, mismatched externally pinned source, forged review signer or stale review is blocked.
8. One real **Ed25519 reviewer signature** over a domain-separated claim must bind all original Phase43 source hashes, ordered history archive hashes, IDs, quantities, claimed review time, challenge and final hash-chain tip. The reviewer role is explicitly INDEPENDENT_REVIEWER_NOT_EXCHANGE, never a real exchange source. A local/fake independently pinned key can sign fabricated data; it does not authenticate actual Upstox, NSE/BSE, order exchange ACK or event delivery completeness.

Success statuses have deliberately unverified names:
- BROKER_REPORTED_MODIFIED_ORDER_OPEN_UNVERIFIED
- BROKER_REPORTED_REPLACEMENT_ORDER_OPEN_UNVERIFIED
- BROKER_REPORTED_EXIT_COMPLETE_UNVERIFIED

All reports permanently retain:

    executionAuthorized=false
    productionSafe=false
    brokerAuthenticated=false
    brokerStopInstalled=false
    protectedOvernight=false
    nativeOrderInstruction=null
    independentExchangeOrderAcknowledgementVerified=false
    independentlyAuthenticatedBrokerOrderEvents=false
    completeDayEventProvenanceVerified=false
    continuousIntradayStopCoverageVerified=false
    continuousOvernightProtectionVerified=false
    guaranteedStopFillPrice=false

**An OPEN result is only a reported state from an unauthenticated operator archive.** It is not a valid safety signal to place, leave or cancel actual NRML orders. A zero reported replacement gap would not prove uninterrupted coverage either. Phase44 requires a positive reported cancellation-to-new-ACK interval for replacement, exposes this gap and **never claims the gap was protected**.

## Manual operator-only audit

Source: scripts/audit-adaptive-upstox-phase44-stop-mutation.ts

Provide two pre-created process-owner 0600 files under an owner 0700 directory:
- private ordered same-day order event archives and the complete original signed Phase43 predecessor input
- external independently provisioned SHA256/ID/reviewer key and session policy

Example on a separately enforced no-egress OS sandbox:

    npx tsx scripts/audit-adaptive-upstox-phase44-stop-mutation.ts --approve-manual-offline-only --private-same-day-order-mutation-archive /private/phase44-order-mutation.json --independent-order-mutation-witness-pins /private/phase44-pins.json

CLI returns ONLY redacted statuses, reasons and aggregate counts. No raw user account UCC, contract/order/exchange/trade IDs, private signer key, authorization header, endpoint token or private file path is printed. It neither performs GET/PUT/POST/DELETE nor configures a scheduler/webhook. Node filesystem checks are NOT an OS sandbox.

## Synthetic adversarial CI suite

Source: src/quant/tests/ema15m_adaptive_upstox_phase44_stop_mutation_gap.test.ts

Generates a genuine local Phase43 Ed25519-signed synthetic initial child and a separate real Phase44 review Ed25519 signature. Tests:
- broker-reported modify pending / modified / open, and full complete
- broker-reported cancelled stop and newly opened replacement; reports a **nonzero observed 9-minute gap** without claiming protective continuity
- 10/65 filled before cancellation; replacement must be only 55
- cancelled without replacement, missing modify ACK/new open ACK, not modified/not cancelled, illegal terminal transitions, wrong instrument/side/exchange ID, nonmonotonic request IDs, timestamps, future or wrong session, overcoverage, mutated original child prefix, forged original Phase43 review, modified external archive hash/chain tip and forged/substituted external review signature.

These are **fabricated compatible sample histories, NOT live Upstox fills, signed NSE/BSE evidence or a backtested profitable strategy**. Even after all tests pass, original issuer/broker/exchange trust, same-day exact capture completeness, licensed multiweek option market gaps and native stop survival are unavailable.

## Release blocker and next priorities

Keep issues **#17–#22 including #20 OPEN**, all stacked PRs **Draft/unmerged**. Existing EMA23/50 MIS intraday 15:15 exit remains unchanged. NRML 1W/2W/4W/8W positional trading has **NO 15:15 forced exit**; no live NRML broker order/GTT write, auto repair, auto expiry liquidation, network monitoring, or production activation has been added.

Next: independently sourced exchange-native ACK/cancellation/replacement proof, authorized source-authenticated immediate archival of every lifecycle transition (including complete GTT states), effective-dated official segment trading calendar, licensed original option L1 and genuine gap/tail/OOS survivability. Green CI validates software behavior, not profitable strategy, guaranteed fills or overnight protection.
