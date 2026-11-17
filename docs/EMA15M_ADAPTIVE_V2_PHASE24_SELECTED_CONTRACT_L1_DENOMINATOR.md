# Adaptive Swing v2 — Phase 24 decision-time selected option L1 denominator

**OFFLINE RESEARCH ONLY · No new policy tuning · No 1W/2W/4W/8W live target · No NRML broker orders · No changes to existing MIS 15:15**

## Concrete failure mode

The original Phase 23 historical feed continuity audit records **source-wide and observed per-contract-day** native option BID/ASK traffic, but a source with many quotes for one *different, liquid option* can still leave the specific contract the strategy chose at an OOS decision entirely unquoted.

The Phase 8 entry-first cohort already keeps such trades as **MISSING_EXECUTABLE_ENTRY_L1**, not priced trades. However, that disposition previously erased the **identity of the original selected contract** and its expiry/lot size. This made it harder for a human or source-auditor to explain which 1W/2W/4W/8W option was actually missing, and easier to confuse "feed traffic from another contract" with a source-dense option entry.

## Implementation

- `adaptiveEntryFirstCohort.ts`: when a point-in-time ranked CE/PE contract is selected using ONLY original closed index candles, source listed contracts and originally available option chain, but there is **no qualifying original subsequent ASK/BID+lot-depth quote within the predeclared entry window**, retain its **original instrumentKey, expiry and intended lot size** inside the `MISSING_EXECUTABLE_ENTRY_L1` attempt. Preserve `entryAt=null`, `entryAsk=null`, `entryBid=null`, `scheduledFixedHoldAt=null`, no reserved position and **no P&L or fictitious trade**. NO second-best liquid option is substituted, and no subsequent favorable historical quote is allowed to rewrite the selection. All fold × 3 strategy arm × 4 expiry-horizon decision denominators are preserved.
- `adaptiveL1MarketDataQuality.ts`: Phase 10 now additionally includes `originalSelectedCandidateEntries[]` derived from the original source event+available L1, AFTER Phase 8 selection. Each selected observed or missed entry reports its original choice identity **only as a Boolean**, original source quote count within the originally permitted entry window, other-contract quote counts for the decision date, enough original BID+ASK quantity for **that selected contract lot**, original event-to-client availability lag violations, and the exact original selected entry quote reconciliation result. No option contract IDs, vendor record IDs, bid/ask prices, source license IDs or broker credentials are added to the quality report.
- Per fold × arm × horizon, add `originalSelectedCandidateCount`, `originalSelectedCandidateMissingEntryQuoteCount`, `originalSelectedCandidateThinBidAskCount` and `originalSelectedCandidateInvalidClockCount`. A cell cannot be `sufficientForDescriptiveQualityReview=true` if any original selected entry is missing, had original source lag outside the existing **locked Phase 10 quality policy**, or does not match the original source, regardless of quote volume for other symbols.
- Selected candidate diagnostics are **not** broker fills or an independent feed authenticity certificate. All `sourceQuoteOrActualBrokerFillAuthenticated=false`, production/execution/profit flags remain false. Phase 10 still enforces its previously predeclared original L1 quote density, bounded intraday gaps, actual first due-time BID with sufficient depth and overnight premium giveback observations through original reserved holding paths.
- No additional 11th global source/policy file is required. This uses the **existing independently SHA256-pinned Phase 10 market-data-quality policy** inside Phase 17 full research readiness, so a last-minute change to entry depth/latency thresholds after seeing OOS winners remains fail-closed. All previous original source/calendar/stress/witness/exit checks remain mandatory.

### Example — all values SYNTHETIC illustration ONLY

At a historical OOS decision, a 1W candidate CE (say original lot 65) is selected using source contracts and the originally available chain. A different, liquid CE trades thousands of quote updates that same date, while the selected CE has no original BID/ASK in the next locked 10 minutes. Previously that was a `MISSING_EXECUTABLE_ENTRY_L1` count with no recorded selected key. Phase 24 retains the selected identity internally and reports:

```json
{
  "entryDisposition": "MISSING_EXECUTABLE_ENTRY_L1",
  "originalSelectedContractKnown": true,
  "originalOptionQuotesWithinEntryWindow": 0,
  "otherContractsQuotedSameDecisionDay": 1000,
  "sufficientOriginalBidAskDepthQuotes": 0,
  "entrySourceQuoteReconciled": false,
  "sourceQualityReasons": [
    "NO_ORIGINAL_SELECTED_CONTRACT_OPTION_L1_AT_ENTRY"
  ],
  "sourceQuoteOrActualBrokerFillAuthenticated": false
}
```

No actual market quote or customer trade is represented by this illustration.

If the selected contract **does** have source quotes but its original BID quantity falls below the original lot, Phase 24 reports `SELECTED_CONTRACT_ENTRY_BID_ASK_DEPTH_INSUFFICIENT`; it cannot use the deeper quote belonging to another contract. If selected option source `eventAt` predates the strategy's receipt by more than the already prespecified Phase10 limit, it flags `SELECTED_CONTRACT_SOURCE_EVENT_RECEIPT_LAG_TOO_LONG`. Neither scenario silently converts into a profitable entry or broker execution.

The original event/strategy-availableAt timestamps, vendor native quote archive and legally permitted data entitlement must be independently authenticated. A self-consistent, fake original quote stream could still pass structural checks, and any highest internal `DESCRIPTIVE_ONLY` outcome is **not** live readiness, real fill, statistical edge or option stop protection.

## Tests and release

New Phase 24 adversarial regression tests in `src/quant/tests/ema15m_adaptive_l1_quality_readiness.test.ts` cover a liquid **other** option when the selected 1W contract has 0 original entry quotes, a selected 1W quote with inadequate original BID/ASK depth, an original selected receipt-lag violation, retained source identity without invented entry, and unchanged all 12 fold/arm/horizon denominators. Existing Phase 8 future-quote-invariance tests continue.

All code is stacked in a **Draft PR** on Phase 23. No real licensed Indian option L1 source, genuine issuer calendar, external independent preregistration, independent tail-risk profitability or broker-native NRML stop was supplied. Issues #17–#22 remain open. **No new orders, broker imports, paper NRML route or automatic 15:15 positional square-off.**
