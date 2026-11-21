# Phase99 — Durable append-only broker-reported SELL child and trade-ID evidence journal

**DRAFT / stacked on Phase98 PR #103 / NO REAL NRML BUY RELEASE / NO EXCHANGE ORDERS SENT.**
The desired eventual feature remains LIVE positional NRML index-option trading with 1W/2W/4W/8W holdings and no forced 15:15 NRML square-off. Phase90's separate real-money NRML BUY block and existing MIS 15:15 schedule are unchanged.

## Problem: single cumulative number loses child/trade lineage

Phases95–98 fixed original-vs-remaining SELL sizing, unique broker portfolio evidence, a post-claim broker recheck, and a premature `CLOSED`/realised-P&L branch in `placeOrder` ACK processing. However `ema_live_positions.exit_filled_quantity` is only one cumulative quantity field. Without immutable child/trade-ID evidence, a restarted process could accidentally double count repeated executions, trust a stale order snapshot, ignore a previously observed trade ID that vanished from a truncated current-day broker endpoint, or treat an amended price/quantity for the same trade ID as a second fill.

Phase99 adds a **local evidence journal**; it does **NOT** automatically settle or close the position.

## Schema migration 020 (SQLite, WAL)

Two new tables are created idempotently:
- `ema_exit_child_observations`: **append-only** observation rows for each current broker child order state (position ID, broker order ID, expected account, exact instrument/product, original child requested quantity, venue reference as reported by broker, observed filled/pending and last current net quantities, status, trade count, observation time). New progress snapshots are appended; a byte-equivalent retry does not append an extra observation.
- `ema_exit_trade_evidence`: immutable **unique** broker-trade evidence keyed by `(position_id, broker_order_id, broker_trade_id)`, retaining reported exchange order ID, executed quantity, numeric average price and first observed time. A replay with the same trade ID and identical fields is idempotent. A replay changing an existing trade's size, price or venue reference, losing a previously observed trade, regressing cumulative fills, duplicating IDs or inventing an inconsistent total **fails closed**.

`dbEngine.appendEmaExitChildTradeEvidence()` runs one **SQLite IMMEDIATE transaction** to verify the durable position is still `EXIT_PENDING`, account/product/contract/child ID match, original requested child quantity can be established (currently ONLY positions with `exit_filled_quantity=0`), and the prior child identity has not changed. Within that transaction it compares immutable stored trade rows with new broker evidence, adds only new validated trade IDs, and appends a new observation if it differs from the latest snapshot. Conflicts return fixed reason codes, with no partial commit. No write to `ema_live_positions`, no automatic `CLOSED`, no realised P&L, no broker SELL/GTT creation/cancel/retry.

## Explicit admin capture path (NOT automatic execution)

New SUPERADMIN-only `POST /api/ema15m/live-exit-evidence-capture`, request `{positionId, expectedAccountId}`, performs:
1. Confirm exactly one locally persisted `EXIT_PENDING` position and child order ID, exact expected account, positive whole-lot original child request; reject any previously recorded partial exit where per-child original request cannot be independently reconstructed.
2. Match **authenticated connected Upstox account** to expected account BEFORE any order/portfolio GET.
3. Perform **broker GET-only** child details, per-child trades, ordinary order-book; request current native broker net **after** child/trade responses.
4. Run Phase98's strict cross-endpoint child/trades/book/net consistency and Phase99's canonical deterministic trade-ID preparation. Reject missing/malformed/duplicate trade IDs, invalid fill price, changed order ID/product/side/contract, other current BUY/SELL exposure, stale net or contradictory child quantity.
5. Append validated, BROKER-REPORTED evidence to private SQLite in one transaction. Return **redacted** static status/reason codes and aggregate counts only. Broker account, instrument key, exchange/order/trade IDs, fill prices, tokens and private source rows are never echoed.

This route intentionally **writes local diagnostic evidence**, while **never writing to brokerage accounts**. It is not a background automated sync, position-reconciliation authority or sign-off that the broker actually filled the order. Even if a completed child and net=0 are reported coherently, the durable position stays `EXIT_PENDING`, `exit_filled_quantity` and local P&L remain unchanged pending a future independently reviewed, account-wide settlement lifecycle.

## Tests and operational blockers

26 new synthetic/SQLite tests cover canonical order/trades and exact exchange references; 50-of-100 partial, zero and full fills; malformed account or source; missing/duplicate/changed trade IDs; regressed cumulative quantities; inconsistent trade sum; invalid execution prices; idempotent replay; SQLite migration + IMMEDIATE transaction repeated captures; progress 50→100; rollback on changed trade-ID evidence; DB account/child/product/quantity mismatches; and **no live position/P&L mutation**. The focused previous Phase79–98 suite expected 322 cases, therefore Phase99 dedicated target is **348 tests**, subject to actual GitHub CI results. TypeScript static, Phase50–99 focused, EMA15M safety/full regression and production build are required independent gates.

Remaining blockers #17–22, especially #20, persist: independently authenticated native protective stop child exchange ACK with covered quantity and full cancel/replace/UNKNOWN/restart/partial/overnight history, licensed original 1W–8W option BID/ASK/depth and client receipts, official calendar/expiry/lot changes, untouched multi-regime OOS, auditable account-wide entry and SELL trade P&L, hard cash/capital limits and manual security/legal/risk release. Source API readings and local SQLite durability cannot prove venue execution or guaranteed stop fills. No real NRML BUY routing enabled; no broker writes/deployment/merge.

**Keep PR DRAFT, unmerged. Existing MIS-only 15:15 square-off preserved; no forced NRML positional square-off.**
