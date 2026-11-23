# Adaptive Swing v2 — Phase68 full-duration option-premium BID censoring and synthetic TLS time fix

**DRAFT · OFFLINE RESEARCH ONLY · stacked on Phase67 PR #72. No live broker/NRML/GTT/stop writes, best-contract recommendation or forced positional 15:15 square-off.**

## Two real research-integrity problems addressed

**First: Phase42 full regression was RED.** The existing original Upstox GET-receipt synthetic test generates a *new* fake TLS certificate with \`openssl req -x509 -days 365\`, which defaults its \`notBefore\` to the CI runner's current clock. But the fixed original test receipt claims a 2026-11-20 15:25 IST capture and later a 2026-11-23 09:20 IST capture. On November 20, 2026 the fixture certificate can be generated **after** the first claimed historic capture, and the real X509 date check correctly rejects it. Five Phase42 tests failed in the larger EMA regression; this is NOT evidence that certificate checks should be disabled.

Phase68 fixes **only the test fixture** \`src/quant/tests/ema15m_adaptive_upstox_phase42_raw_get_receipts.test.ts\`: OpenSSL's local ephemeral \`ca -selfsign -startdate -enddate\` signs test-only, clearly fake \`api.upstox.com\` and wrong-domain TLS leaves with an explicitly valid **2020–2030** fixture certificate validity interval. This allows each synthetic 2026 claimed receipt to be compared as intended. **The production X509 SAN, certificate validity, SPKI pin, synthetic self-signing nontrust and original receipt verifier are unchanged.** A fake matching SAN never proves a genuine Upstox handshake. This correction restores historical-date test determinism without trusting any external server or broker response.

**Second: next-open quotes do NOT establish 1W, 2W, 4W or 8W positional holding results.** Phases66–67 verify a completely new vendor-candidate original option tape and a separately supplied issuer-like expiry/session catalog. Both remain **operator-authored, unlicensed/unverified** in synthetic tests, and their quote-coverage checks ensure decision-to-close and first-next-session records only. That is essential for intraday and overnight price availability but is NOT enough to assess any hypothetical position held to its original option expiry, especially theta/IV decay and later gap/nonfills.

## What Phase68 adds

\`src/server/engine/ema15m/adaptivePhase68OriginalDurationCensoring.ts\` implements \`auditPhase68OriginalDurationCensoring(input,pins)\`, an offline, independently pinned, original long-option quote-mark **censoring and reversal** report:

1. Re-audit **the full Phase67 → Phase66 independent new-vendor original L1 source/issuer-like master/expiry/calendar chain** and separately pin complete Phase67 inputs/pins, the preregistered quote-censor/alert policy, the full originally listed decision-contract denominator and separate original NO_ENTRY and ENTRY_CLAIMED day counts. No original OOS decision or losing/unpicked option is discarded.
2. Cover **every** originally listed 1W/2W/4W/8W × CE/PE option at every OOS decision, including NO_ENTRY sessions. All originally listed option duration/expiry alternatives are tracked for quote completeness. NO_ENTRY dates are **not** treated as broker positions or filled historical trades.
3. For every declared trading session between the original decision and the **claimed last tradable expiry session**, require original Level-1 BID marks received before that session's close, a specified minimum displayed BID depth and a *recent-enough* final BID relative to that session's close. An early-morning print is not a certified last-price/stop fill at market close. Missing any session-close BID leaves that listed candidate **CENSORED**, even if the next opening quote was available and favorable. **A later archive or fabricated calendar does not prove the list of all intervening real exchange trading days is exhaustive**; even fully matched operator-declared sessions remain unverified.
4. On original decisions labeled ENTRY_CLAIMED only, inspect the first *claimed* original ASK available after decision within a separately pinned maximum acquisition delay. Do **not** say the strategy purchased that option at that ASK: no instrument selection/execution or actual broker fill is present. No original eligible ASK → count missing quote evidence, not zero-PnL.
5. Using original claimed-available-at BID marks (never execution fills), count **adverse first-next-open BID gaps** relative to the prior session's last available BID; and **option premium run-up followed by giveback** before original claimed last-trade, under separately frozen point thresholds. A synthetic BID climbing to +69 option-premium points above initial hypothetical ASK and then giving back 70 points is flagged. Thresholds are *option PREMIUM points*, not underlying NIFTY index points. An underlying \`+100 NIFTY points\` target **cannot be evaluated from option L1 quotes alone**. These alert counters do not select a target, trigger an order, reconstruct a trailing-stop fill or imply profitability.
6. Every long option can lose the **entire premium debit paid**, irrespective of an attractive intraday mark, quoted stop trigger or a favorable first next-open BID. The auditor never promises native overnight stop/GTT fill, intraday liquidity or exit before expiry. Exit-to-premium decay, IV/theta, slippage and cumulative market-regime OOS performance remain uncalibrated until real source and genuinely full hold histories exist.
7. Aggregate counts by *operator-claimed* regime × 1W/2W/4W/8W × CE/PE only. No source instrument names, option quote prices, source payload/clock or trade account data are published by the owner-private CLI.

**Output states:** \`INVALID_EVIDENCE\` (changed source/policy pins), \`INCOMPLETE_EVIDENCE\` (Phase67 proof or original no-entry/listed-option denominator invalid), \`DESCRIPTIVE_MULTIWEEK_MARKS_CENSORED_ONLY\` (one or more originally listed options missing original claimed-available BID session marks through last tradable expiry), and \`DESCRIPTIVE_DECLARED_SESSION_MARKS_PRESENT_BUT_UNVERIFIED\` (all *operator-declared* trading-session quote marks exist, but original source/calendar completeness, independent vendor provenance, actual holding and fills are all unverified).

The current synthetic 4 original OOS decision dates (2 NO_ENTRY), 32 complete originally listed CE/PE option candidates, 2 owner-claimed regimes and 448 source Level-1 prints yield **32 censored holding paths**: only the decision and first-next-session quote snapshots exist, not real full 1–8-week histories. This is the correct result; a green Phase66/67 original-source audit did not prove any 1W–8W strategy worked.

## Never-promote trust boundary

All of the following stay hard false:

- historical vendor/exchange archival origin and genuinely licensed L1 use; independently complete official issuer session/expiry/lot master; historically trusted source event and strategy-side original \`availableAt\` clocks (bulk downloads can NOT retroactively establish them)
- a real executable original option ASK purchase or BID sale; actual full-duration held positional exit; real IV/theta/overnight gaps/slippage; multi-regime OOS profitability; strategy-appropriate expiry selection or \`+100\` *underlying index-point* target evaluation
- complete premium-debit-loss protection; broker-native NRML/GTT/stop placement/change/cancellation/child order/exchange ACK, overnight persistence or stop nonfill guarantee
- \`executionAuthorized\`, \`productionSafe\` and every live native order/GTT instruction (\`nativeOrderInstruction=null\`)

All of this is research diagnostics, NOT permission to trade or evidence to merge an unreviewed research chain into a production bot.

## Tests and CI

\`src/quant/tests/ema15m_adaptive_phase68_original_full_duration_censoring.test.ts\` has **14 adversarial cases** using the independent Phase66 new-vendor + Phase67 fake issuer-like historical source (NOT the old Phase50–65 source):

- All original 32 all-listed CE/PE candidate holding paths censored, despite first-next-open gap quotes and full first-day L1 coverage.
- 16 owner-claimed ENTRY candidates have hypothetical initial ASK marks; the 16 NO_ENTRY option pairs remain no-entry, not 16 fictitious purchases.
- The 16 first-next-open adverse BID gaps are source marks, never broker stop fills; source premium +69 run-up then 70-point giveback flags one path without creating a 1W–8W success.
- A quote first received 15 minutes after the decision cannot be treated as decision-time ASK; no lookahead. Altered original NO_ENTRY day, original candidate/source/pins and post-hoc threshold tuning fail closed.
- Historical option L1 alone cannot test an underlying NIFTY +100 index-point objective; false fill/profit/stops/real issuer assertions are forbidden.
- Tightening final-session closing-BID freshness or changing the adverse-gap threshold cannot repair missing multiweek option quote histories or create synthetic fills.

The dedicated Phase68 CI intentionally ALSO runs the **12 original Phase42 synthetic TLS receipt tests**, to verify the previously failing full-suite fixture deterministically. On tested code, **26/26 tests and TypeScript passed**, 0 failed: https://github.com/rehman2671/option-chain-trading-platform_updated/actions/runs/44717539533. Phase50–68 focused, unchanged EMA targeted invariants, production build and complete \`npm test\` must still pass separately; do not claim these are green while queued/running.

## Owner-only offline command

Keep two separate owner-controlled \`0600\` JSON files in owner-only \`0700\` directories, and enforce external OS/container no-network-egress. This CLI never connects to vendor or broker, downloads market data, modifies stops/orders or accesses accounts.

    npx tsx scripts/audit-adaptive-phase68-original-duration.ts \
      --approve-isolated-offline-review \
      --private-phase68-original-duration-dossier /private/phase68-original-source.json \
      --independent-phase68-locked-oos-risk-pins /private/phase68-pins.json

Only aggregate regime/horizon/CE-PE source-maturity censoring, premium-reversal/gap-alert counts, and hard-false trust flags are printed. A zero exit means **descriptive local source review**, not production-safe, audited market fills or historically licensed data.

## Next external and release blockers

To complete a genuinely meaningful 1W–8W study, legally procure independently verified original historical F&O option best BID/ASK/depth with **every actually listed candidate and all intervening trading sessions through original contractual holding/expiry**, independent official point-in-time expiry/lot/calendar, and contemporaneous strategy receipt records **if truly captured**. Treat unknown historical client availability as **unknown**, never fabricated; preserve true missing/illiquid/options-disabled data, long paid-debit risk and partial premium reversals. Freeze regime classification, original entry/exit/trailing and expiry policy BEFORE genuine untouched multi-cycle OOS evaluation. Separately demonstrate actual broker-native NRML stop/GTT lifecycle including reject/nonfill and overnight gap handling.

Release issues #17–#22 remain OPEN, particularly #20. Stacked research PRs DRAFT/unmerged. Existing EMA23/50 **MIS intraday 15:15 auto-square-off unchanged**, while positional 1W–8W **NRML is not force-exited at 15:15 and Phase68 enables no live orders/GTT/stops**.
