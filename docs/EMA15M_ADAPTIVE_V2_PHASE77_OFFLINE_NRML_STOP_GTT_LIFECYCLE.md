# Phase77 — OFFLINE read-only claimed NRML stop / GTT lifecycle reconciliation

**DRAFT, isolated offline development only** (stacked on Phase76 Draft PR #81, Phase75 Draft PR #80). This is NOT a broker integration, executable stop, investment advice, historical strategy backtest, NRML live order enabler, exchange-authenticated reconciliation, profitable result, or a production-readiness gate.

## Critical distinction

A manually copied **GTT registration** is not exchange acceptance of the triggered SELL order. A broker ACK alone is not an exchange ACK. Even a genuine acknowledged exchange stop is not an execution fill and can gap, reject, be cancelled, lack available counterparty depth, or fail overnight. Phase77 explicitly keeps every authentication and live-order readiness bit false even when its operator-transcribed records reconcile internally.

## Pure audit API

`src/server/engine/ema15m/adaptivePhase77OfflineNrmlStopLifecycleAudit.ts` exports `auditPhase77OfflineNrmlStopLifecycle()` accepting:

- The existing Phase76 explicitly hypothetical paper risk input, with its as-of quote freshness and full option-premium debit warnings. This does NOT convert hypothetical position assumptions to actual broker net holdings.
- Operator-transcribed claimed broker position snapshot (exact account alias, instrument, NRML product, net long lots, claimed as-of time and receipt time) **PLUS complete current open SELL-order list** (order IDs, kinds, claimed states and remaining lots). Original broker responses, attestation and current read-only network calls are NOT supplied or authenticated by the module.
- Sequenced operator-transcribed event ledger: stop `SUBMITTED → BROKER_ACK → EXCHANGE_ACK`, partial/cumulative or full fill, cancel requested/acknowledged, reject and unknown; GTT `GTT_REGISTERED → GTT_TRIGGERED` is separate and must have an explicitly linked subsequent child SELL order and independent claimed exchange ACK.

Every ledger event has exact account / contract / product / direction scope, a unique event ID, contiguous sequence and causal timestamp; duplicate IDs, mixed accounts, MIS/BUY actions, changing order quantity, impossible state transitions, out-of-order ACK, uncertain ACK, overfill and invented triggered GTT child fail closed. The latest current open-order snapshot must exactly match all outstanding replayed orders (IDs, type, current state and remaining quantity), and the current position must reconcile to the declared paper baseline minus cumulative SELL fills. Pending cancel, ambiguous/order unknown, multiple SELL protections, insufficient remaining stop quantity and active GTT alongside a stop always require manual reconciliation. A time-stale claimed broker position snapshot is blocked. All exposures remain subject to Phase76 risk-review alerts.

Outputs contain **aggregate counts and reason codes only**, without an account alias, instrument token or raw order IDs. The best possible status is `DESCRIPTIVE_CLAIMED_STOP_INTERNALLY_CONSISTENT_ONLY`, never a validated broker protect/exit. The other outcomes are `INVALID_EVIDENCE` and `RECONCILIATION_BLOCKED`. Status never automatically selects contracts, switches holdings, places/cancels/modifies an NRML order, rolls expiry, or applies MIS 15:15 square-off to positional NRML. Existing intraday MIS logic is untouched.

Operator-supplied snapshots are not independent proof of broker truth. A complete STOP ledger + matching manually transcribed open-order list can still be old, forged, incomplete, or missing genuine exchange events. The system must not call that *protected*; the report permanently sets `exchangeStopAcknowledgementIndependentlyVerified=false`, `overnightRiskUnresolved=true`, `restartSafeBrokerStateVerified=false`, `executionAuthorized=false`, `nativeOrderInstruction=null`, `productionSafe=false`.

## Tests

`src/quant/tests/ema15m_adaptive_phase77_offline_nrml_stop_lifecycle.test.ts` has 31 synthetic adversarial tests covering good-looking non-authoritative claims, orphan GTT, triggered GTT without ACK, pending/rejected/cancelled SELL, partial fill, overfill, multiple stops, mismatched current order ID/quantity/state, missing open-order snapshot, stale account claim, duplicate/reordered events, wrong side/product/account, quote warning, reproducible replay and unchanged NRML 15:15 behavior.

`npx tsx --test --test-concurrency=1 src/quant/tests/ema15m_adaptive_phase77_offline_nrml_stop_lifecycle.test.ts` plus `npm run lint` run in dedicated CI. Normal EMA15M targeted, full regression and build workflows remain separate and must all pass before even considering a merge. Passing synthetic CI is NOT a substitute for genuine broker sandbox or live-risk review.

## External blockers — remain OPEN

1. Broker-approved read-only GET capture with authorized account scope, original bytes, source timestamps and legally permitted retention (do NOT publish account identifiers, credentials, tokenized order IDs or sensitive responses to the public repository).
2. Independent broker-authoritative position + open stop/GTT + fills, live rejection/cancel/partial-fill and restart reconciliation in a broker-sanctioned sandbox/test environment with accountable human controls. This code makes no such calls and cannot assert source authenticity.
3. Licensed original best BID/ASK/depth 1W–8W option history with genuine contemporaneous client receipts; official authenticated F&O expiry/lot/session master; multicycle regime-separated OOS, theta/IV/slippage and gap-full-debit stress. Source integrity and positive synthetic test results are **not profitability**.
4. Written operational sign-off, kill switch, exposure caps and broker stop-child exchange confirmation before any future separate live execution implementation. Issues #17–#22, especially #20, stay OPEN.

No real NRML broker calls, GTT stop creation, exchange ACK confirmation, release/deployment or forced positional 15:15 exit are implemented in Phase77.
