# Adaptive Swing v2 — Phase46 long-index-option gap and zero-recovery risk envelope

**DRAFT / unmerged / purely offline research. No genuine licensed original options L1 has been provided. No authenticated exchange index-option contract master, live Upstox account, broker STOP ACK, original future expiry calendar or real overnight trade fills. CI fixtures are SYNTHETIC.**

## Market-risk priority

An option premium reaching +50 or +70 points and reversing before a proposed +100 target is not a safe stop strategy. The underlying NIFTY/BANKNIFTY index moving 100 points is also NOT the same as a selected CE/PE option premium moving 100. For LONG option exposure, a declared GTT stop price is an intended trigger; it is NOT the eventual exit premium. A large overnight gap can open with a very low or zero displayed bid, broad spread, insufficient best-bid depth, or a rejected/pending broker child order.

Official source context:
- Upstox GTT order API: https://upstox.com/developer/api-documentation/place-gtt-order/ documents conditional stop-loss/trailing fields, not exchange-native guaranteed fills.
- Upstox GTT terms: https://upstox.com/files/terms-and-condition/conditional-orders.pdf discuss gap-up/down trigger placement at the exchange after a gap. This PDF is context, not evidence of a particular account's native stop ACK.
- NSE daily derivative reports: https://www.nseindia.in/all-reports-derivatives include F&O bhavcopy, which is EOD aggregate and cannot retroactively prove a stop-trigger-time best bid, ask, depth or fill.
- NSE paid EOD/historical F&O data program: https://www.nseindia.in/static/market-data/eod-historical-data-subscription . Explicitly separate daily summaries from time-stamped licensed L1 or original exchange trades and account-specific broker executions.

Phase14 already stresses matched-historical OOS cohort premium costs, overnight gaps and displayed depth; Phase19 audits observed pre-target option-BID reversals; Phase10 audits original-source/clock L1 quality. **Phase46 is NOT another strategy ranking/optimization system**. It isolates the missing protective-stop failure tail: long option FULL PREMIUM AT RISK if GTT/child order never fills.

## Offline audit contracts

Source: src/server/engine/ema15m/adaptiveUpstoxPhase46LongOptionGapRisk.ts

auditPhase46LongOptionGapStress(input, independentPins, predeclaredPolicy) requires exactly one candidate option path in order **1W, 2W, 4W, 8W**, each independently pinned by instrument key and SHA256. The input archive and predeclared policy must match separately provided SHA256 and expected dataset label. This detects post-pin mutation but NOT authentic NSE/vendor origin. An operator who controls both data and pins can fabricate a false record that passes.

Each path is a single assumed LONG **cash-settled index option** (CE or PE) with a positive lot multiple, operator-declared expiry, original option ENTRY bid/ask, preclose bid/ask and next-session first post-open bid/ask, displayed best-bid and best-ask quantities and original event/availability clocks. A declared option cash-settled instrument contract and true expiry must STILL be validated out-of-band against an authoritative exchange file. **Physically settled stock options are explicitly rejected** because assignment/delivery obligations may exceed the simplified cash-premium-only risk model.

Checks:
- Strict market event timestamp with timezone and separate availability timestamp; original entry quote must already have been available at decision. Preclose quote cannot be from after declared close; post-open quote must really occur after declared next open, within a preregistered maximum lag. No future selection, intrabar synthetic extrema or stop-price fill assumptions.
- Bid and ask nonnegative/positive and not crossed; zero bid is allowed only when zero best-bid displayed depth. Displayed size must be a whole option lot multiple. Original entry ASK displayed size must cover the intended long quantity, or the hypothetical entry is not considered priceable.
- Declared long-option stop trigger premium below ASK paid. Correct options horizon order/declared time-to-expiry bounds (operator-defined research categories only, NOT verified actual NSE listing schedule).
- Independent path SHA256 and policy SHA256, four horizon entries with expected instrument keys, bounded haircut/slippage, explicit assumed fee amounts, minimum displayed best-bid lots, and preregistered full-premium cash risk and adverse-gap alert thresholds. No using the profitable future L1 to pick a different option, expiry, cohort or trailing threshold.

For each horizon:
1. **Entry premium debit INR** = original entry ASK × intended long quantity. Separate operator-assumed entry fees are added to possible loss if no exit occurs. Actual buy execution at ASK is NOT proven.
2. **Full-debit zero-recovery loss INR** = ASK × quantity + assumed entry fees. This is a deliberate downside scenario (GTT never triggers, broker child rejected, option bid is unavailable or zero, cash-settled long option is eventually worth zero), NOT a probability, prediction or guaranteed actual max loss under every circumstance.
3. **Unrealistic ideal stop-trigger loss INR** = (entry ASK – chosen stop premium) × quantity + operator-assumed entry and hypothetical exit fees. This counterfactual is provided solely to quantify how dangerous it is to confuse a trigger with a fill.
4. **Additional loss versus ideal stop** = full-debit zero-recovery loss minus ideal stop loss, never treated as recovered or broker acknowledged.
5. **Observed premium BID gap percent** = change from original preclose option BID to next-open option BID, NOT index-point movement. Original next-open spread bps is also reported; if preclose bid is zero, percent gap remains null and alerts as missing comparable premium.
6. **Hypothetical displayed-depth liquidation** uses ONLY best bid after an operator-predeclared haircut, capped to original L1 best-bid displayed lots, with assumed exit fees. Remaining quantity is valued at zero as an intentionally severe hypothetical; no unpriced order is silently filled using a later higher quote. Bid/ask and displayed depth are NOT executable volume, market queue, exchange ACK, guaranteed fill or actual total order-book depth.
7. Budget breach / adverse premium gap / insufficient displayed bid lots / no bid alerts are descriptive ONLY. A passing budget threshold never authorizes real execution.

The fee model uses explicit **operator-declared** two-number assumptions per horizon; it is not an actual tax/transaction-charge calculation, broker schedule, exchange tariff, STT or real trade ledger. Real costs and slippage may be higher. Margin/settlement/ITM expiry/exceptional broker/exchange conditions are not modeled. Path covariance, IV crush, gamma, theta and multi-day nontrading/holiday tails also require further licensed L1 and contract metadata.

Maximum statuses are DESCRIPTIVE_BOUNDS_ONLY and DESCRIPTIVE_RISK_ALERT_ONLY, with INCOMPLETE_EVIDENCE/INVALID_EVIDENCE fail closed. Every output hard-codes:

    executionAuthorized=false
    productionSafe=false
    profitabilityProven=false
    brokerStopInstalled=false
    protectedOvernight=false
    overnightGapFillGuaranteed=false
    nativeOrderInstruction=null
    originalL1MarketDataIndependentlyAuthenticated=false
    officialExchangeContractCashSettlementVerified=false
    officialExpiryCalendarVerified=false
    marketDepthGuaranteesBrokerExecution=false

## Adversarial synthetic CI

src/quant/tests/ema15m_adaptive_upstox_phase46_long_option_gap_risk.test.ts

One synthetic 65-quantity index option bought at ASK 250 with STOP trigger 220, assumed entry fee INR15, and preclose BID230 followed by next-open BID100 (hypothetical severe premium gap). It shows **full debit INR16,265** (250 × 65 + INR15 assumed entry fees), versus the purely idealized **trigger-fill loss INR1,980** with assumed entry/exit fees. A 100-bid displayed size of 65 with 10% haircut and INR15 assumed exit fee produces **hypothetical INR5,835** proceeds — expressly NOT a broker trade or proven stop fill. If next-day bid=0 with no displayed best-bid depth, no hypothetical exit price is invented and full premium risk remains.

Tests also cover 1W/2W/4W/8W, partial 130 long/65 displayed bid quantity and residual 65, stop-price confusion, missing/open-late L1, entry ASK depth shortage, preclose lookahead, quote availability after decision, invalid bid/ask/depth/lot/fees, physically settled stocks, expiry mismatch, insufficient risk budget, wrong source SHA or arbitrary independent pin, changing policy after pins and explicit market-source proof flags permanently false.

These are **fabricated L1 inputs and hypothetical cost assumptions, not historical licensed options results, broker fills, proof of expectancy or optimizer outputs**.

## Manual private CLI

scripts/audit-adaptive-upstox-phase46-gap-risk.ts

Three precreated owner 0600 JSON files inside process-owner 0700 directory, run in an OS-level no-egress sandbox:

    npx tsx scripts/audit-adaptive-upstox-phase46-gap-risk.ts \
      --approve-isolated-offline-only \
      --private-l1-original-gap-paths /private/phase46-original-l1.json \
      --independent-path-and-policy-pins /private/phase46-pins.json \
      --predeclared-sensitivity-policy /private/phase46-risk-policy.json

No network request, no broker login, no order, no GTT write or cancel, no webhook, no scheduler. Returns redacted per-horizon stress numbers and reason codes; no real private instrument IDs, raw market records, token or confidential path. CLI returns exit code 2 on failed/incomplete source evidence or any predeclared risk alert; exit 0 means only the locally computed **descriptive sensitivity** did not breach the supplied assumptions and must NEVER be interpreted as live trading permission.

## Next actual evidence needed

Acquire appropriately licensed independently original timestamped option L1 (and ideally deeper order book), authoritative effective-dated actual exchange cash-settlement/expiry/calendar rules, broker-origin authenticated original stops/GTT and independent exchange order ACK/modify/cancel/replace/overnight event archive. Then run unbiased entry-first chronological walk-forward/OOS tail/gap/depth/IV/expiry research with realistic fees, assignment risk where relevant, non-survivor exposures and stock options excluded from this cash-only simplification. No thresholds should be tuned after inspecting the same OOS observations.

All stacked PRs remain Draft/unmerged. Keep blockers #17–#22 including #20 OPEN. Existing EMA23/50 MIS intraday 15:15 square-off untouched. **NRML positional has NO forced 15:15 exit**, no live NRML order/GTT, auto stop repair, scheduled capture or production activation.
