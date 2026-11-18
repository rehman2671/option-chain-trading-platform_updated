# Adaptive Swing v2 Phase45 — WebSocket/public webhook order event parity

**Draft/unmerged and manual-only research. All test evidence is synthetic, with no real Upstox account, broker-authenticated event capture, exchange-signed ACK, NSE NOTIS member feed or live NRML order/GTT operation.**

## Why this phase

Phase44 reconstructs an operator-archived same-session stop modify/cancel/replace sequence and its unprotected cancellation-to-replacement gap. Phase45 adds an offline event-by-event comparison with two operator-archived broker update streams, preserving **no native exchange ACK and no guaranteed stop** claims.

Official Upstox sources:
- https://upstox.com/developer/api-documentation/get-portfolio-stream-feed/ — authenticated redirect to portfolio WebSocket for order updates
- https://upstox.com/developer/api-documentation/webhook/ — public webhook POST sends identical order and GTT updates to WebSocket; webhook receiver is open and should not require authentication
- https://upstox.com/developer/api-documentation/get-order-history/ — broker-reported order status, request ID, exchange_order_id and same-day history

**WebSocket and webhook are two transports of the SAME Upstox broker source, not two independently authenticated exchanges.** A spoofed public webhook body and fabricated archived TLS WebSocket records can match perfectly. Two independently pinned local signing keys do not prove the original network origin.

NSE NOTIS member-only trade service: https://www.nseindia.in/static/trade/notis-faqs and https://www.nseindia.in/static/trade/platform-services-neat-trading-system-protocols. NOTIS provides member-accessed TRADE and trade-modification data, **not public customer exchange-native order ACK**. Phase45 neither logs into NOTIS nor manufactures exchange signature/certificate formats.

## Source module

src/server/engine/ema15m/adaptiveUpstoxPhase45DualChannelOrderEvents.ts

The pure function auditPhase45DualChannelOrderEvents(archive,independentPins):

1. Reruns full Phase44 offline mutation audit (which also reruns Phase43) instead of trusting a cached PASS result. A failed/ambiguous Phase44 order state blocks Phase45.
2. Requires independently pinned original Phase44 archive/policy SHA256, exact UCC account scope, and exact IST session date.
3. Requires a bounded, ordered archived WebSocket update sequence AND an archived public webhook POST update sequence, with exactly one original UTF8 JSON response body for EACH Phase44 broker order-history row. Missing, extra, reordered or contradictory events reject. **Real feeds may omit/delay events; in that case this strict gate rejects, not auto-inferring events.**
4. Every raw UTF8 body must match an independently supplied SHA256 pin and domain-separated hash chain ending in an independently pinned tip. Strict bounded canonical base64 and UTF8 decoding, valid JSON and no duplicate critical keys are required.
5. Every parsed order update must exactly match Phase44's broker-reported order ID, exchange reference (empty string can be used for not-yet-assigned), instrument, symbol, product D, SELL stop type, quantity and filled quantity, status, order_request_id, original event timestamp, exchange timestamp and UCC placed_by.
6. Claimed capture timestamps must be after the original event and within a pinned 1–1800-second window. Two DISTINCT pinned Ed25519 signer keys, one per channel, must sign their raw body hashes, event timing, source hashes, challenge, chain tip and review time. Claims of transport identity and human independence remain UNVERIFIED.
7. Maximum accepted status is TWO_BROKER_REPORTED_CHANNELS_MATCH_UNVERIFIED, reporting counts of matched websocket/webhook events, signed local claims, stop mutation events, and unobserved inter-event windows.

Even a local positive result fixes all the following to FALSE:

    executionAuthorized
    productionSafe
    brokerAuthenticated
    brokerStopInstalled
    protectedOvernight
    independentTransportOriginsProven
    publicWebhookSpoofingExcluded
    websocketHandshakeIndependentlyAuthenticated
    exchangeSignedOrderAcknowledgementVerified
    independentNseNotisMemberTradeVerification
    completeBrokerEventHistoryProven
    nativeProtectiveStopContinuityVerified
    overnightGapFillGuaranteed

nativeOrderInstruction is always null. A broker-reported exchange_order_id is not a signed exchange ACK; a completed child order is already filled and no longer a standing stop. Matching archived updates does not prove no missed events, uninterrupted overnight protection or a guaranteed stop fill in a gap.

## Private operator-only CLI

scripts/audit-adaptive-upstox-phase45-order-events.ts

Two pre-created owner-0600 JSON files in owner-0700 directories and explicit operator approval, in an OS-enforced isolated no-egress environment:

    npx tsx scripts/audit-adaptive-upstox-phase45-order-events.ts --approve-private-offline-only --private-ws-webhook-order-events /private/phase45-source.json --independent-witness-event-pins /private/phase45-pins.json

The CLI never connects to a WebSocket, exposes an HTTP webhook, calls a broker endpoint, places/modifies/cancels orders/GTT, or schedules a task. It prints only sanitized aggregate counts, status, and reason codes; no UCC, option IDs, order IDs, tokens, original private payload or filesystem path.

## Synthetic tests

src/quant/tests/ema15m_adaptive_upstox_phase45_dual_channel_order_events.test.ts

Generates real local Ed25519 capture signatures over fabricated Phase44 modification/replacement and filled-exit events. Negative tests include: forged webhook status even with new pins/signature, mismatched UCC/contract/order or exchange ID, quantity/request count, duplicated JSON keys, missing/extra/reordered events, tampered body bytes, source timestamps out of bounds, incorrect independent chain tip, swapped channel, forged witness signature, identical signing-key policy, and invalid reaudited Phase44 state.

These tests do NOT authenticate a genuine Upstox account, actual network TLS session, any NSE member feed, real option prices or native protective-stop ACK.

## Safety and next priorities

All stacked PRs stay **Draft/unmerged**; release blockers #17–#22 including native stop #20 remain OPEN. Existing EMA23/50 MIS intraday 15:15 square-off is untouched. **NRML positional 1W/2W/4W/8W has no forced 15:15 exit**; no new live trading, stop repair, GTT writes, automated broker polling, or expiry liquidation is added.

Next: separately authorized and independently attested broker-origin capture provenance; real broker/exchange order ACK, cancel and replace chronology; member-provided authenticated exchange trade data when access is legally established; and actual licensed options L1 original market paths with realistic slippage, adverse excursions, time-to-target, overnight gap/tail tests and walk-forward/OOS validation. Green CI is code correctness only, not profitability or production-safe stop protection.
