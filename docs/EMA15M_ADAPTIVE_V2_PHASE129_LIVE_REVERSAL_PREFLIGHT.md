# Phase129 — Live MIS automatic entry preflight BEFORE reversal SELL; invalid persisted-product fail closed

**Status: DRAFT stacked on Phase128 PR #133, unmerged and undeployed. No live orders executed by this development. NRML remains blocked without external issue #20 release proof; intraday 15:15 forced square-off stays MIS only.**

## Critical discovered automatic reversal ordering risk

`LiveExecutionService.attemptLiveSignalInternal()` previously checked the product-only gate at entry and ran broker contract verification, then could call `requestLiveExit()` for an opposite existing LIVE MIS position **before** `validatePreTrade()` checked whether live trading was still enabled or the kill switch had been engaged. In this sequence, an AUTOMATIC opposite-signal reversal SELL could be attempted while the global or user live toggle was OFF or the kill switch HALTED. Product-only `assessEmaLiveProductGate('MIS')` means 'eligible for other checks', not broker order authorization. This Phase129 fix does **not** affect an explicitly human-requested manual exit route.

## Implementation

- Add pure `assessEmaAutomaticLiveEntryPreflight(originalProduct,currentProduct,liveToggle,killHalted)`: only exact unmodified MIS, live boolean true and kill-switch boolean false return `allowed:true`. Any NRML/unknown/blank product, disabled toggle, changed product, unknown kill-switch state or raised exception rejects. The existing NRML product-only interlock and 15:15 MIS-only filter are preserved.
- In `attemptLiveSignalInternal` read current product/toggle/kill status **before** the first asynchronous contract broker GET, immediately AFTER its awaited contract verification before ANY automatic reversal SELL, and once more AFTER async broker account risk snapshot before durable BUY claim/`placeOrder`.
- No automatic reversal is allowed when the toggle/kill switch changes in-flight. A failed preflight returns `PRE_TRADE_REJECTED` with zero filled quantity and no position created, before any broker order. A changed toggle before durable claim follows the existing pretrade-rejection journaling path.
- Remove fallback `requestedSettings.upstoxProductType || 'MIS'` from live entry and `validatePreTrade`: missing/blank product must not be silently promoted to MIS.
- Add pure `normalizeEmaLiveProductSettings` to both persisted SQLite settings READ and SAVE: recognized exact MIS/NRML remain unchanged; malformed/null/blank product is *display-normalized* MIS but its live toggle is FORCIBLY OFF in both paths. Invalid product can never be stored as a silently live MIS order permission.
- Adversarial tests cover disabled toggle, ambiguous kill-switch state, NRML/unknown type, invalid saved product, product change while awaiting broker I/O and source-level ordering of preflight vs contract verification, reversal SELL, broker-risk GET, durable claim and broker placeOrder.
- An additional `LiveExecutionService` mock-based regression invokes actual `attemptLiveSignal` with fake contracts and mocked DB, kill switch and broker contract resolver. It asserts no broker contract GET/automatic reversal SELL/entry attempt on disabled toggle, halted kill switch or NRML, and no automatic reversal after an asynchronous product/toggle switch. This uses TEST doubles, not a broker-sanctioned real-order rehearsal.

## Remaining caveats and release blockers

The safety tests are partly structural: this research PR must receive independent review of LIVE service route behavior, mock broker reversals and human-controlled staging. It does not independently prove a real broker stop, that a kill-switch activation is externally acknowledged, or any profitable/live-safe NRML option strategy. There is no new release bypass, and MIS/NRML order-routing capabilities are unchanged except for the stricter automatic-entry preflight.

Independent release issues #17–#22 remain OPEN: original licensed option L1 with authentic available-at timestamps, issuer-authenticated versioned NSE/BSE F&O sessions/expiry/lot master, historical original BUY and SELL-child evidence, broker-sanctioned close-only NRML stop/restart/overnight gap tests, 1–8W OOS risk/fees and human capital/security/ops approval.

**Keep PR DRAFT/unmerged/undeployed; never enable LIVE NRML from green CI.**