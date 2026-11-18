# Adaptive Swing v2 Phase47 — Frozen Greeks vs original option-premium gap (offline, descriptive only)

**Draft/unmerged research ONLY. Synthetic tests use fabricated L1+Greek samples. No historical licensed vendor feed, independent source delivery, original authenticated Greeks, real Upstox stop ACK, current exchange contract master, or complete walk-forward real options dataset is available in this PR.**

## Why Phase47 follows Phase46

Phase46 analyzed operator-provided original long index OPTION premium ASK/BID and a zero-recovery full-premium loss envelope after an overnight GTT/child-order failure. It deliberately **never** inferred a fill at the declared stop trigger. Phase47 adds a second, distinct question: given the **original pre-close option market BID**, *reported* original pre-close option Greeks, and later *reported* IV and underlying index, how large a first-order-and-gamma repricing sensitivity is suggested by the pre-close model, and how far does it differ from the actually **observed post-open option BID**?

This is **not** a causal explanation of option prices. The residual may include jumps, changed higher-order Greeks, quote availability, bid/ask spread, skew/smile, volatility surface movement, IV inversion, stale feeds, source fabrication and model specification errors. It is also **not** a strategy profitability or stop execution test. We do not back-calculate actual delta/theta/vega from a P&L residual, nor retune a stop, option contract, expiry or entry based on future quotes.

## Relevant current public sources

- NSE current real-time L1/L2/L3/tick data products explicitly distinguish top-of-book from deeper quotes and trades: https://www.nseindia.com/static/market-data/real-time-data-subscription . Historical vendor or exchange access and redistribution rights need independent review; an operator-entered license ID does not create permission.
- NSE EOD/historical F&O data products are distinct from original intraday Level 1 best bid/ask and Greeks; daily bhavcopy cannot reconstruct a first post-open executable BID: https://www.nseindia.com/static/market-data/eod-historical-data-subscription
- NSE current contract specs list **instrument-specific** weekly/monthly/quarterly inventory, lot/tick rules and expiries: https://www.nseindia.com/static/products-services/equity-derivatives-contract-specifications . A generic 1W or 8W research horizon is NOT an authenticated listed contract or confirmed future expiry; holiday/circular rule changes and effective dates must be separately checked.
- Data licensing and sharing controls: https://www.nseindia.com/static/market-data/nse-data-policy

No NSE PDF, original exchange signature or authenticated instrument master was consumed by Phase47. Original licensed data access and exchange issuer trust remain open release blockers.

## Implementation — no live trading integration

Source: src/server/engine/ema15m/adaptiveUpstoxPhase47FrozenGreekGapResidual.ts

Function: auditPhase47FrozenGreekGapResidual(archive, independentPins, policy).

- First re-runs **the entire Phase46 original option-gap audit** with the caller's exact archived Phase46 input, original-path pins and predeclared Phase46 risk policy. Does not accept a caller-provided PASS report.
- Requires separately pinned SHA256 of the Phase46 input, original pins, cost/gap policy, all four Phase47 Greek source paths and the Phase47 predeclared policy. This is **byte-level local JSON integrity**, not independent vendor/exchange authenticity. Fabricated data and self-created pins can still pass.
- Exactly **four 1W/2W/4W/8W** instrument-specific source pairs, original order and no reused Greek record IDs across contracts or times. All sources explicitly labelled SYNTHETIC or OPERATOR_CLAIMS_LICENSED_ORIGINAL_GREEKS, matching the Phase46 dataset label; categories may not be mixed.
- Pre-close Greeks must correspond to the **original Phase46 selected option instrument**, and the original pre-close quote observation time. Post-open underlying level and IV must correspond to the Phase46 next-open option quote. Each Greek/underlying source event may occur at most a *predeclared short alignment interval* before its option quote, and must be **available before the quoted option L1 availability**. Negative or future source timestamps, source lag, reused record IDs, invalid IV/model units or lookahead block. No replacement option chosen after seeing future bid.
- IV is expressed in PERCENTAGE POINTS, e.g. from 20% to 15% means **-5 IV points**, not -0.05; vega input is **option premium points per 1 IV percentage point**. Delta is signed premium-points per underlying-index point (CE nonnegative, PE nonpositive). Gamma in premium-points/index-point-squared. Theta in option-premium points per **CALENDAR DAY**; the Friday→Monday gap spans weekend calendar days, not only exchange trading sessions.
- Frozen pre-close vector is used for model sensitivity only. Given underlying point change dS, IV percentage-point change dIV, calendar elapsed days dt, the descriptive components are:

      delta = precloseDelta × dS
      gamma = 0.5 × precloseGamma × (dS)^2
      vega = precloseVegaPerIvPctPoint × dIV
      theta = precloseThetaPerCalendarDay × dt
      modelChange = delta + gamma + vega + theta
      observedBidChange = nextOpenOriginalOptionBid − precloseOriginalOptionBid
      unexplainedResidual = observedBidChange − modelChange

- If the approximate model indicates a negative next BID, **do not clamp this into an executable zero or invent a trade**; flag the approximation as invalid for executable-price inference. No generated theoretical quote overwrites original observed L1. Expiry proximity and residual/IV shock/theta magnitude thresholds are *predeclared alerts*, never entry/stop/expiry optimization permissions. An all-clear says only this local **model sensitivity** met the operator's self-pinned thresholds.
- Model does not verify that source Greeks use consistent valuation conventions, interest/dividend inputs, forward prices or volatility smile. Differences cannot be exclusively assigned to IV or theta from two snapshots; options are nonlinear, and the approximated Greeks themselves may be model-dependent. The pre-close theta may **not** forecast the intervening market-closed calendar period correctly.

### Allowed statuses

- INVALID_EVIDENCE (bad scope/hash/source categories/policy)
- INCOMPLETE_EVIDENCE (bad Phase46 original L1, timestamps, Greeks, expiry)
- DESCRIPTIVE_GREEK_RESIDUAL_ONLY (synthetic/operator assertions internally consistent)
- DESCRIPTIVE_GREEK_RISK_ALERT_ONLY (at least one predeclared model-risk alert)

All reports hard-code:

    executionAuthorized=false
    productionSafe=false
    profitabilityProven=false
    originalLicensedOptionL1IndependentlyVerified=false
    vendorGreekModelIndependentlyVerified=false
    sourceIvDataAuthenticityVerified=false
    chronologicalOosComparisonCompleted=false
    marketCalendarAndContractExpiryVerified=false
    empiricalIvThetaCausalityEstablished=false
    brokerNativeStopsVerified=false
    brokerAuthenticated=false
    protectedOvernight=false
    nativeOrderInstruction=null

## Operator-only private offline CLI

File: scripts/audit-adaptive-upstox-phase47-greeks.ts

Use only pre-existing process-owned 0600 JSON files under 0700 private directories in an OS-enforced no-egress environment:

    npx tsx scripts/audit-adaptive-upstox-phase47-greeks.ts \
      --approve-operator-offline-review \
      --private-original-l1-and-greek-archive /private/phase47-original-source.json \
      --independent-source-policy-hash-pins /private/phase47-pins.json \
      --predeclared-greek-risk-policy /private/phase47-policy.json

No broker API, WebSocket, public webhook, option contract order, NRML GTT modification, scheduled job, stop repair or production route is invoked. The CLI prints **only redacted horizon-level alert booleans and generic statuses**; it does not disclose original option BID/ASK, implied volatility, underlying price, contract key, UCC, vendor record IDs, bearer tokens or local file paths. CLI exit 0 only for local DESCRIPTIVE_GREEK_RESIDUAL_ONLY; NEVER trading authorization or proof of data rights.

## Synthetic CI

Tests: src/quant/tests/ema15m_adaptive_upstox_phase47_frozen_greek_gap_residual.test.ts

Reuse Phase46's four SYNTHETIC long option L1 sample paths: pre-close bid 230 → next-open bid 100. Add synthetic preclose delta/gamma/vega/theta, underlying index levels 26000→25800 and IV 20%→15%. The test does not imply a historically observed IV collapse.

Positive math: signed delta × -200, 0.5 × gamma × 200², vega × -5 IV percentage points, theta × approximately 2.74 calendar days, leaving an intentionally nonzero observed BID residual. This residual is NOT named "true liquidity impact" or empirical Greek causal attribution.

Adversarial tests: massive IV crush, weekend theta magnitude and near expiry alerts, negative model theoretical premium without invented fill, CE/PE delta sign inconsistency, negative gamma/vega, invalid/NaN IV, delayed or future source Greek availability, duplicated cross-contract source IDs, recycled pre/post IDs, wrongly claimed licensed source mixed with synthetic evidence, source-hash changes, swapped/missing 8W horizon, original Phase46 L1 lookahead even after internally re-pinning data, zero post-open BID without inferred fill and a wholly fake operator-claimed licensed dataset that **cannot** change source-authenticated or broker-stop flags.

## Exit criteria / next priority

Real, appropriately licensed **original timestamped option L1 plus unmodified original source Greek methodology** and point-in-time contract masters/expiry amendments are required to use the existing Phase8/13/20 chronological OOS machinery for genuine regime-filter and ranker comparisons. A four-path hand-picked Greek sample is NOT a backtest and cannot statistically compare 1W/2W/4W/8W. Source delivery, usage license, original strategy-availability clocks and official effective-dated exchange calendars must be independently reviewed. True exchange-native broker stop ACK/cancel/replace and gap-survival evidence remain prerequisites for live trading.

Keep release issues #17–#22, especially #20, OPEN. All stacked PRs Draft/unmerged. Existing EMA23/50 MIS intraday **15:15 square-off untouched**. NRML 1W/2W/4W/8W positional trades **have NO forced 15:15 exit** and no live NRML orders, GTT writes or production activation. Green CI only validates synthetic software rules, not a profitable or production-safe trading strategy.
