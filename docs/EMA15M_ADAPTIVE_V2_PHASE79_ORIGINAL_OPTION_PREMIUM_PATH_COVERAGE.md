# Adaptive v2 Phase79 — original option L1 premium-path coverage (OFFLINE ONLY)

**DRAFT · Research only · stacked on Phase78 PR #83.** No authenticated market source, raw vendor licence, genuine client receiveAt, real broker buy/sell, GTT/stop writer, automated 1W–8W ranking or positional forced 15:15 exit.

## What this phase adds

Phase75 tests HANDCRAFTED +50/+70 option-premium reversals and hypothetical full-debit loss. Phase79 computes a **descriptive coverage and quote-path census** from a separately supplied original native CSV archive (Phase22 column grammar) and the exact original Phase66 all-listed catalog (including NO_ENTRY). It does not turn synthetic fixtures into historical facts. Missing quotes remain censored; their absence is **never** zero price, a fill, a stop hit, or a profitable trade. Even when an operator labels an archive `UNVERIFIED_EXTERNAL_SOURCE_CANDIDATE`, it remains unverified.

Pure API: `auditPhase79OriginalPremiumPathCoverage(input, pins)`.

- Input: original native 9-column option best BID/ASK/depth CSV bytes; a frozen original 1W/2W/4W/8W CE/PE listing catalog (NO_ENTRY preserved); owner-declared session open/close list; preregistered premium-point threshold and minimum depth/freshness rules. Original raw CSV bytes, list and policy are separately SHA-256 pinned, **not authenticated** by the hash.
- Market marks: compare recorded `eventAt` and claimed `originalAvailableAt` to original `decisionAt`; do not use any quote arriving *after* the decision to price a fictional entry. Best ASK is only an indicative observed decision mark, not an executed option BUY. BID depths are in **underlying option units**, converted to one listed lot via metadata for filtering. Client timing labels are owner-supplied and cannot prove an actual historical strategy-client receipt.
- Reversal: count a quoted BID peak at least +50 premium points but under +100 premium-point alert, with subsequent quoted giveback >=20 premium points (example **test** thresholds only, never optimal or configured for production). NIFTY underlying points and option PREMIUM points are not interchangeable.
- Overnight gap: compare **only the first depth-qualified BID** in the immediately next owner-declared session's bounded opening window after a prior-session peak. Do not manufacture a fill at theoretical trailing alert. No first valid open quote means the overnight price observation is missing, not a confirmed gap-through-stop.
- Holding availability: every originally listed CE/PE alternative, including NO_ENTRY, requires at least one depth-qualified closing BID in every owner-declared session through its claimed expiry, plus recent declared sessions near the expiry. Missing/zero-depth records and missing terminal expiry region count as censored coverage. A supplier-provided calendar itself could omit holidays, weekends, emergency/special sessions or whole periods: this module **does not authenticate official exchange sessions**, so apparent full coverage is only *declared-session* coverage.
- Aggregation: by owner-claimed regime × 1W/2W/4W/8W × CE/PE, with original all-listed, NO_ENTRY, entry-mark-available, premium giveback, next-open gap and missing-close denominators. No raw option tokens, trade IDs, actual prices, broker credentials or PnL in aggregate reports. No choice or auto-ranking of one horizon over another.

## Important source & execution separation

**Phase29 / Phase78 broker read-only archives and Phase79 historical market CSV are different data domains.** A correct SHA of either does not authenticate its origin. A matching broker order-state record does not establish guaranteed overnight stop survivability; a historical best BID does not prove a broker execution at the observed price. No results are connected to the live trading engine, database, routes, scheduler, or UI. Existing EMA23/50 MIS intraday 15:15 remains as-is; 1W–8W positional NRML does not force a 15:15 exit.

All `sourceAndResearchLicenceIndependentlyAuthenticated`, `originalStrategyClientReceiveClockAuthenticated`, `officialExchangeExpiryAndSessionCalendarAuthenticated`, `actualEntryAndExitFillsVerified`, `realOutOfSampleOptionReturnOrProfitabilityProven`, `nativeBrokerNrmlGttStopChildAckVerified`, `bestContractOrHorizonAuthorized`, `executionAuthorized`, and `productionSafe` outputs **stay false**; `nativeOrderInstruction` stays null. A descriptive `...CLAIMED_L1_COVERAGE...` status is **not a green trading signal**.

## Tests

`src/quant/tests/ema15m_adaptive_phase79_original_premium_path_coverage.test.ts` includes 24 adversarial tests. Data are synthetic, including simulated +70 to +20 premium reversal, next-open gap below hypothetical trail, nonexistent/missing quote, zero BID depth, explicit NO_ENTRY, original SHA mismatches, source clock after decision, duplicate records/sequence, bad spread, missing expiry region, threshold tampering, denominator or horizon replacement. It uses the repository's strict Phase22 CSV parser in GitHub CI; the local isolated runner previously used a *simplified test shim* for the parser and type definitions, so **only repository CI validates full integration**.

Dedicated workflow: `.github/workflows/adaptive-phase79-premium-path-coverage.yml`, plus Phase50–79 focused and broad EMA regression/production build. All complete checks must be reviewed before considering merging this draft. Passing synthetic tests proves defensive code behavior only.

## External data to acquire before research eligibility

1. A genuine legally licensed, independently authenticated original historical option best BID/ASK and displayed depth feed **for all originally listed CE and PE, all candidate 1W/2W/4W/8W tenors**, including decisions with NO_ENTRY, full holding dates and last tradable session.
2. Independently authenticated historical exchange instrument/lot/expiry/session/holiday master and research-use licence terms. Never publish licence-restricted raw tape to public GitHub.
3. Genuine contemporaneous strategy-client receipt timestamps (only if originally captured), separated from retrospectively downloaded archive timestamps. Otherwise causal original entry backtesting is **not** available; retrospective analysis must stay separate and labeled.
4. Untouched multi-cycle OOS evaluation by market regimes and matched contracts, with spreads/depth, theta/IV, overnight gap-through-stop, slippage and full premium debit risk; no backtest PnL invented for zero depth or unavailable path.
5. Broker-sanctioned test environment evidence for native NRML stop/GTT child order exchange ACK, partial fill, cancel, restart, gap nonfill, holiday and expiry handling; written human risk, capital and release sign-off.

Release issues #17–#22, especially stop-lifecycle #20, remain OPEN. Nothing in Phase79 enables live broker actions or marks the strategy profitable/production-ready.
