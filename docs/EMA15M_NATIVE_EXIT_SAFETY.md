# EMA15M — Native protective stop / duplicate SELL safety

**Branch:** `codex` · **Status:** Broker-read interlocks implemented; **automatic broker-native SL/GTT placement NOT enabled**.
**Deployment recommendation:** Keep funded automated LIVE execution disarmed until exchange-order and fallback procedures are operationally validated. Paper simulation remains independent.

## Why a standard Upstox GTT MULTIPLE is not an attachable exit bracket

The current [Upstox v3 GTT place API](https://upstox.com/developer/api-documentation/place-gtt-order/)
requires an `ENTRY` rule for `MULTIPLE` GTT. Do **not** place a second
GTT `ENTRY BUY` to "attach" TARGET/STOPLOSS rules to an already-executed
EMA15M option BUY. That could open **another** live option position.

SINGLE GTT `SELL` with `ENTRY BELOW` is a *separate condition-based SELL*,
not an exchange-linked OCO against an existing EMA order. It must never be
automatically created without an independently persistent life-cycle and
cancellation/quantity reconciliation.

## What the current EMA15M live SELL code enforces

1. Caller has authorized rights and the existing EMA position is open/eligible.
2. Original BUY has a terminal/reconciled order status; do not SELL while an
   outstanding BUY remainder could continue filling.
3. Fetch verified broker net quantity for exact instrument and product.
   It must equal remaining EMA quantity (otherwise STOP and reconcile).
4. Fetch Upstox **ordinary order book**. If unavailable, malformed or any
   same-contract same-product SELL is not terminal (including `SL`,
   `SL-M`, `trigger pending`, `open`, `cancel pending`,
   `not cancelled`): STOP. Never assume that a cancel ACK means cancelled.
5. Fetch **GTT order list** separately. If unavailable or any matching
   contract/product GTT SELL rule is `SCHEDULED`, `INACTIVE`, `PENDING`,
   `TRIGGERED`, `OPEN` or `COMPLETED`: STOP. Confirm reconciliation
   before submitting another SELL.
6. If all checks pass, claim the EMA exit atomically in the shared SQLite
   ledger. Only one claimant can submit the conventional SELL.
7. Broker `order_id` alone means `EXIT_PENDING`, not `CLOSED`.
   Only actual positive SELL fills can reduce exposure, and only cumulative
   full exit quantity marks `CLOSED`.

**Limitations:** There remains a race if an external client creates a new
stop order *after* the preflight snapshot and before our SELL reaches
exchange. Multi-instance atomicity requires instances to share the same
SQLite database. Protection does not replace physical exchange stop cover.

## Operator runbook: native SL/GTT is still active

1. **Do not press manual close repeatedly.** Confirm the actual Upstox
   account and instrument's order book and positions; do not infer from UI
   estimates or theoretical option prices.
2. If there is an existing exchange-native SL SELL or GTT SELL, request
   cancellation through the **broker**. Ensure that the order is terminal
   cancelled. `cancel pending`, `not cancelled` and HTTP 200
   cancellation acknowledgment are NOT sufficient.
3. Inspect actual trade fills during the cancellation. A partially filled
   protective order changes the net broker quantity; reconcile that
   quantity and cumulative realized P&L before any follow-up SELL.
4. Confirm the Upstox **regular order book** contains no live same-contract
   SELL and the **GTT** list contains no potentially executable SELL rule.
5. Only then retry the authorized EMA exit. If any broker API is unavailable,
   STOP automation, investigate in Upstox and request human supervision;
   do not retry blindly.

## How to test without real-money orders

Run `npm run lint`, targeted `ema15m_*.test.ts`, `npm test`,
and `npm run build` in a test environment **without live broker secrets**.
Tests use fake Upstox order books/GTT lists and prove:
- An exchange `SL` in trigger pending or cancel pending blocks another SELL.
- A dormant GTT SELL rule, even INACTIVE, blocks another SELL.
- Unknown broker state fails closed.
- Terminal cancelled orders no longer block the preflight, provided broker
  position quantity remains equal to ledger remaining quantity.
- Broker ACK does not falsely mark position CLOSED.

## Before activating native stops automatically

Design and review a dedicated **protected-position state machine** and a
transactional mapping of protective order IDs to EMA position IDs; ensure
stop creation, trigger/fills, cancellation, and manual/forced square-off
are mutually exclusive and idempotent. Test broker outages, stop-cancel races,
stale GTT responses, duplicate workers, partial fills, trading-day rollover
and exchange holidays using official sandbox/approved test environment.
Consider loss of connectivity and a human-supervised fallback.

**Never claim this broker-read interlock alone means that an open
real-money EMA position has a native stop-loss order.**
