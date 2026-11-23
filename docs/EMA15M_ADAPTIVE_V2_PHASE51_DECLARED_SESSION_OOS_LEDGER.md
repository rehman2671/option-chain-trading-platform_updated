# Adaptive Swing v2 — Phase 51 independent declared-session OOS ledger

**Draft research only, stacked on Phase50. No authentic NSE/BSE exchange calendar, no original vendor licensed L1, no real Upstox broker-native order ACK/GTT evidence, and no permitted live NRML execution.**

## Risk that Phase50 cannot disprove alone

Phase50 counts *all dates in the supplied historical file* and rejects improper L1 receipt chronology. If an operator simply omits a volatile/loss-making/no-quote exchange trading date **before constructing the historical file**, internal multiday counts may look complete. Phase51 introduces a separately operator-pinned **full expected session calendar**, including no-trade days. The calendar is NOT independently authenticated: this prevents accidental or visibly divergent source exclusions but cannot stop two coordinated fraudulent archives or certify the official exchange calendar.

## New offline checks

`auditPhase51DeclaredOosSessionCoverage(input, pins)`:

1. Independently SHA256-pin the complete operator asserted session ledger, complete Phase50 original data and original Phase50 independent pin manifest. Use a **date-only fold|session** manifest from the ledger; it does NOT depend on a source decision existing. This preserves missing days in the expected OOS denominator even if the historical dataset is rehashed after deleting a losing test day.
2. Each ledger row contains exactly one ordered `sessionDate` and source `openAt`/`closeAt` times with an operator source record ID. All dates/timestamps must be parseable with the same exchange-local IST day; no duplicate/overlapping declared dates, invalid days, nonsensical intervals or silent fold session overlap. Session times are supplied by the operator; **not assumed from generic NSE hours**, and not exchange-verified.
3. Reconcile every ledger date with the historical `provenance.expectedSessions` and original decision date. Missing/extra dates or a provenance list shortened to hide unpriced days produce `INCOMPLETE_EVIDENCE`. Preserve per-fold declared OOS days, actual decisions and missing decisions.
4. At each original OOS decision, check the decision occurred inside the declared session; contract master capture and original option chain snapshots occurred **within that same declared session and no later than decision**. Empty original contract/chain universe stays an evidence gap and is not silently counted as a no-signal winning date.
5. Check whether the declared original contract universe has any source L1 BID/ASK and availability within that decision's remaining declared session. If not, return incomplete coverage for that day. **This does not prove availability for the selected contract**; Phase50 is always reaudited separately to check the exact selected option, source availability clocks, missing original contract L1 and full arm-horizon denominator.
6. Reexecute Phase50 itself instead of accepting a supplied PASS report. Require `DESCRIPTIVE_MULTIFOLD_SOURCE_COVERAGE_ONLY` and exactly 12 arm-horizon attempts for each declared OOS date (3 strategy arms × 1W/2W/4W/8W). Phase50 and Phase51 report only aggregate counts with overlapping arm references not treated as independent trades. No OOS PnL or profitability is fabricated.
7. The strongest possible local result, `DESCRIPTIVE_DECLARED_SESSION_COVERAGE_ONLY`, means **only** that an operator-supplied declared-calendar/OOS source is internally consistent. It is not issuer-authenticated trading-day completeness, genuine licensed source data, a marketable strike/expiry or statistically significant OOS performance.

## New regression tests

`src/quant/tests/ema15m_adaptive_phase51_declared_session_oos_ledger.test.ts` builds two different OOS synthetic test dates from the Phase48 historical entry-first fixture and 24 decision-arm-horizon attempts. Negative tests cover:

- Deleted historical test date **despite newly rehashed Phase50 source** remains in the independently declared date-only OOS denominator.
- Decision outside declared hours, contract master captured before the session and stale original option-chain snapshot from a different session.
- Full empty point-in-time listed-option/chain universe cannot become a clean no-trade result.
- A session with no original available L1 for its declared candidate universe.
- Missing original source `availableAt` rejected through the nested Phase50 audit.
- Tampered calendar SHA, invalid date with locally recomputed matching hashes, fewer folds than Phase50 declared threshold, and reduced OOS count in pins.
- Every report remains nontrading and never prints original option instrument identifiers.

CI green verifies fabricated-fixture software invariants only. It does not measure live-market performance.

## Manual owner-private offline CLI

Inputs must exist as private owner `0600` JSON files in an owner `0700` absolute directory, without symlinks and with operator-enforced no-egress isolation:

```bash
npx tsx scripts/audit-adaptive-phase51-oos-sessions.ts \
  --approve-isolated-offline-review \
  --private-original-oos-session-ledger /private/phase51-source-plus-session-ledger.json \
  --independent-prespecified-session-ledger-pins /private/phase51-independent-pins.json
```

First JSON: `Phase51Input` with original historical Phase50 input/pins and separately operator-declared sessions (schema `ADAPTIVE_PHASE51_SESSION_LEDGER_V1`). Second JSON: `Phase51IndependentPins` including canonical hashes of the calendar, Phase50 input/pins and date-only declared OOS manifest and original sample expectations, pinned *before* source review. The CLI logs redacted counts and denial reasons; no raw price/depth/greek, instrument key, account, private filename or original source record IDs are printed.

## Hard blockers

- Appropriate licensing of original historical NSE/BSE option top-of-book, depth, and *actual event-to-strategy availability* timestamps; verified calendar holidays, special sessions, exchange segment hours, corporate/expiry amendments and delisted contract master.
- A sufficiently large unaltered unseen chronological OOS universe with every no-trade/missing and actual original tradable spread/depth/IV/theta/fees/gap stress, not self-selected good examples.
- Separately proven broker native stop ACK/cancel/modify, GTT-trigger child order and overnight liquidity continuity; long option can lose the **entire premium debit** if premium collapses before a fill.
- No release approval for live NRML, broker order/GTT placement, production-safe or profitable trading. `executionAuthorized=false`, `productionSafe=false`, `nativeOrderInstruction=null`, and all certification/profit/overnight protection flags remain `false`.

All prior research PRs stay **Draft/unmerged**; release blockers #17–#22, especially #20, remain OPEN. Intraday EMA23/50 **MIS 15:15 square-off unchanged**. Positional NRML **1W/2W/4W/8W is NOT forced to exit at 15:15**, and no new live NRML automation is introduced.

External background on market-data product types and licensing, **not a project entitlement certificate**: [NSE real time data](https://www.nseindia.com/static/market-data/real-time-data-subscription), [NSE EOD historical data](https://www.nseindia.com/static/market-data/eod-historical-data-subscription), [NSE data policy](https://www.nseindia.com/static/market-data/nse-data-policy).
