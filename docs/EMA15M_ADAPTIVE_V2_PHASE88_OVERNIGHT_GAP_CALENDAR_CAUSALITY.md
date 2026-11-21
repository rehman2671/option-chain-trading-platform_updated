# Phase88 — Ambiguous next-opening quote across undeclared weekday gaps

**DRAFT · OFFLINE ONLY · historical 1W/2W/4W/8W original native option L1.** Stacked on Phase87 Draft PR #92. No live NRML execution, brokerage, GTT/stop or source-network access.

## Concrete issue fixed

Phase87 detects **potentially missing weekdays** in the owner-declared market-session calendar, but the option premium-path evaluator still used the next date **in that declared array** as the immediate next **trading session**. Consider an observed Friday +70-point option BID peak that arms a theoretical premium-giveback trail. An operator-supplied native CSV/candidate calendar omits Monday entirely and presents a Tuesday opening BID at +20; before Phase88, the Tuesday price could be counted as a **first-next-session quoted gap through trail** even though the potentially tradable Monday first BID is unknown. If Tuesday instead has a favorable first opening quote, the missing Monday must not be interpreted as proof that the overnight trail was safe.

This is especially material for a positional 1W–8W NRML research strategy: an absent day's opening liquidity cannot be recreated from a later day's quote, and a broker-native GTT stop does not guarantee a fill through an overnight gap.

## Implementation

- A pure candidate-weekday function examines **strictly intervening Monday–Friday dates** between two neighboring dates in the owner-declared session manifest. This calculation is not an official NSE/BSE exchange holiday/calendar feed and **does not assert that any omitted Monday was actually open**.
- The replay's `nextDeclaredSession()` only returns an adjacent declared session for a first-next-open gap comparison **when zero candidate weekdays are skipped**. A Friday -> Monday transition (weekend only) remains eligible; Friday -> Tuesday with Monday omitted is **not** eligible. This prevents later quoted BID marks from being mislabeled as first-next-session marks.
- Every entry-claimed listed option that reaches a **new armed premium BID peak** records whether its next session is unresolved through the original option expiry: a candidate weekday was skipped, no next session was declared despite weekdays before expiry, or the first next declared date lies after contract expiry. New counters `entryPairsWithUnresolvedOvernightCalendarTransition` and `entryClaimedPairsWithUnresolvedOvernightCalendarTransition` (regime×1W/2W/4W/8W×CE/PE cell) count affected original entry-candidate pairs once, not supposed fills.
- An unresolved armed transition forces `DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING` and safe reason `ARMED_OVERNIGHT_NEXT_OPEN_UNRESOLVED_BY_POTENTIAL_MISSING_SESSION`. It is distinct from Phase81's absence of a bounded, timely, depth-qualified opening BID **within a known declared next session**.
- Phase80 private owner-supplied source review forwards aggregate-only counts, no raw quote price, exact date, instrument key, vendor, account or source path.
- This does **not** count missing Monday as an actual loss, an option stop fill, a true exchange trading day, or proof of a complete market tape.

## Regression and checks

Five additional Phase79 tests verify Friday->Monday legitimate observed opening, Friday->Tuesday with missing Monday, a Tuesday morning quote unable to fill the missing Monday opening slot, subsequent missing Tuesday not retroactively canceling an earlier observed Monday gap, and no next declared session despite remaining candidate weekdays. One Phase80 test verifies private redaction and the new aggregate. With Phase87's 101 prior tests, dedicated Phase88 CI expects **107 synthetic tests**; run TypeScript checking, focused Phase50–88 regression, broad EMA15M safety/full regression and production bundle checks.

## Remaining external blockers

Declared dates, expiry, original contract identity, BID/ASK/depth, receipt/sequence and policy thresholds are still operator-supplied/self-pinned, never independent NSE/BSE vendor or historical strategy-client provenance proof. Formal market-holiday and special-session authenticity is unresolved, genuine licensed native F&O L1 has not been supplied, and real multi-cycle regime OOS, spread/slippage, IV/theta, overnight option stop nonfill/child order exchange ACK, recovery/restart and expiry protections remain unproven. Issues #17–22 (especially #20) remain open; keep stacked PRs draft/unmerged, no capital risk or production permission. Existing intraday MIS 15:15 behavior unchanged, no forced 15:15 NRML exit.
