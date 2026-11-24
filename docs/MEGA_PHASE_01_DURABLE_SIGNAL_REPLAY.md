# Mega Phase 01 — durable signal replay repair

Checkpoint: 2026-11-24. Base main 76f01d296f8f6a9dc1cac30a726b846b71c9ea34 includes verified #144 and #145.

## Scope

- P01-20/27/44: strengthen duplicate prevention. The legacy EMA paper execution now runs synchronously inside an immediate SQLite transaction with persistent signal-ID and instrument/15-minute-slot claims. Previously recorded trade signal IDs, duplicate slots and older claimed slots are checked before a reversal can mutate an existing position. A failed replacement rolls back local SQLite changes and the new claim. Non-MIS open paper positions are held for separate positional management. Invalid prices/lot counts fail before position changes. This is not a universal order idempotency gateway, nor a new paper NRML strategy.
- Live: reject any previously recorded attempt for the same signal ID before automatic reversal; recheck inside the existing transactional BUY claim, including terminal attempts. Existing instrument-level pending and position gates, exit claims, broker reconciliation and NRML interlocks remain intact. No new broker routing or automatic retry. This is not complete cross-worker signal ownership before reversal; different IDs representing the same live slot, historical data cleanup, account-bound intent identity and atomic capital reservation remain open.
- Regression tests use synthetic SQLite fixtures for duplicate/older/same-slot suppression, failed reversal rollback, and a historical terminal live attempt. Full CI pending. SQLite durability depends on a shared, approved persistent database; no actual hosted verification.

## Integration and tracking

- #144 and #145 merged. Main scope remains 12 scoped implementations merged with PR CI, 33 partial, 5 outstanding. #146 corrected head 6bc37098aafdcfdff0ae4e77a1680cad62bffcf0 paper staging 45456973544 passed, EMA 45456973605 running at checkpoint. #147 head 70dc4c79074a2325ed5c3d9cbff90a04eba20ac8 paper staging 45455579558 passed, EMA 45455579578 running. Combined main paper 45456455505 passed, EMA 45456455493 running.
- Proposed combined scope remains 12 scoped merged, 37 partial, 1 outstanding P01-37 (authoritative portfolio Greeks). This batch strengthens already-partial tasks; no double counting or phase acceptance.
- Canonical PROJECT_MASTER_PLAN.md, PROJECT_PROGRESS_TRACKER.md and MEGA_PHASE_01_CRITICAL_REPAIR.md have pending updates in #147. Merge eligible work, reconcile the three files with actual exact-head/combined checks; no changes to that active head during CI.
- No live order, hosted configuration or credential change. Remaining: unified execution gateway, complete durable intent/slot/account identity, capital reservation, persistent drawdown, actual portfolio Greeks, full combined tests and external #17–#22 evidence.
