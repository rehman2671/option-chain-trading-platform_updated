# Adaptive Swing v2 — Phase 26 offline Upstox read-only GET response bridge

**DRAFT / UNMERGED / OFFLINE RESEARCH ONLY. No broker API call or live NRML order routing.**

## What this phase actually solves

Phase25 consumes an operator-normalized generic position/order/GTT snapshot.
Without a strict source-schema adapter, a developer might incorrectly treat
Upstox product `D` as if it were always a verified NRML position,
or treat a GTT `SCHEDULED` rule as a broker-native stop order with
`trigger pending`. Phase26 adds a **pure parser** for *locally saved JSON
GET responses* from the official Upstox portfolio, order and GTT APIs.
This code does not fetch the JSON, authenticate a broker account, record
an actual exchange order ACK, establish account possession or prove an order
is still live.

Official Upstox source references (independently consult the currently
effective docs before designing any future production adapter):

- Get Positions: https://upstox.com/developer/api-documentation/get-positions/
- Get Order Book: https://upstox.com/developer/api-documentation/get-order-book/
- Get GTT Order Details: https://upstox.com/developer/api-documentation/get-gtt-order-details/
- Order Status: https://upstox.com/developer/api-documentation/appendix/order-status/
- Analytics Token: https://upstox.com/developer/api-documentation/analytics-token/

The Analytics Token is read-only and, according to the provider, account
Orders/GTT/Portfolio GET endpoints need a whitelisted static IP. **No
Analytics Token is used or requested by Phase26**. No network/SDK,
OAuth/TOTP, placement, modification, cancellation, webhook or new server
route exists in this PR.

## Strict mapping and non-equivalence safeguards

- For the expected **NSE_FO/BSE_FO** option only, the Upstox `D`
  non-intraday product code is interpreted as generic `NRML` for
  structural auditing; `I` is `MIS`. This remains a *mapping hypothesis*
  until original broker account, contract, product and listing fields are
  independently verified. An ordinary `NSE_EQ` row does not become NRML.
- A native order with `status = "trigger pending"`, `order_type = "SL"`
  or `"SL-M"`, product `D`, long-option SELL and a reconciled remaining
  quantity maps into the Phase25 **structural** candidate. Other order
  statuses, `open` LIMIT/Market, `not cancelled`, modified/pending,
  partial fills or UNKNOWN do **not** count as protected. The order
  book has `quantity`, `filled_quantity`, `pending_quantity` but not
  a reliable general cancelled quantity; Phase26 never fabricates that
  field from `pending_quantity`. Inconsistent live quantities reject.
- Upstox GTT has *rules* with `strategy` (`ENTRY` / `STOPLOSS` /
  `TARGET`), `status`, `transaction_type`, `trigger_type`,
  `trigger_price`, etc. `SCHEDULED`, `PENDING`, `OPEN`, `INACTIVE`
  all map to **UNKNOWN**, not a native order acknowledgement. Any
  `TRIGGERED` rule is a review blocker until linked generated exchange
  order/position changes are independently reconciled. A `STOPLOSS`
  SELL with direction other than `BELOW` also needs manual review.
  Target + stop SELL rules stay separate, so two outstanding SELLs cannot
  masquerade as exactly one protection.
- A GTT expiry timestamp is interpreted in its provider example
  microsecond form. Missing, unrecognized or expired timestamps block
  the report rather than implying a continuing valid stop.
- Completed GTT orders are not returned by the Get GTT API, per its
  documentation. An unfiltered active GTT GET cannot prove there were
  no earlier fills/cancels. Independent broker order history/trade
  records and authoritative position reconciliation remain necessary.
- Fail closed for a non-200 response, `status != success`, missing
  `data[]`, wrong read-only GET path, account scope mismatch,
  malformed row, stale/future/cross-skewed source snapshots or a
  `gtt_order_id`-filtered query advertised as an all-active book.
  `unfiltered:true`, source times and account scope are only
  **operator assertions** in this offline file, not remotely verified
  credentials or coverage evidence.

The output carries counts, reason codes, SHA256 of **JSON-serialized
snapshots** (not original network bytes or an independently signed
capture), and the Phase25 redacted report. It deliberately does not
emit account IDs, instrument keys, individual order IDs, raw broker
rows, tokens or positions-by-symbol.

## Private offline usage

Use only a non-public local directory. Create three response JSON objects
with `status:"success"` and `data:[]` from separately acquired
authorized read-only GET responses; **never** place real tokens or
identifiable account/order data in a public repository, issue or chat.

```bash
npx tsx scripts/audit-adaptive-upstox-offline-export.ts \
  /private/upstox-get-capture.json \
  --expected /private/expected-nrml-position.json \
  --policy /private/offline-audit-policy.json \
  --as-of 2026-11-17T15:00:00+05:30
```

Outer capture schema:

```json
{
  "schemaVersion": "ADAPTIVE_UPSTOX_OFFLINE_READ_ONLY_V1",
  "origin": "OPERATOR_SUPPLIED_UNVERIFIED",
  "accountScopeId": "SYNTHETIC_ONLY",
  "positions": {
    "method": "GET",
    "path": "/v2/portfolio/short-term-positions",
    "unfiltered": true,
    "httpStatus": 200,
    "capturedAt": "2026-11-17T09:29:00Z",
    "response": {"status": "success", "data": []}
  },
  "orders": {
    "method": "GET",
    "path": "/v2/order/retrieve-all",
    "unfiltered": true,
    "httpStatus": 200,
    "capturedAt": "2026-11-17T09:29:10Z",
    "response": {"status": "success", "data": []}
  },
  "gtts": {
    "method": "GET",
    "path": "/v3/order/gtt",
    "unfiltered": true,
    "httpStatus": 200,
    "capturedAt": "2026-11-17T09:29:20Z",
    "response": {"status": "success", "data": []}
  }
}
```

The example is **only a schema illustration**, not evidence of a
complete real broker capture. Expected position uses Phase25
`ReadOnlyExpectedPosition` (exact account scope, FO instrument key,
expiry, lotSize and whole-lot remaining quantity) supplied from a
separately verified inventory. Current Upstox positions payload does
**not itself attest** that expiry or option lot size: the bridge uses
expected metadata as a placeholder and explicitly leaves
`brokerAuthenticated=false`.

The CLI's zero exit code means `STRUCTURAL_REVIEW_ONLY` based on
self-asserted input and nothing else. Blocking/invalid returns 2.

## Independent signoff still required

All output statuses set:

```text
executionAuthorized=false
productionSafe=false
brokerAuthenticated=false
brokerStopInstalled=false
nativeOrderInstruction=null
```

No actual broker read, genuine stop installation, overnight gap safety,
historical option premium edge or independent market data/calendar
provenance is demonstrated. For any real product, obtain independent
operator approval, broker-authoritative full order history (including
executed/cancelled), order-by-ID/GTT reconciliation and guaranteed
account-scoped capture rights, rehearsed partial-fill/restart behavior,
licensed option L1 research, real exchange session rules and review
of original Phase1–25 stacked Draft PRs. Release blockers #17–#22
remain open.

**No new sell, stop, GTT, expiry liquidation, native NRML order,
paper NRML integration or 15:15 positional square-off. The existing
EMA23/50 MIS runner is untouched.**
