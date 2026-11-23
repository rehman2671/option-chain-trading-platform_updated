# Adaptive Swing v2 — Phase 19 original OPTION premium BID +50/+70 reversal study

**Offline research only. Draft/unmerged. No broker route, MIS/15:15 change, NRML execution, broker-native stop/GTT or live horizon recommendation.**

## The actual market question

A 1W / 2W / 4W / 8W long option can see an apparent premium gain, e.g. **+50 or +70 option premium points**, then reverse before a hypothetical **+100 premium-point** objective. This is NOT the same as NIFTY / BANKNIFTY / SENSEX underlying index moves of 50/70/100 points. Volatility, theta, delta/gamma, option spreads, expiry time, depth and overnight news can change option BID values even with similar underlying paths. A simple index-point target cannot tell us whether any option BID could actually be sold.

Phase 19 adds **`adaptiveObservedPremiumPathReversals.ts`** and **`ADAPTIVE_OBSERVED_PREMIUM_RUNUP_REVERSAL_V1`** to address the missed-real-market-behavior concern without changing the live strategy.

### STRICT source/selection rules

- Phase 8 **baseline entry-first cohort**, Phase 12 **hysteresis point-in-time advisory**, and independently selected hysteresis cohort use the SAME historical original decision and quote universe. Their original predeclared cooldown schedules remain independent. **No future option BID, maximum favorable move, profitable exit or quote availability can choose the contract or filter entry**.
- The study starts from the already selected **original option ASK entry premium**. A gain of 50 means **a later, originally timestamped option BID >= original ASK + 50**, not a backtest chart candle high or an index move.
- Each observed path ends at **the original Phase 8 observed stop/trailing/time EXIT TRIGGER**. It intentionally excludes the next quote used for the hypothetical exit price as a market path opportunity signal. No cherry-picked later BID, no fill at stop level, no lookahead from future sessions.
- Option quote depth matters: report **raw observed BID target crossing** separately from **bid crossing with top-of-book quantity >= the original position quantity × predeclared minimum whole-lot depth multiplier**. An extremely high raw bid with insufficient displayed depth cannot count as a depth-qualified premium gain. Even depth-qualified means **displayed L1 liquidity, not an executed sell** or an authenticated native stop.
- The runup thresholds and the giveback threshold are **predeclared before untouched OOS**: e.g. for *synthetic test illustration only*, +50 / +70 / +100 option premium BID points vs entry ASK, and a 20-point later observed bid giveback. They are **NOT** hardcoded market settings, a strategy optimizer or actual target/stop levels.
- A reversal after crossing +50 or +70 is counted only if a **later original-depth-qualified BID is at least the predeclared giveback below the previously observed qualified peak**, and the observed path **NEVER reached the candidate +100 depth-qualified BID threshold before the existing exit trigger**. Report severe giveback to/below original entry ASK separately.
- If an original entry, source quote, time order, Phase 8 trigger/next-bid exit or per-cell sample is **missing/censored**, do not infer MFE/MAE or a "reversal avoided". A complete-cohort mean max BID gain becomes `null`, **not zero and never only surviving winners**.
- The denominators are fixed **fold × arm (EMA_BASELINE / REGIME_FILTER / REGIME_AND_RANK) × 1W/2W/4W/8W**, with the original/Hysteresis trade counts and priced/censored exits reconciled to the previously computed Phase 13 matched report. Original-only profitable reversals can be counted as potentially missed trading opportunities, not simply “avoided losses”; a hindsight label is never used to filter source-time signals.

## Report fields

`ObservedPremiumPathReversalReport` provides each original fold × arm × expiry horizon and **both independently selected baseline and hysteresis cohorts**:

- All OOS decisions and independent entry partitions (`bothEntered`, `originalOnlyEntered`, `hysteresisOnlyEntered`, `neitherEntered`).
- Original selected entries, fully observed and censored paths, and missing executable-entry evidence.
- Original **raw BID** +100 sightings versus **depth-qualified BID** +50 / +70 / +100 crossings.
- Partial-runup reversal before +100, 70-point reversal before +100, giveback to entry ASK, observed overnight gap and trailing-giveback trigger counts.
- Baseline-only runup/reversal outcomes which hysteresis might miss, with no assumption skipped trades were inevitably profitable or inevitably losses.
- Mean maximum observed BID gain relative to original ASK, both raw and depth-qualified, **only for complete cohorts without censored paths or missing entry source**. These are *paper historical descriptions*, not broker fills.

`DESCRIPTIVE_ONLY` is the HIGHEST result with fully priced sample and predeclared per-cell minimum, including on synthetic fixtures. `INCOMPLETE_EVIDENCE` applies whenever the original source path, depth, phase 13 comparison, OOS sample or exit is uncertain. `REJECTED` is for malformed predeclared policy, source timestamps or independent cohort replay.

### Locked into Phase 17 full research preflight

Phase 19 adds an **eighth policy source**: `policyFileSha256.premiumPathReversal`. The raw `--premium-path-policy` JSON is included in the separately pinned Phase 17 policy lock alongside Phase 8/10/11/12/13/14 and Phase 18 versioned exchange-session evidence. The all-in-one CLI gains:

```text
--premium-path-policy /secure/predeclared-phase19-premium-runup-policy.json
```

Example policy for **SYNTHETIC adversarial tests ONLY**, not recommended investment thresholds:

```json
{
  "schemaVersion": "ADAPTIVE_OBSERVED_PREMIUM_RUNUP_REVERSAL_V1",
  "firstRunupPoints": 50,
  "secondRunupPoints": 70,
  "candidateTargetPoints": 100,
  "reversalGivebackPoints": 20,
  "minimumDisplayedBidDepthLots": 1,
  "minimumFullyObservedPathsPerVariantCell": 1
}
```

**Expiry-horizon-specific research (not automatically optimized):** The policy additionally accepts an optional `horizonRules` object with **all four** `1W`, `2W`, `4W`, `8W` keys and the exact same six numeric fields for each. If supplied, every horizon must be complete; partial/invalid rules are **REJECTED**. The default example above uses global thresholds for illustration only. In an authentic OOS study the analyst can lock distinct, economically justified option-premium thresholds for each horizon **before seeing test results**, without assuming +100 is optimal for 1W and therefore optimal for 2W/4W/8W. Identical global thresholds and differently predeclared thresholds are both descriptive hypotheses, not market recommendations.

The full-readiness report adds observed bid reversals and candidate target crossing counts per arm/horizon but **keeps every `liveHorizonRecommendation=null`** and refuses portfolio-level premium P&L conclusions when ANY matched or path cell is censored or inconsistent. Different test cohorts and opportunity costs are not causally comparable without rigorous external review.

### Market-provenance and execution blockers remain

No authentic independently licensed Indian index-option historical L1 BID/ASK/depth + true original strategy-availability clocks, independently verified original exchange calendar/circulars, trustworthy pre-OOS registration, multiple-regime statistically adequate testing or real broker fill/stop/GTT acknowledgments are present. These remain tracked in GitHub issues #17–#22. This phase cannot fill those evidence gaps by generating synthetic premium charts.

Every report is **RESEARCH_ONLY**, `executionAuthorized=false`, `productionSafe=false`, `profitabilityProven=false`, `brokerFillsAuthenticated=false`, `nativeStopsInstalled=false`, `historicalOptionL1IndependentlyAuthenticated=false`, `exchangeCalendarIndependentlyAuthenticated=false` and `thresholdOptimizationAuthorized=false`.

**Do not merge to production, do not change intraday MIS 15:15 square-off, and do not enable automatic NRML positions or sells based on this descriptive study.**
