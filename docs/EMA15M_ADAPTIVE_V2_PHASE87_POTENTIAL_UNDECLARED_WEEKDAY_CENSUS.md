# Phase87 — Candidate omitted weekday census for original option holding paths

**DRAFT, original all-listed 1W–8W option L1 OFFLINE RESEARCH ONLY.** Stacked on Phase86 Draft PR #91. No licensed vendor data, broker stop/GTT, option orders or production enablement.

## Problem

The previous original native L1 auditor checked best-BID depth **on sessions present in an operator-supplied declared-session list**, but omitted dates were invisible. Removing a Tuesday, deleting its source quote rows, and re-pinning the supplied files could leave every **remaining** declared closing BID accounted for. The last-declared-session-versus-expiry tolerance of four calendar days could also hide an omitted Friday expiry session if the last listed session was Thursday. Such a report overstates completeness of the retrospective premium-path calendar.

An absent Monday–Friday is **not** automatically an exchange trading session: NSE/BSE can declare holidays and special weekend sessions. No locally constructed weekday rule substitutes for a real independently authenticated point-in-time exchange trading/expiry calendar.

## Implementation

For each originally listed contract **including NO_ENTRY** alternatives, Phase87:
- Counts calendar Monday–Friday dates from original decision `sessionDate` through the contract's declared `expiry`, inclusive; weekends are excluded.
- Subtracts only the Monday–Friday sessions explicitly contained in the independently pinned **but operator-claimed** `declaredSessions`.
- Flags any shortfall with `originalPairsWithPotentialUndeclaredWeekdays` and `potentialUndeclaredWeekdayObservations` (one candidate observation per missing weekday × affected original contract-decision pair), both overall and within regime × 1W/2W/4W/8W × CE/PE cells.
- Forces `DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING` and safe fixed reason `POTENTIAL_UNDECLARED_WEEKDAY_REQUIRES_OFFICIAL_HOLIDAY_CALENDAR` when candidate gaps exist. This reason explicitly **does not assert the exchange was open** or prove the vendor lost quotes: it means the session coverage cannot be established without authoritative holiday/session data.
- Uses O(1) full-week arithmetic with at most six tail-day checks, plus the Phase85 sorted declared-weekday index and binary-search bounds to avoid new per-tick scans.
- Propagates only bounded aggregate counts to the Phase80 owner-private retrospective report; no raw dates, option identifiers, quotes, broker/account identifiers or source rights are exposed.

As before, session manifests and SHA pins are **self-attested**, not issuer signatures. Absent original strategy-client receipts, incomplete original L1, invalid source rights, verified holidays, option IV/theta, actual fills, or native broker stop ACK all remain blockers. This conservative candidate-weekday check **cannot detect missing actual source ticks inside declared sessions**, and a valid holiday can produce a suspected gap until separately authenticated.

## Regression

Five Phase87 synthetic Phase79 tests cover complete baseline, deleted internal Tuesday despite good remaining closes, deleted Friday at expiry, two missing weekdays counted per listed pair, and weekend exclusions. One Phase80 owner-private redaction test checks truncated calendar candidate counts with no original date/option leakage. Existing 95 tests plus six new tests = **101 expected** in dedicated CI. Phase50–87 focused research regression, EMA15M safety, full regression and production build are separate gates.

**No merge, release or live order authorization.** Existing MIS 15:15 logic is unchanged, and a 1W–8W NRML positional strategy is never forced to 15:15 expiry-independent square-off. Broker-native stop/GTT child exchange ACK, partial fill/nonfill and restart risk remain unverified release blocker #20, alongside #17–22. A green synthetic suite is not real profitability or production safety.
