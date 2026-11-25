# DeltaChain AI — Master project development plan

**Control baseline:** 2026-11-24; 5 mega phases, 50 scoped tasks per phase, 250 planned tasks. Use the existing Google AI Studio deployment workflow. Do not add unrelated hosting, change live positions, or expand the phase count for routine fixes.

## Project objectives and constraints

- Repair the audited 17 module groups: auth/users, frontend, market feed, option chain/expiry, EMA15M, Telegram, paper, live Upstox, basket, autonomous, quant, risk, research, AI narration, SQLite, deployment and CI.
- Preserve working features, authentication, paper accounts, broker reconciliation, notification settings and the existing source architecture where safe. Legacy unsafe live routes may be quarantined while their replacement is verified.
- Separate MIS from positional NRML. Target 1/2/4/8-week holding-horizon research and adaptive profit protection, not a rigid +100-point activation rule. Never certify simulated performance as actual profit or release NRML without documented evidence.
- Development streams: backend/security, trading/risk, market data/storage, UI/tests. Shared files have one integration owner. Implement independent packages without waiting on unrelated external evidence.
- A phase is a scope, not a promise of 50 tasks in one execution. Merge reviewable, independently verified work; no stacked speculative PR chains. Keep all discovered bugs inside the existing five-phase backlog.

## Five-phase scope

Each numbered range covers five tasks; prefix IDs with P01–P05 to avoid collisions.

| Phase | IDs | Work package (five tasks) |
|---|---|---|
| P01 Critical repair | 01–05 | Central auth; mutation protection; admin permissions; input validation; rate limits |
| | 06–10 | Account isolation; password persistence; disabled status; session revocation; secure token handling |
| | 11–15 | Reset protection; scoped deletion; atomic transactions; write readback; failure handling |
| | 16–20 | Common execution gateway; caller authorization; mode validation; release interlocks; idempotency |
| | 21–25 | Server margin; listed contracts; partial fills; rollback reconciliation; unresolved exposure quarantine |
| | 26–30 | Exit verification; duplicate entry; restart recovery; safe rearm; circuit-breaker authorization |
| | 31–35 | Option premium; effective lot; instrument key; strict mode; unknown outcome |
| | 36–40 | Account capital; portfolio Greeks; persistent drawdown; real diagnostics; unified kill switch |
| | 41–45 | Mock isolation; stale signals; paper/live separation; duplicate crossover; MIS/NRML segregation |
| | 46–50 | Unauthorized API; cross-account; destructive action; broker simulation; combined integration tests |
| P02 Data & reliability | 01–05 | Connection supervision; token expiry; reconnect backoff; resubscribe; heartbeat |
| | 06–10 | Original timestamps; dedupe; sequence; stale rejection; latency |
| | 11–15 | Candle slots; completeness; gaps; recovery; closed-bar reconciliation |
| | 16–20 | Listed master; exchange expiry; effective lots; holidays; expired rejection |
| | 21–25 | Bid/ask; depth; freshness; IV/Greeks; synthetic isolation |
| | 26–30 | Provenance; clocks; liquidity; missing-data warnings; eligibility |
| | 31–35 | Outbox; event ID; controlled retries; ambiguous delivery; restart recovery |
| | 36–40 | Category controls; latency; missed counts; diagnostics; notification history |
| | 41–45 | Independent workers; overlap; ownership; graceful shutdown; restart health |
| | 46–50 | Storage config; backups; recovery tools; runtime health; AI Studio smoke |
| P03 Paper & research | 01–05 | Bid/ask fills; depth; partials; slippage; rejections |
| | 06–10 | Quantity; lots; brokerage; statutory costs; net P&L |
| | 11–15 | Isolated strategies; allocation; margin reserve; exposure; equity curves |
| | 16–20 | Licensed importer; clocks; contract identity; gaps; provenance |
| | 21–25 | No look-ahead; expiry; entry time; exit time; shared strategy logic |
| | 26–30 | Modeled labels; genuine separation; historical costs; reproducibility; invalid rejection |
| | 31–35 | Baseline; regime; adaptive trailing; contract selection; combined variant |
| | 36–40 | Train; validation; untouched OOS; stability; overfit checks |
| | 41–45 | Overnight; volatility; liquidity; loss streaks; Monte Carlo |
| | 46–50 | Expectancy; drawdown; profit factor; risk-adjusted returns; leaderboard |
| P04 Adaptive positional | 01–05 | Bull; bear; sideways; volatility; reversal regimes |
| | 06–10 | Multi-timeframe; strength; momentum; false breakout; no trade |
| | 11–15 | Delta; theta; IV; spread; liquidity |
| | 16–20 | 1W; 2W; 4W; 8W; holding vs expiry |
| | 21–25 | Volatility stop; premium risk; structure; sizing; gaps |
| | 26–30 | Early protection; peak; adaptive trail; momentum exit; giveback |
| | 31–35 | Overnight; weekend; expiry; roll; events |
| | 36–40 | Correlation; concurrency; allocation; regime budgets; drawdown sizing |
| | 41–45 | Native protection evidence; close-only; reconciliation; restart; partial-fill conservation |
| | 46–50 | Paper NRML; MIS compatibility; settings; versioning; multi-horizon tests |
| P05 Integration & release | 01–05 | Consolidated API; freshness; labels; cancellation; errors |
| | 06–10 | Position; partial fill; pending order; product labels; controls |
| | 11–15 | Leaderboard; horizons; equity; drawdown; alert latency |
| | 16–20 | Settings validation; risk permissions; alert categories; strategy config; audit |
| | 21–25 | Cache; memory; indexes; batched writes; job isolation |
| | 26–30 | Narration auth; rate limits; model config; attribution; advisory safeguards |
| | 31–35 | Dedup logic; types; contract service; financial math; compatibility |
| | 36–40 | Unit; API; browser; concurrency; fault injection |
| | 41–45 | Install; migration; restart; runtime security; AI Studio smoke |
| | 46–50 | Rollback; operator guide; monitoring runbook; blockers; acceptance |

## Gates and anti-stuck rule

1. P01: reject unauthorized orders/destructive actions and misleading closure; preserve actual exposure until broker reconciliation. P02: verify data clocks, complete bars, source labels and hosting/Telegram evidence. P03: reproducible realistic simulations; distinguish missing actual evidence. P04: paper positional and MIS separation, no premature live release. P05: full cross-module and hosted acceptance.
2. Use `docs/MEGA_PHASE_01_CRITICAL_REPAIR.md` for task detail and `docs/PROJECT_PROGRESS_TRACKER.md` for current phase/CI/release status. Record exact PR head, CI runs, changed scope, tests, decisions and blockers. Distinguish implemented, partial, outstanding, CI verified, merged and deployed.
3. If CI fails, identify actual failure, repair and retest. Do not waive checks or claim a future merge. Isolate independently safe work if needed. External blockers only stop their dependent release gate; no fake source data or broker evidence.
4. Issues #17–#22 remain the separate external evidence track (licensed data, calendar/masters, independent validation, broker NRML protection, OOS, actual AI Studio operations). CI success is source acceptance, not proof of profitable trading, device delivery or hosted durability.

## Current implementation checkpoint — 2026-11-25 IST

#143–#150 merged with PR CI; #151 passed exact-head CI but has merge conflicts in shared tracking documents. Its source and tests are carried onto current main with an atomic preparation journal joining intent, reservation, risk evidence and restart recovery. See [integration batch](MEGA_PHASE_01_GATEWAY_INTEGRATION.md) and [current tracker](PROJECT_PROGRESS_TRACKER.md). Main scope 12 scoped merged, 38 partial, 0 untouched; full phase acceptance pending. The preparation journal is not a live execution gateway. Preserve the 250-task plan, Google AI Studio deployment architecture and MIS/NRML safety gates.

## Owner binding and runtime recovery checkpoint — 2026-11-25 IST

#152 merged with both exact-head workflows successful; #151 closed as superseded. Main 050e0acdac18c9f812ebb72eb9a116a589721cd7. #153 repaired paper staging passed; full/invariant CI pending. New [owner binding and recovery batch](MEGA_PHASE_01_OWNER_BINDING_RUNTIME_RECOVERY.md) integrates normal runtime SQLite schema, explicit deployment-owned account mapping, owner-only authenticated recovery and unresolved account quarantine. No live dispatch/release authority. Existing 250-task scope and Google AI Studio architecture unchanged.

## Authenticated candidate journal integration — 2026-11-25 IST

#153 passed both exact-head workflows but conflicts with latest main documents. Consolidate its native broker and projected risk code with #154 owner-bound runtime recovery on the same #154 base, retaining all source/tests and detailed ledgers. [Authenticated candidate journal](MEGA_PHASE_01_AUTHENTICATED_CANDIDATE_JOURNAL.md) joins explicit server policy, active session, exact listing, projected risk and immutable receipt with atomic reservation. #154 regression still running. No scope expansion or live dispatch. Five phases/250 tasks unchanged; main 12 scoped merged, 38 partial, zero untouched.

## Verified #154 merge — 2026-11-25 IST

#154 exact head 89ea5d3b88feb403180cfd3b461cc8c97eac4a4f passed full EMA safety 45486135932 and paper staging 45486136044. Merged main at 9ad93498d18713ee322c3589eaeec47c226e3e3b. #155 includes the verified #154 head as an ancestor and the #153 source/tests plus new joined preparation; fresh combined CI still required. #153 remains open until replacement integration verified. Main scope unchanged 12/38/0, no full acceptance, no hosted verification. Supersedes earlier pending #154 statements.

## Cross-phase consolidated execution checkpoint — 2026-11-25 IST

#155 merged at 0ac7d551748792c3ad69f6ced1911f728a275df4 after both exact-head workflows passed (45489074855, 45489074822); #153 closed superseded. #156 exact head 698f5c5f72211228dfc06c8c1271c76962cb58c8: 45492390122 EMA15M safety checks: in_progress/pending; 45492390081 Paper staging RC1 integration smoke (NO live broker): completed/success. Conflicts after #155 merge resolved on combined branch based on current main; #156 source/tests/report preserved and database integration joined without discarding candidate journal.

[150-task execution register](MEGA_BATCH_150_TASK_EXECUTION_REGISTER.md) maps first 150 existing IDs, distinguishes baseline, advanced/affected and unverified work, and lists P05 impacts. Actual integrated changes: owner-only recovery and browser session boundary, native connection race/freshness and exact-expiry chain validation, truthful quote/snapshot provenance, closed-bar/expiry/depth replay, reproducible research metrics and explicit unverified OOS/sample status in UI. Five new test cases plus preserved #156 fixtures. Fresh combined CI required. No new fully accepted tasks claimed; P01 remains 12 scoped merged / 38 partial / 0 untouched, other phases not fully reassessed. 100–200 verified task target not met. Continue independent packages rather than waiting on external proof; licensed data, broker NAV/Greeks, verified release/reset, actual protected NRML and hosted Google AI Studio remain gated. No live broker or hosting change. This supersedes previous pending #155 status.
