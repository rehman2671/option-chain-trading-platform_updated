# Adaptive Swing v2 — Phase 9 isolated NRML paper lifecycle and reconciliation

> **Not a live NRML trading feature.** This is an offline, deterministic **SIMULATION** using simulated broker evidence. It does not connect to Upstox, persist account data, change the existing EMA MIS paper/live paths, place protective stops, place GTT, modify orders, trade overnight or close anything at 15:15.

## Why this phase matters

Expiry- and regime-sensitive research from Phases 3–8 describes possible entries and exits, but **an option held overnight cannot be safely managed only by a target and trailing-stop formula**. A production system must recover after a crash, know the original account and instrument, reconcile actual broker net holdings, distinguish a pending stop cancellation from a confirmed cancellation, prevent duplicate SELL orders, detect partial fills, and escalate expiry or gap risk.

**Phase 9 models those required safety invariants in an isolated paper journal before any broker integration.** It deliberately accepts **only** `SIMULATED_BROKER_FIXTURE` evidence and all outputs keep `brokerAuthenticated=false`, `brokerStopInstalled=false`, `executionAuthorized=false`, and `productionSafe=false`. A mock snapshot saying `ACTIVE_NATIVE_SELL` is not a real protective order. This is a feasibility and regression artifact, not real account verification.

## Lifecycle and fail-closed states

The pure module `src/server/engine/ema15m/adaptivePositionalPaperJournal.ts` exports:

- `emptyAdaptivePositionalPaperJournal()`: create an empty serializable in-memory journal.
- `appendAdaptivePositionalPaperEvent(journal,eventId,event)`: deterministically append a sequenced SHA-256 hash-chain entry, without mutating the input or performing storage/network I/O.
- `replayAdaptivePositionalPaperJournal(journal,asOf,policy,declaredSessions)`: replay and audit the journal at an explicit time. It returns an operator-facing status/reasons, never an order instruction.

Paper events are `OPEN_PAPER_NRML`, `MOCK_BROKER_SNAPSHOT`, `OPTION_L1_OBSERVED`, `RECOVERY_STARTED`, `OPERATOR_EXIT_REVIEW_REQUESTED`, and `SIMULATED_EXIT_FILL`. Unknown events, altered hashes, reordered/duplicate IDs, invalid timestamps and a second open are rejected.

The recorded paper entry is always a **long option** with positive ASK premium, specific `instrumentKey`, stable simulated account scope, expiry, an integer option lot size and an exact multiple-of-lot paper quantity. No MIS-to-NRML conversion is inferred or performed.

### Recovery and reconciliation

After `RECOVERY_STARTED`, the engine clears prior mock snapshots and quotes. It **cannot** go back to `RECONCILED_PAPER_HOLD` without a **newer**, fresh, same-account/contract, full-view `SIMULATED_BROKER_FIXTURE` snapshot plus a later fresh L1 option bid.

A safe simulated hold requires matching net long quantity, zero short quantity, an apparently active SELL protection matching the *remaining* paper quantity, a nonempty mock protection order ID, a positive stop trigger and **zero other unresolved SELL orders**. A cancelled, pending-cancel, rejected, unknown or absent protective stop blocks the simulated "protected" classification. This is still not broker authentication.

### Exit review and simulated fills

- An operator review request records intent but **never creates an order**. No exchange/broker SELL is dispatched.
- Each hypothetical paper fill requires a distinct **post-request** option L1 quote with sufficient recorded bid quantity, no stale delay, a price matching the observed bid and a whole lot. It cannot fill at the stop trigger/option-mid/same earlier quote, exceed outstanding request/position quantity, or reuse the same quote for another fill.
- After a paper partial exit, the old quantity and stop are no longer reconciled. A new mock snapshot is needed before a protected partial-position state can be displayed.
- After the final simulated fill, paper state stays `PAPER_CLOSED_PENDING_RECONCILIATION` until a later mock snapshot reports **zero position and no active/pending SELL protection**. A cancellation *request* alone is not enough.
- Stop breach, expiry proximity (using externally declared session dates), or stress beyond the configured overnight loss limit causes `EXIT_REVIEW`. It does **not** force an exit or claim protection will fill.

### Explicit exchange calendar and restart-safe journaling

The policy has a predeclared maximum snapshot age, quote age, maximum simulated fill delay, minimum sessions before expiry, percentage gap stress and maximum stressed loss in INR. Dates use explicit original session windows instead of inferring 1W=7 tradable days or applying MIS 15:15 square-off to overnight NRML.

Journal hash chaining catches accidental edits in the recorded event sequence. **It is not** a digital signature, independent exchange data authentication, encrypted ledger, ACID database, or proof that files were saved. The caller must **atomically** persist journal writes, back up the records, re-fetch broker state and GTT/orderbook **for any future production implementation**. This PR contains neither durable database migration nor real broker fetching.

## Offline CLI

The script `scripts/audit-adaptive-positional-paper.ts` performs a **read-only** audit of a previously saved *simulated* JSON journal:

```bash
npx tsx scripts/audit-adaptive-positional-paper.ts \
  /secure/simulated-paper-journal.json \
  --as-of 2026-11-16T09:30:00.000Z \
  --policy /secure/predeclared-paper-policy.json \
  --calendar /secure/independently-declared-sessions.json
```

It has **no write or live broker capability**. It prints state, risk and mock reconciliation flags without printing account IDs, raw market data, or contract key. It exits nonzero for invalid/stale/blocking states. The required input is an externally persisted, serialized journal from the pure module. No file is automatically created by the source code; the journal must be supplied.

Illustrative policy structure (**not optimized stop or gap settings**):

```json
{
  "maxSnapshotAgeMinutes": 10,
  "maxQuoteAgeMinutes": 5,
  "minDeclaredSessionsBeforeExpiry": 2,
  "maximumStressedLossINR": 5000,
  "overnightGapStressPercent": 30,
  "maxSimulatedFillDelaySeconds": 30
}
```

These values are for illustration, **not** risk controls suitable for live orders. A broker-native stop does not guarantee a fill price, and a market order is not magically executable at last quote bid.

## Remaining production blockers

1. Obtain and audit authentic licensed historical option L1 time-stamped feed data for OOS performance evaluation (Phases 5–8 are still research only). No real profitability results were produced in this phase.
2. Define a **separate** real NRML architecture requiring explicit user/operator approval, broker account isolation and consistent restart-persistent data with transactional locks and idempotency keys.
3. Authenticate broker positions, orders, untriggered GTT instructions, partial fills and cancel/replace *from the broker's own authoritative API*. This phase has **none** of those connectors.
4. Independently validate exchange/holiday and expiry dates, broker order capabilities, MIS/NRML product handling, after-market placement, lot sizes, execution slippage, margin and regulations.
5. Make sure an actual NRML position can never enter the old MIS 15:15 forced-exit path before any real rollout.

**No production activation, historical edge or broker-operational safety claim is made.** The original MIS paper service and live EMA23/50 execution remain untouched.
