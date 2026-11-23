# Phase94 — Same-option competing broker order/GTT census before any NRML protection claim

**DRAFT · READ-ONLY BROKER AUDIT · NO LIVE NRML BUY ROUTING.** Stacked on Phase93 Draft PR #98. Live positional NRML is the required product objective, but broker-native stop child ACKs, full exposure and production release are not yet proven.

## Correctness issue

An exact `GTT -> STOPLOSS rule -> child order_id -> order_ref_id -> broker-reported exchange_order_id` chain and matching original-long-minus-SELL-fill net quantity are NOT enough to establish exclusive protection. A second **active exchange SELL**, cancel-pending SELL, still-scheduled **other GTT SELL** (which may be absent from the exchange order book), or unresolved BUY on the *same NRML option contract* could change exposure after the captured snapshot or create unintended duplicate SELLs. A second **completed** SELL may alter net even if the current net accidentally looks correct due to an unrelated BUY. These cannot be ignored.

## Phase94 implementation

- Pure `adaptiveNrmlCompetingOrders.ts` examines the **full current broker order book and full current GTT list**, alongside the separately retrieved exact GTT parent and child. It scopes by instrument key, checks NRML product D, requires the selected parent GTT be listed uniquely and its parent quantity match the operator-declared original long. Neither source is atomic.
- Excludes only the **exact expected child order ID** from the competing-Sell census, because the Phase92–93 lineage logic independently audits that child for unique order-book row, correct side, parent linkage, venue reference and fill/pending/status. It does not exclude other orders just because they share instrument or quantity.
- Flags any other active/open/pending/cancel-pending SELL, any other SELL with broker-reported nonzero fills (even CANCELLED/COMPLETE), other active or completed SELL GTT rules, unresolved same-contract BUY/GTT BUY, ambiguous product, missing broker ID, unknown order/rule state, malformed rows, missing/duplicated parent or mismatched parent GTT quantity.
- Extra historically cancelled SELLs with explicitly **zero** executed units may remain noncompeting; a previous terminal completed BUY could be the original entry and is not reinterpreted as a new BUY. This still **does not reconcile all original entry fills/account capital**.
- Adds fixed, bounded reason codes and only **counts** `otherSellOrderCandidates`, `otherGttSellRuleCandidates`, `unresolvedSameContractBuyOrders` and `parentGttListedExactlyOnce` to Phase92–93's redacted output. No broker account number, order/GTT ID, contract key, token, quote or source path is returned.
- Requires `getGttOrders()` on the existing read-only broker interface, fetching account GTT list alongside exact parent and ordinary order book. If any source fails or returns null, status is `BROKER_SOURCE_INCOMPLETE` or conflict; **empty** and **unavailable** never share a meaning. The current position query is still made **after** child/trades queries (Phase93) to reduce stale net observation.
- Superadmin-only `POST /api/ema15m/nrml-gtt-child-review` uses the same endpoint and now includes the extra read-only list inspection. No order placement, cancel, modify, GTT write, automatic stop placement or live NRML release.

## Scope and limits

This is a **same-instrument competing-order census using full broker list endpoints**, not completed account-wide risk reconciliation. Other instruments, manual/cross-account exposures, older GTT history, orders absent from current broker endpoints, asynchronous race windows and independent exchange receipts still need separate proof. A broker's current order book and GTT list do not prove the absence of all historical fills or future triggers. A matching child is not a guaranteed filled protective stop; expected position and original lot data remain operator-entered.

All reports continue `liveNrmlBuyAuthorized:false`, `independentExchangeChildAckCertified:false`, `stopFillGuaranteed:false`, `fullAccountRiskReconciled:false`, `brokerSnapshotsAtomic:false` and `brokerWrites:0`. Phase90's real NRML BUY pretrade interlock remains hard-blocked, and MIS-only 15:15 forced square-off remains unchanged; positional NRML has no automatic 15:15 exit.

23 new synthetic Phase94 tests stress these adversarial cases and the six read-only calls, plus previous Phase79–93 original L1/broker lineage suites. Dedicated TypeScript check and **212 expected** synthetic tests, full EMA15M safety, full regression, production build and Phase50–94 focused research CI are independent checks, not evidence of live profitability, exchange acknowledgement or production safety.

External release issues #17–22, especially broker-native stop ACK/lifecycle issue #20, remain OPEN. Need authenticated Upstox test-account GTT trigger and child ACK, partial/cancel/restart reconciliation, capital/overnight risk caps and human release authorization, plus independently licensed original NSE/BSE 1W–8W option BID/ASK/depth, official contract/session calendar and untouched out-of-sample strategy outcomes. Keep PR draft/unmerged, no real broker writes.
