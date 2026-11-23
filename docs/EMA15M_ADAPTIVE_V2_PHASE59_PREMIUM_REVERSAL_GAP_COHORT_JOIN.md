# Adaptive Swing v2 Phase59 — original OOS option-premium reversals × first-next-session gap/no-fill risk

**DRAFT · OFFLINE RESEARCH ONLY · stacked on Phase58. No live NRML/GTT/order writes; no broker stop ACK or guaranteed overnight protection.**

## Objective

Previous research answered separate pieces: Phase19 measured whether **original option BID** rose +50/+70 then reversed before a +100 *option-premium* candidate, Phase46 stressed four selected overnight option path examples for full-debit loss/gap non-fill, and Phase58 tied the independently declared entry-first OOS universe to original source `availableAt`, the original Phase8 next-BID exit, and Phase57 cash-risk budget. Selecting attractive Phase19/46 examples post hoc cannot establish the 1W/2W/4W/8W positional strategy's OOS behavior.

Phase59 joins both kinds of downside research **for every entry in the same fixed Phase58 OOS cohort**. It has no strategy re-ranking or per-regime optimization functionality.

## Reusing existing algorithms, not rewriting the trading logic

- Phase19's original `auditSinglePath` premium-runup calculator is exported as `auditOriginalPremiumRunupPath` (same implementation) and its existing policy validator is reused. The original Phase19 audit also calls that helper. Its depth-qualified BID peaks/reversals are measured only up to the existing, independently enrolled Phase8 stop/trailing/fixed-hold trigger. A later option BID must never redefine the entry, be called an executed order, or convert an *underlying NIFTY index-point target* into an option premium.
- Phase46's original `one` per-gap validator is exported as `auditPhase46SingleOriginalGapPath` (same implementation); the existing four-horizon standalone Phase46 audit still calls it. `validatePhase46GapStressPolicy` is also exported unchanged. Phase59 **does not** claim four operator-selected contracts represent all multi-fold OOS decisions.
- `src/server/engine/ema15m/adaptivePhase59PremiumGapCohortJoin.ts` independently pins exact Phase58 input/pins and predeclared Phase19 premium thresholds + Phase46 first-open/depth/full-debit policies, then re-runs Phase58 → Phase57 → Phase51 → Phase50 and Phase8 entry-first original exit replay. All original test-session × 3 strategy arms × 4 horizons remain present, including filtered/no-entry decisions.
- For every enrolled original option, it calls the unchanged Phase19 classifier on exact original instrument, entry ASK, observed BID series and pre-existing trigger. It never inspects later quotes to select thresholds or favorable contracts. A source mismatch, absent next BID or unobserved pretrigger route is **INCOMPLETE**, not a winner or zero-loss.
- Only originally enrolled positions that remain held into a following declared trading session are candidates for original first-next-open gap stress. The original entry L1, **latest source-available pre-close BID**, first original instrument quote from the next declared session and independently listed expiry/lot/option type are bound to the exact same selected OOS entry. Phase46 checks original times, `availableAt`, bid/ask, whole-lot top-book depth, original expiry horizon, first-open lag, haircut and full debit/no-fill downside. All paths need to be matched; unobserved pre-close/first-open path -> **INCOMPLETE**, not proof that stops work.
- The Phase46 hypothetical nonrecoverable entry costs are required to exactly match Phase57's full debit-loss budget assumptions; exit cost is zero in this *zero-recovery* worst-case comparison. Separate strategy arms may reuse the same contract/option path; the report distinguishes original entries from distinct underlying source paths rather than multiplying three arms as independent executions.

Maximum result is `DESCRIPTIVE_SINGLE_REGIME_PREMIUM_GAP_ONLY`, `DESCRIPTIVE_MULTIREGIME_PREMIUM_GAP_ONLY`, or `DESCRIPTIVE_PREMIUM_OR_GAP_RISK_ALERT_ONLY`. This is **not** a best contract expiry recommendation, an observed broker fill, causal Greek/IV/theta decomposition, real licensed source authentication or profitable backtest.

## Synthetic regression and CI

The new test fixture `src/quant/tests/phase59_synthetic_matched_oos_fixture.ts` reuses exactly Phase58's 2-fold entry/exit source, fixed calendar and independent OOS pins. All synthetic displayed depths are made whole lots; test-only variants **FLAT**, **GIVEBACK** and **GAP** allow distinct market behavior without changing live logic.

`src/quant/tests/ema15m_adaptive_phase59_original_premium_gap_join.test.ts` covers 11 cases: original 24 attempts and alternative-arm dedup, depth-qualified +30 option BID premium reversal before +100, adverse next-open gap loss alert, no displayed top-bid depth and hypothetical non-fill, missing early next-open quotes, delayed source delivery, independently frozen premium/Phase46 policies, unreconciled entry fee assumptions, reduced source lag assurance, deleted OOS day despite re-pinning and **future-quote immutability of pretrigger/first-open classifications**. Reports must keep `executionAuthorized=false`, `productionSafe=false`, `nativeOrderInstruction=null` and all broker, official exchange calendar, source authenticity and profitability flags false.

Dedicated Phase59 CI performs TypeScript and synthetic cases; combined focused plus existing full safety and production build remain independent release checks. Synthetic tests **never** validate genuine data origin or market strategy profitability.

## Manual owner-private audit

`scripts/audit-adaptive-phase59-premium-gap.ts` accepts independently retained original Phase59 dossier and independent policy/source pins in owner `0600` files in `0700` directories, run with an OS-enforced no-network-egress sandbox:

```bash
npx tsx scripts/audit-adaptive-phase59-premium-gap.ts \
  --approve-isolated-offline-review \
  --private-phase59-original-option-cohort /private/original-phase59-source.json \
  --independent-phase59-original-source-and-risk-pins /private/prespecified-phase59-pins.json
```

CLI emits only redacted counters, fixed status/reason codes and hard-false trading/proof flags. A zero exit denotes only internally consistent *software* research. It is not broker or regulatory authorization.

## Still missing for real trading readiness

Licensed historical native top-of-book option L1 BID/ASK and depth, independently verified original `availableAt` clocks, NSE/BSE official calendars and point-in-time F&O contract/expiry master, substantial untouched chronological multi-regime OOS coverage including no-trade/missing days, actual IV/theta/gamma and overnight cost/slippage/liquidity, plus real broker-native NRML order/GTT stop ACK, modification/cancellation and gap continuity.

Issues #17–#22 including #20 remain OPEN. Research PRs DRAFT/unmerged. Existing EMA23/50 **MIS intraday** 15:15 square-off unchanged. **NRML 1W/2W/4W/8W positional holding has no forced 15:15 exit, no live order/GTT and no new stop writer.**
