# Phase89 — First causally observed next-open option BID, not a later recovered quote

**DRAFT · OFFLINE RESEARCH ONLY · no live NRML, MIS change, broker access, market-data acquisition or execution.** Stacked on Phase88 Draft PR #93.

## Concrete issue fixed

Phase81–88 required a depth-positive bounded quote at the next declared session's opening after a new armed option BID peak. However, the algorithm first filtered zero-BID and sub-lot snapshots from the receipt-ordered native L1 stream and only **then** selected the first remaining, usable BID.

If an original 1W–8W CE/PE option had a zero-BID or insufficient depth at 09:15 and a marketable displayed BID at 09:16, that 09:16 quote could incorrectly become the purported *first-next-open* quote and contribute a price gap through the theoretical trail. The first book state was unusable, and a subsequent recovery does not demonstrate a sell at the opening or a broker-native stop fill. This matters when an armed premium alert (e.g., +70) reverses overnight toward +20, with no guaranteed exchange execution.

## New causal treatment

1. While replaying the owner-claimed original client receipt-order updates, create a per-option/per-session `firstBoundedOpen` map of the **first applied observation** whose event and receipt fall in the predeclared `nextOpenBidWindowMinutes`. It includes BID zero, no depth, and sub-lot depth. Events delayed past the window cannot retrospectively become first opening snapshots; event/sequence inversions remain blocked by Phase84, stale deliveries remain quarantined by Phase83.
2. A *quoted first-next-open gap through trail* can be counted **only if that exact first causally observed bounded snapshot** has a strictly positive BID with the frozen lot-depth threshold, and is the next declared session causally admissible under Phase88 (no unverified intervening candidate trading weekday). A second valid opening quote after an illiquid first observation is a **later recovery**, not a first-open price.
3. For each originally entry-claimed contract reaching a **new armed peak**, its next causally declared opening window is censored when the first bounded snapshot is absent, zero BID or sub-lot. Increment the existing `entryPairsMissingBoundedNextOpenAfterNewArmedPeak` counter once per original option-decision pair; separately count observed first-book illiquidity in new `entryPairsWithFirstBoundedNextOpenIlliquidBid` and per-regime × 1W/2W/4W/8W × CE/PE `entryClaimedPairsWithFirstBoundedNextOpenIlliquidBid`. Add fixed reason `FIRST_CAUSALLY_OBSERVED_NEXT_OPEN_BID_ZERO_OR_SUBLOT_DEPTH`.
4. Original `NO_ENTRY` alternatives remain in all-listed holding-path source coverage but never become hypothetical option BUYs; the Phase80 operator-private report forwards **aggregate-only censored counts** without raw instrument token, exact original timestamp, historical price, account, source path or vendor identity.

## Verification

Seven new Phase79 adversarial cases: baseline, first zero BID then tradable BID, sublot first then tradable, genuinely tradable first opening, zero opening with recovery outside window, a late/out-of-order illiquid quote received beyond the window, and no hypothetical purchase for NO_ENTRY. One new Phase80 private redaction test verifies a first zero then recovery after an original armed peak. Previous Phase88 suite: 107; **115 synthetic tests expected** in Phase89 dedicated TypeScript and test gate. Focused Phase50–89 and broad EMA15M safety/full regression/production-build CI must complete independently.

These signals measure **reported original historical book observations**, not actual executable stops or profit. A usable displayed BID does not ensure a queue fill, GTT child placement, exchange ACK, partial/nonfill, protection from gap, real-time client access or data origin authenticity. Licenced original NSE/BSE L1 1W–8W sources, official issuer-authenticated F&O instrument/calendar/expiry, owner research entitlement, original client receipt proof, IV/theta/slippage and untouched real multi-regime OOS, and broker-native NRML protective stop lifecycle remain external release blockers #17–22 (especially #20).

**Do not merge, deploy, enable brokerage order writes or claim production safety.** Existing intraday MIS 15:15 process remains unchanged; no forced NRML positional 15:15 exit.
