# Phase124 — Native Upstox per-order BUY exchange clock provenance quarantine

**Stacked DRAFT research on Phase123 PR #128. No broker GET/BUY/SELL/GTT operations, writes, position CLOSED, P&L or LIVE NRML release; MIS 15:15 forced squareoff remains MIS-only.**

## Source gap and public broker API

Phase123 accepts a caller-supplied normalized \`executedAtUtc\` clock, which is not native broker proof. The documented Upstox GET /v2/order/trades has a per-trade \`exchange_timestamp\` alongside trade ID, quantity, average price, order ID, exchange order ID, instrument, exchange and product. Separately, \`order_timestamp\` is order placement. Historical F&O \`trade_date\` is date only, not exact per-fill time.

Original documentation:
- https://upstox.com/developer/api-documentation/get-trades-by-order/
- https://upstox.com/developer/api-documentation/get-order-history/
- https://upstox.com/developer/api-documentation/get-historical-trades/
- https://upstox.com/developer/api-documentation/appendix/exchange/

## Phase124 pure offline boundary

\`src/server/engine/ema15m/adaptiveUpstoxNativeTradeClockProvenanceReadOnly.ts\` never performs broker HTTP. An operator supplies an **unverified** GET /v2/order/trades response and bounded capture/review metadata. A successful status must have 1–5000 rows matching unique trade IDs, exact NSE_FO→NFO or BSE_FO→BFO exchange, original BUY order and exchange-order IDs, exact instrument, D product, BUY side, positive integral quantity and paise-valid premium. Sum must match the complete original BUY.

The parser accepts only \`dd-MMM-yyyy HH:mm:ss\` in per-fill \`exchange_timestamp\`, with no implicit Date.parse locale/timezone, leap rollover, missing fields or ISO/date-only/order-timestamp fallback. The unzoned human-readable field is interpreted as +05:30 ONLY with explicit \`ASSUME_ASIA_KOLKATA_UNVERIFIED\` declaration. This does **not** independently certify timezone, exchange time origin or the exact execution instant. It models whole seconds, not milliseconds. All capture/review timestamps are canonical UTC and the declared capture must be no later than review and within 1–30 minutes.

The derived *assumed* UTC per-fill dates feed the unchanged Phase123 read-only BUY cohort/GTT horizon audit, which computes the original 1/2/4/8-week anchor, weighted premium, current net and reasons for failed consistency. Those identifiers and raw source bytes never appear in Phase124 report.

**Critical boundary:** a GTT created during the *reported* BUY second is not demonstrably after the actual fill; 09:15:00.000 GTT may precede a BUY at 09:15:00.999. Phase124 returns \`GTT_CREATED_IN_UNRESOLVED_EXCHANGE_EXECUTION_SECOND\` even if Phase123's normalized millisecond clock had a favorable temporal-overlap label. A later GTT still has an unprotected original BUY opening gap. Nothing here proves persistent broker protection.

## Hardcoded negative safety outcomes

All reports explicitly mark independent raw capture/account provenance, issuer-authoritative clock and venue-signed execution, complete multi-session trade history, effective-dated option exchange contract/session/lot proof, GTT same-net longevity, close-only/no-short permission, exchange-native STOP ACK, gap fill, actual release, automatic CLOSED/realized P&L, duplicate SELL retry, NRML 15:15 forced squareoff and LIVE NRML BUY as **false**; brokerWrites=0 and localWrites=0.

Issues #17–#22 still require original licensed option L1, official original F&O contract/session calendars, independently attested raw trade-time/UTC assumptions and account-wide broker histories, sanctioned overnight SELL lifecycle testing, untouched 1/2/4/8W OOS drawdown/fees and human release approval. Keep DRAFT, unmerged and undeployed.
