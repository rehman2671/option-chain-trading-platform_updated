# Consolidated 150-task execution register (P01–P03)

Checkpoint 2026-11-25 IST. User target: complete 100–200 tasks per consolidated batch. This register covers the existing first 150 task IDs; it is an execution register, not a completion claim. Remaining phases retain their original IDs. Preserve the five-phase/250-task plan and existing Google AI Studio architecture.

Main 0ac7d551748792c3ad69f6ced1911f728a275df4 includes #155 after exact head f5085a99c81f213737d35eb72d2c0d65f1567cdb passed EMA 45489074855 and paper staging 45489074822. #153 closed as superseded. #156 exact head 698f5c5f72211228dfc06c8c1271c76962cb58c8 passed paper staging 45492390081, full regression and build jobs within 45492390122; invariant job pending at checkpoint. Main advanced, conflicting database and documentation files reconciled in this branch. All #156 non-overlapping source/test files and report carried; latest main candidate journal preserved. Fresh combined CI mandatory.

## New actual work (not full task acceptance)

- P01/P05: integrate #156 session/browser recovery and native owner reconciliation; retain current candidate journal, risk policy and immutable receipts; exact tag, partial and terminal metadata, no broker mutations/release.
- P02: fix overlapping native profile connection race, bounded fetch and stale generation; underlying quote native identity and timestamp; exact-expiry chain only, no alternate expiry fallback, strict rows/keys/duplicates, true missing OI and crossed-book rejection; native untimed versus practice provenance; preserve zero broker funds, null missing quote/depth/Greeks and unverified source in snapshot persistence. Existing display fallback remains modeled; source propagation beyond provider must be verified.
- P03: exact underlying historical availability, closed 15m candles, expiry-bound leg identity, positive bid/ask and adequate depth, no fabricated quote/exit. Stored replay provenance remains unverified; costs, lot assumptions, source completeness and absence of look-ahead still require independent validation. Descriptive statistics and deterministic bounded bootstrap; no invented profit factor, annualized ratios, OOS or walk-forward passes. Walk-forward reports no evidence instead of invented windows; Monte Carlo requires actual explicit sample, no fabricated sample or capital/ruin estimate. Legacy numeric fields use zero sentinel where unavailable; UI distinguishes missing evidence. Overfit UI labels existing output unverified, underlying algorithm not certified.
- P05: existing recovery and research dashboards show uncertainty, actual sample status and no live release authority; tests cover date/time, exact chain, missing depth/OI, reproducibility, no fabricated OOS, bounded sample and concurrent native profile identity/zero margin.
- No actual broker read/order performed by development, hosted deploy, credentials, external data or safety gate change. New changes require combined CI. Existing source data may be mislabeled and legacy rows are not rewritten. Independent real historical data, calendar, effective lot and fee validation, live Greek/NAV and protected NRML release remain blocked by evidence; do not mark those tasks complete.

Affected IDs are cross-referenced below, not completed IDs. Some represent only a subset or dependency of the named task:
P01: 01, 04, 05, 06, 09, 10, 14, 15, 17, 19, 23, 24, 25, 26, 28, 29, 35, 36, 39, 46, 47, 49, 50

P02: 01, 02, 06, 08, 09, 16, 17, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 39

P03: 01, 02, 04, 05, 06, 08, 09, 10, 17, 18, 19, 20, 21, 22, 23, 24, 26, 27, 28, 29, 30, 36, 37, 38, 39, 40, 44, 45, 46, 47, 48, 49

P05: 01, 02, 03, 04, 05, 06, 07, 08, 09, 21, 22, 31, 32, 33, 34, 35, 36, 37, 39, 40, 44

## 150-task execution register

| Task ID | Existing scope | Verified baseline | This batch |
|---|---|---|---|
| P01-01 | Central auth | Partial | Advanced/affected; combined CI pending |
| P01-02 | mutation protection | Partial | No new verified completion |
| P01-03 | admin permissions | Partial | No new verified completion |
| P01-04 | input validation | Partial | Advanced/affected; combined CI pending |
| P01-05 | rate limits | Partial | Advanced/affected; combined CI pending |
| P01-06 | Account isolation | Partial | Advanced/affected; combined CI pending |
| P01-07 | password persistence | Scoped merged | No new verified completion |
| P01-08 | disabled status | Scoped merged | No new verified completion |
| P01-09 | session revocation | Scoped merged | Advanced/affected; combined CI pending |
| P01-10 | secure token handling | Partial | Advanced/affected; combined CI pending |
| P01-11 | Reset protection | Scoped merged | No new verified completion |
| P01-12 | scoped deletion | Scoped merged | No new verified completion |
| P01-13 | atomic transactions | Partial | No new verified completion |
| P01-14 | write readback | Partial | Advanced/affected; combined CI pending |
| P01-15 | failure handling | Partial | Advanced/affected; combined CI pending |
| P01-16 | Common execution gateway | Partial | No new verified completion |
| P01-17 | caller authorization | Partial | Advanced/affected; combined CI pending |
| P01-18 | mode validation | Partial | No new verified completion |
| P01-19 | release interlocks | Partial | Advanced/affected; combined CI pending |
| P01-20 | idempotency | Partial | No new verified completion |
| P01-21 | Server margin | Partial | No new verified completion |
| P01-22 | listed contracts | Partial | No new verified completion |
| P01-23 | partial fills | Partial | Advanced/affected; combined CI pending |
| P01-24 | rollback reconciliation | Partial | Advanced/affected; combined CI pending |
| P01-25 | unresolved exposure quarantine | Partial | Advanced/affected; combined CI pending |
| P01-26 | Exit verification | Scoped merged | Advanced/affected; combined CI pending |
| P01-27 | duplicate entry | Partial | No new verified completion |
| P01-28 | restart recovery | Partial | Advanced/affected; combined CI pending |
| P01-29 | safe rearm | Partial | Advanced/affected; combined CI pending |
| P01-30 | circuit-breaker authorization | Partial | No new verified completion |
| P01-31 | Option premium | Partial | No new verified completion |
| P01-32 | effective lot | Partial | No new verified completion |
| P01-33 | instrument key | Partial | No new verified completion |
| P01-34 | strict mode | Scoped merged | No new verified completion |
| P01-35 | unknown outcome | Partial | Advanced/affected; combined CI pending |
| P01-36 | Account capital | Partial | Advanced/affected; combined CI pending |
| P01-37 | portfolio Greeks | Partial | No new verified completion |
| P01-38 | persistent drawdown | Partial | No new verified completion |
| P01-39 | real diagnostics | Partial | Advanced/affected; combined CI pending |
| P01-40 | unified kill switch | Partial | No new verified completion |
| P01-41 | Mock isolation | Scoped merged | No new verified completion |
| P01-42 | stale signals | Partial | No new verified completion |
| P01-43 | paper/live separation | Partial | No new verified completion |
| P01-44 | duplicate crossover | Partial | No new verified completion |
| P01-45 | MIS/NRML segregation | Scoped merged | No new verified completion |
| P01-46 | Unauthorized API | Scoped merged | Advanced/affected; combined CI pending |
| P01-47 | cross-account | Scoped merged | Advanced/affected; combined CI pending |
| P01-48 | destructive action | Scoped merged | No new verified completion |
| P01-49 | broker simulation | Partial | Advanced/affected; combined CI pending |
| P01-50 | combined integration tests | Partial | Advanced/affected; combined CI pending |
| P02-01 | Connection supervision | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P02-02 | token expiry | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P02-03 | reconnect backoff | Not reassessed in this checkpoint | No new verified completion |
| P02-04 | resubscribe | Not reassessed in this checkpoint | No new verified completion |
| P02-05 | heartbeat | Not reassessed in this checkpoint | No new verified completion |
| P02-06 | Original timestamps | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P02-07 | dedupe | Not reassessed in this checkpoint | No new verified completion |
| P02-08 | sequence | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P02-09 | stale rejection | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P02-10 | latency | Not reassessed in this checkpoint | No new verified completion |
| P02-11 | Candle slots | Not reassessed in this checkpoint | No new verified completion |
| P02-12 | completeness | Not reassessed in this checkpoint | No new verified completion |
| P02-13 | gaps | Not reassessed in this checkpoint | No new verified completion |
| P02-14 | recovery | Not reassessed in this checkpoint | No new verified completion |
| P02-15 | closed-bar reconciliation | Not reassessed in this checkpoint | No new verified completion |
| P02-16 | Listed master | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P02-17 | exchange expiry | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P02-18 | effective lots | Not reassessed in this checkpoint | No new verified completion |
| P02-19 | holidays | Not reassessed in this checkpoint | No new verified completion |
| P02-20 | expired rejection | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P02-21 | Bid/ask | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P02-22 | depth | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P02-23 | freshness | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P02-24 | IV/Greeks | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P02-25 | synthetic isolation | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P02-26 | Provenance | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P02-27 | clocks | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P02-28 | liquidity | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P02-29 | missing-data warnings | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P02-30 | eligibility | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P02-31 | Outbox | Not reassessed in this checkpoint | No new verified completion |
| P02-32 | event ID | Not reassessed in this checkpoint | No new verified completion |
| P02-33 | controlled retries | Not reassessed in this checkpoint | No new verified completion |
| P02-34 | ambiguous delivery | Not reassessed in this checkpoint | No new verified completion |
| P02-35 | restart recovery | Not reassessed in this checkpoint | No new verified completion |
| P02-36 | Category controls | Not reassessed in this checkpoint | No new verified completion |
| P02-37 | latency | Not reassessed in this checkpoint | No new verified completion |
| P02-38 | missed counts | Not reassessed in this checkpoint | No new verified completion |
| P02-39 | diagnostics | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P02-40 | notification history | Not reassessed in this checkpoint | No new verified completion |
| P02-41 | Independent workers | Not reassessed in this checkpoint | No new verified completion |
| P02-42 | overlap | Not reassessed in this checkpoint | No new verified completion |
| P02-43 | ownership | Not reassessed in this checkpoint | No new verified completion |
| P02-44 | graceful shutdown | Not reassessed in this checkpoint | No new verified completion |
| P02-45 | restart health | Not reassessed in this checkpoint | No new verified completion |
| P02-46 | Storage config | Not reassessed in this checkpoint | No new verified completion |
| P02-47 | backups | Not reassessed in this checkpoint | No new verified completion |
| P02-48 | recovery tools | Not reassessed in this checkpoint | No new verified completion |
| P02-49 | runtime health | Not reassessed in this checkpoint | No new verified completion |
| P02-50 | AI Studio smoke | Not reassessed in this checkpoint | No new verified completion |
| P03-01 | Bid/ask fills | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-02 | depth | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-03 | partials | Not reassessed in this checkpoint | No new verified completion |
| P03-04 | slippage | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-05 | rejections | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-06 | Quantity | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-07 | lots | Not reassessed in this checkpoint | No new verified completion |
| P03-08 | brokerage | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-09 | statutory costs | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-10 | net P&L | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-11 | Isolated strategies | Not reassessed in this checkpoint | No new verified completion |
| P03-12 | allocation | Not reassessed in this checkpoint | No new verified completion |
| P03-13 | margin reserve | Not reassessed in this checkpoint | No new verified completion |
| P03-14 | exposure | Not reassessed in this checkpoint | No new verified completion |
| P03-15 | equity curves | Not reassessed in this checkpoint | No new verified completion |
| P03-16 | Licensed importer | Not reassessed in this checkpoint | No new verified completion |
| P03-17 | clocks | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-18 | contract identity | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-19 | gaps | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-20 | provenance | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-21 | No look-ahead | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-22 | expiry | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-23 | entry time | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-24 | exit time | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-25 | shared strategy logic | Not reassessed in this checkpoint | No new verified completion |
| P03-26 | Modeled labels | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-27 | genuine separation | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-28 | historical costs | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-29 | reproducibility | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-30 | invalid rejection | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-31 | Baseline | Not reassessed in this checkpoint | No new verified completion |
| P03-32 | regime | Not reassessed in this checkpoint | No new verified completion |
| P03-33 | adaptive trailing | Not reassessed in this checkpoint | No new verified completion |
| P03-34 | contract selection | Not reassessed in this checkpoint | No new verified completion |
| P03-35 | combined variant | Not reassessed in this checkpoint | No new verified completion |
| P03-36 | Train | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-37 | validation | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-38 | untouched OOS | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-39 | stability | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-40 | overfit checks | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-41 | Overnight | Not reassessed in this checkpoint | No new verified completion |
| P03-42 | volatility | Not reassessed in this checkpoint | No new verified completion |
| P03-43 | liquidity | Not reassessed in this checkpoint | No new verified completion |
| P03-44 | loss streaks | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-45 | Monte Carlo | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-46 | Expectancy | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-47 | drawdown | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-48 | profit factor | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-49 | risk-adjusted returns | Not reassessed in this checkpoint | Advanced/affected; combined CI pending |
| P03-50 | leaderboard | Not reassessed in this checkpoint | No new verified completion |

P01 baseline 12 scoped merged, 38 partial, zero untouched. No new fully accepted task count claimed. P02/P03 other baseline tasks are not assessed here (not necessarily untouched). P04/P05 remain in master plan; P05 affected IDs listed above. The 100–200 verified completion target is not reached. Do not turn number of commits, tests or cross-references into completed tasks.

## Anti-stuck sequencing

Run four independent streams: (A) integrate #156 and verify combined source; (B) data/reliability (strict stream event identity, sequence, gaps, complete candles, outbox and workers); (C) actual licensed data/import provenance, cost model, no-lookahead and reproducible independent research; (D) paper positional 1/2/4/8-week, protection and UI tests. Only dependent live/hosted acceptance remains gated by external proof. Use consolidated branch with shared-file integration owner; avoid duplicate PR chains, preserve passing features. Before merge confirm both exact-head CI workflows, changed paths and documented risks. Acceptance evidence remains task-specific.

## Feed, research and positional continuation — 2026-11-25 IST

#156 exact head 698f5c5f72211228dfc06c8c1271c76962cb58c8 passed both 45492390081 and 45492390122; conflicts after #155 merge resolved by carrying its source/tests in #157. #157 exact head 561bbcc9f36e9f300b0e7568c3383b3d0523c431 passed paper staging 45496702836, production build and EMA invariant jobs in 45496702831; full regression running. Current main remains 0ac7d551748792c3ad69f6ced1911f728a275df4. New descendant branch does not interrupt #157 CI.

[Cross-phase feed/research/positional report](MEGA_BATCH_FEED_RESEARCH_POSITIONAL.md) records actual changes to active stream, feed, quote storage, research promotion/quality endpoints, overfit/parameter stability, four-horizon research ranking and offline NRML risk review, plus four new fixture cases. Unsupported promotion is explicitly blocked; real historical and broker evidence not invented. No live order or hosting change. New combined CI pending. 50–100 verified task target not achieved; affected IDs are partial only, not newly completed. P01 remains 12 scoped merged/38 partial/0 untouched. Keep original 250-task plan, independent packages and Google AI Studio acceptance gate.

## Verified merge, regression repair and stored-replay integration — 2026-11-25 IST

#157 exact head 561bbcc9f36e9f300b0e7568c3383b3d0523c431 passed 45496702831 and 45496702836; merged main 9a36ad719211ae888d8a85d5fa8b85473aa92c06. #156 closed superseded (source/tests preserved). #158 original head 01c3f344aa7ef9b05512a9f7e91c4c22c58b6a00 passed paper staging 45500589701 and production build, but full and invariant regression in 45500589342 failed. Two Phase77/78 partial-fill fixtures showed only two-lot indicative bid depth for an original three-lot hypothetical position; positive fixtures now provide three lots (actual residual position/stop still two). Integration quote provenance and parameter stability tests now expect unverified source and unavailable empirical evidence instead of fabricated OK/plateau. No safety guard loosened. Repair commits 66593f1, 122e5bc, 086825b, d993172. Fresh CI mandatory.

Actual follow-up changes on the same #158 branch:
- P03-26/27/29/30/36/37/38/39/40, P05-01/02/03/21/31/32/33/36/39/44: select exactly one completed, current strategy-version stored replay with explicit replay ID if ambiguous; reject legacy provenance, duplicate IDs, chronology, overlaps, invalid civil offset times, invalid P&L/cost and aggregate/count mismatch. Compute bounded expanding chronological descriptive partitions with one embargoed trade before each later partition; each later segment is disjoint. This is a fixed replay, not actual model training or independent OOS. Existing authenticated research API now feeds exact stored samples to deterministic bootstrap and partition functions; UI exposes replay selection and descriptive results, no promotion/ruin/capital claim. Numeric legacy Sharpe sentinel remains unavailable. Existing shared research catalog, not personal broker position data. Some stored rows with naive timestamp formats or ambiguous replay identity fail closed. True training/OOS, data/cost provenance and strategy approval remain pending.
- P01-14/15/26/45/47/50, P03-01/02/05/06/08/09/10, P04-26/27/28/30/31/45, P05-02/03/16/21/37/39/40/44: actual MIS modeled paper monitor skips NRML, rejects invalid spot/premium/quantity and missing contract, isolates estimator errors per trade, validates trailing config, and logs exit success only on confirmed persisted closure. This is still modeled MIS pricing, not realistic depth fills or a new NRML executor. Invalid trailing settings fall back to existing fixed SL/TP logic. No live order, capital release, reset or broker safety bypass.
- Five stored sample/partition/bootstrap tests and one runtime paper-monitor fixture committed. No claim of fresh passing tests until exact-head CI.

Main 9a36ad719211ae888d8a85d5fa8b85473aa92c06. P01 12 scoped merged / 38 partial / 0 untouched retained pending task-level acceptance; P02–P05 baseline not reassessed fully. User target 50–100 fully completed tasks per batch not achieved. Existing five phases/250 tasks and Google AI Studio deployment unchanged. #158 remains one combined merge candidate; no new overlapping PR. This checkpoint supersedes previous CI pending statements for #157 and #156.
