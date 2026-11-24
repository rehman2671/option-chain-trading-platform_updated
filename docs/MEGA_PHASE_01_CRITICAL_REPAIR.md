# Mega Phase 01 — critical repair batch acceptance

Base: main 52f5e862c2f6232b0dc0b7863b5d42bbe2fb7b95 (includes verified Telegram PR #143).
One consolidated repair PR, not another series of research phases.

## Scope and operational compatibility

- Mandatory login for normal paper ledger API; operator-owned rows only. Old anonymous rows remain available for authorized migration/administrative investigation; they are not silently assigned or deleted. Paper reset is strictly account-scoped.
- Sensitive admin diagnostics and global live EMA data are supervisor-only. Existing basket/autonomous namespace login middleware was already present and is retained (corrects the initial audit characterization). Selected expensive endpoints are rate-limited. Cookie-authenticated browser mutations require same request origin where supplied; confirm proxy topology/AI Studio iframe behaviour during hosted acceptance.
- Environment initial passwords now bootstrap existing managed identities only when no hash exists; normal password changes and disabled status survive restart. Missing/invalid environment credentials still disable configured accounts in production. Re-enabling a disabled account requires an authorized admin action. Update existing passwords through authorized password-reset workflow, not by changing the initial environment variable. A disabled master account needs an owner-approved recovery procedure; do not delete DB or bypass MFA.
- Persisted session version revokes earlier session JWTs on logout (all sessions of that identity), password/reset, role, account-status and MFA changes. Existing pre-version JWTs require re-login. URL-carried session credentials are rejected; browser token storage hardening is still pending.
- Legacy basket and generic quant live order paths are quarantined regardless of environment flags until a reviewed unified gateway exists. Practice/shadow and dry-run functionality remain available, subject to validation. Existing legacy live/unknown basket exposure must be reconciled through the broker by authorized operator; do not simulate an exit, auto-reverse or infer closure. Existing EMA MIS broker safety/exit routes and NRML interlocks remain unchanged. No real broker action taken.
- Autonomous completion needs matching full fill set and durable owner-scoped basket readback; unresolved exposure remains locally visible and disarmed. Re-arming/deleting position-bearing strategies is restricted.
- Legacy drawdown status API no longer mutates global state from caller numbers; unverified diagnostic PASSED claims removed. Real account risk provenance/persistent risk controls remain outstanding.
- Mock crossover is an explicitly isolated diagnostic response/Telegram test, not a persisted market candle, paper trade or normal strategy signal. Live entry from normal EMA candle finalization is suppressed if source is not live or slot freshness is unverified/over 30s. The legacy paper forced square-off scans explicit MIS only, not NRML. Existing historical contamination is not silently deleted.
- No hosting migration, live NRML release, order placement or production database changes performed.

## Historical task tracker (initial repair baseline)

Status S = scoped implementation present, awaiting exact-head CI and merge (not completed/accepted); P = partial containment or prerequisite; O = outstanding. No task is marked accepted before CI.

| IDs | S | P | O |
|---|---|---|---|
| 01–05 API | — | 01,02,03,04,05 | — |
| 06–10 users | 07,08,09 | 06,10 | — |
| 11–15 DB | 11,12 | 13,14,15 | — |
| 16–20 gateway | — | 16,17,18,19,20 | — |
| 21–25 basket | — | 21,25 | 22,23,24 |
| 26–30 autonomous | 26 | 27,28,29,30 | — |
| 31–35 quant | 34 | — | 31,32,33,35 |
| 36–40 risk | — | 38,39,40 | 36,37 |
| 41–45 EMA | 41,45 | 42,43,44 | — |
| 46–50 tests | 46,47,48 | 49,50 | — |

S: 12 scoped implementations/tests; P: 29 partially addressed; O: 9 outstanding. All 50 task IDs remain unaccepted until their own gates pass.
Remaining source work includes unified broker gateway and evidence-backed contract IDs, complete atomic multi-leg persistence, actual server-side broker funds/Greeks, unknown/partial-fill reconciliation and rollback, durable drawdown/kill-state, robust idempotency, comprehensive route inventory and browser token lifecycle. Containment is not equivalent to implementation of live execution.
Test coverage added: pure mode and basket validation, read-only drawdown projection, account reset/lookup/close isolation, persisted session version, cookie origin guard, built-server smoke for guest/role denial and revoked bearer replay. Full broker simulation and end-to-end hosted validation remain pending.

## 2026-11-24 — continuation and CI repair

- Initial head f956a101bc2276c045169b593cc993abb786a4e1: EMA safety run [45442607640](https://github.com/rehman2671/option-chain-trading-platform_updated/actions/runs/45442607640) failed TypeScript TS2367 and full regression; paper staging run [45442607684](https://github.com/rehman2671/option-chain-trading-platform_updated/actions/runs/45442607684) failed TypeScript. Production bundle and paper container jobs passed.
- Corrected unreachable LIVE_REAL comparison after quarantine (ccb72160); preserved kill-switch precedence and explicit rejection (1b0cd47b); replaced legacy mocked auth fixture with actual persisted user/session (6f1fe899). Existing assertions remain enabled.
- Added owner-scoped atomic manual paper group creation with per-row readback and rollback on duplicate or invalid/unconfirmed write (f9e4e88c, 2a100dbd). Regression verifies successful batch and rollback when later leg collides (0b9e128b). P01-13 moves from outstanding to partial: other multi-leg writers, capital reservation and concurrency remain.
- No claim that repaired head passed CI. PR #144 remains the only active repair batch. Check latest head before merge.

## Consolidated follow-up — 2026-11-25 IST

[Portfolio, capital reservation and risk work package](MEGA_PHASE_01_PORTFOLIO_RESERVATION_RISK.md) records exact affected IDs, implementation boundaries and tests. #146 merged with both workflows green; authoritative latest main counts 12 scoped merged / 37 partial / 1 outstanding. Proposed new batch advances P01-37 to partial only, not complete. Combined scope 12/38/0, zero fully accepted. Historical tables/checkpoints in this file remain as recorded; see tracker latest checkpoint. No live order or deployment.

## Merge rule
Require both exact-head EMA15M safety and paper staging RC workflows complete success (including full regression and lint). Do not modify tests to bypass real safety requirements. If failed, fix or isolate within this mega phase; no arbitrary live release. After merge verify main combined CI. External release issues #17–#22 remain open.

## Integration checkpoint — 2026-11-24

PR #144 exact head 8c65a26485c29435f70eb98d3d96c9056c02c8a9 passed both workflow runs 45449638093 and 45449638090; merged to main 0d7dec455addc2c13271c5869c8eb6439d786fc3. The original scope table remains the historical #144 ledger. Its 12 scoped implementations/tests are merged with PR CI; main combined CI is still pending. Independent #145/#146 advance 22,23,24,31,32,33,35,36 to partial in proposed combined scope only. P01-37 requires actual complete account Greek evidence. Combined proposed counts 12 scoped merged, 37 partial, 1 outstanding, no phase acceptance. See PROJECT_PROGRESS_TRACKER.md for current statuses.

Risk-control follow-up: P01-30/40 already partial, strengthened by durable reset readback, no supervisor secret stored in operator field, truthful local halt action labels and preservation of autonomous position-bearing state when disarmed. No broker cancellation/exit or live release implied. Existing DB or backup rows may contain a former reset secret; owner should rotate QUANT_SUPERVISOR_RESET_KEY via the existing secret settings, review protected historical records and backups, and not expose credentials. No production data accessed or modified. Persistent drawdown, actual portfolio Greek inputs, unified live gateway, account isolation and atomic risk reservations remain open. Regression test added; exact-head CI required before merge.

## 2026-11-25 IST — merged and independent repair checkpoint

- #145 exact-head workflows 45451535514 and 45451535534 passed; merged at 76f01d296f8f6a9dc1cac30a726b846b71c9ea34. #147 exact-head workflows 45455579578 and 45455579558 passed; merged at 1005bb047770e488b6473133659f1e36b1e82141.
- Main scope: 12 scoped implementations, 33 partial, 5 outstanding (23,24,35,36,37). Combined proposed scope across #146/#148 remains 12/37/1. Neither count means full acceptance. #146/#148 paper staging passed, regression pending at checkpoint; no reset of their CI.
- Exposure controller explicit numerical gate now rejects nonfinite Greeks/capital, nonpositive capital/peak, negative margin and invalid position counts, and retains legitimate zero margin rather than substituting 165000. Added negative regression tests; independent repair branch, CI pending. Existing default/synthetic caller risk, direct report input provenance, actual Greek aggregation, actual single-trade risk and full gateway remain unresolved. P01-36/39 scope is partial at most; P01-37 remains outstanding. No additional task acceptance or live release.

## Current integrated scope — 2026-11-25 IST

#148/#149/#150 merged after successful exact-head CI. Main now has 12 scoped implementations merged and 38 partial tasks, no untouched IDs; full acceptance remains pending. Scoped IDs: 07,08,09,11,12,26,34,41,45,46,47,48. All other P01 IDs remain partial. #151 green but merge conflicts; source/tests incorporated into a replacement integration branch, subject to fresh CI. See [gateway integration](MEGA_PHASE_01_GATEWAY_INTEGRATION.md), [durable intent/auth](MEGA_PHASE_01_DURABLE_INTENT_AUTH_RECOVERY.md) and [current tracker](PROJECT_PROGRESS_TRACKER.md). Atomic preparation and reconciliation are integrated internally, but actual broker source, active gateway dispatch and capital release are not authorized. This checkpoint supersedes historical counts and status above.

## Runtime recovery continuation — 2026-11-25 IST

#152 merged with both exact-head workflows passed; #151 closed as superseded. #153 repaired paper staging passed, full regression pending. [Owner binding and runtime recovery](MEGA_PHASE_01_OWNER_BINDING_RUNTIME_RECOVERY.md) records new runtime schema initialization, authenticated owner-only recovery endpoint, account-wide unresolved reservation quarantine, regression fixtures and configuration constraints. Main counts 12 scoped merged / 38 partial / 0 untouched. No full phase acceptance or authorization to dispatch/release. This checkpoint supersedes earlier pending #152 status.

## Recovery UI and session containment — 2026-11-25 IST

[Recovery UI/session ledger](MEGA_PHASE_01_RECOVERY_UI_SESSION_BOUNDARY.md) maps actual EMA read-only recovery panel, browser API token/cache boundary, auth result fencing and logout readback to existing P01 tasks and regression fixtures. #155 paper staging/build passed, full/invariant pending; main 12/38/0 remains unchanged. No release or live dispatch authority; hosted browser behavior and performance pending. This checkpoint supersedes old status where appropriate.

## Native recovery reconciliation follow-up — 2026-11-25 IST

#156 initial TypeScript TS2322 fixed, added authenticated owner-scoped native order discovery/detail/trade reconciliation and transactional metadata persistence, adverse regression fixtures; see [detailed report](MEGA_PHASE_01_RECOVERY_UI_SESSION_BOUNDARY.md). #155 full/invariant pending, paper staging/build passed. New #156 exact-head CI pending. Main 12/38/0 unchanged, no full acceptance. Missing or conflicting evidence retains capital. No actual dispatch, retry, release or hosted change.
