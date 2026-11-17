# Adaptive Swing v2 Phase31 — F&O historical fill coverage and NRML manual session/expiry handoff

**Draft/unmerged research-only layer. No real Upstox GET in development/CI, no order execution, no GTT writes and no automatic positional exit.**

## Important documentation correction discovered 18 November 2026

Upstox offers **two different kinds of trade evidence**, which must not be conflated:

1. The ordinary `GET /v2/order/retrieve-all`, `GET /v2/order/history` and `GET /v2/order/trades/get-trades-for-day` are trading-day/order scoped. Specifically, the order history documentation says user orders remain available **for one trading day**. Phase26–30 correctly reject these feeds as proofs of 1W/2W/4W/8W native stop survival.
2. The separate **`GET /v2/charges/historical-trades`** API supports **historical FO executed trades** with `segment=FO`, date range, page number and page size, for the last **three financial years** per Upstox documentation. Its FO example has `exchange=NFO`, `segment=FO`, `option_type=CE`, `symbol`, `strike_price`, `expiry`, `trade_id`, `trade_date`, `quantity`, `price` and `transaction_type`. Importantly **`instrument_token` can be an empty string** in the example, and there is no `order_id` in that FO history row. These historical fills can help explain quantity changes across sessions but **cannot independently establish native stop installation, cancel/replace continuity, exchange order ACK, or protection across overnight gaps**.
3. Upstox `GET /v3/order/gtt` does not retrieve completed GTT orders, and GTT `SCHEDULED` is not exchange/native stop acknowledgment.

Official source links:
- [Historical FO trades — date range & pagination](https://upstox.com/developer/api-documentation/get-historical-trades/)
- [Ordinary order history — one trading day](https://upstox.com/developer/api-documentation/get-order-history/)
- [Active GTT API — no completed GTTs](https://upstox.com/developer/api-documentation/get-gtt-order-details/)
- [Analytics Token, static-IP rule](https://upstox.com/developer/api-documentation/analytics-token/)
- [Registered static-IP GET — app/access restrictions](https://upstox.com/developer/api-documentation/get-app-static-ips/)

Do not call the historical F&O executed-trade endpoint a complete historical orderbook. Do not assume a blank `instrument_token` makes `NIFTY`, `BANKNIFTY` or `SENSEX` uniquely matched. The offline checker requires a separately supplied exact exchange, symbol, CE/PE, strike, effective expiry, expected instrument key and option lot. These metadata are operator **assertions** until independently verified.

## New code

### A. Strict **offline** historical F&O pagination and fill audit

`src/server/engine/ema15m/adaptiveUpstoxPhase31HistoricalFoFills.ts`

`auditOfflineHistoricalFoFills(input)` accepts a *complete operator-supplied* array of JSON 200/GET pages with precisely matching `segment=FO`, `start_date`, `end_date`, `page_number` and `page_size`. Every page must:

- have `status:success`, `data[]`, `meta_data.page`; matching total records/pages/page size and an expected number of rows on each page;
- appear in ascending, gap-free 1-based order (no missing, repeated, skipped, stale or future pages);
- contain FO rows with valid trade IDs, dates inside the range, BUY/SELL quantities, CE/PE, exchange, symbol, strike and expiry; duplicate `trade_id` per exchange across pages is invalid;
- include **all FO contracts returned by the broker**, not just the selected symbol. The selected option is matched by the complete descriptive tuple; other contracts are ignored *only for the selected-position delta*, not for completeness;
- compare selected BUY minus SELL quantity with separately supplied opening and closing net quantities. An empty `instrument_token` is counted but cannot be considered account/contract-key authentication. A conflicting nonempty instrument key and unusual non-lot multiples are blockers;
- explicitly block attempts to assert *overnight protective stop survival* from multi-date fill history, even if the fills exactly reconcile a position;
- produce **redacted** counts, reason codes and a recomputable SHA256 JSON chain (NOT a broker signature, authenticated original-body witness, source-IP proof, or exchange attestation).

Statuses: `INVALID_EVIDENCE`, `BLOCKED_OR_UNKNOWN`, `HISTORICAL_FILLS_RECONCILED_UNVERIFIED`. The last one is allowed only for a same-date *structural* quantity match with no unresolved source conditions; it is **not** a broker-authenticated success.

### B. NRML session/expiry manual escalation playbook

`src/server/engine/ema15m/adaptiveUpstoxPhase31ManualHandoff.ts`

`assessPhase31ManualNrmlHandoff(...)` combines a Phase30 shadow-review report and Phase31 fill report with operator-asserted session state, effective-dated option expiry, current evaluation time and a locked review buffer. It **never** sends a broker order or native instruction.

Triggers an explicit **HUMAN_ESCALATION_REQUIRED** with action codes if:

- session is CLOSED, PREOPEN or UNKNOWN (closed NRML long also triggers overnight-gap review);
- exchange-effective expiry is asserted to disagree with expected expiry, or is within the locked expiry review buffer (including expired contracts);
- shadow source or native-stop flags attempt to upgrade trust; Phase30 signed/local books remain unverified;
- full FO pagination is absent or fill/position quantities do not reconcile;
- F&O historical pages span multiple India dates and cannot prove native order continuity.

Outputs are **only** manual review instructions: obtain independently authenticated historical order/change logs, full completed-GTT evidence, effective-dated exchange cutoff, account/static-IP verification, human risk decision and freeze on **new NRML entries** until reviewed. `auto1515PositionalExit=false`, `nativeOrderInstruction=null` always.

The static old EMA23/50 MIS strategy and its 15:15 exit are **unchanged**. No positional NRML auto-liquidation at 15:15 or expiry is added.

## Operator-private offline usage

This phase does not use a token or send any GET request. For authorized, private historical FO records obtained separately through an approved method, store complete unfiltered pages in an owner-private 0700 directory and a 0600 JSON file. Never share raw UCC, order IDs, trade IDs, history rows or API tokens via a public GitHub PR or chat.

Example synthetic wrapper (illustration only, no real broker proof):

```json
{
  "schemaVersion": "ADAPTIVE_UPSTOX_HISTORICAL_FO_V1",
  "origin": "OPERATOR_SUPPLIED_UNVERIFIED",
  "expected": {
    "accountScopeId": "SYNTHETIC_ONLY",
    "instrumentKey": "NSE_FO|SYNTHETIC_ONLY",
    "productType": "NRML",
    "expiry": "2026-12-24",
    "lotSize": 65,
    "expectedNetLongQuantity": 130
  },
  "pinnedContract": {
    "exchange": "NFO",
    "symbol": "SYNTHETIC",
    "optionType": "CE",
    "strikePrice": 24000,
    "expiry": "2026-12-24"
  },
  "startDate": "2026-11-16",
  "endDate": "2026-11-16",
  "asOf": "2026-11-17T10:00:00Z",
  "maxCaptureAgeMinutes": 5,
  "openingNetLongQuantity": 130,
  "closingNetLongQuantity": 130,
  "pages": [
    {
      "method": "GET",
      "path": "/v2/charges/historical-trades",
      "query": {
        "segment": "FO",
        "start_date": "2026-11-16",
        "end_date": "2026-11-16",
        "page_number": 1,
        "page_size": 100
      },
      "httpStatus": 200,
      "capturedAt": "2026-11-17T09:59:40Z",
      "response": {
        "status": "success",
        "data": [],
        "meta_data": {
          "page": {
            "page_number": 1,
            "page_size": 100,
            "total_records": 0,
            "total_pages": 1
          }
        }
      }
    }
  ]
}
```

CLI:

```bash
npx tsx scripts/audit-adaptive-upstox-historical-fo.ts \
  /private/historical-fo-complete-pages-0600.json

# Optional private operator-only session input (contains a Phase30
# shadow report and session/expiry policy; still unverified):
npx tsx scripts/audit-adaptive-upstox-historical-fo.ts \
  /private/historical-fo-complete-pages-0600.json \
  --handoff /private/manual-session-handoff-0600.json
```

Inputs are **not** authenticated by the CLI. The CLI requires private owner-controlled files; prints only status, reasons, aggregate counts and manual action codes, never raw pages or account/trade identifiers. Nonzero exit means an unresolved blocker, including a cross-session date range. Zero exit is **research consistency only**.

## Explicit release/safety blockers — #17–#22 remain OPEN

No real historical FO data, broker profile, account ownership, source egress/static-IP, token, or signed broker-origin capture was independently acquired in this development. All network records in tests are synthetic. No independently licensed original index option L1 dataset or untouched walk-forward OOS performance validation was obtained.

Historical FO executions may explain net positions **but not order ACK/cancel/replacement/fill linkage**, and cannot guarantee stop protection or execution price through overnight gaps. Local signed/enciphered operator records do not resolve this. Exchange effective-dated calendars and cutoff times still require official provenance; the playbook does not invent them. A proper live system would require separate security, operator/regulatory and risk signoff, broker-authoritative session-spanning lifecycle audit and a fully separated NRML order lifecycle. Until then, existing Phase1–30 Draft PRs are stacked **unmerged**, not active in production.

Every Phase31 output permanently sets:

```text
executionAuthorized=false
productionSafe=false
brokerAuthenticated=false
brokerStopInstalled=false
protectedOvernight=false
nativeOrderInstruction=null
```

**Phase32 candidate:** strictly bounded, authorized GET-only historical FO page collector with security review, independently signed capture/archive provenance, and independent broker order-history/contract note cross-validation. Only a separately approved operator can use real account credentials; no actual live orders should be exposed.
