# Phase75 — Counterfactual premium giveback, overnight gap and full-debit stress

**DRAFT · OFFLINE RESEARCH ONLY · stacked on Phase74 Draft PR #79.** No live broker/NRML orders, native stops, GTT writes, best-expiry recommendations or forced positional 15:15 square-off.

## Purpose

An option can reach +50 or +70 PREMIUM points, reverse before an expected +100 premium-point target, gap through a hypothetical trailing alert, show no usable BID depth, or expire worthless. +100 underlying NIFTY INDEX points and +100 OPTION PREMIUM points are **not interchangeable**. A historical best BID quote is not a guaranteed executed exit.

The Phase66–74 standalone historical option sample is synthetic. Its initial quote event occurs exactly at original decision time but the claimed source arrival is five seconds *after* the decision, on all 32 originally listed option candidates. No genuine decision-time strategy-client receipt has been proved. Phase75 is therefore NOT an OOS backtest or simulated broker-fill PnL; it is a separate, explicitly **counterfactual stress calculator** over the frozen original contract universe.

## Implementation

Core: src/server/engine/ema15m/adaptivePhase75CounterfactualPremiumStopStress.ts

The auditPhase75CounterfactualPremiumStopStress(input,pins) function rechecks Phase74→73→72→71→70→69→68→67→66. The full Phase74 dossier/pins, preregistered risk policy and exact raw scenario archive are separately SHA256 pinned. It preserves every original OOS decision, 1W/2W/4W/8W × CE/PE listed alternative and NO_ENTRY status. The synthetic source has four original decision dates, 2 NO_ENTRY dates, 32 listed option pairs: 16 ENTRY_CLAIMED candidates and 16 NO_ENTRY alternatives.

**Each of the 16 ENTRY_CLAIMED listed options must have exactly FOUR different risk what-if paths** (64 hypothetical rows total). NO_ENTRY options remain in data-acquisition denominators, but NEVER become hypothetical purchased positions. A duplicated favorable case, missing adverse case, replaced original option, altered listing denominator or mutated independent policy/hash fails closed.

Four mandatory classes:

1. PRE_TARGET_GIVEBACK — option premium high at least preregistered +50 point trailing-arm mark, but below +100 premium target; subsequent BID falls by at least preregistered 20-point giveback. The alert is not a realized sale.
2. OVERNIGHT_GAP_BELOW_TRAIL — a next hypothetical BID is below the trailing alert AND below original ASK entry, illustrating how a gap can bypass a stop without an exit at the stop level.
3. NEXT_OPEN_ZERO_BID_DEPTH — displayed BID depth zero, no independently verified liquid exit. Conservative full paid debit exposure remains.
4. EXPIRY_FULL_PREMIUM_DEBIT_LOSS — worthless expiry and zero BID depth. Entire long option ASK debit plus assumed fees may be lost.

## Illustrative arithmetic — NOT actual market prices

Test fixture assumes ONE original lot of 50 options, entry ASK premium ₹100, peak best BID ₹170, trailing arm gain +50 premium points, giveback alert 20 premium points, and target alert +100 PREMIUM points. Illustrative fees total ₹50. So hypothetical high is +70, and the supposed trailing alert is ₹150, even though +100 premium target is never reached.

- If later quoted BID is ₹120, that is ₹50 below high and ₹30 below the trail. Its arithmetic mark is +20 premium points from ASK entry, NOT an executed exit at ₹150 or ₹120.
- If first next-session BID gaps down to ₹10, one-lot assumed mark loss is (100 − 10) × 50 + ₹50 = **₹4,550**. The alert at ₹150 did not guarantee a fill.
- With zero displayed BID or worthless expiry, conservative full paid debit at risk is 100 × 50 + 50 = **₹5,050**.
- Fixture's hypothetical single-entry budget ₹4,000 and illustrative adverse-mark budget ₹3,000 fail; re-pinning both budgets to ₹6,000 does NOT turn the scenario into real trading evidence.

These values are handcrafted test assumptions—not broker fee quotes, actual past option ticks, a trading signal, an optimal stop or a return forecast.

## Results and safeguards

The only descriptive outcomes are DESCRIPTIVE_HYPOTHETICAL_LOSS_BUDGET_EXCEEDED_NO_TRADING and DESCRIPTIVE_HYPOTHETICAL_STRESS_ONLY_NOT_OOS_OR_EXECUTION. On malformed/altered source, independent pins, risk rules or missing original counterfactual path, status is INVALID_EVIDENCE or INCOMPLETE_EVIDENCE. Even the apparently in-budget outcome NEVER gives an automated expiry selection.

The report aggregates risk counters by owner-claimed regime × horizon × CE/PE, preserving original ENTRY_CLAIMED and NO_ENTRY denominators. No exact contract identifiers, option quotes or original historical market dates are printed from the CLI.

All outputs permanently mark source licensing, genuine point-in-time original client receipt, verified exchange calendars, true multi-regime out-of-sample profit, actual option ASK buy/BID sell fills, IV/theta/slippage/gap calibration, broker-native NRML/GTT/stop child/exchange ACK, optimal horizon, live execution and production safety **FALSE**. nativeOrderInstruction is always null.

## Adversarial verification and private command

Fixture: src/quant/tests/phase75_synthetic_premium_stress_fixture.ts. Tests: src/quant/tests/ema15m_adaptive_phase75_counterfactual_premium_stop_stress.test.ts. **21 adversarial synthetic cases**, including all 64 mandatory risk paths, original 16 NO_ENTRY alternatives, budget tightening, stop-level gap, after-target-invalid giveback, zero BID depth, modified source hashes, duplicate favorable scenario, invented contract, and no trade authorization. Dedicated TypeScript + 21 tests passed on the first complete implementation. Full Phase50–75 focused, EMA safety/build and full npm regression must pass separately.

Dedicated workflow: .github/workflows/adaptive-phase75-premium-stress.yml

Owner-only offline audit, using separate 0600 JSON in owner-only 0700 directories under externally enforced OS/container no-egress:

    npx tsx scripts/audit-adaptive-phase75-premium-stress.ts \
      --approve-isolated-offline-review \
      --private-phase75-counterfactual-premium-dossier /private/phase75-risk-source.json \
      --independent-phase75-scenario-pins /private/phase75-stress-pins.json

CLI outputs aggregate scenario and original OOS source counts only; it contains no broker, market data retrieval, GTT or stop-writing functionality.

## Real blockers

To recommend 1W–8W contracts or deploy real positional NRML orders, obtain authentic legally licensed historical option best BID/ASK plus displayed depth through ALL originally listed options and real exchange sessions; independently verified official F&O contract/expiry/lot/holiday master; original strategy receive timestamps if actually captured at the time; truly untouched multi-market-cycle OOS with preregistered entry/exit/regime rules; actual option premium giveback, IV/theta/spread/depth, gap nonfill, fees and entire paid-debit downside. Underlying index targets must be separately observed, not inferred from option premium.

Broker-native NRML stop/GTT placement, modification, cancellation, trigger, child exchange ACK, overnight continuity and rejected/nonfilled exit risk are separate blockers. Issues #17–#22 (especially #20) remain OPEN; PRs remain DRAFT/unmerged. Existing EMA23/50 MIS intraday **15:15 square-off unchanged**. 1W–8W positional NRML has **no forced 15:15 exit and no live broker/GTT/stop writes** here.
