# Adaptive Swing v2 Phase58 — original OOS holding-path availableAt × full premium debit/exit reconciliation

**DRAFT · OFFLINE RESEARCH ONLY · stacked on Phase57. Neither original market-data origin nor broker-native NRML stop/fill has been authenticated; no live order or 15:15 positional square-off.**

## Specific gap

Phase8's entry-first exit replay observes a threshold on an *original event-time option BID*, then hypothetically prices the **next original L1 BID** (never a stop-price fill) only when displayed depth and source path coverage permit. Later Phase50/51 audit original entry **availableAt**, while Phase57 calculates entry-debit budgets by decision-time market regime and 1W/2W/4W/8W option horizon. Those analyses are separately useful, but cannot automatically claim that the original Phase8 next-BID observations were delivered by the market-data source within the predeclared exit latency. Nor did the Phase51 session ledger necessarily cover the extra session **after the last OOS entry**.

Phase58 is a strict same-cohort reconciliation, **not** a new PnL model, a Phase19 premium reversal duplication, or a synthetic strategy optimization.

## Offline design

`src/server/engine/ema15m/adaptivePhase58MatchedExitAsOf.ts` implements `auditPhase58MatchedOriginalExitAvailability(input,pins)`. It:

1. Independently pins SHA256 of the complete original Phase57 input, independent risk pins, **unchanged Phase8 initial/trailing/fixed-hold exit policy**, and a separately declared *extended* holding-period trading-session calendar. The extended calendar must include every original Phase51 session with identical open, close and source ID, and may contain later sessions needed by the original OOS exit path.
2. Re-runs **Phase57 → Phase51 → Phase50 → original Phase8 entry-first cohort** and original Phase8 exit replay using the exact source and the extended calendar. Original 3 arms × 4 horizons × 2+ OOS test days remain in the denominator; no later favorable contract/strike/expiry may be substituted because a historic exit quote is unavailable.
3. For each originally enrolled entry, demands original event-time and source `availableAt` evidence for **every original instrument L1 quote from entry to the original Phase8 next BID exit**, respecting a predeclared maximum source event-to-availability lag, strictly increasing event times, nondecreasing original delivery times, valid session hours, and the original observed stop trigger and first post-trigger BID. An asynchronous source delay can invalidate a historic next-BID exit even if the quote event timestamp looks timely.
4. Matches the exact original entry counts, decision-denominator and total **ASK × quantity + Phase57 predeclared nonrecoverable fees** for every regime × strategy arm × expiry horizon with the recomputed Phase57 full-debit source. Missing/ambiguous option L1, source-availability mismatch, absent future session or censored next-BID exit -> `INCOMPLETE_EVIDENCE` and null complete-cohort paper PnL. Missing outcomes are **not** zero, skipped losses or guaranteed stop executions.
5. Reports *originally observed* overnight next-session adverse BID gaps and the existing Phase8 overnight gap triggers. It does **not** infer unrecorded overnight prices, an actual GTT/stop fill or true IV/theta/vega attribution.
6. Separate strategy arms remain alternative research policies, not a portfolio of three simultaneously executed orders. All horizon comparisons remain **descriptive** with `historicalReturnForecastOrProfitableRankingProven=false`; an original Phase57 full-premium-loss budget breach produces only `DESCRIPTIVE_LONG_PREMIUM_RISK_ALERT_ONLY`.

Passing a synthetic example is either `DESCRIPTIVE_SINGLE_REGIME_EXIT_RISK_ONLY` (only one original regime present) or `DESCRIPTIVE_MULTIREGIME_EXIT_RISK_ONLY` (multiple declared regimes, still not independent market truth). No market profits or execution safety are implied. Every production/source/broker-stop/Greek proof field is hard `false`; `nativeOrderInstruction=null`.

## Synthetic adversarial tests

`src/quant/tests/ema15m_adaptive_phase58_exit_asof_risk_join.test.ts` uses the pre-existing **synthetic** Phase53 two-OOS-fold source and predeclared Phase57 budget, plus a separately pinned final hold-exit session. Its nine tests cover original 24 decision arms × horizons, complete source-available-at next-BID paths, missing final original session, dropped/later-delivered quote availability, risk policy pin tamper, bona fide pinned risk alert, omitted OOS decision, unapproved exit threshold changes and permanently false live-trading/safe-stop flags.

Earlier Phase19 premium +50/+70 runup/reversal and Phase46 full debit with no overnight fill remain separate research modules. Phase58 does not call their instruments 'filled' nor silently merge an unrelated four-path original L1 risk study as the entire multidate OOS cohort.

## Owner-private manual audit

The standalone audit script `scripts/audit-adaptive-phase58-exit-asof-risk.ts` accepts separate owner-only `0600` files in `0700` private directories and must run under operator-enforced no-network-egress confinement:

```bash
npx tsx scripts/audit-adaptive-phase58-exit-asof-risk.ts \
  --approve-isolated-offline-review \
  --private-phase58-original-holding-path /private/original-oos-with-hold-sessions.json \
  --private-phase58-independent-exit-pins /private/prespecified-phase58-pins.json
```

The CLI prints only redacted aggregates and immutable safety flags—no instrument identifiers, option quotes, original source records, account IDs or private document paths. A zero process exit means only an internally consistent descriptive *software* audit.

## Remaining deployment blockers

- Legitimate licensed NSE/BSE option L1 source and actual source-delivery clocks; independent entitlement/license and official point-in-time instrument master/session/expiry master verification.
- Real untouched chronological multi-regime OOS history: priceable all-days BID path, actual bid/ask spreads and displayed depth, overnight first-available quote, full debit zero recovery, IV/theta/vega/gamma shocks and no-survivor costs.
- Genuine native NRML broker stop/GTT acknowledgments, cancel/replace, partial/nonfills, gap protection and broker reconciliation. **A long option can still lose its entire premium even with a configured stop.**

Release blockers #17–#22 including #20 remain OPEN; all stacked research PRs DRAFT/unmerged. EMA23/50 **MIS intraday** 15:15 squareoff remains unchanged. NRML positional 1W/2W/4W/8W has **no forced 15:15 exit** and no live NRML order/GTT/stop-repair write.
