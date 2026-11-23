# Adaptive Swing v2 Phase69 — historical option weekday calendar blind-spot and BID acquisition audit

**DRAFT / OFFLINE RESEARCH ONLY / stacked on Phase68 Draft PR #73. No live broker orders, NRML stops, GTT writes, best-contract recommendation or forced positional 15:15 exit.**

## Why this phase

Phase68 correctly CENSORS a 1W, 2W, 4W or 8W hypothetical original option position when an **operator-declared** trading session lacks an original recent BID quote before its close. This prevents treating the next-day opening BID as evidence of a complete multiweek exit. There is a further source-integrity problem: an operator can fabricate BOTH the Phase66 vendor session calendar and Phase67 issuer-like session calendar, omit weeks of actual trading sessions, delete the source quotes for those dates and recompute all locally controlled SHA256 pins. Phase68 might then consider every *remaining declared session* covered.

Phase69 adds a second **Monday–Friday potential-session gap probe** across each original listed contract's calendar interval, from original decision date through separately claimed last-tradable expiry. Monday–Friday dates are **potential missing market days, NOT confirmed NSE/BSE sessions**. Public holidays, extraordinary exchange closures, special Saturday/Sunday sessions and changes to expiry require a genuine independently authenticated official point-in-time exchange calendar. No weekday heuristic can prove exchange opening or expiry settlement.

## Source contract and predeclared policy

Source: src/server/engine/ema15m/adaptivePhase69CalendarBlindSpots.ts

The auditPhase69CalendarBlindSpots(input,pins) function re-audits the full Phase68 → Phase67 → Phase66 owner-provided source, issuer-like original contract master and original option Level-1 BID/ASK quote tape. It separately hashes the full Phase68 source/pins and prespecified gap policy, and pins all OOS decisions, original NO_ENTRY days and every originally listed CE/PE option pair. It never selects favorable surviving contracts or turns no-entry options into real positions.

For each original 1W/2W/4W/8W × CE/PE listed decision-contract pair:

1. Count all Monday–Friday candidate dates through alleged last-tradable expiry. Distinguish dates present in the operator-declared trading calendar from unexplained missing weekday candidates. Include distinct potential missing dates, longest consecutive candidate weekday blind spot and counts grouped by owner-claimed decision-time regime × horizon × CE/PE.
2. For **every operator-declared session** (including special weekend sessions explicitly in that claimed calendar), independently require recent original pre-close option best BID marks with displayed BID quantity in whole lot units, original eventAt inside the session and claimed original availableAt before close. The source must meet the predeclared minimum BID mark count and maximum age before close.
3. Count both **unknown weekday calendar candidates** and **missing/stale or low-depth BID marks within declared sessions**. A contract can have either or both missing evidence categories. Retain all original NO_ENTRY options for acquisition coverage, but they are never entered positions or executable trades.
4. Carry forward Phase68's option-premium BID run-up-then-giveback and adverse first-next-session bid-gap alert counts as **quote-only** risk indicators. These cannot test a +100 **NIFTY index-point** target from option-only quotes. Never infer a profitable exit, a fillable trailing stop or an optimum expiry.
5. Always disclose that **the entire paid long-option premium debit may be lost**, plus applicable fees. A displayed option bid or scheduled GTT does not guarantee exchange acceptance, overnight protection or an exit before expiry.

## Only descriptive states

- INVALID_EVIDENCE — modified independently frozen source, policy or pins.
- INCOMPLETE_EVIDENCE — invalid Phase68/67/66 source, contract manifest or original OOS no-entry denominator.
- DESCRIPTIVE_WEEKDAY_CALENDAR_BLIND_SPOTS_ONLY — one or more potential Monday–Friday dates missing from the operator-declared calendar. A genuine holiday versus missing market session remains unresolved until official issuer verification.
- DESCRIPTIVE_DECLARED_CLOSE_BID_SOURCE_GAPS_ONLY — no potential weekday holes, but claimed exchange-like sessions lack recent/adequate option BID source marks.
- DESCRIPTIVE_NO_DETECTED_WEEKDAY_GAPS_BUT_SOURCE_UNVERIFIED — all supplied weekday candidates and full-duration closing BID marks internally agree. **A malicious operator could fabricate this state. It never means a genuine official exchange calendar or profitable 8W strategy was verified.**

Every status is OFFLINE source-acquisition evidence only. Original full-duration market calendar accuracy, valid licensed vendor origin, true historical strategy receive clocks, official expiry/lot, actual option ASK purchases / BID sales, real IV/theta/spread/slippage, out-of-sample profitable contract/expiry ranking, broker-native NRML/GTT/stop ACK, trade execution and production safety remain unverified. The report permanently sets executionAuthorized=false, productionSafe=false and nativeOrderInstruction=null. All 32 original synthetic candidate full-duration paths remain *externally unverified* even when fabricated BID data has no internally detectable gaps.

## 15 adversarial synthetic tests

Test: src/quant/tests/ema15m_adaptive_phase69_calendar_blind_spots.test.ts

The fixture uses the NEW Phase66/67/68 synthetic source: four original OOS decisions (two NO_ENTRY), two chronological heldout folds, two unverified regime labels, 32 complete original CE/PE listed option pairs across four expiry buckets, and source BID/ASK.

Key adversarial test: fabricate full daily option closing BID quote marks on **every potential Monday–Friday** through each original claimed expiry, updating both source and issuer-like calendars and local pins. At that point Phase68 sees every *declared* session marked. Then maliciously delete March 2, 2026 from BOTH pretend calendars, remove all original option quotes for that date, renumber raw source sequences and rehash both archives and independent pins. Phase68 can still see every *remaining* declared session covered. **Phase69 MUST detect the missing weekday candidate**, while explicitly not claiming March 2 was an authenticated exchange trading day.

Other tests prove: owner-fabricated daily quotes with zero internal gaps NEVER authenticate the issuer or prove broker fills; explicit weekend special sessions still require original BID evidence; zero displayed BID depth or stale marks fail source coverage; posthoc threshold changes fail frozen policy hash; relaxed predeclared weekday-gap tolerance cannot erase absolute missing-date counts; original no-entry and all listed CE/PE records stay in the denominator; altered purported expiry fails; premium rise/giveback and next-open adverse BID gap remain quote-only, not stop fills, index-point target evidence or full premium loss protection.

Dedicated CI: .github/workflows/adaptive-phase69-calendar-blind-spots.yml runs TypeScript and 15 tests. Phase50–69 combined focused, EMA targeted safety, production bundle and full regression must pass separately. Synthetic CI green is NOT historical trading profitability or launch approval.

## Private offline data procurement audit

The CLI is scripts/audit-adaptive-phase69-calendar-blind-spots.ts. Require separate owner-only 0600 JSON files in 0700 directories under externally enforced OS/container no-network-egress. Node itself does not provide a genuine network sandbox or exchange issuer trust.

    npx tsx scripts/audit-adaptive-phase69-calendar-blind-spots.ts \
      --approve-isolated-offline-review \
      --private-phase69-full-duration-dossier /private/phase69-original-source.json \
      --independent-phase69-acquisition-gap-pins /private/phase69-pins.json

Output is aggregated by claimed regime/horizon/CE-PE only, never exact missing calendar dates, contract instrument IDs, strike, option prices, source receiving times, vendor/legal files, pins or brokerage account data. Zero exit means internal descriptive source consistency, not certified exchange data or permission to trade.

## Real external blockers and product distinction

To study a 1W–8W positional strategy responsibly, obtain genuinely licensed historical option best BID/ASK + displayed depth, independently verified full historical exchange session/holiday/special-day and point-in-time contract expiry/lot master, true original strategy-side availableAt when contemporaneously recorded (not later archive download), complete unselected/no-trade/censored quote history through the proposed hold period, and untouched multi-cycle market-regime OOS with predeclared entry/exit, IV/theta decay, spreads, option-premium reversal, gap nonfill and possible **100% paid premium debit loss plus fees**. A derived option premium BID signal is never proof of fillability or a +100 NIFTY index-point target.

Separately verify broker native NRML GTT/stop placement/modify/cancel/child/exchange ACK, overnight persistence and nonfill. Release blockers **#17–#22**, particularly **#20**, remain OPEN; all stacked research PRs DRAFT/unmerged. Existing EMA23/50 **MIS intraday 15:15 auto-squareoff unchanged**, while positional 1W/2W/4W/8W **NRML never force-exits at 15:15 and Phase69 enables no broker order, GTT or native stop writes**.
