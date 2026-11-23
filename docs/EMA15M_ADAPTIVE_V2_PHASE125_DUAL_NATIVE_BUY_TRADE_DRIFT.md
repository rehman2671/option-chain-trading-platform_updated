# Phase125 — Dual native original BUY trade snapshot drift quarantine

Status: **stacked DRAFT on Phase124 PR #129**, pure offline research. NO actual Upstox HTTP/GET, broker BUY/SELL/GTT/cancel/replace, position ledger writes, P&L updates, automatic CLOSED, or LIVE NRML. The MIS 15:15 intraday square-off remains MIS-only.

## Problem

Phase124 parses caller-supplied GET /v2/order/trades responses using a strictly declared but UNVERIFIED IST timezone assumption and forwards per-trade execution clocks to the Phase123 original BUY multi-fill cohort/horizon audit. A single response cannot independently establish original broker receipt completeness, account authentication, or that a trade has not changed/disappeared across successive reads.

This phase compares TWO separately captured, raw GET-shaped responses and associated original BUY order/current NRML net/existing GTT snapshots. Stable snapshots are still **not independent broker or exchange attestation**. The same historical missing fills can be absent from both views; a broker query, operator, file or timestamp can be wrong both times.

## Source and input contract

New pure function: src/server/engine/ema15m/adaptiveDoubleNativeBuyTradeReadOnlyAudit.ts.

- Expected account scope and auth epoch supplied by caller; each read must claim exactly the same account and epoch. Distinct per-read request IDs are required, but are NOT verified Upstox signatures.
- Two strictly canonical UTC captured-at timestamps, increasing with a bounded 1–90 second separation; reviewed-at must match both scopes and follow both captures.
- The original BUY cohort scope, original BUY order detail, caller-supplied orderbook, current positions, exact existing SINGLE GTT parent, source method/path, UTC interpretation assumption and per-capture freshness settings cannot drift between reads. Any difference is quarantined.
- Both GET-shaped bodies must be nonempty success responses with at most 5000 raw trade rows. All trade IDs must be unique within each snapshot. Exact trade-ID sets must agree in both directions; missing/added/substituted rows are detected.
- For the SAME trade ID, compare exchange, instrument, BUY side, product, original order and exchange order IDs, quantity, average premium and the documented exchange_timestamp. A changed order_timestamp alone is ignored: it is an order-placement clock, never trade execution.
- Varying JSON row order does not fake a set difference. Malformed, cyclical or oversized original order/net/GTT snapshots fail closed.

## Two-pass evidence stays read-only

After exact structural parity, EACH full snapshot independently invokes the Phase124 offline audit. That re-checks the raw per-order human-readable exchange timestamp, caller-declared IST mapping, source age, Phase123 multi-fill weighted entry, earliest original BUY 1/2/4/8-week horizon, existing GTT creation/expires microseconds, and conflicting/scheduled child states.

Both results must agree and meet Phase124's non-protective accepted temporal labels. Specifically, two repeated snapshots **do not create subsecond original fill precision**: a GTT created inside the reported BUY execution second remains TWO_READS_STABLE_GTT_SAME_SECOND_EXECUTION_UNRESOLVED. A source or GTT failure remains PHASE124_SOURCE_TIME_OR_NRML_REVIEW_QUARANTINED. Even a consistent temporal overlap is only TWO_READS_STABLE_NATIVE_BUY_COHORT_UNATTESTED, not a broker-native stop or BUY release.

The report is fixed-code and contains no raw account IDs, tokens, order IDs, exchange order IDs, trade IDs, instruments, source JSON or auth epochs. All independent capture/venue/account/completeness, exact subsecond fill, effective-date contract master, native exchange STOP ACK, NRML close-only/no-short and overnight protection, gap-fill, auto-close/P&L, duplicate SELL retry and LIVE NRML authorization are FALSE. brokerWrites=0 and localWrites=0.

Official Upstox reference: https://upstox.com/developer/api-documentation/get-trades-by-order/ shows per-order exchange_timestamp as trade time and a separate order_timestamp as placement time. https://upstox.com/developer/api-documentation/get-historical-trades/ provides historical trade_date only and cannot substitute exact per-fill time. Neither a signed contract note nor venue certification is made by these reports.

## External gates, unchanged

Issues #17–#22 remain OPEN: licensed original option L1/depth with event/available clocks, official issuer-authenticated and effective-dated NSE/BSE F&O instrument/expiry/session/lot changes, genuine independent broker/exchange original trade timestamps and complete account-wide multi-session history, broker-sanctioned NRML existing-long close-only SELL/STOP lifecycle across gaps and partial fills, untouched original 1/2/4/8-week OOS costs/stress, and independent human capital/security/operations approval.

**Keep Phase125 DRAFT, unmerged, undeployed and LIVE NRML BUY blocked. CI green is not execution safety or profitability evidence.**
