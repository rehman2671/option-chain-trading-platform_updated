# Adaptive Swing v2 Phase81 — closing BID as-of and next-open visibility censor

**DRAFT / OFFLINE / NO TRADING.** Stacked on Phase80 Draft PR #85. This phase corrects two concrete historical option L1 observational errors in Phase79/80; it neither authenticates a vendor nor authorizes any strategy or broker operation.

## 1. Causal session-close quote

A historical best BID quote with eventAt=15:29 and owner-claimed availableAt=15:31 is **not** an available 15:30 close mark. Phase79 formerly required eventAt within the final closing window but did **not** require claimed availableAt <= that declared session's close. Phase81 now requires both clocks to fit the session, plus strictly positive bid and displayed depth meeting the registered lot threshold.

The same availability guard applies when replaying all post-decision premium BID observations for +50/+70 givebacks and theoretical trailing alerts. A post-close arrival cannot be retroactively used as an intraday observed reversal. Missing or zero-price closing marketability is marked **CENSORED**, not zero execution, loss, guaranteed stop exit, or profitable mark.

The date, open and close come from an **operator-declared** session list, not an authenticated NSE/BSE exchange calendar. This is a rule about the claimed data's internal causality only, not a proof that a strategy client actually received any quote.

## 2. New-peak overnight first-open observation

After a NEW observed premium BID peak reaches the owner-pinned arming threshold, Phase81 expects a depth-positive, receipt-time-available **first bounded opening BID** at the immediately following declared session, provided that session is within the listed contract's claimed expiry. If that evidence is missing, zero-depth, zero BID or delivered after the predeclared opening window, the result increments:
- `entryPairsMissingBoundedNextOpenAfterNewArmedPeak` on Phase79/Phase80 aggregate reports
- `entryClaimedPairsMissingBoundedNextOpenAfterNewArmedPeak` in a regime x tenor x side cell

A missing required open forces `DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING` in Phase79 and adds the fixed reason `MISSING_FIRST_BOUNDED_NEXT_OPEN_BID_CENSORS_OVERNIGHT_GAP_INFERENCE`. Phase80 retains its retrospective/non-authenticated classification while propagating the new count.

**Scope**: only NEW observed arming peaks create this focused next-open completeness check. It is not continuous intraday L1 tape validation, and it does not prove all remaining sessions had a usable opening BID. A counted gap is one descriptive quote-path observation, not a broker native stop trigger, exchange ACK or executable fill; unobserved gaps remain unknown.

## Test evidence and safety restrictions

Eight Phase81 adversarial cases are appended to Phase79's test file: as-of close with delayed receipt, zero-priced BID with positive displayed depth, late low quote creating a fictional giveback, absent next open, late next open, zero-depth next open, higher peak in later session, and healthy baseline. Existing Phase79 (24) + Phase80 (23) tests also run; dedicated Phase81 CI invokes both (55 total). Focused Phase50–81 and broad EMA15M safety/full regression/build must pass separately.

No genuine licensed original 1W/2W/4W/8W option data was acquired or verified. This patch cannot prove historical client clock, legal source entitlement, profitability, volatility regimes, IV/theta, spreads, slippage, authenticated exchange session/lot/expiry master, or broker stop/GTT fill survival. No live access, broker API, order writes, expiry rollover, or NRML 15:15 square-off is added. The existing MIS 15:15 logic is untouched; release issues #17–22 including #20 remain OPEN.
