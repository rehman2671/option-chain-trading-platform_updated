# Adaptive Swing v2 Phase49 — exact original option L1 availability and quote-sequence gate

**DRAFT research-only; stacked on Phase48. NO licensed original L1, independently proven exchange timestamps, real broker order, stop ACK, NRML order/GTT write, or production authorization.**

## Problem and narrow fix

Phase48 already required the same selected original option contract, expiry, quantity, bid/ask, depth and event times in the entry-first OOS historical universe and the Phase46/47 gap/Greek path. However, the historical `executionQuotes` rows did **not** carry the original source's availability time. The Phase46 path could therefore supply an earlier `availableAt` without proving it was the availability time of that exact original historical quote. Also, merely finding the nominated preclose and next-session snapshots in the source universe did not prove they were the latest *available* preclose observation and the **first** following-session observation. These are historical look-ahead/selection-bias vulnerabilities, not evidence of actual executed orders.

Phase49 hardens the existing pure offline Phase48 join rather than creating any new strategy or brokerage execution path:

1. `HistoricalExecutableQuote.availableAt?: string` is optional for old historical callers, but **required for every selected contract's relevant Phase49 risk-join window**. Missing, invalid or retroactive source availability rejects the matched risk path. Source-original `availableAt` must byte-match the corresponding Phase46 entry, preclose and next-open `availableAt` and event/BID/ASK/depth fields. An entry quote must have been available no later than the Phase46 entry decision.
2. The full original selected contract sequence is examined from original entry through original first next-session quote, not only three favorable manually chosen points. Its **latest original observation actually available by the declared preclose checkpoint** must be the nominated preclose quote. A subsequent quote with availability after that checkpoint is not incorrectly used in the past.
3. The nominated next-session opening observation must be the **earliest historical observation after the entry IST session** for the selected contract; a later convenient BID cannot replace it. Only an exact source timeline is accepted. This remains an operator-supplied historical timeline without independently authenticated vendor/exchange market-hours, holidays or corrections.
4. An invalid match returns Phase48 `INCOMPLETE_EVIDENCE` and `OOS_SELECTED_ENTRY_MISSING_EXACT_ORIGINAL_RISK_PATH`, keeping the original 3 strategy arms × 4 horizons × all OOS decision attempts in the denominator. No missing or inconsistent quote becomes zero PnL or a win. The maximum passing state **remains `DESCRIPTIVE_COMPLETE_SELECTED_ENTRY_COVERAGE_ONLY`** for the tiny operator-selected four-path slice.
5. Phase48 manual owner-private 0600/0700 no-egress CLI remains unchanged except the stronger audit requirement. Input hashes must be recomputed by the operator and independently pinned beforehand; rehashing a manipulated dataset locally does NOT prove authenticity.

## Synthetic adversarial regression

Existing `ema15m_adaptive_upstox_phase48_oos_greek_risk_join.test.ts` now places `availableAt` in the original historical source (not only the separate Greek/gap report) and tests: altered entry availability with prices unchanged, missing preclose availability, altered preclose or next-open availability, earlier true next-session quote, later preclose quote available before the checkpoint, and later preclose quote not yet available (must not create future look-ahead). Tests are **synthetic software invariants**; they neither provide vendor data nor demonstrate profitable positions.

## Deployment scope remains blocked

- No original licensed F&O best bid/ask/depth or independent exchange timestamp/market-calendar/lot-size authentication.
- No large chronological entry-first OOS sample of all selected, discarded, unpriced, expired contracts with fair costs/slippage and stress across market regimes.
- No exchange-confirmed protection, native order/GTT lifecycle guarantees, overnight liquidity, stop execution or loss cap.
- No profitable NRML strategy has been established; green CI checks only integrity of fabricated fixtures.

Never promote `executionAuthorized`, `productionSafe`, `chronologicalOosProfitabilityProven`, `nativeBrokerStopsInstalled` or `protectedOvernight`: all stay **false**; `nativeOrderInstruction=null`. Keep blockers #17–#22, including #20, OPEN. Existing EMA23/50 **MIS** automatic 15:15 square-off is untouched; **NRML positional** 1W/2W/4W/8W does not get a forced 15:15 exit or any new live automation.

Sources discussing *types* and licenses, not project data entitlements: NSE real-time subscription https://www.nseindia.com/static/market-data/real-time-data-subscription ; historical data https://www.nseindia.com/static/market-data/eod-historical-data-subscription ; usage policy https://www.nseindia.com/static/market-data/nse-data-policy .
