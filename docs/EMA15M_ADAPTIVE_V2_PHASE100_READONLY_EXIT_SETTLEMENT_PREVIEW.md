# Phase100 — Read-only, intentionally unapproved exit settlement preview

**DRAFT stacked on Phase99 PR #104. No broker orders, no local position/P&L updates, no live NRML BUY release.**

The eventual product includes LIVE multi-day/1W–8W positional NRML CE/PE option holding. This phase **does not** enable new NRML BUY routing, add automatic 15:15 positional flatting, or certify protective stop placement. Existing intraday MIS forced 15:15 exit remains independent and subject to existing safeguards.

## Why this is necessary

The Phase99 durable SQLite migration persists original-child SELL execution observations and unique broker-reported SELL trade IDs, but it deliberately **does not** close positions or book realised P&L. After a complete-looking broker response, a simplistic calculation could accidentally (a) count duplicate trade IDs, (b) ignore an earlier 50-of-100 partial fill, (c) trust an old net-position snapshot, (d) use the last trade price instead of quantity-weighted executions, (e) mistake original submitted entry price for independently signed BUY execution history, or (f) declare net realised profit while actual broker taxes, STT, transaction fees, brokerage and account-wide exposure remain unverified.

Phase100 adds an **informational, fail-closed snapshot/reconciliation preview**, not a settlement execution workflow.

## Implementation

- Pure `previewDurableExitSettlement()` requires one exact persisted `EXIT_PENDING` live position with immutable matching account, exact native option contract, product MIS/NRML, original positive whole-lot size, entry and child broker IDs, and **zero** earlier locally recorded exit fills (only one current SELL child is reconstructable under the Phase99 schema). If the position had an earlier child/partial exit, we do **not** pretend the latest child alone represents the original entry/exit lifecycle.
- The original BUY attempt must be `FILLED`, have the exact same account, contract, durable attempt/order IDs and original requested/filled quantity, and a positive recorded average entry premium aligned with the local position. **Original BUY trade IDs have not been independently cross-checked**; this remains explicitly unverified.
- Phase99's append-only child observation history must have strictly increasing IDs, matching position/order/account/contract/product/requested size and stable broker-reported exchange order reference. Cumulative filled quantity may only increase; observed remaining net must equal original minus fills at each historical observation. A terminal status cannot revert to OPEN/PARTIAL; cancelled/rejected/expired, active order quantity holes and other contradictions remain conflicts.
- Unique immutable SELL trade IDs, quantity and positive recorded price must match the **latest** child cumulative fill and recorded trade count, with no numeric overflow. A fresh native broker position GET after the earlier child evidence capture must also match the implied remaining quantity. This is **not atomic** across broker, SQLite and exchange. Current pending orders/GTTs and account-wide fills remain independently unverified.
- **Optional `indicativeGrossPremiumDifference`** is computed in paise from the BUY order's locally recorded average fill premium and the **quantity-weighted** current SELL trade evidence. It is only a *price difference illustration* for already broker-reported SOLD units, never `realisedPnl` or final tax/cost accounting. If data conflict, no indicative gross figure is produced. No option margin, STT, GST, brokerage, exchange fees, taxes or other hidden charges are invented.
- Every report: `netRealisedPnl:null`, `brokerChargesVerified:false`, `originalBuyTradeIdsIndependentlyReconciled:false`, `externalOrdersAndGttFullyReconciled:false`, `brokerChildExchangeAckIndependentlyCertified:false`, `brokerReportsAtomic:false`, `automaticPositionClosureAuthorized:false`, `realisedPnlWriteAuthorized:false`, `liveNrmlBuyAuthorized:false`, `manualApprovalRequired:true`, `brokerWrites:0`, `localWrites:0`.

## Concrete surfaces

- `dbEngine.readEmaExitSettlementEvidence(positionId)` returns a **private in-process SQLite transaction read** of the original local BUY journal, pending position, ordered child observations and unique trade ID rows. It never modifies any tables. Raw account/contract/order/trade IDs and execution prices are used internally **and must not be returned to web clients**.
- New SUPERADMIN-only `POST /api/ema15m/live-exit-settlement-preview` accepts an exact durable `positionId` and expected broker account ID, verifies the selected open local position, authenticates the broker connected account, obtains a **read-only** latest native option net quantity, joins the private SQLite snapshot and returns only the **redacted** preview. No order details or positions are fabricated; missing broker net results in conflict. The client does not receive raw trade IDs, account ID, contract key or entry/sell prices. Aggregate indicative premium difference, quantity counts and generic reason codes are the only numeric outputs.

## Tests and blockers

27 Phase100 synthetic and SQLite tests cover full/partial/pending observations, both positive and negative indicative gross, quantity-weighted multiple SELL trades, filled-vs-pending status contradictions, duplicate IDs, mismatched exact BUY order/account/contract, missing/unknown native net, out-of-order snapshots, changed venue reference, cancelled child, malformed prices/quantities, redaction, and real SQLite read non-mutation. With previous Phase79–99 **348 expected** tests, Phase100 dedicated suite expects **375 tests**, subject to actual GitHub CI completion. Phase50–100 focused, broad EMA15M safety/full regression, production bundle and TypeScript lint remain independent checks.

**Not a release gate:** A broker-reported flat position and filled child, or green synthetic CI, do not certify final exchange execution, guaranteed stop fills, no third-party/manual orders, account charges, original BUY trade lineage, broker-native stop child ACK, capital controls, untouched OOS profitability, licensed real 1W–8W option BID/ASK/depth or official expiry/holiday master. Existing open blockers #17–22, especially #20, require authentic broker test-account lifecycle evidence and independent operator/risk/security/legal review before any production NRML enablement.

Keep the PR **DRAFT, unmerged**. Live NRML BUY stays blocked; no forced positional NRML 15:15 square-off.
