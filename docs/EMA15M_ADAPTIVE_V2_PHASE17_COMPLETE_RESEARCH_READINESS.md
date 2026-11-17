# Adaptive Swing v2 Phase 17 — full fail-closed source-to-risk review package

**Phase 21 update (17 November 2026):** The offline pipeline now also requires a **tenth original SHA256-pinned historical data-source acquisition ledger**, `originalSourceIntake`, bound to the original vendor archive, original JSON bundle, separate exchange calendar/document and signed protocol. It exposes EOD/trade-only/subscription receipt and trading-day L1 source gaps instead of pretending the data was executable. See `docs/EMA15M_ADAPTIVE_V2_PHASE21_ORIGINAL_L1_SOURCE_INTAKE.md` and the standalone `scripts/audit-adaptive-source-intake.ts`. Exact-source consistency still cannot prove authentic licensed market data.

**Phase 20 update (17 November 2026):** The all-in-one offline evidence gate now requires a **ninth SHA256-pinned chronological OOS fold-risk policy**, `chronologicalOosRobustness`. It checks whether reserved option holdings overlap subsequent fold decisions, whether one lucky fold drives apparent profits, and the exploratory (UNVERIFIED independence assumptions) 36-view sign-test multiplicity. All statements of statistical significance and profitability remain false; see `docs/EMA15M_ADAPTIVE_V2_PHASE20_CHRONOLOGICAL_OOS_ROBUSTNESS.md`.

**Phase 19 update (17 November 2026):** The full offline preflight now additionally locks **the eighth research policy**, `premiumPathReversal`, which tests option BID premium +50/+70 observed run-ups reversing before a predeclared +100 candidate threshold. It distinguishes low-depth raw quote spikes from full-lot displayed bid opportunities and never counts unknown exit bids as observed gains. See `docs/EMA15M_ADAPTIVE_V2_PHASE19_OBSERVED_PREMIUM_PATH_REVERSALS.md`.

**Phase 18 update (17 November 2026):** The former six-policy Phase 17 preflight is extended to require a **seventh exact SHA256-pinned artifact**, the original effective-date and expiry-class instrument session ledger. See `docs/EMA15M_ADAPTIVE_V2_PHASE18_VERSIONED_INSTRUMENT_SESSION_AUDIT.md`. This schedule must agree with the separately supplied signed Phase 15 calendar; broad day windows no longer by themselves establish that an option quote is valid for its expiry class.

**STRICTLY OFFLINE / DRAFT / UNMERGED. No real/paper NRML broker orders or changes to the existing EMA23/50 MIS engine, 15:15 MIS square-off or broker-native protective exits. No automatic strategy deployment or endorsement.**

## What was still missing after Phase 16?

Phase 5–16 implemented many separate, useful research checks. However there was **no mandatory all-or-nothing workflow** ensuring the reviewer executed ALL of them against **the same raw bytes, dataset ID, original source clock, registered protocol and expiry/market-session coverage**, with unchanged OOS selection, costs, exit censoring and independent exposure cooldowns. Running only the easy or profitable subset could create false confidence.

Phase 17 adds:

1. A **single raw-byte-only entrypoint** `runAdaptiveFullResearchReadiness(...)` that recomputes all lower-level reports itself. It does **not** accept externally claimed aggregate passing reports in its production research path.
2. Ten **pinned predeclared policy/source SHA256 checks** and a separately pinned policy-lock manifest, bound to the exact original vendor bundle SHA256, self-declared protocol ID, dataset ID and prespecified date. This detects edits/re-optimization AFTER the trusted pin is established; it does **not prove** the third-party preregistration date or the person who pinned it.
3. Mandatory Phase 6 source-artifact checksum, Phase 15 full-day/expiry calendar cross-source audit, and Phase 16 dual reviewer detached Ed25519 witness tied to the **same exact source bytes**.
4. Mandatory Phase 5 walk-forward, Phase 8 entry-first option exit, Phase 10 quote/spread/depth/overnight-gap quality, Phase 11 trend + nontrend regime review, Phase 12 hysteresis advisories, Phase 13 independently-enrolled matched cohorts and Phase 14 option-premium entry/exit cost-depth stress.
5. Strict OOS fold, exchange trading-day, dataset ID, synthetic provenance, source SHA, source-window, arm and horizon **denominator reconciliation**: every fold × EMA_BASELINE/REGIME_FILTER/REGIME_AND_RANK × 1W/2W/4W/8W must have one complete original, quality, regime, matched and stress set. All four Phase 14 predeclared scenarios must be present for each cell.
6. Per-arm × 1W/2W/4W/8W **mechanical risk dossier**, separating original and hysteresis entries, skipped original profitable/losing outcomes, overnight gap triggers, thin-bid depth blocks, censored exits, original complete-cohort premium P&L and combined-stress complete-cohort premium P&L. **If even one required fold is unpriced or inconsistent, aggregate P&L is `null`, never survivor-only ROI.**
7. All broker-safe/market-source authentication/trading permission fields **hard-coded false**, including `executionAuthorized`, `productionSafe`, `nrmlLiveEnabled`, `brokerNativeProtectionProven`, `exchangeIssuerAuthenticated`, `profitabilityProven` and `statisticalSignificanceProven`. Every `liveHorizonRecommendation` remains `null` (including on a green internal consistency result).

### Status meanings

- `REJECTED`: invalid/mismatched signed source binding, pinned registry/policy manifest, dataset/issuer/source digest, protocol ID, impossible OOS universe or malformed inputs.
- `BLOCKED_INCOMPLETE_EVIDENCE`: any missing source quote, unobserved/censored positional bid exit, omitted trading session, incomplete fold × arm × expiry × stress matrix, incomplete source audit, underpowered comparisons, failed stress quality or synthetic data.
- `INTERNALLY_CONSISTENT_EXTERNAL_REVIEW_REQUIRED`: the supplied historical files, independent reviewer-key signatures, every predeclared policy and all mandatory evidence matrices are internally consistent enough to **request a fresh external audit**. This is **NOT** licensed-feed validation, confirmed stock exchange provenance, statistical profitability, real broker operational safety, NRML production approval or trading guidance.

## Ten policy/source-file roles and externally pinned lock

The exact original JSON files supplied with the offline command are bound as raw bytes (not merely equivalent parsed JSON):

| Locked field | Predeclared research policy |
|---|---|
| `entryFirstExit` | Phase 8 original point-in-time option premium stop/trail/hold rule |
| `marketDataQuality` | Phase 10 L1 quote coverage, spread, event latency and displayed depth |
| `researchEvidenceGate` | Phase 11 OOS fold/regime quality, paired sample and drawdown thresholds |
| `regimeHysteresis` | Phase 12 distinct 1W/2W/4W/8W directional confirmations/dwell/freeze |
| `matchedOos` | Phase 13 original-vs-filtered paired sample and censor limits |
| `premiumCostDepthStress` | Phase 14 per-horizon slippage, adverse spread, gap and depth sensitivities |
| `instrumentSessionSchedule` | Phase 18 effective-date underlying-index versus expiring/nonexpiring option session windows |
| `premiumPathReversal` | Phase 19 predeclared +50/+70/+100 BID-premium runup/giveback and displayed-depth sensitivity |
| `chronologicalOosRobustness` | Phase 20 source-replayed loss-fold concentration, positional holding separation, leave-best-fold-out and 36-view exploratory sign sensitivity |
| `originalSourceIntake` | Phase 21 raw original vendor archive and day-by-day historical options L1 procurement/entitlement/original receipt provenance declarations (NOT issuer authenticated) |

The separate `ADAPTIVE_PRESPECIFIED_RESEARCH_POLICY_LOCK_V1` JSON contains exactly these ten SHA256 hashes, plus `studyProtocolId`, `datasetId`, `prespecifiedAt` and `originalBundleSha256`. The exact bytes of this lock manifest must match **`--pinned-policy-lock-sha256`**, obtained through an independently approved, out-of-band channel. A checksum calculated from a tampered file **and trusted as its own reference is not proof** of immutable preregistration. The lock protocol must match the Phase 11 evidence policy AND the Phase 16 signed envelope. There is no claim that a self-supplied timestamp is externally registered.

### Single command: every input mandatory

```bash
npx tsx scripts/audit-adaptive-full-readiness.ts \
  /secure/original-verified-L1-bundle.json \
  --source-artifact /secure/retained-original-licensed-vendor-event-feed.bin \
  --exchange-calendar-evidence /secure/second-source-complete-trading-calendar.json \
  --calendar-source-document /secure/original-official-exchange-record.pdf \
  --signed-evidence-envelope /secure/phase16-dual-detached-reviewers.json \
  --reviewer-trust-registry /secure/approved-out-of-band-reviewer-keys.json \
  --pinned-reviewer-trust-sha256 <independently-approved-64-hex-registry-hash> \
  --policy-lock-manifest /secure/immutable-predeclared-policy-lock.json \
  --pinned-policy-lock-sha256 <independently-approved-64-hex-policy-lock-hash> \
  --entry-first-policy /secure/phase8-prespecified-exit-policy.json \
  --market-data-policy /secure/phase10-prespecified-quality-policy.json \
  --evidence-gate-policy /secure/phase11-prespecified-evidence-policy.json \
  --hysteresis-policy /secure/phase12-prespecified-hysteresis-policy.json \
  --matched-hysteresis-policy /secure/phase13-prespecified-paired-policy.json \
  --premium-stress-policy /secure/phase14-prespecified-cost-depth-policy.json \\
  --instrument-session-evidence /secure/phase18-versioned-instrument-windows.json \\
  --premium-path-policy /secure/phase19-prespecified-premium-bid-path.json \\
  --oos-robustness-policy /secure/phase20-prespecified-fold-risk-and-multiplicity.json \\
  --original-source-intake /secure/phase21-original-source-delivery-ledger.json
```

The executable validates that all source/evidence/policy files are **different real paths** (including symlink aliases); pinned values must be lowercase 64-character SHA256 hex. It rejects missing flags or evidence. On a blocked/rejected package it exits nonzero; if internally consistent it returns zero **only for successful offline evidence package generation**, not broker execution or production permission. Output is a JSON aggregate: no instrument-level licensed option L1 quotes, source file bytes, signatures, reviewer PEM keys or private keys are printed.

The audit's SHA256 of aggregate fold/horizon diagnostics is **not a signed attestation or exchange certification**.

## Real official-source intake — DO NOT fabricate a calendar

Official primary-source starting points identified for independently acquiring and reviewing original records (online material alone is NOT a vendor-attested signed archive):

- NSE trading holidays and market session info: https://www.nseindia.in/resources/exchange-communication-holidays . **Select the correct segment (F&O), date, and each circular revision; a single static weekend list cannot cover exchange emergencies or special Muhurat sessions.**
- NSE historical order/trade data product: https://www.nseindia.com/static/market-data/eod-historical-data-subscription . NSE describes historical F&O order/trade data as a paid product; an end-of-day bhavcopy or historical trade print alone **does NOT supply true contemporaneous best bid/ask/availableAt**.
- NSE market data feed products: https://www.nseindia.com/static/market-data/real-time-data-subscription . NSE describes Level 1 as best bid and ask and distinguishes full order book/tick data. A historical replay must confirm which historical format was actually licensed and whether depth, original observation **event AND strategy availability clocks**, cancellations and all exchange sessions are recorded.
- BSE official market notices/holiday and expiry circulars for SENSEX must be collected **separately** directly from the BSE official notices system. NSE circulars cannot establish BSE derivatives sessions.
- For NIFTY/BANKNIFTY/SENSEX, historical contract listings, permitted expiry series, contract identifiers and lot sizes must reflect **the then-effective** exchange contract specifications and each published amendment, not a hard-coded 1W/2W/4W/8W fictional expiry day.

**Public reference webpages and product descriptions are not equivalent to a supplied licensed historical option L1 archive.** Acquisition requires a valid entitlement, written permission to research/store/replay, accurate source identifiers, original event-time & strategy-availability evidence, instrument-level bid/ask + quantity and a separately retained original file plus SHA256. Obtain original complete calendar and market/special-session changes from the exchange records, independently authenticate issuer and original files, and review reviewer key custody/signature time out of band. The software cannot purchase or independently certify that data without actual licensing and user-supplied records.

## What cannot be "completed" with more code

**Data/origin:** Licensed historical option quotes, original feed clocks and independent exchange-calendar source authentication are *external evidence*, not algorithmic code. Phase 16 signatures over a locally fabricated archive do not turn it into official market data. A PDF or current online holiday list cannot prove every past 15m contract quote was actually available to a hypothetical trading decision.

**Statistical robustness:** A descriptive net profit is not sufficient. Independent reviewers must verify policy preregistration, untouched chronological walk-forward across trend/chop/volatile regimes, sample sizes, lookahead exclusion, censored trades, tail losses, premiums that rose +50–70 and reversed short of +100, and actual spread/IV/theta/gamma/overnight risks. Missing option prices remain UNKNOWN, never an invented 100-point target fill.

**Broker operational safety:** Phase 9 simulated NRML journal validates a *mock*, not actual Upstox/broker source of record. Real account-scoped net positions, order IDs, native protective stop/GTT acknowledgments, partial fills, reject/unknown-ACK/restart reconciliation, simultaneous SELL duplication, overnight gap behavior, margin/exchange product constraints and operator kill-switch require separate **real broker-native API evidence and approvals** before any live deployment. **Do not reuse intraday MIS automatic 15:15 square-off for 1W–8W positional contracts.**

**PR release:** Phase 1–17 form stacked Draft PRs. Do not merge to `codex`/`main` or modify the existing live MIS engine until each diff, source evidence, unit/integration tests and release checklist has independent human signoff. Actual market data or broker account credentials must not be committed to GitHub.

## Files

- `src/server/engine/ema15m/adaptiveFullResearchReadiness.ts` — strict source-to-risk runner, aggregate-phase reviewer, ten exact policy/source hashes, per-horizon risk dossier.
- `scripts/audit-adaptive-full-readiness.ts` — a separate, offline-only, all-inputs-required command.
- `src/quant/tests/ema15m_adaptive_full_research_readiness.test.ts` — adversarial state manipulation: missing fold/scenario, duplicate cells, changed source digest, tampered policy lock, cross-phase dataset mismatch, full-cohort censored exit, mismatched exchange dates, no live eligibility flags.
- `docs/EMA15M_ADAPTIVE_V2_PHASE17_COMPLETE_RESEARCH_READINESS.md` — this source procurement and release-boundary guide.

**The only automatically produced result is a research audit. It cannot recommend live horizon, declare a profitable strategy, perform broker orders, or activate real NRML execution.**
