# Adaptive Swing v2 Phase43 — triggered GTT → child order → trades with signed external reviewer claim

**DRAFT, offline research only. No real Upstox account GET, genuine exchange-signed ACK, authorized broker-order placement, complete live lifecycle or production NRML execution. Synthetic tests never authenticate source.**

## Why this phase

Phase40 audits broker-GTT scheduled pre-close/post-open checkpoints and single-day child order history separately; Phases41–42 add local signed archive integrity, original GET byte hashes and claimed TLS certificate pins, **not genuine broker origin**. A GTT status being SCHEDULED or TRIGGERED is not an exchange-native resting protective stop. Phase43 checks a different, very specific question: when GTT reports that it TRIGGERED and generated an order ID, can the archived GTT, same-day broker order history, individual trade rows, and a separately signed external reviewer *claim* be matched without gaps or ID substitutions?

**Yes, consistency can be checked. NO, this proves neither exchange-native acknowledgment nor actual Upstox source authenticity, and it cannot establish continuous overnight stop coverage or guaranteed gap fills.**

Sources from current Upstox API documentation:
- https://upstox.com/developer/api-documentation/get-gtt-order-details/ — STOPLOSS status and rules[].order_id, completed GTT retrieval limitation
- https://upstox.com/developer/api-documentation/get-order-history/ — one-trading-day history, order_request_id, exchange_order_id, status, filled_quantity
- https://upstox.com/developer/api-documentation/get-trades-by-order/ — GET /v2/order/trades?order_id, broker-reported trade_id, exchange_order_id, quantity, average_price
- https://upstox.com/developer/api-documentation/appendix/order-status/ — pending, rejected, cancelled, completed and modifications

## Module and logic

Source: src/server/engine/ema15m/adaptiveUpstoxPhase43TriggeredGttChildChain.ts

Entry: auditPhase43TriggeredGttChildTrades(input, independentPins). This is pure offline code and never calls a broker or creates a new trade.

Requires:
- One operator-archived GET /v3/order/gtt result after a claimed trigger, exact GTT ID, product D, instrument, symbol, quantity and one STOPLOSS SELL BELOW rule with TRIGGERED, OPEN or COMPLETED status and actual child order ID. Rejects FAILED, EXPIRED, CANCELLED, SCHEDULED-only, missing/wrong child order ID, wrong side/contract/quantity. The observation is only an operator archive.
- Phase40 child-order history input re-audited using the existing actual Phase40 audit (not a cached PASSED report), pinned same account/instrument/quantity/lot, SELL, product D, same trading session and supported order status. Rejects rejected/cancelled/cancel pending/modify pending, missing reported exchange_order_id and mutable reference IDs.
- Stronger Phase43 progression: history row timestamps cannot run backward or into another day/future; filled_quantity is monotonic nondecreasing, request numbers nondecreasing, exchange timestamps in the same session; no order-history event can postdate the GTT snapshot that allegedly already reported it. A COMPLETED GTT cannot be reconciled against an OPEN child; an OPEN GTT cannot be reconciled against a COMPLETE child.
- Read-only archived GET /v2/order/trades scoped to same child order and same session. Each row must match the independently pinned trade ID in exact original sequence, exchange_order_id, child order ID, instrument, product D, SELL direction, symbol, safe positive quantity/average price and chronological exchange timestamp. Duplicate trade IDs, out-of-order timestamps, cross-day trades, missing/overflow/overfills or fake trade-row quantities reject. Sum of reported trade quantities must equal last broker history filled_quantity. COMPLETE must be fully filled; OPEN may be partially filled. A complete child is no longer a standing protective stop. The remaining unfilled quantity is explicitly reported, without converting to any stop protection claim.
- Independent original GTT archive, history and trade SHA256 pins, reviewer SPKI DER SHA256, account/GTT/child/exchange IDs, declared session date, review challenge SHA256 and bounded review window. Pins must be externally provisioned; locally self-pinned digests do not establish real data origin.
- One real Ed25519 signature from a separately pinned external review key over the SHA256 of each source archive, original account/order IDs, claimed reviewer time and a domain-separated random challenge. The claim's issuer MUST be EXTERNAL_REVIEWER_NOT_EXCHANGE_OR_BROKER and status BROKER_ORDER_ID_PRESENT_NOT_NATIVE_ACK. **This is an externally signed CLAIM, not a native exchange ACK and not a signed Upstox HTTP response.** An attacker controlling that key and the pins can sign fake IDs and fabricated data.

Only positive statuses:
- BROKER_REPORTED_CHILD_OPEN_REVIEWED_UNVERIFIED
- BROKER_REPORTED_CHILD_FILLED_REVIEWED_UNVERIFIED

Both permanently set:
- executionAuthorized=false
- productionSafe=false
- brokerAuthenticated=false
- brokerStopInstalled=false
- protectedOvernight=false
- independentExchangeSignedAcknowledgementVerified=false
- officialBrokerOriginVerified=false
- nativeExchangeRestingStopConfirmed=false
- trueExchangeOrderLifecycleVerified=false
- genuineExchangeTradeConfirmationVerified=false
- continuousOvernightProtectionVerified=false
- orderFillPriceGuaranteed=false
- nativeOrderInstruction=null

The module does not claim native stop ACK from the broker's field exchange_order_id, and does not say a filled child order is a standing protection. It does not reconcile across days (one-day API history) and does not retrieve completed GTT orders from the Upstox GTT API (unsupported). No exchange-issued authenticated native stop evidence has been provided. Even an accepted real exchange ACK wouldn't guarantee fill at desired stop price during a gap.

## Operator-private CLI

Source: scripts/audit-adaptive-upstox-phase43-trigger.ts

Run manually on locally owner-protected 0700 directory with two pre-existing owner-0600 JSON files containing private archives and independently pinned source/reviewer policy:

    npx tsx scripts/audit-adaptive-upstox-phase43-trigger.ts --approve-private-offline-trigger-review --private-gtt-child-trade-archive /private/phase43-archive.json --independent-child-exchange-review-pins /private/phase43-pins.json

The CLI does NOT make network requests, schedule automated action, order/cancel/modify broker positions, or sign/write GTT. It prints only redacted status, counts and reason codes; no UCC, order/trade IDs, bearer headers, raw responses, receipt signer key or private filesystem paths. Use an OS-enforced no-egress sandbox and independently controlled archive provenance.

## Synthetic tests / limitations

Source: src/quant/tests/ema15m_adaptive_upstox_phase43_triggered_gtt_child_chain.test.ts

Genuine local Ed25519 keypair signs synthetic reviewer claim. Positive scenarios: open child without fills; complete with two separately pinned trade IDs that aggregate to full quantity; partially filled child with remaining exposure. Negative scenarios: GTT no child, FAILED/CANCELLED/EXPIRED, wrong contract/UCC/side, broker history cancellation/rejection/modify pending, changed exchange_order_id, duplicate/forged trade ID, changed quantity, monotonic fill/time violations, another trading day, wrong independent source hash/pin, forged reviewer signature, false exchange issuer identity and substituted reviewer public key.

**This is not a source-authenticated real broker/exchange execution.** The private synthetic tests contain fabricated Upstox-compatible statuses, order/trade IDs, and synthetic reviewer keys. They cannot prove real native order protection; green CI only checks software invariants. Phase43 is not a replacement for independently authenticated original exchange ACK/cancel/replace and complete session history, original signed broker source, official effective-dated exchange calendar, licensed historical options L1/OOS gap/tail risk analysis, and operator/security/risk approvals.

Release blockers #17–#22 including #20 stay OPEN. All Phase PRs remain Draft/unmerged. Existing EMA23/EMA50 MIS intraday 15:15 square-off unchanged. NRML 1W/2W/4W/8W positional strategy has NO forced 15:15 exit and NO live NRML auto-trading or GTT writes.

Next: genuinely authenticated source-of-truth for exchange-native ACK and broker-origin authenticated order events; independently verify order state modifications/cancellation/replacement and complete continuity over nights and weekends without treating reviewer signatures, broker-reported IDs or signed local hashes as native exchange proof.
