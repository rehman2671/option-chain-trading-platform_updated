# Phase80 — owner-private offline original option L1 intake runner

**Draft, research-only, no execution, no authenticated market data delivered.** Stacked on Phase79 Draft PR #84. Phase80 makes the Phase79 quote-path reviewer usable against **privately supplied original native option BID/ASK/depth files**, without fabricating market data or publishing licenced/sensitive records in GitHub.

## Why this milestone matters

The earlier Phase79 module was a pure function; there was no strictly private audited command for passing owner-controlled files. A typical vendor archive arrives as a CSV and separate manifests, not as an in-memory TypeScript value. This milestone adds a conservative real-file bridge rather than another invented historical backtest.

`src/server/engine/ema15m/adaptivePhase80PrivateL1Intake.ts` accepts and validates separately pinned Phase79 CSV/catalog/sessions/predeclared policy and an owner-supplied source declaration. `scripts/audit-adaptive-phase80-private-l1.ts` handles local private file access and outputs only aggregate reason codes and horizon×side×regime summary counts. It never prints vendor quotes, original per-contract identifiers, individual decision dates, client tokens, raw SHA pins or full file paths.

**Source declaration JSON (fixed version):**

```json
{
  "schemaVersion": "PHASE80_PRIVATE_ORIGINAL_VENDOR_SOURCE_DECLARATION_V1",
  "source": "OWNER_SUPPLIED_VENDOR_AND_LEGAL_RIGHTS_UNVERIFIED",
  "datasetKind": "UNVERIFIED_EXTERNAL_SOURCE_CANDIDATE",
  "claimedSourceCategory": "NATIVE_OPTION_BEST_BID_ASK_DEPTH",
  "claimedAcquisitionMode": "RETROSPECTIVE_ARCHIVE",
  "claimedOfflineResearchRight": "OWNER_ASSERTS_LOCAL_RESEARCH_ALLOWED",
  "claimedArchiveDeliveredAt": "2026-11-21T10:00:00+05:30",
  "originalClientReceiptClockIndependentlyVerified": false,
  "genuineVendorAndResearchGrantIndependentlyVerified": false,
  "officialExchangeCalendarIndependentlyVerified": false,
  "brokerStopOrFillIndependentlyVerified": false,
  "permittedToSendLiveTradingOrders": false
}
```

This is an **illustrative structure, not a real vendor licence or capture receipt**. A retrospectively acquired file cannot reconstruct whether the algorithm actually received a quote before an old decision. The only supported positive scope marker `OWNER_ASSERTS_LOCAL_RESEARCH_ALLOWED` remains an operator claim; it is **not legal authorization**. Missing or ungranted rights and trade-only/EOD/reconstructed quotes block auditing. Synthetic data must be marked `SYNTHETIC_FIXTURE`, never mislabeled as a real vendor archive.

**Independent pins JSON (fixed version):**

```json
{
  "schemaVersion": "PHASE80_SEPARATE_OFFLINE_SOURCE_AND_OOS_PINS_V1",
  "expectedSourceDeclarationSha256": "<64 lowercase hex chars>",
  "phase79": {
    "schemaVersion": "PHASE79_SEPARATELY_FROZEN_ORIGINAL_UNIVERSE_PINS_V1",
    "expectedNativeCsvSha256": "<64 lowercase hex chars>",
    "expectedOriginalCatalogSha256": "<64 lowercase hex chars>",
    "expectedDeclaredSessionsSha256": "<64 lowercase hex chars>",
    "expectedPolicySha256": "<64 lowercase hex chars>",
    "expectedOriginalDecisionDates": 0,
    "expectedOriginalNoEntryDecisions": 0,
    "expectedOriginallyListedPairs": 0,
    "expectedOriginallyNoEntryPairs": 0
  }
}
```

Count `0` values above are placeholders to be replaced by real preregistered values; Phase79 rejects invalid or inconsistent positive counts. SHA-256 of JSON objects uses `JSON.stringify(parsedObject)` (order-sensitive); CSV pin uses raw bytes. Pins **must be recorded separately before inspecting outcome returns**, and their existence is not independent vendor/issuer authentication.

The six source files must be distinct regular files with mode `0600` in owner-only `0700` directories **outside the checked-out Git repository**. Symbolic links, hard-link aliases, group/world access and missing/modified/oversized files fail closed. Operator owns ensuring nested directory security, no backups syncing private bytes, OS-level network egress disabled, and an appropriate lawful licence. No raw source data or licence secret should ever be attached to PRs, GitHub Actions, logs, issue comments, or project chat.

```bash
# Execute only in an OS/container sandbox with external network egress disabled.
# Use six ABSOLUTE private paths; do not place sensitive bytes in git worktree.
npx tsx scripts/audit-adaptive-phase80-private-l1.ts \
  --approve-isolated-private-offline-review \
  --original-native-option-l1-csv /private/owner/original-l1.csv \
  --original-frozen-listed-catalog /private/owner/original-catalog.json \
  --declared-session-calendar /private/owner/sessions.json \
  --preregistered-quote-policy /private/owner/preregistered-policy.json \
  --unverified-source-declaration /private/owner/source-declaration.json \
  --independent-original-source-pins /private/owner/independent-pins.json
```

The only successful exit status is a `DESCRIPTIVE_...` offline report, **not eligibility to trade**. For retrospective archives the status is always `DESCRIPTIVE_RETROSPECTIVE_ONLY_NO_ORIGINAL_CLIENT_CAUSAL_PROOF` even when claimed as-of quote coverage is structurally complete; this is not evidence the original algorithm saw the quote. Upstream Phase79 coverage failures, missing original NO_ENTRY, invalid clocks/quotes, zero depth, unavailable expiry sessions or tampered pinned data remain explicit and cannot become fills or made-up PnL.

## Tests and remaining release blockers

`src/quant/tests/ema15m_adaptive_phase80_private_l1_intake.test.ts` covers private file reads, POSIX file permissions, symlinks/hard links, spoofed verified markers, trade-only/EOD data, missing licence rights, cached retrospective data, unsupported free-form regime labels, missing original listed options/NO_ENTRY, altered CSV/catalog/sessions and no-overwrite/no-release invariants. Dedicated CI includes Phase79 and Phase80 tests; focused Phase50–80, EMA15M safety, production build and full regression are separate workflows.

Even complete privately pinned vendor input does not prove issuer identity, original contemporaneous client receipt, original untouched OOS profitability, official exchange contract/expiry/session master, actual NRML option fills or native stop/GTT child exchange ACK. Independently validate lawful vendor research rights, production data quality, market-regime and 1W–8W matched OOS, options spread/depth/IV/theta, overnight gap/censoring, broker-sanctioned stop nonfill and operational risk controls before any separate human-approved release proposal. Issues #17–#22, especially #20, remain open. Existing MIS 15:15 logic is unchanged; forced NRML 15:15 exit and live order control remain disabled.
