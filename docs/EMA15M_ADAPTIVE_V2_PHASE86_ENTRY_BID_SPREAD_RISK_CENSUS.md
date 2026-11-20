# Phase86 — Same-snapshot option entry liquidity and severe quoted spread census

**DRAFT · OFFLINE ORIGINAL-L1 RESEARCH ONLY · NO TRADING.** Stacked on Phase85 Draft PR #90. No genuine licensed market-data source was obtained or broker order/stop route enabled.

## Problem addressed

A historic option contract may display an ASK price with enough quantity for a hypothetical long BUY, yet its **same source snapshot has no usable BID** or insufficient displayed BID depth to sell one lot. Phase79–85 only required an ASK and sufficient ASK quantity for claimed as-of entry coverage. Such a case could still display normal "descriptive quote-path complete" status, overstating a hypothetical positional long option's ability to exit.

Likewise, when the **same-snapshot quoted ASK minus BID** is as large as the owner's **already separately pinned `armingGainPremiumPoints`** threshold, the price difference between quoted buy and immediate quoted sell sides alone is at least the threshold that nominally arms the adaptive premium giveback alert. Treating that as an unqualified marketable starting point would hide severe spread risk. This condition is intentionally conservative and **not** a general acceptable-spread rule; smaller spreads can still be uneconomic after fees, IV/theta, slippage and queue priority.

## Implementation

Inside `auditPhase79OriginalPremiumPathCoverage()`:
- Continue selecting the latest source event/sequence that was available at the owner-claimed historical original decision (Phase83). Require a positive ASK and enough displayed ASK quantity for `claimedAsOfEntryAskPairs`, as before.
- For every `ENTRY_CLAIMED` original listed option **with a valid as-of ASK**, assess that **same quote's BID** separately. `BID <= 0` or displayed BID quantity less than pinned `minBestBidAndAskDepthLots * lotSize` increments `entryPairsWithUnmarketableDecisionBid`, with per-(operator-claimed regime, 1W/2W/4W/8W, CE/PE) cell count `entryClaimedPairsWithUnmarketableDecisionBid`.
- When `ask - bid >= policy.armingGainPremiumPoints` on that same original as-of quote, increment `entryPairsWithDecisionSpreadAtLeastArmingGain` and the corresponding cell count. This is the **operator-pinned predeclared comparator**, not a fabricated numerical spread parameter or historical PnL.
- Either positive counter forces Phase79 `DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING` with fixed safe reason codes. Phase80 private-file retrospective archive mode **remains retrospective/non-authenticated** while forwarding the two bounded aggregate counters. No raw quote, instrument key, account, source path, vendor identity or individual decision timestamp is returned.
- The original NO_ENTRY universe remains the complete holding-path denominator but does not create a hypothetical purchase, spread-risk entry or observed fill. Original 15:15 MIS and non-forced 15:15 NRML behavior are unchanged.

**Critical distinction:** "unmarketable" here means no *displayed lot-size BID in a privately claimed historical source snapshot*, not certainty that selling would have been impossible on the actual exchange. A usable displayed BID also does **not** mean an order would fill. These are **research data-quality and quoted-spread risk signals**, not executions, returns, real slippage estimates or confidence in vendor origin.

## Verification and blockers

Eight new synthetic Phase79 risk tests and one Phase80 private source redaction test run with all prior 86 synthetic cases (95 expected total), plus TypeScript check, Phase50–86 focused offline research, full EMA15M regression and production build as independent CI gates. The original source, dates, expiry/lot, source rights, client receipt and market regime remain only owner-claimed. No genuine licensed original 1W–8W native BID/ASK/depth source, official issuer-authenticated calendar/master, IV/theta/slippage OOS, real option entry/exit fills or broker-native NRML stop/GTT child exchange ACK has been independently verified.

Draft PR must remain unmerged and no live orders/square-offs are authorized. Release blockers #17–22 (particularly #20) remain open. **Synthetic CI does not demonstrate profitability or production safety.**
