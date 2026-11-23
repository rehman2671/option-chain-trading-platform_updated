# Adaptive Swing v2 Phase40 — archived GTT stop boundary and child order lifecycle

**Draft/unmerged, research-only. All CI data synthetic. No actual Upstox account API request, real exchange order acknowledgement or live NRML/GTT operation.**

## Verified API limitations, 18 November 2026

Upstox Get Order History: https://upstox.com/developer/api-documentation/get-order-history/ says a specific order's progression is available for ONE trading day and removed after the session. Get Order Book is likewise only the current trading day: https://upstox.com/developer/api-documentation/get-order-book/.

Upstox Get GTT Order Details: https://upstox.com/developer/api-documentation/get-gtt-order-details/ reports current broker conditional rules and does NOT retrieve completed GTT orders. GTT STOPLOSS status SCHEDULED is NOT proof of an exchange-hosted native stop. When a GTT rule triggers it may create a child order, which can be rejected or fill at a different price. The order status appendix lists open, trigger pending, modify pending, cancel pending, complete, rejected, cancelled and other statuses: https://upstox.com/developer/api-documentation/appendix/order-status/.

Postback/webhook status events are documented at https://upstox.com/developer/api-documentation/webhook/ but receiving an unauthenticated HTTP payload without stronger source validation is not proof of broker origin or completeness. Phase40 DOES NOT expose a webhook receiver or perform any broker API call.

**A pre-close and post-open snapshot DOES NOT PROVE that a broker GTT remained scheduled through every intervening second, survived an outage, was exchange-native, or could guarantee an overnight gap fill.** All reports hard-code protectedOvernight=false, brokerStopInstalled=false and productionSafe=false.

## A: Exact offline GTT overnight boundary reconciliation

Source: src/server/engine/ema15m/adaptiveUpstoxPhase40OvernightStopAudit.ts

Function auditPhase40ArchivedGttOvernights(input, independentlyPinnedSHA256):

- Operator supplies one position explicitly labelled NRML, one UCC/account-scope ID, one instrument key/trading symbol, positive expected quantity multiple of lotSize, GTT reference ID and expected SELL STOPLOSS BELOW price. The broker field product=D is only a delivery code and is NOT authenticated NRML position evidence.
- Operator declares every session close and following session open instant in timezone-qualified ISO form, including holidays/weekends, with a GET /v3/order/gtt archived just before close and just after open. Capture times must be within 1–60 configured minutes of expected boundaries, and overnights must be chronologically ordered.
- The response must have origin OPERATOR_ARCHIVED_UNVERIFIED, GET, exact endpoint/query/ID, HTTP 200, success, one GTT entry matching instrument, symbol, quantity, created/expires time in microseconds and exactly one STOPLOSS rule with status SCHEDULED, SELL, BELOW, same trigger price, null child order ID and no failure message.
- Failed, cancelled, expired, triggered, complete, inactive, wrong instrument, wrong UCC, wrong quantity, wrong stop, expired timing or missing snapshot returns BLOCKED_OR_UNKNOWN.
- Up to 55 explicitly enumerated overnight pairs. Each pair has independently provided SHA256 of its JSON serialized representation; a hash detects mutation relative to the pinned input but DOES NOT prove its broker origin. The declared session list is NOT independently checked against an authoritative exchange holiday calendar.
- Positive only GTT_BOUNDARY_SNAPSHOTS_RECONCILED_UNVERIFIED. Counts unobservedOvernightIntervals separately (one for EACH matched gap). This is a valid synthetic/offline archival consistency result, not continuous stop coverage or exchange ACK.

## B: Same-day archived child order history

Function auditPhase40ArchivedChildHistory(input, independentlyPinnedSHA256):

- Reviews an archived same-session GET /v2/order/history?order_id=... for a separately expected SELL order with exactly matching instrument key, symbol, quantity multiple of lots and product=D.
- Requires supported order status sequence, all rows with same order ID, same trading date as capture, consistent exchange order ID, no rejected/cancelled/cancel pending/modify pending events. An open/complete terminal reported status needs a nonempty broker-supplied exchange_order_id, and a complete event must show full filled quantity.
- Positive only BROKER_REPORTED_OPEN_OR_COMPLETE_UNVERIFIED, never independent exchange-confirmed ACK; an order reported complete has already executed and is NOT itself a standing stop.
- Does NOT infer that such child order came from a particular GTT without separately authenticated trigger-to-child linking. Same-day order history cannot reconstruct weeks of stop events.

## Manual owner-private CLI

File: scripts/audit-adaptive-upstox-phase40-stop.ts

Example GTT boundary audit (existing owner-0600 JSON files in preexisting owner-0700 directory):

    npx tsx scripts/audit-adaptive-upstox-phase40-stop.ts --approve-manual-offline-only --mode gtt --private-input /private/archived-gtt.json --independently-pinned-sha256-policy /private/gtt-pins.json

For child history, change --mode to child and provide separate private archive/pin JSON files. The program never makes a network request or broker call, places/modifies/cancels an order, runs a scheduler, or writes actual GTT. It logs ONLY aggregate counts, status and redacted reason codes; never full UCC, trade IDs, exchange references, tokens, response bodies or private paths.

The JSON hash utility hashPhase40OfflineArchive computes SHA256 of JSON.stringify input. Independent pin provisioning must use the same JSON serialization; local self-pinning does not establish trusted broker origin.

## Tests and explicit unresolved status

Synthetic adversarial suite: src/quant/tests/ema15m_adaptive_upstox_phase40_overnight_stop_audit.test.ts

It covers Friday to Monday weekend and consecutive nights, missing after-open snapshot, incorrect date/expiry/quantity, SELL/STOPLOSS trigger mismatch, failed/cancelled/expired/trigged rules, extra stop rules, bad SHA/UCC, order history child open and complete, rejected/cancelled/pending-modification events, changed exchange reference ID and wrong-day history.

All reports permanently set:
- executionAuthorized=false, productionSafe=false, brokerAuthenticated=false
- brokerStopInstalled=false, protectedOvernight=false, nativeOrderInstruction=null
- continuousStopCoverageVerified=false, nativeExchangeStopAcknowledged=false
- actualExchangeAcknowledgementIndependentlyVerified=false
- capturedBrokerSourceAuthenticated=false

Release blockers #17–#22 including #20 remain OPEN. No approved broker identity, current-source order/event provenance, official session-by-session calendar coverage, complete authenticated stop history across 1W–8W, native exchange ACK, real licensed options L1, independent walk-forward/OOS and tail/gap-loss risk or risk/security/operator approval exists in this phase.

Original EMA23/50 MIS intraday 15:15 square-off untouched. **NRML positional strategy has NO 15:15 forced square-off.** No live NRML, placing/cancelling GTT or broker polling/scheduler was added; all Adaptive v2 phases remain Draft/unmerged.

Next research stage: authenticated durable broker event-origin archive and independent order ACK/cancel-replace proof with official market calendar, plus real licensed option L1 tail/expiry testing. Passing CI never proves profits or guaranteed stop filling.
