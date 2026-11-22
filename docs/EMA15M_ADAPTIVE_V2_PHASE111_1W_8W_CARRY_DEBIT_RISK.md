# Phase111 — NRML 1/2/4/8-week option-premium debit at risk and uncovered calendar overnights

**Stacked DRAFT on Phase110 PR #115. No order placement, GTT modification,
live NRML BUY release, production deployment, local journal mutation, manual
position CLOSED, automatic realised P&L or NRML 15:15 square-off.**

## Why an active broker DAY stop cannot certify an 8-week positional hold

Upstox v3 native order placement supports `SL`/`SL-M` with `DAY`
or `IOC` validity, not a certified multi-week stop order.
[Official Place Order V3](https://upstox.com/developer/api-documentation/v3/place-order/)

Upstox [GTT v3 placement](https://upstox.com/developer/api-documentation/place-gtt-order/)
requires an ENTRY leg; a MULTIPLE GTT STOPLOSS may survive subsequent
sessions once its primary ENTRY executes, but a GTT ENTRY cannot be
assumed to attach retroactively to a separately filled original NRML BUY.
Creating a fresh GTT ENTRY risks an unintended duplicate BUY. Any scheduled
GTT is broker-triggered; it is not a venue-signed protective child order
nor guaranteed exit at the trigger price.

For a fully paid single **long** option position, premium paid (excluding
fees and taxes) is the conservative maximum remaining option-debit-at-risk
basis **if the long premium can go to zero**. This is not a guarantee of
broker-account liquidation, margin, premium recovery, 1W–8W profitability,
fees/STT/GST, realized P&L, or net risk across other instruments.
A long option stop trigger also does not guarantee execution during
overnight news, opening gaps, spreads, price limits or illiquidity.

## Read-only implementation and interface

`adaptiveNrmlMultiweekCarryDebitRisk.ts` implements a deterministic
1/2/4/8-calendar-week, long CALL or PUT risk review:

- Validate full original NRML whole-lot option long, declared expiry
  calendar date, observed time in actual timezone, weighted original
  entry premium in exact paise and a positive operator-declared INR budget.
  **Neither option type/contract expiry nor budget is certified by
  exchange-master/risk committee in this phase**.
- Require complete broker positions, orderbook and GTT account lists.
  Derive remaining exposure from one strictly parsed unique current
  broker product `D` net. Reject short, zero, duplicate, non-whole-lot,
  other-product exposure or quantity exceeding original BUY.
- A previously read **two-pass** Phase110 DAY stop is reconciled to the
  same net/quantity, but even then counts **zero independently certified
  overnight protective stop units**. Other same-contract new BUY,
  active SELL, unaccounted SELL fills and every same-instrument GTT
  remain conflicts, rather than assuming stop/GTT coverage.
- Calculate `estimatedOriginalPremiumDebitINR` and
  `estimatedRemainingPremiumDebitINR` as exact paise multiplication
  of BUY premium times original or broker-remaining units. Guard
  integer overflow. Do not subtract speculative SELL proceeds, P&L,
  taxes or assumed stop fill. This is an **indicative remaining-debit
  loss bound**, not a verified financial statement.
- Calculate calendar-day transitions up to the smaller of 1/2/4/8
  weeks and the declared option expiry, in IST. This is **not**
  an NSE holiday/trading calendar or evidence of live stop coverage.
  Expiry on/before review day, horizon beyond declared expiry,
  or the remaining debit above the operator budget each block.
- Even if the math and expiry horizon look feasible, the final state
  is `MULTIWEEK_OVERNIGHT_PROTECTION_UNCERTIFIED`; every relevant
  calendar transition lacks independently certified overnight protection.
  All live-order, risk-release, statutory-fee, GTT exit eligibility,
  exchange-master expiry and production flags are hardcoded false.

### SuperAdmin diagnostic

`POST /api/ema15m/nrml-multiweek-carry-risk-review`
accepts only an exact current `positionId`, `expectedAccountId`,
operator **declared** `side` (LONG_CALL/LONG_PUT),
`declaredExpiryDate` YYYY-MM-DD, `horizonWeeks` 1/2/4/8,
`declaredDebitBudgetINR`, and optional **already-existing**
`stopOrderId`. It does not accept a caller-supplied premium, signed
receipt, actual broker quantity or fill.

The endpoint gets the original BUY receipt and premium server-side
from the durable ledger, verifies it matches the NRML position/entry,
pins the authenticated Upstox account and local auth epoch, performs
two independent read-only position/orderbook/GTT censuses, optionally
runs Phase110's two-pass existing DAY SL/SL-M review, and rejects
any broker or durable journal change before returning a sanitized
diagnostic. **No broker execution/stop write method is invoked**.
This is an expensive manual research check, not a recurring poller.

## Synthetic tests, CI and remaining work

Phase111 adversarial tests cover 1W/2W/4W/8W, IST day rollover,
fractional paise and overflow, budget thresholds, expiry mismatch,
partial net exposure, stale/failed DAY stop, competing GTT/BUY/SELL,
duplicate broker rows, misleading scientific-notation net, malformed
snapshots and no-order-write admin route. Node22 TypeScript, prior
Phase90/101/107–110 NRML safety tests, broad EMA15M invariants,
production build and full regression are separate GitHub Actions gates.

**Not released**: real broker-supported persistent protective SELL
for a separately filled F&O NRML option long, venue ACK and accurate
covered quantity, cancel/replace/partial/restart continuity, cross-session
broker-authentic evidence, independent contract expiry/holiday calendar,
security and operations approval, account-wide margin/capital checks,
real multi-week original option L1 data, realistic spreads/fees and
untouched out-of-sample profitability. Issue #20 remains a blocker.
No success in this diagnostic, CI or any synthetic scenario releases
real-money orders. No fixed 15:15 square-off for NRML.
