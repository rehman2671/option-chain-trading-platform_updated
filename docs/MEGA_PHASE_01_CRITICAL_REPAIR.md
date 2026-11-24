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

## Task tracker

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

## Merge rule
Require both exact-head EMA15M safety and paper staging RC workflows complete success (including full regression and lint). Do not modify tests to bypass real safety requirements. If failed, fix or isolate within this mega phase; no arbitrary live release. After merge verify main combined CI. External release issues #17–#22 remain open.
