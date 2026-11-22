# Adaptive Swing v2 — remaining release evidence after Phase114

**Research engineering checklist, NOT a deployment or profitability approval.
Last reviewed in Phase114 stacked DRAFT PR #119 (2026-11-22).**

## Implemented research diagnostics, but NOT real-world approvals

| Layer | Engineering status | What it cannot prove |
| --- | --- | --- |
| NRML vs MIS 15:15 | Phase90 fail-closed NRML BUY interlock and MIS-only scheduled square-off preserved | Safe NRML live BUY release |
| Original BUY | Phases99–102, 109, 111 immutable order/trade receipts and cross-source premium checks | Independent exchange contract note or historical source completeness |
| Account-wide broker | Phases103–108 double GET, auth epoch, competing orders/GTT and net conservation | Atomic market-state observation or complete past orders |
| Existing native SL/SL-M | Phase110 current-day SELL stop review | 1–8W overnight persistent stop; broker-native DAY validity is not persistent |
| 1W/2W/4W/8W carry | Phase111 original premium debit, budget, declared expiry and uncovered calendar-day risk | Contract expiry verified by exchange, approved max capital, executable stop price, net fees |
| Existing SINGLE SELL ENTRY GTT | Phase112 existing GTT SELL BELOW conditional exit read-only review | F&O-specific broker acceptance, true broker close-only instruction, native stop ACK |
| Triggered GTT | Phase113 generated LIMIT SELL child, unique trade IDs and broker net read-only conservation | Independent exchange-signed stop ACK, guaranteed gap fill, complete multi-day trade history |
| Missing GTT/restart | Phase114 current-GTT, full-account GTT, orderbook and NRML broker net two-pass quarantine | Missing parent = cancelled/filled; no old orphan SELL; authorization to retry/close |
| Tests/CI | Synthetic adversarial focused suites and GitHub Actions per stacked draft | Broker test environment completion, real trading authorization or profitability |

## Unresolved mandatory external evidence, mapped to open GitHub blockers

### Issue #17 — Original licensed 1W–8W historical F&O option L1

- [ ] Obtain genuine licensed Indian index option best bid/ask and displayed quantity, original source event time + strategy availability time, authentic contract/expiry/lot catalogs, loss/chop/volatility/gap/expiry dates and correct rights to retain/use.
- [ ] Independently audit vendor source identity, entitlement, raw files and original-time clocks. Public bhavcopy/EOD cannot substitute intraday executable bid/ask.
- [ ] Run predeclared 1W/2W/4W/8W strategy sample; full censoring of unavailable bids, realistic fills/spreads/fees/queue/depth, 50/70 runup reversing before 100 premium-point candidate target.

### Issue #18 — Original effective-dated NSE/BSE calendars

- [ ] Acquire issuer-authenticated NSE/BSE F&O session, special-day/Muhurat, emergency closure and original contract-expiry/lot amendments for **each** historical study date.
- [ ] Independently check time-versioned instrument/segment rules, including official applicability of **7 December 2026** NSE changes only after they become effective. Do not apply future rules retrospectively.
- [ ] Obtain independent original document identity, not synthetic clocks or a newly signed local hash.

### Issue #19 — Independent reviewer + preregistered OOS custody

- [ ] Two independent people validate calendar and L1 archive identity, conflicts, key custody and public fingerprints through trusted channels.
- [ ] Trusted external timestamp **before** untouched OOS assessment; immutable study policy, missing-data, spread, fold, bias, horizon, regime and multiplicity rules.
- [ ] Verify external archive signatures/entitlements; local Ed25519 checksums are not issuer authentication.

### Issue #20 — Actual native NRML option broker protection

- [x] Read-only code paths for broker GTT/options, original BUY child, SELL fills, competing GTT/orders, session epoch and two-pass state drift (synthetic).
- [x] Fail-closed simulated missing/completed GTT and unknown/cancelled/partial/restart; never issue duplicate SELL or auto-CLOSED.
- [ ] Obtain broker-confirmed applicability of SINGLE GTT **ENTRY SELL BELOW** for a *specific already-filled NRML NSE_FO/BSE_FO long option*, with exact API data contract, SELL authorization, per-instrument tick/price controls and not opening short after position changes.
- [ ] Run real broker-sanctioned **non-production** lifecycle tests proving protected quantity, child/exchange ACK, cancellation/replace/partial fills, disconnect/unknown ACK, GTT parent disappearance and restart across different sessions. Archive separate venue execution/position evidence. No live order dispatch merely to test.
- [ ] Define approved account-wide max margin/capital, overnight loss risk, emergency halt, manual kill switch and operations release signoff. A GTT LIMIT SELL may fail on gap; no hard guaranteed stop fill.
- [ ] Do NOT adopt 15:15 MIS forced exit for NRML 1W–8W positional holdings.

### Issue #21 — Statistical and realistic OOS profitability

- [ ] Repeat locked original-data study on unseen licensed Indian option L1 across enough truly distinct folds, regimes, expiry classes and horizons.
- [ ] Include all missing/unexecutable entries and exits, partial fills, large gap losses, realistic taxes/charges and losing reversal patterns; report sample size, uncertainty, tail drawdown and horizon-selection multiplicity.
- [ ] Independent statistical review must approve findings **before** claims of profitability or autonomous size/expiry selection.

### Issue #22 — Stacked draft code/security/release review

- [ ] Human inspect every stacked PR in dependency order, including legacy #1–#16 and latest Phase112 #117, Phase113 #118, Phase114 #119. Do not count source compilability as production approval.
- [ ] Verify head SHA targeted TypeScript/tests, full regression, production build, MIS-order and 15:15 nonregression, no new NRML live-order path, no credentials or licensed raw quotes in public GitHub.
- [ ] Reconcile branch ancestry and release plan independently, then separately approve code merge and, only with all other conditions satisfied, an explicit trading release. No auto merge.

## Release gating and accounting

No amount of repeated synthetic CI or source-hash checks substitutes the
external broker, market-data license, exchange calendars, independent
study/custody and human legal/security/risk approvals above.

| Action | Phase114 evidence-based permission |
| --- | --- |
| Inspect current GTT, child, broker net (GET-only) | SUPERADMIN manual only |
| Create a GTT SELL / place a new BUY | **BLOCKED** |
| Replace, cancel or retry UNKNOWN or missing GTT child | **BLOCKED** |
| Close a durable position / book realised P&L from native ACK alone | **BLOCKED** |
| Treat a GTT condition or DAY stop as 1–8W guaranteed overnight protection | **BLOCKED** |
| Merge stacked DRAFT PRs / deploy to production | **NOT APPROVED** |
| Enable real-money LIVE NRML BUY | **BLOCKED** |
| Change existing MIS-only 15:15 square-off behavior | **DO NOT CHANGE** |

**Required human next actions**: verified broker response for exact NRML
option GTT exit semantics; licensed historical original L1; exchange
calendar source archive; preregistered independent OOS and third-party
signoff; security/operational risk review and manual release.
