# Adaptive Swing v2 — Phase 18 versioned instrument / expiry-class trading-session audit

**STRICTLY OFFLINE / RESEARCH ONLY. No live/paper NRML order path, no broker stop/GTT, no MIS/15:15 change, no automatic 1W/2W/4W/8W recommendation.**

## Why the extra market-session source matters

Phase 15's separate exchange calendar has one open/close window per day. This is suitable for detecting omitted entire market sessions and public holidays, but **not sufficient for trading different instruments whose effective market hours differ on the same day**. A broad exchange calendar can show a trading session continuing after the underlying index's normal observation period, while an expiring option may stop trading before a non-expiring option. Interpreting the broad day-window as valid for everything may invent exits, overstate liquidity, extend 15m candles beyond their source observation and conceal actual expiry-day sell restrictions.

### Concrete primary-source example — FUTURE-EFFECTIVE, not yet historical

The NSE's *CAS 2.0 Changes in Equity Derivatives* FAQ version 1, published **6 November 2026**, says that changes become applicable **7 December 2026**. It describes index derivatives' **normal market** closing at **15:45 IST**, except **index derivative contracts actually expiring that trading day**, which close at **15:30 IST**. The FAQ also differentiates the index's real-time/indicative underlying values during the closing auction from normal continuous trading, and excludes normal index-option L1 trades from futures pre-open sessions. The FAQ directs members to the original circulars and subsequent updates; it is not the ultimate issuer-certified archive.

Source: [NSE CAS 2.0 official FAQ, 6 Nov 2026, page 5](https://nsearchives.nseindia.com/web/mediaattachment/2026-11/FAQs_for_CM_and_FO_FOR_CAS_2.0_20261109152618.pdf). Circular ref: `NSE/FAOP/77356`, dated 6 November 2026. The current project date is 17 November 2026: **do NOT apply the new rules before 7 December 2026** and do not claim their future effective implementation is already empirically observed. NSE primary-source rule and amended contract files must be authenticated independently at replay time.

BSE SENSEX sessions and historical expiry/cutoff revisions require **their own separate BSE source records**, not NSE rule templates.

## New required phase 18 source

An `ADAPTIVE_VERSIONED_INSTRUMENT_SESSIONS_V1` JSON document is linked to the exact **Phase 15 separate-calendar-manifest SHA256**, original calendar-document SHA256, source exchange and index, and the same Phase 16/17 signed study protocol ID. It has:

- **Effective-dated `versions[]`** with unique IDs, original cited exchange-circular references, original publication clocks, and inclusive effective-from/effective-through dates, with strictly ordered nonoverlapping coverage. No version can be retrospectively applied before its declared effective date; a version published after its claimed effective date is blocked.
- **Exactly one `tradingDays[]` row for EVERY day Phase 15 marks TRADING**, including source-declared special trading sessions, not just sessions where the vendor observed a decision. Each row references the applicable rule version and a separate source record ID.
- For every trading date, **three independently declared ordered time-window arrays**: `underlyingIndexWindows` (where a closed 15m candle can START and END, and where original index decisions occur), `nonExpiringOptionWindows` (eligible original CE/PE L1), and `expiringOptionWindows` (only contracts whose original listed `expiry === sessionDate`). Multiple disjoint windows are supported, never overlapping.
- Each window must stay inside the independently supplied Phase 15 **BROAD** day-level envelope, follow the original Asia/Kolkata session date, and have a valid original source clock. A single broad calendar close timestamp is NOT itself a contract quote cutoff.
- The input byte digest is pinned as the **seventh** raw policy/source artifact in the externally SHA-pinned Phase 17 `ADAPTIVE_PRESPECIFIED_RESEARCH_POLICY_LOCK_V1`, under `policyFileSha256.instrumentSessionSchedule`. Hash pinning is integrity only; it does not authenticate the exchange issuer, source rule/version, independent reviewer, original feed clocks, or licensed entitlement.

This is an explicit source-backed calendar ledger: the code **does not hardcode** a daily 15:30/15:45 cutoff or a 7 December launch date into all Indian instruments. The official announced example can be represented *only if* the source rules are actually applicable on the original replay date and the instrument's listing/contract metadata agrees.

## What gets blocked

For each original vendor session and source-available L1:

- Underlying CLOSED index 15-minute candles **must finish** inside an index observation window; a candle at 15:30–15:45 cannot be accepted just because options are still trading at 15:45.
- Original index-regime decision clocks must lie inside an index observation window; a late option quote never creates a previously nonexistent index decision.
- Original dated contract catalogs and chain snapshots are assigned to the window appropriate for their listed expiry. A snapshot at a time a listed contract class is no longer tradable is flagged.
- Each original option L1 eventAt **and** original strategy availableAt must be inside the appropriate window for the source event/available date and the contract's original expiry. An option print after its own expiry is flagged even if the broad exchange is still open.
- Unmapped instrument keys, changed instrument-key expiries, missing trading-day rows, overlapping date-effective circulars, a source published after its effective day, swapped NSE/BSE sources, mismatched original calendar-document hashes, unbound raw manifest bytes and overlapping/out-of-envelope windows are rejected or marked incomplete.
- All Phase 8–17 OOS, spread, depth, matched-hysteresis, stress and time/censor checks remain mandatory and **unchanged**. Missing or invalid session evidence causes the Phase 17 full-readiness result to be `REJECTED` or `BLOCKED_INCOMPLETE_EVIDENCE`, not a positive result.

### Status values

`REJECTED`: missing/ill-formed source or circular-version manifest, mismatched bound hashes, wrongly effective-dated version, omitted source day, overlapping windows or impossible source/event dates.

`INCOMPLETE_EVIDENCE`: instrument-index candles, original decisions, contract chain/catalog or L1 quote clocks contradict an otherwise well-formed versioned instrument schedule.

`SEGMENT_WINDOWS_CONSISTENT_AUTHENTICITY_UNVERIFIED`: the **supplied** versioned day-by-day rule ledger and the original source observations are consistent. It still proves **no issuer authenticity, original feed licensing, broker execution, or profitability**.

All reports hardcode `executionAuthorized=false`, `productionSafe=false`, `profitabilityProven=false`, `issuerAuthenticated=false`, `originalClockAuthenticated=false`, `brokerFillsAuthenticated=false`, and `brokerProtectionInstalled=false`.

## Full readiness command: one additional mandatory source file

Use all Phase 17 inputs as documented in `docs/EMA15M_ADAPTIVE_V2_PHASE17_COMPLETE_RESEARCH_READINESS.md`, **plus**:

```text
--instrument-session-evidence /secure/phase18-effective-dated-index-and-option-windows.json
```

The full offline CLI passes these exact file bytes into `runAdaptiveFullResearchReadiness`, requires the 7th pinned policy digest, and emits only aggregate evidence statuses and horizon risk. The rest of the Phase 17 six-policy references still apply. No raw licensed L1, original source docs, private keys, reviewer PEMs or actual per-instrument quote stream is printed.

## Synthetic adversarial tests

`src/quant/tests/ema15m_adaptive_versioned_instrument_sessions.test.ts` verifies:
- 15:40 option L1 in a non-expiring contract on a date where the supplied normal index window ended 15:30
- same 15:40 L1 on the **contract's own expiry date** being blocked, with 15:20 quote allowed
- an original index decision or closed 15m index candle beyond its own observed window
- option quotes after expiry, unknown original contract instrument keys, late catalog and chain clocks
- special sessions, omitted day rows, wrong exchange, nonmatching original calendar SHA, overlapping windows, retroactive or overlapping rule versions and raw manifest substitution
- integration with the Phase 17 fail-closed gate and changed 7th policy file checksum

**Important:** All actual clock/calendar rows in unit tests are FABRICATED. The Nov 5 special session is a synthetic fixture, not a claim about NSE's real November trading calendar. No authentic historical index-option bid/ask archive or approved official CAS versioned ledger has been delivered. This engineering closes a timing-validation gap only; it cannot eliminate theta/IV, overnight gap, queue depth, missing winning reversals or unknown real broker protection outcomes.

**Draft/unmerged; real autonomous NRML trading remains disabled.**
