# Adaptive Swing v2 Phase48 — original entry-first OOS selection to four-horizon Greek-gap risk path join

**DRAFT / unmerged / offline-only. No licensed historical F&O L1 was acquired or used. Synthetic tests run entirely with fabricated source records. No actual NSE/BSE instrument issuer, vendor entitlement, real Upstox broker stop ACK, overnight GTT continuity, broker trade, or profitable historical edge has been established.**

## The missing evidence boundary

Phase8–20 already contain point-in-time closed-index-candle strategy decisions, 1W/2W/4W/8W contract ranking, three distinct arms (EMA baseline, regime filter, regime+ranker), original L1 entry-first cohorts, censored exits, conservative hold/expiry buffer and chronological fold/OOS robustness. Phase46 independently analyzes four operator-selected option BID/ASK/gap/zero-recovery paths; Phase47 adds IV/delta/gamma/vega/theta sensitivity using those four paths. Until these source paths are matched to **the exact original OOS entry-first contract decisions**, their reassuring or alarming Greek results cannot fairly be attributed to the regime or ranking rules. Selecting a favorable option/expiry after seeing a premium path is survivorship/selection bias.

Phase48 adds this **OOS provenance reconciliation bridge**, NOT a reimplementation of ranking or an actual licensed-data backtest.

Official context: NSE real-time data products distinguish Level 1 best bid/ask from other market-data levels (https://www.nseindia.com/static/market-data/real-time-data-subscription); historical order/trade and EOD derivative bhavcopy are different from original option bid/ask/depth at strategy-time (https://www.nseindia.com/static/market-data/eod-historical-data-subscription). NSE usage/redistribution rights are separately controlled (https://www.nseindia.com/static/market-data/nse-data-policy). These external sources describe data classes; **none has furnished the project with actual licensed source records**.

## Implementation

Source: src/server/engine/ema15m/adaptiveUpstoxPhase48OosRiskJoin.ts

Function: auditPhase48OosEntryRiskCoverage(input, independentPins), pure offline:

1. **Independent exact SHA256 pins** of the full historical input (all underlying candles, original decision-time listed contracts, chain snapshots, original option L1 and fold/policy), the complete Phase47 archive, its independently supplied pins and its predeclared Greek policy. Study dataset ID, expected decision count, expected 12 attempts per OOS decision and four selected candidate instrument keys must be independently pinned *before* inspection. Matching self-controlled pins do not prove original source, licensing, true available-at clocks or authenticity.
2. **Reruns Phase47** original source-and-Greek residual audit (which itself reruns Phase46 original four horizon gap/debit stress), never trusting a cached PASS report. Synthetic original option L1 must use synthetic Greek evidence, while claimed original data must be marked operator-claimed—not licensed/certified.
3. **Reruns Phase8 entry-first cohort selection** on exact historical input. This uses pre-decision option chain ranking and the first available source L1 ASK; no future PnL is used for entry. No supplied cached cohort PASS, alternative hand-picked contract, or favorable later exit quote is allowed.
4. **All three arms × all four horizons × every declared OOS decision** stay in the denominator, even if signal absent, regime filtered, no point-in-time listed expiry, insufficient entry quote or predeclared exposure cooldown. Attempts must have unique fold/arm/horizon/decision identity and exactly one attempt per original OOS test decision. Missing original entry ASK remains missing, never zero-valued profit or silently dropped from sample.
5. A Phase46/47 risk path counts as joined ONLY if it corresponds to the **same selected OOS instrument key, horizon, quantity, lot multiple and authoritative-looking—but still UNVERIFIED—operator-declared expiry date**, and the exact first original OOS entry BID, ASK, observed timestamp and displayed best level bid/ask quantity. The claimed entry quote availability must be at/before the Phase46 frozen entry decision, which itself is within 30 seconds after the original OOS entry L1 observation; never substitute the next profitable quote.
6. The Phase46 pre-close option BID/ASK/depth at exact source event time, and first next-open option BID/ASK/depth, must **also** exist as identical observations in the SAME original OOS historical executionQuotes universe, not an unrelated hand-picked quote file. Pre-close quote must be in the entry IST session and next-open quote on a later IST date. Phase46/47 themselves check event/availability clocks, horizon expiry windows and source policy.
7. Exactly four 1W–8W risk paths may be shared by several strategy arms if they actually selected identical source contract and entry. This **is overlapping evidence for one underlying market path**, NOT 2–3 independent successful trades. Separate per-arm/horizon counts retain original entry observations, absent original entry L1, signal abstentions and selected entries missing risk paths. Counts of unmatched operator-selected risk paths are explicit.
8. If **any** OOS selected entry lacks the same original source risk path, any source-selected entry L1 is missing, or any operator-selected four-risk-path observation was NOT chosen by the original OOS cohort, report **INCOMPLETE_EVIDENCE** rather than a favorable value. The maximum local success is DESCRIPTIVE_COMPLETE_SELECTED_ENTRY_COVERAGE_ONLY and means ONLY that the reported four-path source slice covers its enrolled selected original entries in this *small predeclared sample*.

### Permanent nontrading flags

Every output, including local synthetic success, hard-codes:

    executionAuthorized=false
    productionSafe=false
    originalLicensedL1IndependentlyAuthenticated=false
    vendorHistoricalLicenseIndependentlyVerified=false
    trueOriginalAvailableAtVerified=false
    independentlyAuthenticatedExchangeContractMaster=false
    chronologicalOosProfitabilityProven=false
    fourRiskPathsRepresentAllPossibleTrades=false
    modelGreekAttributionCausallyVerified=false
    nativeBrokerStopsInstalled=false
    protectedOvernight=false
    nativeOrderInstruction=null

Critically, even when four linked paths cover all selected trades of ONE synthetic OOS day, that is **not a multiday or multifold powered OOS result**. The old EMA baseline uses ranker-screened nearest contract, NOT the actual existing EMA23/50 MIS broker strategy. There is no established fair comparison of live strategy PnL, slippage or executable stop.

## Synthetic test construction

Tests: src/quant/tests/ema15m_adaptive_upstox_phase48_oos_greek_risk_join.test.ts

Reuses the original Phase8 synthetic historical generator: 100+ actual-looking but fabricated prior 15-minute index candles, chronological registered train/test fold with embargo, point-in-time source contract catalog, chain and execution L1. Replays the three strategy arms × four horizons on a single predeclared OOS test day. Independently constructs the four Phase46 gap paths **from the original Phase8 selected contract and L1 quotes** (not from a future attractive option), then matches synthetic Phase47 original-style Greek observations at their actual quote timestamps. Local quote displayed quantities are whole lot multiples, rather than using arbitrary non-lot bid size.

Adversarial tests: tampered entry ASK with updated local hash, mismatched original preclose/nextopen option BID, changed selected contract/expiry, future or missing entry original ASK, no OOS selection for one formerly chosen risk path, report sample-count manipulation, wrong external input/policy hash, source license/synthetic mismatch, insufficient Phase47 Greek source, and protection/certification flags staying false. Missing evidence must remain in denominator and never turn into zero PnL, a winning trade or independent timestamped vendor proof.

## Manual offline review

CLI: scripts/audit-adaptive-upstox-phase48-oos-join.ts

Use two preexisting process-owned 0600 JSON files in process-owner 0700 private directory, under operator-enforced OS no-egress isolation:

    npx tsx scripts/audit-adaptive-upstox-phase48-oos-join.ts --approve-isolated-offline-review --private-original-oos-and-greek-risk-archive /private/phase48-original-cohort-plus-risk.json --independent-original-oos-entry-join-pins /private/phase48-pins.json

No HTTP, broker data access, public webhook listener, Upstox order placement/modify/cancel, GTT write, automatic stop repair, scheduler or production strategy behavior. CLI prints only redacted arm/horizon sample and coverage counts and negative proof flags—**not original vendor market prices, Greeks, account/contract IDs or private path**. An exit code 0 is solely internal four-path coverage success, never a real live approval.

## Still required for genuine research / deployment

Appropriately licensed source-original option bid/ask/depth with original vendor/exchange timestamps and verified strategy-time availability; original point-in-time cash settlement, lot, listed expiration and NFO/BFO session calendar with amendments; full chronological OOS fold universe of option candidates including dead/unpriced paths; predeclared policy, costs/IV/theta/depth/gaps evaluated separately from training; independent issuer/entitlement review; and **genuine broker/exchange native ACK/cancel/replace and overnight continuity** before any live NRML trading.

Keep release blockers #17–#22 including #20 OPEN. All stacked research PRs Draft/unmerged. Existing EMA23/50 MIS intraday 15:15 squareoff untouched. **NRML positional 1W/2W/4W/8W has no forced 15:15 exit**, no live GTT/order writes and no production activation. CI GREEN is synthetic software behavior only, not profitable/backtested/safe real-money trading.
