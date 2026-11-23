# Adaptive Swing v2 Phase70 — third-source exchange holiday, closure and special-session candidate evidence

**DRAFT · OFFLINE RESEARCH ONLY · stacked on Phase69 Draft PR #74.** No network data acquisition, live broker orders, NRML positions, native stops, GTT writes, horizon auto-selection or forced positional 15:15 square-off.

## Why this phase

Phase69 catches Monday–Friday **potential market-session blind spots** when BOTH the candidate vendor and operator-created issuer-like historical calendar omit an intervening day in a proposed 1W–8W option holding period. A weekday can legitimately be an exchange holiday or extraordinary market closure, and some weekend dates can be real special trading sessions. Phase69 intentionally cannot declare missing weekdays to be real NSE/BSE sessions.

Phase70 accepts a **THIRD separately supplied, owner-custodied, all-day archive** claiming exchange holiday, regular open, emergency closure, ordinary weekend closure and special weekend open. It compares every original OOS CE/PE option contract's decision-to-last-tradable calendar-day span against this third source and existing Phase69 calendar gaps.

**A third operator-authored document and all its SHA256 pins are NOT independent official exchange authentication.** A single owner can fabricate vendor quotes, two calendars, a third issuer-looking calendar, favourable historical timestamps and all hash pins. The positive synthetic cases deliberately do so. Phase70 is a *calendar exception classification and data procurement review*, not a certified NSE/BSE market schedule, source entitlement, profitable position or execution system.

## Inputs and validation contract

Core: src/server/engine/ema15m/adaptivePhase70SessionExceptionEvidence.ts

The offline entry point is auditPhase70ExchangeDayExceptions(input,pins), which:

1. **Reaudits Phase69 → Phase68 → Phase67 → Phase66** complete NEW original vendor option L1 source, full OOS decision/no-entry/claimed entry fold denominators and all original listed CE/PE contracts for each 1W/2W/4W/8W horizon. Independently SHA256-pins the entire Phase69 source and pins, the THIRD raw exchange-like day archive bytes, the separate claimed issuer/archive references and complete original OOS, NO_ENTRY, all-listed contract and daily-calendar counts. No selected winners or unentered alternatives can be removed.
2. Requires a fully ordered, gap-free THIRD source day archive spanning the earliest original OOS decision to the **latest original claimed last-tradable option session**. Each calendar date must have exactly one day-status record, including weekends. There are five statuses:
   - REGULAR_OPEN, for an allegedly open Monday–Friday session;
   - SPECIAL_WEEKEND_OPEN, for an allegedly open Saturday or Sunday;
   - HOLIDAY_CLOSED, for an allegedly scheduled closed weekday;
   - EMERGENCY_CLOSED, for an allegedly unscheduled closed day;
   - WEEKEND_CLOSED, for an allegedly ordinary closed Saturday or Sunday.
3. Every third-source day has claimed publication and receipt timestamps. They must be internally ordered and no later than the day they purport to describe. A purported open session must additionally include the alleged open and close, with claimed notice receipt no later than session close. These timestamps remain self-supplied strings, NOT evidence of contemporaneous exchange delivery.
4. Cross-reconciles every original vendor/issuer-like declared session: an OPEN day must match the exact original open/close clocks; a third-source holiday/closure **cannot overwrite an original quoted OPEN session**. The original **first-next-open** day after each OOS decision must remain the same, rejecting a fictitious deleted/inserted opening date that would bias overnight option BID gap analysis.
5. Per original listed decision×contract pair, classifies every Monday–Friday day **missing from the Phase69 original declared calendar** as: claimed HOLIDAY_CLOSED, claimed EMERGENCY_CLOSED, or the third archive says REGULAR_OPEN while both original calendars lack that source trading day. These remain separately counted. The sum must exactly equal Phase69's frozen original missing weekday contract slots: no unclassified days can be quietly discarded.
6. Separately counts special weekend OPEN claims missing from source calendars. A Saturday or Sunday is NOT assumed closed merely because a weekday-only probe skipped it. If a weekend special session is in the source calendars, its original BID/depth coverage remains governed by Phase69; a third source cannot certify that an observed BID was an executable fill.
7. Tracks original declared holiday/emergency notice **claimed received after the original OOS decision time**. Such a closure could be reflected in later retrospective history, but could NOT be known to the original strategy at its earlier decision. A later bulk historical download must not backfill original availableAt.
8. Reports only aggregates by claimed regime × horizon × CE/PE and parent totals. No original instrument IDs, expiry dates, option premiums, source records, private issuer documents, client account information or calendar notice dates appear in the CLI.

## Outcome semantics — always unverified

- INVALID_EVIDENCE: malformed independent evidence pins, changed third source byte hash, inconsistent claimed archive/issuer identity or invalid schema.
- INCOMPLETE_EVIDENCE: preceding Phase69 source/denominator invalid; truncated or out-of-order all-day archive; impossible claimed notices; classified closed day conflicting with original open calendar; impossible weekend class; original first-next-session conflict; mismatch with frozen original missing weekday source denominator.
- DESCRIPTIVE_UNDECLARED_OPEN_SOURCE_SESSION_GAPS_ONLY: the third archive claims **regular open weekdays or special weekend OPEN** where the earlier source calendars lack those sessions. They are unverified acquisition gaps, not proof of real exchange opening.
- DESCRIPTIVE_CLAIMED_CLOSED_DAY_EXCEPTIONS_UNVERIFIED_ONLY: every missing original weekday has only an **operator-claimed** holiday or emergency-closure explanation. Source/calendar accuracy remains unverified; the claimed holidays cannot certify actual NSE/BSE closures.
- DESCRIPTIVE_INTERNAL_CALENDAR_RECONCILIATION_UNVERIFIED_ONLY: all supplied statuses internally agree, but even a fully fabricated archive may yield this outcome.

All versions hard-code independent official exchange holiday and special session issuer authentication = FALSE; original historical L1 vendor data licensing = FALSE; contemporaneous client availableAt and genuine real multi-regime OOS profitability = FALSE; observed option BID/ASK executable fill proof = FALSE; broker-native NRML GTT/stop/child exchange ACK = FALSE; best one-to-eight-week expiry = FALSE. The complete **paid long-option premium debit remains at risk**, in addition to applicable fees. executionAuthorized=false, productionSafe=false, nativeOrderInstruction=null.

The existing EMA23/50 intraday MIS 15:15 square-off is UNCHANGED. NRML 1W–8W positional research **never force-exits at 15:15**; no live trading, GTT or native stop API can be invoked by this module.

## Synthetic adversarial coverage

The fixture deliberately generates a fake third "exchange" archive from the Phase69 independent NEW synthetic vendor and issuer-like calendars. It spans the full original four OOS decisions (two NO_ENTRY), two fake regimes, two held-out folds, 32 full originally listed 1W/2W/4W/8W CE/PE pairs and their last-tradable sessions. No historical exchange product or legal licence is acquired.

The 17 adversarial tests verify:

- Every formerly missing weekday can be labeled an owner-claimed holiday and still fails independent official exchange identity; original all-listed OOS and no-entry denominators remain intact.
- A third archive OPEN on a weekday omitted by BOTH older calendars becomes an explicit missing source session; even if both vendor and issuer calendars delete March 2, 2026 and its quote data after a fully fabricated original BID tape, the separate pinned third OPEN record exposes the discrepancy.
- Owner-fabricated option BID marks and all three matching schedules can yield internal completeness but never profitable strategy, genuine exchange documentation or actual broker fills.
- Missing/truncated day entries, claimed holiday contradicting a source open session, fake calendar received after the alleged day, Saturday classified as regular weekday, claimed special weekend OPEN with missing original source, and declared Saturday special session still lacking BID/depth.
- Holiday versus emergency closure counts; a claimed notice received after the strategy's original OOS decision is NEVER contemporaneous decision-time evidence.
- Third source byte tampering, inconsistent alleged issuer identity, changed original NO_ENTRY OOS counts, and all hard-false market issuer/licence/trade/NRML/GTT flags.

Dedicated .github/workflows/adaptive-phase70-session-exceptions.yml runs TypeScript and all 17 tests. On the initial tested source commit, **17/17 tests passed**. Combined Phase50–70 focused offline research tests, EMA invariant safety, production bundle and full npm regression must pass independently before any merge discussion.

## Owner-private CLI

Use separate owner-only 0600 JSON files in owner-only 0700 directories and externally enforce OS/container **no network egress**. This command cannot verify exchange signer identity, license rights, actual at-time client receipt or broker order ACK.

    npx tsx scripts/audit-adaptive-phase70-session-exceptions.ts \
      --approve-isolated-offline-review \
      --private-phase70-calendar-exception-package /private/phase70-original-source.json \
      --independent-phase70-exchange-day-pins /private/phase70-pins.json

Only redacted aggregate research source gaps/classification counters and permanent nontrust flags are emitted. A zero exit means *operator-supplied descriptive calendar consistency*, NOT authenticated real market data or permission to trade.

## Real release blockers

Source procurement must obtain **official authenticated historical NSE/BSE F&O holidays, emergency closures and special weekend schedules**, official point-in-time option contract/expiry/lot master, a genuinely licensed historical best BID/ASK plus displayed depth feed covering every original unselected alternative, no-entry fold and every real trading session through original 1W–8W horizon, and actual original client quote reception records ONLY when contemporaneously captured. Later archives cannot manufacture what the strategy knew earlier.

Then freeze true untouched multicycle regime-based OOS option risk evaluation (underlying index target distinct from option PREMIUM points, theta/IV, spread/depth/slippage, premium run-up/giveback, adverse next-open gaps, potential full paid debit loss) with no hindsight horizon selection. Validate separately broker-native NRML GTT/stop placement/modify/cancel/child order/exchange ACK, overnight persistence, slippage/gap nonfill. GitHub blockers **#17–#22**, especially **#20**, remain OPEN; stacked research PRs remain DRAFT/unmerged.
