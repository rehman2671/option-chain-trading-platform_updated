# Phase126 — Two-pass account SELL/GTT census and current-day historical limits

**Stacked DRAFT research on Phase125 PR #130. No Upstox HTTP, live BUY/SELL, GTT placement/modification, position closure, P&L or production deployment. MIS 15:15 squareoff stays MIS-only.**

## Why

Phase125 verifies two caller-supplied original BUY trade snapshots. That is insufficient to prove the absence of competing same-option BUY or SELL orders or GTTs, especially after an overnight restart. Current ordinary Upstox order book is trading-day-only; completed GTT parents cannot be retrieved using normal GTT GET. Missing historical records must be UNKNOWN rather than an absence certificate.

Upstox official references: https://upstox.com/developer/api-documentation/get-order-book/ and https://upstox.com/developer/api-documentation/get-gtt-order-details/ and https://upstox.com/developer/api-documentation/get-trades-by-order/

## Read-only audit

New pure TypeScript module: src/server/engine/ema15m/adaptiveDualAccountSellGttCensusReadOnly.ts. It consumes the existing Phase125 two-read original BUY cohort and two additional unfiltered current GTT list snapshots. It does not call any broker.

- Verify exact account/auth epoch/request-ID/capture-clock bindings supplied by caller and explicitly acknowledge that ordinary orders are only today's and completed GTT history is not available.
- Reject missing, malformed, cyclic, oversized or duplicate current GTT parents. Compare both GTT sets ignoring list order; detect missing/added/repriced parents. Selected GTT parent must match exact source used by Phase125.
- Reject an extra same-option GTT parent even if another product or apparently terminal, since another child/order may have been generated.
- Reject duplicate current native order IDs, missing/ambiguous NRML positive whole-lot net, other-product same-contract orders/positions, other active/pending/filled BUY or SELL and unknown statuses. A terminal canceled/rejected/expired order with zero fills and zero pending can be observed without proving historical absence.
- If the original BUY does not appear in today's current-day orderbook, report an explicit UNKNOWN; never pretend the old BUY or its protection has been disproven or independently confirmed.
- Only after account-census checks, re-run Phase125. A matching same-second BUY/GTT clock stays unresolved. Even a clean two-pass current-day census is NOT a durable historical protection record.

## Unchanged release blockers

All report outcomes hardcode FALSE for independently authenticated account/epoch/issuer/source, complete multi-session order or completed-GTT history, exchange-native protective stop, NRML close-only/no-short protection, guaranteed overnight limit SELL fill, original listed option calendar/licensed L1, independent release, duplicate SELL retry, automatic CLOSED/P&L, live NRML BUY and NRML forced 15:15 exit. brokerWrites=0 and localWrites=0. All raw IDs, credentials and source fields are redacted from report.

Outstanding issues #17-22 remain OPEN: licensed original options L1, official time-versioned NSE/BSE F&O session/expiry/lot master, independent trade chronologies and broker GTT child records, 1/2/4/8-week OOS risk/slippage/gaps, and human risk/security/operations approval.

**Keep DRAFT/unmerged/undeployed. Green CI is not verified live trading safety.**