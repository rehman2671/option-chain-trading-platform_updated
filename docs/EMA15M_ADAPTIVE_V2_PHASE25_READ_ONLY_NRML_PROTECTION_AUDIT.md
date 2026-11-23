# Adaptive Swing v2 — Phase 25 read-only NRML protective-order book audit

**DRAFT / OFFLINE ONLY. Not a live broker connection, not order protection, not permission to trade.**

## Why this phase

The Phase 9 journal accepts ONLY simulated broker snapshots. That is useful for
state-machine regression but it cannot review an operator's separately acquired
broker position, order and contingent/GTT book without fabricating a broker
connection. Phase 25 provides a **pure, read-only structural audit of an
UNVERIFIED operator-provided export**. No Upstox imports, tokens, requests,
websocket subscriptions, database writes or native NRML stop placement are
introduced. This does not replace real broker-authoritative reconciliation.

A protective SELL that was once acknowledged may be cancel-pending, partially
filled, stale, rejected or duplicated by an outstanding GTT. A remembered
journal stop cannot prove the account is protected after a crash or partial fill.

## Fail-closed checks

`adaptiveReadOnlyNrmlProtectionAudit.ts` compares a separately supplied
expected long NRML position with three **complete** account-scoped snapshots:
positions, outstanding/history orders and contingent/GTT instructions.
Each has a declared capture time, limited age and bounded cross-book skew.

- Exactly one selected contract's NRML position must match account,
  instrument, expiry, lot size and remaining whole-lot long quantity.
  Wrong-product MIS rows, duplicate positions, negative/mismatched net
  quantity and other-account rows invalidate the assumed coherent scope.
- When long, exactly **one** unresolved SELL may exist across native orders
  **and** GTTs. Its broker-reported original minus filled minus cancelled
  quantity must equal the *remaining* position, with a positive trigger,
  exact NRML scope and `ACKNOWLEDGED_TRIGGER_PENDING` status. This is only
  a *structural candidate*, not independently authenticated stop protection.
  A native stop must appear in the order book and a GTT in the GTT book.
- UNKNOWN, REPLACE_PENDING, CANCEL_PENDING, TRIGGERED and PARTIALLY_FILLED
  unresolved statuses cannot count as verified coverage. An extra open SELL
  or unresolved BUY blocks the result. Identical order IDs in both books
  are rejected rather than double counted.
- After a declared restart, **all three** snapshots must be newer than the
  recovery instant. Missing, future, stale or time-incoherent snapshots
  block the audit. A partial or omitted GTT book is not a complete view.
- A flat expected position cannot silently retain a pending SELL or GTT.
  Near or on the declared expiry day, an exchange-session manual review
  blocker applies. No NSE/BSE holiday or revised expiry session is inferred
  from a weekday, and no 15:15 positional square-off occurs.

The module deliberately maps an operator export into **generic** statuses.
A human or separately reviewed, broker-sanctioned adapter must prove how
actual broker order/GTT states map to these fields and whether all rows
were obtained for the right account. A typed `source` string and a passing
structural check **cannot** authenticate an Upstox API session.

## States

| Status | Interpretation |
|---|---|
| `INVALID_EVIDENCE` | Malformed inputs, duplicate order identifiers or invalid quantities |
| `BLOCKED_OR_UNKNOWN` | Missing/inconsistent books, quantity, protection, restart or expiry review |
| `STRUCTURALLY_CONSISTENT_UNVERIFIED` | Operator-supplied long NRML/order rows appear coherent; **NOT safe to trade** |
| `FLAT_UNVERIFIED` | Operator-supplied complete view appears flat with no unresolved selected-contract SELL; **NOT independently authenticated** |

Every status sets `mode=OFFLINE_READ_ONLY_REVIEW`,
`executionAuthorized=false`, `productionSafe=false`,
`brokerAuthenticated=false`, `brokerStopInstalled=false` and
`nativeOrderInstruction=null`. Report fields expose counts and reason
codes but do not echo raw account IDs, individual order IDs or contract keys.

## Private offline use

First, independently capture private account-scoped position/order/GTT
exports **through the broker's legitimate read-only means**. Do not copy
credentials, account IDs, order IDs or raw exports into GitHub or a public
chat. The CLI reads locally supplied JSON files and prints only sanitized
reason codes and aggregated quantities:

```bash
npx tsx scripts/audit-adaptive-nrml-protection-export.ts \
  /private/broker-books.json \
  --expected /private/expected-position.json \
  --policy /private/offline-audit-policy.json \
  --as-of 2026-11-17T15:00:00+05:30 \
  --recovery-started-at 2026-11-17T14:56:00+05:30
```

Required policy shape (**synthetic example only; not a recommended live
broker stop configuration**):

```json
{
  "maximumSnapshotAgeMinutes": 5,
  "maximumCrossBookSkewSeconds": 90,
  "minCalendarDaysBeforeExpiry": 2
}
```

The export must contain `source: "UNVERIFIED_OPERATOR_EXPORT"`,
three booleans `positionsComplete`, `ordersComplete`, `gttsComplete`,
three offset-aware timestamps `positionsAt`, `ordersAt`, `gttsAt`,
and arrays `positions`, `orders`, `gtts`.
Each position has the account scope, instrument, NRML/MIS product, expiry,
lot size and signed net quantity. Each order/GTT has the account scope,
instrument/product, unique order ID, source book (`ORDER` or `GTT`),
side, order kind, status, original quantity, cumulative filled and
cancelled quantities, and optionally a positive trigger price. An expected
position specifies NRML, account, instrument, expiry, lot and expected
remaining long quantity; it must come from a separately reconciled ledger.
Refer to the exported TypeScript interfaces for the exact schema.

Exit status 0 means **only** that the supplied rows are structurally
consistent; blocked/invalid audits return 2. Neither outcome implies broker
authentication, safe execution or profitable trading.

## Scope & remaining gates

Synthetic adversarial tests cover partial fills, stale stop quantity,
duplicate SELL/GTT, wrong account/product, old post-restart export,
unknown/cancel states, flat-but-orphaned sell and expiry proximity.
The protected legacy EMA23/50 MIS 15:15 path is not edited. No platform
routes, paper simulator integration, GTT/stop creation, NRML buy/sell,
expiry auto-liquidation or overnight execution daemon are included.

Issues **#17–#22 remain blocked**: licensed original option L1 and
time-versioned exchange calendar; genuine broker-authenticated complete
order/position/GTT snapshots and approved adapter mapping; actual native
order ACK/partial-fill/replace/restart rehearsal; independent OOS
profitability/tail-risk and reviewer signoff; human PR/release review.
A structural offline audit is not an alternative to any of those checks.
