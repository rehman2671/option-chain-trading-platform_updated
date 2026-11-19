# Adaptive Swing v2 — Phase60 original OOS regime × 1W/2W/4W/8W evidence sufficiency

**DRAFT / OFFLINE RESEARCH ONLY / stacked on Phase59. No live broker, option-contract selection, GTT, native stop order or forced positional 15:15 square-off.**

## The market question, not another arbitrary target

Previously Phase57 measured **original option ASK × quantity + assumed costs** downside under 25/50/75/100% premium loss, Phase58 checked exact original event-time and `availableAt` evidence through the original Phase8 exit, and Phase59 reconciled Phase19 *OPTION BID* partial runup/reversal and Phase46 first-next-session gap/nonfill risk across the **same original entry-first OOS cohort**. Those computations describe risks; they do **not** say that an option expiring in 1, 2, 4 or 8 weeks is statistically suitable for a specific market regime.

Phase60 explicitly tests whether the original **regime × strategy arm × horizon** historical sample has enough independently preserved out-of-sample breadth to even support **descriptive** evaluation. This is a **research sample-coverage precondition**, not a best-expiry ranker, backtest profit estimate, stop fill simulation, or entry module.

## Offline input and evidence gate

`src/server/engine/ema15m/adaptivePhase60HorizonRegimeEvidenceSufficiency.ts` provides `auditPhase60HorizonRegimeSufficiency`.

1. Independently SHA256-pin exact Phase59 input, Phase59 pins, prespecified Phase60 coverage policy **and the complete original fold × test date × decision-time manifest**, including all originally defined no-trade decisions. Re-run Phase59 → Phase58 → Phase57 → Phase51 → Phase50 and the original Phase8 entry-first cohort. Reject modified original fold dates, missing decision days, missing/censored selected original L1 paths, duplicate attempts or impossible denominator even if the operator rehashes subsequent documents.
2. Count **all original test-date × 3 alternative strategy arms × 4 horizons**, not merely the successes. These arms often refer to the same instrument and must NOT be reported as three independent profitable fills. Each per-regime/arm/horizon cell separately reports original attempts, no entries, original paid-ASK entries, distinct entry test dates, distinct test folds, original Phase19 observed option BID reversals, first-next-session Phase46 gap paths and adverse risk alerts.
3. Match selected entry `instrumentKey`, declared expiry and lot size to the **original decision-time listed-contract catalog** (not an updated future listing). Check that declared days to expiry fit predeclared horizon windows (1W: 1–8, 2W: 8–18, 4W: 18–36, 8W: 36–80), and that maximum planned holding duration leaves the independently prespecified calendar-day buffer before expiry. These are only operator-provisioned contract labels; official NSE/BSE contract master and actual last trading time are still NOT authenticated.
4. Count **four-horizon matched original entry decisions within the same fold, decision time, and alternative strategy arm**. Such pairing is only a *coverage* statistic. It is NOT a hypothetical portfolio account, randomized treatment comparison, confidence interval or reason to optimize the maximum profit duration on untouched OOS test data.
5. The prespecified policy sets strict descriptive sample requirements: minimum original test days, independent OOS folds, distinct decision-time regimes, chronological calendar span, per-regime original decision days, per-cell observed entry dates/folds, and actually observed original overnight quote-gap paths. Each cell gets `predeclaredSampleCoverageQualified`, but the **entire result always has `bestContractExpiryOrHorizonRankingAuthorized=false`**.
6. If any selected expiry horizon or hold buffer is invalid, return `INCOMPLETE_EVIDENCE`. If valid but insufficient folds, regimes, sample span, matched paths or entry coverage, return `DESCRIPTIVE_COVERAGE_INSUFFICIENT_ONLY`. Observed Phase19 option premium reversal, predeclared adverse Phase46 gap, or full-debit cash-loss alert instead returns `DESCRIPTIVE_DOWNSIDE_RISK_ALERT_ONLY` (including a coverage insufficiency reason if applicable). Even `DESCRIPTIVE_COVERAGE_REVIEW_ONLY` **cannot** certify issuer authenticity, statistically significant performance, optimized ranking, executed broker stops or production readiness.

## Test coverage

`src/quant/tests/ema15m_adaptive_phase60_horizon_regime_sufficiency.test.ts` uses the **same Phase59 original two-fold entry-first fixture** with synthetic FLAT, GIVEBACK and GAP option premium paths. Ten adversarial tests cover:

- Both originally held-out dates, 24 full original arm × horizon attempts, one observed regime, not enough independent folds and **no invented duration suitability**.
- Same original option BID premium +30-point giveback before +100 target becomes a *downside alert*, not an index-point signal or best expiry.
- Adverse first-next-open option BID gap exceeding independently pinned 20% stress becomes a downside alert.
- Real original selected contract expiry being too close to maximum positional hold duration becomes incomplete evidence.
- Post-hoc lowering of coverage thresholds without independent policy pins.
- Removing an OOS fold session after rehash but preserving the earlier independently pinned fold manifest.
- Delayed option source `availableAt` even if operator regenerates other source hashes.
- A future quote beyond the original Phase8 exit cannot alter coverage, threshold or original duration suitability.
- Fictional extra OOS folds in independent pins do not replace real original fold records.
- Lowering other synthetic coverage thresholds cannot magically generate a second market regime.

These software tests **cannot** show profitable NIFTY/BANKNIFTY options, real NSE/BSE licensed market data or production-safe NRML positions.

## Owner-private offline CLI

`scripts/audit-adaptive-phase60-regime-duration-evidence.ts` accepts two independently preserved JSON source/pin files, both owner `0600` within `0700` owner-only directories. Run within an **OS-enforced network-isolated environment**; Node alone is not a network sandbox:

```bash
npx tsx scripts/audit-adaptive-phase60-regime-duration-evidence.ts \
  --approve-isolated-offline-review \
  --private-phase60-original-market-coverage /private/original-phase60-source.json \
  --independent-phase60-fold-and-coverage-pins /private/prespecified-phase60-pins.json
```

Output is redacted aggregate counts, descriptive status, predeclared coverage failure reasons and always-false broker/profitability/source trust flags. It never prints original instrument keys, raw market ticks, private paths, accounts or PEM certificates. A zero exit means only that the software returned a non-invalid *descriptive* research result, not trading authorization.

## Remaining hard release gates

Obtain genuine licensed historical original top-of-book options data, source event and independently authenticated received-at availability timestamps, official point-in-time exchange expiry/contract master and calendar, untouched chronological multi-market-cycle out-of-sample original premium paths with real liquidity, spreads, IV/theta/gamma and zero-recovery overnight loss stress; then separately demonstrate actual broker-native NRML GTT/stop placement/modify/cancel ACK and overnight persistence.

Release issues #17–#22, especially #20, remain OPEN. Research PRs DRAFT/unmerged. Existing EMA23/50 **MIS intraday** 15:15 auto-squareoff unchanged. NRML positional 1W/2W/4W/8W gets **no forced 15:15 exit**, no live order/GTT or stop repair. 
