# Adaptive Swing v2 — Phase 20 chronological OOS fold robustness and selection-bias audit

**DRAFT • OFFLINE RESEARCH ONLY • UNMERGED. No autonomous NRML or paper orders, no change to EMA23/50 MIS/15:15, no historical profitability certificate, no independent source authentication or broker-native GTT/stop claims.**

## Market problem

A simulated swing strategy can show positive aggregate historical option-premium P&L **because one lucky period dominates**, several 1W/2W/4W/8W variants were tried and only the best winner is displayed, or many trades are correlated within the *same market session*. A thousand option L1 quotes in one afternoon are **not** a thousand independent OOS experiments. Likewise, a second test fold starting while the previous fold's reserved position might still be open makes reset-fold exposure state deceptively independent.

Phase 20 creates a *separately prespecified, independently reproducible* chronological fold-risk audit. The word "independently" here refers to **re-running the calculation against the original input**, not an established statistical independence between historical Indian market regimes, feeds, traders, or sample folds. The tool **cannot prove** statistical independence.

## Source and sample rules

- Input is the SAME original historical source-attested data, original declared exchange sessions, Phase 8 exit replay policy, Phase 12 point-in-time hysteresis advisory and Phase 13 matched original-vs-stabilized OOS cohorts used in the Phase 17 full audit.
- Rebuild **baseline** and **hysteresis** entry-first cohorts with **separate frozen cooldowns**, re-run original stop/trail/time-trigger exits and require a recorded **later** original option BID. No trigger-price fills, best possible BID fills, index-only point profit, or after-the-fact selection.
- Each fold × EMA_BASELINE/REGIME_FILTER/REGIME_AND_RANK × 1W/2W/4W/8W × baseline/hysteresis has one *complete* entry and exit denominator. Reconcile counts, original next-BID exit P&L and fixed selection with Phase 13. A changed report cannot produce a favorable new net P&L.
- **Censored missing option quotes or next BID, missing entry ASK, empty selected cohort, bad cohort-source identity or missing test-session decisions** invalidate *all* fold-series economic summaries. They remain `null`, never 0, never a survivor-only backtest.
- The **previous test fold's originally reserved latest possible exit/cooldown**, not the lucky observed actual exit, must complete before the next test fold's first original strategy decision. Across independent cohort variants this is checked separately. Calendar windows can be non-overlapping while positional holdings are not: overlapping holding *risk* blocks independent-like fold review. This is a conservative guard, not proof of IID returns or no common shocks.
- The **same 12 arm×horizon families** each have baseline, hysteresis and fold-total policy difference = **36 planned exploratory comparisons**. These are not 36 independently discovered market edges and the policy difference is NOT a matched-trade causal delta: the two strategies may hold different exposure days and different numbers of contracts. Session-clustered trades, the same macro events and multiple repeated research iterations can invalidate ordinary statistical interpretation.

## Per-fold economic sensitivity, not a recommendation

For each original or Hysteresis cohort and its fold-total difference:

1. Complete-fold option premium net INR and average INR per fold, **including losing folds**.
2. Chronologically accumulated worst fold net result and maximum peak-to-trough fold-equity drawdown.
3. Count of positive, negative and exactly zero fold returns, and maximum consecutive losing folds.
4. The largest fold's absolute share of total absolute fold P&L: a **concentration** diagnostic even if net sums to zero.
5. **Net if the best profitable fold is omitted**: if a cumulative +70 INR result becomes -30 INR without one +100 INR fold, it is fragile and is reported as such (not optimized away).
6. Conditional one-sided **exact fold-sign probability** under the *unverified* assumption that nonzero fold signs are independent and exchangeable with 50/50 probability under the null. Zero returns are ignored for the sign probability, NOT the fold denominator.
7. Transparent **Bonferroni ×36** adjustment across 12 prespecified arms and horizons × original/hysteresis/total-fold-contrast. No unlogged horizon, variant, threshold or strategy search is included. If untracked variants were tested, this adjustment **understates** selection multiplicity. Sign p-values are exploratory math only: **the system still returns `statisticalSignificanceProven=false` even for a tiny adjusted number.**

The predeclared single-fold loss and fold-concentration caps are diagnostic **risk flags**, not automatic exclusion rules for losing data or an excuse to report "insufficient" instead of an observed drawdown. Sample insufficiency, missing market data and overlapping fold exposure cause `INCOMPLETE_EVIDENCE`; an honestly losing complete sample can have `DESCRIPTIVE_ONLY` while clearly showing the poor outcome.

No intraday automatic positional square-off or live 1W/2W/4W/8W horizon recommendation arises from any metric. Every report has `horizonRecommendation=null`.

## Ninth locked source/policy document

Phase 20 adds exactly one **ninth original SHA256-pinned research policy** to Phase 17:

`policyFileSha256.chronologicalOosRobustness` and the required command argument:

```text
--oos-robustness-policy /secure/phase20-prespecified-oos-robustness.json
```

This file must have schema `ADAPTIVE_CHRONOLOGICAL_OOS_ROBUSTNESS_V1` and the following fields (the values are *illustrative mathematical checks only*, not proven statistical thresholds or profit/risk recommendations):

```json
{
  "schemaVersion": "ADAPTIVE_CHRONOLOGICAL_OOS_ROBUSTNESS_V1",
  "minimumSeparatedOosFolds": 5,
  "minimumPricedExitsPerVariantAcrossFolds": 30,
  "minimumDistinctOosDecisionsPerFold": 5,
  "maximumAbsoluteSingleFoldContributionFraction": 0.45,
  "maximumAllowedSingleFoldLossINR": 20000,
  "plannedFamilywiseComparisons": 36
}
```

All parameter values must be independently predeclared and pinned **before** viewing the untouched original historical OOS outcomes. A local SHA256 of a self-written policy does not establish external preregistration, nor can the numerical thresholds establish a generalizable edge.

### Statuses

- `REJECTED` for invalid policy/version/multiplicity, invalid or duplicated original source attempts/exits, incompatible cohort identity or replay policy.
- `INCOMPLETE_EVIDENCE` if fewer than the locked minimum folds/selected exits/test decisions, missing original option premium bids, mismatched Phase13 next-BID P&L, positional holding cooldowns crossing future fold test decisions, or an already incomplete historical source.
- `DESCRIPTIVE_ONLY` if all original fold net figures and predeclared sample requirements are internally complete, regardless of whether their P&L was good, bad or unstable.

**All reports are permanently non-authorizing**: `executionAuthorized=false`, `productionSafe=false`, `profitabilityProven=false`, `statisticalSignificanceProven=false`, `statisticalIndependenceEstablished=false`, `realBrokerFillsAuthenticated=false`, `nativeBrokerStopsInstalled=false`, `originalMarketL1Authenticated=false`, `marketCalendarIssuerAuthenticated=false`.

## Phase 17 integration

The full raw-byte auditor `runAdaptiveFullResearchReadiness` and `scripts/audit-adaptive-full-readiness.ts` now **must** consume the ninth independently pinned policy file. They rerun Phase 20 from the same original source/Phase 13 cohort, compare exact original fold totals with existing Phase 13/14 horizon-risk sums and reject P&L summary mismatches. The aggregate 12-horizon dossier adds original and hysteresis worst OOS fold net, accumulated fold drawdown, leave-best-fold-out net, exploratory Bonferroni-adjusted fold-sign probabilities and explicit `oosRobustnessRiskFlags`. **Even a successful internal package remains `INTERNALLY_CONSISTENT_EXTERNAL_REVIEW_REQUIRED`, never broker-ready or a market-data issuer certification.**

Source files:
- `src/server/engine/ema15m/adaptiveChronologicalOosRobustness.ts`
- `src/quant/tests/ema15m_adaptive_chronological_oos_robustness.test.ts`
- `src/server/engine/ema15m/adaptiveFullResearchReadiness.ts`
- `scripts/audit-adaptive-full-readiness.ts`

Adversarial tests include one cherry-picked winning fold, all losing folds, flat fold ties, missing next option BID censoring the ENTIRE P&L series, tampered Phase13 aggregate, overlapping test-fold positional reservations, changed prespecified multiplicity/count policy and no live authorization.

**STILL UNFULFILLED EXTERNAL BLOCKERS:** actual licensed contemporaneous Indian index option historical ASK/BID/depth + original availability clocks; genuine original NSE/BSE exchange circular/expiry calendars; external reviewer identities and immutable protocol preregistration; independent source-data multiple-regime untouched OOS statistical assessment; actual broker-native NRML stop/GTT approvals and restart/partial-fill protection; independent Draft PR review/release. Tracked in GitHub issues #17–#22.

**Keep Draft/unmerged. Do NOT enable auto NRML, do NOT change the existing MIS 15:15 rule.**
