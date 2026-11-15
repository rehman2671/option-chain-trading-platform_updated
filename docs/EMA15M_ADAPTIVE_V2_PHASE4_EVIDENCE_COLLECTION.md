# EMA15M Adaptive Swing v2 — Phase 4: broker evidence capture and coverage audit

**RESEARCH ONLY / NO AUTO-TRADING / NO HISTORICAL PERFORMANCE CLAIM.**
This branch is stacked on the Phase 3 draft `research/adaptive-v2-historical-comparison`.
It does **not** change MIS, 15:15 square-off, paper execution, live execution, position accounting, or broker order authorization.

## Why this is needed

The live Upstox `GET /v2/option/contract` API returns **currently listed** contracts and `GET /v2/option/chain` returns **current** option L1 bid/ask, quantities, volume, OI and Greeks for a listed expiry. The option-chain REST payload does **not** provide a verified exchange quote observation timestamp. Local HTTP response receipt time is **not** an exchange event time. Historical OHLC candle endpoints (including Upstox Plus expired instruments) do **not** substitute for historical bid/ask or Greeks.

References:
- https://upstox.com/developer/api-documentation/get-option-contracts/
- https://upstox.com/developer/api-documentation/get-pc-option-chain/
- https://upstox.com/developer/api-documentation/v3/get-market-data-feed/
- https://upstox.com/developer/api-documentation/get-expired-historical-candle-data/

## Explicit manual snapshot collection

Provide an authenticated Upstox token securely to the local **process environment**; do not paste it into source, command-line flags, terminal history, issue comments, or logs. No token is persisted in capture JSON.

```bash
# Run manually only, with UPSTOX_ACCESS_TOKEN already set securely in environment
npx tsx scripts/capture-adaptive-evidence.ts NIFTY
npx tsx scripts/capture-adaptive-evidence.ts BANKNIFTY
npx tsx scripts/capture-adaptive-evidence.ts SENSEX
```

- One invocation issues one authenticated, read-only, no-fallback contract GET, then up to the actual listed expiry-bucket chain GETs (CE and PE), never any broker order, funds, or position call.
- A failed contract lookup **aborts** the invocation. Missing/failed chain expiry is recorded as UNAVAILABLE or INVALID_RESPONSE. The archive retains invalid/illiquid quote fields as null or the actual values; it does not invent favorable prices.
- Missing 1W/2W/4W/8W broker-listed expiries remain null. No hardcoded expiry or strike, no invented Greeks, no practice-mode substitution.
- The collector allowlists market fields, contract keys, and catalog details; it discards unrelated JSON. The archived `synthetic=false` only means the normal CLI used the actual HTTP transport. Tests with injected transport are correctly marked `synthetic=true`/`MOCK_HTTP_TEST`.
- Output is written as a **new** `research-data/adaptive-v2/INSTRUMENT-<timestamp>-<sha>.json` file with restrictive filesystem permissions; existing files aren't overwritten. Directory is git-ignored; review data entitlement, storage access, retention and backups before long-term collection.
- The file includes a SHA-256 content fingerprint. **Hash verification detects later accidental modification only; it does not prove API authenticity, exchange timestamps, data licensing or truthful market pricing.**
- `exchangeTimeVerified=false`, `marketSessionVerified=false`, `historicalBacktestAuthorized=false` and `executionAuthorized=false` are hard-coded for these receipt-only archives.

To verify an existing local archive (use its basename printed by capture):

```bash
npx tsx scripts/capture-adaptive-evidence.ts --verify NIFTY-<timestamp>-<sha>.json
```

## Declared-calendar coverage audit

Supply a real, independent exchange trading-session calendar. **Do not generate dates just from saved successful captures**. A calendar file has this shape (sample schema, not an asserted exchange calendar):

```json
{
  "calendarSource": "DOCUMENTED_EXCHANGE_CALENDAR_SOURCE",
  "expectedSessionDates": ["2026-11-16", "2026-11-17"],
  "minimumCapturesPerSession": 5
}
```

```bash
npx tsx scripts/audit-adaptive-evidence.ts NIFTY ./exchange-sessions.json
```

This offline audit flags missing sessions, insufficient intraday observations, duplicate timestamps, corrupt hashes, test-only records and missing expiry-bucket coverage. The strongest outcome is `CAPTURED_BUT_UNVERIFIED_EVENT_TIME`, and **`historicalComparisonAuthorized` is always false** for REST receipt-only archives. Calendar metadata is caller-supplied and is not authenticated by the CLI.

## Real historical data still required

A complete legitimate historical comparison needs **point-in-time** evidence from each evaluation date, not today's instrument master:

1. Genuine, start-timestamped, closed 15-minute underlying index OHLC and real trading-session calendars (holiday/special sessions).
2. Original historical option **L1 bid/ask, bid/ask depth, Greeks, volume, OI and contract catalog** at each decision time; timestamp provenance must identify an exchange/vendor **event time** and clearly state latency and licensing.
3. Independent post-entry/post-hold historical option L1 bid/ask/depth (not LTP or OHLC proxy) to model exits, plus slippage, taxes, fees and impact.
4. Session completeness and survivorship audits; persist and report missing data without imputation; fixed train/test embargo and untouched OOS windows.
5. Scenario sensitivity for spread widening, low OI, gap openings, expiry risks and actual holding-period distribution.

Phase 3 `compareAdaptiveHistorical()` now rejects a **non-synthetic** input unless `provenance.quoteTimestampQuality === 'VERIFIED_EVENT_TIME'`. This is a *declared provenance gate* and should be independently verified by a research reviewer; the claim alone does not guarantee authenticity.

Expired-instrument OHLC APIs, if authorized by the account plan, can support separate path diagnostics but **cannot be converted into fabricated historical L1 observations**. Upstox V3 WebSocket full depth offers a different future collection path for better time alignment, but would require an independent timestamp/reconnect/sequence quality design and respecting subscription limits before being used as a historical replay archive.

## Operational status

- Phase 4 collectors are **opt-in one-shot CLI utilities**, not schedules, worker jobs or web endpoints.
- No real Upstox calls are made by CI. Mock fixtures are not real trading results.
- No exchange data has been captured or backtested by implementing this code alone.
- NRML positional execution, overnight native protective orders, adaptive trailing broker instructions and expiry auto-exits are **not enabled**.
- A successful CI run verifies software checks, **not** trading strategy profitability or production safety.
