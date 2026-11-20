# Adaptive Swing v2 — Phase66 standalone new historical option L1 preflight

**DRAFT • OFFLINE RESEARCH ONLY • stacked on Phase65 PR #70. No live broker orders, GTT/stop writes, contract selection or forced positional NRML 15:15 exit.**

## Practical improvement over Phase65

Phase65 compares a separately supplied historical vendor candidate to the previously frozen Phase50–64 dataset. That reference dataset is synthetic in CI. A genuinely new vendor feed cannot logically be required to match old synthetic quotes. Phase66 therefore adds an independent cold-start option Level-1 source preflight: a NEW CSV, NEW original listed-contract/catalog and session files, and a separately frozen historical OOS research plan.

It reuses the original Phase22 strict RFC4180-like parser unchanged. **It does not buy/download data, authenticate a vendor, certify a legal entitlement, prove the strategy actually observed quotes on historical dates or modify the older Phase50–65 source.** No live orders or broker writes.

## Operator-private input and strict original L1 data format

The offline API is auditPhase66StandaloneVendorPreflight in src/server/engine/ema15m/adaptivePhase66StandaloneVendorPreflight.ts.

The operator supplies four independently pinned original artifacts:

1. **New historical option native-format CSV** with these exact ordered columns: sourceRecordId, sourceSequence, instrumentKey, eventAt, originalAvailableAt, bid, ask, bidQty, askQty. Best BID/ASK and displayed best-book quantities are essential; trade-only and EOD values are **not** substitutes. All observations, even from unchosen options, no-entry dates and next sessions, remain in the denominator. Source event/availableAt values are untrusted claims until real contemporaneous logs are independently attested. Never fabricate originalAvailableAt by copying the date a bulk archive was downloaded.
2. **Original point-in-time listed-contract and decision catalog**: explicit training/test folds, each original OOS decision (including NO_ENTRY and ENTRY_CLAIMED), owner-claimed regime and *all* original CE/PE option contracts with instrument key, expiry date, strike price and lot size. The entire fold × decision × listing manifest is separately pinned before testing any strategy outcomes.
3. **Original operator-declared full session calendar**, including the next session after the final OOS decision. All sessions are checked for IST day and nonoverlapping chronological open/close windows. Only an independently authenticated official exchange contract master/calendar can establish genuine exchange expiry and sessions; the supplied catalog cannot.
4. **Opaque claimed research entitlement bytes**, with a separately pinned source delivery declaration and prespecified risk/coverage policy. A matching legal document hash does not prove an NSE/BSE index-option historical Level-1 research licence. Genuine supplier/legal verification remains mandatory.

Source and package pins also bind every file's exact SHA256, separately pinned OOS manifest, source quote count, original OOS decision count, all-listed CE/PE contract-pair count, delivery declaration and predeclared policy. Retrospective operator re-pins can still fabricate a complete package, so none of this independently establishes historical market truth.

The delivery declaration explicitly distinguishes original claimed client receive clock from **later historical archive download**. It rejects EOD/trade-only/reconstructed BID proxies, replay as original receipt and treating a download timestamp as original strategy availableAt. A downloaded historical data file may be inspected for content, but by itself it cannot prove what was known to a real strategy at an earlier OOS decision time.

## OOS leakage screens and 1W–8W coverage

Every declared training window must precede the earliest held-out test window with a preregistered **train-to-test embargo at least as long as the maximum proposed holding calendar days**. Test fold windows must be strictly chronological and nonoverlapping, and none of the earlier OOS test data may become training input for a later fold. These are minimum *operator-declared* leakage checks, NOT proof the sample is untouched or statistically independent.

The contract catalog must include both CE and PE for each provisional 1W [1,8), 2W [8,18), 4W [18,36) and 8W [36,80] calendar-day-to-expiry bucket on **each** originally declared OOS decision. Missing no-entry dates, a long-expiry PE, unknown source instrument, changed listed contract or out-of-bucket expiry fails closed. Actual NSE/BSE expiries, lot sizes and last trading sessions still need independent official review.

For every OOS listed decision-contract pair, Phase66 checks prespecified original BID/ASK sample count from entry-decision time through the close, maximum quote-free gap *including start/close edges*, realistic spread, **whole-lot best BID AND ASK displayed depth**, original event-to-claimed-availability lag, causal per-instrument clock order, and first-next-session opening quote presence. Source availableAt must be no later than the corresponding session-close or first-opening evaluation window. An option quote observed at 15:30 but received at 15:30:05 does NOT constitute a usable pre-close price, regardless of its favorable BID. Low or zero displayed depth is valid historical data but fails executable-liquidity coverage.

Aggregation is strictly by **owner-claimed regime × horizon × CE/PE**, retains no-entry days, and never computes PnL, selects an optimal contract, invents stops or treats displayed market depth as an actual broker fill.

## Report states and unverified claims

- INVALID_EVIDENCE: unpinned/modified source, malformed claimed delivery, missing independent source policy, forbidden source/replay/availability-clock claim.
- INCOMPLETE_EVIDENCE: missing original OOS decisions/contracts or quotes, wrong expiry/type/lot, leaked train/test folds, duplicated OOS decision days, empty test folds, unknown listed instruments, missing first-next-open prints, zero displayed BID/ASK depth, wide spreads, delayed claimed availability or insufficient original quote cadence.
- DESCRIPTIVE_COVERAGE_INSUFFICIENT_UNVERIFIED: mechanically complete candidate tape, but insufficient fold or claimed-regime OOS sample under prespecified criteria.
- DESCRIPTIVE_OWNER_CANDIDATE_SOURCE_COVERAGE_UNVERIFIED: all *operator-declared* OOS contracts and quality thresholds satisfied. **This is NOT a vendor certification, genuine market data, valid licence, profitability, execution signal or production clearance.**

Always false: independently verified vendor identity, historical option research entitlement, source/client receipt clock, official exchange expiry/calendar, genuine market-regime edge, real IV/theta/overnight-loss calibration, executable BID/ASK fills, optimal 1W/2W/4W/8W expiry, native broker NRML stop/GTT acknowledgements, execution and production-safety approval. nativeOrderInstruction is always null.

## Synthetic test coverage

The separate fixture src/quant/tests/phase66_synthetic_new_vendor_fixture.ts creates **4 original OOS dates across 2 disjoint folds and 2 fabricated regimes, including 2 NO_ENTRY days, 32 all-listed CE/PE contracts and 448 option L1 prints**. It is NOT the Phase65 simulated historical quote tape. src/quant/tests/ema15m_adaptive_phase66_standalone_vendor_preflight.test.ts supplies **26 adversarial synthetic tests** of full OOS source completeness, stale/late quote receipt, bid/ask spread and displayed depth, first-next-open coverage, missing original quotes and unentered contracts, changed pinned files, overlapping/leaked folds, too-short hold embargo, invented regime labels and copied fake licence rights. The test intentionally allows operator to re-pin false strike price or relabel synthetic data while *never* granting independent exchange truth.

The first dedicated test run exposed a late-as-of synthetic event: an event at 15:30 whose claimed receipt was 15:30:05. The validator correctly rejected it. The fixture's final event was moved to 15:25 without weakening as-of checks. The corrected dedicated 24-test run and TypeScript passed; the subsequent added duplicate-OOS-day and empty-fold defenses are tested separately on this branch.

CI: .github/workflows/adaptive-phase66-standalone-vendor-preflight.yml. Full Phase50–66 focused checks and the three-job EMA15M safety/build/full regression must pass separately before a merge discussion; synthetic CI is not evidence of trading profitability.

## Offline manual command and privacy

Use two separate owner-only 0600 files inside owner-only 0700 directories, with OS-level *no network egress* and separately retained immutable source review evidence. The Node CLI does not independently enforce network isolation or external witness identity.

    npx tsx scripts/audit-adaptive-phase66-new-vendor-preflight.ts \
      --approve-isolated-offline-review \
      --private-phase66-new-vendor-dossier /private/new-vendor-source.json \
      --independent-phase66-original-oos-pins /private/frozen-source-pins.json

The output contains only redacted aggregate option source coverage counters and hard-false proof flags, not raw L1, contract IDs, premium prices, licence bytes or account details. A zero exit is *descriptive operator source consistency only*.

## Genuine next external requirement

Procure independently licensed index-option historical best BID/ASK plus displayed quantities, source product data dictionary, original unmodified vendor bytes and issuer identity, independently attested legal historical L1 research use rights, official point-in-time exchange listing/expiry/lot and session master, and **contemporaneous** strategy-side source receipt logs if actually available. A later bulk download is not evidence of earlier client access. If historical client arrival was not recorded, explicitly mark it UNKNOWN and do not use fabricated old availability to estimate actual executable OOS returns.

Only then design independent chronological multi-market-cycle original option replay for 1W/2W/4W/8W, with predeclared entry/exit/risk rules, no-entry/unpriced decisions, option premium BID reversals, spread, IV/theta, gaps and **complete long-option paid debit loss**. Separately verify real broker-native NRML stop/GTT place/modify/cancel/child ACK and overnight persistence/failure. Release blockers #17–#22, especially #20, remain OPEN; stacked research PRs DRAFT/unmerged. Existing EMA23/50 MIS intraday 15:15 square-off unchanged. Positional NRML 1W–8W is **not** force-closed at 15:15 and Phase66 adds no live order/stop/GTT writes.
