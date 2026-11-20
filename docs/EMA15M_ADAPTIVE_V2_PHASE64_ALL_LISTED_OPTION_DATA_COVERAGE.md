# Adaptive Swing v2 — Phase64 full-listed-option historical L1 acquisition coverage

**OFFLINE RESEARCH ONLY · Draft stacked on Phase63 · No live broker, no NRML/GTT/stop writes, no forced 15:15 positional exit.**

## What changes and why

Phase21 already defines external source-intake and entitlement declarations; Phase22 already converts strict native option Level-1 CSV (with explicit warnings about vendor authenticity), and Phase62–63 already reconcile local signatures, hashes and claimed receipt times. Adding another locally generated signature does **not** produce original NSE/BSE/vendor data. The practical next obstacle is **which original option tick, across which contract/day/horizon, is absent or too sparse to study a real positional strategy**.

Phase64 therefore implements a **complete original listed CE/PE data-acquisition and quality matrix**. It is **not** a new data feed client, trading model, return ranker, or evidence of independently licensed data. Existing provenance gates remain untouched.

## Offline original source coverage audit

`src/server/engine/ema15m/adaptivePhase64OriginalListedL1Coverage.ts` implements `auditPhase64OriginalListedL1AcquisitionCoverage(input,pins)`.

1. Re-runs original Phase63 → Phase62 → Phase61 → Phase60 → Phase59 → Phase58 → Phase57 → Phase51/50 → Phase8 source/receipt/entry-first safety checks. The complete original OOS dates × 3 alternative arms × 1W/2W/4W/8W remain in the entry denominator.
2. Separately SHA256-locks complete original Phase63 dossier and pins, predeclared Phase64 acquisition thresholds, and a **manifest of every originally listed decision-time option contract** across original OOS folds. Manifest retains fold/date/decision/contract key, option CE/PE, expiry, strike and lot size, including options **never selected as trades**, not merely winners.
3. For each original decision-time listed contract, classify original **calendar time to expiry** into disjoint provisional buckets: 1W [1,8), 2W [8,18), 4W [18,36), 8W [36,80] days. Check both CE and PE where declared. The bucket assignment uses **operator supplied, unauthenticated original contract catalog**, not a proven official point-in-time NSE/BSE expiry master. Invalid type/expiry/lot or missing pair fails closed.
4. Using the already existing original option quote tape and original extended declared exchange sessions, calculate original **decision-to-close** BID/ASK quote count, maximum **event-time gap including decision/close edges**, original event-to-claimed-`availableAt` delay and chronological delivery, maximum **bid/ask spread percentage**, and displayed **BID + ASK quantity in original lot units**. It separately requires the **first following declared session** to contain enough source L1 snapshots within a prespecified window after opening; a much later favorable BID does not substitute for first-open overnight gap evidence.
5. Report counts by **original decision-time regime × horizon × CE/PE**, including expected full-option listings, source-covered pairs, missing pre-close snapshots, missing first-next-session snapshots, excessive observation gaps, wide option spread, inadequate displayed depth, delayed/backfilled/noncausal `availableAt` and expiry/lot violations.
6. If any listed contract is missing or too sparse, return `INCOMPLETE_EVIDENCE` and the **full** source-gap denominator, not a “flat PnL” or dropped loser. Even if all listed options meet declared software coverage thresholds, result is only `DESCRIPTIVE_SINGLE_REGIME_SOURCE_COVERAGE_ONLY` or `DESCRIPTIVE_MULTI_REGIME_SOURCE_COVERAGE_ONLY`. Both are **unverified descriptive** results, not a trading admission.

**Sample limitations:** The current synthetic fixture has just two OOS decision dates and one observed market regime. Its neat five-minute option BID/ASK quotes and displayed depth are not market realities. A true strategy-duration comparison needs genuine licensed multi-regime history, real exchange expiry/calendar, independently verifiable receipt clocks, spreads, IV/theta and overnight risk data. The code deliberately never authorizes the best expiry, 100 underlying index-point target, actual fills, native stop, NRML orders or profitability.

## Predeclared acquisition policy

The Phase64 review policy requires concrete integer thresholds for minimum original pre-close quote count, maximum consecutive original quote gap, minimum first-next-open quote count and the first-open observation window, maximum original bid/ask spread %, minimum bid/ask displayed lots and maximum original event-to-claimed-receipt lag. Thresholds are separately pinned and **cannot be optimized after viewing the original OOS outcomes** without invalidating the independent policy SHA.

The Phase64 reporter **does not invent vendor timestamps or reconstruct orders from trade-only/EOD data**. Rows from existing Phase22 native CSV ingestion may be evaluated only as owner-provided source until a separately authenticated original feed is obtained.

## Tests and CI

`src/quant/tests/ema15m_adaptive_phase64_all_listed_l1_acquisition.test.ts` tests the same original Phase63 synthetic source, all OOS listed CE/PE candidates, all four expiry-duration buckets and eleven adversarial conditions including:

- Original all-listed (not merely chosen-entry) contract coverage and full 24 decision×arm×horizon denominator.
- Quote intervals becoming too sparse under independently pinned tighter cadence.
- Missing second **next-session opening** quote when its allowed window is shortened.
- Spread slippage and bid/ask displayed-depth requirements beyond the available source.
- Too few original pre-close source quotes; unpriced data cannot be treated as a fill.
- An OOS contract-universe manifest tamper, invented extra contracts, and post-hoc policy changes.
- The source failing its **earlier Phase63 signature/receipt audit**.
- Original +30 premium giveback and adverse overnight gap variants do not become duration-profit evidence.

Dedicated `.github/workflows/adaptive-phase64-listed-l1-acquisition.yml` checks TypeScript and Phase64 tests; Phase50–64 combined focused suite and full three-job EMA15M targeted safety, production build and `npm test` remain **independent merge gates**.

## Operator-private report

`scripts/audit-adaptive-phase64-option-data-coverage.ts` requires separately stored owner-only `0600` JSON files inside owner-only `0700` directories, run in an operator-enforced network-isolated environment:

```bash
npx tsx scripts/audit-adaptive-phase64-option-data-coverage.ts \
  --approve-isolated-offline-review \
  --private-phase64-original-listed-l1-package /private/phase64-original-source.json \
  --independent-phase64-all-listed-policy-pins /private/phase64-pins.json
```

It prints only counts by regime/horizon/CE-PE, not individual instrument keys, original quote timestamps/prices, source filenames, licencing contents, signatures or account identifiers. A zero exit means only an internally consistent **descriptive software source-coverage audit**, not a licensed supplier's certificate or a passing strategy backtest.

## Actual next action for real data

A qualified vendor/exchange source must supply **historical original option bid/ask plus displayed quantity** with an independently reviewed licence allowing this analysis; original native archive bytes and reliable source and client delivery timestamps; official point-in-time F&O listed-contract and exchange trading calendar; enough **chronologically untouched**, diverse-trend, volatile, sideways OOS months to cover every 1W/2W/4W/8W candidate including no-entry and missing-source dates. The Phase64 acquisition matrix can then identify **which specific coverage failures remain**, without backfilling synthetic prices or modifying original historical entries.

Keep #17–#22 especially #20 broker-native overnight stop/GTT lifecycle **OPEN**. All stacked research PRs **DRAFT/unmerged**. Existing EMA23/50 MIS 15:15 intraday auto-squareoff remains unchanged; **NRML positional 1W–8W never force-exits at 15:15 and has no live order, GTT or stop writer.**
