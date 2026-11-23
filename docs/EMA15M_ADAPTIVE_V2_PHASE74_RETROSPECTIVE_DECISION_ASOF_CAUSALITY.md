# Adaptive Swing v2 — Phase74 retrospective option L1 versus decision-time causality quarantine

**DRAFT, OFFLINE RESEARCH ONLY.** Stacked on Phase73 Draft PR #78. No broker writes, NRML orders, native stops/GTT, automatic expiry recommendation or positional 15:15 square-off. Existing EMA23/50 MIS intraday 15:15 close behavior is unchanged.

## Real problem this addresses

The Phase73 source grant preflight can bind an operator-supplied historical best BID/ASK/depth archive with retrospective acquisition receipts. Even if the archived L1 records claim old event times and originalAvailableAt timestamps, that does NOT prove the actual trading client saw those prices before its original trading decision.

In the NEW Phase66–73 synthetic four-original-decision OOS source, every originally listed option has a first event at its decision timestamp (04:30 UTC), **but its claimed originalAvailableAt is FIVE SECONDS AFTER the decision**. Reconstructing an entry using that quote as a decision-time known price is **look-ahead**. No firm broker ASK purchase price, source entitlement, original historical client connection or stop exchange ACK can be inferred.

Phase74 separates:
- **Software as-of eligibility:** whether the owner's source eventAt AND claimed originalAvailableAt are both no later than the original decision; the displayed best BID/ASK have minimum positive whole-lot depth and are recent under an independently pinned preregistered policy.
- **Authenticity and actual availability:** whether an independently licensed vendor, official exchange session/expiry master and independently captured original client source receipt prove the quote actually existed and was accessible then. All of these remain **UNVERIFIED**, regardless of software as-of eligibility.
- **Retrospective receipt:** the originally listed OOS decisions occurred months BEFORE the owner-claimed historical archive download. Receipt of that package does not establish earlier strategy-side client source access. It does not rule out that a separate contemporaneous feed might have existed; evidence for such a feed was simply not supplied.
- **Live execution:** historical best BID/ASK marks are not broker order/fill reports; no exchange stop, GTT, real IV/theta, no-fill or full paid debit protection can be inferred.

A later purchased genuine historical archive can, with appropriate rights, trustworthy event clocks and a predeclared simulator, support **retrospective hypothetical backtesting**. It cannot retroactively establish what a particular real client actually received at each historic decision. This distinction is essential; Phase74 is not a blanket ban on legitimate historical scenario research, only a quarantine against unsupported claims of actual past causal client access or profitability.

## Implementation

Core: src/server/engine/ema15m/adaptivePhase74RetrospectiveCausalReplay.ts

Entry: auditPhase74RetrospectiveCausalReplay(input,pins).

1. SHA256-pin the ENTIRE original Phase73 dossier and pins, plus independent predeclared as-of quote staleness and displayed BID/ASK depth thresholds. Re-audit full Phase73→72→71→70→69→68→67→66, preserving all original OOS dates, all listed 1W/2W/4W/8W CE/PE candidate options, two original NO_ENTRY days and original 448 native L1 synthetic records.
2. Independently lock original OOS decision count, NO_ENTRY decision count, total originally listed CE/PE decision-contract pairs, NO_ENTRY option-pair count and original native CSV row count. An attractive first-next-opening BID or unselected alternative cannot shrink the denominator.
3. Parse original native CSV best bid/ask, displayed bid/ask depth, eventAt, claimed originalAvailableAt. Require eventAt not later than claimed availableAt. For EACH original decision and EVERY original listed contract, count at-decision alleged available source quotes only if **both** eventAt and claimed availableAt are no later than decisionAt, quote age at most the predeclared maximum, nonzero BID and ASK prices and sufficient displayed depth in WHOLE LOTS. No future quote may stand in for a past decision.
4. Count separate **source event at/before decision but claimed availability after decision** cases, original listed pairs with no claimed as-of quote, listed pairs with post-decision source quotes and archive-received-after-original-decision pairs. Group by owner-claimed regime × 1W/2W/4W/8W × CE/PE, preserving original NO_ENTRY alternatives as *unentered source candidates*, NOT executed positions.
5. Source eventAt and claimedAvailableAt can be fabricated, including by copying old clock values into a later archive. A single operator can modify one source row to claim arrival at the precise original decision and re-sign/re-pin every fake supplier, issuer, registrar and witness file. The code may then report one **claimed as-of candidate**—but real original client capture count stays **ZERO**, official exchange/vendor authenticity FALSE, original bid/ask fillability FALSE, original option returns/profit proof FALSE and execution authorization FALSE.
6. If an operator invents thousands of later session-closing BID marks through an 8W expiry and re-signs all source documents, it cannot repair **missing decision-time as-of quotes**. Moreover, even if every reported software as-of quote were present, an all-owner-created source remains NOT independently verified.
7. Keep long-call/put **entire paid premium debit at risk** (plus fees). Option premium +50/+70 rise/giveback and a NIFTY underlying +100 index-point target are different measures; a quoted stop or trailing stop does not imply exchange execution across an overnight gap.

## Outcome taxonomy

- INVALID_EVIDENCE: mutated Phase73 complete source/pins, changed independently pinned Phase74 as-of/depth policy or an attempt to allow retrospective source downloads to impersonate original client receipt.
- INCOMPLETE_EVIDENCE: Phase73 nested source audit invalid, original listed/no-entry/fold/quote denominator changed, malformed original source clocks or retrospective package acquisition chronology inconsistent.
- DESCRIPTIVE_NO_CLAIMED_ASOF_QUOTES_RETROSPECTIVE_ONLY: zero original listed contracts have even an internally claimed quote arriving by the decision. The current 4-date synthetic source correctly produces this result for ALL 32 original listed CE/PE pairs.
- DESCRIPTIVE_CLAIMED_ASOF_MARKS_BUT_CLIENT_CLOCK_UNVERIFIED: at least one owner-declared quote passes software timestamp and depth rules. This **never means actual historical client observation**, authenticated issuer data, license, no-lookahead strategy success or broker execution.

All statuses remain OFFLINE descriptive evidence, never a trading permission. Always: externally verified original client capture pairs = 0, real original market-data rights = FALSE, official contract/session calendar = FALSE, authentic source originalAvailableAt = FALSE, genuine causal entry backtest from this particular untrusted package authorized = FALSE, actual option fill = FALSE, proven multiregime full-duration returns = FALSE, ideal expiry recommendation = FALSE, paid premium loss eliminated = FALSE, broker-native NRML/GTT/stop child ACK = FALSE, executionAuthorized = FALSE, productionSafe = FALSE, nativeOrderInstruction = null.

## Verification

Fixture: src/quant/tests/phase74_synthetic_causal_replay_fixture.ts

Tests: src/quant/tests/ema15m_adaptive_phase74_retrospective_causality.test.ts

**16 adversarial cases** include original 32 listed CE/PE pairs/16 no-entry alternatives across 1W/2W/4W/8W, original event exactly at decision with receipt 5 seconds after, source quotes from future snapshots, all 448 historical rows claimed to precede later archive receipt, artificially immediate original quote arrival after re-signing all owner-controlled documents, fake complete full-8W daily option history, tightened original quote display depth, changing preregistered stale-quote policy, disabling required contemporaneous client capture, changed parent/source pins, original NO_ENTRY and full listed denominator mutations and no confirmed profit/NRML stop/index-target inference.

Dedicated: .github/workflows/adaptive-phase74-retrospective-causality.yml runs TypeScript and all 16 tests; first dedicated code run PASSED 16/16. Phase50–74 focused synthetic offline suite, EMA safety regression and production build remain separate required CI gates. Synthetic passing tests do NOT establish historical NIFTY option profitability.

## Owner-only offline command

Two separate owner-only 0600 JSON files in 0700 directories are required; OS/container externally enforced network no-egress is mandatory. This CLI does not implement a network sandbox, validate legal licence, call official issuer or place broker orders.

    npx tsx scripts/audit-adaptive-phase74-retrospective-causality.ts \
      --approve-isolated-offline-review \
      --private-phase74-original-retrospective-dossier /private/phase74-original-source.json \
      --independent-phase74-asof-decision-pins /private/phase74-original-oos-pins.json

Only aggregate source counts by owner-claimed regime/horizon/option CE/PE and permanent nontrust flags are emitted. No instrument symbols, raw quote prices, original market dates, strike, source record identifiers, signed contracts or account data are printed.

## Next external prerequisites

Obtain genuine, independently legally licensed original index-option Level-1 BID/ASK/depth, actual source event clock provenance and official time-stamped contract/expiry/trading-calendar source, including ALL originally listed options and sessions through 1W–8W expiry; genuine strategy-side original receipt clock only where contemporaneously recorded. Conduct untouched multi-market-cycle OOS with predeclared market regimes, option premium/underlying target separation, theta/IV, spread, slippage, depth, partial +50/+70 premium giveback and entire long option paid-debit downside. Separately demonstrate real broker NRML GTT/stop lifecycle, child exchange ACK, rejected/nonfilled and overnight gap behavior.

Release issues #17–#22, especially #20, remain OPEN. All stacked research PRs remain DRAFT/unmerged. The EMA23/50 MIS 15:15 intraday square-off stays unchanged. The NRML 1W/2W/4W/8W positional module is NOT activated and NEVER forced to exit at 15:15 by this research phase.
