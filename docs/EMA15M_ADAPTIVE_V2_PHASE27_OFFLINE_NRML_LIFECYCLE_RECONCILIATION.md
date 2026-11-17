# Adaptive Swing v2 Phase 27 — OFFLINE NRML order/trade lifecycle reconciliation

**DRAFT / UNMERGED / NO LIVE BROKER ACCESS / ZERO ORDER EXECUTION.**

## Critical finding

Upstox's current documentation says the ordinary **v2 Get Order Book**
(`GET /v2/order/retrieve-all`) is limited to orders of the **current
trading day**, and Order History is also available for one trading day.
`GET /v2/order/trades/get-trades-for-day` is likewise a **day-only
trade book**, which may list multiple partial executions of a single
order. These responses cannot independently attest a protective stop
survived **any overnight session boundary**, much less a 1W/2W/4W/8W
NRML option holding. If a system crosses an IST calendar date, it
requires additional broker-authoritative / exchange-authoritative
lifecycle evidence and human approval; Phase27 **blocks** the inference
rather than asserting that an empty day book is proof of no trades.

Official provider docs:
- https://upstox.com/developer/api-documentation/get-order-book/
- https://upstox.com/developer/api-documentation/get-order-history/
- https://upstox.com/developer/api-documentation/get-trade-history/
- https://upstox.com/developer/api-documentation/get-trades-by-order/
- https://upstox.com/developer/api-documentation/get-gtt-order-details/

## What Phase27 actually implements

A standalone **pure/side-effect-free** function
`auditOfflineUpstoxNrmlLifecycle(input,phase25Policy)` takes 2–64
operator-supplied, strictly ordered frames. Each frame has:

- An expected FO NRML contract from **separately supplied**
  `ReadOnlyExpectedPosition` metadata (not verified source data).
- A Phase26 operator-supplied three-book JSON bundle: GET positions,
  all-day orders, active GTT rules, with declared capture timestamps.
- A separate *unfiltered, successful* day-trades GET snapshot from
  `/v2/order/trades/get-trades-for-day`.
- A frame sequence, `asOf` time, and optional `recoveryStartedAt`.

Each frame inherits Phase26/25 fail-closed checks for product, contract,
order states, complete source books, stop quantity, quantity and lot,
near expiry, account scope and post-restart freshness. The added **temporal
audit** detects:

1. Missing/reordered frames; invalid or nonmonotone evaluation times;
   source snapshot clock replays, stale trades, incomplete or
   cross-skewed positions/orders/GTT/trades captures; too-large frame
   interval (operator-locked maximum, 1–30 min).
2. **India-date boundary**: day-limited broker order/trade data cannot
   prove any **overnight** protective native order persisted.
3. SELL protective stop `order_id` unexpectedly disappearing or changing,
   including the dangerous case where both before and after snapshots
   separately pass Phase25 yet the intermediate **cancel/replace gap**
   is unknown. No claim of continuous gap-free protection.
4. An order ID disappearing from a declared complete same-day book,
   decreasing cumulative `filled_quantity`, a terminal order reappearing
   active, changed original quantity/trigger, or order ID reused for
   a different side/product/type. These require independent review.
5. Missing, mutated or duplicate `trade_id` in full same-day snapshots;
   no matching order ID, mismatched side/product, order cumulative
   fills not equal to day trade sums, and selected-contract position
   changes not explained by newly observed day BUY/SELL fills.
6. A partial SELL execution may explain a smaller position, **but
   even a correctly reconciled partial fill is a blocker** until
   protection for the remaining quantity has been independently
   reviewed and confirmed.
7. An operator-declared application restart requires fresh trade-book
   and Phase26 order/position/GTT book timestamps. The restart
   timestamp is not an independent process or broker witness.

## Local-only use

Create the Phase27 wrapper by putting 2–64 Phase26-style frames into
`frames`, each with its own `trades` object, and choose the *locked*
`maximumFrameGapMinutes` according to a separately reviewed sampling
policy. Example shape below is deliberately **non-tradable, synthetic
and schematic**; private capture files must never enter public git,
issues or chat.

```json
{
  "schemaVersion": "ADAPTIVE_UPSTOX_OFFLINE_LIFECYCLE_V1",
  "source": "OPERATOR_SUPPLIED_UNVERIFIED",
  "maximumFrameGapMinutes": 5,
  "frames": [
    {
      "sequence": 1,
      "asOf": "2026-11-17T10:00:00Z",
      "expected": {
        "accountScopeId": "SYNTHETIC_ONLY",
        "instrumentKey": "NSE_FO|SYNTHETIC_ONLY",
        "productType": "NRML",
        "expiry": "2026-12-24",
        "lotSize": 65,
        "expectedNetLongQuantity": 130
      },
      "capture": "<Phase26 offline three-book capture object here>",
      "trades": {
        "method": "GET",
        "path": "/v2/order/trades/get-trades-for-day",
        "unfiltered": true,
        "httpStatus": 200,
        "capturedAt": "2026-11-17T09:59:45Z",
        "response": {"status": "success", "data": []}
      }
    },
    {"sequence": 2, "asOf": "...", "expected": "...",
     "capture": "...", "trades": "..."}
  ]
}
```

**Run locally**:

```bash
npx tsx scripts/audit-adaptive-upstox-nrml-lifecycle.ts \
  /private/phase27-multi-snapshot.json \
  --policy /private/locked-phase25-risk-policy.json
```

Result is a *sanitized* status/reason/count/digest report. **Never**
print source account keys, order IDs, trade IDs, broker tokens, or raw
GET responses. Output statuses:

- `INVALID_EVIDENCE`: malformed/duplicate/failed/incomplete/scope
  capture or invalid chronology.
- `BLOCKED_OR_UNKNOWN`: structurally readable but temporal/stop
  protection unresolved, including overnight or partial fills.
- `CHRONOLOGICALLY_CONSISTENT_UNVERIFIED`: synthetically observed
  same-day books satisfy checks. This is **not broker-authenticated
  and not production-safe**, including if an order status happens
  to read `trigger pending`.

A SHA-256 chain of JSON-serialized per-frame data is included to make
later local comparisons easier. Because the operator can regenerate all
JSON and hashes, it is **NOT** an externally signed chain of custody or
original-byte broker witness and cannot promote any status to
`brokerAuthenticated` or `brokerStopInstalled`.

Every report MUST always set:

```text
executionAuthorized=false
productionSafe=false
brokerAuthenticated=false
brokerStopInstalled=false
nativeOrderInstruction=null
```

## External blockers and release control

- Verified Upstox account-scoped authorized GET transport and
  independent capture provenance is **not implemented**.
- Authentic exchange fills, matching contract notes, broker
  historical order details beyond day limits, GTT generation and
  true overnight stop survival are **unverified**.
- Neither product mapping (`D` interpreted as NRML-like) nor option
  metadata (lot, expiry) is independently sourced.
- No native stop is ever placed, amended, cancelled or restored.
  No paper/live positional NRML runner or expiry liquidation exists.
- No licensed original historical option L1, true independent
  market/OOS study, counterparty tail-risk approval, or release signoff.
- Existing **EMA23/50 intraday MIS 15:15 square-off remains untouched**.
  Positional NRML must *never* inherit MIS 15:15 auto-square-off.

Release issues **#17–#22 remain open**. PR31 (Phase26), PR30 (Phase25)
and all previous phases are stacked **Draft** branches, not merged.
A green CI is not a broker authentication, a native stop guarantee,
profitability evidence or production permission.

### Phase28 candidate

Design an **independently authorized read-only evidence intake boundary**:
account-scoped permissions, broker source attestation, clock/nonce
integrity, original response byte witness, retention policy,
day-order/history trade reconciliation under approved broker APIs,
and independently reviewed weekend/expiry operational safety.
Do not connect live order execution without explicit separate risk,
legal/regulatory and operational approval.
