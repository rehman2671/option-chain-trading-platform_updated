# Adaptive Swing v2 — Phase32: operator-authorized bounded historical F&O GET collector

**Draft / research-only / unmerged. No live Upstox access performed during development, no order execution.**

## What changed

Phase31 established that Upstox has a historical **executed-trade** endpoint distinct from the current-day order history. Phase32 adds a separate manually invoked, **GET-only** collector for those historical trades and a fail-closed private encrypted archive. This capability is not wired to the trading engine, HTTP routes, background workers, or scheduled jobs.

Official provider documents verified on 18 November 2026:

- [Historical trade history](https://upstox.com/developer/api-documentation/get-historical-trades/): `GET https://api.upstox.com/v2/charges/historical-trades`, with `segment=FO`, `start_date`, `end_date`, `page_number`, `page_size`. Date range is limited by Upstox to the last **three financial years**. The published sample response uses `meta_data.page.page_number`, `page_size`, `total_records`, `total_pages`. (The *description table* spells this `metadata.page`, but sample JSON uses `meta_data`; Phase31 and Phase32 use `meta_data` and reject unexpected shapes rather than assuming success.)
- [Analytics Token](https://upstox.com/developer/api-documentation/analytics-token/): read-only token; cannot place/modify/cancel orders; account-specific User, Orders, Portfolio, Trade P&L APIs need approved whitelisted static IP. A token string or `--confirm-whitelisted-static-ip` flag does **not** independently establish IP attestation, account ownership or authorized source.
- [Order history](https://upstox.com/developer/api-documentation/get-order-history/): ordinary order history remains available for one trading day. This historical **trade execution** endpoint does **not** return the complete native stop ACK, order cancellation/change lifecycle or guaranteed stop fill.
- [GTT details](https://upstox.com/developer/api-documentation/get-gtt-order-details/): active GTT results do not provide complete historical GTT outcomes.

## Code

`src/server/engine/ema15m/adaptiveUpstoxPhase32HistoricalFoCollector.ts`

- Explicit `collectExplicitHistoricalFoGetEvidence(request, profileTransport, foTransport)`, with separate fixed native GET transports, no other network service.
- **First GET** is the fixed `https://api.upstox.com/v2/user/profile`; it checks profile's `user_id` against independently supplied expected UCC, `broker=UPSTOX`, `is_active=true` and delivery `D` product. Any mismatch fails **before** historical F&O GETs.
- **Only F&O GET path**: `https://api.upstox.com/v2/charges/historical-trades`, with exactly ordered canonical query keys `segment=FO&start_date=...&end_date=...&page_number=...&page_size=...`. No arbitrary extra query, symbol filters, host, custom headers or non-GET method.
- **Deliberately tighter than provider limits**: one requested date window maximum **31 calendar days**, earliest start age <= **1,100 days**, page_size **1–100**, maximum **1–16 pages**, max **90 KB per GET body**, and timeout **500–15,000 ms**. This is a bounded shadow-review collector, not an exhaustive 3-financial-year downloader. It refuses datasets beyond the cap rather than calling them complete.
- No redirects, no retries, no HTTP cache, always Accept JSON, bounded response stream, strict expected final URL/content type/HTTP status. No bearer token in query, output, error messages, logs or archives.
- Every returned page must contain the same `total_records`, `total_pages`, `page_size` metadata and the exact expected row count. Duplicate/missing/unmappable FO trades and same-day/multi-day stop risk are rechecked by the existing **Phase31** audit. A **Phase31 invalid** result discards the partial output; a **Phase31 blocked** result can be privately retained for manual incident review but **CLI exits nonzero**.
- The collector returns original **decoded HTTP response body bytes** (not original network/TLS frames), profile body and complete declared pages as a **private in-memory archive**, plus a **redacted** report with page counts, hash chain and reason codes. Even a recorded complete GET is an **operator-approved transport observation only**, not broker-signed authentication.

`src/server/engine/ema15m/adaptiveUpstoxPhase32HistoricalFoArchive.ts`

- Independently re-parses the private profile bytes, verifies profile UCC vs expected, compares **exact raw page JSON bytes** with declared Phase31 pages, re-computes SHA-256 per-response chain, reruns Phase31 strict page audit and checks result/status/row counts before storing.
- Uses **AES-256-GCM**, fresh random nonce, AAD domain binding, and 32-byte key supplied **outside** application/source. Creates randomized owner-controlled 0700 child, exclusive `0600` file with fsync; no plaintext write or fallback. Wrong key, altered tag/bytes, missing/modified pages fail closed. **Not** WORM, HSM/KMS, broker signature, distributed/independently attested timestamp or backup policy.

`scripts/capture-adaptive-upstox-historical-fo-get.ts`

- **Operator-only, manual** CLI requiring all of: `--approve-get-only`, `--confirm-whitelisted-static-ip`, owner-private 0600 request metadata file under owner 0700 directory, pre-existing 0700 output directory, `UPSTOX_ANALYTICS_READONLY_TOKEN` plus `ADAPTIVE_V2_EVIDENCE_AES256_KEY_HEX` already securely provisioned by the operator.
- No project credentials or real account were provided to development. Never paste them in GitHub issues, source, tests, chats, shell history or CI logs. **Nothing gets collected automatically** after merge or PR CI.
- CLI success means only: locally captured GET pages + encrypted write + internally matching Phase31 **same-date** fill calculation. Never native stop installation/overnight protection or trading authorization.

## Private metadata example (synthetic)

Create the request as a **0600 JSON file** in an already owner-private directory. Do **not** put token or AES key into JSON. Expected UCC must be an independently approved value, not copied blindly from an operator-provided profile.

```json
{
  "expected": {
    "accountScopeId": "SYNTHETIC_UCC_ONLY",
    "instrumentKey": "NSE_FO|SYNTHETIC_OPTION_ONLY",
    "productType": "NRML",
    "expiry": "2026-12-24",
    "lotSize": 65,
    "expectedNetLongQuantity": 130
  },
  "pinnedContract": {
    "exchange": "NFO",
    "symbol": "NIFTY",
    "optionType": "CE",
    "strikePrice": 24000,
    "expiry": "2026-12-24"
  },
  "openingNetLongQuantity": 130,
  "closingNetLongQuantity": 130,
  "startDate": "2026-11-16",
  "endDate": "2026-11-16",
  "pageSize": 100,
  "maximumPages": 16,
  "timeoutMs": 7500,
  "maxCaptureAgeMinutes": 5,
  "expectedBrokerUserId": "SYNTHETIC_UCC_ONLY"
}
```

To run **only on a separately authorized, properly whitelisted host**, with approved external token/key provisioning:

```bash
# Never put actual values into the command line or a public file:
# UPSTOX_ANALYTICS_READONLY_TOKEN and
# ADAPTIVE_V2_EVIDENCE_AES256_KEY_HEX are already provisioned privately.

npx tsx scripts/capture-adaptive-upstox-historical-fo-get.ts \
  --approve-get-only \
  --confirm-whitelisted-static-ip \
  --request /private/fo-history-request-0600.json \
  --private-parent /private/approved-history-capture-0700
```

Output reports are sanitized; `privateArchive` contains full raw broker profile/trades and must never be printed or uploaded. Complete or blocked evidence is **encrypted** locally. If archive encryption/storage fails, CLI exits nonzero and does not claim success.

## Contract notes, provenance and additional blockers

Broker contract notes are useful independent corroboration **only with separately sourced, verified, original documents**, signed/issued under the account, with matching order/trade IDs, contract, fill price, quantity, fee and time. Phase32 does **NOT** pretend to have these documents or invent a parser for a non-existent standardized Upstox contract-note API. Contract-note cross-check remains an **explicit external review prerequisite** to use real trading evidence in risk decisions. A downloaded JSON page, an operator-asserted UCC, locally computed hashes or AES archive cannot establish that Upstox (or the exchange) emitted the data.

Even a perfect historical FO trade audit **cannot establish a native NRML stop persisted overnight**. Orders may have been cancelled/replaced, a stop can fail to execute at the intended price, and ordinary current-day order history does not reconstruct 1–8 weeks of native order lifecycle. Phase27, Phase30 and Phase31 blockers remain. Phase31 manual expiry/session playbook must retain all human-review requirements.

**Safety invariants:**

```text
executionAuthorized=false
productionSafe=false
brokerAuthenticated=false
brokerStopInstalled=false
protectedOvernight=false
nativeOrderInstruction=null
```

Existing EMA23/EMA50 intraday MIS 15:15 automatic square-off stays untouched; NRML positional 1W/2W/4W/8W must **not** inherit 15:15 automatic exit. No live/paper NRML execution path, automatic stop repair or expiry liquidation is added.

Outstanding independent release issues **#17–#22 stay OPEN**. All phase PRs are stacked Draft/unmerged; CI is synthetic code verification, not profitable or production-safe execution.

**Next phase candidate:** independently authenticated issuance/contract-note original byte witness and strict matching of FO executions to native order ACK/change history; external security and account-owner sign-off before any deployment or live activity.
