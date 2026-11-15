# Adaptive Swing v2 — Phase 3 historical evidence & positional shadow (NOT LIVE)

This branch builds on the existing draft \`codex\` branch. **None of these new modules is imported by an order dispatcher**, nor does it edit MIS, broker BUY/SELL, 15:15 exits, the UI execution switches, or current paper trading. Green TypeScript/tests mean code consistency, NOT strategy profitability or operational readiness.

## 1. Historical data contract

Run the pure \`compareAdaptiveHistorical(input)\` function with a dataset obtained from documented historical capture or a licensed point-in-time vendor. \`HistoricalComparisonInput\` is the typed contract. It expects:

- \`provenance.datasetId/source/calendarSource/synthetic/expectedSessions\`: preserve the entire declared observation universe. Do not only submit winning sessions or silently drop market holidays/missing dates. \`synthetic=true\` means test results have **no market interpretation**.
- One dated \`HistoricalDecision\` per declared exchange session, in chronological order. Each has 100+ fully closed, start-timestamped 15m underlying index candles ending **no later than decisionAt**, broker-listed contract metadata available by that decision, and dated option-chain L1 bid/ask, depth, volume, OI, Delta, Theta and IV snapshots. Never use today's instrument master or Greeks to reconstruct earlier dates.
- Subsequent \`HistoricalExecutableQuote\` bid/ask/depth observations for the selected exact instrument key. Quotes come from **after** the decision for entry, and on/after the predeclared hold target for exit. No fill on LTP alone.
- An explicit fixed cost/hold policy for each 1W/2W/4W/8W **expiry bucket**, plus chronological train/test folds. These buckets mean *contract expiry distance*, not a guaranteed holding period or target. Do not infer that a +100 index point target implies any fixed option PnL.
- Nontrivial charges/slippage should reflect instrument, lot size, tax schedule and order size; current engine uses explicit **per-side flat INR fees + basis-point slippage**, not a broker-grade itemized charge calculator.

The engine compares \`EMA_BASELINE\`, \`REGIME_FILTER\`, and \`REGIME_AND_RANK\` on the same decision dates, using the existing deterministic regime classifier and ranker. Both baseline and regime-filter use **the same currently ranker-screened top-three liquid candidates** but select nearest strike; ranked uses the top score. This tests selection order **within the screened pool**, NOT all-market strike universe or a complete legacy strategy implementation.

For each one-lot *long premium* hypothetical transaction, BUY uses first qualifying post-decision **ask** plus slippage; SELL uses later **bid** minus slippage; two fees are deducted. The test includes overnight calendar time, bid/ask spreads, positive depth, exact contract key, expiry buffer, single-open-position per policy/horizon, drawdown, expectancy, win rate, turnover and hold time. Missing entry/exit price evidence produces an incomplete result, never a zero-cost win. A missing exit freezes further attempts in that arm/horizon. Expiry crossing results in no new entry; rollover is **not simulated**.

\`DESCRIPTIVE_ONLY\` is the strongest result state; there is no \`PROFITABLE\`, \`PASSED\` or \`EXECUTE\` state. \`comparable\` requires at least 20 closed trades and complete execution evidence in that specific arm/horizon, which is only a **minimum sample gate**, not statistical significance. Repeated OOS windows, gap stress, parameter stability, confidence intervals, sensitivity to spread/impact, deep historical coverage and manual review are still needed.

**Important sources and limitations:** Official Upstox \`GET /v2/option/chain\` is a current option-chain snapshot, and the documented historical candle API provides OHLC history. Neither should be assumed to provide a complete historical L1 bid/ask/Greeks replay from the past. Historical bid/ask/Greek capture or licensed vendor data is a prerequisite. See:
- https://upstox.com/developer/api-documentation/get-pc-option-chain/
- https://upstox.com/developer/api-documentation/v3/get-historical-candle-data/
- https://upstox.com/developer/api-documentation/v3/get-market-data-feed/

## 2. Positional risk: intentionally shadow only

\`evaluateAdaptivePositionalShadow(position, observation, config)\` is a pure read-only proposal engine:
- Requires broker-confirmed **NRML**, exact positive long net position quantity, recent broker status, recent option bid, positive option premium ATR and a same-quantity verified active native SELL protection.
- Fails closed on MIS/UNKNOWN product, broker mismatch, absent/cancel-pending protection, stale broker/quote data and invalid values.
- Computes an explicit stressed **overnight gap loss estimate** (not a bounded possible maximum loss or a guaranteed stop fill). Flags expiry-calendar-day buffer and stop/gap threshold for human exit review. Actual exchange holidays and modified expiry schedules require an authoritative session calendar before automation.
- Proposes option-premium ATR-based trailing only after configured favorable excursion; it never reduces existing/native stop protection. A proposed value is **not an acknowledged broker stop**.
- Returns \`executionAuthorized=false\`, \`nativeOrderInstruction=null\` and one of \`HOLD_SHADOW\`, \`REVIEW_PROTECTION\`, \`RAISE_EXIT_REVIEW\` or \`BLOCK_AND_RECONCILE\`. It **cannot send orders**, create NRML positions, replace/cancel GTT/SL or take unsupervised protective action.

## 3. Release blockers / phased path

1. Obtain **authentic, dated** chain L1/Greeks/contract master quotes and predeclare session calendar + folds. Run on independent real market regimes (up/down/sideways, IV shock, expiry weeks), report per-arm coverage and costs. Do not describe synthetic fixture PnL as market performance.
2. Check sample selection, survivorship, missing quote/candle sessions, event timestamp semantics, exchange holidays, data licensing, fill sizes, per-instrument charges and walk-forward stability. Do realistic impact/latency perturbations and never optimize on untouched OOS folds.
3. **Only then**, in a separate guarded implementation, design persistent broker-authoritative NRML lifecycle, multi-day restart reconciliation, overnight native stop placement, GTT/SL cancel-replace race handling, verified broker net quantity, expiry liquidation/rollover approval, circuit-breaker and supervised recovery.
4. Do independent PAPER positional testing, broker sandbox/exchange field validation, staging operations approval and explicit production authorization. Existing EMA intraday paper/live strategies and the existing **15:15 / MIS** behavior stay unchanged until an independently reviewed positional release.

## Tests

\`src/quant/tests/ema15m_adaptive_historical_comparison.test.ts\` uses only labeled synthetic prices and deliberately tests quote-age/lookahead, missing exit, invalid calendars/costs and expiry guard. \`src/quant/tests/ema15m_adaptive_positional_shadow.test.ts\` checks broker protection, NRML, stop monotonicity, expiry and gap escalation. No real broker calls in either suite.
